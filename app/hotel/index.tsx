import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  Animated,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useResponsive } from "@/hooks/useResponsive";
import { useHotelPmsStore, useHotelPmsComputed, HotelReservation } from "@/features/hotel";
import { PortalAlertsModal } from "@/components/notifications/PortalAlertsModal";
import {
  notificationCommandService,
  PortalScopedAlert,
} from "@/services/notificationCommandService";

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

interface QuickAction {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "1", label: "Room Matrix", icon: "grid-outline", route: "/hotel/rooms", color: "#3B82F6" },
  { id: "2", label: "Tape Chart", icon: "calendar-outline", route: "/hotel/calendar", color: GREEN },
  { id: "3", label: "Yield & Payout", icon: "trending-up-outline", route: "/hotel/revenue", color: GOLD },
  { id: "4", label: "Ops & Concierge", icon: "construct-outline", route: "/hotel/more", color: "#A855F7" },
];

function RevenueSparkline({ trendData }: { trendData: Array<{ label: string; amountBdt: number }> }) {
  const max = Math.max(1, ...trendData.map((d) => d.amountBdt));
  return (
    <View style={spark.container}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Text style={spark.title}>7-Day Revenue Trajectory</Text>
        <Text style={{ color: GOLD, fontSize: 12, fontWeight: "700" }}>Live PMS Data</Text>
      </View>
      <View style={spark.chart}>
        {trendData.map((item, i) => (
          <View key={i} style={spark.barCol}>
            <View style={[spark.bar, { height: Math.max(8, (item.amountBdt / max) * 80) }]} />
            <Text style={spark.label}>{item.label}</Text>
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
        <Text style={[card.change, { color: stat.change.startsWith("-") ? RED : GREEN }]}>{stat.change}</Text>
      </View>
      <Text style={card.value}>{stat.value}</Text>
      <Text style={card.label}>{stat.label}</Text>
    </View>
  );
}

function BookingCard({
  booking,
  onConfirm,
  onCancel,
  onCheckIn,
}: {
  booking: HotelReservation;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onCheckIn: (b: HotelReservation) => void;
}) {
  const acceptAnim = useRef(new Animated.Value(1)).current;
  const rejectAnim = useRef(new Animated.Value(1)).current;

  const initials = booking.guestName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleConfirm = () => {
    Animated.sequence([
      Animated.timing(acceptAnim, { toValue: 0.9, duration: 90, useNativeDriver: true }),
      Animated.timing(acceptAnim, { toValue: 1, duration: 90, useNativeDriver: true }),
    ]).start(() => onConfirm(booking.id));
  };

  const handleCancel = () => {
    Animated.sequence([
      Animated.timing(rejectAnim, { toValue: 0.9, duration: 90, useNativeDriver: true }),
      Animated.timing(rejectAnim, { toValue: 1, duration: 90, useNativeDriver: true }),
    ]).start(() => onCancel(booking.id));
  };

  return (
    <View style={bcard.container}>
      <View style={bcard.avatar}>
        <Text style={bcard.avatarText}>{initials}</Text>
      </View>
      <View style={bcard.info}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={bcard.name}>{booking.guestName}</Text>
          {booking.isVip && (
            <View style={{ backgroundColor: GOLD + "33", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
              <Text style={{ color: GOLD, fontSize: 9, fontWeight: "700" }}>VIP</Text>
            </View>
          )}
        </View>
        <Text style={bcard.room}>{booking.roomType} • {booking.bookingReference}</Text>
        <Text style={bcard.dates}>{booking.checkInDate} → {booking.checkOutDate}</Text>
      </View>
      <View style={bcard.right}>
        <Text style={bcard.price}>৳{booking.totalPriceBdt.toLocaleString()}</Text>
        {booking.status === "pending" && (
          <View style={bcard.buttons}>
            <Animated.View style={{ transform: [{ scale: acceptAnim }] }}>
              <Pressable style={bcard.acceptBtn} onPress={handleConfirm}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </Pressable>
            </Animated.View>
            <Animated.View style={{ transform: [{ scale: rejectAnim }] }}>
              <Pressable style={bcard.rejectBtn} onPress={handleCancel}>
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </Animated.View>
          </View>
        )}
        {booking.status === "confirmed" && (
          <Pressable
            style={[bcard.confirmedBadge, { backgroundColor: GREEN + "33", flexDirection: "row", alignItems: "center", gap: 4 }]}
            onPress={() => onCheckIn(booking)}
          >
            <Ionicons name="key-outline" size={12} color={GREEN} />
            <Text style={bcard.confirmedText}>Express Check-In</Text>
          </Pressable>
        )}
        {booking.status === "checked_in" && (
          <View style={[bcard.confirmedBadge, { backgroundColor: "#3B82F633" }]}>
            <Text style={[bcard.confirmedText, { color: "#60A5FA" }]}>In-House</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function HotelDashboard() {
  const { isDesktop, contentMaxWidth } = useResponsive();
  const router = useRouter();

  const {
    workspace,
    initWorkspace,
    refreshWorkspace,
    isSyncing,
    isOffline,
    offlineQueueCount,
    patchWorkspace,
    expressCheckIn,
    syncOfflineQueue,
  } = useHotelPmsStore();
  const { currentProperty, kpis, activeReservations, pendingHousekeeping } = useHotelPmsComputed();

  const [showNotif, setShowNotif] = useState(true);
  const [hotelAlertsModalOpen, setHotelAlertsModalOpen] = useState(false);
  const [scopedHotelAlerts, setScopedHotelAlerts] = useState<PortalScopedAlert[]>([]);

  useEffect(() => {
    initWorkspace();
  }, []);

  useEffect(() => {
    if (!currentProperty?.id) return;
    let active = true;
    notificationCommandService
      .fetchScopedPortalAlerts("hotel", currentProperty.id)
      .then((list) => {
        if (!active) return;
        if (list.length > 0) {
          setScopedHotelAlerts(list);
          return;
        }
        const pendingLocal = workspace.reservations
          .filter((r) => r.hotelId === currentProperty.id)
          .slice(0, 6)
          .map(
            (r): PortalScopedAlert => ({
              id: `htl-${r.id}`,
              portal_type: "hotel",
              tenant_id: currentProperty.id,
              title: `${r.guestName} — ${r.roomType}`,
              body: `Ref ${r.bookingReference} • Check-in ${r.checkInDate} (${r.status})`,
              category: "hotel",
              priority: r.status === "pending" ? "high" : "normal",
              deep_link: "/hotel/bookings",
              is_read: false,
              created_at: new Date().toISOString(),
              source: "supabase",
            })
          );
        setScopedHotelAlerts(pendingLocal);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [currentProperty?.id, workspace.reservations.length]);

  const handleConfirm = (id: string) => {
    patchWorkspace((draft) => ({
      ...draft,
      reservations: draft.reservations.map((r) =>
        r.id === id ? { ...r, status: "confirmed" } : r
      ),
    }));
  };

  const handleCancel = (id: string) => {
    patchWorkspace((draft) => ({
      ...draft,
      reservations: draft.reservations.map((r) =>
        r.id === id ? { ...r, status: "cancelled" } : r
      ),
    }));
  };

  const handleExpressCheckIn = async (booking: HotelReservation) => {
    const vacantUnit =
      workspace.units.find(
        (u) => u.hotelId === currentProperty.id && u.occupancyStatus === "vacant" && (u.housekeepingStatus === "ready" || u.housekeepingStatus === "clean")
      ) || workspace.units.find((u) => u.hotelId === currentProperty.id);

    if (!vacantUnit) {
      Alert.alert("No Ready Rooms", "Please inspect or prepare a vacant room first.");
      return;
    }

    const res = await expressCheckIn({
      bookingReference: booking.bookingReference,
      roomUnitId: vacantUnit.id,
      nidOrPassportVerified: true,
    });

    if (res.success) {
      Alert.alert(
        "Express Check-In Complete",
        `${booking.guestName} checked into Room ${res.roomNumber}.\nDigital Key Code: ${res.qrPassCode}`
      );
    } else {
      Alert.alert("Check-In Error", res.error || "Unable to complete check-in");
    }
  };

  const quickStats: QuickStat[] = [
    {
      id: "1",
      label: "Occupancy Rate",
      value: `${kpis.occupancyRatePct}%`,
      icon: "bed-outline",
      color: "#3B82F6",
      change: `${kpis.occupiedUnits}/${kpis.totalUnits} Rooms`,
    },
    {
      id: "2",
      label: "RevPAR / ADR",
      value: `৳${kpis.revParBdt.toLocaleString()}`,
      icon: "trending-up-outline",
      color: GOLD,
      change: `ADR ৳${kpis.adrBdt.toLocaleString()}`,
    },
    {
      id: "3",
      label: "Rooms Ready",
      value: `${kpis.vacantReadyUnits}`,
      icon: "checkmark-circle-outline",
      color: GREEN,
      change: `${pendingHousekeeping.length} HK Pending`,
    },
    {
      id: "4",
      label: "Gross Revenue",
      value: `৳${kpis.grossRevenueBdt.toLocaleString()}`,
      icon: "cash-outline",
      color: "#A855F7",
      change: `GOPPAR ৳${kpis.gopparBdt.toLocaleString()}`,
    },
  ];

  const firstPending = workspace.reservations.find(
    (r) => r.hotelId === currentProperty.id && r.status === "pending"
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          isDesktop && { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isSyncing} onRefresh={refreshWorkspace} tintColor={GOLD} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hotelName}>{currentProperty.name}</Text>
            <Text style={styles.subtitle}>
              {currentProperty.city} • {isOffline ? "Offline Cache Active" : "Live Synced"}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                style={{
                  backgroundColor: NAVY_LIGHT,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                }}
                onPress={() => setHotelAlertsModalOpen(true)}
                accessibilityLabel="Open Hotel Scoped Alerts"
              >
                <Ionicons name="notifications-outline" size={14} color={GOLD} />
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                  {scopedHotelAlerts.filter((a) => !a.is_read).length}
                </Text>
              </Pressable>
              <View style={styles.occupancyBadge}>
                <Text style={styles.occupancyText}>{kpis.occupancyRatePct}% Occupied</Text>
              </View>
            </View>
            {offlineQueueCount > 0 && (
              <Pressable
                style={{ backgroundColor: "#F59E0B33", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}
                onPress={syncOfflineQueue}
              >
                <Text style={{ color: "#F59E0B", fontSize: 10, fontWeight: "700" }}>
                  Sync {offlineQueueCount} Pending
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Live Alert Banner */}
        {showNotif && firstPending && (
          <View style={styles.notifBanner}>
            <Ionicons name="notifications" size={16} color={NAVY} />
            <Text style={styles.notifText}>
              Pending arrival: {firstPending.guestName} — {firstPending.roomType} ({firstPending.checkInDate})
            </Text>
            <Pressable onPress={() => setShowNotif(false)}>
              <Ionicons name="close" size={16} color={NAVY} />
            </Pressable>
          </View>
        )}

        {/* Quick Stats */}
        <View style={[styles.statsGrid, isDesktop && styles.statsGridDesktop]}>
          {quickStats.map((stat) => (
            <StatCard key={stat.id} stat={stat} />
          ))}
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>PMS Command Console</Text>
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

        {/* Revenue Sparkline from Computed Live KPIs */}
        <RevenueSparkline trendData={kpis.dailyRevenueSeries} />

        {/* Live Reservations */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={styles.sectionTitle}>Active & Incoming Bookings ({activeReservations.length})</Text>
          <Pressable onPress={() => router.push("/hotel/bookings" as Parameters<typeof router.push>[0])}>
            <Text style={{ color: GOLD, fontSize: 12, fontWeight: "600" }}>Manage All</Text>
          </Pressable>
        </View>
        <FlatList
          data={workspace.reservations.filter((r) => r.hotelId === currentProperty.id && r.status !== "cancelled").slice(0, 6)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BookingCard
              booking={item}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
              onCheckIn={handleExpressCheckIn}
            />
          )}
          scrollEnabled={false}
        />

      <PortalAlertsModal
        visible={hotelAlertsModalOpen}
        portalType="hotel"
        tenantId={currentProperty.id}
        alerts={scopedHotelAlerts}
        onClose={() => setHotelAlertsModalOpen(false)}
        onMarkRead={(id) =>
          setScopedHotelAlerts((prev) =>
            prev.map((a) => (a.id === id ? { ...a, is_read: true } : a))
          )
        }
        onMarkAllRead={() =>
          setScopedHotelAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })))
        }
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
  hotelName: { fontSize: 21, fontWeight: "800", color: "#F1F5F9" },
  subtitle: { fontSize: 12, color: "#94A3B8", marginTop: 4 },
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
  change: { fontSize: 10, fontWeight: "700" },
  value: { fontSize: 20, fontWeight: "800", color: "#F1F5F9" },
  label: { fontSize: 11, color: "#94A3B8", marginTop: 4 },
});

const bcard = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", backgroundColor: NAVY_LIGHT, borderRadius: 14, padding: 12, marginBottom: 10, gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: GOLD + "33", alignItems: "center", justifyContent: "center" },
  avatarText: { color: GOLD, fontSize: 14, fontWeight: "700" },
  info: { flex: 1 },
  name: { color: "#F1F5F9", fontSize: 14, fontWeight: "700" },
  room: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  dates: { color: "#64748B", fontSize: 11, marginTop: 2 },
  right: { alignItems: "flex-end", gap: 6 },
  price: { color: GOLD, fontSize: 13, fontWeight: "700" },
  buttons: { flexDirection: "row", gap: 6 },
  acceptBtn: { backgroundColor: GREEN, borderRadius: 8, padding: 6 },
  rejectBtn: { backgroundColor: RED, borderRadius: 8, padding: 6 },
  confirmedBadge: { backgroundColor: GREEN + "33", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  confirmedText: { color: GREEN, fontSize: 10, fontWeight: "700" },
});

const spark = StyleSheet.create({
  container: { backgroundColor: NAVY_LIGHT, borderRadius: 14, padding: 16, marginBottom: 20 },
  title: { color: "#F1F5F9", fontSize: 14, fontWeight: "700" },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 100, gap: 8 },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  bar: { width: "100%", backgroundColor: GOLD, borderRadius: 4 },
  label: { color: "#64748B", fontSize: 10 },
});
