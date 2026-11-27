import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Modal,
  TextInput,
  Alert,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import { useHotelPmsStore, useHotelPmsComputed } from "@/features/hotel";

const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const GOLD = "#E5A93C";
const GREEN = "#22C55E";
const BLUE = "#3B82F6";
const PURPLE = "#A855F7";
const RED = "#EF4444";

export default function RevenueScreen() {
  const { isDesktop, contentMaxWidth } = useResponsive();
  const { workspace, initWorkspace, toggleRateRule, requestPayout } = useHotelPmsStore();
  const { currentProperty, kpis } = useHotelPmsComputed();

  const [payoutModalVisible, setPayoutModalVisible] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState<"bkash" | "nagad" | "bank_transfer">("bkash");
  const [accountRef, setAccountRef] = useState("");

  useEffect(() => {
    if (workspace.units.length === 0) initWorkspace();
  }, []);

  const propertyRules = workspace.rateRules.filter((r) => r.hotelId === currentProperty.id);
  const propertyPayouts = workspace.payouts.filter((p) => p.hotelId === currentProperty.id);
  const maxDayAmount = Math.max(1, ...kpis.dailyRevenueSeries.map((d) => d.amountBdt));

  const handleSubmitPayout = async () => {
    const amount = parseFloat(payoutAmount);
    if (!amount || amount < 1000) {
      Alert.alert("Minimum Withdrawal", "Minimum payout withdrawal is ৳1,000.");
      return;
    }
    if (!accountRef.trim()) {
      Alert.alert("Account Required", "Please provide your bKash / Nagad / Bank account number.");
      return;
    }

    const res = await requestPayout({
      amountBdt: amount,
      method: payoutMethod,
      accountRef: accountRef.trim(),
    });
    if (res.success) {
      setPayoutModalVisible(false);
      setPayoutAmount("");
      setAccountRef("");
      Alert.alert(
        "Payout Requested",
        `Withdrawal of ৳${amount.toLocaleString()} submitted via ${payoutMethod.toUpperCase()} (Ref: ${res.payoutId}).`
      );
    } else {
      Alert.alert("Payout Error", res.error || "Could not request payout.");
    }
  };

  const handleExportReport = () => {
    const summary = [
      `${currentProperty.name} — REVENUE & YIELD REPORT`,
      `Occupancy: ${kpis.occupancyRatePct}%`,
      `ADR: ৳${kpis.adrBdt.toLocaleString()} | RevPAR: ৳${kpis.revParBdt.toLocaleString()} | GOPPAR: ৳${kpis.gopparBdt.toLocaleString()}`,
      `Gross Revenue: ৳${kpis.grossRevenueBdt.toLocaleString()}`,
      `Net Payout Available: ৳${kpis.netPayoutBdt.toLocaleString()}`,
    ].join("\n");
    Share.share({ message: summary }).catch(() => {});
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
            <Text style={styles.headerTitle}>Yield & Revenue Manager</Text>
            <Text style={styles.headerSub}>{currentProperty.name} • Live Financial Ledger</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable style={styles.exportBtn} onPress={handleExportReport}>
              <Ionicons name="share-outline" size={18} color="#F1F5F9" />
            </Pressable>
            <Pressable style={styles.withdrawBtn} onPress={() => setPayoutModalVisible(true)}>
              <Ionicons name="wallet-outline" size={16} color={NAVY} />
              <Text style={styles.withdrawText}>Withdraw</Text>
            </Pressable>
          </View>
        </View>

        {/* Live KPI Strip */}
        <View style={styles.cardsRow}>
          <View style={[styles.revCard, { borderLeftColor: GOLD }]}>
            <Text style={styles.revLabel}>Gross Revenue</Text>
            <Text style={styles.revVal}>৳{kpis.grossRevenueBdt.toLocaleString()}</Text>
            <Text style={styles.revDelta}>Room + Add-ons</Text>
          </View>
          <View style={[styles.revCard, { borderLeftColor: GREEN }]}>
            <Text style={styles.revLabel}>Net Payout Pool</Text>
            <Text style={styles.revVal}>৳{kpis.netPayoutBdt.toLocaleString()}</Text>
            <Text style={styles.revDelta}>After {currentProperty.commissionPct}% fee</Text>
          </View>
        </View>

        <View style={styles.cardsRow}>
          <View style={[styles.revCard, { borderLeftColor: BLUE }]}>
            <Text style={styles.revLabel}>ADR / RevPAR</Text>
            <Text style={styles.revVal}>৳{kpis.adrBdt.toLocaleString()}</Text>
            <Text style={styles.revDelta}>RevPAR: ৳{kpis.revParBdt.toLocaleString()}</Text>
          </View>
          <View style={[styles.revCard, { borderLeftColor: PURPLE }]}>
            <Text style={styles.revLabel}>GOPPAR</Text>
            <Text style={styles.revVal}>৳{kpis.gopparBdt.toLocaleString()}</Text>
            <Text style={styles.revDelta}>Occ: {kpis.occupancyRatePct}%</Text>
          </View>
        </View>

        {/* 7-Day Live Chart */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>7-Day Revenue Trajectory</Text>
          <View style={styles.chartRow}>
            {kpis.dailyRevenueSeries.map((day) => (
              <View key={day.date} style={styles.barCol}>
                <Text style={styles.barVal}>
                  {day.amountBdt > 0 ? `${Math.round(day.amountBdt / 1000)}k` : "0"}
                </Text>
                <View
                  style={[
                    styles.bar,
                    { height: Math.max(6, (day.amountBdt / maxDayAmount) * 90) },
                  ]}
                />
                <Text style={styles.barLabel}>{day.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* AI Yield Rules Engine */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Dynamic Pricing & Flash Deal Rules</Text>
          <Text style={styles.sectionSub}>
            Fair Price Shield enforced: effective multiplier capped strictly between 0.5x and 1.25x.
          </Text>
          {propertyRules.map((rule) => (
            <View key={rule.id} style={styles.ruleRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.ruleName}>{rule.ruleName}</Text>
                  {rule.isFlashDeal && (
                    <View style={styles.flashBadge}>
                      <Text style={styles.flashText}>FLASH DEAL</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.ruleMeta}>
                  Multiplier: {rule.multiplier}x • Type: {rule.ruleType.replace("_", " ")}
                </Text>
              </View>
              <Switch
                value={rule.isActive}
                onValueChange={(val) => {
                  void toggleRateRule(rule.id, val);
                }}
                trackColor={{ false: "#334155", true: GOLD + "88" }}
                thumbColor={rule.isActive ? GOLD : "#94A3B8"}
              />
            </View>
          ))}
        </View>

        {/* Competitor Rate Monitor */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Local Competitor Benchmarks</Text>
          {workspace.competitors.map((comp) => {
            const diff = comp.nightlyRateBdt - kpis.adrBdt;
            return (
              <View key={comp.id} style={styles.compRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compName}>{comp.hotelName}</Text>
                  <Text style={styles.compMeta}>
                    {comp.distanceKm} km away • {comp.starRating}★ • Est. {comp.occupancyHintPct}% Occ
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.compPrice}>৳{comp.nightlyRateBdt.toLocaleString()}</Text>
                  <Text style={{ color: diff >= 0 ? GREEN : RED, fontSize: 10, fontWeight: "700" }}>
                    {diff >= 0 ? `+৳${diff.toLocaleString()} above you` : `৳${Math.abs(diff).toLocaleString()} lower`}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* AI Insights */}
        {kpis.aiInsights.length > 0 && (
          <View style={styles.sectionBox}>
            <Text style={styles.sectionTitle}>Actionable Yield Insights</Text>
            {kpis.aiInsights.map((insight, idx) => (
              <View key={idx} style={styles.insightRow}>
                <Ionicons name="bulb-outline" size={16} color={GOLD} />
                <Text style={styles.insightText}>{insight}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Payout History */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Recent Payouts ({propertyPayouts.length})</Text>
          {propertyPayouts.map((p) => (
            <View key={p.id} style={styles.payoutRow}>
              <View>
                <Text style={styles.payoutAmt}>৳{p.amountBdt.toLocaleString()}</Text>
                <Text style={styles.payoutMeta}>
                  {p.method.toUpperCase()} • {p.accountRef}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      p.status === "Completed" ? GREEN + "22" : GOLD + "22",
                  },
                ]}
              >
                <Text
                  style={{
                    color: p.status === "Completed" ? GREEN : GOLD,
                    fontSize: 10,
                    fontWeight: "700",
                  }}
                >
                  {p.status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Payout Withdrawal Modal */}
      <Modal visible={payoutModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Withdraw Funds</Text>
            <Text style={styles.modalSub}>Available Pool: ৳{kpis.netPayoutBdt.toLocaleString()}</Text>

            <TextInput
              placeholder="Amount (BDT, min 1000)"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              style={styles.input}
              value={payoutAmount}
              onChangeText={setPayoutAmount}
            />

            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              {(["bkash", "nagad", "bank_transfer"] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.methodChip, payoutMethod === m && styles.methodChipActive]}
                  onPress={() => setPayoutMethod(m)}
                >
                  <Text style={payoutMethod === m ? styles.methodTextActive : styles.methodText}>
                    {m.replace("_", " ").toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              placeholder="Destination Phone / Bank Account"
              placeholderTextColor="#64748B"
              style={styles.input}
              value={accountRef}
              onChangeText={setAccountRef}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                style={[styles.cancelBtn, { flex: 1 }]}
                onPress={() => setPayoutModalVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.submitBtn, { flex: 1 }]}
                onPress={handleSubmitPayout}
              >
                <Text style={styles.submitText}>Request Payout</Text>
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
  exportBtn: { backgroundColor: NAVY_LIGHT, padding: 10, borderRadius: 12 },
  withdrawBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: GOLD, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  withdrawText: { color: NAVY, fontSize: 12, fontWeight: "800" },
  cardsRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  revCard: { flex: 1, backgroundColor: NAVY_LIGHT, borderRadius: 14, padding: 14, borderLeftWidth: 3 },
  revLabel: { color: "#94A3B8", fontSize: 11 },
  revVal: { color: "#F1F5F9", fontSize: 19, fontWeight: "800", marginTop: 4 },
  revDelta: { color: GOLD, fontSize: 10, fontWeight: "700", marginTop: 4 },
  sectionBox: { backgroundColor: NAVY_LIGHT, borderRadius: 16, padding: 16, marginTop: 12 },
  sectionTitle: { color: "#F1F5F9", fontSize: 15, fontWeight: "800", marginBottom: 6 },
  sectionSub: { color: "#94A3B8", fontSize: 11, marginBottom: 12 },
  chartRow: { flexDirection: "row", alignItems: "flex-end", height: 130, gap: 8, marginTop: 8 },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  barVal: { color: "#CBD5E1", fontSize: 9, fontWeight: "700" },
  bar: { width: "100%", backgroundColor: GOLD, borderRadius: 4 },
  barLabel: { color: "#64748B", fontSize: 10 },
  ruleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#334155" },
  ruleName: { color: "#F1F5F9", fontSize: 13, fontWeight: "700" },
  ruleMeta: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  flashBadge: { backgroundColor: RED + "33", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  flashText: { color: RED, fontSize: 9, fontWeight: "800" },
  compRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#334155" },
  compName: { color: "#F1F5F9", fontSize: 13, fontWeight: "700" },
  compMeta: { color: "#64748B", fontSize: 11, marginTop: 2 },
  compPrice: { color: "#F1F5F9", fontSize: 14, fontWeight: "800" },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: NAVY, padding: 10, borderRadius: 10, marginTop: 8 },
  insightText: { flex: 1, color: "#CBD5E1", fontSize: 12, lineHeight: 17 },
  payoutRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#334155" },
  payoutAmt: { color: "#F1F5F9", fontSize: 14, fontWeight: "800" },
  payoutMeta: { color: "#64748B", fontSize: 11, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 20 },
  modalBox: { backgroundColor: NAVY_LIGHT, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#334155" },
  modalTitle: { color: "#F1F5F9", fontSize: 17, fontWeight: "800" },
  modalSub: { color: GOLD, fontSize: 12, fontWeight: "700", marginTop: 2, marginBottom: 10 },
  input: { backgroundColor: NAVY, color: "#F1F5F9", borderRadius: 10, padding: 11, marginTop: 10, fontSize: 13, borderWidth: 1, borderColor: "#334155" },
  methodChip: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: NAVY, alignItems: "center", borderWidth: 1, borderColor: "#334155" },
  methodChipActive: { backgroundColor: GOLD, borderColor: GOLD },
  methodText: { color: "#94A3B8", fontSize: 10, fontWeight: "700" },
  methodTextActive: { color: NAVY, fontSize: 10, fontWeight: "800" },
  cancelBtn: { backgroundColor: "#334155", borderRadius: 12, padding: 12, alignItems: "center" },
  cancelText: { color: "#F1F5F9", fontWeight: "700" },
  submitBtn: { backgroundColor: GOLD, borderRadius: 12, padding: 12, alignItems: "center" },
  submitText: { color: NAVY, fontWeight: "800" },
});
