import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRiderStore } from "@/store/riderStore";
import { RIDER_COLORS, RiderSectionCard } from "@/features/rider/components/RiderDesignSystem";
import { formatPaisaBDT } from "@/features/rider/calculators";
import { RiderLedgerEntry, RiderPayout, RiderPayoutChannel } from "@/features/rider/types";

const PAYOUT_CHANNELS: Array<{ key: RiderPayoutChannel; label: string }> = [
  { key: "bkash", label: "bKash" },
  { key: "nagad", label: "Nagad" },
  { key: "rocket", label: "Rocket" },
  { key: "bank_transfer", label: "Bank" },
];

export const RiderEarningsView: React.FC = () => {
  const profitSummary = useRiderStore((s) => s.profitSummary);
  const ledgerEntries = useRiderStore((s) => s.ledgerEntries);
  const payouts = useRiderStore((s) => s.payouts);
  const requestCashout = useRiderStore((s) => s.requestCashout);

  const [cashoutModalVisible, setCashoutModalVisible] = useState(false);
  const [channel, setChannel] = useState<RiderPayoutChannel>("bkash");
  const [accountNumber, setAccountNumber] = useState("");
  const [amountBdt, setAmountBdt] = useState("500");
  const [busy, setBusy] = useState(false);

  const profitMarginPct =
    profitSummary.grossEarningsPaisa > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (profitSummary.netTakeHomePaisa / profitSummary.grossEarningsPaisa) * 100
          )
        )
      : 0;

  const handleCashout = async () => {
    const val = parseFloat(amountBdt);
    if (isNaN(val) || val < 100) {
      Alert.alert("Minimum Cashout", "Minimum withdrawal is ৳100.");
      return;
    }
    const amountPaisa = Math.round(val * 100);
    if (amountPaisa > profitSummary.availableForCashoutPaisa) {
      Alert.alert("Insufficient Balance", "Amount exceeds your available balance.");
      return;
    }
    if (accountNumber.trim().length < 6) {
      Alert.alert("Account Required", "Enter a valid bKash/Nagad/Rocket or Bank account number.");
      return;
    }

    setBusy(true);
    try {
      const payout = await requestCashout({
        amountPaisa,
        channel,
        accountNumber: accountNumber.trim(),
      });
      setCashoutModalVisible(false);
      setAccountNumber("");
      Alert.alert(
        "Cashout Queued",
        `Ref ${payout.payout_reference}: ${formatPaisaBDT(payout.amount_paisa)} to ${channel.toUpperCase()} (${payout.account_number_masked}).`
      );
    } catch (err: unknown) {
      Alert.alert("Cashout Failed", err instanceof Error ? err.message : "Could not process payout.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Wallet Cashout Card */}
        <RiderSectionCard style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>AVAILABLE FOR INSTANT CASHOUT</Text>
          <Text style={styles.balanceAmount}>
            {formatPaisaBDT(profitSummary.availableForCashoutPaisa)}
          </Text>
          <Text style={styles.pendingNote}>
            Pending: {formatPaisaBDT(profitSummary.pendingPayoutsPaisa)} • Paid Out:{" "}
            {formatPaisaBDT(profitSummary.paidOutPaisa)}
          </Text>
          <Pressable
            style={styles.cashoutBtn}
            onPress={() => setCashoutModalVisible(true)}
          >
            <Ionicons name="flash-outline" size={16} color="#FFFFFF" />
            <Text style={styles.cashoutBtnText}>Withdraw to bKash / Nagad / Bank</Text>
          </Pressable>
        </RiderSectionCard>

        {/* Smart Net-Profit & Fuel Tracker */}
        <RiderSectionCard style={styles.sectionGap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Smart Net-Profit & Fuel Tracker</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{profitMarginPct.toFixed(1)}% MARGIN</Text>
            </View>
          </View>

          <View style={styles.profitGrid}>
            <View style={styles.profitCell}>
              <Text style={styles.profitCellLabel}>Gross Fares</Text>
              <Text style={styles.profitCellValue}>
                {formatPaisaBDT(profitSummary.grossEarningsPaisa)}
              </Text>
            </View>
            <View style={styles.profitCell}>
              <Text style={styles.profitCellLabel}>Platform Fee (15%)</Text>
              <Text style={[styles.profitCellValue, { color: "#FCA5A5" }]}>
                -{formatPaisaBDT(profitSummary.platformCommissionPaisa)}
              </Text>
            </View>
            <View style={styles.profitCell}>
              <Text style={styles.profitCellLabel}>Est. Fuel / CNG</Text>
              <Text style={[styles.profitCellValue, { color: RIDER_COLORS.amber }]}>
                -{formatPaisaBDT(profitSummary.estimatedFuelCostPaisa)}
              </Text>
            </View>
            <View style={styles.profitCell}>
              <Text style={styles.profitCellLabel}>Net Take-Home</Text>
              <Text style={[styles.profitCellValue, { color: RIDER_COLORS.emerald }]}>
                {formatPaisaBDT(profitSummary.netTakeHomePaisa)}
              </Text>
            </View>
          </View>

          <View style={styles.profitBarBg}>
            <View style={[styles.profitBarFill, { width: `${profitMarginPct}%` }]} />
          </View>
          <Text style={styles.tipsLine}>
            Includes {formatPaisaBDT(profitSummary.tipsPaisa)} in 100% pass-through passenger tips
          </Text>
        </RiderSectionCard>

        {/* Double-Entry Ledger */}
        <RiderSectionCard style={styles.sectionGap}>
          <Text style={styles.sectionTitle}>
            Double-Entry Ledger ({ledgerEntries.length})
          </Text>
          {ledgerEntries.length === 0 ? (
            <Text style={styles.emptyText}>No ledger postings recorded yet.</Text>
          ) : (
            ledgerEntries.slice(0, 15).map((entry: RiderLedgerEntry) => {
              const isCredit = entry.direction === "credit";
              return (
                <View key={entry.id} style={styles.ledgerRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.ledgerDesc}>
                      {entry.memo || entry.entry_type.replace(/_/g, " ").toUpperCase()}
                    </Text>
                    <Text style={styles.ledgerDate}>
                      {new Date(entry.created_at).toLocaleString()} •{" "}
                      {entry.entry_type.replace(/_/g, " ")}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.ledgerAmount,
                      { color: isCredit ? RIDER_COLORS.emerald : "#FCA5A5" },
                    ]}
                  >
                    {isCredit ? "+" : "-"}
                    {formatPaisaBDT(entry.amount_paisa)}
                  </Text>
                </View>
              );
            })
          )}
        </RiderSectionCard>

        {/* Payout History */}
        <RiderSectionCard style={styles.sectionGap}>
          <Text style={styles.sectionTitle}>Payout Requests ({payouts.length})</Text>
          {payouts.length === 0 ? (
            <Text style={styles.emptyText}>No cashout requests submitted yet.</Text>
          ) : (
            payouts.map((payout: RiderPayout) => (
              <View key={payout.id} style={styles.ledgerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ledgerDesc}>
                    {payout.channel.toUpperCase()} ({payout.account_number_masked})
                  </Text>
                  <Text style={styles.ledgerDate}>
                    {payout.payout_reference} • {payout.status.toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.ledgerAmount, { color: RIDER_COLORS.textPrimary }]}>
                  {formatPaisaBDT(payout.amount_paisa)}
                </Text>
              </View>
            ))
          )}
        </RiderSectionCard>
      </ScrollView>

      {/* Cashout Modal */}
      <Modal visible={cashoutModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Instant Cashout</Text>
              <Pressable onPress={() => setCashoutModalVisible(false)}>
                <Ionicons name="close" size={20} color={RIDER_COLORS.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.modalSub}>
              Minimum withdrawal ৳100. Zero platform cashout fee to Bangladesh MFS wallets.
            </Text>

            <View style={styles.methodSelector}>
              {PAYOUT_CHANNELS.map((c) => (
                <Pressable
                  key={c.key}
                  style={[styles.methodPill, channel === c.key && styles.methodPillActive]}
                  onPress={() => setChannel(c.key)}
                >
                  <Text
                    style={[
                      styles.methodPillText,
                      channel === c.key && styles.methodPillTextActive,
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.inputLabel}>
              {channel === "bank_transfer"
                ? "Bank Account Number"
                : `${channel.toUpperCase()} Wallet Number`}
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder={channel === "bank_transfer" ? "Account Number" : "017XXXXXXXX"}
              placeholderTextColor={RIDER_COLORS.textMuted}
              keyboardType={channel === "bank_transfer" ? "default" : "phone-pad"}
              value={accountNumber}
              onChangeText={setAccountNumber}
            />

            <Text style={styles.inputLabel}>Amount (BDT)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="500"
              placeholderTextColor={RIDER_COLORS.textMuted}
              keyboardType="numeric"
              value={amountBdt}
              onChangeText={setAmountBdt}
            />

            <Pressable
              style={[styles.submitCashoutBtn, { opacity: busy ? 0.6 : 1 }]}
              onPress={handleCashout}
              disabled={busy}
            >
              <Text style={styles.submitCashoutText}>
                {busy ? "Disbursing..." : "Confirm Instant Cashout"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: RIDER_COLORS.bg,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
  sectionGap: {
    marginBottom: 14,
  },
  balanceCard: {
    alignItems: "center",
    marginBottom: 14,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: RIDER_COLORS.textMuted,
    letterSpacing: 1,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: "900",
    color: RIDER_COLORS.textPrimary,
    marginVertical: 6,
  },
  pendingNote: {
    fontSize: 11,
    color: RIDER_COLORS.textSecondary,
    marginBottom: 12,
  },
  cashoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: RIDER_COLORS.emerald,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
  },
  cashoutBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
    marginBottom: 8,
  },
  badge: {
    backgroundColor: "rgba(16, 185, 129, 0.16)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: RIDER_COLORS.emerald,
  },
  profitGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  profitCell: {
    width: "48%",
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
  },
  profitCellLabel: {
    fontSize: 11,
    color: RIDER_COLORS.textSecondary,
  },
  profitCellValue: {
    fontSize: 15,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
    marginTop: 4,
  },
  profitBarBg: {
    height: 8,
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 4,
    overflow: "hidden",
  },
  profitBarFill: {
    height: "100%",
    backgroundColor: RIDER_COLORS.emerald,
  },
  tipsLine: {
    fontSize: 11,
    color: RIDER_COLORS.textSecondary,
    marginTop: 6,
  },
  ledgerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: RIDER_COLORS.border,
  },
  ledgerDesc: {
    fontSize: 13,
    fontWeight: "700",
    color: RIDER_COLORS.textPrimary,
  },
  ledgerDate: {
    fontSize: 10,
    color: RIDER_COLORS.textSecondary,
    marginTop: 2,
  },
  ledgerAmount: {
    fontSize: 14,
    fontWeight: "800",
  },
  emptyText: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    paddingVertical: 12,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: RIDER_COLORS.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: RIDER_COLORS.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    marginBottom: 14,
  },
  methodSelector: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  methodPill: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
  },
  methodPillActive: {
    backgroundColor: "rgba(16, 185, 129, 0.16)",
    borderColor: RIDER_COLORS.emerald,
  },
  methodPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: RIDER_COLORS.textSecondary,
  },
  methodPillTextActive: {
    color: RIDER_COLORS.emerald,
  },
  inputLabel: {
    fontSize: 12,
    color: RIDER_COLORS.textSecondary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: RIDER_COLORS.surfaceDeep,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: RIDER_COLORS.border,
    color: RIDER_COLORS.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  submitCashoutBtn: {
    backgroundColor: RIDER_COLORS.emerald,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitCashoutText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
