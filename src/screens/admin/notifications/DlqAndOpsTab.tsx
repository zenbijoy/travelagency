/**
 * Outbox & DLQ Operations Tab — Admin Personalization Command Center
 * Provides live Transactional Outbox queue inspection, manual worker execution trigger,
 * and Dead-Letter Queue (DLQ) failure diagnosis with Replay and Discard actions.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import {
  personalizationService,
  formatPersonalizationError,
  OutboxListResponse,
  OutboxProcessResponse,
  DLQListResponse,
} from "../../../services/personalizationService";
import { LoadingState } from "../../../components/ui/LoadingState";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorStateCard } from "../../../components/common/ErrorStateCard";

export const DlqAndOpsTab: React.FC = () => {
  const [outbox, setOutbox] = useState<OutboxListResponse | null>(null);
  const [dlq, setDlq] = useState<DLQListResponse | null>(null);
  const [outboxFilter, setOutboxFilter] = useState<string>("");
  const [dlqFilter, setDlqFilter] = useState<string>("unresolved");

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [processingWorker, setProcessingWorker] = useState(false);
  const [processSummary, setProcessSummary] = useState<OutboxProcessResponse | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [discardNotes, setDiscardNotes] = useState("");
  const [opMsg, setOpMsg] = useState<string | null>(null);
  const [opErr, setOpErr] = useState<string | null>(null);

  const loadOpsData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [outboxRes, dlqRes] = await Promise.all([
        personalizationService.getOutbox({
          page: 1,
          page_size: 20,
          status: outboxFilter || undefined,
        }),
        personalizationService.getDlq({
          page: 1,
          page_size: 20,
          resolution_status: dlqFilter === "all" ? undefined : dlqFilter,
        }),
      ]);
      setOutbox(outboxRes);
      setDlq(dlqRes);
    } catch (err) {
      setErrorMsg(formatPersonalizationError(err).message);
      setOutbox(null);
      setDlq(null);
    } finally {
      setLoading(false);
    }
  }, [outboxFilter, dlqFilter]);

  useEffect(() => {
    loadOpsData();
  }, [loadOpsData]);

  const handleProcessOutbox = async () => {
    try {
      setProcessingWorker(true);
      setOpErr(null);
      setOpMsg(null);
      const res = await personalizationService.processOutbox(50);
      setProcessSummary(res);
      setOpMsg(
        `Worker finished: ${res.processed_count} processed (${res.delivered_count} delivered, ${res.suppressed_count} suppressed, ${res.rescheduled_count} rescheduled, ${res.quarantined_count} quarantined).`
      );
      await loadOpsData();
    } catch (err) {
      setOpErr(formatPersonalizationError(err).message);
    } finally {
      setProcessingWorker(false);
    }
  };

  const handleReplay = (dlqId: string, eventType: string) => {
    Alert.alert(
      "Replay DLQ Message",
      `Re-queue "${eventType}" from Dead-Letter Queue back into the pending Outbox?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replay Now",
          onPress: async () => {
            try {
              setActionBusyId(dlqId);
              setOpErr(null);
              const res = await personalizationService.replayDlqEntry(dlqId);
              setOpMsg(res.message || "DLQ entry replayed to outbox.");
              await loadOpsData();
            } catch (err) {
              setOpErr(formatPersonalizationError(err).message);
            } finally {
              setActionBusyId(null);
            }
          },
        },
      ]
    );
  };

  const handleDiscard = (dlqId: string, eventType: string) => {
    Alert.alert(
      "Discard DLQ Message",
      `Permanently mark "${eventType}" as discarded? It will not be retried.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            try {
              setActionBusyId(dlqId);
              setOpErr(null);
              const res = await personalizationService.discardDlqEntry(dlqId, {
                resolution_notes: discardNotes.trim() || "Discarded by admin",
              });
              setOpMsg(res.message || "DLQ entry discarded.");
              setDiscardNotes("");
              await loadOpsData();
            } catch (err) {
              setOpErr(formatPersonalizationError(err).message);
            } finally {
              setActionBusyId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <LoadingState variant="skeleton" skeletonType="table" count={5} />;
  }

  if (errorMsg || !outbox || !dlq) {
    return (
      <ErrorStateCard
        title="Outbox & DLQ Operations Unavailable"
        message={errorMsg || "Unable to fetch notification outbox and DLQ telemetry."}
        onRetry={loadOpsData}
      />
    );
  }

  const statusCounts = Object.entries(outbox.status_counts || {});

  return (
    <View style={styles.container}>
      {/* Outbox Queue Header & Worker Trigger */}
      <View style={styles.headerCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Transactional Outbox & DLQ Operations</Text>
          <Text style={styles.headerSubtitle}>
            Outbox total: {outbox.total} • DLQ entries ({dlqFilter}): {dlq.total}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.workerBtn}
            onPress={handleProcessOutbox}
            disabled={processingWorker}
          >
            {processingWorker ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="play" size={15} color="#ffffff" />
                <Text style={styles.workerBtnText}>Trigger Worker</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadOpsData}>
            <Ionicons name="refresh" size={16} color="#0284c7" />
          </TouchableOpacity>
        </View>
      </View>

      {opMsg && (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>{opMsg}</Text>
        </View>
      )}
      {opErr && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{opErr}</Text>
        </View>
      )}

      {processSummary && (
        <View style={styles.workerSummaryCard}>
          <Text style={styles.workerSummaryTitle}>Last Worker Run Telemetry</Text>
          <Text style={styles.workerSummaryText}>
            Processed: {processSummary.processed_count} • Delivered: {processSummary.delivered_count} •
            Suppressed: {processSummary.suppressed_count} • Rescheduled: {processSummary.rescheduled_count} •
            Failed: {processSummary.failed_count} • Quarantined: {processSummary.quarantined_count}
          </Text>
        </View>
      )}

      {/* Outbox Status Counts & Queue */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Outbox Queue Status</Text>

        {statusCounts.length > 0 && (
          <View style={styles.statusPillsRow}>
            <TouchableOpacity
              style={[styles.filterPill, outboxFilter === "" && styles.filterPillActive]}
              onPress={() => setOutboxFilter("")}
            >
              <Text
                style={[styles.filterPillText, outboxFilter === "" && styles.filterPillTextActive]}
              >
                ALL ({outbox.total})
              </Text>
            </TouchableOpacity>
            {statusCounts.map(([st, cnt]) => (
              <TouchableOpacity
                key={st}
                style={[styles.filterPill, outboxFilter === st && styles.filterPillActive]}
                onPress={() => setOutboxFilter(st)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    outboxFilter === st && styles.filterPillTextActive,
                  ]}
                >
                  {st.toUpperCase()} ({cnt})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {outbox.items.length === 0 ? (
          <EmptyState
            compact
            title="Outbox Queue Empty"
            description="No outbox events match the selected status filter."
          />
        ) : (
          <View style={{ gap: 8 }}>
            {outbox.items.map((item) => (
              <View key={item.id} style={styles.rowCard}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowTitle}>{item.event_type}</Text>
                  <View style={styles.statusTag}>
                    <Text style={styles.statusTagText}>{item.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.rowMeta}>
                  {item.aggregate_type}:{item.aggregate_id} • Priority {item.priority} • Attempts{" "}
                  {item.attempts}/{item.max_attempts}
                </Text>
                <Text style={styles.rowTime}>
                  Scheduled: {new Date(item.scheduled_at).toLocaleString()}
                  {item.next_retry_at
                    ? ` • Next retry: ${new Date(item.next_retry_at).toLocaleString()}`
                    : ""}
                </Text>
                {item.error_message && (
                  <Text style={styles.rowError}>{item.error_message}</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Dead-Letter Queue (DLQ) */}
      <View style={styles.card}>
        <View style={styles.dlqHeaderRow}>
          <Text style={styles.cardTitle}>Dead-Letter Queue (DLQ)</Text>
          <View style={styles.statusPillsRow}>
            {(["unresolved", "replayed", "discarded", "all"] as const).map((st) => (
              <TouchableOpacity
                key={st}
                style={[styles.filterPill, dlqFilter === st && styles.filterPillActive]}
                onPress={() => setDlqFilter(st)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    dlqFilter === st && styles.filterPillTextActive,
                  ]}
                >
                  {st.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TextInput
          style={styles.textInput}
          placeholder="Optional discard resolution note..."
          value={discardNotes}
          onChangeText={setDiscardNotes}
          placeholderTextColor="#94a3b8"
        />

        {dlq.items.length === 0 ? (
          <EmptyState
            compact
            title="Zero Quarantined Messages"
            description="No dead-letter queue entries match the current filter."
          />
        ) : (
          <View style={{ gap: 8 }}>
            {dlq.items.map((item) => (
              <View key={item.id} style={styles.dlqCard}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowTitle}>{item.event_type}</Text>
                  <View
                    style={[
                      styles.statusTag,
                      {
                        backgroundColor:
                          item.resolution_status === "unresolved" ? "#fee2e2" : "#e2e8f0",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusTagText,
                        {
                          color:
                            item.resolution_status === "unresolved" ? "#991b1b" : "#334155",
                        },
                      ]}
                    >
                      {item.resolution_status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <Text style={styles.rowMeta}>
                  Channel: {item.channel || "—"} • Attempts: {item.attempts} • Exception:{" "}
                  {item.exception_class || "Error"}
                </Text>
                <Text style={styles.rowError}>{item.failure_reason}</Text>

                {item.resolution_status === "unresolved" && (
                  <View style={styles.dlqActions}>
                    <TouchableOpacity
                      style={styles.replayBtn}
                      onPress={() => handleReplay(item.id, item.event_type)}
                      disabled={actionBusyId === item.id}
                    >
                      <MaterialCommunityIcons name="replay" size={14} color="#059669" />
                      <Text style={styles.replayBtnText}>Replay</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.discardBtn}
                      onPress={() => handleDiscard(item.id, item.event_type)}
                      disabled={actionBusyId === item.id}
                    >
                      <Ionicons name="trash-outline" size={14} color="#dc2626" />
                      <Text style={styles.discardBtnText}>Discard</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 14, paddingBottom: 32 },
  headerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  headerTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  headerSubtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },
  headerActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  workerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#059669",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  workerBtnText: { fontSize: 12, fontWeight: "700", color: "#ffffff" },
  refreshBtn: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    padding: 8,
    borderRadius: 8,
  },
  successBanner: {
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#86efac",
    borderRadius: 8,
    padding: 10,
  },
  successText: { fontSize: 12, fontWeight: "600", color: "#166534" },
  errorBanner: {
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
    padding: 10,
  },
  errorText: { fontSize: 12, fontWeight: "600", color: "#991b1b" },
  workerSummaryCard: {
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  workerSummaryTitle: { fontSize: 12, fontWeight: "700", color: "#166534" },
  workerSummaryText: { fontSize: 11, color: "#15803d", marginTop: 3 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  dlqHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  statusPillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filterPill: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  filterPillActive: { backgroundColor: "#0284c7" },
  filterPillText: { fontSize: 10, fontWeight: "700", color: "#475569" },
  filterPillTextActive: { color: "#ffffff" },
  textInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: "#0f172a",
  },
  rowCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 3,
  },
  dlqCard: {
    backgroundColor: "#fffbfb",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
    gap: 4,
  },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  rowTitle: { fontSize: 12, fontWeight: "700", color: "#0f172a", flex: 1 },
  statusTag: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusTagText: { fontSize: 10, fontWeight: "700", color: "#0369a1" },
  rowMeta: { fontSize: 11, color: "#475569" },
  rowTime: { fontSize: 10, color: "#94a3b8" },
  rowError: { fontSize: 11, color: "#dc2626", fontWeight: "600", marginTop: 2 },
  dlqActions: { flexDirection: "row", gap: 8, marginTop: 6 },
  replayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  replayBtnText: { fontSize: 11, fontWeight: "700", color: "#059669" },
  discardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  discardBtnText: { fontSize: 11, fontWeight: "700", color: "#dc2626" },
});
