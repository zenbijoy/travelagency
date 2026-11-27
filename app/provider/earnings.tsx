import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRiderStore } from "@/store/riderStore";
import { useProviderHubStore } from "@/features/rider/providerStore";
import { formatPaisaBDT } from "@/features/rider/calculators";
import { RiderLedgerEntry, RiderPayout, RiderPayoutChannel } from "@/features/rider/types";

const TEAL = "#0D9488";
const GOLD = "#E5A93C";
const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const BORDER = "#334155";

const CHANNELS: Array<{ key: RiderPayoutChannel; label: string }> = [
  { key: "bkash", label: "bKash" },
  { key: "nagad", label: "Nagad" },
  { key: "rocket", label: "Rocket" },
  { key: "bank_transfer", label: "Bank Transfer" },
];

export default function ProviderEarningsScreen() {
  const profitSummary = useRiderStore((s) => s.profitSummary);
  const ledgerEntries = useRiderStore((s) => s.ledgerEntries);
  const payouts = useRiderStore((s) => s.payouts);
  const requestCashout = useRiderStore((s) => s.requestCashout);

  const bookings = useProviderHubStore((s) => s.bookings);
  const hydrateProviderHub = useProviderHubStore((s) => s.hydrateProviderHub);
  const isHydrated = useProviderHubStore((s) => s.isHydrated);

  const [cashoutVisible, setCashoutVisible] = useState(false);
  const [channel, setChannel] = useState<RiderPayoutChannel>("bkash");
  const [accountNumber, setAccountNumber] = useState("");
  const [amountBdt, setAmountBdt] = useState("500");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isHydrated) {
      hydrateProviderHub().catch(() => {});
    }
  }, [isHydrated, hydrateProviderHub]);

  const serviceBookingsGrossPaisa = bookings.reduce((sum, b) => sum + b.amountPaisa, 0);
  const totalGrossPaisa = profitSummary.grossEarningsPaisa + serviceBookingsGrossPaisa;
  const totalCommissionPaisa =
    profitSummary.platformCommissionPaisa + Math.round(serviceBookingsGrossPaisa * 0.12);
  const totalNetPaisa =
    totalGrossPaisa - totalCommissionPaisa - profitSummary.estimatedFuelCostPaisa;

  const handleCashout = async () => {
    const val = parseFloat(amountBdt);
    if (isNaN(val) || val < 100) {
      Alert.alert("Minimum Cashout", "Minimum payout amount is ৳100.");
      return;
    }
    const paisa = Math.round(val * 100);
    if (paisa > profitSummary.availableForCashoutPaisa) {
      Alert.alert(
        "Insufficient Balance",
        `Available withdrawable rider/service balance is ${formatPaisaBDT(
          profitSummary.availableForCashoutPaisa
        )}.`
      );
      return;
    }
    if (accountNumber.trim().length < 6) {
      Alert.alert("Account Required", "Enter a valid bKash/Nagad/Rocket or Bank account.");
      return;
    }

    setBusy(true);
    try {
      const payout = await requestCashout({
        amountPaisa: paisa,
        channel,
        accountNumber: accountNumber.trim(),
      });
      setCashoutVisible(false);
      setAccountNumber("");
      Alert.alert(
        "Withdrawal Requested",
        `Ref ${payout.payout_reference} (${formatPaisaBDT(payout.amount_paisa)}) queued via ${channel.toUpperCase()}.`
      );
    } catch (err: unknown) {
      Alert.alert(
        "Withdrawal Error",
        err instanceof Error ? err.message : "Could not process payout."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>💰 Provider & Mobility Earnings</Text>

      {/* Hero Wallet Card */}
      <View style={styles.walletCard}>
        <Text style={styles.walletLabel}>WITHDRAWABLE WALLET BALANCE</Text>
        <Text style={styles.walletAmount}>
          {formatPaisaBDT(profitSummary.availableForCashoutPaisa)}
        </Text>
        <Text style={styles.walletSub}>
          Pending: {formatPaisaBDT(profitSummary.pendingPayoutsPaisa)} • Disbursed:{" "}
          {formatPaisaBDT(profitSummary.paidOutPaisa)}
        </Text>
        <Pressable
          style={styles.withdrawBtn}
          onPress={() => setCashoutVisible(true)}
        >
          <Ionicons name="flash" size={16} color="#fff" />
          <Text style={styles.withdrawText}>Instant Payout (bKash / Nagad / Bank)</Text>
        </Pressable>
      </View>

      {/* Net Revenue Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Revenue & Cost Breakdown</Text>
        <View style={styles.grid}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Combined Gross</Text>
            <Text style={styles.metricValue}>{formatPaisaBDT(totalGrossPaisa)}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Service Bookings</Text>
            <Text style={[styles.metricValue, { color: GOLD }]}>
              {formatPaisaBDT(serviceBookingsGrossPaisa)}
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Commission & Fuel</Text>
            <Text style={[styles.metricValue, { color: "#FCA5A5" }]}>
              -{formatPaisaBDT(totalCommissionPaisa + profitSummary.estimatedFuelCostPaisa)}
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Estimated Net Profit</Text>
            <Text style={[styles.metricValue, { color: "#34D399" }]}>
              {formatPaisaBDT(Math.max(0, totalNetPaisa))}
            </Text>
          </View>
        </View>
      </View>

      {/* Double-Entry Ledger */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Financial Ledger ({ledgerEntries.length})
        </Text>
        {ledgerEntries.length === 0 ? (
          <Text style={styles.emptyText}>No ledger entries recorded yet.</Text>
        ) : (
          ledgerEntries.slice(0, 12).map((entry: RiderLedgerEntry) => {
            const isCredit = entry.direction === "credit";
            return (
              <View key={entry.id} style={styles.ledgerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ledgerTitle}>
                    {entry.memo || entry.entry_type.replace(/_/g, " ").toUpperCase()}
                  </Text>
                  <Text style={styles.ledgerDate}>
                    {new Date(entry.created_at).toLocaleString()}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.ledgerAmt,
                    { color: isCredit ? "#34D399" : "#FCA5A5" },
                  ]}
                >
                  {isCredit ? "+" : "-"}
                  {formatPaisaBDT(entry.amount_paisa)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Payout Requests */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payout Settlements ({payouts.length})</Text>
        {payouts.length === 0 ? (
          <Text style={styles.emptyText}>No payout withdrawals requested yet.</Text>
        ) : (
          payouts.map((p: RiderPayout) => (
            <View key={p.id} style={styles.ledgerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ledgerTitle}>
                  {p.channel.toUpperCase()} • {p.account_number_masked}
                </Text>
                <Text style={styles.ledgerDate}>
                  Ref: {p.payout_reference} • {p.status.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.ledgerAmt}>{formatPaisaBDT(p.amount_paisa)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />

      {/* Cashout Modal */}
      <Modal
        visible={cashoutVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCashoutVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Withdraw Funds</Text>
              <Pressable onPress={() => setCashoutVisible(false)}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </Pressable>
            </View>

            <View style={styles.channelRow}>
              {CHANNELS.map((c) => (
                <Pressable
                  key={c.key}
                  style={[
                    styles.channelChip,
                    channel === c.key && styles.channelChipActive,
                  ]}
                  onPress={() => setChannel(c.key)}
                >
                  <Text
                    style={[
                      styles.channelText,
                      channel === c.key && styles.channelTextActive,
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Account / Wallet Number</Text>
            <TextInput
              style={styles.input}
              placeholder={
                channel === "bank_transfer" ? "Account / IBAN" : "017XXXXXXXX"
              }
              placeholderTextColor="#475569"
              value={accountNumber}
              onChangeText={setAccountNumber}
            />

            <Text style={styles.fieldLabel}>Amount (BDT)</Text>
            <TextInput
              style={styles.input}
              placeholder="500"
              placeholderTextColor="#475569"
              keyboardType="numeric"
              value={amountBdt}
              onChangeText={setAmountBdt}
            />

            <Pressable
              style={[styles.confirmBtn, { opacity: busy ? 0.6 : 1 }]}
              onPress={handleCashout}
              disabled={busy}
            >
              <Text style={styles.confirmBtnText}>
                {busy ? "Processing..." : "Confirm Withdrawal"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY, padding: 16 },
  pageTitle: {
    color: "#F1F5F9",
    fontSize: 22,
    fontWeight: "700",
    paddingTop: 20,
    marginBottom: 16,
  },
  walletCard: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: TEAL + "66",
    marginBottom: 16,
  },
  walletLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  walletAmount: {
    color: "#F8FAFC",
    fontSize: 32,
    fontWeight: "800",
    marginVertical: 8,
  },
  walletSub: { color: "#94A3B8", fontSize: 12, marginBottom: 14 },
  withdrawBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: TEAL,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
  },
  withdrawText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  section: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
  },
  sectionTitle: {
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  metricBox: {
    width: "48%",
    backgroundColor: NAVY,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  metricLabel: { color: "#94A3B8", fontSize: 11 },
  metricValue: { color: "#F1F5F9", fontSize: 16, fontWeight: "700", marginTop: 4 },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  ledgerTitle: { color: "#F1F5F9", fontSize: 13, fontWeight: "600" },
  ledgerDate: { color: "#64748B", fontSize: 11, marginTop: 2 },
  ledgerAmt: { color: "#F1F5F9", fontSize: 14, fontWeight: "700" },
  emptyText: { color: "#64748B", fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: { color: "#F1F5F9", fontSize: 17, fontWeight: "700" },
  channelRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  channelChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: BORDER,
  },
  channelChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  channelText: { color: "#94A3B8", fontSize: 12 },
  channelTextActive: { color: "#fff", fontWeight: "700" },
  fieldLabel: { color: "#94A3B8", fontSize: 12, marginBottom: 5 },
  input: {
    backgroundColor: NAVY,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    color: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  confirmBtn: {
    backgroundColor: TEAL,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  confirmBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
