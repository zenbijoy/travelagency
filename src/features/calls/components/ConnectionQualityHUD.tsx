import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { QualityMetrics } from "../types";

interface Props {
  metrics: QualityMetrics;
  showDetails?: boolean;
}

export const ConnectionQualityHUD: React.FC<Props> = ({ metrics, showDetails = false }) => {
  const [expanded, setExpanded] = useState(showDetails);

  const getQualityColor = () => {
    switch (metrics.quality) {
      case "excellent":
      case "good":
        return "#10B981"; // Emerald green
      case "fair":
        return "#F59E0B"; // Amber yellow
      case "poor":
      case "critical":
        return "#EF4444"; // Crimson red
      default:
        return "#94A3B8";
    }
  };

  const getQualityLabelBn = () => {
    switch (metrics.quality) {
      case "excellent":
        return "চমৎকার নেটওয়ার্ক";
      case "good":
        return "ভালো সংযোগ";
      case "fair":
        return "মাঝারি গতি";
      case "poor":
        return "দুর্বল নেটওয়ার্ক";
      case "critical":
        return "সংযোগ বিচ্ছিন্ন ঝুঁকি";
      default:
        return "সংযুক্ত";
    }
  };

  const color = getQualityColor();

  return (
    <Pressable
      style={[styles.container, expanded && styles.containerExpanded]}
      onPress={() => setExpanded(!expanded)}
    >
      <View style={styles.summaryRow}>
        {/* Signal Bars */}
        <View style={styles.barsContainer}>
          <View style={[styles.bar, { height: 6, backgroundColor: color }]} />
          <View
            style={[
              styles.bar,
              {
                height: 9,
                backgroundColor:
                  metrics.quality === "critical" ? "rgba(255,255,255,0.2)" : color,
              },
            ]}
          />
          <View
            style={[
              styles.bar,
              {
                height: 12,
                backgroundColor:
                  metrics.quality === "poor" || metrics.quality === "critical"
                    ? "rgba(255,255,255,0.2)"
                    : color,
              },
            ]}
          />
          <View
            style={[
              styles.bar,
              {
                height: 15,
                backgroundColor:
                  metrics.quality === "excellent" ? color : "rgba(255,255,255,0.2)",
              },
            ]}
          />
        </View>

        <Text style={styles.latencyText}>{metrics.rttMs}ms</Text>

        {metrics.packetLossPercent > 0 && (
          <Text style={styles.lossText}>• {metrics.packetLossPercent}% ড্রপ</Text>
        )}

        {metrics.relayUsed ? (
          <View style={styles.turnBadge}>
            <Ionicons name="shield-checkmark" size={10} color="#60A5FA" />
            <Text style={styles.turnText}>TURN</Text>
          </View>
        ) : (
          <View style={styles.p2pBadge}>
            <Ionicons name="flash" size={10} color="#34D399" />
            <Text style={styles.p2pText}>P2P</Text>
          </View>
        )}
      </View>

      {expanded && (
        <View style={styles.detailsTray}>
          <View style={styles.detailsRow}>
            <Text style={styles.detailLabel}>স্ট্যাটাস:</Text>
            <Text style={[styles.detailValue, { color }]}>{getQualityLabelBn()}</Text>
          </View>
          <View style={styles.detailsRow}>
            <Text style={styles.detailLabel}>জিটার (Jitter):</Text>
            <Text style={styles.detailValue}>{metrics.jitterMs}ms</Text>
          </View>
          <View style={styles.detailsRow}>
            <Text style={styles.detailLabel}>বিটরেট:</Text>
            <Text style={styles.detailValue}>{metrics.bitrateKbps} kbps</Text>
          </View>
          <View style={styles.detailsRow}>
            <Text style={styles.detailLabel}>রুট:</Text>
            <Text style={styles.detailValue}>{metrics.iceType || (metrics.relayUsed ? "Relay" : "Direct Host")}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "center",
  },
  containerExpanded: {
    paddingVertical: 8,
    borderRadius: 14,
    minWidth: 180,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  barsContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: 15,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
  },
  latencyText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  lossText: {
    color: "#F87171",
    fontSize: 10,
    fontWeight: "600",
  },
  turnBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(59, 130, 246, 0.25)",
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  turnText: {
    color: "#93C5FD",
    fontSize: 9,
    fontWeight: "800",
  },
  p2pBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(16, 185, 129, 0.25)",
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  p2pText: {
    color: "#6EE7B7",
    fontSize: 9,
    fontWeight: "800",
  },
  detailsTray: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    gap: 3,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    color: "#94A3B8",
    fontSize: 10,
  },
  detailValue: {
    color: "#F8FAFC",
    fontSize: 10,
    fontWeight: "600",
  },
});
