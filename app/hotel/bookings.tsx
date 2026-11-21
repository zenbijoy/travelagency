import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Animated,
  ScrollView,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import { useInAppCall } from "@/hooks/useInAppCall";
import InCallModal from "@/components/hotel/InCallModal";

const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const GOLD = "#E5A93C";
const GREEN = "#22C55E";
const RED = "#EF4444";
const BLUE = "#3B82F6";

type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

interface Booking {
  id: string;
  guestName: string;
  avatar: string;
  guestId: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  specialRequests: string;
  status: BookingStatus;
  loyaltyPoints?: number;
  isCorporate?: boolean;
}

const TAB_LABELS: BookingStatus[] = ["pending", "confirmed", "completed", "cancelled"];

const MOCK_BOOKINGS: Booking[] = [
  { id: "1", guestName: "Rahman Khan", avatar: "RK", guestId: "g1", roomType: "Deluxe Suite", checkIn: "Nov 14", checkOut: "Nov 17", totalPrice: 18500, specialRequests: "Early check-in requested", status: "pending", loyaltyPoints: 2400 },
  { id: "2", guestName: "Fatima Begum", avatar: "FB", guestId: "g2", roomType: "Double Room", checkIn: "Nov 15", checkOut: "Nov 16", totalPrice: 6200, specialRequests: "Vegetarian meals only", status: "pending" },
  { id: "3", guestName: "Arif Hossain", avatar: "AH", guestId: "g3", roomType: "Single Room", checkIn: "Nov 15", checkOut: "Nov 18", totalPrice: 9000, specialRequests: "", status: "confirmed", loyaltyPoints: 800 },
  { id: "4", guestName: "Priya Das", avatar: "PD", guestId: "g4", roomType: "Suite", checkIn: "Nov 10", checkOut: "Nov 12", totalPrice: 24000, specialRequests: "Late checkout", status: "completed" },
  { id: "5", guestName: "ABC Corp Group", avatar: "AC", guestId: "g5", roomType: "10x Double Rooms", checkIn: "Nov 20", checkOut: "Nov 22", totalPrice: 124000, specialRequests: "Corporate booking, need invoice", status: "pending", isCorporate: true },
  { id: "6", guestName: "Karim Ali", avatar: "KA", guestId: "g6", roomType: "Single Room", checkIn: "Nov 8", checkOut: "Nov 9", totalPrice: 3200, specialRequests: "", status: "cancelled" },
];

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: GOLD,
  confirmed: GREEN,
  completed: BLUE,
  cancelled: RED,
};

function QRModal({ visible, booking, onClose }: { visible: boolean; booking: Booking | null; onClose: () => void }) {
  if (!booking) return null;
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={qrModal.overlay}>
        <View style={qrModal.container}>
          <Text style={qrModal.title}>Booking QR Code</Text>
          <View style={qrModal.qrPlaceholder}>
            <Ionicons name="qr-code-outline" size={120} color={GOLD} />
            <Text style={qrModal.qrId}>#{booking.id}</Text>
          </View>
          <Text style={qrModal.guest}>{booking.guestName}</Text>
          <Text style={qrModal.detail}>{booking.roomType} · {booking.checkIn} → {booking.checkOut}</Text>
          <Pressable style={qrModal.closeBtn} onPress={onClose}>
            <Text style={qrModal.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function BookingCard({
  booking,
  onAccept,
  onReject,
  onCall,
}: {
  booking: Booking;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onCall: (guestId: string, guestName: string) => void;
}) {
  const acceptScale = useState(new Animated.Value(1))[0];
  const rejectScale = useState(new Animated.Value(1))[0];
  const [showQR, setShowQR] = useState(false);

  const animatePress = (anim: Animated.Value, cb: () => void) => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 0.9, duration: 100, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start(cb);
  };

  return (
    <View style={[bc.container, booking.isCorporate && bc.corporate]}>
      <View style={bc.header}>
        <View style={bc.avatarWrap}>
          <Text style={bc.avatarText}>{booking.avatar}</Text>
        </View>
        <View style={bc.guestInfo}>
          <View style={bc.nameRow}>
            <Text style={bc.name}>{booking.guestName}</Text>
            {booking.loyaltyPoints && (
              <View style={bc.loyaltyBadge}>
                <Ionicons name="star" size={10} color={GOLD} />
                <Text style={bc.loyaltyText}>{booking.loyaltyPoints} pts</Text>
              </View>
            )}
            {booking.isCorporate && (
              <View style={bc.corpBadge}>
                <Text style={bc.corpText}>Corporate</Text>
              </View>
            )}
          </View>
          <Text style={bc.room}>{booking.roomType}</Text>
          <Text style={bc.dates}>{booking.checkIn} → {booking.checkOut}</Text>
        </View>
        <Text style={bc.price}>৳{booking.totalPrice.toLocaleString()}</Text>
      </View>

      {booking.specialRequests !== "" && (
        <View style={bc.requests}>
          <Ionicons name="chatbubble-outline" size={12} color="#94A3B8" />
          <Text style={bc.requestsText}>{booking.specialRequests}</Text>
        </View>
      )}

      <View style={bc.actions}>
        {booking.status === "pending" && (
          <>
            <Animated.View style={{ transform: [{ scale: acceptScale }], flex: 1 }}>
              <Pressable style={bc.acceptBtn} onPress={() => animatePress(acceptScale, () => onAccept(booking.id))}>
                <Ionicons name="checkmark-circle-outline" size={16} color={GREEN} />
                <Text style={bc.acceptText}>Accept</Text>
              </Pressable>
            </Animated.View>
            <Animated.View style={{ transform: [{ scale: rejectScale }], flex: 1 }}>
              <Pressable style={bc.rejectBtn} onPress={() => animatePress(rejectScale, () => onReject(booking.id))}>
                <Ionicons name="close-circle-outline" size={16} color={RED} />
                <Text style={bc.rejectText}>Reject</Text>
              </Pressable>
            </Animated.View>
          </>
        )}
        <Pressable style={bc.msgBtn} onPress={() => {}}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={BLUE} />
        </Pressable>
        <Pressable style={bc.callBtn} onPress={() => onCall(booking.guestId, booking.guestName)}>
          <Ionicons name="call-outline" size={16} color={GREEN} />
        </Pressable>
        <Pressable style={bc.qrBtn} onPress={() => setShowQR(true)}>
          <Ionicons name="qr-code-outline" size={16} color={GOLD} />
        </Pressable>
      </View>

      <QRModal visible={showQR} booking={booking} onClose={() => setShowQR(false)} />
    </View>
  );
}

export default function BookingsScreen() {
  const [activeTab, setActiveTab] = useState<BookingStatus>("pending");
  const [bookings, setBookings] = useState<Booking[]>(MOCK_BOOKINGS);
  const [callingGuest, setCallingGuest] = useState<{ id: string; name: string } | null>(null);
  const { isDesktop } = useResponsive();
  const { activeCall, callState, isMuted, isSpeakerOn, initiateCall, endCall, toggleMute, toggleSpeaker } = useInAppCall();

  const filtered = bookings.filter((b) => b.status === activeTab);

  const handleAccept = (id: string) => {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: "confirmed" as const } : b));
  };

  const handleReject = (id: string) => {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: "cancelled" as const } : b));
  };

  const handleCall = async (guestId: string, guestName: string) => {
    setCallingGuest({ id: guestId, name: guestName });
    await initiateCall(guestId, "audio");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Booking Requests</Text>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
        <View style={styles.tabs}>
          {TAB_LABELS.map((tab) => {
            const count = bookings.filter((b) => b.status === tab).length;
            return (
              <Pressable
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
                {count > 0 && (
                  <View style={[styles.badge, { backgroundColor: STATUS_COLORS[tab] }]}>
                    <Text style={styles.badgeText}>{count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BookingCard
            booking={item}
            onAccept={handleAccept}
            onReject={handleReject}
            onCall={handleCall}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color="#334155" />
            <Text style={styles.emptyText}>No {activeTab} bookings</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      <InCallModal
        visible={callState === "connected" || callState === "calling"}
        callerName={callingGuest?.name ?? "Guest"}
        callType="audio"
        onMute={toggleMute}
        onSpeaker={toggleSpeaker}
        onEnd={endCall}
        isMuted={isMuted}
        isSpeakerOn={isSpeakerOn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  title: { fontSize: 22, fontWeight: "800", color: "#F1F5F9", padding: 16, paddingTop: 52 },
  tabsScroll: { borderBottomWidth: 1, borderBottomColor: "#334155", maxHeight: 50 },
  tabs: { flexDirection: "row", paddingHorizontal: 16, gap: 4 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  tabActive: { backgroundColor: GOLD + "22" },
  tabText: { color: "#64748B", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: GOLD },
  badge: { borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: NAVY, fontSize: 10, fontWeight: "800" },
  list: { padding: 16, paddingBottom: 32 },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { color: "#64748B", fontSize: 15 },
});

const bc = StyleSheet.create({
  container: { backgroundColor: NAVY_LIGHT, borderRadius: 16, padding: 14, marginBottom: 12 },
  corporate: { borderWidth: 1, borderColor: BLUE + "66" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  avatarWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: GOLD + "33", alignItems: "center", justifyContent: "center" },
  avatarText: { color: GOLD, fontSize: 14, fontWeight: "700" },
  guestInfo: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  name: { color: "#F1F5F9", fontSize: 15, fontWeight: "700" },
  loyaltyBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: GOLD + "22", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  loyaltyText: { color: GOLD, fontSize: 10, fontWeight: "700" },
  corpBadge: { backgroundColor: BLUE + "22", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  corpText: { color: BLUE, fontSize: 10, fontWeight: "700" },
  room: { color: "#94A3B8", fontSize: 12, marginTop: 2 },
  dates: { color: "#64748B", fontSize: 11, marginTop: 2 },
  price: { color: GOLD, fontSize: 14, fontWeight: "700" },
  requests: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#0F172A", borderRadius: 8, padding: 8, marginBottom: 8 },
  requestsText: { color: "#94A3B8", fontSize: 12, flex: 1 },
  actions: { flexDirection: "row", gap: 8 },
  acceptBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: GREEN + "22", borderRadius: 10, paddingVertical: 8 },
  acceptText: { color: GREEN, fontSize: 12, fontWeight: "600" },
  rejectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: RED + "22", borderRadius: 10, paddingVertical: 8 },
  rejectText: { color: RED, fontSize: 12, fontWeight: "600" },
  msgBtn: { backgroundColor: BLUE + "22", borderRadius: 10, padding: 10 },
  callBtn: { backgroundColor: GREEN + "22", borderRadius: 10, padding: 10 },
  qrBtn: { backgroundColor: GOLD + "22", borderRadius: 10, padding: 10 },
});

const qrModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center" },
  container: { backgroundColor: NAVY_LIGHT, borderRadius: 20, padding: 28, alignItems: "center", width: 280 },
  title: { color: "#F1F5F9", fontSize: 18, fontWeight: "800", marginBottom: 20 },
  qrPlaceholder: { alignItems: "center", gap: 8, marginBottom: 16 },
  qrId: { color: "#64748B", fontSize: 12 },
  guest: { color: "#F1F5F9", fontSize: 15, fontWeight: "700", marginBottom: 4 },
  detail: { color: "#94A3B8", fontSize: 12, marginBottom: 20 },
  closeBtn: { backgroundColor: GOLD, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  closeBtnText: { color: NAVY, fontWeight: "700" },
});
