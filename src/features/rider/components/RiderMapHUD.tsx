import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  MapHeatPoint,
  MapMarkerItem,
  MapRouteItem,
  OpenStreetMap,
} from "../../../components/common/OpenStreetMap";
import { TurnManeuver } from "../constants";
import { DemandHotspotZone, OfflineMapPackStatus, VehicleMode } from "../types";
import { riderService } from "../../../services/riderService";
import { RIDER_COLORS } from "./RiderDesignSystem";

export interface RiderMapHUDProps {
  riderLocation: { latitude: number; longitude: number; speedKmh?: number };
  pickup?: { lat: number; lng: number; label: string } | null;
  dropoff?: { lat: number; lng: number; label: string } | null;
  vehicleMode: VehicleMode;
  hotspots?: DemandHotspotZone[];
  offlinePacks?: OfflineMapPackStatus[];
  etaMinutes?: number;
  distanceKm?: number;
  height?: number;
  onSelectHotspot?: (zone: DemandHotspotZone) => void;
}

export const RiderMapHUD: React.FC<RiderMapHUDProps> = ({
  riderLocation,
  pickup,
  dropoff,
  vehicleMode,
  hotspots = [],
  offlinePacks = [],
  etaMinutes = 8,
  distanceKm = 0,
  height = 280,
  onSelectHotspot,
}) => {
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);
  const [maneuvers, setManeuvers] = useState<TurnManeuver[]>([]);
  const [routeMeta, setRouteMeta] = useState<{ distKm: number; durMin: number }>({
    distKm: distanceKm,
    durMin: etaMinutes,
  });

  useEffect(() => {
    let active = true;
    const origin = pickup
      ? { lat: pickup.lat, lng: pickup.lng, label: pickup.label }
      : { lat: riderLocation.latitude, lng: riderLocation.longitude, label: "Current Position" };
    const dest = dropoff
      ? { lat: dropoff.lat, lng: dropoff.lng, label: dropoff.label }
      : null;

    if (!dest) {
      setRoutePoints([]);
      setManeuvers([]);
      return;
    }

    riderService
      .getDirectionsAndRoute(origin, dest, vehicleMode)
      .then((res) => {
        if (!active) return;
        setRoutePoints(res.polylinePoints);
        setManeuvers(res.maneuvers);
        setRouteMeta({ distKm: res.distanceKm, durMin: res.durationMin });
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [
    pickup?.lat,
    pickup?.lng,
    dropoff?.lat,
    dropoff?.lng,
    riderLocation.latitude,
    riderLocation.longitude,
    vehicleMode,
  ]);

  const markers: MapMarkerItem[] = [];
  if (pickup) {
    markers.push({
      id: "pickup",
      title: "Pickup",
      subtitle: pickup.label,
      latitude: pickup.lat,
      longitude: pickup.lng,
      color: "#10B981",
      category: "transit",
    });
  }
  if (dropoff) {
    markers.push({
      id: "dropoff",
      title: "Dropoff",
      subtitle: dropoff.label,
      latitude: dropoff.lat,
      longitude: dropoff.lng,
      color: "#F97316",
      category: "emergency",
    });
  }
  for (const zone of hotspots) {
    markers.push({
      id: zone.id,
      title: zone.name,
      subtitle: `${zone.surgeMultiplier.toFixed(2)}x · ${zone.activeRequests} reqs`,
      latitude: zone.latitude,
      longitude: zone.longitude,
      price: `${zone.surgeMultiplier.toFixed(2)}x`,
      color: zone.demandScore >= 85 ? "#EF4444" : "#F59E0B",
      category: "admin",
    });
  }

  const routes: MapRouteItem[] =
    routePoints.length >= 2
      ? [
          {
            id: "active-rider-route",
            points: routePoints,
            color: "#10B981",
            weight: 5,
            name: "Turn-by-Turn Route",
          },
        ]
      : [];

  const heatPoints: MapHeatPoint[] = hotspots.map((z) => ({
    latitude: z.latitude,
    longitude: z.longitude,
    radius: 30,
    intensity: z.demandScore / 100,
    color: z.demandScore >= 85 ? "#EF4444" : "#F59E0B",
    label: z.name,
  }));

  const cachedPacksCount = offlinePacks.filter((p) => p.status === "cached").length;
  const leadManeuver = maneuvers[0];

  return (
    <View style={styles.wrapper}>
      {/* Turn-by-Turn Navigation Banner */}
      <View style={styles.hudBanner}>
        <View style={styles.turnIconBox}>
          <Ionicons
            name={leadManeuver ? leadManeuver.icon : "navigate"}
            size={20}
            color="#0F172A"
          />
        </View>
        <View style={styles.hudTextCol}>
          <Text style={styles.hudPrimary} numberOfLines={1}>
            {leadManeuver
              ? leadManeuver.instruction
              : "Dhaka Mobility Map Ready · OSM + Spatial Engine"}
          </Text>
          <Text style={styles.hudSub}>
            {routeMeta.distKm > 0
              ? `${routeMeta.distKm} km · ETA ${routeMeta.durMin} min`
              : `${riderLocation.latitude.toFixed(4)}, ${riderLocation.longitude.toFixed(4)}`}{" "}
            · {cachedPacksCount > 0 ? `${cachedPacksCount} Offline Pack Cached` : "Online OSM Tiles"}
          </Text>
        </View>
      </View>

      {/* Interactive Leaflet OSM / Spatial Map */}
      <View style={[styles.mapFrame, { height }]}>
        <OpenStreetMap
          markers={markers}
          routes={routes}
          heatPoints={heatPoints}
          userLocation={{
            latitude: riderLocation.latitude,
            longitude: riderLocation.longitude,
            title: "Your Position",
          }}
          initialRegion={{
            latitude: pickup?.lat ?? riderLocation.latitude,
            longitude: pickup?.lng ?? riderLocation.longitude,
            zoom: 13,
          }}
          theme="dark"
          onSelectMarker={(id) => {
            const found = hotspots.find((z) => z.id === id);
            if (found && onSelectHotspot) onSelectHotspot(found);
          }}
        />
      </View>

      {/* Live Telemetry Meter Bar */}
      <View style={styles.telemetryBar}>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>SPEED</Text>
          <Text style={styles.metricVal}>{Math.round(riderLocation.speedKmh ?? 0)} km/h</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>DISTANCE</Text>
          <Text style={styles.metricVal}>
            {(routeMeta.distKm || distanceKm).toFixed(1)} km
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>ETA</Text>
          <Text style={[styles.metricVal, { color: RIDER_COLORS.emerald }]}>
            {routeMeta.durMin || etaMinutes} min
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>OFFLINE CACHE</Text>
          <Text style={[styles.metricVal, { color: RIDER_COLORS.gold }]}>
            {cachedPacksCount}/{offlinePacks.length || 4}
          </Text>
        </View>
      </View>

      {maneuvers.length > 1 && (
        <View style={styles.maneuversStrip}>
          {maneuvers.slice(0, 3).map((m, idx) => (
            <View key={idx} style={styles.maneuverRow}>
              <Ionicons name={m.icon} size={13} color={RIDER_COLORS.emerald} />
              <Text style={styles.maneuverText} numberOfLines={1}>
                {m.instruction} ({m.distanceKm} km)
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: RIDER_COLORS.surface,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
  },
  hudBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#064E3B",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  turnIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#34D399",
    alignItems: "center",
    justifyContent: "center",
  },
  hudTextCol: {
    flex: 1,
  },
  hudPrimary: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  hudSub: {
    color: "#A7F3D0",
    fontSize: 11,
    marginTop: 1,
  },
  mapFrame: {
    width: "100%",
    backgroundColor: "#0F172A",
  },
  telemetryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#0F172A",
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
  },
  metricCell: {
    flex: 1,
    alignItems: "center",
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#334155",
  },
  metricLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  metricVal: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  maneuversStrip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
    backgroundColor: "#0B1120",
  },
  maneuverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  maneuverText: {
    color: "#CBD5E1",
    fontSize: 11,
    flex: 1,
  },
});
