import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";

const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const GOLD = "#E5A93C";
const GREEN = "#22C55E";
const BLUE = "#3B82F6";
const PURPLE = "#A855F7";
const RED = "#EF4444";
const YELLOW = "#F59E0B";

interface RevenueCard {
  id: string;
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  change: string;
}

interface PayoutItem {
  id: string;
  amount: string;
  date: string;
  status: "Pending" | "Processing" | "Completed";
}

interface CompetitorPrice {
  id: string;
  name: string;
  price: string;
  diff: "lower" | "higher" | "same";
}

interface AiInsight {
  id: string;
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const REVENUE_CARDS: RevenueCard[] = [
  { id: "1", label: "Total Revenue", value: "৳4,82,500", icon: "wallet-outline", color: GOLD, change: "+18%" },
  { id: "2", label: "This Month", value: "৳1,24,200", icon: "calendar-outline", color: BLUE, change: "+12%" },
  { id: "3", label: "This Week", value: "৳28,600", icon: "time-outline", color: GREEN, change: "+5%" },
];

const BAR_DATA = [42000, 68500, 55000, 80000, 65000, 90000, 72000];
const BAR_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const PAYOUTS: PayoutItem[] = [
  { id: "1", amount: "৳45,200", date: "Nov 1, 2026", status: "Completed" },
  { id: "2", amount: "৳38,900", date: "Nov 8, 2026", status: "Processing" },
  { id: "3", amount: "৳28,600", date: "Nov 15, 2026", status: "Pending" },
];

const PAYOUT_COLORS: Record<PayoutItem["status"], string> = {
  Completed: GREEN,
  Processing: YELLOW,
  Pending: BLUE,
};

const COMPETITORS: CompetitorPrice[] = [
  { id: "1", name: "Hotel Surma", price: "৳6,500", diff: "higher" },
  { id: "2", name: "Green Garden", price: "৳4,200", diff: "lower" },
  { id: "3", name: "City Inn", price: "৳5,500", diff: "same" },
];

const AI_INSIGHTS: AiInsight[] = [
  { id: "1", text: "Weekends earn 40% more — consider premium pricing", icon: "trending-up-outline" },
  { id: "2", text: "December is your peak month — start promotions now", icon: "calendar-outline" },
  { id: "3", text: "Suite occupancy is 95% — add more luxury rooms", icon: "star-outline" },
];

function BarChart() {
  const max = Math.max(...BAR_DATA);
  return (
    <View style={bar.container}>
      <Text style={bar.title}>Last 7 Days Revenue</Text>
      <View style={bar.chart}>
        {BAR_DATA.map((val, i) => (
          <View key={i} style={bar.colWrap}>
            <Text style={bar.amount}>৳{(val / 1000).toFixed(0)}k</Text>
            <View style={[bar.barFill, { height: (val / max) * 100 }]} />
            <Text style={bar.label}>{BAR_LABELS[i]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function RevenueScreen() {
  const [dynamicPricing, setDynamicPricing] = useState(true);
  const { isDesktop, contentMaxWidth } = useResponsive();

  const handleDownload = async () => {
    const report = `Revenue Report — Grand Palace Hotel\n\nTotal Revenue: ৳4,82,500\nThis Month: ৳1,24,200\nThis Week: ৳28,600\n\nCommission (12%): ৳57,900\nNet Payout: ৳4,24,600`;
    await Share.share({ message: report, title: "Revenue Report" });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isDesktop && { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Revenue Dashboard</Text>
          <Pressable style={styles.downloadBtn} onPress={handleDownload}>
            <Ionicons name="download-outline" size={16} color={NAVY} />
            <Text style={styles.downloadText}>Download</Text>
          </Pressable>
        </View>

        {/* Revenue Cards */}
        <View style={styles.cardsRow}>
          {REVENUE_CARDS.map((card) => (
            <View key={card.id} style={[styles.card, { borderTopColor: card.color }]}>
              <Ionicons name={card.icon} size={20} color={card.color} />
              <Text style={styles.cardValue}>{card.value}</Text>
              <Text style={styles.cardLabel}>{card.label}</Text>
              <Text style={[styles.cardChange, { color: GREEN }]}>{card.change}</Text>
            </View>
          ))}
        </View>

        {/* Bar Chart */}
        <BarChart />

        {/* Dynamic Pricing */}
        <View style={styles.dynamicRow}>
          <View style={styles.dynamicInfo}>
            <Text style={styles.dynamicTitle}>Dynamic Pricing Engine</Text>
            <Text style={styles.dynamicSub}>Auto-adjust prices based on demand</Text>
          </View>
          <Switch
            value={dynamicPricing}
            onValueChange={setDynamicPricing}
            thumbColor={dynamicPricing ? GOLD : "#64748B"}
            trackColor={{ false: "#334155", true: GOLD + "66" }}
          />
        </View>

        {/* Payout Status */}
        <Text style={styles.sectionTitle}>Payout Status</Text>
        {PAYOUTS.map((payout) => (
          <View key={payout.id} style={styles.payoutItem}>
            <View>
              <Text style={styles.payoutAmount}>{payout.amount}</Text>
              <Text style={styles.payoutDate}>{payout.date}</Text>
            </View>
            <View style={[styles.payoutBadge, { backgroundColor: PAYOUT_COLORS[payout.status] + "33" }]}>
              <Text style={[styles.payoutStatus, { color: PAYOUT_COLORS[payout.status] }]}>{payout.status}</Text>
            </View>
          </View>
        ))}

        {/* Commission Breakdown */}
        <Text style={styles.sectionTitle}>Commission Breakdown</Text>
        <View style={styles.commissionCard}>
          <View style={styles.commRow}>
            <Text style={styles.commLabel}>Gross Revenue</Text>
            <Text style={styles.commValue}>৳4,82,500</Text>
          </View>
          <View style={styles.commRow}>
            <Text style={styles.commLabel}>Platform Commission (12%)</Text>
            <Text style={[styles.commValue, { color: RED }]}>-৳57,900</Text>
          </View>
          <View style={[styles.commRow, styles.commTotal]}>
            <Text style={styles.commTotalLabel}>Net Payout</Text>
            <Text style={styles.commTotalValue}>৳4,24,600</Text>
          </View>
        </View>

        {/* Competitor Prices */}
        <Text style={styles.sectionTitle}>Competitor Prices</Text>
        <View style={styles.competitorRow}>
          <View style={styles.myPrice}>
            <Text style={styles.myPriceLabel}>Your Avg.</Text>
            <Text style={styles.myPriceValue}>৳5,500</Text>
          </View>
          {COMPETITORS.map((comp) => (
            <View key={comp.id} style={styles.compCard}>
              <Ionicons
                name={comp.diff === "higher" ? "arrow-up" : comp.diff === "lower" ? "arrow-down" : "remove"}
                size={12}
                color={comp.diff === "higher" ? RED : comp.diff === "lower" ? GREEN : "#64748B"}
              />
              <Text style={styles.compName}>{comp.name}</Text>
              <Text style={styles.compPrice}>{comp.price}</Text>
            </View>
          ))}
        </View>

        {/* AI Insights */}
        <Text style={styles.sectionTitle}>✨ AI Insights</Text>
        {AI_INSIGHTS.map((insight) => (
          <View key={insight.id} style={styles.insightCard}>
            <Ionicons name={insight.icon} size={18} color={PURPLE} />
            <Text style={styles.insightText}>{insight.text}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  scroll: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 48, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "800", color: "#F1F5F9" },
  downloadBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: GOLD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  downloadText: { color: NAVY, fontSize: 13, fontWeight: "700" },
  cardsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  card: { flex: 1, backgroundColor: NAVY_LIGHT, borderRadius: 14, padding: 14, borderTopWidth: 3, gap: 4 },
  cardValue: { fontSize: 16, fontWeight: "800", color: "#F1F5F9" },
  cardLabel: { fontSize: 10, color: "#94A3B8" },
  cardChange: { fontSize: 11, fontWeight: "700" },
  dynamicRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: NAVY_LIGHT, borderRadius: 14, padding: 16, marginBottom: 20 },
  dynamicInfo: {},
  dynamicTitle: { color: "#F1F5F9", fontSize: 15, fontWeight: "700" },
  dynamicSub: { color: "#64748B", fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#F1F5F9", marginBottom: 12 },
  payoutItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: NAVY_LIGHT, borderRadius: 12, padding: 14, marginBottom: 8 },
  payoutAmount: { color: "#F1F5F9", fontSize: 15, fontWeight: "700" },
  payoutDate: { color: "#64748B", fontSize: 12, marginTop: 2 },
  payoutBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  payoutStatus: { fontSize: 12, fontWeight: "700" },
  commissionCard: { backgroundColor: NAVY_LIGHT, borderRadius: 14, padding: 16, marginBottom: 20 },
  commRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#334155" },
  commLabel: { color: "#94A3B8", fontSize: 13 },
  commValue: { color: "#F1F5F9", fontSize: 13, fontWeight: "600" },
  commTotal: { borderBottomWidth: 0, paddingTop: 12 },
  commTotalLabel: { color: "#F1F5F9", fontSize: 15, fontWeight: "700" },
  commTotalValue: { color: GOLD, fontSize: 16, fontWeight: "800" },
  competitorRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  myPrice: { flex: 1, backgroundColor: GOLD + "22", borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1, borderColor: GOLD },
  myPriceLabel: { color: GOLD, fontSize: 11, fontWeight: "700" },
  myPriceValue: { color: GOLD, fontSize: 14, fontWeight: "800", marginTop: 4 },
  compCard: { flex: 1, backgroundColor: NAVY_LIGHT, borderRadius: 12, padding: 12, alignItems: "center", gap: 4 },
  compName: { color: "#94A3B8", fontSize: 10, fontWeight: "600", textAlign: "center" },
  compPrice: { color: "#F1F5F9", fontSize: 13, fontWeight: "700" },
  insightCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: PURPLE + "22", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: PURPLE + "44" },
  insightText: { color: "#F1F5F9", fontSize: 13, flex: 1, lineHeight: 18 },
});

const bar = StyleSheet.create({
  container: { backgroundColor: NAVY_LIGHT, borderRadius: 14, padding: 16, marginBottom: 20 },
  title: { color: "#F1F5F9", fontSize: 14, fontWeight: "700", marginBottom: 12 },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 130, gap: 6 },
  colWrap: { flex: 1, alignItems: "center", gap: 4 },
  amount: { color: "#64748B", fontSize: 9 },
  barFill: { width: "100%", backgroundColor: GOLD, borderRadius: 4 },
  label: { color: "#94A3B8", fontSize: 10 },
});
