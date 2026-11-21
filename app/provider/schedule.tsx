import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";

const TEAL = "#0D9488";
const GOLD = "#E5A93C";
const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const BORDER = "#334155";

type DateStatus = "available" | "booked" | "blocked" | "pending" | "none";
const STATUS_COLORS: Record<DateStatus, string> = {
  available: "#10B981", booked: "#EF4444", blocked: "#F59E0B", pending: "#3B82F6", none: "transparent",
};

interface DayBooking { time: string; client: string; service: string; }
interface Waypoint { id: string; label: string; eta: string; }
interface AvailabilitySlot { id: string; start: string; end: string; }
interface BulkDay { day: string; selected: boolean; }

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function generateMockStatuses(year: number, month: number): Record<number, DateStatus> {
  const result: Record<number, DateStatus> = {};
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mockData: Array<[number, DateStatus]> = [[3,"booked"],[7,"available"],[8,"available"],[10,"blocked"],[14,"pending"],[15,"booked"],[18,"available"],[21,"booked"],[22,"booked"],[25,"blocked"]];
  mockData.forEach(([d, s]) => { if (d <= daysInMonth) result[d] = s; });
  return result;
}

const MOCK_BOOKINGS: Record<number, DayBooking[]> = {
  3: [{ time: "09:00", client: "Rahima B.", service: "Cox's Bazar Tour" }, { time: "14:00", client: "Karim H.", service: "Car Rental" }],
  15: [{ time: "08:00", client: "Sara J.", service: "Photography" }],
  21: [{ time: "10:00", client: "Ahmed F.", service: "Local Guide" }, { time: "15:00", client: "Nadia I.", service: "Sundarbans" }],
  22: [{ time: "09:00", client: "Reza M.", service: "Event Photography" }],
};

const WEEK_DAYS: BulkDay[] = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => ({ day: d, selected: false }));

export default function ProviderScheduleScreen() {
  const { isDesktop } = useResponsive();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [dateStatuses, setDateStatuses] = useState<Record<number, DateStatus>>(() => generateMockStatuses(today.getFullYear(), today.getMonth()));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [wpLabel, setWpLabel] = useState("");
  const [bulkDays, setBulkDays] = useState<BulkDay[]>(WEEK_DAYS);
  const [bulkTimeStart, setBulkTimeStart] = useState("");
  const [bulkTimeEnd, setBulkTimeEnd] = useState("");

  const prevMonth = useCallback(() => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
    setSelectedDate(null);
  }, [currentMonth]);

  const nextMonth = useCallback(() => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
    setSelectedDate(null);
  }, [currentMonth]);

  const handleAddSlot = useCallback(() => {
    if (!slotStart || !slotEnd) { Alert.alert("Error", "Enter start and end times"); return; }
    setSlots(prev => [...prev, { id: Date.now().toString(), start: slotStart, end: slotEnd }]);
    setSlotStart(""); setSlotEnd("");
  }, [slotStart, slotEnd]);

  const handleBlockRange = useCallback(() => {
    if (!blockStart || !blockEnd) { Alert.alert("Error", "Enter date range"); return; }
    Alert.alert("Blocked", `Dates ${blockStart} to ${blockEnd} blocked`);
    setBlockStart(""); setBlockEnd("");
  }, [blockStart, blockEnd]);

  const handleAddWaypoint = useCallback(() => {
    if (!wpLabel.trim()) return;
    const wp: Waypoint = { id: Date.now().toString(), label: wpLabel.trim(), eta: `${Math.floor(Math.random() * 45) + 10} min` };
    setWaypoints(prev => [...prev, wp]);
    setWpLabel("");
  }, [wpLabel]);

  const handleApplyBulk = useCallback(() => {
    const selectedDays = bulkDays.filter(d => d.selected).map(d => d.day);
    if (selectedDays.length === 0) { Alert.alert("Error", "Select at least one day"); return; }
    Alert.alert("Applied", `Availability ${bulkTimeStart}–${bulkTimeEnd} applied to: ${selectedDays.join(", ")}`);
  }, [bulkDays, bulkTimeStart, bulkTimeEnd]);

  // Build calendar grid
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const cells: Array<number | null> = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const selectedBookings = selectedDate ? (MOCK_BOOKINGS[selectedDate] ?? []) : [];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>📅 Schedule & Availability</Text>

      {/* Calendar */}
      <View style={styles.calCard}>
        <View style={styles.calHeader}>
          <Pressable onPress={prevMonth} style={styles.navBtn}><Ionicons name="chevron-back" size={20} color={TEAL} /></Pressable>
          <Text style={styles.calTitle}>{MONTH_NAMES[currentMonth]} {currentYear}</Text>
          <Pressable onPress={nextMonth} style={styles.navBtn}><Ionicons name="chevron-forward" size={20} color={TEAL} /></Pressable>
        </View>
        <View style={styles.dayLabelsRow}>
          {DAY_LABELS.map(d => <Text key={d} style={styles.dayLabel}>{d}</Text>)}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day, di) => {
              const status: DateStatus = day ? (dateStatuses[day] ?? "none") : "none";
              const isSelected = day === selectedDate;
              const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
              return (
                <Pressable
                  key={di}
                  style={[styles.dayCell, isSelected && styles.dayCellSelected, isToday && styles.dayCellToday]}
                  onPress={() => day && setSelectedDate(day)}
                >
                  {day ? (
                    <>
                      <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>{day}</Text>
                      {status !== "none" && <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status] }]} />}
                    </>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        {/* Legend */}
        <View style={styles.legend}>
          {(Object.entries(STATUS_COLORS) as [DateStatus, string][]).filter(([k]) => k !== "none").map(([status, color]) => (
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
          <Text style={styles.sectionTitle}>📋 Day {selectedDate} Bookings</Text>
          {selectedBookings.length === 0 ? (
            <Text style={styles.emptyText}>No bookings for this day</Text>
          ) : selectedBookings.map((b, i) => (
            <View key={i} style={styles.bookingItem}>
              <Text style={styles.bookingTime}>{b.time}</Text>
              <View style={styles.bookingDetails}>
                <Text style={styles.bookingClient}>{b.client}</Text>
                <Text style={styles.bookingService}>{b.service}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Availability Slots */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⏰ Add Availability Slots</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1 }]} value={slotStart} onChangeText={setSlotStart} placeholder="Start (e.g. 09:00)" placeholderTextColor="#475569" />
          <Text style={styles.toText}>–</Text>
          <TextInput style={[styles.input, { flex: 1 }]} value={slotEnd} onChangeText={setSlotEnd} placeholder="End (e.g. 17:00)" placeholderTextColor="#475569" />
          <Pressable style={styles.smallBtn} onPress={handleAddSlot}><Text style={styles.smallBtnText}>Add</Text></Pressable>
        </View>
        {slots.map(slot => (
          <View key={slot.id} style={styles.slotItem}>
            <Ionicons name="time-outline" size={16} color={TEAL} />
            <Text style={styles.slotText}>{slot.start} – {slot.end}</Text>
            <Pressable onPress={() => setSlots(prev => prev.filter(s => s.id !== slot.id))}><Ionicons name="close-circle" size={18} color="#EF4444" /></Pressable>
          </View>
        ))}
      </View>

      {/* Block Dates */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚫 Block Dates</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1 }]} value={blockStart} onChangeText={setBlockStart} placeholder="From (YYYY-MM-DD)" placeholderTextColor="#475569" />
          <Text style={styles.toText}>–</Text>
          <TextInput style={[styles.input, { flex: 1 }]} value={blockEnd} onChangeText={setBlockEnd} placeholder="To (YYYY-MM-DD)" placeholderTextColor="#475569" />
          <Pressable style={[styles.smallBtn, { backgroundColor: "#EF444422", borderColor: "#EF4444" }]} onPress={handleBlockRange}>
            <Text style={[styles.smallBtnText, { color: "#EF4444" }]}>Block</Text>
          </Pressable>
        </View>
      </View>

      {/* Route Planner */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🗺️ Route Planner</Text>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapEmoji}>🗺️</Text>
          <Text style={styles.mapText}>Route Map View</Text>
          {waypoints.map((wp, i) => (
            <View key={wp.id} style={styles.waypointOnMap}>
              <Text style={styles.waypointOnMapText}>📍 Stop {i + 1}: {wp.label} (ETA: {wp.eta})</Text>
            </View>
          ))}
        </View>
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1 }]} value={wpLabel} onChangeText={setWpLabel} placeholder="Add waypoint location" placeholderTextColor="#475569" />
          <Pressable style={styles.smallBtn} onPress={handleAddWaypoint}><Text style={styles.smallBtnText}>Add</Text></Pressable>
        </View>
        {waypoints.map((wp, i) => (
          <View key={wp.id} style={styles.waypointItem}>
            <Text style={styles.waypointNum}>{i + 1}</Text>
            <Text style={styles.waypointLabel}>{wp.label}</Text>
            <Text style={styles.waypointEta}>ETA: {wp.eta}</Text>
            <Pressable onPress={() => setWaypoints(prev => prev.filter(w => w.id !== wp.id))}><Ionicons name="close-circle" size={18} color="#EF4444" /></Pressable>
          </View>
        ))}
      </View>

      {/* Bulk Availability */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📆 Bulk Availability Setter</Text>
        <Text style={styles.fieldLabel}>Apply to days:</Text>
        <View style={styles.daysRow}>
          {bulkDays.map((d, i) => (
            <Pressable
              key={d.day}
              style={[styles.dayChip, d.selected && styles.dayChipActive]}
              onPress={() => setBulkDays(prev => prev.map((bd, bi) => bi === i ? { ...bd, selected: !bd.selected } : bd))}
            >
              <Text style={[styles.dayChipText, d.selected && styles.dayChipTextActive]}>{d.day}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1 }]} value={bulkTimeStart} onChangeText={setBulkTimeStart} placeholder="Start time" placeholderTextColor="#475569" />
          <Text style={styles.toText}>–</Text>
          <TextInput style={[styles.input, { flex: 1 }]} value={bulkTimeEnd} onChangeText={setBulkTimeEnd} placeholder="End time" placeholderTextColor="#475569" />
        </View>
        <Pressable style={styles.applyBtn} onPress={handleApplyBulk}>
          <Text style={styles.applyBtnText}>Apply to Selected Days</Text>
        </Pressable>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY, padding: 16 },
  pageTitle: { color: "#F1F5F9", fontSize: 20, fontWeight: "700", paddingTop: 20, marginBottom: 16 },
  calCard: { backgroundColor: NAVY_LIGHT, borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: BORDER },
  calHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  navBtn: { padding: 8 },
  calTitle: { color: "#F1F5F9", fontSize: 16, fontWeight: "700" },
  dayLabelsRow: { flexDirection: "row", marginBottom: 4 },
  dayLabel: { flex: 1, textAlign: "center", color: "#64748B", fontSize: 11, fontWeight: "600" },
  weekRow: { flexDirection: "row" },
  dayCell: { flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 8, margin: 1 },
  dayCellSelected: { backgroundColor: TEAL },
  dayCellToday: { borderWidth: 1, borderColor: GOLD },
  dayNum: { color: "#CBD5E1", fontSize: 13, fontWeight: "500" },
  dayNumSelected: { color: "#fff", fontWeight: "700" },
  statusDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: "#94A3B8", fontSize: 11, textTransform: "capitalize" },
  section: { marginBottom: 20 },
  sectionTitle: { color: TEAL, fontSize: 14, fontWeight: "700", marginBottom: 12 },
  emptyText: { color: "#475569", fontSize: 13, fontStyle: "italic" },
  bookingItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: NAVY_LIGHT, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: BORDER },
  bookingTime: { color: GOLD, fontSize: 13, fontWeight: "700", width: 50 },
  bookingDetails: { flex: 1 },
  bookingClient: { color: "#F1F5F9", fontSize: 13, fontWeight: "600" },
  bookingService: { color: "#94A3B8", fontSize: 11 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  input: { backgroundColor: NAVY_LIGHT, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10, color: "#F1F5F9", fontSize: 13 },
  toText: { color: "#64748B", fontSize: 16, fontWeight: "600" },
  smallBtn: { backgroundColor: TEAL + "22", borderRadius: 8, borderWidth: 1, borderColor: TEAL, paddingHorizontal: 14, paddingVertical: 10 },
  smallBtnText: { color: TEAL, fontWeight: "700", fontSize: 13 },
  slotItem: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: NAVY_LIGHT, borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: BORDER },
  slotText: { flex: 1, color: "#F1F5F9", fontSize: 13 },
  mapPlaceholder: { backgroundColor: "#1E3A5F", borderRadius: 12, padding: 20, alignItems: "center", marginBottom: 12, minHeight: 100 },
  mapEmoji: { fontSize: 32, marginBottom: 4 },
  mapText: { color: "#93C5FD", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  waypointOnMap: { backgroundColor: "#0F172A80", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 4 },
  waypointOnMapText: { color: "#93C5FD", fontSize: 11 },
  waypointItem: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: NAVY_LIGHT, borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: BORDER },
  waypointNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: TEAL, color: "#fff", textAlign: "center", lineHeight: 24, fontWeight: "700", fontSize: 13, overflow: "hidden" },
  waypointLabel: { flex: 1, color: "#F1F5F9", fontSize: 13 },
  waypointEta: { color: "#64748B", fontSize: 11 },
  fieldLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "600", marginBottom: 8 },
  daysRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: NAVY_LIGHT, borderWidth: 1, borderColor: BORDER },
  dayChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  dayChipText: { color: "#94A3B8", fontSize: 12 },
  dayChipTextActive: { color: "#fff", fontWeight: "600" },
  applyBtn: { backgroundColor: TEAL, paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 4 },
  applyBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
