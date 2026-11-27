/**
 * Delivery Logs Tab — Admin Notification Command Center
 * Channel, status, and event filters with strictly masked recipient PII.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  notificationCommandService,
  DeliveryLogRecord,
} from "../../../services/notificationCommandService";
import { LoadingState } from "../../../components/ui/LoadingState";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorStateCard } from "../../../components/common/ErrorStateCard";

const CHANNELS = ["all", "push", "in_app", "email", "sms"] as const;
const STATUSES = ["all", "delivered", "sent", "pending", "failed"] as const;

export const DeliveryLogsTab: React.FC = () => {
  const [channel, setChannel] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [eventQuery, setEventQuery] = useState("");
  const [logs, setLogs] = useState<DeliveryLogRecord[]>([]);
  const [source, setSource] = useState<"backend" | "outbox_derived" | "unavailable">("backend");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await notificationCommandService.getDeliveryLogs({
        channel,
        status,
        event_type: eventQuery.trim() || undefined,
        limit: 40,
      });
      setLogs(res.items);
      setSource(res.source);
      setNotice(res.error || null);
    } finally {
      setLoading(false);
    }
  }, [channel, status, eventQuery]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  if (loading) {
    return <LoadingState variant="skeleton" skeletonType="card" count={3} />;
  }

  if (source === "unavailable" && logs.length === 0) {
    return (
      <ErrorStateCard
        title="Delivery Logs Unavailable"
        message={notice || "Unable to load notification delivery logs."}
        onRetry={loadLogs}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Delivery Logs (PII Masked)</Text>
            <Text style={styles.sub}>
              Channel, status & event traceability without exposing raw traveler emails or phones
            </Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadLogs}>
            <Ionicons name="refresh" size={15} color="#0284c7" />
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {notice && <Text style={styles.noticeBox}>{notice}</Text>}

        <TextInput
          style={styles.input}
          value={eventQuery}
          onChangeText={setEventQuery}
          placeholder="Filter by event_type (e.g. booking.confirmed)..."
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
        />

        <Text style={styles.filterLabel}>CHANNEL</Text>
        <View style={styles.chipsRow}>
          {CHANNELS.map((ch) => (
            <TouchableOpacity
              key={ch}
              style={[styles.chip, channel === ch && styles.chipActive]}
              onPress={() => setChannel(ch)}
            >
              <Text style={[styles.chipText, channel === ch && styles.chipTextActive]}>
                {ch.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.filterLabel}>DELIVERY STATUS</Text>
        <View style={styles.chipsRow}>
          {STATUSES.map((st) => (
            <TouchableOpacity
              key={st}
              style={[styles.chip, status === st && styles.chipActive]}
              onPress={() => setStatus(st)}
            >
              <Text style={[styles.chipText, status === st && styles.chipTextActive]}>
                {st.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.filterLabel}>LOG ENTRIES ({logs.length})</Text>
        {logs.length === 0 ? (
          <EmptyState
            compact
            title="No delivery logs match filter"
            description="Adjust channel, status, or event filters above."
          />
        ) : (
          logs.map((item) => (
            <View key={item.id} style={styles.logRow}>
              <View style={styles.logHead}>
                <Text style={styles.logEvent}>{item.event_type}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    item.status === "failed" || item.status === "dlq"
                      ? { backgroundColor: "#fee2e2" }
                      : item.status === "pending"
                      ? { backgroundColor: "#fef3c7" }
                      : { backgroundColor: "#dcfce7" },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      item.status === "failed" || item.status === "dlq"
                        ? { color: "#b91c1c" }
                        : item.status === "pending"
                        ? { color: "#92400e" }
                        : { color: "#15803d" },
                    ]}
                  >
                    {item.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.logMeta}>
                Channel: {item.channel.toUpperCase()} • Recipient: {item.recipient_masked}
                {item.provider ? ` • Provider: ${item.provider}` : ""}
                {item.latency_ms !== null && item.latency_ms !== undefined
                  ? ` • ${item.latency_ms}ms`
                  : ""}
              </Text>
              {item.error_message && <Text style={styles.errLine}>{item.error_message}</Text>}
              <Text style={styles.timeText}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 14, paddingBottom: 24 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
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
  noticeBox: { fontSize: 11, color: "#92400e", backgroundColor: "#fef3c7", padding: 8, borderRadius: 6 },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: "#0f172a",
  },
  filterLabel: { fontSize: 11, fontWeight: "700", color: "#475569" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  chipActive: { backgroundColor: "#0284c7", borderColor: "#0284c7" },
  chipText: { fontSize: 11, fontWeight: "600", color: "#475569" },
  chipTextActive: { color: "#fff" },
  logRow: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 4,
  },
  logHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logEvent: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: "700" },
  logMeta: { fontSize: 12, color: "#334155" },
  errLine: { fontSize: 11, color: "#b91c1c" },
  timeText: { fontSize: 10, color: "#94a3b8" },
});
