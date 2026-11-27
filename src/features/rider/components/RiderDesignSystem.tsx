import React from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { Colors } from "@shopnojatra/shared";
import { DutyStatus, KycStatus, VehicleMode } from "../types";
import { VEHICLE_TIERS } from "../calculators";

export const RIDER_COLORS = {
  bg: Colors.slateBg,
  surface: Colors.navyLight,
  surfaceDeep: Colors.navy,
  border: "#334155",
  emerald: "#10B981",
  emeraldDark: "#065F46",
  gold: Colors.gold,
  amber: Colors.warning,
  danger: Colors.danger,
  info: Colors.info,
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
} as const;

export const DutySwitchPill: React.FC<{
  dutyStatus: DutyStatus;
  onToggle: () => void;
  disabled?: boolean;
}> = ({ dutyStatus, onToggle, disabled }) => {
  const isOnline = dutyStatus === "online" || dutyStatus === "on_trip";
  const label =
    dutyStatus === "on_trip"
      ? "ON TRIP"
      : dutyStatus === "online"
      ? "ONLINE"
      : "OFFLINE";

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: isOnline }}
      style={[
        styles.dutyPill,
        {
          backgroundColor:
            dutyStatus === "on_trip"
              ? "#1D4ED8"
              : isOnline
              ? RIDER_COLORS.emeraldDark
              : "#3F1D2B",
          borderColor:
            dutyStatus === "on_trip"
              ? "#60A5FA"
              : isOnline
              ? RIDER_COLORS.emerald
              : "#EF4444",
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.dutyDot,
          {
            backgroundColor:
              dutyStatus === "on_trip"
                ? "#93C5FD"
                : isOnline
                ? "#34D399"
                : "#F87171",
          },
        ]}
      />
      <Text style={styles.dutyText}>{label}</Text>
    </Pressable>
  );
};

export const KycBrtaBadge: React.FC<{
  kycStatus: KycStatus;
  brtaVerified: boolean;
}> = ({ kycStatus, brtaVerified }) => {
  const isVerified = kycStatus === "verified";
  return (
    <View style={styles.badgeRow}>
      <View
        style={[
          styles.statusChip,
          {
            backgroundColor: isVerified ? "rgba(16, 185, 129, 0.16)" : "rgba(245, 158, 11, 0.16)",
            borderColor: isVerified ? "rgba(16, 185, 129, 0.4)" : "rgba(245, 158, 11, 0.4)",
          },
        ]}
      >
        <Ionicons
          name={isVerified ? "shield-checkmark" : "time-outline"}
          size={12}
          color={isVerified ? "#34D399" : "#FBBF24"}
        />
        <Text
          style={[
            styles.statusChipText,
            { color: isVerified ? "#6EE7B7" : "#FCD34D" },
          ]}
        >
          {isVerified ? "KYC Verified" : `KYC: ${kycStatus.toUpperCase()}`}
        </Text>
      </View>

      <View
        style={[
          styles.statusChip,
          {
            backgroundColor: brtaVerified ? "rgba(59, 130, 246, 0.16)" : "rgba(100, 116, 139, 0.18)",
            borderColor: brtaVerified ? "rgba(59, 130, 246, 0.4)" : "rgba(100, 116, 139, 0.35)",
          },
        ]}
      >
        <Ionicons
          name={brtaVerified ? "ribbon" : "document-text-outline"}
          size={12}
          color={brtaVerified ? "#60A5FA" : "#94A3B8"}
        />
        <Text
          style={[
            styles.statusChipText,
            { color: brtaVerified ? "#93C5FD" : "#CBD5E1" },
          ]}
        >
          {brtaVerified ? "BRTA Licensed" : "BRTA Pending"}
        </Text>
      </View>
    </View>
  );
};

export const VehicleModeSelector: React.FC<{
  activeMode: VehicleMode;
  onSelect: (mode: VehicleMode) => void;
  modes?: VehicleMode[];
}> = ({
  activeMode,
  onSelect,
  modes = ["bike", "cng", "sedan", "suv", "boat", "parcel_rider"],
}) => {
  return (
    <View style={styles.modeGrid}>
      {modes.map((mode) => {
        const spec = VEHICLE_TIERS[mode];
        const selected = activeMode === mode;
        return (
          <Pressable
            key={mode}
            onPress={() => onSelect(mode)}
            style={[
              styles.modePill,
              selected && styles.modePillActive,
            ]}
          >
            <Ionicons
              name={spec.icon as keyof typeof Ionicons.glyphMap}
              size={16}
              color={selected ? RIDER_COLORS.surfaceDeep : RIDER_COLORS.textSecondary}
            />
            <Text
              style={[
                styles.modeLabel,
                selected && styles.modeLabelActive,
              ]}
            >
              {spec.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

export const DailyGoalRing: React.FC<{
  progressPct: number;
  currentLabel: string;
  goalLabel: string;
  size?: number;
}> = ({ progressPct, currentLabel, goalLabel, size = 96 }) => {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, progressPct));
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <View style={[styles.ringContainer, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1E293B"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={clamped >= 100 ? RIDER_COLORS.emerald : RIDER_COLORS.gold}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringOverlay}>
        <Text style={styles.ringPct}>{clamped}%</Text>
        <Text style={styles.ringCurrent}>{currentLabel}</Text>
        <Text style={styles.ringGoal}>of {goalLabel}</Text>
      </View>
    </View>
  );
};

export const RiderSectionCard: React.FC<{
  children: React.ReactNode;
  style?: ViewStyle;
}> = ({ children, style }) => <View style={[styles.card, style]}>{children}</View>;

const styles = StyleSheet.create({
  dutyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  dutyDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  dutyText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  modeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
  },
  modePillActive: {
    backgroundColor: RIDER_COLORS.gold,
    borderColor: RIDER_COLORS.gold,
  },
  modeLabel: {
    color: RIDER_COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  modeLabelActive: {
    color: RIDER_COLORS.surfaceDeep,
    fontWeight: "800",
  },
  ringContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  ringOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  ringPct: {
    color: RIDER_COLORS.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  ringCurrent: {
    color: RIDER_COLORS.gold,
    fontSize: 11,
    fontWeight: "700",
  },
  ringGoal: {
    color: RIDER_COLORS.textMuted,
    fontSize: 9,
  },
  card: {
    backgroundColor: RIDER_COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
  },
});
