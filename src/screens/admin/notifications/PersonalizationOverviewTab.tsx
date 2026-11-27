/**
 * Personalization Overview Tab — Admin Personalization Command Center (Tab 1)
 * Displays live 20D profile coverage, AI-assisted decision telemetry,
 * relevance & confidence averages, suppression rate, fatigue distribution,
 * 30-day revenue attribution, and Automations A-J dry-run evaluation.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import {
  personalizationService,
  formatPersonalizationError,
  PersonalizationOverviewResponse,
  AutomationEvaluateResponse,
  AutomationKey,
} from "../../../services/personalizationService";
import { LoadingState } from "../../../components/ui/LoadingState";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorStateCard } from "../../../components/common/ErrorStateCard";

const AUTOMATION_CATALOG: ReadonlyArray<{
  key: AutomationKey;
  label: string;
  desc: string;
}> = [
  { key: "A", label: "Destination Discovery", desc: "Matches style, budget & season" },
  { key: "B", label: "Smart Price Alert", desc: "Verified drop & availability" },
  { key: "C", label: "Abandoned Search", desc: "High-intent search without booking" },
  { key: "D", label: "Trip Preparation", desc: "Departure, PNR & check-in prep" },
  { key: "E", label: "Returning Traveler", desc: "Post-trip review & next ideas" },
  { key: "F", label: "Inactive Reactivation", desc: "Relevant reactivation, never spam" },
  { key: "G", label: "Weather Personalization", desc: "Verified destination conditions" },
  { key: "H", label: "Hotel Personalization", desc: "Budget, amenities & stay style" },
  { key: "I", label: "Transport Personalization", desc: "Preferred mode & route match" },
  { key: "J", label: "Personalized Digest", desc: "Daily/weekly curated bundle" },
];

export interface PersonalizationOverviewTabProps {
  onNavigateTab?: (
    tab:
      | "profiles"
      | "rules"
      | "lab"
      | "segments"
      | "fatigue"
      | "analytics"
      | "dlq"
      | "live_ops"
      | "events"
      | "templates"
      | "delivery_logs"
      | "providers"
  ) => void;
}

export const PersonalizationOverviewTab: React.FC<PersonalizationOverviewTabProps> = ({
  onNavigateTab,
}) => {
  const [overview, setOverview] = useState<PersonalizationOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [selectedAutomation, setSelectedAutomation] = useState<AutomationKey>("A");
  const [evaluatingAuto, setEvaluatingAuto] = useState(false);
  const [autoResult, setAutoResult] = useState<AutomationEvaluateResponse | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [windowFilter, setWindowFilter] = useState<"24h" | "7d" | "30d">("24h");
  const [channelFilter, setChannelFilter] = useState<"all" | "push" | "in_app" | "email" | "sms">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "booking" | "price_alerts" | "flight_alerts" | "marketing">("all");

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await personalizationService.getAdminOverview();
      setOverview(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      const parsed = formatPersonalizationError(err);
      setErrorMsg(parsed.message);
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleEvaluateAutomation = async (dryRun: boolean) => {
    try {
      setEvaluatingAuto(true);
      setAutoError(null);
      const res = await personalizationService.evaluateAutomation(selectedAutomation, {
        limit: 25,
        dry_run: dryRun,
      });
      setAutoResult(res);
    } catch (err) {
      setAutoError(formatPersonalizationError(err).message);
      setAutoResult(null);
    } finally {
      setEvaluatingAuto(false);
    }
  };

  if (loading) {
    return <LoadingState variant="skeleton" skeletonType="card" count={3} />;
  }

  if (errorMsg || !overview) {
    return (
      <ErrorStateCard
        title="Personalization Overview Unavailable"
        message={
          errorMsg ||
          "Could not reach the personalization telemetry API. Ensure the FastAPI backend is running and you hold an admin session."
        }
        onRetry={loadOverview}
      />
    );
  }

  const totalProfiles = overview.total_profiles;
  const sufficientPct =
    totalProfiles > 0
      ? Math.round((overview.profiles_sufficient_data / totalProfiles) * 100)
      : 0;
  const enabledPct =
    totalProfiles > 0
      ? Math.round((overview.personalization_enabled_count / totalProfiles) * 100)
      : 0;
  const aiRatioPct =
    overview.total_decisions_24h > 0
      ? Math.round((overview.ai_assisted_count_24h / overview.total_decisions_24h) * 100)
      : 0;

  const fatigueEntries = Object.entries(overview.fatigue_distribution || {});
  const fatigueTotal = fatigueEntries.reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
  const attributedRevenueBdt = (overview.attributed_revenue_paisa_30d || 0) / 100;

  return (
    <View style={styles.container}>
      {/* Header Banner */}
      <View style={styles.headerCard}>
        <View style={{ flex: 1 }}>
          <View style={styles.headerTitleRow}>
            <MaterialCommunityIcons name="brain" size={20} color="#0284c7" />
            <Text style={styles.headerTitle}>Personalization Intelligence Overview</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            Live backend telemetry • Active Rules v{overview.active_rule_version}
            {lastUpdated ? ` • Synced ${lastUpdated}` : ""}
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadOverview}>
          <Ionicons name="refresh" size={16} color="#0284c7" />
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Overview Filters & Quick Module Jump */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Overview Telemetry Filters</Text>
        <View style={styles.filterGroupRow}>
          {(["24h", "7d", "30d"] as const).map((w) => (
            <TouchableOpacity
              key={w}
              style={[styles.filterChip, windowFilter === w && styles.filterChipActive]}
              onPress={() => setWindowFilter(w)}
            >
              <Text style={[styles.filterChipText, windowFilter === w && styles.filterChipTextActive]}>
                {w.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
          {(["all", "push", "in_app", "email", "sms"] as const).map((ch) => (
            <TouchableOpacity
              key={ch}
              style={[styles.filterChip, channelFilter === ch && styles.filterChipActive]}
              onPress={() => setChannelFilter(ch)}
            >
              <Text style={[styles.filterChipText, channelFilter === ch && styles.filterChipTextActive]}>
                {ch === "all" ? "All Channels" : ch.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
          {(["all", "booking", "price_alerts", "flight_alerts", "marketing"] as const).map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.filterChip, categoryFilter === cat && styles.filterChipActive]}
              onPress={() => setCategoryFilter(cat)}
            >
              <Text style={[styles.filterChipText, categoryFilter === cat && styles.filterChipTextActive]}>
                {cat === "all" ? "All Categories" : cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {onNavigateTab && (
          <View style={styles.filterGroupRow}>
            {(
              [
                { id: "live_ops", label: "Live Ops" },
                { id: "events", label: "Event Catalog" },
                { id: "templates", label: "Templates" },
                { id: "delivery_logs", label: "Delivery Logs" },
                { id: "providers", label: "Provider Health" },
              ] as const
            ).map((nav) => (
              <TouchableOpacity
                key={nav.id}
                style={styles.quickNavPill}
                onPress={() => onNavigateTab(nav.id)}
              >
                <Text style={styles.quickNavPillText}>{nav.label} →</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Primary KPI Grid */}
      <View style={styles.kpiGrid}>
        <View style={[styles.kpiCard, { borderLeftColor: "#0284c7" }]}>
          <Text style={styles.kpiLabel}>Profiles (Sufficient vs Incomplete)</Text>
          <Text style={styles.kpiValue}>
            {overview.profiles_sufficient_data} / {overview.total_profiles}
          </Text>
          <Text style={styles.kpiSubtext}>
            {sufficientPct}% sufficient • {overview.profiles_incomplete_data} incomplete
          </Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: "#10b981" }]}>
          <Text style={styles.kpiLabel}>Active Personalization</Text>
          <Text style={styles.kpiValue}>{overview.personalization_enabled_count}</Text>
          <Text style={styles.kpiSubtext}>{enabledPct}% of traveler profiles opted in</Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: "#6366f1" }]}>
          <Text style={styles.kpiLabel}>AI-Assisted (24h)</Text>
          <Text style={styles.kpiValue}>{overview.ai_assisted_count_24h}</Text>
          <Text style={styles.kpiSubtext}>
            {aiRatioPct}% of {overview.total_decisions_24h} pipeline decisions
          </Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: "#0ea5e9" }]}>
          <Text style={styles.kpiLabel}>Avg Relevance / Confidence</Text>
          <Text style={styles.kpiValue}>
            {overview.avg_relevance_score.toFixed(1)} / {overview.avg_confidence_score.toFixed(1)}
          </Text>
          <Text style={styles.kpiSubtext}>0–100 separate scoring scales</Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: "#f59e0b" }]}>
          <Text style={styles.kpiLabel}>Suppression Rate</Text>
          <Text style={styles.kpiValue}>{overview.suppression_rate_pct.toFixed(1)}%</Text>
          <Text style={styles.kpiSubtext}>Fatigue, caps, consent & low-relevance guards</Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: "#059669" }]}>
          <Text style={styles.kpiLabel}>30d Conversions & Attribution</Text>
          <Text style={styles.kpiValue}>৳{attributedRevenueBdt.toLocaleString()}</Text>
          <Text style={styles.kpiSubtext}>
            {overview.conversion_count_30d} attributed bookings (30d)
          </Text>
        </View>
      </View>

      {/* Profile Data Sufficiency Bar */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Profile Data Sufficiency Split</Text>
          {onNavigateTab && (
            <TouchableOpacity onPress={() => onNavigateTab("profiles")}>
              <Text style={styles.linkText}>Explore 20 Dimensions →</Text>
            </TouchableOpacity>
          )}
        </View>
        {totalProfiles === 0 ? (
          <EmptyState
            compact
            title="No Profiles Recorded Yet"
            description="Profiles appear as travelers set preferences or generate behavioral signals."
          />
        ) : (
          <View>
            <View style={styles.stackedBarTrack}>
              <View
                style={[
                  styles.stackedBarFill,
                  { width: `${sufficientPct}%`, backgroundColor: "#10b981" },
                ]}
              />
              <View
                style={[
                  styles.stackedBarFill,
                  { width: `${100 - sufficientPct}%`, backgroundColor: "#cbd5e1" },
                ]}
              />
            </View>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#10b981" }]} />
                <Text style={styles.legendLabel}>
                  Sufficient ({overview.profiles_sufficient_data})
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#cbd5e1" }]} />
                <Text style={styles.legendLabel}>
                  Incomplete / Sparse ({overview.profiles_incomplete_data})
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Fatigue Score Distribution */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Fatigue Score Distribution</Text>
          {onNavigateTab && (
            <TouchableOpacity onPress={() => onNavigateTab("fatigue")}>
              <Text style={styles.linkText}>Manage Caps & Cooldowns →</Text>
            </TouchableOpacity>
          )}
        </View>
        {fatigueEntries.length === 0 ? (
          <EmptyState
            compact
            title="No Fatigue Buckets Available"
            description="Fatigue distribution populates once notifications are evaluated."
          />
        ) : (
          <View style={{ gap: 10 }}>
            {fatigueEntries.map(([bucket, count]) => {
              const numCount = Number(count) || 0;
              const pct = fatigueTotal > 0 ? Math.round((numCount / fatigueTotal) * 100) : 0;
              const lower = bucket.toLowerCase();
              const barColor =
                lower.includes("high") || lower.includes("critical")
                  ? "#ef4444"
                  : lower.includes("med") || lower.includes("mod")
                  ? "#f59e0b"
                  : "#10b981";
              return (
                <View key={bucket}>
                  <View style={styles.barHeaderRow}>
                    <Text style={styles.barLabel}>{bucket.toUpperCase()}</Text>
                    <Text style={styles.barValue}>
                      {numCount} ({pct}%)
                    </Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.min(pct, 100)}%`, backgroundColor: barColor },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* 10 Travel Automations Evaluator (A–J) */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>10 Travel Automations Engine (A–J)</Text>
        <Text style={styles.sectionDesc}>
          Evaluate dynamic personalized travel triggers (dry-run preview or stage eligible candidates to outbox).
        </Text>

        <View style={styles.autoChipsWrap}>
          {AUTOMATION_CATALOG.map((item) => {
            const active = selectedAutomation === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.autoChip, active && styles.autoChipActive]}
                onPress={() => setSelectedAutomation(item.key)}
              >
                <Text style={[styles.autoChipKey, active && styles.autoChipTextActive]}>
                  {item.key}
                </Text>
                <Text style={[styles.autoChipLabel, active && styles.autoChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.autoActionsRow}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => handleEvaluateAutomation(true)}
            disabled={evaluatingAuto}
          >
            {evaluatingAuto ? (
              <ActivityIndicator size="small" color="#0284c7" />
            ) : (
              <>
                <Ionicons name="flask-outline" size={16} color="#0284c7" />
                <Text style={styles.secondaryBtnText}>
                  Dry-Run Automation {selectedAutomation}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {autoError && (
          <View style={styles.inlineErrorBox}>
            <Text style={styles.inlineErrorText}>{autoError}</Text>
          </View>
        )}

        {autoResult && (
          <View style={styles.autoResultBox}>
            <Text style={styles.autoResultTitle}>
              Automation {autoResult.automation_key} •{" "}
              {autoResult.dry_run ? "DRY RUN (NOT SENT)" : "STAGED"}
            </Text>
            <Text style={styles.autoResultMeta}>
              Evaluated: {autoResult.evaluated_users} • Candidates: {autoResult.candidates_generated} • Staged:{" "}
              {autoResult.staged_to_outbox}
            </Text>
            {autoResult.candidates.slice(0, 6).map((c, idx) => (
              <View key={`${c.user_id}-${idx}`} style={styles.candidateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.candidateTitle} numberOfLines={1}>
                    {c.title}
                  </Text>
                  <Text style={styles.candidateSub}>
                    {c.destination || c.event_type} • Rel: {c.relevance_score ?? "—"} • Conf:{" "}
                    {c.confidence_score ?? "—"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: c.eligible ? "#dcfce7" : "#fee2e2" },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: c.eligible ? "#166534" : "#991b1b" },
                    ]}
                  >
                    {c.eligible ? "ELIGIBLE" : c.suppression_reason || "SUPPRESSED"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 16, paddingBottom: 32 },
  headerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  headerSubtitle: { fontSize: 12, color: "#64748b", marginTop: 4 },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshBtnText: { fontSize: 12, fontWeight: "600", color: "#0284c7" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpiCard: {
    flex: 1,
    minWidth: 185,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderLeftWidth: 4,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  kpiValue: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
  kpiSubtext: { fontSize: 11, color: "#64748b", marginTop: 4 },
  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  sectionDesc: { fontSize: 12, color: "#64748b", lineHeight: 17 },
  linkText: { fontSize: 12, fontWeight: "600", color: "#0284c7" },
  stackedBarTrack: {
    height: 12,
    borderRadius: 6,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
  },
  stackedBarFill: { height: "100%" },
  legendRow: { flexDirection: "row", gap: 16, marginTop: 8, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 12, color: "#475569", fontWeight: "500" },
  barHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  barLabel: { fontSize: 11, fontWeight: "700", color: "#334155" },
  barValue: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  barTrack: {
    height: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 4 },
  autoChipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  autoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  autoChipActive: { backgroundColor: "#0284c7", borderColor: "#0284c7" },
  autoChipKey: { fontSize: 11, fontWeight: "800", color: "#0284c7" },
  autoChipLabel: { fontSize: 11, fontWeight: "600", color: "#334155" },
  autoChipTextActive: { color: "#ffffff" },
  autoActionsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  secondaryBtnText: { fontSize: 12, fontWeight: "700", color: "#0284c7" },
  inlineErrorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  inlineErrorText: { fontSize: 12, color: "#991b1b" },
  autoResultBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  autoResultTitle: { fontSize: 12, fontWeight: "700", color: "#0f172a" },
  autoResultMeta: { fontSize: 11, color: "#475569" },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  candidateTitle: { fontSize: 12, fontWeight: "600", color: "#0f172a" },
  candidateSub: { fontSize: 11, color: "#64748b", marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: 10, fontWeight: "700" },
  filterGroupRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filterChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  filterChipActive: { backgroundColor: "#0284c7", borderColor: "#0284c7" },
  filterChipText: { fontSize: 11, fontWeight: "600", color: "#475569" },
  filterChipTextActive: { color: "#ffffff" },
  quickNavPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  quickNavPillText: { fontSize: 11, fontWeight: "700", color: "#0369a1" },
});
