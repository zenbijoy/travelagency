/**
 * BDLiveMap.tsx
 *
 * Plug-and-Play React Native Map Component for Food Delivery, Ride-Sharing & Logistics.
 * Can be imported into ANY project and run in 5 minutes!
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import {
  Map,
  Camera,
  VectorSource,
  FillExtrusionLayer,
  GeoJSONSource,
  LineLayer,
  SymbolLayer,
  CircleLayer,
} from '@maplibre/maplibre-react-native';

export interface LocationPoint {
  lat: number;
  lng: number;
}

export interface BDLiveMapProps {
  apiKey: string;
  tileServerURL?: string; // Default: Cloudflare R2 PMTiles or Martin Standby
  orderId?: string;
  mode?: 'food_delivery' | 'ride_hailing' | 'courier' | 'explorer';
  riderLocation?: LocationPoint;
  riderHeading?: number;
  pickupLocation?: LocationPoint;
  dropoffLocation?: LocationPoint;
  routeGeometry?: GeoJSON.LineString;
  enable3DBuildings?: boolean;
  onRiderArrived?: () => void;
  style?: any;
}

export const BDLiveMap: React.FC<BDLiveMapProps> = ({
  apiKey,
  tileServerURL = 'https://tiles.yourdomain.com/bangladesh-v202611.pmtiles',
  orderId,
  mode = 'food_delivery',
  riderLocation,
  riderHeading = 0,
  pickupLocation,
  dropoffLocation,
  routeGeometry,
  enable3DBuildings = true,
  onRiderArrived,
  style,
}) => {
  const cameraRef = useRef<Camera>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Dynamic Center calculation
  const defaultCenter = riderLocation
    ? [riderLocation.lng, riderLocation.lat]
    : pickupLocation
    ? [pickupLocation.lng, pickupLocation.lat]
    : [90.4078, 23.7925]; // Default: Banani, Dhaka

  // GeoJSON for Rider Marker
  const riderGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: riderLocation
      ? [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [riderLocation.lng, riderLocation.lat],
            },
            properties: {
              heading: riderHeading,
              type: 'rider',
            },
          },
        ]
      : [],
  };

  // GeoJSON for Pickup & Dropoff Pins
  const stopsGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      ...(pickupLocation
        ? [
            {
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: [pickupLocation.lng, pickupLocation.lat],
              },
              properties: {
                title: mode === 'food_delivery' ? 'Restaurant' : 'Pickup',
                color: '#EF4444', // Red
              },
            },
          ]
        : []),
      ...(dropoffLocation
        ? [
            {
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: [dropoffLocation.lng, dropoffLocation.lat],
              },
              properties: {
                title: 'Customer',
                color: '#10B981', // Green
              },
            },
          ]
        : []),
    ],
  };

  // GeoJSON for Route Polyline
  const routeGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: routeGeometry
      ? [
          {
            type: 'Feature',
            geometry: routeGeometry,
            properties: {},
          },
        ]
      : [],
  };

  return (
    <View style={[styles.container, style]}>
      <Map
        style={styles.map}
        mapStyle="https://tiles.yourdomain.com/styles/bd-mobility-v1.json"
        attribution={true} // ODbL compliance
        logo={false}
        onDidFinishLoadingMap={() => setMapLoaded(true)}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: defaultCenter,
            zoom: 15,
            pitch: enable3DBuildings ? 45 : 0,
          }}
        />

        {/* 1. 3D Buildings from PMTiles */}
        {enable3DBuildings && (
          <VectorSource id="bd-pmtiles" url={`pmtiles://${tileServerURL}`}>
            <FillExtrusionLayer
              id="3d-building-layer"
              sourceLayer="building"
              minzoom={14}
              style={{
                fillExtrusionColor: '#94A3B8',
                fillExtrusionHeight: ['coalesce', ['get', 'render_height'], 10],
                fillExtrusionOpacity: 0.8,
              }}
            />
          </VectorSource>
        )}

        {/* 2. Route Line Layer */}
        {routeGeometry && (
          <GeoJSONSource id="route-source" data={routeGeoJSON}>
            <LineLayer
              id="route-line-bg"
              style={{
                lineColor: '#004D36',
                lineWidth: 7,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            <LineLayer
              id="route-line-fg"
              style={{
                lineColor: '#006A4E', // Bangladesh Green
                lineWidth: 4,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </GeoJSONSource>
        )}

        {/* 3. Pickup / Dropoff Landmark Circles */}
        <GeoJSONSource id="stops-source" data={stopsGeoJSON}>
          <CircleLayer
            id="stops-layer"
            style={{
              circleRadius: 8,
              circleColor: ['get', 'color'],
              circleStrokeWidth: 3,
              circleStrokeColor: '#FFFFFF',
            }}
          />
        </GeoJSONSource>

        {/* 4. Live Moving Rider Marker */}
        {riderLocation && (
          <GeoJSONSource id="rider-source" data={riderGeoJSON}>
            <SymbolLayer
              id="rider-marker"
              style={{
                iconImage: mode === 'ride_hailing' ? 'car-marker' : 'motorbike-marker',
                iconRotate: ['get', 'heading'],
                iconRotationAlignment: 'map',
                iconAllowOverlap: true,
                iconSize: 0.9,
              }}
            />
          </GeoJSONSource>
        )}
      </Map>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  map: {
    flex: 1,
  },
});
