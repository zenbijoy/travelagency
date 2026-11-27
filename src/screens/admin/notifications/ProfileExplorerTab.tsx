/**
 * Profile Explorer Tab — Admin Personalization Command Center (Tab 2)
 * Visualizes all 20 personalization dimensions (coverage, confidence, source,
 * data quality, freshness, user-provided vs inferred, opt-in permissions, and
 * aggregated value distributions) with zero sensitive raw PII exposure,
 * plus an optional single-user 20D snapshot inspector by User UUID.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons, Ionicons, Feather } from "@expo/vector-icons";
import {
  personalizationService,
  formatPersonalizationError,
  CANONICAL_DIMENSION_KEYS,
  DimensionExplorerResponse,
  DimensionExplorerItem,
  PersonalizationProfileResponse,
} from "../../../services/personalizationService";
import { LoadingState } from "../../../components/ui/LoadingState";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorStateCard } from "../../../components/common/ErrorStateCard";

type DimensionFilter = "all" | "high_coverage" | "low_confidence" | "user_provided";

const DIMENSION_LABELS: Record<string, string> = {
  profile_context: "1. Profile Context",
  location_context: "2. Location & Origin Context",
  destination_interest: "3. Destination Interest",
  search_behavior: "4. Search Behavior",
  travel_frequency: "5. Travel Frequency",
  budget_profile: "6. Budget Profile",
  travel_style: "7. Travel Style",
  transport_preference: "8. Transport Preference",
  accommodation_preference: "9. Accommodation Preference",
  time_preference: "10. Time Preference",
  activity_level: "11. Activity Level",
  engagement_behavior: "12. Engagement Behavior",
  notification_tolerance: "13. Notification Tolerance",
  language_communication_style: "14. Language & Tone",
  price_sensitivity: "15. Price Sensitivity",
  travel_timeline: "16. Travel Timeline",
  loyalty_engagement_tier: "17. Loyalty & Tier",
  contextual_travel_conditions: "18. Contextual Conditions",
  consent_communication_preferences: "19. Consent & Channels",
  personalization_confidence: "20. Overall Confidence",
};

export const ProfileExplorerTab: React.FC = () => {
  const [explorer, setExplorer] = useState<DimensionExplorerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<DimensionFilter>("all");

  // Single User Safe Snapshot Lookup
  const [lookupUserId, setLookupUserId] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [userSnapshot, setUserSnapshot] = useState<PersonalizationProfileResponse | null>(null);

  const loadDimensions = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await personalizationService.getAdminDimensions();
      setExplorer(data);
    } catch (err) {
      setErrorMsg(formatPersonalizationError(err).message);
      setExplorer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDimensions();
  }, [loadDimensions]);

  const handleInspectUser = async () => {
    const trimmed = lookupUserId.trim();
    if (!trimmed) {
      setLookupError("Enter a valid user UUID to inspect their anonymized 20D snapshot.");
      return;
    }
    try {
      setLookupLoading(true);
      setLookupError(null);
      const profile = await personalizationService.getAdminUserProfile(trimmed);
      setUserSnapshot(profile);
    } catch (err) {
      setLookupError(formatPersonalizationError(err).message);
      setUserSnapshot(null);
    } finally {
      setLookupLoading(false);
    }
  };

  // Merge API items with canonical 20-dimension ordering so all 20 dimensions are always structured
  const normalizedDimensions = useMemo(() => {
    if (!explorer) return [];
    const byKey = new Map<string, DimensionExplorerItem>();
    for (const item of explorer.dimensions || []) {
      byKey.set(item.dimension_key, item);
    }
    const merged: DimensionExplorerItem[] = CANONICAL_DIMENSION_KEYS.map((key) => {
      return (
        byKey.get(key) || {
          dimension_key: key,
          coverage_count: 0,
          coverage_pct: 0,
          avg_confidence: 0,
          source_distribution: {},
          quality_distribution: {},
          user_provided_count: 0,
          permission_granted_count: 0,
          top_values_summary: {},
          last_updated_at: null,
        }
      );
    });
    for (const item of explorer.dimensions || []) {
      if (!CANONICAL_DIMENSION_KEYS.includes(item.dimension_key as any)) {
        merged.push(item);
      }
    }
    return merged.filter((d) => {
      const matchesSearch =
        !searchQuery.trim() ||
        d.dimension_key.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        (DIMENSION_LABELS[d.dimension_key] || "")
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase());
      if (!matchesSearch) return false;
      if (filterMode === "high_coverage") return d.coverage_pct >= 50;
      if (filterMode === "low_confidence") return d.avg_confidence < 40;
      if (filterMode === "user_provided") return d.user_provided_count > 0;
      return true;
    });
  }, [explorer, searchQuery, filterMode]);

  if (loading) {
    return <LoadingState variant="skeleton" skeletonType="list" count={5} />;
  }

  if (errorMsg || !explorer) {
    return (
      <ErrorStateCard
        title="20-Dimension Profile Explorer Unavailable"
        message={errorMsg || "Failed to load 20-dimension profile statistics."}
        onRetry={loadDimensions}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Privacy Guard Banner */}
      <View style={styles.privacyBanner}>
        <Feather name="shield" size={16} color="#0369a1" />
        <Text style={styles.privacyText}>
          Privacy-Safe Explorer: Displays aggregated dimension coverage, provenance, and confidence across{" "}
          {explorer.total_profiles} profiles. Raw PII (emails, phones, NIDs, passports) and sensitive demographics are never stored or exposed.
        </Text>
      </View>

      {/* Safe Individual Profile Inspector */}
      <View style={styles.lookupCard}>
        <Text style={styles.sectionTitle}>Inspect Individual 20D Snapshot (Authorized Admin)</Text>
        <View style={styles.lookupRow}>
          <TextInput
            style={styles.lookupInput}
            placeholder="User UUID (e.g. 11111111-2222-3333-4444-555555555555)"
            value={lookupUserId}
            onChangeText={setLookupUserId}
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.lookupBtn}
            onPress={handleInspectUser}
            disabled={lookupLoading}
          >
            {lookupLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="search" size={15} color="#ffffff" />
                <Text style={styles.lookupBtnText}>Inspect</Text>
              </>
            )}
          </TouchableOpacity>
          {userSnapshot && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                setUserSnapshot(null);
                setLookupError(null);
              }}
            >
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {lookupError && <Text style={styles.errorInline}>{lookupError}</Text>}

        {userSnapshot && (
          <View style={styles.snapshotBox}>
            <View style={styles.snapshotHeader}>
              <Text style={styles.snapshotTitle}>
                Profile v{userSnapshot.profile_version} • {userSnapshot.confidence_tier.toUpperCase()} CONFIDENCE (
                {userSnapshot.overall_confidence.toFixed(1)}%)
              </Text>
              <View
                style={[
                  styles.pillBadge,
                  {
                    backgroundColor: userSnapshot.personalization_enabled ? "#dcfce7" : "#fee2e2",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: userSnapshot.personalization_enabled ? "#166534" : "#991b1b" },
                  ]}
                >
                  {userSnapshot.personalization_enabled ? "ENABLED" : "OPTED OUT"}
                </Text>
              </View>
            </View>
            <Text style={styles.snapshotMeta}>
              Timeline: {userSnapshot.travel_timeline_stage} • Loyalty: {userSnapshot.loyalty_tier} • Activity:{" "}
              {userSnapshot.activity_level} • Language: {userSnapshot.preferred_language.toUpperCase()} • Tone:{" "}
              {userSnapshot.communication_tone}
            </Text>
            {userSnapshot.top_destinations.length > 0 && (
              <View style={styles.destChipRow}>
                {userSnapshot.top_destinations.slice(0, 5).map((dest) => (
                  <View key={dest.destination} style={styles.destChip}>
                    <Text style={styles.destChipText}>
                      {dest.destination}: {dest.score.toFixed(0)} ({dest.is_explicit_favorite ? "Fav" : "Inferred"})
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.snapshotDimsGrid}>
              {CANONICAL_DIMENSION_KEYS.map((key) => {
                const entry = userSnapshot.dimensions?.[key];
                const displayVal =
                  entry && entry.value !== undefined && entry.value !== null
                    ? typeof entry.value === "object"
                      ? JSON.stringify(entry.value)
                      : String(entry.value)
                    : "unknown";
                return (
                  <View key={key} style={styles.snapshotDimCell}>
                    <Text style={styles.snapshotDimKey}>{key}</Text>
                    <Text style={styles.snapshotDimVal} numberOfLines={2}>
                      {displayVal}
                    </Text>
                    <Text style={styles.snapshotDimMeta}>
                      Conf: {(entry?.confidence ?? 0).toFixed(0)}% • {entry?.source || "unknown"} •{" "}
                      {entry?.data_quality || "unknown"}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* Search & Filter Controls */}
      <View style={styles.controlsRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Filter 20 dimensions..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#94a3b8"
        />
        <View style={styles.filterPillsRow}>
          {(
            [
              { id: "all", label: `All (${CANONICAL_DIMENSION_KEYS.length})` },
              { id: "high_coverage", label: ">=50% Coverage" },
              { id: "low_confidence", label: "<40% Confidence" },
              { id: "user_provided", label: "User-Provided" },
            ] as const
          ).map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterPill, filterMode === f.id && styles.filterPillActive]}
              onPress={() => setFilterMode(f.id)}
            >
              <Text
                style={[styles.filterPillText, filterMode === f.id && styles.filterPillTextActive]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 20 Dimensions Grid */}
      {normalizedDimensions.length === 0 ? (
        <EmptyState
          compact
          title="No Matching Dimensions"
          description="Try clearing the search query or switching filter pills."
        />
      ) : (
        <View style={styles.dimGrid}>
          {normalizedDimensions.map((dim) => {
            const topVals = Object.entries(dim.top_values_summary || {}).slice(0, 4);
            const sources = Object.entries(dim.source_distribution || {});
            const qualities = Object.entries(dim.quality_distribution || {});
            return (
              <View key={dim.dimension_key} style={styles.dimCard}>
                <View style={styles.dimCardHeader}>
                  <Text style={styles.dimTitle}>
                    {DIMENSION_LABELS[dim.dimension_key] || dim.dimension_key}
                  </Text>
                  <View style={styles.confBadge}>
                    <Text style={styles.confBadgeText}>
                      Conf {dim.avg_confidence.toFixed(1)}%
                    </Text>
                  </View>
                </View>

                {/* Coverage Progress */}
                <View style={styles.coverageRow}>
                  <Text style={styles.coverageLabel}>
                    Coverage: {dim.coverage_count}/{explorer.total_profiles} (
                    {dim.coverage_pct.toFixed(1)}%)
                  </Text>
                  <Text style={styles.freshnessLabel}>
                    {dim.last_updated_at
                      ? `Updated ${new Date(dim.last_updated_at).toLocaleDateString()}`
                      : "No updates yet"}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.min(Math.max(dim.coverage_pct, 0), 100)}%`,
                        backgroundColor: dim.coverage_pct >= 50 ? "#0284c7" : "#f59e0b",
                      },
                    ]}
                  />
                </View>

                {/* Provenance, Quality & Opt-In Stats */}
                <View style={styles.metaLine}>
                  <Text style={styles.metaChip}>
                    User-provided: {dim.user_provided_count}
                  </Text>
                  <Text style={styles.metaChip}>
                    Permitted: {dim.permission_granted_count}
                  </Text>
                </View>

                {sources.length > 0 && (
                  <Text style={styles.distText}>
                    Sources: {sources.map(([k, v]) => `${k} (${v})`).join(" • ")}
                  </Text>
                )}

                {qualities.length > 0 && (
                  <Text style={styles.distText}>
                    Quality: {qualities.map(([k, v]) => `${k} (${v})`).join(" • ")}
                  </Text>
                )}

                {topVals.length > 0 && (
                  <View style={styles.topValuesRow}>
                    {topVals.map(([valKey, valCount]) => (
                      <View key={valKey} style={styles.valTag}>
                        <Text style={styles.valTagText}>
                          {valKey}: {valCount}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 14, paddingBottom: 32 },
  privacyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f0f9ff",
    borderColor: "#bae6fd",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  privacyText: { flex: 1, fontSize: 12, color: "#0369a1", lineHeight: 17 },
  lookupCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  lookupRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  lookupInput: {
    flex: 1,
    minWidth: 220,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: "#0f172a",
  },
  lookupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0284c7",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  lookupBtnText: { fontSize: 12, fontWeight: "700", color: "#ffffff" },
  clearBtn: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    justifyContent: "center",
  },
  clearBtnText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  errorInline: { fontSize: 12, color: "#dc2626" },
  snapshotBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  snapshotHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  snapshotTitle: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  snapshotMeta: { fontSize: 11, color: "#475569" },
  pillBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillText: { fontSize: 10, fontWeight: "700" },
  destChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  destChip: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  destChipText: { fontSize: 11, fontWeight: "600", color: "#0369a1" },
  snapshotDimsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  snapshotDimCell: {
    width: "48%",
    minWidth: 180,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  snapshotDimKey: { fontSize: 10, fontWeight: "700", color: "#64748b" },
  snapshotDimVal: { fontSize: 12, fontWeight: "600", color: "#0f172a", marginTop: 2 },
  snapshotDimMeta: { fontSize: 10, color: "#94a3b8", marginTop: 2 },
  controlsRow: { gap: 10 },
  searchInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: "#0f172a",
  },
  filterPillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterPill: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  filterPillActive: { backgroundColor: "#0284c7", borderColor: "#0284c7" },
  filterPillText: { fontSize: 11, fontWeight: "600", color: "#475569" },
  filterPillTextActive: { color: "#ffffff" },
  dimGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  dimCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  dimCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  dimTitle: { fontSize: 13, fontWeight: "700", color: "#0f172a", flex: 1 },
  confBadge: {
    backgroundColor: "#eef2ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  confBadgeText: { fontSize: 11, fontWeight: "700", color: "#4338ca" },
  coverageRow: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  coverageLabel: { fontSize: 11, fontWeight: "600", color: "#334155" },
  freshnessLabel: { fontSize: 10, color: "#64748b" },
  barTrack: {
    height: 7,
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 4 },
  metaLine: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metaChip: {
    fontSize: 11,
    color: "#475569",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  distText: { fontSize: 11, color: "#64748b", lineHeight: 15 },
  topValuesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  valTag: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  valTagText: { fontSize: 10, fontWeight: "600", color: "#334155" },
});
