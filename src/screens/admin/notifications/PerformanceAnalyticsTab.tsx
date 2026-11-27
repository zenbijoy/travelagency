/**
 * Performance Analytics & A/B Experiments Tab — Admin Personalization Command Center (Tab 7)
 * Compares Generic vs Light vs Deep personalization tiers (delivery, opens, clicks,
 * conversions, revenue, dismissal, fatigue), channel & suppression breakdowns,
 * A/B Experiment creation/monitoring with 95% CIs & stop conditions,
 * and bounded weight learning recommendations (requiring explicit admin review).
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
  PerformanceAnalyticsResponse,
  ExperimentResponse,
  ExperimentType,
} from "../../../services/personalizationService";
import {
  notificationCommandService,
  FunnelStageMetric,
} from "../../../services/notificationCommandService";
import { LoadingState } from "../../../components/ui/LoadingState";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorStateCard } from "../../../components/common/ErrorStateCard";

const EXPERIMENT_TYPES: ReadonlyArray<{ id: ExperimentType; label: string }> = [
  { id: "generic_vs_personalized", label: "Generic vs Personalized" },
  { id: "short_vs_detailed", label: "Short vs Detailed" },
  { id: "destination_vs_style", label: "Destination vs Style" },
  { id: "timing", label: "Send Timing" },
  { id: "cta", label: "CTA Copy" },
  { id: "channel", label: "Channel Choice" },
];

export const PerformanceAnalyticsTab: React.FC = () => {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [analytics, setAnalytics] = useState<PerformanceAnalyticsResponse | null>(null);
  const [experiments, setExperiments] = useState<ExperimentResponse[]>([]);
  const [funnelStages, setFunnelStages] = useState<FunnelStageMetric[]>([]);
  const [funnelNotice, setFunnelNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Create Experiment State
  const [showCreateExp, setShowCreateExp] = useState(false);
  const [expKey, setExpKey] = useState("");
  const [expName, setExpName] = useState("");
  const [expHypothesis, setExpHypothesis] = useState("");
  const [expType, setExpType] = useState<ExperimentType>("generic_vs_personalized");
  const [controlWeight, setControlWeight] = useState("0.5");
  const [treatmentWeight, setTreatmentWeight] = useState("0.5");
  const [minSample, setMinSample] = useState("100");
  const [maxDays, setMaxDays] = useState("14");
  const [optOutStop, setOptOutStop] = useState("0.05");
  const [targetCat, setTargetCat] = useState("marketing");
  const [creatingExp, setCreatingExp] = useState(false);
  const [expErr, setExpErr] = useState<string | null>(null);
  const [expMsg, setExpMsg] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [analyticsRes, expRes, funnelRes] = await Promise.all([
        personalizationService.getPerformanceAnalytics(windowDays),
        personalizationService.listExperiments(),
        notificationCommandService.getDeliveryFunnel(windowDays),
      ]);
      setAnalytics(analyticsRes);
      setExperiments(expRes);
      setFunnelStages(funnelRes.stages);
      setFunnelNotice(funnelRes.source === "unavailable" ? funnelRes.error || null : null);
    } catch (err) {
      setErrorMsg(formatPersonalizationError(err).message);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateExperiment = async () => {
    setExpErr(null);
    setExpMsg(null);
    const cleanKey = expKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const wA = parseFloat(controlWeight);
    const wB = parseFloat(treatmentWeight);

    if (cleanKey.length < 2 || expName.trim().length < 2 || expHypothesis.trim().length < 5) {
      setExpErr("Experiment key, name, and hypothesis (>=5 chars) are required.");
      return;
    }
    if (!Number.isFinite(wA) || !Number.isFinite(wB) || Math.abs(wA + wB - 1.0) > 0.001) {
      setExpErr("Control and Treatment variant weights must sum to 1.00.");
      return;
    }
    const lowerCat = targetCat.trim().toLowerCase();
    if (["security", "booking", "payment", "sos", "disruption", "otp"].includes(lowerCat)) {
      setExpErr("Experiments are prohibited on critical transactional or security notifications.");
      return;
    }

    try {
      setCreatingExp(true);
      const created = await personalizationService.createExperiment({
        key: cleanKey,
        name: expName.trim(),
        hypothesis: expHypothesis.trim(),
        experiment_type: expType,
        variants: [
          { name: "control", weight: wA, description: "Baseline control group" },
          { name: "treatment", weight: wB, description: "Personalized test variant" },
        ],
        min_sample_size: Math.max(10, parseInt(minSample, 10) || 100),
        max_duration_days: Math.max(1, parseInt(maxDays, 10) || 14),
        opt_out_stop_threshold: parseFloat(optOutStop) || 0.05,
        target_categories: [lowerCat || "marketing"],
      });
      setExpMsg(`Created experiment "${created.name}" (${created.key}).`);
      setShowCreateExp(false);
      setExpKey("");
      setExpName("");
      setExpHypothesis("");
      await loadData();
    } catch (err) {
      setExpErr(formatPersonalizationError(err).message);
    } finally {
      setCreatingExp(false);
    }
  };

  const handleStopExperiment = (exp: ExperimentResponse) => {
    Alert.alert(
      "Stop A/B Experiment",
      `Stop "${exp.name}"? Variant assignments will freeze and results summary will finalize.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop Experiment",
          style: "destructive",
          onPress: async () => {
            try {
              setStoppingId(exp.id);
              await personalizationService.stopExperiment(exp.id, {
                reason: "Stopped by administrator via Command Center",
              });
              setExpMsg(`Stopped experiment "${exp.name}".`);
              await loadData();
            } catch (err) {
              setExpErr(formatPersonalizationError(err).message);
            } finally {
              setStoppingId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <LoadingState variant="skeleton" skeletonType="card" count={3} />;
  }

  if (errorMsg || !analytics) {
    return (
      <ErrorStateCard
        title="Performance Analytics Unavailable"
        message={errorMsg || "Unable to fetch personalization tier comparison & experiments."}
        onRetry={loadData}
      />
    );
  }

  const channelEntries = Object.entries(analytics.channel_breakdown || {});
  const suppressionEntries = Object.entries(analytics.suppression_reasons || {});

  return (
    <View style={styles.container}>
      {/* Window Selector & Header */}
      <View style={styles.headerCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Personalization Performance & A/B Lab</Text>
          <Text style={styles.headerSubtitle}>
            Comparing Generic vs Light vs Deep tiers over last {analytics.window_days} days
          </Text>
        </View>
        <View style={styles.windowRow}>
          {[7, 14, 30, 90].map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.winPill, windowDays === d && styles.winPillActive]}
              onPress={() => setWindowDays(d)}
            >
              <Text style={[styles.winPillText, windowDays === d && styles.winPillTextActive]}>
                {d}d
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Delivery & Engagement Funnel (Queued -> Converted) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Delivery & Conversion Funnel</Text>
        <Text style={styles.headerSubtitle}>
          End-to-end funnel: Queued → Accepted → Delivered → Read → Clicked → Converted
        </Text>
        {funnelStages.length === 0 ? (
          <EmptyState
            compact
            title="Funnel Telemetry Not Reported Yet"
            description={
              funnelNotice ||
              "Backend analytics funnel endpoint will populate stage counts as notifications progress."
            }
          />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {funnelStages.map((st) => (
              <View key={st.stage} style={styles.miniStat}>
                <Text style={styles.miniLabel}>{st.label || st.stage.toUpperCase()}</Text>
                <Text style={styles.miniVal}>{st.count}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Generic vs Light vs Deep Comparison */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Generic vs Light vs Deep Personalization</Text>
        {analytics.tier_comparison.length === 0 ? (
          <EmptyState
            compact
            title="No Decision Data in Window"
            description="Tier metrics populate once notifications pass through the decision pipeline."
          />
        ) : (
          <View style={styles.tiersGrid}>
            {analytics.tier_comparison.map((t) => {
              const tierColor =
                t.tier === "deep"
                  ? "#059669"
                  : t.tier === "light"
                  ? "#0284c7"
                  : t.tier === "suppressed"
                  ? "#ef4444"
                  : "#64748b";
              return (
                <View
                  key={t.tier}
                  style={[styles.tierCard, { borderTopColor: tierColor, borderTopWidth: 4 }]}
                >
                  <Text style={[styles.tierTitle, { color: tierColor }]}>
                    {t.tier.toUpperCase()} TIER
                  </Text>
                  <Text style={styles.tierStat}>
                    Decisions: {t.total_decisions} • Delivered: {t.delivered_count} • Suppressed:{" "}
                    {t.suppressed_count}
                  </Text>
                  <View style={styles.tierMetricsRow}>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniLabel}>Open Rate</Text>
                      <Text style={styles.miniVal}>{t.open_rate_pct.toFixed(1)}%</Text>
                    </View>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniLabel}>CTR</Text>
                      <Text style={styles.miniVal}>{t.ctr_pct.toFixed(1)}%</Text>
                    </View>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniLabel}>Conversion</Text>
                      <Text style={styles.miniVal}>{t.conversion_rate_pct.toFixed(1)}%</Text>
                    </View>
                  </View>
                  <Text style={styles.tierFoot}>
                    Revenue: ৳{((t.revenue_paisa || 0) / 100).toLocaleString()} • Dismissed:{" "}
                    {t.dismissed_count} • Avg Rel: {t.avg_relevance_score.toFixed(1)} • Avg Fatigue:{" "}
                    {t.avg_fatigue_score.toFixed(1)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Channel Breakdown & Suppression Reasons */}
      <View style={styles.splitGrid}>
        <View style={[styles.card, { flex: 1, minWidth: 260 }]}>
          <Text style={styles.cardTitle}>Channel Breakdown</Text>
          {channelEntries.length === 0 ? (
            <EmptyState compact title="No Channel Data" description="No channel metrics recorded." />
          ) : (
            channelEntries.map(([ch, metrics]) => (
              <View key={ch} style={styles.kvRow}>
                <Text style={styles.kvKey}>{ch.toUpperCase()}</Text>
                <Text style={styles.kvVal}>
                  {Object.entries(metrics || {})
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" • ")}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={[styles.card, { flex: 1, minWidth: 260 }]}>
          <Text style={styles.cardTitle}>
            Suppression Breakdown ({analytics.total_suppressed} total)
          </Text>
          {suppressionEntries.length === 0 ? (
            <EmptyState
              compact
              title="No Suppressions"
              description="No notifications were suppressed in this time window."
            />
          ) : (
            suppressionEntries.map(([reason, count]) => (
              <View key={reason} style={styles.kvRow}>
                <Text style={styles.kvKey}>{reason}</Text>
                <Text style={styles.kvCount}>{count}</Text>
              </View>
            ))
          )}
        </View>
      </View>

      {/* A/B Experiments & Bounded Weight Learning */}
      <View style={styles.card}>
        <View style={styles.expHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>A/B Experiments & Bounded Weight Learning</Text>
            <Text style={styles.headerSubtitle}>
              Critical transactional/security categories are excluded. Weight proposals are bounded (±0.03) and never auto-mutated.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => setShowCreateExp((v) => !v)}
          >
            <Ionicons name={showCreateExp ? "close" : "add"} size={15} color="#ffffff" />
            <Text style={styles.createBtnText}>
              {showCreateExp ? "Cancel" : "New Experiment"}
            </Text>
          </TouchableOpacity>
        </View>

        {expMsg && (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{expMsg}</Text>
          </View>
        )}
        {expErr && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{expErr}</Text>
          </View>
        )}

        {showCreateExp && (
          <View style={styles.createExpBox}>
            <View style={styles.fieldsRow}>
              <View style={styles.colField}>
                <Text style={styles.fieldLabel}>KEY (a-z0-9_-)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="exp_sylhet_copy_v1"
                  value={expKey}
                  onChangeText={setExpKey}
                  autoCapitalize="none"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.colField}>
                <Text style={styles.fieldLabel}>NAME</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Sylhet Personalization Lift Test"
                  value={expName}
                  onChangeText={setExpName}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>HYPOTHESIS</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Deep style-matched copy increases CTR without raising opt-outs."
              value={expHypothesis}
              onChangeText={setExpHypothesis}
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.fieldLabel}>EXPERIMENT TYPE</Text>
            <View style={styles.chipsWrap}>
              {EXPERIMENT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.chip, expType === t.id && styles.chipActive]}
                  onPress={() => setExpType(t.id)}
                >
                  <Text style={[styles.chipText, expType === t.id && styles.chipTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.fieldsRow}>
              <View style={styles.colField}>
                <Text style={styles.fieldLabel}>CONTROL WEIGHT</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="decimal-pad"
                  value={controlWeight}
                  onChangeText={setControlWeight}
                />
              </View>
              <View style={styles.colField}>
                <Text style={styles.fieldLabel}>TREATMENT WEIGHT</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="decimal-pad"
                  value={treatmentWeight}
                  onChangeText={setTreatmentWeight}
                />
              </View>
              <View style={styles.colField}>
                <Text style={styles.fieldLabel}>TARGET CATEGORY</Text>
                <TextInput
                  style={styles.textInput}
                  value={targetCat}
                  onChangeText={setTargetCat}
                />
              </View>
            </View>

            <View style={styles.fieldsRow}>
              <View style={styles.colField}>
                <Text style={styles.fieldLabel}>MIN SAMPLE SIZE</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="number-pad"
                  value={minSample}
                  onChangeText={setMinSample}
                />
              </View>
              <View style={styles.colField}>
                <Text style={styles.fieldLabel}>MAX DURATION (DAYS)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="number-pad"
                  value={maxDays}
                  onChangeText={setMaxDays}
                />
              </View>
              <View style={styles.colField}>
                <Text style={styles.fieldLabel}>OPT-OUT STOP THRESHOLD</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="decimal-pad"
                  value={optOutStop}
                  onChangeText={setOptOutStop}
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleCreateExperiment}
              disabled={creatingExp}
            >
              {creatingExp ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveBtnText}>Launch Experiment</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {experiments.length === 0 ? (
          <EmptyState
            compact
            title="No A/B Experiments Yet"
            description="Create a controlled experiment above to measure personalization lift."
          />
        ) : (
          experiments.map((exp) => {
            const weightProposals = Object.entries(exp.recommended_weight_adjustments || {});
            return (
              <View key={exp.id} style={styles.expCard}>
                <View style={styles.expCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expName}>
                      {exp.name} ({exp.key})
                    </Text>
                    <Text style={styles.expHyp}>{exp.hypothesis}</Text>
                    <Text style={styles.expMeta}>
                      Type: {exp.experiment_type} • Min Sample: {exp.min_sample_size} • Max Days:{" "}
                      {exp.max_duration_days} • Opt-Out Guard: {(exp.opt_out_stop_threshold * 100).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            exp.status === "running" || exp.status === "active"
                              ? "#dcfce7"
                              : "#f1f5f9",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          {
                            color:
                              exp.status === "running" || exp.status === "active"
                                ? "#166534"
                                : "#475569",
                          },
                        ]}
                      >
                        {exp.status.toUpperCase()}
                      </Text>
                    </View>
                    {(exp.status === "running" || exp.status === "active" || exp.status === "draft") && (
                      <TouchableOpacity
                        style={styles.stopBtn}
                        onPress={() => handleStopExperiment(exp)}
                        disabled={stoppingId === exp.id}
                      >
                        <Text style={styles.stopBtnText}>
                          {stoppingId === exp.id ? "Stopping..." : "Stop"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Variant Stats + 95% Confidence Intervals */}
                {exp.variant_stats?.length > 0 && (
                  <View style={styles.variantsWrap}>
                    {exp.variant_stats.map((vs) => (
                      <View key={vs.variant} style={styles.variantBox}>
                        <Text style={styles.variantName}>{vs.variant.toUpperCase()}</Text>
                        <Text style={styles.variantLine}>
                          Exposures: {vs.exposures} • Opens: {vs.opens} • Clicks: {vs.clicks} • Conv:{" "}
                          {vs.conversions} • Opt-outs: {vs.opt_outs}
                        </Text>
                        <Text style={styles.variantCi}>
                          Conv Rate: {(vs.conversion_rate * 100).toFixed(2)}% (95% CI:{" "}
                          {(vs.ci_95_lower * 100).toFixed(2)}% – {(vs.ci_95_upper * 100).toFixed(2)}%) •
                          Rev: ৳{((vs.revenue_paisa || 0) / 100).toLocaleString()}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Bounded Weight Learning Recommendations */}
                {weightProposals.length > 0 && (
                  <View style={styles.proposalBox}>
                    <MaterialCommunityIcons name="scale-balance" size={14} color="#0369a1" />
                    <Text style={styles.proposalText}>
                      Bounded Weight Learning Proposal (Requires Admin Review in Rules Tab):{" "}
                      {weightProposals
                        .map(([k, delta]) => `${k}: ${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`)
                        .join(" • ")}
                    </Text>
                  </View>
                )}
              </View>
            );
          })
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
  windowRow: { flexDirection: "row", gap: 6 },
  winPill: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  winPillActive: { backgroundColor: "#0284c7" },
  winPillText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  winPillTextActive: { color: "#ffffff" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  tiersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tierCard: {
    flex: 1,
    minWidth: 230,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  tierTitle: { fontSize: 12, fontWeight: "800" },
  tierStat: { fontSize: 11, color: "#475569" },
  tierMetricsRow: { flexDirection: "row", gap: 8 },
  miniStat: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  miniLabel: { fontSize: 10, color: "#64748b", fontWeight: "600" },
  miniVal: { fontSize: 15, fontWeight: "800", color: "#0f172a", marginTop: 2 },
  tierFoot: { fontSize: 11, color: "#64748b" },
  splitGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  kvKey: { fontSize: 12, fontWeight: "700", color: "#1e293b" },
  kvVal: { fontSize: 11, color: "#475569", flex: 1, textAlign: "right" },
  kvCount: { fontSize: 12, fontWeight: "800", color: "#0284c7" },
  expHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    flexWrap: "wrap",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#0284c7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createBtnText: { fontSize: 12, fontWeight: "700", color: "#ffffff" },
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
  createExpBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  fieldsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  colField: { flex: 1, minWidth: 140 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: "#0f172a",
  },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipActive: { backgroundColor: "#0284c7", borderColor: "#0284c7" },
  chipText: { fontSize: 11, fontWeight: "600", color: "#475569" },
  chipTextActive: { color: "#ffffff" },
  saveBtn: {
    backgroundColor: "#059669",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 13, fontWeight: "700", color: "#ffffff" },
  expCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  expCardHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  expName: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  expHyp: { fontSize: 12, color: "#475569", marginTop: 2 },
  expMeta: { fontSize: 11, color: "#64748b", marginTop: 3 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },
  stopBtn: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  stopBtnText: { fontSize: 11, fontWeight: "700", color: "#dc2626" },
  variantsWrap: { gap: 6 },
  variantBox: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 9,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 2,
  },
  variantName: { fontSize: 11, fontWeight: "800", color: "#0284c7" },
  variantLine: { fontSize: 11, color: "#334155" },
  variantCi: { fontSize: 11, fontWeight: "600", color: "#0f172a" },
  proposalBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f0f9ff",
    borderRadius: 8,
    padding: 9,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  proposalText: { fontSize: 11, color: "#0369a1", flex: 1, fontWeight: "600" },
});
