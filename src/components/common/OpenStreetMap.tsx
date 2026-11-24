import React, { useRef, useMemo, useEffect, useCallback } from "react";
import { View, StyleSheet, Platform, StyleProp, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

export interface MapMarkerItem {
  id: string;
  title: string;
  subtitle?: string;
  latitude: number;
  longitude: number;
  price?: string | number;
  badge?: string;
  icon?: string; // emoji or icon class
  color?: string;
  category?: "hotel" | "flight" | "transit" | "emergency" | "attraction" | "admin";
}

export interface MapRouteItem {
  id: string;
  points: [number, number][]; // [lat, lng][]
  color?: string;
  weight?: number;
  dashed?: boolean;
  name?: string;
}

export interface MapHeatPoint {
  latitude: number;
  longitude: number;
  radius?: number;
  intensity?: number;
  color?: string;
  label?: string;
}

export interface OpenStreetMapProps {
  markers?: MapMarkerItem[];
  routes?: MapRouteItem[];
  heatPoints?: MapHeatPoint[];
  initialRegion?: {
    latitude: number;
    longitude: number;
    zoom?: number;
  };
  userLocation?: {
    latitude: number;
    longitude: number;
    title?: string;
  } | null;
  selectedMarkerId?: string | null;
  onSelectMarker?: (markerId: string) => void;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  theme?: "light" | "dark";
  tileLayer?: "osm" | "voyager" | "dark" | "satellite";
}

export const OpenStreetMap: React.FC<OpenStreetMapProps> = ({
  markers = [],
  routes = [],
  heatPoints = [],
  initialRegion = { latitude: 23.685, longitude: 90.3563, zoom: 7 }, // Bangladesh center default
  userLocation = null,
  selectedMarkerId = null,
  onSelectMarker,
  style,
  interactive = true,
  theme = "light",
  tileLayer = "voyager",
}) => {
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<any>(null);

  // Pick standard OpenStreetMap tile server URL
  const tileUrl = useMemo(() => {
    return "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  }, []);

  // Construct Leaflet HTML with responsive styling, custom pins, clusters, and interactive animations
  const htmlContent = useMemo(() => {
    const safeMarkers = markers.map((m) => ({
      id: m.id,
      title: m.title || "",
      subtitle: m.subtitle || "",
      lat: Number(m.latitude) || 23.685,
      lng: Number(m.longitude) || 90.3563,
      price: m.price ? String(m.price) : "",
      badge: m.badge || "",
      icon: m.icon || "",
      color: m.color || (m.category === "emergency" ? "#EF4444" : "#0055F2"),
      category: m.category || "hotel",
    }));

    const safeRoutes = routes.map((r) => ({
      id: r.id,
      points: r.points,
      color: r.color || "#0055F2",
      weight: r.weight || 3,
      dashed: !!r.dashed,
      name: r.name || "",
    }));

    const safeHeatPoints = heatPoints.map((h) => ({
      lat: Number(h.latitude) || 23.685,
      lng: Number(h.longitude) || 90.3563,
      radius: h.radius || 25,
      color: h.color || "#EF4444",
      intensity: h.intensity || 0.6,
      label: h.label || "",
    }));

    const safeUserLoc = userLocation
      ? {
          lat: Number(userLocation.latitude),
          lng: Number(userLocation.longitude),
          title: userLocation.title || "My Location",
        }
      : null;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body, #map { width: 100%; height: 100%; overflow: hidden; background: ${theme === "dark" ? "#0F172A" : "#F1F5F9"}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    
    ${theme === "dark" || tileLayer === "dark" ? `
    .leaflet-tile-pane {
      filter: invert(100%) hue-rotate(180deg) brightness(90%) contrast(90%);
    }
    ` : ""}
    
    /* Price / Badge Marker */
    .custom-marker {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 5px 9px;
      background: #0055F2;
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 600;
      border-radius: 16px;
      white-space: nowrap;
      box-shadow: 0 4px 10px rgba(0, 85, 242, 0.35);
      border: 2px solid #FFFFFF;
      cursor: pointer;
      transition: transform 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .custom-marker:hover, .custom-marker.active {
      transform: scale(1.15);
      background: #0F172A;
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.5);
      z-index: 1000 !important;
    }
    .custom-marker.emergency {
      background: #DC2626;
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.45);
      animation: pulse-red 1.6s infinite;
    }
    .custom-marker.transit {
      background: #059669;
      box-shadow: 0 4px 12px rgba(5, 150, 105, 0.4);
    }
    .custom-marker.attraction {
      background: #7C3AED;
      box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
    }
    
    /* Pin Pointer Tail */
    .custom-marker::after {
      content: '';
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      border-width: 6px 5px 0 5px;
      border-style: solid;
      border-color: #0055F2 transparent transparent transparent;
    }
    .custom-marker.emergency::after { border-color: #DC2626 transparent transparent transparent; }
    .custom-marker.transit::after { border-color: #059669 transparent transparent transparent; }
    .custom-marker.attraction::after { border-color: #7C3AED transparent transparent transparent; }
    .custom-marker.active::after { border-color: #0F172A transparent transparent transparent; }

    /* User GPS Location Pulse */
    .user-gps-pulse {
      position: relative;
      width: 20px;
      height: 20px;
      background: #2563EB;
      border: 3px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(37, 99, 235, 0.6);
    }
    .user-gps-pulse::before {
      content: '';
      position: absolute;
      top: -8px;
      left: -8px;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: rgba(37, 99, 235, 0.25);
      animation: ripple 2s infinite ease-out;
    }

    @keyframes ripple {
      0% { transform: scale(0.6); opacity: 1; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    @keyframes pulse-red {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.08); }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const markers = ${JSON.stringify(safeMarkers)};
    const routes = ${JSON.stringify(safeRoutes)};
    const heatPoints = ${JSON.stringify(safeHeatPoints)};
    const userLoc = ${JSON.stringify(safeUserLoc)};
    const selectedId = ${JSON.stringify(selectedMarkerId)};
    const initialCenter = [${initialRegion.latitude}, ${initialRegion.longitude}];
    const initialZoom = ${initialRegion.zoom || 8};
    const isInteractive = ${interactive ? "true" : "false"};

    const map = L.map('map', {
      zoomControl: isInteractive,
      attributionControl: false,
      dragging: isInteractive,
      touchZoom: isInteractive,
      scrollWheelZoom: isInteractive,
      doubleClickZoom: isInteractive,
    }).setView(initialCenter, initialZoom);

    window.leafletMap = map;

    // OpenStreetMap / CartoDB tiles
    L.tileLayer('${tileUrl}', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    function notifyParent(data) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      } else if (window.parent && window.parent.postMessage) {
        window.parent.postMessage(JSON.stringify(data), '*');
      }
    }

    // 1. Add Heat Circles / Density Areas
    heatPoints.forEach(function(hp) {
      const circle = L.circle([hp.lat, hp.lng], {
        color: hp.color,
        fillColor: hp.color,
        fillOpacity: hp.intensity,
        radius: hp.radius * 1000,
        weight: 1.5,
      }).addTo(map);
      if (hp.label) {
        circle.bindTooltip(hp.label, { permanent: false, direction: 'center', className: 'heat-label' });
      }
    });

    // 2. Add Routes / Corridors
    routes.forEach(function(r) {
      if (r.points && r.points.length > 1) {
        const polyline = L.polyline(r.points, {
          color: r.color,
          weight: r.weight,
          dashArray: r.dashed ? '8, 8' : null,
          opacity: 0.85,
        }).addTo(map);
        if (r.name) {
          polyline.bindTooltip(r.name, { sticky: true });
        }
      }
    });

    // 3. Add User GPS Location
    if (userLoc) {
      const userIcon = L.divIcon({
        className: 'user-gps-container',
        html: '<div class="user-gps-pulse" title="' + userLoc.title + '"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      L.marker([userLoc.lat, userLoc.lng], { icon: userIcon }).addTo(map)
        .bindTooltip(userLoc.title, { direction: 'top', offset: [0, -10] });
    }

    // 4. Add Markers with Price Tags or Badges
    const allBounds = [];
    if (userLoc) allBounds.push([userLoc.lat, userLoc.lng]);

    // Spiderfy offset for overlapping coordinates
    const posCounts = {};
    const processedMarkers = markers.map(function(m) {
      const key = m.lat.toFixed(3) + '_' + m.lng.toFixed(3);
      const count = posCounts[key] || 0;
      posCounts[key] = count + 1;
      let finalLat = m.lat;
      let finalLng = m.lng;
      if (count > 0) {
        const angle = (count * 2 * Math.PI) / 6;
        const offset = 0.0035 * Math.ceil(count / 6);
        finalLat += Math.sin(angle) * offset;
        finalLng += Math.cos(angle) * offset;
      }
      return Object.assign({}, m, { lat: finalLat, lng: finalLng });
    });

    processedMarkers.forEach(function(m) {
      allBounds.push([m.lat, m.lng]);
      const isActive = m.id === selectedId;
      const displayLabel = m.price ? m.price : (m.badge || m.title);
      const iconSpan = m.icon ? '<span style="margin-right:2px">' + m.icon + '</span>' : '';
      
      const pinClass = 'custom-marker ' + (m.category || '') + (isActive ? ' active' : '');
      const iconHtml = '<div id="pin-' + m.id + '" class="' + pinClass + '">' + iconSpan + displayLabel + '</div>';

      const customIcon = L.divIcon({
        className: 'pin-anchor',
        html: iconHtml,
        iconSize: [80, 32],
        iconAnchor: [40, 34],
      });

      const marker = L.marker([m.lat, m.lng], { icon: customIcon }).addTo(map);

      marker.on('click', function() {
        document.querySelectorAll('.custom-marker').forEach(function(el) {
          el.classList.remove('active');
        });
        const pinEl = document.getElementById('pin-' + m.id);
        if (pinEl) pinEl.classList.add('active');

        notifyParent({ type: 'MARKER_CLICK', id: m.id, marker: m });
      });
    });

    // Fit map bounds if markers present
    if (allBounds.length > 1) {
      map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 14 });
    } else if (allBounds.length === 1) {
      map.setView(allBounds[0], 12);
    }
  </script>
</body>
</html>`;
  }, [markers, routes, heatPoints, userLocation, selectedMarkerId, initialRegion, interactive, theme, tileUrl]);

  // Handle messages from the Web or Native WebView
  const handleNativeMessage = useCallback(
    (event: any) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data);
        if (payload.type === "MARKER_CLICK" && payload.id && onSelectMarker) {
          onSelectMarker(payload.id);
        }
      } catch (e) {
        // ignore parse errors
      }
    },
    [onSelectMarker]
  );

  // On Web, attach window message listener
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const handleWebMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data && data.type === "MARKER_CLICK" && data.id && onSelectMarker) {
          onSelectMarker(data.id);
        }
      } catch {
        // Not a JSON payload or unrelated message
      }
    };

    window.addEventListener("message", handleWebMessage);
    return () => window.removeEventListener("message", handleWebMessage);
  }, [onSelectMarker]);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, style]}>
        <iframe
          ref={iframeRef}
          srcDoc={htmlContent}
          title="OpenStreetMap"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            borderRadius: 16,
            overflow: "hidden",
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: htmlContent }}
        onMessage={handleNativeMessage}
        style={styles.webView}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: "#E2E8F0",
  },
  webView: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
