import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RideRequest } from "../types";
import {
  formatPaisaBDT,
  PLATFORM_COMMISSION_RATE,
  VEHICLE_TIERS,
} from "../calculators";
import { RIDER_COLORS } from "./RiderDesignSystem";

interface DispatchRadarCardProps {
  request: RideRequest;
  onAccept: (req: RideRequest) => void;
  onDecline: (requestId: string) => void;
  busy?: boolean;
}

export const DispatchRadarCard: React.FC<DispatchRadarCardProps> = ({
  request,
  onAccept,
  onDecline,
  busy = false,
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    const diff = Math.floor((new Date(request.expires_at).getTime() - Date.now()) / 1000);
    return Math.max(15, Math.min(90, diff > 0 ? diff : 45));
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const spec = VEHICLE_TIERS[request.vehicle_mode];
  const commission = Math.round(request.quoted_fare_paisa * PLATFORM_COMMISSION_RATE);
  const fuelEst = Math.round(request.estimated_distance_km * spec.fuelCostPerKmBdt * 100);
  const netProfit = Math.max(0, request.quoted_fare_paisa - commission - fuelEst);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.badgeGroup}>
          <View style={styles.modeTag}>
            <Ionicons
              name={spec.icon as keyof typeof Ionicons.glyphMap}
              size={14}
              color="#FFFFFF"
            />
            <Text style={styles.modeText}>{spec.label}</Text>
          </View>
          {request.surge_multiplier > 1.0 && (
            <View style={styles.surgeTag}>
              <Ionicons name="flash" size={12} color="#0F172A" />
              <Text style={styles.surgeText}>
                {request.surge_multiplier.toFixed(2)}x Surge
              </Text>
            </View>
          )}
          {request.ride_type === "airport_pickup" && (
            <View style={styles.airportTag}>
              <Ionicons name="airplane" size={11} color="#93C5FD" />
              <Text style={styles.airportText}>Airport</Text>
            </View>
          )}
        </View>

        <View style={styles.timerBox}>
          <Ionicons name="timer-outline" size={13} color={secondsLeft <= 10 ? "#F87171" : RIDER_COLORS.gold} />
          <Text
            style={[
              styles.timerText,
              { color: secondsLeft <= 10 ? "#F87171" : RIDER_COLORS.gold },
            ]}
          >
            {secondsLeft}s
          </Text>
        </View>
      </View>

      <View style={styles.fareRow}>
        <View>
          <Text style={styles.grossFare}>{formatPaisaBDT(request.quoted_fare_paisa)}</Text>
          <Text style={styles.netProfit}>
            Est. Net Profit: {formatPaisaBDT(netProfit)} (after fee & fuel)
          </Text>
        </View>
        <View style={styles.distBadge}>
          <Text style={styles.distValue}>{request.estimated_distance_km} km</Text>
          <Text style={styles.distTime}>{request.estimated_duration_min} min</Text>
        </View>
      </View>

      <View style={styles.routeBox}>
        <View style={styles.stopRow}>
          <View style={[styles.dot, { backgroundColor: RIDER_COLORS.emerald }]} />
          <View style={styles.stopInfo}>
            <Text style={styles.stopLabel}>PICKUP</Text>
            <Text style={styles.stopAddress} numberOfLines={1}>
              {request.pickup_address}
            </Text>
            <Text style={styles.coordText}>
              {request.pickup_lat.toFixed(4)}, {request.pickup_lng.toFixed(4)}
            </Text>
          </View>
        </View>
        <View style={styles.connector} />
        <View style={styles.stopRow}>
          <View style={[styles.dot, { backgroundColor: "#F97316" }]} />
          <View style={styles.stopInfo}>
            <Text style={styles.stopLabel}>DROPOFF</Text>
            <Text style={styles.stopAddress} numberOfLines={1}>
              {request.dropoff_address}
            </Text>
            <Text style={styles.coordText}>
              {request.dropoff_lat.toFixed(4)}, {request.dropoff_lng.toFixed(4)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          👤 {request.passenger_name || "Traveler"} · ⭐ {(request.passenger_rating ?? 4.9).toFixed(1)}
        </Text>
        <Text style={styles.metaText}>💳 {request.payment_method.toUpperCase()}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.declineBtn}
          onPress={() => onDecline(request.id)}
          disabled={busy}
        >
          <Ionicons name="close" size={18} color="#FCA5A5" />
          <Text style={styles.declineText}>Decline</Text>
        </Pressable>
        <Pressable
          style={[styles.acceptBtn, busy && { opacity: 0.65 }]}
          onPress={() => onAccept(request)}
          disabled={busy || secondsLeft === 0}
        >
          <Ionicons name="checkmark-circle" size={18} color="#0F172A" />
          <Text style={styles.acceptText}>
            {busy ? "Claiming..." : "Accept Ride"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: RIDER_COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  badgeGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  modeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#0D9488",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  modeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  surgeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: RIDER_COLORS.gold,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  surgeText: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "800",
  },
  airportTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  airportText: {
    color: "#93C5FD",
    fontSize: 11,
    fontWeight: "700",
  },
  timerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0F172A",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  timerText: {
    fontSize: 12,
    fontWeight: "800",
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  grossFare: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  netProfit: {
    color: "#34D399",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  distBadge: {
    alignItems: "flex-end",
    backgroundColor: "#0F172A",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  distValue: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },
  distTime: {
    color: "#94A3B8",
    fontSize: 11,
  },
  routeBox: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  connector: {
    width: 2,
    height: 14,
    backgroundColor: "#334155",
    marginLeft: 4,
    marginVertical: 2,
  },
  stopInfo: {
    flex: 1,
  },
  stopLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  stopAddress: {
    color: "#F1F5F9",
    fontSize: 13,
    fontWeight: "600",
  },
  coordText: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 1,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  metaText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  declineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    paddingVertical: 12,
    borderRadius: 12,
  },
  declineText: {
    color: "#FCA5A5",
    fontSize: 14,
    fontWeight: "700",
  },
  acceptBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: RIDER_COLORS.emerald,
    paddingVertical: 12,
    borderRadius: 12,
  },
  acceptText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },
});
