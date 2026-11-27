import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Linking,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { useResponsive } from "@/hooks/useResponsive";
import { useProviderHubStore } from "@/features/rider/providerStore";
import { useRiderStore } from "@/store/riderStore";
import { formatPaisaBDT } from "@/features/rider/calculators";
import { sosService } from "@/services/safety/sosService";

const TEAL = "#0D9488";
const GOLD = "#E5A93C";
const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const BORDER = "#334155";
const RED = "#EF4444";

const TRANSLATIONS: Record<"en" | "bn", Record<string, string>> = {
  en: {
    greeting: "Welcome back,",
    online: "Online",
    offline: "Offline",
  },
  bn: {
    greeting: "স্বাগতম,",
    online: "অনলাইন",
    offline: "অফলাইন",
  },
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function ProviderDashboard() {
  const { isDesktop } = useResponsive();
  const router = useRouter();
  const [lang, setLang] = useState<"en" | "bn">("en");
  const [refreshing, setRefreshing] = useState(false);

  const providerName = useProviderHubStore((s) => s.providerName);
  const verified = useProviderHubStore((s) => s.verified);
  const rating = useProviderHubStore((s) => s.rating);
  const isOnline = useProviderHubStore((s) => s.isOnline);
  const bookings = useProviderHubStore((s) => s.bookings);
  const services = useProviderHubStore((s) => s.services);
  const isHydrated = useProviderHubStore((s) => s.isHydrated);
  const hydrateProviderHub = useProviderHubStore((s) => s.hydrateProviderHub);
  const toggleOnline = useProviderHubStore((s) => s.toggleOnline);

  const profitSummary = useRiderStore((s) => s.profitSummary);
  const ledgerEntries = useRiderStore((s) => s.ledgerEntries);

  useEffect(() => {
    if (!isHydrated) {
      hydrateProviderHub().catch(() => {});
    }
  }, [isHydrated, hydrateProviderHub]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await hydrateProviderHub();
    setRefreshing(false);
  }, [hydrateProviderHub]);

  const handleSOS = useCallback(async () => {
    Alert.alert(
      "🆘 EMERGENCY SOS",
      "Dispatch real-time GPS beacon to Bangladesh 999 Safety Network & emergency contacts?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "DISPATCH SOS",
          style: "destructive",
          onPress: async () => {
            const res = await sosService.triggerOneTapSOS(
              `Provider Hub SOS triggered by ${providerName}`
            );
            Alert.alert(
              res.success ? "SOS Dispatched" : "SOS Queued Offline",
              res.coordinates
                ? `Emergency alert sent. Location: ${res.coordinates.latitude.toFixed(4)}, ${res.coordinates.longitude.toFixed(4)}`
                : "Emergency services & trusted contacts alerted."
            );
          },
        },
      ]
    );
  }, [providerName]);

  const t = TRANSLATIONS[lang];
  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const bookedTotalPaisa = bookings.reduce((sum, b) => sum + b.amountPaisa, 0);
  const combinedEarningsPaisa =
    bookedTotalPaisa + profitSummary.netTakeHomePaisa;

  // Derive 7-day activity chart dynamically from ledger entries + bookings
  const chartValues = DAYS.map((_, idx) => {
    const dayBookings = bookings.filter((b) => {
      const dayIdx = (new Date(b.dateIso).getDay() + 6) % 7;
      return dayIdx === idx;
    }).length;
    const dayLedger = ledgerEntries.filter((e) => {
      const dayIdx = (new Date(e.created_at).getDay() + 6) % 7;
      return e.direction === "credit" && dayIdx === idx;
    }).length;
    return Math.max(1, dayBookings + dayLedger);
  });

  const maxVal = Math.max(1, ...chartValues);
  const chartH = 80;
  const barW = 28;
  const gap = 10;

  const stats = [
    {
      label: "Active Services",
      value: String(services.filter((s) => s.status === "Active").length),
      icon: "🛠️",
      color: "#0EA5E9",
    },
    {
      label: "Pending Requests",
      value: String(pendingCount),
      icon: "⏳",
      color: GOLD,
    },
    {
      label: "Combined Earnings",
      value: formatPaisaBDT(combinedEarningsPaisa),
      icon: "💰",
      color: TEAL,
    },
    {
      label: "Partner Rating",
      value: `⭐ ${rating.toFixed(2)}`,
      icon: "🌟",
      color: "#F59E0B",
    },
  ];

  const quickActions: Array<{
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    onPress: () => void;
  }> = [
    {
      label: "Add Service",
      icon: "add-circle-outline",
      color: TEAL,
      onPress: () => router.push("/provider/services" as Parameters<typeof router.push>[0]),
    },
    {
      label: "Rider Radar",
      icon: "radio-outline",
      color: "#10B981",
      onPress: () => router.push("/rider/dispatch" as Parameters<typeof router.push>[0]),
    },
    {
      label: "Contracts",
      icon: "document-text-outline",
      color: GOLD,
      onPress: () => router.push("/provider/contract" as Parameters<typeof router.push>[0]),
    },
    {
      label: "Schedule",
      icon: "calendar-outline",
      color: "#0EA5E9",
      onPress: () => router.push("/provider/schedule" as Parameters<typeof router.push>[0]),
    },
    {
      label: "Earnings",
      icon: "wallet-outline",
      color: "#F59E0B",
      onPress: () => router.push("/provider/earnings" as Parameters<typeof router.push>[0]),
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <View style={styles.langRow}>
              <Text style={styles.greeting}>{t.greeting}</Text>
              <Pressable
                style={styles.langToggle}
                onPress={() => setLang((l) => (l === "en" ? "bn" : "en"))}
              >
                <Text style={styles.langToggleText}>
                  {lang === "en" ? "বাং" : "EN"}
                </Text>
              </Pressable>
            </View>
            <View style={styles.nameRow}>
              <Text style={styles.providerName}>{providerName}</Text>
              {verified && (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✅ Verified</Text>
                </View>
              )}
            </View>
          </View>
          <Pressable
            style={[
              styles.onlineToggle,
              { backgroundColor: isOnline ? "#065F46" : "#7F1D1D" },
            ]}
            onPress={toggleOnline}
          >
            <View
              style={[
                styles.onlineDot,
                { backgroundColor: isOnline ? "#34D399" : "#F87171" },
              ]}
            />
            <Text style={styles.onlineText}>
              {isOnline ? t.online : t.offline}
            </Text>
          </Pressable>
        </View>

        {/* Live Metrics */}
        <View style={[styles.statsGrid, isDesktop && styles.statsGridDesktop]}>
          {stats.map((stat) => (
            <View
              key={stat.label}
              style={[styles.statCard, { borderLeftColor: stat.color }]}
            >
              <Text style={styles.statIcon}>{stat.icon}</Text>
              <Text style={[styles.statValue, { color: stat.color }]}>
                {stat.value}
              </Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.actionsRow}
        >
          {quickActions.map((action) => (
            <Pressable
              key={action.label}
              style={styles.actionBtn}
              onPress={action.onPress}
            >
              <View
                style={[
                  styles.actionIcon,
                  { backgroundColor: action.color + "22" },
                ]}
              >
                <Ionicons name={action.icon} size={22} color={action.color} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Upcoming Scheduled Services */}
        <Text style={styles.sectionTitle}>
          Upcoming Services ({bookings.length})
        </Text>
        {bookings.map((booking) => (
          <View key={booking.id} style={styles.bookingCard}>
            <View style={styles.bookingLeft}>
              <View style={styles.timeBox}>
                <Text style={styles.timeText}>{booking.timeSlot}</Text>
              </View>
            </View>
            <View style={styles.bookingInfo}>
              <Text style={styles.clientName}>{booking.clientName}</Text>
              <Text style={styles.serviceType}>{booking.serviceTitle}</Text>
              <Text style={styles.location}>
                📍 {booking.location} • {booking.dateIso}
              </Text>
            </View>
            <Pressable
              style={styles.callBtn}
              onPress={() =>
                Linking.openURL(`tel:${booking.clientPhone}`).catch(() =>
                  Alert.alert("Client Phone", booking.clientPhone)
                )
              }
            >
              <Ionicons name="call" size={18} color="#fff" />
            </Pressable>
          </View>
        ))}

        {/* 7 Days Activity Chart */}
        <Text style={styles.sectionTitle}>Last 7 Days Fulfillment Activity</Text>
        <View style={styles.chartContainer}>
          <Svg width={(barW + gap) * 7 - gap} height={chartH + 24}>
            {chartValues.map((val, i) => {
              const barH = (val / maxVal) * chartH;
              const x = i * (barW + gap);
              const y = chartH - barH;
              return (
                <React.Fragment key={DAYS[i]}>
                  <Rect
                    x={x}
                    y={y}
                    width={barW}
                    height={barH}
                    fill={TEAL}
                    rx={4}
                  />
                  <SvgText
                    x={x + barW / 2}
                    y={chartH + 16}
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize={9}
                  >
                    {DAYS[i]}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* SOS Button */}
      <Pressable style={styles.sosBtn} onPress={handleSOS}>
        <Ionicons name="shield-half" size={20} color="#fff" />
        <Text style={styles.sosBtnText}>SOS</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  scroll: { flex: 1, padding: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: 20,
    marginBottom: 20,
  },
  langRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  greeting: { color: "#94A3B8", fontSize: 14 },
  langToggle: {
    backgroundColor: TEAL,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  langToggleText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  providerName: { color: "#F1F5F9", fontSize: 20, fontWeight: "700" },
  verifiedBadge: {
    backgroundColor: "#065F46",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  verifiedText: { color: "#6EE7B7", fontSize: 11, fontWeight: "600" },
  onlineToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  statsGridDesktop: { flexWrap: "nowrap" },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: NAVY_LIGHT,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statIcon: { fontSize: 22, marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: "700", marginBottom: 2 },
  statLabel: { color: "#94A3B8", fontSize: 11 },
  sectionTitle: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionsRow: { marginBottom: 20 },
  actionBtn: { alignItems: "center", marginRight: 16 },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  actionLabel: { color: "#CBD5E1", fontSize: 11, fontWeight: "500" },
  bookingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: NAVY_LIGHT,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  bookingLeft: { alignItems: "center" },
  timeBox: {
    backgroundColor: TEAL + "22",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  timeText: { color: TEAL, fontSize: 12, fontWeight: "700" },
  bookingInfo: { flex: 1 },
  clientName: { color: "#F1F5F9", fontSize: 14, fontWeight: "600", marginBottom: 2 },
  serviceType: { color: TEAL, fontSize: 12, marginBottom: 2 },
  location: { color: "#64748B", fontSize: 11 },
  callBtn: {
    backgroundColor: "#10B981",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  chartContainer: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  sosBtn: {
    position: "absolute",
    bottom: 90,
    right: 20,
    backgroundColor: RED,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    elevation: 8,
    shadowColor: RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  sosBtnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 1 },
});
