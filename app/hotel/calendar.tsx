import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import {
  useHotelPmsStore,
  useHotelPmsComputed,
  TapeChartCell,
  HotelRoomUnit,
  checkUnitAvailabilityConflict,
} from "@/features/hotel";

const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const GOLD = "#E5A93C";
const GREEN = "#22C55E";
const RED = "#EF4444";
const YELLOW = "#F59E0B";
const BLUE = "#3B82F6";

const CELL_COLORS: Record<TapeChartCell["status"], string> = {
  open: "#10B981",
  reserved: "#3B82F6",
  occupied: "#EF4444",
  due_out: "#F59E0B",
  blocked: "#64748B",
  out_of_order: "#DC2626",
};

export default function HotelCalendarScreen() {
  const { isDesktop, contentMaxWidth } = useResponsive();
  const {
    workspace,
    selectedDate,
    setSelectedDate,
    initWorkspace,
    blockRoomDates,
    unblockRoomDates,
  } = useHotelPmsStore();
  const { currentProperty, tapeChart } = useHotelPmsComputed();

  const [selectedCellInfo, setSelectedCellInfo] = useState<{
    unit: HotelRoomUnit;
    cell: TapeChartCell;
  } | null>(null);
  const [blockReason, setBlockReason] = useState("Owner Inspection / Maintenance Hold");

  useEffect(() => {
    if (workspace.units.length === 0) initWorkspace();
  }, []);

  const shiftStartDate = (daysDelta: number) => {
    const base = new Date(`${selectedDate}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + daysDelta);
    setSelectedDate(base.toISOString().slice(0, 10));
  };

  const handleCellPress = (unit: HotelRoomUnit, cell: TapeChartCell) => {
    setSelectedCellInfo({ unit, cell });
  };

  const handleBlockCellDate = async () => {
    if (!selectedCellInfo) return;
    const { unit, cell } = selectedCellInfo;

    const conflict = checkUnitAvailabilityConflict({
      unit,
      checkInDate: cell.date,
      checkOutDate: new Date(new Date(`${cell.date}T00:00:00Z`).getTime() + 86400000)
        .toISOString()
        .slice(0, 10),
      reservations: workspace.reservations,
      blocks: workspace.blocks,
    });

    if (conflict.hasConflict && conflict.conflictingReservation) {
      Alert.alert("Double-Booking Conflict Prevented", conflict.reason || "Date already occupied.");
      return;
    }

    await blockRoomDates({
      roomUnitId: unit.id,
      date: cell.date,
      reason: blockReason.trim() || "Manual PMS Hold",
    });
    setSelectedCellInfo(null);
    Alert.alert("Date Blocked", `Room ${unit.roomNumber} blocked on ${cell.date}.`);
  };

  const handleUnblockCellDate = async () => {
    if (!selectedCellInfo?.cell.block) return;
    await unblockRoomDates(selectedCellInfo.cell.block.id);
    setSelectedCellInfo(null);
    Alert.alert("Date Unblocked", "Room unit restored to open inventory.");
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          isDesktop && { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Multi-Day Tape Chart</Text>
            <Text style={styles.headerSub}>{currentProperty.name} • Double-Booking Shield Active</Text>
          </View>
          <View style={styles.navBtns}>
            <Pressable style={styles.navBtn} onPress={() => shiftStartDate(-7)}>
              <Ionicons name="chevron-back" size={18} color="#F1F5F9" />
            </Pressable>
            <Pressable style={styles.navBtnToday} onPress={() => setSelectedDate(new Date().toISOString().slice(0, 10))}>
              <Text style={styles.navBtnText}>Today</Text>
            </Pressable>
            <Pressable style={styles.navBtn} onPress={() => shiftStartDate(7)}>
              <Ionicons name="chevron-forward" size={18} color="#F1F5F9" />
            </Pressable>
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legendRow}>
          {[
            { label: "Open", color: CELL_COLORS.open },
            { label: "Reserved", color: CELL_COLORS.reserved },
            { label: "Occupied", color: CELL_COLORS.occupied },
            { label: "Due Out", color: CELL_COLORS.due_out },
            { label: "Blocked", color: CELL_COLORS.blocked },
          ].map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Horizontal Scrollable Tape Chart Grid */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.gridBox}>
            {/* Date Header Row */}
            <View style={styles.gridHeaderRow}>
              <View style={styles.roomColHeader}>
                <Text style={styles.colHeaderText}>Unit / Floor</Text>
              </View>
              {tapeChart.dates.map((d) => (
                <View key={d} style={styles.dateColHeader}>
                  <Text style={styles.dateMonth}>{d.slice(5, 7)}/{d.slice(8, 10)}</Text>
                </View>
              ))}
            </View>

            {/* Room Rows */}
            {tapeChart.rows.map((row) => (
              <View key={row.unit.id} style={styles.gridRow}>
                <View style={styles.roomColCell}>
                  <Text style={styles.unitNum}>#{row.unit.roomNumber}</Text>
                  <Text style={styles.unitType} numberOfLines={1}>
                    {row.unit.roomTypeName}
                  </Text>
                </View>
                {row.cells.map((cell) => {
                  const bg = CELL_COLORS[cell.status];
                  return (
                    <Pressable
                      key={cell.date}
                      style={[styles.cell, { backgroundColor: bg + "33", borderColor: bg }]}
                      onPress={() => handleCellPress(row.unit, cell)}
                    >
                      <Text style={[styles.cellText, { color: bg }]} numberOfLines={1}>
                        {cell.reservation
                          ? cell.reservation.guestName.split(" ")[0]
                          : cell.status === "open"
                          ? "৳" + Math.round(row.unit.baseNightlyRateBdt / 100) + "00"
                          : cell.status.toUpperCase().slice(0, 4)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>

      {/* Cell Inspector Modal */}
      <Modal visible={Boolean(selectedCellInfo)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              Room #{selectedCellInfo?.unit.roomNumber} • {selectedCellInfo?.cell.date}
            </Text>
            <Text style={styles.modalSub}>
              Status: {selectedCellInfo?.cell.status.toUpperCase()}
            </Text>

            {selectedCellInfo?.cell.reservation && (
              <View style={styles.resCard}>
                <Text style={styles.resGuest}>{selectedCellInfo.cell.reservation.guestName}</Text>
                <Text style={styles.resMeta}>
                  Ref: {selectedCellInfo.cell.reservation.bookingReference} •{" "}
                  {selectedCellInfo.cell.reservation.checkInDate} → {selectedCellInfo.cell.reservation.checkOutDate}
                </Text>
              </View>
            )}

            {selectedCellInfo?.cell.block && (
              <View style={styles.resCard}>
                <Text style={styles.resGuest}>Blocked Date</Text>
                <Text style={styles.resMeta}>Reason: {selectedCellInfo.cell.block.reason}</Text>
                <Pressable style={styles.unblockBtn} onPress={handleUnblockCellDate}>
                  <Text style={styles.btnText}>Release Block & Re-Open</Text>
                </Pressable>
              </View>
            )}

            {selectedCellInfo?.cell.status === "open" && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.inputLabel}>Block Reason:</Text>
                <TextInput
                  value={blockReason}
                  onChangeText={setBlockReason}
                  style={styles.input}
                />
                <Pressable style={styles.blockBtn} onPress={handleBlockCellDate}>
                  <Text style={styles.btnText}>Block Date on Inventory</Text>
                </Pressable>
              </View>
            )}

            <Pressable style={styles.closeBtn} onPress={() => setSelectedCellInfo(null)}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 48, marginBottom: 14 },
  headerTitle: { fontSize: 21, fontWeight: "800", color: "#F1F5F9" },
  headerSub: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
  navBtns: { flexDirection: "row", alignItems: "center", gap: 6 },
  navBtn: { backgroundColor: NAVY_LIGHT, padding: 8, borderRadius: 10 },
  navBtnToday: { backgroundColor: GOLD, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  navBtnText: { color: NAVY, fontSize: 12, fontWeight: "800" },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: "#CBD5E1", fontSize: 11 },
  gridBox: { backgroundColor: NAVY_LIGHT, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: "#334155" },
  gridHeaderRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#334155", paddingBottom: 8, marginBottom: 6 },
  roomColHeader: { width: 110, justifyContent: "center" },
  colHeaderText: { color: GOLD, fontSize: 11, fontWeight: "800" },
  dateColHeader: { width: 70, alignItems: "center" },
  dateMonth: { color: "#CBD5E1", fontSize: 11, fontWeight: "700" },
  gridRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  roomColCell: { width: 110, paddingRight: 8 },
  unitNum: { color: "#F1F5F9", fontSize: 13, fontWeight: "800" },
  unitType: { color: "#64748B", fontSize: 10 },
  cell: { width: 66, height: 36, marginHorizontal: 2, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  cellText: { fontSize: 10, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  modalBox: { backgroundColor: NAVY_LIGHT, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#334155" },
  modalTitle: { color: "#F1F5F9", fontSize: 17, fontWeight: "800" },
  modalSub: { color: GOLD, fontSize: 12, fontWeight: "700", marginTop: 2 },
  resCard: { backgroundColor: NAVY, borderRadius: 12, padding: 12, marginTop: 12 },
  resGuest: { color: "#F1F5F9", fontSize: 14, fontWeight: "700" },
  resMeta: { color: "#94A3B8", fontSize: 12, marginTop: 4 },
  inputLabel: { color: "#CBD5E1", fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: NAVY, color: "#F1F5F9", borderRadius: 10, padding: 11, borderWidth: 1, borderColor: "#334155", marginBottom: 10 },
  blockBtn: { backgroundColor: RED, borderRadius: 12, padding: 12, alignItems: "center" },
  unblockBtn: { backgroundColor: GREEN, borderRadius: 10, padding: 10, alignItems: "center", marginTop: 10 },
  btnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  closeBtn: { backgroundColor: "#334155", borderRadius: 12, padding: 12, alignItems: "center", marginTop: 12 },
  closeText: { color: "#F1F5F9", fontSize: 13, fontWeight: "700" },
});
