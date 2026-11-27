/**
 * Live Ops Feed Tab — Admin Notification Command Center
 * Real-time outbox processing pulse, DLQ quarantine alerts & manual worker trigger.
 */

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  notificationCommandService,
  LiveOpsFeedItem,
} from "../../../services/notificationCommandService";
import {
  personalizationService,
  formatPersonalizationError,
} from "../../../services/personalizationService";
import { LoadingState } from "../../../components/ui/LoadingState";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorStateCard } from "../../../components/common/ErrorStateCard";

export const LiveOpsTab: React.FC = () => {
  const [items, setItems] = useState<LiveOpsFeedItem[]>([]);
  const [outboxCounts, setOutboxCounts] = useState<Record<string, number>>({});
  const [dlqCount, setDlqCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [workerNote, setWorkerNote] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    try {
      setLoading(true);
      const res = await notificationCommandService.getLiveOpsFeed();
      setItems(res.items);
      setOutboxCounts(res.outbox_counts);
      setDlqCount(res.dlq_count);
      setErrorMsg(res.error || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const handleRunWorker = async () => {
    try {
      setProcessing(true);
      setWorkerNote(null);
      const res = await personalizationService.processOutbox(50);
      setWorkerNote(
        `Worker run complete: ${res.processed_count} processed, ${res.delivered_count} delivered, ${res.failed_count} failed.`
      );
      await loadFeed();
    } catch (err) {
      setWorkerNote(`Worker trigger failed: ${formatPersonalizationError(err).message}`);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <LoadingState variant="skeleton" skeletonType="card" count={2} />;
  }

  if (errorMsg && items.length === 0) {
    return (
      <ErrorStateCard
        title="Live Ops Stream Unavailable"
        message={errorMsg}
        onRetry={loadFeed}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Live Notification Ops Stream</Text>
            <Text style={styles.sub}>
              Active outbox queue depth, DLQ quarantine events & worker controls
            </Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadFeed}>
            <Ionicons name="refresh" size={15} color="#0284c7" />
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Pending Outbox</Text>
            <Text style={styles.kpiVal}>{outboxCounts.pending ?? 0}</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Delivered</Text>
            <Text style={[styles.kpiVal, { color: "#059669" }]}>
              {outboxCounts.delivered ?? outboxCounts.sent ?? 0}
            </Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>DLQ Active</Text>
            <Text style={[styles.kpiVal, { color: "#dc2626" }]}>{dlqCount}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.workerBtn}
          onPress={handleRunWorker}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="play-circle-outline" size={18} color="#fff" />
              <Text style={styles.workerBtnText}>Run Outbox Worker Batch</Text>
            </>
          )}
        </TouchableOpacity>
        {workerNote && <Text style={styles.workerNote}>{workerNote}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>RECENT PIPELINE EVENTS ({items.length})</Text>
        {items.length === 0 ? (
          <EmptyState
            compact
            title="Live ops stream is quiet"
            description="No pending outbox items or DLQ quarantine entries."
          />
        ) : (
          items.map((item) => (
            <View key={`${item.kind}-${item.id}`} style={styles.feedRow}>
              <View style={styles.headerRow}>
                <Text style={styles.eventName}>
                  [{item.kind.toUpperCase()}] {item.event_type}
                </Text>
                <Text style={styles.statusTag}>{item.status.toUpperCase()}</Text>
              </View>
              <Text style={styles.meta}>
                Target: {item.recipient_masked} • {item.summary}
              </Text>
              <Text style={styles.time}>{new Date(item.timestamp).toLocaleString()}</Text>
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
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
  kpiRow: { flexDirection: "row", gap: 10 },
  kpiBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  kpiLabel: { fontSize: 11, color: "#64748b", fontWeight: "600" },
  kpiVal: { fontSize: 18, fontWeight: "800", color: "#0f172a", marginTop: 2 },
  workerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0284c7",
    paddingVertical: 10,
    borderRadius: 8,
  },
  workerBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  workerNote: { fontSize: 12, color: "#0369a1", fontWeight: "600" },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#475569" },
  feedRow: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 3,
  },
  eventName: { fontSize: 12, fontWeight: "700", color: "#0f172a" },
  statusTag: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0369a1",
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  meta: { fontSize: 11, color: "#475569" },
  time: { fontSize: 10, color: "#94a3b8" },
});
