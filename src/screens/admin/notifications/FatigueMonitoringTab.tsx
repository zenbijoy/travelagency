/**
 * Fatigue Monitoring & Cap Controls Tab — Admin Personalization Command Center (Tab 6)
 * Displays live fatigue metrics, users exceeding caps, per-category engagement & suppression
 * breakdown, high-fatigue user-category records, and interactive cap/cooldown controls.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons, Ionicons, Feather } from "@expo/vector-icons";
import {
  personalizationService,
  formatPersonalizationError,
  FatigueOverviewResponse,
} from "../../../services/personalizationService";
import { LoadingState } from "../../../components/ui/LoadingState";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorStateCard } from "../../../components/common/ErrorStateCard";

export const FatigueMonitoringTab: React.FC = () => {
  const [fatigue, setFatigue] = useState<FatigueOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Editable Cap Controls
  const [dailyCap, setDailyCap] = useState("3");
  const [threshold, setThreshold] = useState("65");
  const [cooldownHours, setCooldownHours] = useState("24");
  const [preferDigest, setPreferDigest] = useState(true);
  const [changeNotes, setChangeNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const loadFatigue = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await personalizationService.getFatigueOverview();
      setFatigue(data);
      setDailyCap(String(data.global_daily_marketing_cap ?? 3));
      setThreshold(String(data.high_fatigue_threshold ?? 65));
      setCooldownHours(String(data.cooldown_hours ?? 24));
    } catch (err) {
      setErrorMsg(formatPersonalizationError(err).message);
      setFatigue(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFatigue();
  }, [loadFatigue]);

  const handleSaveControls = async () => {
    setSaveMsg(null);
    setSaveErr(null);
    const capNum = parseInt(dailyCap, 10);
    const threshNum = parseFloat(threshold);
    const cooldownNum = parseInt(cooldownHours, 10);

    if (!Number.isFinite(capNum) || capNum < 0 || capNum > 50) {
      setSaveErr("Global daily marketing cap must be between 0 and 50.");
      return;
    }
    if (!Number.isFinite(threshNum) || threshNum < 20 || threshNum > 100) {
      setSaveErr("High fatigue threshold must be between 20 and 100.");
      return;
    }
    if (!Number.isFinite(cooldownNum) || cooldownNum < 1 || cooldownNum > 168) {
      setSaveErr("Cooldown hours must be between 1 and 168.");
      return;
    }

    try {
      setSaving(true);
      const updated = await personalizationService.updateFatigueControls({
        global_daily_marketing_cap: capNum,
        high_fatigue_threshold: threshNum,
        cooldown_hours: cooldownNum,
        prefer_digest_on_high_fatigue: preferDigest,
        change_notes: changeNotes.trim() || "Updated fatigue & frequency caps",
      });
      setFatigue(updated);
      setSaveMsg("Saved live frequency cap and fatigue threshold controls.");
      setChangeNotes("");
    } catch (err) {
      setSaveErr(formatPersonalizationError(err).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState variant="skeleton" skeletonType="card" count={3} />;
  }

  if (errorMsg || !fatigue) {
    return (
      <ErrorStateCard
        title="Fatigue Monitoring Unavailable"
        message={errorMsg || "Failed to load notification fatigue metrics."}
        onRetry={loadFatigue}
      />
    );
  }

  const categoryRows = Object.entries(fatigue.category_breakdown || {});

  return (
    <View style={styles.container}>
      {/* Critical Non-Suppression Guarantee */}
      <View style={styles.guardBanner}>
        <Feather name="shield" size={16} color="#065f46" />
        <Text style={styles.guardText}>
          Critical Safeguard Active: Transactional bookings, payments, refunds, tickets, security alerts, and verified trip disruptions bypass fatigue caps and are never suppressed.
        </Text>
      </View>

      {/* Top KPI Cards */}
      <View style={styles.kpiGrid}>
        <View style={[styles.kpiCard, { borderLeftColor: "#ef4444" }]}>
          <Text style={styles.kpiLabel}>High-Fatigue Users</Text>
          <Text style={styles.kpiValue}>{fatigue.high_fatigue_users_count}</Text>
          <Text style={styles.kpiSub}>Score &gt;= {fatigue.high_fatigue_threshold}</Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: "#f59e0b" }]}>
          <Text style={styles.kpiLabel}>Users Exceeding Caps</Text>
          <Text style={styles.kpiValue}>{fatigue.users_exceeding_caps_count}</Text>
          <Text style={styles.kpiSub}>Daily cap: {fatigue.global_daily_marketing_cap}/day</Text>
        </View>

        <View style={[styles.kpiCard, { borderLeftColor: "#0284c7" }]}>
          <Text style={styles.kpiLabel}>Avg Fatigue Score</Text>
          <Text style={styles.kpiValue}>{fatigue.avg_fatigue_score.toFixed(1)}</Text>
          <Text style={styles.kpiSub}>0–100 scale (cooldown {fatigue.cooldown_hours}h)</Text>
        </View>
      </View>

      {/* Live Controls to Adjust Caps */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Live Frequency Cap & Cooldown Controls</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadFatigue}>
            <Ionicons name="refresh" size={15} color="#0284c7" />
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {saveMsg && (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>{saveMsg}</Text>
          </View>
        )}
        {saveErr && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{saveErr}</Text>
          </View>
        )}

        <View style={styles.controlsGrid}>
          <View style={styles.controlField}>
            <Text style={styles.fieldLabel}>GLOBAL DAILY MARKETING CAP</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() =>
                  setDailyCap(String(Math.max(0, (parseInt(dailyCap, 10) || 0) - 1)))
                }
              >
                <Text style={styles.stepBtnText}>-</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.stepInput}
                keyboardType="number-pad"
                value={dailyCap}
                onChangeText={setDailyCap}
              />
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() =>
                  setDailyCap(String(Math.min(50, (parseInt(dailyCap, 10) || 0) + 1)))
                }
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.controlField}>
            <Text style={styles.fieldLabel}>HIGH FATIGUE THRESHOLD (20–100)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="decimal-pad"
              value={threshold}
              onChangeText={setThreshold}
            />
          </View>

          <View style={styles.controlField}>
            <Text style={styles.fieldLabel}>COOLDOWN HOURS (1–168)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="number-pad"
              value={cooldownHours}
              onChangeText={setCooldownHours}
            />
          </View>
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Prefer Digest When Fatigue Is High</Text>
            <Text style={styles.switchSub}>
              Routes low-priority promotions into daily/weekly digest instead of immediate push.
            </Text>
          </View>
          <Switch value={preferDigest} onValueChange={setPreferDigest} />
        </View>

        <TextInput
          style={styles.textInput}
          placeholder="Audit reason for cap adjustment..."
          value={changeNotes}
          onChangeText={setChangeNotes}
          placeholderTextColor="#94a3b8"
        />

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSaveControls}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <MaterialCommunityIcons name="tune" size={16} color="#ffffff" />
              <Text style={styles.saveBtnText}>Update Live Fatigue & Cap Controls</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Category Engagement & Suppression Breakdown */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Category Engagement & Fatigue Breakdown</Text>
        {categoryRows.length === 0 ? (
          <EmptyState
            compact
            title="No Category Telemetry Yet"
            description="Category engagement breakdown populates once notifications are tracked."
          />
        ) : (
          <View style={styles.catGrid}>
            {categoryRows.map(([cat, metrics]) => (
              <View key={cat} style={styles.catCard}>
                <Text style={styles.catName}>{cat.toUpperCase()}</Text>
                <Text style={styles.catMeta}>
                  {Object.entries(metrics || {})
                    .map(([k, v]) => `${k}: ${typeof v === "number" ? Number(v).toFixed(1).replace(/\.0$/, "") : String(v)}`)
                    .join(" • ")}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* High Fatigue User-Category Entries */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>High-Fatigue & Capped Entries</Text>
        {fatigue.high_fatigue_entries.length === 0 ? (
          <EmptyState
            compact
            title="No High-Fatigue Alerts"
            description="Zero user-category pairs are currently above the fatigue threshold."
          />
        ) : (
          <View style={{ gap: 8 }}>
            {fatigue.high_fatigue_entries.map((entry, idx) => {
              const scoreColor =
                entry.fatigue_score >= 75
                  ? "#dc2626"
                  : entry.fatigue_score >= 50
                  ? "#f59e0b"
                  : "#0284c7";
              return (
                <View key={`${entry.user_id}-${entry.category}-${idx}`} style={styles.entryRow}>
                  <View style={styles.entryHeader}>
                    <Text style={styles.entryTitle}>
                      User {entry.user_id.slice(0, 8)}… • {entry.category}
                    </Text>
                    <Text style={[styles.entryScore, { color: scoreColor }]}>
                      Fatigue {entry.fatigue_score.toFixed(1)}
                    </Text>
                  </View>
                  <Text style={styles.entryStats}>
                    24h: {entry.received_24h} • 7d Recv: {entry.received_7d} • Opened:{" "}
                    {entry.opened_7d} • Clicked: {entry.clicked_7d} • Dismissed:{" "}
                    {entry.dismissed_7d} • Ignored: {entry.ignored_7d} • Opt-outs:{" "}
                    {entry.opt_out_count}
                  </Text>
                  {entry.cooldown_until && (
                    <Text style={styles.cooldownText}>
                      Cooldown until: {new Date(entry.cooldown_until).toLocaleString()}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 14, paddingBottom: 32 },
  guardBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  guardText: { flex: 1, fontSize: 12, color: "#065f46", lineHeight: 17 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpiCard: {
    flex: 1,
    minWidth: 165,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderLeftWidth: 4,
  },
  kpiLabel: { fontSize: 11, fontWeight: "700", color: "#64748b", textTransform: "uppercase" },
  kpiValue: { fontSize: 22, fontWeight: "800", color: "#0f172a", marginTop: 4 },
  kpiSub: { fontSize: 11, color: "#64748b", marginTop: 3 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshBtnText: { fontSize: 12, fontWeight: "600", color: "#0284c7" },
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
  controlsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  controlField: { flex: 1, minWidth: 150 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: {
    width: 34,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  stepInput: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingVertical: 7,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  textInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#0f172a",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  switchTitle: { fontSize: 13, fontWeight: "600", color: "#0f172a" },
  switchSub: { fontSize: 11, color: "#64748b", marginTop: 2 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#0284c7",
    paddingVertical: 11,
    borderRadius: 8,
  },
  saveBtnText: { fontSize: 13, fontWeight: "700", color: "#ffffff" },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catCard: {
    flex: 1,
    minWidth: 210,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 4,
  },
  catName: { fontSize: 12, fontWeight: "700", color: "#0f172a" },
  catMeta: { fontSize: 11, color: "#475569", lineHeight: 16 },
  entryRow: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 4,
  },
  entryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  entryTitle: { fontSize: 12, fontWeight: "700", color: "#0f172a" },
  entryScore: { fontSize: 12, fontWeight: "800" },
  entryStats: { fontSize: 11, color: "#475569" },
  cooldownText: { fontSize: 11, color: "#b45309", fontWeight: "600" },
});
