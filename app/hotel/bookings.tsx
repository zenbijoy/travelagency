import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import { useInAppCall } from "@/hooks/useInAppCall";
import InCallModal from "@/components/hotel/InCallModal";
import {
  useHotelPmsStore,
  useHotelPmsComputed,
  HotelReservation,
  buildShareableInvoiceText,
} from "@/features/hotel";

const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const GOLD = "#E5A93C";
const GREEN = "#22C55E";
const RED = "#EF4444";
const BLUE = "#3B82F6";

const TAB_LABELS: Array<{ id: HotelReservation["status"]; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
  { id: "checked_in", label: "In-House" },
  { id: "checked_out", label: "Checked Out" },
  { id: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: GOLD,
  confirmed: GREEN,
  checked_in: BLUE,
  checked_out: "#64748B",
  cancelled: RED,
};

export default function BookingsScreen() {
  const { isDesktop, contentMaxWidth } = useResponsive();
  const {
    workspace,
    initWorkspace,
    patchWorkspace,
    expressCheckIn,
    postFolioAndCheckOut,
    rotateDigitalKey,
  } = useHotelPmsStore();
  const { currentProperty } = useHotelPmsComputed();
  const {
    callState,
    initiateCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    isMuted,
    isSpeakerOn,
  } = useInAppCall();
  const [callingGuestName, setCallingGuestName] = useState("Guest");

  const [activeTab, setActiveTab] = useState<HotelReservation["status"]>("pending");
  const [selectedBooking, setSelectedBooking] = useState<HotelReservation | null>(null);
  const [qrModalVisible, setQrModalVisible] = useState(false);

  // Express Check-In Modal
  const [checkInModalVisible, setCheckInModalVisible] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [nidInput, setNidInput] = useState("");

  // Folio & Split Settlement Modal
  const [folioModalVisible, setFolioModalVisible] = useState(false);
  const [extraChargeLabel, setExtraChargeLabel] = useState("Minibar & Snacks");
  const [extraChargeBdt, setExtraChargeBdt] = useState("");

  useEffect(() => {
    if (workspace.reservations.length === 0) initWorkspace();
  }, []);

  const propertyReservations = workspace.reservations.filter((r) => r.hotelId === currentProperty.id);
  const filtered = propertyReservations.filter((r) => r.status === activeTab);

  const handleConfirm = (id: string) => {
    patchWorkspace((draft) => ({
      ...draft,
      reservations: draft.reservations.map((r) =>
        r.id === id ? { ...r, status: "confirmed" } : r
      ),
    }));
  };

  const handleReject = (id: string) => {
    patchWorkspace((draft) => ({
      ...draft,
      reservations: draft.reservations.map((r) =>
        r.id === id ? { ...r, status: "cancelled" } : r
      ),
    }));
  };

  const openCheckInModal = (booking: HotelReservation) => {
    setSelectedBooking(booking);
    const readyUnit =
      workspace.units.find(
        (u) => u.hotelId === currentProperty.id && u.occupancyStatus === "vacant" && (u.housekeepingStatus === "ready" || u.housekeepingStatus === "clean")
      ) || workspace.units.find((u) => u.hotelId === currentProperty.id);
    setSelectedUnitId(readyUnit?.id || "");
    setNidInput(booking.nidOrPassportNumber || "NID-199288371");
    setCheckInModalVisible(true);
  };

  const submitExpressCheckIn = async () => {
    if (!selectedBooking || !selectedUnitId) return;
    const res = await expressCheckIn({
      bookingReference: selectedBooking.bookingReference,
      roomUnitId: selectedUnitId,
      nidOrPassportVerified: nidInput.trim().length > 0,
    });

    setCheckInModalVisible(false);
    if (res.success) {
      Alert.alert(
        "Checked In Successfully",
        `${selectedBooking.guestName} assigned to Room ${res.roomNumber}.\nDigital Room Key: ${res.qrPassCode}`
      );
      setActiveTab("checked_in");
    } else {
      Alert.alert("Check-In Failed", res.error || "Could not check in");
    }
  };

  const openFolioModal = (booking: HotelReservation) => {
    setSelectedBooking(booking);
    setExtraChargeBdt("");
    setFolioModalVisible(true);
  };

  const submitFolioCheckout = async () => {
    if (!selectedBooking) return;
    const folio = workspace.folios.find((f) => f.bookingId === selectedBooking.id || f.id === selectedBooking.folioId);
    if (!folio) {
      Alert.alert("No Folio", "Active folio record not found.");
      return;
    }

    const extraAmt = parseFloat(extraChargeBdt) || 0;
    const additionalCharges =
      extraAmt > 0
        ? [
            {
              description: extraChargeLabel || "Room Service / Minibar",
              itemType: "minibar" as const,
              amountBdt: extraAmt,
            },
          ]
        : [];

    const res = await postFolioAndCheckOut({
      folioId: folio.id,
      additionalCharges,
      checkout: true,
    });

    setFolioModalVisible(false);
    if (res.success) {
      Alert.alert(
        "Folio Settled & Checked Out",
        `Total settled: ৳${(res.totalChargedBdt || 0).toLocaleString()} (incl. VAT).\nRoom sent to Housekeeping Turnaround.`
      );
      setActiveTab("checked_out");
    } else {
      Alert.alert("Checkout Error", res.error || "Settlement failed.");
    }
  };

  const handleShareReceipt = (booking: HotelReservation) => {
    const folio = workspace.folios.find((f) => f.bookingId === booking.id || f.id === booking.folioId);
    if (!folio) {
      Alert.alert("No Folio", "Folio not available yet.");
      return;
    }
    const receiptText = buildShareableInvoiceText(folio, currentProperty.name);
    Share.share({ message: receiptText }).catch(() => {});
  };

  const activeGuestKey = selectedBooking
    ? workspace.guestKeys.find((k) => k.bookingId === selectedBooking.id && k.status === "active")
    : null;

  const vacantUnits = workspace.units.filter(
    (u) => u.hotelId === currentProperty.id && (u.occupancyStatus === "vacant" || u.occupancyStatus === "reserved")
  );

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.inner,
          isDesktop && { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reservations & Express Check-In</Text>
          <Text style={styles.headerSub}>{propertyReservations.length} Property Bookings</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          {TAB_LABELS.map((tab) => {
            const count = propertyReservations.filter((r) => r.status === tab.id).length;
            const active = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {tab.label} ({count})
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Reservations List */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="calendar-clear-outline" size={36} color="#64748B" />
              <Text style={styles.emptyText}>No {activeTab.replace("_", " ")} reservations</Text>
            </View>
          }
          renderItem={({ item }) => {
            const color = STATUS_COLORS[item.status] || GOLD;
            const assignedUnit = workspace.units.find((u) => u.id === item.roomUnitId);
            const guestKey = workspace.guestKeys.find(
              (k) => k.bookingId === item.id && k.status === "active"
            );

            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.guestName}>{item.guestName}</Text>
                      {item.isVip && (
                        <View style={styles.vipBadge}>
                          <Text style={styles.vipText}>VIP</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.bookingRef}>
                      {item.bookingReference} • {item.roomType}
                      {assignedUnit ? ` (Room ${assignedUnit.roomNumber})` : ""}
                    </Text>
                    <Text style={styles.dateRange}>
                      {item.checkInDate} → {item.checkOutDate} ({item.adults + item.children} Guests)
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.priceText}>৳{item.totalPriceBdt.toLocaleString()}</Text>
                    <View style={[styles.statusChip, { backgroundColor: color + "22" }]}>
                      <Text style={[styles.statusText, { color }]}>
                        {item.status.replace("_", " ").toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>

                {item.specialRequests.length > 0 ? (
                  <View style={styles.reqBox}>
                    <Ionicons name="sparkles-outline" size={13} color={GOLD} />
                    <Text style={styles.reqText}>{item.specialRequests.join(" • ")}</Text>
                  </View>
                ) : null}

                {/* Contextual Operations */}
                <View style={styles.actionsBar}>
                  {item.status === "pending" && (
                    <>
                      <Pressable style={styles.btnGreen} onPress={() => handleConfirm(item.id)}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                        <Text style={styles.btnTextWhite}>Accept</Text>
                      </Pressable>
                      <Pressable style={styles.btnRed} onPress={() => handleReject(item.id)}>
                        <Ionicons name="close" size={14} color="#fff" />
                        <Text style={styles.btnTextWhite}>Decline</Text>
                      </Pressable>
                    </>
                  )}

                  {item.status === "confirmed" && (
                    <Pressable style={styles.btnGold} onPress={() => openCheckInModal(item)}>
                      <Ionicons name="key-outline" size={14} color={NAVY} />
                      <Text style={styles.btnTextDark}>Express Check-In</Text>
                    </Pressable>
                  )}

                  {item.status === "checked_in" && (
                    <Pressable style={styles.btnBlue} onPress={() => openFolioModal(item)}>
                      <Ionicons name="receipt-outline" size={14} color="#fff" />
                      <Text style={styles.btnTextWhite}>Folio & Check-Out</Text>
                    </Pressable>
                  )}

                  {(guestKey || item.status === "confirmed") && (
                    <Pressable
                      style={styles.btnOutline}
                      onPress={() => {
                        setSelectedBooking(item);
                        setQrModalVisible(true);
                      }}
                    >
                      <Ionicons name="qr-code-outline" size={14} color={GOLD} />
                      <Text style={styles.btnTextGold}>Digital Key / QR</Text>
                    </Pressable>
                  )}

                  <Pressable
                    style={styles.btnOutline}
                    onPress={() => handleShareReceipt(item)}
                  >
                    <Ionicons name="share-outline" size={14} color="#94A3B8" />
                  </Pressable>

                  <Pressable
                    style={styles.btnOutline}
                    onPress={() => {
                      setCallingGuestName(item.guestName);
                      void initiateCall(item.guestUserId || item.id, "audio");
                    }}
                  >
                    <Ionicons name="call-outline" size={14} color={GREEN} />
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      </View>

      {/* Express Check-In Modal */}
      <Modal visible={checkInModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Express Check-In</Text>
            <Text style={styles.modalSub}>{selectedBooking?.guestName} • {selectedBooking?.bookingReference}</Text>

            <Text style={styles.inputLabel}>Verify Guest NID / Passport Number:</Text>
            <TextInput
              value={nidInput}
              onChangeText={setNidInput}
              placeholder="e.g. NID-199288371"
              placeholderTextColor="#64748B"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Assign Ready Room Unit:</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {vacantUnits.slice(0, 6).map((u) => (
                <Pressable
                  key={u.id}
                  style={[
                    styles.unitChip,
                    selectedUnitId === u.id && styles.unitChipActive,
                  ]}
                  onPress={() => setSelectedUnitId(u.id)}
                >
                  <Text style={selectedUnitId === u.id ? styles.unitChipTextActive : styles.unitChipText}>
                    Room {u.roomNumber} ({u.roomTypeName.split(" ")[0]})
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Pressable
                style={[styles.btnOutline, { flex: 1, justifyContent: "center", paddingVertical: 12 }]}
                onPress={() => setCheckInModalVisible(false)}
              >
                <Text style={{ color: "#F1F5F9", fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btnGold, { flex: 1, justifyContent: "center", paddingVertical: 12 }]}
                onPress={submitExpressCheckIn}
              >
                <Text style={styles.btnTextDark}>Check-In & Issue Key</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Folio Settlement Modal */}
      <Modal visible={folioModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Settle Folio & Check-Out</Text>
            <Text style={styles.modalSub}>{selectedBooking?.guestName}</Text>

            <Text style={styles.inputLabel}>Incidental Charge Description (Optional):</Text>
            <TextInput
              value={extraChargeLabel}
              onChangeText={setExtraChargeLabel}
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Extra Amount (BDT):</Text>
            <TextInput
              value={extraChargeBdt}
              onChangeText={setExtraChargeBdt}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#64748B"
              style={styles.input}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Pressable
                style={[styles.btnOutline, { flex: 1, justifyContent: "center", paddingVertical: 12 }]}
                onPress={() => setFolioModalVisible(false)}
              >
                <Text style={{ color: "#F1F5F9", fontWeight: "700" }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btnBlue, { flex: 1, justifyContent: "center", paddingVertical: 12 }]}
                onPress={submitFolioCheckout}
              >
                <Text style={styles.btnTextWhite}>Settle & Check Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* QR & Rotatable Digital Key Modal */}
      <Modal visible={qrModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { alignItems: "center" }]}>
            <Text style={styles.modalTitle}>Digital Room Key & WiFi Pass</Text>
            <Text style={styles.modalSub}>{selectedBooking?.guestName}</Text>

            <View style={styles.qrBox}>
              <Ionicons name="qr-code-outline" size={110} color={GOLD} />
              <Text style={styles.passcodeText}>
                KEY: {activeGuestKey?.qrPassCode || "PENDING CHECK-IN"}
              </Text>
              <Text style={{ color: "#94A3B8", fontSize: 11, marginTop: 4 }}>
                Door PIN: {activeGuestKey?.pinCodeLast4 || "----"} • WiFi: {activeGuestKey?.wifiSsid || "ShopnoJatra-Guest-5G"}
              </Text>
            </View>

            {activeGuestKey && (
              <Pressable
                style={[styles.btnOutline, { marginTop: 10, paddingHorizontal: 16, paddingVertical: 8 }]}
                onPress={async () => {
                  const res = await rotateDigitalKey(activeGuestKey.id);
                  if (res.success) {
                    Alert.alert("Key Rotated", `New Secure Key Code: ${res.newPasscode}`);
                  }
                }}
              >
                <Ionicons name="refresh-outline" size={14} color={GOLD} />
                <Text style={styles.btnTextGold}>Rotate Key Code</Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.btnGold, { width: "100%", justifyContent: "center", marginTop: 16, paddingVertical: 12 }]}
              onPress={() => setQrModalVisible(false)}
            >
              <Text style={styles.btnTextDark}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <InCallModal
        visible={callState === "calling" || callState === "connected"}
        callerName={callingGuestName}
        callType="audio"
        onMute={toggleMute}
        onSpeaker={toggleSpeaker}
        onEnd={() => {
          void endCall();
        }}
        isMuted={isMuted}
        isSpeakerOn={isSpeakerOn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  inner: { flex: 1, paddingHorizontal: 16 },
  header: { paddingTop: 48, marginBottom: 14 },
  headerTitle: { fontSize: 21, fontWeight: "800", color: "#F1F5F9" },
  headerSub: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
  tabsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  tab: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: NAVY_LIGHT },
  tabActive: { backgroundColor: GOLD },
  tabText: { color: "#94A3B8", fontSize: 11, fontWeight: "700" },
  tabTextActive: { color: NAVY },
  card: { backgroundColor: NAVY_LIGHT, borderRadius: 16, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  guestName: { color: "#F1F5F9", fontSize: 15, fontWeight: "800" },
  vipBadge: { backgroundColor: GOLD + "33", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  vipText: { color: GOLD, fontSize: 9, fontWeight: "800" },
  bookingRef: { color: "#CBD5E1", fontSize: 12, marginTop: 2 },
  dateRange: { color: "#64748B", fontSize: 11, marginTop: 2 },
  priceText: { color: GOLD, fontSize: 15, fontWeight: "800" },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  statusText: { fontSize: 9, fontWeight: "800" },
  reqBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: NAVY, padding: 8, borderRadius: 8, marginTop: 10 },
  reqText: { color: "#CBD5E1", fontSize: 11 },
  actionsBar: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#334155" },
  btnGreen: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: GREEN, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  btnRed: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: RED, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  btnGold: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: GOLD, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  btnBlue: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: BLUE, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  btnOutline: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: "#475569", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  btnTextWhite: { color: "#fff", fontSize: 11, fontWeight: "700" },
  btnTextDark: { color: NAVY, fontSize: 11, fontWeight: "800" },
  btnTextGold: { color: GOLD, fontSize: 11, fontWeight: "700" },
  emptyBox: { alignItems: "center", paddingVertical: 40 },
  emptyText: { color: "#64748B", fontSize: 13, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 20 },
  modalBox: { backgroundColor: NAVY_LIGHT, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#334155" },
  modalTitle: { color: "#F1F5F9", fontSize: 17, fontWeight: "800" },
  modalSub: { color: "#94A3B8", fontSize: 12, marginTop: 2, marginBottom: 10 },
  inputLabel: { color: "#CBD5E1", fontSize: 12, fontWeight: "600", marginTop: 12 },
  input: { backgroundColor: NAVY, color: "#F1F5F9", borderRadius: 10, padding: 11, marginTop: 6, fontSize: 13, borderWidth: 1, borderColor: "#334155" },
  unitChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: NAVY, borderWidth: 1, borderColor: "#334155" },
  unitChipActive: { backgroundColor: GOLD, borderColor: GOLD },
  unitChipText: { color: "#CBD5E1", fontSize: 11, fontWeight: "600" },
  unitChipTextActive: { color: NAVY, fontSize: 11, fontWeight: "800" },
  qrBox: { backgroundColor: NAVY, padding: 20, borderRadius: 16, alignItems: "center", marginTop: 12, width: "100%" },
  passcodeText: { color: GOLD, fontSize: 15, fontWeight: "800", marginTop: 10, letterSpacing: 1 },
});
