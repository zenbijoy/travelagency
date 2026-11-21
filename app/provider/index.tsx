import React, { useState, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert, Switch,
  Animated, TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { useResponsive } from "@/hooks/useResponsive";

const TEAL = "#0D9488";
const GOLD = "#E5A93C";
const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const BORDER = "#334155";
const RED = "#EF4444";

interface QuickStat { label: string; value: string; icon: string; color: string; }
interface UpcomingBooking { id: string; client: string; service: string; time: string; location: string; }
interface QuickAction { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; }

const STATS: QuickStat[] = [
  { label: "Today's Bookings", value: "8", icon: "📅", color: "#0EA5E9" },
  { label: "Pending Requests", value: "3", icon: "⏳", color: GOLD },
  { label: "Total Earnings", value: "৳45,200", icon: "💰", color: TEAL },
  { label: "Rating", value: "⭐ 4.9", icon: "🌟", color: "#F59E0B" },
];

const UPCOMING: UpcomingBooking[] = [
  { id: "1", client: "Rahima Begum", service: "Tour Guide – Cox's Bazar", time: "09:00 AM", location: "Laboni Beach" },
  { id: "2", client: "Karim Hassan", service: "Car Rental – Chittagong", time: "02:00 PM", location: "Chittagong Port" },
  { id: "3", client: "Sara Johnson", service: "Photography – Sajek", time: "06:30 AM", location: "Sajek Valley" },
];

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Add Service", icon: "add-circle-outline", color: TEAL },
  { label: "View Map", icon: "map-outline", color: "#0EA5E9" },
  { label: "Contracts", icon: "document-text-outline", color: GOLD },
  { label: "Call Client", icon: "call-outline", color: "#10B981" },
  { label: "Reviews", icon: "star-outline", color: "#F59E0B" },
];

const CHART_DATA = [5, 8, 3, 9, 6, 11, 8]; // last 7 days bookings
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TRANSLATIONS: Record<"en" | "bn", Record<string, string>> = {
  en: { greeting: "Welcome back,", name: "Ahmad Rahman", online: "Online", offline: "Offline", dashboard: "Provider Dashboard" },
  bn: { greeting: "স্বাগতম,", name: "আহমাদ রহমান", online: "অনলাইন", offline: "অফলাইন", dashboard: "প্রোভাইডার ড্যাশবোর্ড" },
};

export default function ProviderDashboard() {
  const { isDesktop } = useResponsive();
  const [isOnline, setIsOnline] = useState(true);
  const [lang, setLang] = useState<"en" | "bn">("en");
  const t = TRANSLATIONS[lang];
  const maxVal = Math.max(...CHART_DATA);
  const chartH = 80;
  const barW = 28;
  const gap = 10;

  const handleSOS = useCallback(() => {
    Alert.alert(
      "🆘 SOS EMERGENCY",
      "Emergency services notified! Your location has been shared with:\n• Police: 999\n• Fire: 102\n• Ambulance: 199",
      [{ text: "OK", style: "destructive" }]
    );
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <View style={styles.langRow}>
              <Text style={styles.greeting}>{t.greeting}</Text>
              <Pressable style={styles.langToggle} onPress={() => setLang(l => l === "en" ? "bn" : "en")}>
                <Text style={styles.langToggleText}>{lang === "en" ? "বাং" : "EN"}</Text>
              </Pressable>
            </View>
            <View style={styles.nameRow}>
              <Text style={styles.providerName}>{t.name}</Text>
              <View style={styles.verifiedBadge}><Text style={styles.verifiedText}>✅ Verified</Text></View>
            </View>
          </View>
          <Pressable style={[styles.onlineToggle, { backgroundColor: isOnline ? "#065F46" : "#7F1D1D" }]} onPress={() => setIsOnline(o => !o)}>
            <View style={[styles.onlineDot, { backgroundColor: isOnline ? "#34D399" : "#F87171" }]} />
            <Text style={styles.onlineText}>{isOnline ? t.online : t.offline}</Text>
          </Pressable>
        </View>

        {/* Quick Stats */}
        <View style={[styles.statsGrid, isDesktop && styles.statsGridDesktop]}>
          {STATS.map((stat) => (
            <View key={stat.label} style={[styles.statCard, { borderLeftColor: stat.color }]}>
              <Text style={styles.statIcon}>{stat.icon}</Text>
              <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionsRow}>
          {QUICK_ACTIONS.map((action) => (
            <Pressable key={action.label} style={styles.actionBtn} onPress={() => Alert.alert(action.label)}>
              <View style={[styles.actionIcon, { backgroundColor: action.color + "22" }]}>
                <Ionicons name={action.icon} size={22} color={action.color} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Upcoming Services */}
        <Text style={styles.sectionTitle}>Upcoming Services</Text>
        {UPCOMING.map((booking) => (
          <View key={booking.id} style={styles.bookingCard}>
            <View style={styles.bookingLeft}>
              <View style={styles.timeBox}><Text style={styles.timeText}>{booking.time}</Text></View>
            </View>
            <View style={styles.bookingInfo}>
              <Text style={styles.clientName}>{booking.client}</Text>
              <Text style={styles.serviceType}>{booking.service}</Text>
              <Text style={styles.location}>📍 {booking.location}</Text>
            </View>
            <Pressable style={styles.callBtn} onPress={() => Alert.alert("Calling", booking.client)}>
              <Ionicons name="call" size={18} color="#fff" />
            </Pressable>
          </View>
        ))}

        {/* Performance Chart */}
        <Text style={styles.sectionTitle}>Last 7 Days Performance</Text>
        <View style={styles.chartContainer}>
          <Svg width={(barW + gap) * 7 - gap} height={chartH + 24}>
            {CHART_DATA.map((val, i) => {
              const barH = (val / maxVal) * chartH;
              const x = i * (barW + gap);
              const y = chartH - barH;
              return (
                <React.Fragment key={i}>
                  <Rect x={x} y={y} width={barW} height={barH} fill={TEAL} rx={4} />
                  <SvgText x={x + barW / 2} y={chartH + 16} textAnchor="middle" fill="#94A3B8" fontSize={9}>{DAYS[i]}</SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* SOS Button */}
      <Pressable style={styles.sosBtn} onPress={handleSOS}>
        <Ionicons name="call" size={20} color="#fff" />
        <Text style={styles.sosBtnText}>SOS</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  scroll: { flex: 1, padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingTop: 20, marginBottom: 20 },
  langRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  greeting: { color: "#94A3B8", fontSize: 14 },
  langToggle: { backgroundColor: TEAL, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  langToggleText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  providerName: { color: "#F1F5F9", fontSize: 20, fontWeight: "700" },
  verifiedBadge: { backgroundColor: "#065F46", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  verifiedText: { color: "#6EE7B7", fontSize: 11, fontWeight: "600" },
  onlineToggle: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  statsGridDesktop: { flexWrap: "nowrap" },
  statCard: { flex: 1, minWidth: "45%", backgroundColor: NAVY_LIGHT, borderRadius: 12, padding: 14, borderLeftWidth: 3, borderWidth: 1, borderColor: BORDER },
  statIcon: { fontSize: 22, marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: "700", marginBottom: 2 },
  statLabel: { color: "#94A3B8", fontSize: 11 },
  sectionTitle: { color: "#94A3B8", fontSize: 13, fontWeight: "600", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  actionsRow: { marginBottom: 20 },
  actionBtn: { alignItems: "center", marginRight: 16 },
  actionIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  actionLabel: { color: "#CBD5E1", fontSize: 11, fontWeight: "500" },
  bookingCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: NAVY_LIGHT, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: BORDER },
  bookingLeft: { alignItems: "center" },
  timeBox: { backgroundColor: TEAL + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  timeText: { color: TEAL, fontSize: 12, fontWeight: "700" },
  bookingInfo: { flex: 1 },
  clientName: { color: "#F1F5F9", fontSize: 14, fontWeight: "600", marginBottom: 2 },
  serviceType: { color: TEAL, fontSize: 12, marginBottom: 2 },
  location: { color: "#64748B", fontSize: 11 },
  callBtn: { backgroundColor: "#10B981", width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  chartContainer: { backgroundColor: NAVY_LIGHT, borderRadius: 12, padding: 16, marginBottom: 20, alignItems: "center", borderWidth: 1, borderColor: BORDER },
  sosBtn: { position: "absolute", bottom: 90, right: 20, backgroundColor: RED, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30, elevation: 8, shadowColor: RED, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8 },
  sosBtnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 1 },
});
