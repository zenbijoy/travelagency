import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import {
  useHotelPmsStore,
  useHotelPmsComputed,
  HotelRoomUnit,
} from "@/features/hotel";

const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const GOLD = "#E5A93C";
const GREEN = "#22C55E";
const RED = "#EF4444";
const YELLOW = "#F59E0B";
const BLUE = "#3B82F6";

const FLOOR_TABS = [
  { id: "all", label: "All Floors" },
  { id: "1", label: "1xx Ground" },
  { id: "2", label: "2xx Ocean" },
  { id: "3", label: "3xx Suites" },
  { id: "suites", label: "VIP Suites" },
];

export default function RoomsScreen() {
  const { isDesktop, contentMaxWidth } = useResponsive();
  const {
    workspace,
    selectedFloor,
    setSelectedFloor,
    searchQuery,
    setSearchQuery,
    initWorkspace,
    patchWorkspace,
    createMaintenanceTicket,
    toggleRateRule,
    blockRoomDates,
  } = useHotelPmsStore();
  const { currentProperty, filteredUnits } = useHotelPmsComputed();

  const [selectedUnit, setSelectedUnit] = useState<HotelRoomUnit | null>(null);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const [newRoomNum, setNewRoomNum] = useState("");
  const [newRoomType, setNewRoomType] = useState("Deluxe Sea View");
  const [newFloor, setNewFloor] = useState("2");
  const [newPrice, setNewPrice] = useState("8500");

  useEffect(() => {
    if (workspace.units.length === 0) initWorkspace();
  }, []);

  const getOccupancyColor = (status: HotelRoomUnit["occupancyStatus"]) => {
    switch (status) {
      case "vacant":
        return GREEN;
      case "occupied":
        return RED;
      case "reserved":
        return BLUE;
      case "due_out":
        return GOLD;
      case "blocked":
      case "out_of_order":
        return YELLOW;
      default:
        return "#94A3B8";
    }
  };

  const getHkColor = (status: HotelRoomUnit["housekeepingStatus"]) => {
    switch (status) {
      case "ready":
      case "clean":
        return GREEN;
      case "cleaning":
        return BLUE;
      case "inspection":
        return GOLD;
      case "dirty":
        return RED;
      default:
        return "#94A3B8";
    }
  };

  const handleOpenActions = (unit: HotelRoomUnit) => {
    setSelectedUnit(unit);
    setActionModalVisible(true);
  };

  const handleQuickAssignClean = (unit: HotelRoomUnit) => {
    const newTaskId = `hk_${Date.now()}`;
    const nowIso = new Date().toISOString();
    patchWorkspace((draft) => ({
      ...draft,
      units: draft.units.map((u) =>
        u.id === unit.id ? { ...u, housekeepingStatus: "cleaning" } : u
      ),
      housekeepingTasks: [
        {
          id: newTaskId,
          hotelId: currentProperty.id,
          roomUnitId: unit.id,
          roomNumber: unit.roomNumber,
          roomTypeName: unit.roomTypeName,
          taskType: "stayover_refresh",
          priority: "high",
          status: "cleaning",
          assignedStaffName: "Housekeeping Floor Lead",
          slaMinutes: 30,
          checklist: [
            { id: "c1", label: "Sanitize washroom & replenish towels", completed: false },
            { id: "c2", label: "Change linens & vacuum floor", completed: false },
          ],
          createdAt: nowIso,
        },
        ...draft.housekeepingTasks,
      ],
    }));
    setActionModalVisible(false);
    Alert.alert("Cleaning Dispatched", `Room ${unit.roomNumber} transitioned to CLEANING queue.`);
  };

  const handleMarkReady = (unit: HotelRoomUnit) => {
    patchWorkspace((draft) => ({
      ...draft,
      units: draft.units.map((u) =>
        u.id === unit.id
          ? { ...u, housekeepingStatus: "ready", occupancyStatus: u.occupancyStatus === "out_of_order" ? "vacant" : u.occupancyStatus }
          : u
      ),
    }));
    setActionModalVisible(false);
    Alert.alert("Room Ready", `Room ${unit.roomNumber} is now marked READY for check-in.`);
  };

  const handleMaintenanceHold = async (unit: HotelRoomUnit) => {
    await createMaintenanceTicket({
      roomUnitId: unit.id,
      category: "other",
      title: `Preventative Maintenance Hold (#${unit.roomNumber})`,
      description: `Inspection & maintenance hold requested for Room ${unit.roomNumber}`,
      severity: "high",
      estimatedCostBdt: 1200,
      blocksRoomSale: true,
    });
    patchWorkspace((draft) => ({
      ...draft,
      units: draft.units.map((u) =>
        u.id === unit.id ? { ...u, occupancyStatus: "out_of_order" } : u
      ),
    }));
    setActionModalVisible(false);
    Alert.alert("Maintenance Hold", `Room ${unit.roomNumber} placed on Maintenance Hold & ticket opened.`);
  };

  const handleBlockToday = async (unit: HotelRoomUnit) => {
    const today = new Date().toISOString().slice(0, 10);
    await blockRoomDates({
      roomUnitId: unit.id,
      date: today,
      reason: "VIP Hold / Owner Inspection",
    });
    setActionModalVisible(false);
    Alert.alert("Date Blocked", `Room ${unit.roomNumber} blocked for ${today}.`);
  };

  const handleAddRoom = () => {
    if (!newRoomNum.trim()) {
      Alert.alert("Room Number Required", "Please specify a room unit number (e.g. 205).");
      return;
    }
    const priceNum = parseInt(newPrice, 10) || 5000;
    const floorNum = parseInt(newFloor, 10) || 1;
    const newUnit: HotelRoomUnit = {
      id: `unit_${Date.now()}`,
      hotelId: currentProperty.id,
      roomTypeId: `rt_${newRoomType.toLowerCase().replace(/\s+/g, "_")}`,
      roomTypeName: newRoomType,
      roomNumber: newRoomNum.trim(),
      floorNumber: floorNum,
      occupancyStatus: "vacant",
      housekeepingStatus: "ready",
      isVipRoom: newRoomType.toLowerCase().includes("suite"),
      dynamicPricingEnabled: true,
      baseNightlyRateBdt: priceNum,
      maxGuests: 2,
      amenities: ["wifi", "ac", "tv", "breakfast"],
      photos: [],
      aiTags: ["Verified Unit"],
      isActive: true,
    };

    patchWorkspace((draft) => ({
      ...draft,
      units: [...draft.units, newUnit],
    }));

    setAddModalVisible(false);
    setNewRoomNum("");
    Alert.alert("Room Added", `Room ${newUnit.roomNumber} (${newUnit.roomTypeName}) added to floor matrix.`);
  };

  const yieldRule = workspace.rateRules.find((r) => r.hotelId === currentProperty.id) || workspace.rateRules[0];

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
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Floor & Room Matrix</Text>
            <Text style={styles.headerSub}>
              {filteredUnits.length} Matching Units • Live Yield & Turnaround
            </Text>
          </View>
          <Pressable style={styles.addBtn} onPress={() => setAddModalVisible(true)}>
            <Ionicons name="add" size={20} color={NAVY} />
            <Text style={styles.addBtnText}>Add Room</Text>
          </Pressable>
        </View>

        {/* Search & Floor Filter */}
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#94A3B8" />
          <TextInput
            placeholder="Search room #, type or guest..."
            placeholderTextColor="#64748B"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          {FLOOR_TABS.map((tab) => {
            const active = selectedFloor === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[styles.floorTab, active && styles.floorTabActive]}
                onPress={() => setSelectedFloor(tab.id)}
              >
                <Text style={[styles.floorTabText, active && styles.floorTabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Global Yield Automation Toggle */}
        {yieldRule && (
          <View style={styles.yieldBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.yieldTitle}>AI Dynamic Yield Rule: {yieldRule.ruleName}</Text>
              <Text style={styles.yieldSub}>
                Multiplier {yieldRule.multiplier}x • Fair Price Ceiling (0.5x – 1.25x)
              </Text>
            </View>
            <Switch
              value={yieldRule.isActive}
              onValueChange={(val) => {
                void toggleRateRule(yieldRule.id, val);
              }}
              trackColor={{ false: "#334155", true: GOLD + "88" }}
              thumbColor={yieldRule.isActive ? GOLD : "#94A3B8"}
            />
          </View>
        )}

        {/* Room Cards Matrix */}
        <FlatList
          data={filteredUnits}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          numColumns={isDesktop ? 2 : 1}
          key={isDesktop ? "grid" : "list"}
          columnWrapperStyle={isDesktop ? { gap: 12 } : undefined}
          renderItem={({ item }) => {
            const occColor = getOccupancyColor(item.occupancyStatus);
            const hkColor = getHkColor(item.housekeepingStatus);
            return (
              <Pressable style={styles.roomCard} onPress={() => handleOpenActions(item)}>
                <View style={styles.roomTop}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={[styles.roomNumberBox, { borderColor: occColor }]}>
                      <Text style={styles.roomNumberText}>{item.roomNumber}</Text>
                    </View>
                    <View>
                      <Text style={styles.roomTypeText}>{item.roomTypeName}</Text>
                      <Text style={styles.floorLabel}>
                        Floor {item.floorNumber} • Max {item.maxGuests} Guests
                        {item.currentGuestName ? ` • ${item.currentGuestName}` : ""}
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.priceText}>৳{item.baseNightlyRateBdt.toLocaleString()}</Text>
                    <Text style={styles.perNight}>/ night</Text>
                  </View>
                </View>

                <View style={styles.statusRow}>
                  <View style={[styles.badge, { backgroundColor: occColor + "22" }]}>
                    <Text style={[styles.badgeText, { color: occColor }]}>
                      {item.occupancyStatus.replace("_", " ").toUpperCase()}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: hkColor + "22" }]}>
                    <Text style={[styles.badgeText, { color: hkColor }]}>
                      HK: {item.housekeepingStatus.toUpperCase()}
                    </Text>
                  </View>
                  {item.occupancyStatus === "out_of_order" && (
                    <View style={[styles.badge, { backgroundColor: RED + "22" }]}>
                      <Text style={[styles.badgeText, { color: RED }]}>REPAIR HOLD</Text>
                    </View>
                  )}
                </View>

                <View style={styles.amenitiesRow}>
                  {item.amenities.slice(0, 4).map((am) => (
                    <View key={am} style={styles.amenityChip}>
                      <Text style={styles.amenityText}>{am}</Text>
                    </View>
                  ))}
                  <Text style={styles.tapHint}>Tap for quick actions →</Text>
                </View>
              </Pressable>
            );
          }}
        />
      </ScrollView>

      {/* Instant Action Modal */}
      <Modal visible={actionModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Room {selectedUnit?.roomNumber} • Quick Controls</Text>
            <Text style={styles.modalSub}>{selectedUnit?.roomTypeName}</Text>

            <View style={{ gap: 10, marginTop: 14 }}>
              <Pressable style={styles.actionRowBtn} onPress={() => selectedUnit && handleQuickAssignClean(selectedUnit)}>
                <Ionicons name="sparkles-outline" size={18} color={BLUE} />
                <Text style={styles.actionRowText}>Assign Urgent Cleaning</Text>
              </Pressable>

              <Pressable style={styles.actionRowBtn} onPress={() => selectedUnit && handleMarkReady(selectedUnit)}>
                <Ionicons name="checkmark-done-circle-outline" size={18} color={GREEN} />
                <Text style={styles.actionRowText}>Mark Room Ready & Inspected</Text>
              </Pressable>

              <Pressable style={styles.actionRowBtn} onPress={() => selectedUnit && handleMaintenanceHold(selectedUnit)}>
                <Ionicons name="construct-outline" size={18} color={YELLOW} />
                <Text style={styles.actionRowText}>Place Maintenance Hold</Text>
              </Pressable>

              <Pressable style={styles.actionRowBtn} onPress={() => selectedUnit && handleBlockToday(selectedUnit)}>
                <Ionicons name="ban-outline" size={18} color={RED} />
                <Text style={styles.actionRowText}>Block Today (Owner / VIP Hold)</Text>
              </Pressable>
            </View>

            <Pressable style={styles.closeBtn} onPress={() => setActionModalVisible(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Add Room Modal */}
      <Modal visible={addModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Room Unit</Text>

            <TextInput
              placeholder="Room Number (e.g. 205)"
              placeholderTextColor="#64748B"
              style={styles.input}
              value={newRoomNum}
              onChangeText={setNewRoomNum}
            />
            <TextInput
              placeholder="Room Type (e.g. Deluxe Sea View)"
              placeholderTextColor="#64748B"
              style={styles.input}
              value={newRoomType}
              onChangeText={setNewRoomType}
            />
            <TextInput
              placeholder="Floor Number (e.g. 2)"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              style={styles.input}
              value={newFloor}
              onChangeText={setNewFloor}
            />
            <TextInput
              placeholder="Base Price per Night (BDT)"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              style={styles.input}
              value={newPrice}
              onChangeText={setNewPrice}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <Pressable style={[styles.closeBtn, { flex: 1 }]} onPress={() => setAddModalVisible(false)}>
                <Text style={styles.closeBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, { flex: 1 }]} onPress={handleAddRoom}>
                <Text style={styles.saveBtnText}>Save Room</Text>
              </Pressable>
            </View>
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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 48, marginBottom: 16 },
  headerTitle: { fontSize: 21, fontWeight: "800", color: "#F1F5F9" },
  headerSub: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: GOLD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: NAVY, fontSize: 12, fontWeight: "800" },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: NAVY_LIGHT, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, gap: 8 },
  searchInput: { flex: 1, color: "#F1F5F9", fontSize: 13 },
  floorTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: NAVY_LIGHT, marginRight: 8 },
  floorTabActive: { backgroundColor: GOLD },
  floorTabText: { color: "#94A3B8", fontSize: 12, fontWeight: "600" },
  floorTabTextActive: { color: NAVY, fontWeight: "800" },
  yieldBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#1E293B", borderWidth: 1, borderColor: GOLD + "44", borderRadius: 14, padding: 14, marginBottom: 16 },
  yieldTitle: { color: "#F1F5F9", fontSize: 13, fontWeight: "700" },
  yieldSub: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  roomCard: { flex: 1, backgroundColor: NAVY_LIGHT, borderRadius: 16, padding: 14, marginBottom: 12 },
  roomTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  roomNumberBox: { width: 48, height: 48, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: NAVY },
  roomNumberText: { color: "#F1F5F9", fontSize: 15, fontWeight: "800" },
  roomTypeText: { color: "#F1F5F9", fontSize: 14, fontWeight: "700" },
  floorLabel: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  priceText: { color: GOLD, fontSize: 16, fontWeight: "800" },
  perNight: { color: "#64748B", fontSize: 10 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  amenitiesRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#334155" },
  amenityChip: { backgroundColor: NAVY, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  amenityText: { color: "#CBD5E1", fontSize: 10, textTransform: "capitalize" },
  tapHint: { color: GOLD, fontSize: 10, fontWeight: "600", marginLeft: "auto" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  modalBox: { backgroundColor: NAVY_LIGHT, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#334155" },
  modalTitle: { color: "#F1F5F9", fontSize: 17, fontWeight: "800" },
  modalSub: { color: "#94A3B8", fontSize: 12, marginTop: 2 },
  actionRowBtn: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: NAVY, padding: 14, borderRadius: 12 },
  actionRowText: { color: "#F1F5F9", fontSize: 13, fontWeight: "600" },
  closeBtn: { marginTop: 16, backgroundColor: "#334155", padding: 12, borderRadius: 12, alignItems: "center" },
  closeBtnText: { color: "#F1F5F9", fontWeight: "700", fontSize: 13 },
  saveBtn: { marginTop: 16, backgroundColor: GOLD, padding: 12, borderRadius: 12, alignItems: "center" },
  saveBtnText: { color: NAVY, fontWeight: "800", fontSize: 13 },
  input: { backgroundColor: NAVY, color: "#F1F5F9", borderRadius: 10, padding: 12, marginTop: 10, fontSize: 13, borderWidth: 1, borderColor: "#334155" },
});
