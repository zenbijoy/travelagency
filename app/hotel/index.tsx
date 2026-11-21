import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useResponsive } from "@/hooks/useResponsive";

const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const GOLD = "#E5A93C";
const GREEN = "#22C55E";
const RED = "#EF4444";

interface QuickStat {
  id: string;
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  change: string;
}

interface UpcomingBooking {
  id: string;
  guestName: string;
  avatar: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  status: "pending" | "confirmed";
}

interface QuickAction {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
}

const QUICK_STATS: QuickStat[] = [
  { id: "1", label: "Check-ins Today", value: "8", icon: "log-in-outline", color: "#3B82F6", change: "+2" },
  { id: "2", label: "Pending Bookings", value: "14", icon: "time-outline", color: GOLD, change: "+5" },
  { id: "3", label: "Rooms Available", value: "12", icon: "bed-outline", color: GREEN, change: "-3" },
  { id: "4", label: "Revenue Today", value: "৳48,200", icon: "cash-outline", color: "#A855F7", change: "+৳12k" },
];

const UPCOMING_BOOKINGS: UpcomingBooking[] = [
  { id: "1", guestName: "Rahman Khan", avatar: "RK", roomType: "Deluxe Suite", checkIn: "Nov 14", checkOut: "Nov 17", totalPrice: 18500, status: "pending" },
  { id: "2", guestName: "Fatima Begum", avatar: "FB", roomType: "Double Room", checkIn: "Nov 15", checkOut: "Nov 16", totalPrice: 6200, status: "pending" },
  { id: "3", guestName: "Arif Hossain", avatar: "AH", roomType: "Single Room", checkIn: "Nov 15", checkOut: "Nov 18", totalPrice: 9000, status: "confirmed" },
  { id: "4", guestName: "Priya Das", avatar: "PD", roomType: "Suite", checkIn: "Nov 16", checkOut: "Nov 20", totalPrice: 32000, status: "pending" },
  { id: "5", guestName: "Karim Ali", avatar: "KA", roomType: "Double Room", checkIn: "Nov 16", checkOut: "Nov 17", totalPrice: 6200, status: "pending" },
];

const QUICK_ACTIONS: QuickAction[] = [
  { id: "1", label: "Add Room", icon: "add-circle-outline", route: "/hotel/rooms", color: "#3B82F6" },
  { id: "2", label: "Calendar", icon: "calendar-outline", route: "/hotel/calendar", color: GREEN },
  { id: "3", label: "Contracts", icon: "document-text-outline", route: "/hotel/contract", color: GOLD },
  { id: "4", label: "Reviews", icon: "star-outline", route: "/hotel/more", color: "#A855F7" },
];

const REVENUE_BARS = [42, 68, 55, 80, 65, 90, 72];
const REVENUE_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function RevenueSparkline() {
  const max = Math.max(...REVENUE_BARS);
  return (
    <View style={spark.container}>
      <Text style={spark.title}>Revenue Last 7 Days</Text>
      <View style={spark.chart}>
        {REVENUE_BARS.map((val, i) => (
          <View key={i} style={spark.barCol}>
            <View style={[spark.bar, { height: (val / max) * 80 }]} />
            <Text style={spark.label}>{REVENUE_LABELS[i]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StatCard({ stat }: { stat: QuickStat }) {
  return (
    <View style={[card.container, { borderLeftColor: stat.color }]}>
      <View style={card.row}>
        <Ionicons name={stat.icon} size={20} color={stat.color} />
        <Text style={[card.change, { color: stat.change.startsWith("+") ? GREEN : RED }]}>{stat.change}</Text>
      </View>
      <Text style={card.value}>{stat.value}</Text>
      <Text style={card.label}>{stat.label}</Text>
    </View>
  );
}

function BookingCard({ booking, onAccept, onReject }: { booking: UpcomingBooking; onAccept: (id: string) => void; onReject: (id: string) => void }) {
  const acceptAnim = useRef(new Animated.Value(1)).current;
  const rejectAnim = useRef(new Animated.Value(1)).current;

  const handleAccept = () => {
    Animated.sequence([
      Animated.timing(acceptAnim, { toValue: 0.9, duration: 100, useNativeDriver: true }),
      Animated.timing(acceptAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start(() => onAccept(booking.id));
  };

  const handleReject = () => {
    Animated.sequence([
      Animated.timing(rejectAnim, { toValue: 0.9, duration: 100, useNativeDriver: true }),
      Animated.timing(rejectAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start(() => onReject(booking.id));
  };

  return (
    <View style={bcard.container}>
      <View style={bcard.avatar}>
        <Text style={bcard.avatarText}>{booking.avatar}</Text>
      </View>
      <View style={bcard.info}>
        <Text style={bcard.name}>{booking.guestName}</Text>
        <Text style={bcard.room}>{booking.roomType}</Text>
        <Text style={bcard.dates}>{booking.checkIn} → {booking.checkOut}</Text>
      </View>
      <View style={bcard.right}>
        <Text style={bcard.price}>৳{booking.totalPrice.toLocaleString()}</Text>
        {booking.status === "pending" && (
          <View style={bcard.buttons}>
            <Animated.View style={{ transform: [{ scale: acceptAnim }] }}>
              <Pressable style={bcard.acceptBtn} onPress={handleAccept}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </Pressable>
            </Animated.View>
            <Animated.View style={{ transform: [{ scale: rejectAnim }] }}>
              <Pressable style={bcard.rejectBtn} onPress={handleReject}>
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </Animated.View>
          </View>
        )}
        {booking.status === "confirmed" && (
          <View style={bcard.confirmedBadge}>
            <Text style={bcard.confirmedText}>Confirmed</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function HotelDashboard() {
  const { isDesktop, contentMaxWidth } = useResponsive();
  const router = useRouter();
  const [bookings, setBookings] = useState<UpcomingBooking[]>(UPCOMING_BOOKINGS);
  const [showNotif, setShowNotif] = useState(true);

  const handleAccept = (id: string) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "confirmed" as const } : b))
    );
  };

  const handleReject = (id: string) => {
    setBookings((prev) => prev.filter((b) => b.id !== id));
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
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.hotelName}>Grand Palace Hotel</Text>
            <Text style={styles.subtitle}>Good morning, Manager 👋</Text>
          </View>
          <View style={styles.occupancyBadge}>
            <Text style={styles.occupancyText}>76% Occupied</Text>
          </View>
        </View>

        {/* Notification Banner */}
        {showNotif && (
          <View style={styles.notifBanner}>
            <Ionicons name="notifications" size={16} color={NAVY} />
            <Text style={styles.notifText}>🔔 New booking request from Rahman Khan — Deluxe Suite</Text>
            <Pressable onPress={() => setShowNotif(false)}>
              <Ionicons name="close" size={16} color={NAVY} />
            </Pressable>
          </View>
        )}

        {/* Quick Stats */}
        <View style={[styles.statsGrid, isDesktop && styles.statsGridDesktop]}>
          {QUICK_STATS.map((stat) => (
            <StatCard key={stat.id} stat={stat} />
          ))}
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          {QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.id}
              style={[styles.actionBtn, { backgroundColor: action.color + "22" }]}
              onPress={() => router.push(action.route as Parameters<typeof router.push>[0])}
            >
              <Ionicons name={action.icon} size={24} color={action.color} />
              <Text style={[styles.actionLabel, { color: action.color }]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Revenue Sparkline */}
        <RevenueSparkline />

        {/* Upcoming Bookings */}
        <Text style={styles.sectionTitle}>Upcoming Bookings</Text>
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BookingCard booking={item} onAccept={handleAccept} onReject={handleReject} />
          )}
          scrollEnabled={false}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingTop: 48 },
  hotelName: { fontSize: 22, fontWeight: "800", color: "#F1F5F9" },
  subtitle: { fontSize: 13, color: "#94A3B8", marginTop: 4 },
  occupancyBadge: { backgroundColor: GOLD + "33", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: GOLD },
  occupancyText: { color: GOLD, fontSize: 12, fontWeight: "700" },
  notifBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: GOLD, borderRadius: 12, padding: 12, marginBottom: 16 },
  notifText: { flex: 1, color: NAVY, fontSize: 12, fontWeight: "600" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  statsGridDesktop: { flexWrap: "nowrap" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#F1F5F9", marginBottom: 12, marginTop: 8 },
  actionsRow: { flexDirection: "row", gap: 10, marginBottom: 20, flexWrap: "wrap" },
  actionBtn: { flex: 1, minWidth: 70, alignItems: "center", padding: 14, borderRadius: 14, gap: 6 },
  actionLabel: { fontSize: 11, fontWeight: "600" },
});

const card = StyleSheet.create({
  container: { flex: 1, minWidth: "45%", backgroundColor: NAVY_LIGHT, borderRadius: 14, padding: 14, borderLeftWidth: 3 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  change: { fontSize: 11, fontWeight: "700" },
  value: { fontSize: 22, fontWeight: "800", color: "#F1F5F9" },
  label: { fontSize: 11, color: "#94A3B8", marginTop: 4 },
});

const bcard = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", backgroundColor: NAVY_LIGHT, borderRadius: 14, padding: 12, marginBottom: 10, gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: GOLD + "33", alignItems: "center", justifyContent: "center" },
  avatarText: { color: GOLD, fontSize: 14, fontWeight: "700" },
  info: { flex: 1 },
  name: { color: "#F1F5F9", fontSize: 14, fontWeight: "700" },
  room: { color: "#94A3B8", fontSize: 12, marginTop: 2 },
  dates: { color: "#64748B", fontSize: 11, marginTop: 2 },
  right: { alignItems: "flex-end", gap: 6 },
  price: { color: GOLD, fontSize: 13, fontWeight: "700" },
  buttons: { flexDirection: "row", gap: 6 },
  acceptBtn: { backgroundColor: GREEN, borderRadius: 8, padding: 6 },
  rejectBtn: { backgroundColor: RED, borderRadius: 8, padding: 6 },
  confirmedBadge: { backgroundColor: GREEN + "33", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  confirmedText: { color: GREEN, fontSize: 10, fontWeight: "700" },
});

const spark = StyleSheet.create({
  container: { backgroundColor: NAVY_LIGHT, borderRadius: 14, padding: 16, marginBottom: 20 },
  title: { color: "#F1F5F9", fontSize: 14, fontWeight: "700", marginBottom: 12 },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 100, gap: 8 },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  bar: { width: "100%", backgroundColor: GOLD, borderRadius: 4 },
  label: { color: "#64748B", fontSize: 10 },
});
