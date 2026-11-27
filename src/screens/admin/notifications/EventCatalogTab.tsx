/**
 * Event Catalog Inspector Tab — Admin Notification Command Center
 * Displays all 34 typed Domain Events across 8 domains with schema details,
 * priority & quiet-hours rules, and safe non-dispatching Decision Pipeline dry-runs.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import {
  notificationCommandService,
  EventCatalogEntry,
  EventDomainKey,
} from "../../../services/notificationCommandService";
import { formatPersonalizationError } from "../../../services/personalizationService";
import { LoadingState } from "../../../components/ui/LoadingState";
import { EmptyState } from "../../../components/ui/EmptyState";

const DOMAIN_FILTERS: ReadonlyArray<{ key: "all" | EventDomainKey; label: string }> = [
  { key: "all", label: "All (8 Domains)" },
  { key: "booking", label: "Booking" },
  { key: "security", label: "Security" },
  { key: "travel_product", label: "Flights & Hotels" },
  { key: "user", label: "User & Loyalty" },
  { key: "agency", label: "Agency B2B" },
  { key: "hotel", label: "Hotel PMS" },
  { key: "marketplace", label: "Marketplace" },
  { key: "system", label: "System" },
];

export const EventCatalogTab: React.FC = () => {
  const [events, setEvents] = useState<EventCatalogEntry[]>([]);
  const [source, setSource] = useState<"backend" | "local_catalog">("local_catalog");
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [domainFilter, setDomainFilter] = useState<"all" | EventDomainKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<EventCatalogEntry | null>(null);

  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<Record<string, unknown> | null>(null);
  const [dryRunError, setDryRunError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    try {
      setLoading(true);
      const res = await notificationCommandService.getEventCatalog();
      setEvents(res.events);
      setSource(res.source);
      setWarning(res.warning || null);
      if (res.events.length > 0 && !selectedEvent) {
        setSelectedEvent(res.events[0]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((e) => {
      if (domainFilter !== "all" && e.domain !== domainFilter) return false;
      if (!q) return true;
      return (
        e.event_type.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.domain_label.toLowerCase().includes(q)
      );
    });
  }, [events, domainFilter, searchQuery]);

  const handleDryRun = async (evt: EventCatalogEntry) => {
    try {
      setDryRunLoading(true);
      setDryRunError(null);
      const res = await notificationCommandService.dryRunEvent(evt, "family_midrange");
      setDryRunResult(res as Record<string, unknown>);
    } catch (err) {
      setDryRunError(formatPersonalizationError(err).message);
      setDryRunResult(null);
    } finally {
      setDryRunLoading(false);
    }
  };

  if (loading) {
    return <LoadingState variant="skeleton" skeletonType="card" count={3} />;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Domain Event Catalog Inspector</Text>
            <Text style={styles.headerSub}>
              {events.length} typed events across 8 travel ecosystem domains
            </Text>
          </View>
          <View
            style={[
              styles.sourcePill,
              source === "backend" ? styles.sourceBackend : styles.sourceLocal,
            ]}
          >
            <Text style={styles.sourcePillText}>
              {source === "backend" ? "LIVE BACKEND REGISTRY" : "CANONICAL SCHEMA CATALOG"}
            </Text>
          </View>
        </View>
        {warning && <Text style={styles.warnText}>{warning}</Text>}

        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search event_type (e.g. booking.confirmed, price_alert)..."
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
        />

        <View style={styles.filterRow}>
          {DOMAIN_FILTERS.map((df) => {
            const active = domainFilter === df.key;
            return (
              <TouchableOpacity
                key={df.key}
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => setDomainFilter(df.key)}
              >
                <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                  {df.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Selected Event Schema & Dry Run Panel */}
      {selectedEvent && (
        <View style={styles.inspectorCard}>
          <View style={styles.inspectorTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inspectorEventName}>{selectedEvent.event_type}</Text>
              <Text style={styles.inspectorDesc}>{selectedEvent.description}</Text>
            </View>
            <View
              style={[
                styles.prioBadge,
                selectedEvent.priority_tier === "P0" && { backgroundColor: "#fee2e2" },
                selectedEvent.priority_tier === "P1" && { backgroundColor: "#fef3c7" },
              ]}
            >
              <Text
                style={[
                  styles.prioText,
                  selectedEvent.priority_tier === "P0" && { color: "#b91c1c" },
                  selectedEvent.priority_tier === "P1" && { color: "#92400e" },
                ]}
              >
                {selectedEvent.priority_tier} (Score {selectedEvent.priority_score})
              </Text>
            </View>
          </View>

          <View style={styles.metaStrip}>
            <Text style={styles.metaText}>
              Aggregate: <Text style={styles.metaBold}>{selectedEvent.aggregate_type}</Text>
            </Text>
            <Text style={styles.metaText}>
              Channels:{" "}
              <Text style={styles.metaBold}>
                {selectedEvent.default_channels.join(", ")}
              </Text>
            </Text>
            <Text style={styles.metaText}>
              Quiet Hours:{" "}
              <Text style={styles.metaBold}>
                {selectedEvent.bypasses_quiet_hours ? "Bypassed (Critical)" : "Respected"}
              </Text>
            </Text>
          </View>

          <Text style={styles.sectionLabel}>TYPED PAYLOAD FIELDS</Text>
          <View style={styles.fieldsWrap}>
            {selectedEvent.payload_fields.map((f) => (
              <View key={f} style={styles.fieldChip}>
                <Text style={styles.fieldChipText}>{`{{${f}}}`}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionLabel}>SAMPLE PAYLOAD</Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>
              {JSON.stringify(selectedEvent.sample_payload, null, 2)}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.dryRunBtn}
            onPress={() => handleDryRun(selectedEvent)}
            disabled={dryRunLoading}
          >
            {dryRunLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="flask-outline" size={16} color="#fff" />
                <Text style={styles.dryRunBtnText}>Dry-Run Event Pipeline (Never Dispatches)</Text>
              </>
            )}
          </TouchableOpacity>

          {dryRunError && <Text style={styles.errorText}>{dryRunError}</Text>}
          {dryRunResult && (
            <View style={styles.dryRunBox}>
              <Text style={styles.dryRunTitle}>Dry-Run Result (dispatched = false)</Text>
              <Text style={styles.dryRunJson}>
                Eligibility: {String(dryRunResult.eligibility_passed ?? true)} • Channel:{" "}
                {String(dryRunResult.selected_channel || selectedEvent.default_channels[0] || "in_app")} • Tier:{" "}
                {String(dryRunResult.personalization_tier || "generic")}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Event List */}
      <View style={styles.listCard}>
        <Text style={styles.sectionLabel}>
          EVENT DEFINITIONS ({filteredEvents.length})
        </Text>
        {filteredEvents.length === 0 ? (
          <EmptyState
            compact
            title="No matching domain events"
            description="Adjust the domain chip or search query to inspect events."
          />
        ) : (
          filteredEvents.map((evt) => {
            const active = selectedEvent?.event_type === evt.event_type;
            return (
              <TouchableOpacity
                key={evt.event_type}
                style={[styles.eventRow, active && styles.eventRowActive]}
                onPress={() => {
                  setSelectedEvent(evt);
                  setDryRunResult(null);
                  setDryRunError(null);
                }}
              >
                <View style={styles.eventRowHead}>
                  <Text style={styles.eventType}>{evt.event_type}</Text>
                  <Text style={styles.eventDomainBadge}>{evt.priority_tier}</Text>
                </View>
                <Text style={styles.eventDesc}>{evt.description}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 14, paddingBottom: 24 },
  headerCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  headerSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  sourcePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  sourceBackend: { backgroundColor: "#dcfce7" },
  sourceLocal: { backgroundColor: "#e0f2fe" },
  sourcePillText: { fontSize: 10, fontWeight: "700", color: "#0369a1" },
  warnText: { fontSize: 11, color: "#92400e", backgroundColor: "#fef3c7", padding: 8, borderRadius: 6 },
  searchInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: "#0f172a",
  },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  filterPillActive: { backgroundColor: "#0284c7", borderColor: "#0284c7" },
  filterPillText: { fontSize: 11, fontWeight: "600", color: "#475569" },
  filterPillTextActive: { color: "#fff" },
  inspectorCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#bae6fd",
    gap: 10,
  },
  inspectorTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  inspectorEventName: { fontSize: 15, fontWeight: "800", color: "#0369a1" },
  inspectorDesc: { fontSize: 12, color: "#475569", marginTop: 3 },
  prioBadge: { backgroundColor: "#e0f2fe", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  prioText: { fontSize: 11, fontWeight: "700", color: "#0369a1" },
  metaStrip: { flexDirection: "row", flexWrap: "wrap", gap: 12, backgroundColor: "#f8fafc", padding: 10, borderRadius: 8 },
  metaText: { fontSize: 11, color: "#64748b" },
  metaBold: { color: "#0f172a", fontWeight: "700" },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#475569", letterSpacing: 0.4 },
  fieldsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fieldChip: { backgroundColor: "#ede9fe", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  fieldChipText: { fontSize: 11, fontWeight: "700", color: "#6d28d9" },
  codeBox: { backgroundColor: "#0f172a", padding: 10, borderRadius: 8 },
  codeText: { fontSize: 11, color: "#e2e8f0", fontFamily: "monospace" },
  dryRunBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#7c3aed",
    paddingVertical: 11,
    borderRadius: 8,
  },
  dryRunBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  errorText: { fontSize: 12, color: "#b91c1c" },
  dryRunBox: { backgroundColor: "#f5f3ff", padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "#ddd6fe" },
  dryRunTitle: { fontSize: 11, fontWeight: "700", color: "#6d28d9" },
  dryRunJson: { fontSize: 12, color: "#334155", marginTop: 3 },
  listCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  eventRow: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  eventRowActive: { borderColor: "#0284c7", backgroundColor: "#f0f9ff" },
  eventRowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eventType: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  eventDomainBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0369a1",
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  eventDesc: { fontSize: 11, color: "#64748b", marginTop: 4 },
});
