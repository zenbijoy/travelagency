/**
 * Segment Builder Tab — Admin Personalization Command Center (Tab 5)
 * Dynamic server-side query-based segment explorer & builder:
 * - Lists server segments (including all 14 built-in presets)
 * - Custom rule builder with structured multi-dimension query criteria
 * - Live member count evaluation & paginated member inspection
 * - 1-click handoff to target a segment in Personalized Campaign Dispatch
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import {
  personalizationService,
  formatPersonalizationError,
  BUILTIN_SEGMENTS_META,
  SegmentResponse,
  SegmentMembersResponse,
} from "../../../services/personalizationService";
import { LoadingState } from "../../../components/ui/LoadingState";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorStateCard } from "../../../components/common/ErrorStateCard";

const TRAVEL_STYLES = [
  "family",
  "adventure",
  "couple",
  "solo",
  "friends",
  "business",
  "relaxation",
  "cultural",
] as const;

const BUDGET_TIERS = ["budget", "economy", "mid_range", "premium", "luxury"] as const;
const TRANSPORTS = ["flight", "train", "bus", "launch", "private_vehicle"] as const;
const TIMELINE_STAGES = [
  "searching_for_trip",
  "comparing_options",
  "booked",
  "preparing_for_departure",
  "post_trip",
] as const;
const ACTIVITY_LEVELS = ["new_user", "active", "highly_active", "inactive", "dormant"] as const;

export interface SegmentBuilderTabProps {
  onTargetSegmentInCompose?: (segmentKey: string) => void;
}

export const SegmentBuilderTab: React.FC<SegmentBuilderTabProps> = ({
  onTargetSegmentInCompose,
}) => {
  const [segments, setSegments] = useState<SegmentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live Member Inspection
  const [evaluatingKey, setEvaluatingKey] = useState<string | null>(null);
  const [membersResult, setMembersResult] = useState<SegmentMembersResponse | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);

  // Custom Segment Builder State
  const [showBuilder, setShowBuilder] = useState(false);
  const [segKey, setSegKey] = useState("");
  const [segName, setSegName] = useState("");
  const [segDesc, setSegDesc] = useState("");
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedBudgets, setSelectedBudgets] = useState<string[]>([]);
  const [selectedTransports, setSelectedTransports] = useState<string[]>([]);
  const [selectedTimelines, setSelectedTimelines] = useState<string[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [destFilter, setDestFilter] = useState("");
  const [minDestScore, setMinDestScore] = useState("35");
  const [minConfidence, setMinConfidence] = useState("");
  const [priceSensitivity, setPriceSensitivity] = useState<"" | "low" | "medium" | "high">("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const loadSegments = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const list = await personalizationService.listSegments();
      setSegments(list);
    } catch (err) {
      setErrorMsg(formatPersonalizationError(err).message);
      setSegments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  const handleEvaluateSegment = async (seg: SegmentResponse) => {
    const identifier = seg.id || seg.key;
    try {
      setEvaluatingKey(seg.key);
      setMembersError(null);
      const res = await personalizationService.getSegmentMembers(identifier, 1, 20);
      setMembersResult(res);
      // Sync updated live count into local list
      setSegments((prev) =>
        prev.map((item) =>
          item.key === seg.key ? { ...item, cached_member_count: res.total } : item
        )
      );
    } catch (err) {
      setMembersError(formatPersonalizationError(err).message);
      setMembersResult(null);
    } finally {
      setEvaluatingKey(null);
    }
  };

  const toggleVal = (
    list: string[],
    val: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter(list.includes(val) ? list.filter((v) => v !== val) : [...list, val]);
  };

  const buildCriteria = (): Record<string, unknown> => {
    const criteria: Record<string, unknown> = {};
    if (selectedStyles.length > 0) criteria.travel_styles_any = selectedStyles;
    if (selectedBudgets.length > 0) criteria.budget_tiers_any = selectedBudgets;
    if (selectedTransports.length > 0) criteria.transport_modes_any = selectedTransports;
    if (selectedTimelines.length > 0) criteria.travel_timeline_stages_any = selectedTimelines;
    if (selectedActivities.length > 0) criteria.activity_levels_any = selectedActivities;
    if (destFilter.trim()) {
      criteria.destinations_any = destFilter
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const scoreNum = parseFloat(minDestScore);
      if (Number.isFinite(scoreNum)) criteria.min_interest_score = scoreNum;
    }
    if (minConfidence.trim()) {
      const confNum = parseFloat(minConfidence);
      if (Number.isFinite(confNum)) criteria.min_confidence = confNum;
    }
    if (priceSensitivity) criteria.price_sensitivity_any = [priceSensitivity];
    return criteria;
  };

  const applyPresetToBuilder = (presetKey: string) => {
    const meta = BUILTIN_SEGMENTS_META.find((m) => m.key === presetKey);
    if (!meta) return;
    setShowBuilder(true);
    setSegKey(`${meta.key}_custom`);
    setSegName(`${meta.name} (Custom)`);
    setSegDesc(meta.description);
    const c = meta.defaultCriteria as Record<string, any>;
    setSelectedStyles(
      Array.isArray(c.travel_styles_any)
        ? c.travel_styles_any
        : Array.isArray(c.travel_styles)
        ? c.travel_styles
        : []
    );
    setSelectedBudgets(
      Array.isArray(c.budget_tiers_any)
        ? c.budget_tiers_any
        : Array.isArray(c.budget_tiers)
        ? c.budget_tiers
        : []
    );
    setSelectedTransports(
      Array.isArray(c.transport_modes_any)
        ? c.transport_modes_any
        : Array.isArray(c.preferred_transport)
        ? c.preferred_transport
        : []
    );
    setSelectedTimelines(
      Array.isArray(c.travel_timeline_stages_any)
        ? c.travel_timeline_stages_any
        : Array.isArray(c.timeline_stages)
        ? c.timeline_stages
        : []
    );
    setSelectedActivities(
      Array.isArray(c.activity_levels_any)
        ? c.activity_levels_any
        : Array.isArray(c.activity_levels)
        ? c.activity_levels
        : []
    );
    if (Array.isArray(c.destinations_any)) {
      setDestFilter(c.destinations_any.join(", "));
    } else if (typeof c.destination === "string") {
      setDestFilter(c.destination);
    } else {
      setDestFilter("");
    }
    setMinDestScore(
      c.min_interest_score !== undefined
        ? String(c.min_interest_score)
        : c.min_destination_score !== undefined
        ? String(c.min_destination_score)
        : "35"
    );
    const ps = Array.isArray(c.price_sensitivity_any)
      ? c.price_sensitivity_any[0]
      : c.price_sensitivity;
    setPriceSensitivity(ps === "low" || ps === "medium" || ps === "high" ? ps : "");
  };

  const handleCreateSegment = async () => {
    setCreateError(null);
    setCreateSuccess(null);
    const normalizedKey = segKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (normalizedKey.length < 2 || segName.trim().length < 2) {
      setCreateError("Segment key (a-z, 0-9, _) and display name are required.");
      return;
    }
    const query_criteria = buildCriteria();
    if (Object.keys(query_criteria).length === 0) {
      setCreateError("Select at least one dynamic rule criterion.");
      return;
    }

    try {
      setCreating(true);
      const created = await personalizationService.createSegment({
        key: normalizedKey,
        name: segName.trim(),
        description: segDesc.trim() || undefined,
        query_criteria,
        is_active: true,
      });
      setCreateSuccess(
        `Segment "${created.name}" (${created.key}) created with ${created.cached_member_count} matching members.`
      );
      setSegKey("");
      setSegName("");
      setSegDesc("");
      await loadSegments();
    } catch (err) {
      setCreateError(formatPersonalizationError(err).message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <LoadingState variant="skeleton" skeletonType="list" count={4} />;
  }

  if (errorMsg) {
    return (
      <ErrorStateCard
        title="Dynamic Segment Builder Unavailable"
        message={errorMsg}
        onRetry={loadSegments}
      />
    );
  }

  const criteriaPreview = buildCriteria();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Dynamic Query-Based Segments</Text>
          <Text style={styles.headerSubtitle}>
            Server-side real-time membership evaluation across 20D profiles (no stale static lists).
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.createToggleBtn}
            onPress={() => setShowBuilder((v) => !v)}
          >
            <Ionicons name={showBuilder ? "close" : "add"} size={16} color="#ffffff" />
            <Text style={styles.createToggleText}>
              {showBuilder ? "Close Builder" : "New Segment"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshBtn} onPress={loadSegments}>
            <Ionicons name="refresh" size={16} color="#0284c7" />
          </TouchableOpacity>
        </View>
      </View>

      {createSuccess && (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={16} color="#166534" />
          <Text style={styles.successText}>{createSuccess}</Text>
        </View>
      )}

      {/* Custom Rule Builder */}
      {showBuilder && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Custom Segment Rule Builder</Text>
          <Text style={styles.hintText}>
            Quick-start from a preset template or define custom dynamic rules below:
          </Text>
          <View style={styles.chipsWrap}>
            {BUILTIN_SEGMENTS_META.slice(0, 7).map((preset) => (
              <TouchableOpacity
                key={preset.key}
                style={styles.presetPill}
                onPress={() => applyPresetToBuilder(preset.key)}
              >
                <Text style={styles.presetPillText}>{preset.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.rowFields}>
            <View style={styles.colField}>
              <Text style={styles.fieldLabel}>SEGMENT KEY (a-z0-9_)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. eid_sylhet_families"
                value={segKey}
                onChangeText={setSegKey}
                autoCapitalize="none"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={styles.colField}>
              <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Eid Sylhet Families"
                value={segName}
                onChangeText={setSegName}
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>DESCRIPTION</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Describe targeting intent..."
            value={segDesc}
            onChangeText={setSegDesc}
            placeholderTextColor="#94a3b8"
          />

          <Text style={styles.fieldLabel}>TRAVEL STYLES</Text>
          <View style={styles.chipsWrap}>
            {TRAVEL_STYLES.map((s) => {
              const active = selectedStyles.includes(s);
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleVal(selectedStyles, s, setSelectedStyles)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>BUDGET TIERS</Text>
          <View style={styles.chipsWrap}>
            {BUDGET_TIERS.map((b) => {
              const active = selectedBudgets.includes(b);
              return (
                <TouchableOpacity
                  key={b}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleVal(selectedBudgets, b, setSelectedBudgets)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{b}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>PREFERRED TRANSPORT</Text>
          <View style={styles.chipsWrap}>
            {TRANSPORTS.map((t) => {
              const active = selectedTransports.includes(t);
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleVal(selectedTransports, t, setSelectedTransports)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>TRAVEL TIMELINE STAGE</Text>
          <View style={styles.chipsWrap}>
            {TIMELINE_STAGES.map((st) => {
              const active = selectedTimelines.includes(st);
              return (
                <TouchableOpacity
                  key={st}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleVal(selectedTimelines, st, setSelectedTimelines)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{st}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>ACTIVITY LIFECYCLE</Text>
          <View style={styles.chipsWrap}>
            {ACTIVITY_LEVELS.map((act) => {
              const active = selectedActivities.includes(act);
              return (
                <TouchableOpacity
                  key={act}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleVal(selectedActivities, act, setSelectedActivities)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{act}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.rowFields}>
            <View style={styles.colField}>
              <Text style={styles.fieldLabel}>DESTINATION INTEREST</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Sylhet or Cox's Bazar"
                value={destFilter}
                onChangeText={setDestFilter}
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={styles.colField}>
              <Text style={styles.fieldLabel}>MIN DEST SCORE (0-100)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="number-pad"
                value={minDestScore}
                onChangeText={setMinDestScore}
              />
            </View>
            <View style={styles.colField}>
              <Text style={styles.fieldLabel}>MIN CONFIDENCE (0-100)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="number-pad"
                placeholder="Optional"
                value={minConfidence}
                onChangeText={setMinConfidence}
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>PRICE SENSITIVITY</Text>
          <View style={styles.chipsWrap}>
            {(["", "low", "medium", "high"] as const).map((ps) => (
              <TouchableOpacity
                key={ps || "any"}
                style={[styles.chip, priceSensitivity === ps && styles.chipActive]}
                onPress={() => setPriceSensitivity(ps)}
              >
                <Text style={[styles.chipText, priceSensitivity === ps && styles.chipTextActive]}>
                  {ps ? ps.toUpperCase() : "ANY"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.queryPreviewBox}>
            <Text style={styles.fieldLabel}>DYNAMIC QUERY PAYLOAD PREVIEW</Text>
            <Text style={styles.queryPreviewCode}>{JSON.stringify(criteriaPreview, null, 2)}</Text>
          </View>

          {createError && <Text style={styles.errorInline}>{createError}</Text>}

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleCreateSegment}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={16} color="#ffffff" />
                <Text style={styles.saveBtnText}>Save & Evaluate Segment</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Live Member Evaluation Inspector */}
      {membersError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorInline}>{membersError}</Text>
        </View>
      )}
      {membersResult && (
        <View style={styles.membersCard}>
          <View style={styles.membersHeader}>
            <View>
              <Text style={styles.cardTitle}>
                Live Segment Evaluation: {membersResult.segment_key}
              </Text>
              <Text style={styles.hintText}>
                Matching Users: {membersResult.total} (showing {membersResult.members.length})
              </Text>
            </View>
            <TouchableOpacity onPress={() => setMembersResult(null)}>
              <Text style={styles.closeText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
          {membersResult.members.length === 0 ? (
            <EmptyState
              compact
              title="0 Matching Users"
              description="No current traveler profiles satisfy this dynamic segment query."
            />
          ) : (
            membersResult.members.map((m) => (
              <View key={m.user_id} style={styles.memberRow}>
                <Text style={styles.memberId}>{m.user_id.slice(0, 8)}…</Text>
                <Text style={styles.memberMeta}>
                  {m.loyalty_tier} • {m.activity_level} • {m.travel_timeline_stage} • Conf{" "}
                  {m.overall_confidence.toFixed(0)}% • {m.preferred_language.toUpperCase()}
                </Text>
              </View>
            ))
          )}
        </View>
      )}

      {/* Segment Catalog (14 Built-In Presets + Custom Segments) */}
      {segments.length === 0 ? (
        <EmptyState
          title="No Segments Found"
          description="Server returned 0 segments. Create a custom segment above or seed the 14 built-in presets."
        />
      ) : (
        <View style={styles.segmentsGrid}>
          {segments.map((seg) => (
            <View key={seg.key} style={styles.segCard}>
              <View style={styles.segHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.segName}>{seg.name}</Text>
                  <Text style={styles.segKey}>{seg.key}</Text>
                </View>
                <View
                  style={[
                    styles.typeBadge,
                    { backgroundColor: seg.is_system ? "#e0f2fe" : "#f3e8ff" },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeBadgeText,
                      { color: seg.is_system ? "#0369a1" : "#6d28d9" },
                    ]}
                  >
                    {seg.is_system ? "BUILT-IN" : "CUSTOM"}
                  </Text>
                </View>
              </View>

              {seg.description && <Text style={styles.segDesc}>{seg.description}</Text>}

              <Text style={styles.criteriaText} numberOfLines={2}>
                Query: {JSON.stringify(seg.query_criteria)}
              </Text>

              <View style={styles.segFooter}>
                <View>
                  <Text style={styles.countVal}>{seg.cached_member_count} members</Text>
                  <Text style={styles.evalTime}>
                    {seg.last_evaluated_at
                      ? `Evaluated ${new Date(seg.last_evaluated_at).toLocaleDateString()}`
                      : "Click Evaluate for live count"}
                  </Text>
                </View>
                <View style={styles.segActions}>
                  <TouchableOpacity
                    style={styles.evalBtn}
                    onPress={() => handleEvaluateSegment(seg)}
                    disabled={evaluatingKey === seg.key}
                  >
                    {evaluatingKey === seg.key ? (
                      <ActivityIndicator size="small" color="#0284c7" />
                    ) : (
                      <Text style={styles.evalBtnText}>Evaluate</Text>
                    )}
                  </TouchableOpacity>
                  {onTargetSegmentInCompose && (
                    <TouchableOpacity
                      style={styles.targetBtn}
                      onPress={() => onTargetSegmentInCompose(seg.key)}
                    >
                      <MaterialCommunityIcons name="send-outline" size={13} color="#ffffff" />
                      <Text style={styles.targetBtnText}>Target</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
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
  createToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#0284c7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createToggleText: { fontSize: 12, fontWeight: "700", color: "#ffffff" },
  refreshBtn: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    padding: 8,
    borderRadius: 8,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#86efac",
    padding: 10,
    borderRadius: 8,
  },
  successText: { fontSize: 12, fontWeight: "600", color: "#166534", flex: 1 },
  errorBanner: {
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 10,
    borderRadius: 8,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  hintText: { fontSize: 12, color: "#64748b" },
  presetPill: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  presetPillText: { fontSize: 11, fontWeight: "600", color: "#0369a1" },
  rowFields: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colField: { flex: 1, minWidth: 150 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
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
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
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
  queryPreviewBox: {
    backgroundColor: "#0f172a",
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  queryPreviewCode: { fontSize: 11, color: "#38bdf8", fontFamily: "monospace" },
  errorInline: { fontSize: 12, color: "#991b1b", fontWeight: "600" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#059669",
    paddingVertical: 11,
    borderRadius: 8,
  },
  saveBtnText: { fontSize: 13, fontWeight: "700", color: "#ffffff" },
  membersCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#0284c7",
    gap: 8,
  },
  membersHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  closeText: { fontSize: 12, fontWeight: "700", color: "#0284c7" },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  memberId: { fontSize: 11, fontWeight: "700", color: "#0f172a", fontFamily: "monospace" },
  memberMeta: { fontSize: 11, color: "#475569", flex: 1 },
  segmentsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  segCard: {
    flex: 1,
    minWidth: 270,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  segHeader: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  segName: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  segKey: { fontSize: 11, color: "#64748b", fontFamily: "monospace" },
  typeBadge: { alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: "700" },
  segDesc: { fontSize: 12, color: "#475569", lineHeight: 17 },
  criteriaText: { fontSize: 11, color: "#64748b", fontFamily: "monospace" },
  segFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#f1f5f9",
    paddingTop: 8,
    gap: 8,
  },
  countVal: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  evalTime: { fontSize: 10, color: "#94a3b8" },
  segActions: { flexDirection: "row", gap: 6 },
  evalBtn: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  evalBtnText: { fontSize: 11, fontWeight: "700", color: "#0284c7" },
  targetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0284c7",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  targetBtnText: { fontSize: 11, fontWeight: "700", color: "#ffffff" },
});
