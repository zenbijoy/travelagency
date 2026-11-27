/**
 * Provider Health Tab — Admin Notification Command Center
 * Monitors Push/FCM, In-App Realtime, Email, SMS, and AI provider circuit states & mock modes.
 * Never fabricates live healthy states when the telemetry endpoint is unreachable.
 */

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  notificationCommandService,
  ProviderHealthItem,
} from "../../../services/notificationCommandService";
import { LoadingState } from "../../../components/ui/LoadingState";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorStateCard } from "../../../components/common/ErrorStateCard";

export const ProviderHealthTab: React.FC = () => {
  const [providers, setProviders] = useState<ProviderHealthItem[]>([]);
  const [source, setSource] = useState<"backend" | "unavailable">("unavailable");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHealth = useCallback(async () => {
    try {
      setLoading(true);
      const res = await notificationCommandService.getProviderHealth();
      setProviders(res.providers);
      setSource(res.source);
      setErrorMsg(res.error || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  if (loading) {
    return <LoadingState variant="skeleton" skeletonType="card" count={2} />;
  }

  if (source === "unavailable") {
    return (
      <ErrorStateCard
        title="Provider Health Telemetry Unavailable"
        message={
          errorMsg ||
          "Could not reach /api/v1/notifications/admin/providers/health. Ensure FastAPI backend is running."
        }
        onRetry={loadHealth}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Delivery & AI Provider Health</Text>
            <Text style={styles.sub}>
              Circuit-breaker state, sandbox/mock mode indicators & channel latency
            </Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadHealth}>
            <Ionicons name="refresh" size={15} color="#0284c7" />
            <Text style={styles.refreshText}>Check</Text>
          </TouchableOpacity>
        </View>
      </View>

      {providers.length === 0 ? (
        <EmptyState
          compact
          title="No providers registered"
          description="Backend returned zero provider adapters."
        />
      ) : (
        providers.map((prov) => {
          const isOk = prov.status === "healthy";
          const isMock = prov.status === "mock_mode" || prov.mock_mode;
          return (
            <View key={`${prov.provider}-${prov.channel}`} style={styles.providerCard}>
              <View style={styles.rowBetween}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MaterialCommunityIcons
                    name={isOk ? "check-circle" : isMock ? "test-tube" : "alert-circle"}
                    size={20}
                    color={isOk ? "#10b981" : isMock ? "#6366f1" : "#ef4444"}
                  />
                  <View>
                    <Text style={styles.provName}>{prov.provider}</Text>
                    <Text style={styles.provChannel}>{prov.channel.toUpperCase()} Channel</Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: isOk
                        ? "#dcfce7"
                        : isMock
                        ? "#eef2ff"
                        : "#fee2e2",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color: isOk ? "#15803d" : isMock ? "#4338ca" : "#b91c1c",
                      },
                    ]}
                  >
                    {prov.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.metaLine}>
                Circuit: {prov.circuit_state || "closed"}
                {typeof prov.success_rate_pct === "number"
                  ? ` • Success: ${prov.success_rate_pct.toFixed(1)}%`
                  : ""}
                {typeof prov.avg_latency_ms === "number"
                  ? ` • Avg Latency: ${prov.avg_latency_ms}ms`
                  : ""}
              </Text>
              {prov.detail && <Text style={styles.detail}>{prov.detail}</Text>}
            </View>
          );
        })
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 12, paddingBottom: 24 },
  headerCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  sub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0f9ff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshText: { fontSize: 12, fontWeight: "700", color: "#0284c7" },
  providerCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 6,
  },
  provName: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  provChannel: { fontSize: 11, color: "#64748b" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: "800" },
  metaLine: { fontSize: 12, color: "#334155" },
  detail: { fontSize: 11, color: "#64748b" },
});
