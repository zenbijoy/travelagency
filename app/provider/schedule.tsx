import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProviderHubStore } from "@/features/rider/providerStore";

const TEAL = "#0D9488";
const GOLD = "#E5A93C";
const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const BORDER = "#334155";

type DateStatus = "available" | "booked" | "blocked" | "pending" | "none";
const STATUS_COLORS: Record<DateStatus, string> = {
  available: "#10B981",
  booked: "#EF4444",
  blocked: "#F59E0B",
  pending: "#3B82F6",
  none: "transparent",
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ProviderScheduleScreen() {
  const bookings = useProviderHubStore((s) => s.bookings);
  const slots = useProviderHubStore((s) => s.slots);
  const blockedDates = useProviderHubStore((s) => s.blockedDates);
  const waypoints = useProviderHubStore((s) => s.waypoints);
  const isHydrated = useProviderHubStore((s) => s.isHydrated);

  const hydrateProviderHub = useProviderHubStore((s) => s.hydrateProviderHub);
  const addAvailabilitySlot = useProviderHubStore((s) => s.addAvailabilitySlot);
  const removeAvailabilitySlot = useProviderHubStore((s) => s.removeAvailabilitySlot);
  const blockDateRange = useProviderHubStore((s) => s.blockDateRange);
  const addWaypointBySearch = useProviderHubStore((s) => s.addWaypointBySearch);
  const removeWaypoint = useProviderHubStore((s) => s.removeWaypoint);

  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<number | null>(today.getDate());
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [wpLabel, setWpLabel] = useState("");
  const [selectedBulkDays, setSelectedBulkDays] = useState<string[]>([]);
  const [bulkTimeStart, setBulkTimeStart] = useState("09:00");
  const [bulkTimeEnd, setBulkTimeEnd] = useState("18:00");
  const [searchingWp, setSearchingWp] = useState(false);

  useEffect(() => {
    if (!isHydrated) {
      hydrateProviderHub().catch(() => {});
    }
  }, [isHydrated, hydrateProviderHub]);

  const toDateIso = (day: number): string => {
    const mm = String(currentMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${currentYear}-${mm}-${dd}`;
  };

  const getDateStatus = (day: number): DateStatus => {
    const iso = toDateIso(day);
    if (blockedDates[iso]) return "blocked";
    const match = bookings.find((b) => b.dateIso === iso);
    if (match) return match.status === "booked" ? "booked" : "pending";
    if (slots.length > 0) return "available";
    return "none";
  };

  const prevMonth = useCallback(() => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDate(null);
  }, [currentMonth]);

  const nextMonth = useCallback(() => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDate(null);
  }, [currentMonth]);

  const handleAddSlot = useCallback(() => {
    if (!slotStart.trim() || !slotEnd.trim()) {
      Alert.alert("Error", "Enter start and end times (e.g. 09:00 – 17:00).");
      return;
    }
    addAvailabilitySlot(slotStart.trim(), slotEnd.trim());
    setSlotStart("");
    setSlotEnd("");
  }, [slotStart, slotEnd, addAvailabilitySlot]);

  const handleBlockRange = useCallback(() => {
    if (!blockStart.trim() || !blockEnd.trim()) {
      Alert.alert("Error", "Enter YYYY-MM-DD start and end dates.");
      return;
    }
    const blockedCount = blockDateRange(blockStart.trim(), blockEnd.trim());
    if (blockedCount === 0) {
      Alert.alert("Invalid Range", "Please use valid YYYY-MM-DD dates with End >= Start.");
      return;
    }
    Alert.alert("Dates Blocked", `Blocked ${blockedCount} calendar day(s).`);
    setBlockStart("");
    setBlockEnd("");
  }, [blockStart, blockEnd, blockDateRange]);

  const handleAddWaypoint = useCallback(async () => {
    if (!wpLabel.trim()) return;
    setSearchingWp(true);
    const wp = await addWaypointBySearch(wpLabel.trim());
    setSearchingWp(false);
    if (wp) {
      setWpLabel("");
    }
  }, [wpLabel, addWaypointBySearch]);

  const handleApplyBulk = useCallback(() => {
    if (selectedBulkDays.length === 0) {
      Alert.alert("Select Days", "Tap at least one day of the week.");
      return;
    }
    addAvailabilitySlot(bulkTimeStart, bulkTimeEnd, selectedBulkDays);
    Alert.alert(
      "Availability Applied",
      `${bulkTimeStart}–${bulkTimeEnd} persisted for ${selectedBulkDays.join(", ")}.`
    );
  }, [selectedBulkDays, bulkTimeStart, bulkTimeEnd, addAvailabilitySlot]);

  // Build calendar grid
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const cells: Array<number | null> = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const selectedIso = selectedDate ? toDateIso(selectedDate) : null;
  const selectedBookings = selectedIso
    ? bookings.filter((b) => b.dateIso === selectedIso)
    : [];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>📅 Schedule & Availability</Text>

      {/* Calendar */}
      <View style={styles.calCard}>
        <View style={styles.calHeader}>
          <Pressable onPress={prevMonth} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={TEAL} />
          </Pressable>
          <Text style={styles.calTitle}>
            {MONTH_NAMES[currentMonth]} {currentYear}
          </Text>
          <Pressable onPress={nextMonth} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={TEAL} />
          </Pressable>
        </View>
        <View style={styles.dayLabelsRow}>
          {DAY_LABELS.map((d) => (
            <Text key={d} style={styles.dayLabel}>
              {d}
            </Text>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day, di) => {
              const status: DateStatus = day ? getDateStatus(day) : "none";
              const isSelected = day === selectedDate;
              const isToday =
                day === today.getDate() &&
                currentMonth === today.getMonth() &&
                currentYear === today.getFullYear();
              return (
                <Pressable
                  key={di}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    isToday && styles.dayCellToday,
                  ]}
                  onPress={() => day && setSelectedDate(day)}
                >
                  {day ? (
                    <>
                      <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>
                        {day}
                      </Text>
                      {status !== "none" && (
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: STATUS_COLORS[status] },
                          ]}
                        />
                      )}
                    </>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}

        {/* Legend */}
        <View style={styles.legend}>
          {(Object.entries(STATUS_COLORS) as [DateStatus, string][])
            .filter(([k]) => k !== "none")
            .map(([status, color]) => (
              <View key={status} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendLabel}>{status}</Text>
              </View>
            ))}
        </View>
      </View>

      {/* Day Detail */}
      {selectedDate && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            📋 {selectedIso} Bookings ({selectedBookings.length})
          </Text>
          {blockedDates[selectedIso!] ? (
            <Text style={[styles.emptyText, { color: "#F59E0B" }]}>
              This date is marked BLOCKED.
            </Text>
          ) : selectedBookings.length === 0 ? (
            <Text style={styles.emptyText}>No bookings scheduled on {selectedIso}.</Text>
          ) : (
            selectedBookings.map((b) => (
              <View key={b.id} style={styles.bookingItem}>
                <Text style={styles.bookingTime}>{b.timeSlot}</Text>
                <View style={styles.bookingDetails}>
                  <Text style={styles.bookingClient}>{b.clientName}</Text>
                  <Text style={styles.bookingService}>{b.serviceTitle}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Availability Slots */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⏰ Availability Windows</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={slotStart}
            onChangeText={setSlotStart}
            placeholder="09:00"
            placeholderTextColor="#475569"
          />
          <Text style={styles.toText}>–</Text>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={slotEnd}
            onChangeText={setSlotEnd}
            placeholder="17:00"
            placeholderTextColor="#475569"
          />
          <Pressable style={styles.smallBtn} onPress={handleAddSlot}>
            <Text style={styles.smallBtnText}>Add</Text>
          </Pressable>
        </View>
        {slots.map((slot) => (
          <View key={slot.id} style={styles.slotItem}>
            <Ionicons name="time-outline" size={16} color={TEAL} />
            <Text style={styles.slotText}>
              {slot.dayOfWeek ? `${slot.dayOfWeek}: ` : ""}
              {slot.startTime} – {slot.endTime}
            </Text>
            <Pressable onPress={() => removeAvailabilitySlot(slot.id)}>
              <Ionicons name="close-circle" size={18} color="#EF4444" />
            </Pressable>
          </View>
        ))}
      </View>

      {/* Block Dates */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚫 Block Date Range</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={blockStart}
            onChangeText={setBlockStart}
            placeholder="2026-12-01"
            placeholderTextColor="#475569"
          />
          <Text style={styles.toText}>–</Text>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={blockEnd}
            onChangeText={setBlockEnd}
            placeholder="2026-12-03"
            placeholderTextColor="#475569"
          />
          <Pressable
            style={[styles.smallBtn, { backgroundColor: "#EF444422", borderColor: "#EF4444" }]}
            onPress={handleBlockRange}
          >
            <Text style={[styles.smallBtnText, { color: "#EF4444" }]}>Block</Text>
          </Pressable>
        </View>
      </View>

      {/* Route Planner using Photon Geocoder + Haversine */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🗺️ Photon Route Waypoint Planner</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={wpLabel}
            onChangeText={setWpLabel}
            placeholder="Search stop (e.g. Uttara, Motijheel)"
            placeholderTextColor="#475569"
          />
          <Pressable style={styles.smallBtn} onPress={handleAddWaypoint} disabled={searchingWp}>
            <Text style={styles.smallBtnText}>{searchingWp ? "..." : "Add"}</Text>
          </Pressable>
        </View>
        {waypoints.map((wp, i) => (
          <View key={wp.id} style={styles.waypointItem}>
            <Text style={styles.waypointNum}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.waypointLabel}>{wp.label}</Text>
              <Text style={styles.waypointEta}>
                +{wp.distanceKmFromPrev} km • ETA {wp.etaMinutes} min
              </Text>
            </View>
            {i > 0 && (
              <Pressable onPress={() => removeWaypoint(wp.id)}>
                <Ionicons name="close-circle" size={18} color="#EF4444" />
              </Pressable>
            )}
          </View>
        ))}
      </View>

      {/* Bulk Availability */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📆 Bulk Weekly Setter</Text>
        <View style={styles.daysRow}>
          {WEEK_DAYS.map((day) => {
            const selected = selectedBulkDays.includes(day);
            return (
              <Pressable
                key={day}
                style={[styles.dayChip, selected && styles.dayChipActive]}
                onPress={() =>
                  setSelectedBulkDays((prev) =>
                    prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                  )
                }
              >
                <Text style={[styles.dayChipText, selected && styles.dayChipTextActive]}>
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={bulkTimeStart}
            onChangeText={setBulkTimeStart}
            placeholder="09:00"
            placeholderTextColor="#475569"
          />
          <Text style={styles.toText}>–</Text>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={bulkTimeEnd}
            onChangeText={setBulkTimeEnd}
            placeholder="18:00"
            placeholderTextColor="#475569"
          />
          <Pressable style={styles.smallBtn} onPress={handleApplyBulk}>
            <Text style={styles.smallBtnText}>Apply</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY, padding: 16 },
  pageTitle: {
    color: "#F1F5F9",
    fontSize: 22,
    fontWeight: "700",
    paddingTop: 20,
    marginBottom: 16,
  },
  calCard: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  calHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  navBtn: { padding: 6 },
  calTitle: { color: "#F1F5F9", fontSize: 16, fontWeight: "700" },
  dayLabelsRow: { flexDirection: "row", marginBottom: 8 },
  dayLabel: {
    flex: 1,
    textAlign: "center",
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
  },
  weekRow: { flexDirection: "row" },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    margin: 1,
  },
  dayCellSelected: { backgroundColor: TEAL },
  dayCellToday: { borderWidth: 1, borderColor: GOLD },
  dayNum: { color: "#CBD5E1", fontSize: 13 },
  dayNumSelected: { color: "#fff", fontWeight: "700" },
  statusDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: "#94A3B8", fontSize: 11, textTransform: "capitalize" },
  section: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionTitle: {
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
  },
  emptyText: { color: "#64748B", fontSize: 12 },
  bookingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  bookingTime: { color: TEAL, fontSize: 13, fontWeight: "700", width: 70 },
  bookingDetails: { flex: 1 },
  bookingClient: { color: "#F1F5F9", fontSize: 13, fontWeight: "600" },
  bookingService: { color: "#94A3B8", fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  input: {
    backgroundColor: NAVY,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: "#F1F5F9",
    fontSize: 13,
    borderWidth: 1,
    borderColor: BORDER,
  },
  toText: { color: "#94A3B8", fontSize: 16 },
  smallBtn: {
    backgroundColor: TEAL + "22",
    borderColor: TEAL,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  smallBtnText: { color: TEAL, fontSize: 12, fontWeight: "700" },
  slotItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  slotText: { flex: 1, color: "#CBD5E1", fontSize: 13 },
  waypointItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  waypointNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: TEAL,
    color: "#fff",
    textAlign: "center",
    lineHeight: 24,
    fontSize: 12,
    fontWeight: "700",
  },
  waypointLabel: { color: "#F1F5F9", fontSize: 13, fontWeight: "600" },
  waypointEta: { color: GOLD, fontSize: 11, marginTop: 1 },
  daysRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  dayChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: BORDER,
  },
  dayChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  dayChipText: { color: "#94A3B8", fontSize: 11 },
  dayChipTextActive: { color: "#fff", fontWeight: "700" },
});
