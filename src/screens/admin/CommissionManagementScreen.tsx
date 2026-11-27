/**
 * Commission & Financial Ledger Management Screen - Admin Panel
 * Enterprise Double-Entry Ledger, Payout Batches & Banking CSV Exports
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Share,
} from "react-native";
import { MaterialCommunityIcons, Ionicons, Feather } from "@expo/vector-icons";
import { payoutAdminService, appConfigService, PayoutBatch, AgencyPendingEarning } from "@/services/adminService";
import { exportCsvOrTextFile } from "../../utils/webExport";
import { useRBAC } from "./rbac";
import { executeAdminCommand, UpdateCommissionSplitCommand } from "./commands";
import { LoadingState } from "../../components/ui/LoadingState";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorStateCard } from "../../components/common/ErrorStateCard";

export const CommissionManagementScreen: React.FC = () => {
  const { admin, hasPermission } = useRBAC();
  const [activeTab, setActiveTab] = useState<"batches" | "balances" | "splits">("batches");
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [agencyEarnings, setAgencyEarnings] = useState<AgencyPendingEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected Batch for Details & Actions
  const [selectedBatch, setSelectedBatch] = useState<PayoutBatch | null>(null);
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);

  // Commission Splits Configuration
  const [splits, setSplits] = useState<{ [key: string]: string }>({
    hotel: "15%",
    flight: "5%",
    train: "3%",
    tour: "12%",
    bus: "6%",
    launch: "7%",
  });
  const [savingSplits, setSavingSplits] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [batchRes, earningsRes, configs] = await Promise.all([
        payoutAdminService.listBatches("all", 1, 50),
        payoutAdminService.getPendingAgencyEarnings(),
        appConfigService.getAllConfigs(),
      ]);

      setBatches(batchRes.items || []);
      setAgencyEarnings(earningsRes || []);
      if (configs?.commission_splits) {
        try {
          const parsed = JSON.parse(configs.commission_splits);
          if (parsed && typeof parsed === "object") {
            setSplits((prev) => ({ ...prev, ...parsed }));
          }
        } catch {
          // Preserve defaults if stored JSON is malformed
        }
      }
    } catch (err: any) {
      console.error("Error loading financial ledger data:", err);
      setError(err?.message || "Failed to load financial ledger data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // Create New Batch
  const handleCreateBatch = async () => {
    if (!admin) return;
    Alert.alert(
      "Create Payout Batch",
      "Aggregate all available verified agency earnings into a new draft payout batch?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate Batch",
          onPress: async () => {
            setProcessingAction(true);
            const res = await payoutAdminService.createBatch();
            setProcessingAction(false);
            if (res.success) {
              Alert.alert("Success", res.message || "Draft payout batch created.");
              loadData();
            } else {
              Alert.alert("Batch Creation Notice", res.message || "Unable to generate batch.");
            }
          },
        },
      ]
    );
  };

  // View Batch Details
  const handleOpenBatch = async (batch: PayoutBatch) => {
    setSelectedBatch(batch);
    setBatchModalVisible(true);
    const details = await payoutAdminService.getBatchDetails(batch.id);
    if (details) {
      setSelectedBatch(details);
    }
  };

  // Approve Batch
  const handleApproveBatch = async (batchId: string) => {
    Alert.alert(
      "Approve Payout Batch",
      "Approving this batch locks the ledger records and authorizes bank disbursement. Proceed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve Batch",
          onPress: async () => {
            setProcessingAction(true);
            const res = await payoutAdminService.approveBatch(batchId);
            setProcessingAction(false);
            if (res.success) {
              Alert.alert("Approved", "Batch has been marked as approved for disbursement.");
              setBatchModalVisible(false);
              loadData();
            } else {
              Alert.alert("Error", res.message || "Approval failed.");
            }
          },
        },
      ]
    );
  };

  // Mark Paid & Settle
  const handleMarkPaid = async (batchId: string) => {
    Alert.alert(
      "Confirm Ledger Settlement",
      "Have you executed the bank transfer / bKash disbursement? Marking paid will finalize double-entry journal entries.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm Settle & Mark Paid",
          style: "destructive",
          onPress: async () => {
            setProcessingAction(true);
            const res = await payoutAdminService.markBatchPaid(batchId);
            setProcessingAction(false);
            if (res.success) {
              Alert.alert("Settled", "Batch successfully marked as paid in financial ledger.");
              setBatchModalVisible(false);
              loadData();
            } else {
              Alert.alert("Error", res.message || "Settlement failed.");
            }
          },
        },
      ]
    );
  };

  // Export CSV (prefer authoritative backend endpoint; fallback to real agency bank map)
  const handleExportCsv = async (batch: PayoutBatch, format: "bank" | "bkash") => {
    const title = format === "bkash" ? "bKash Bulk Payout CSV" : "BEFTN Bank Payout CSV";
    const filename = `payout-batch-${batch.id.substring(0, 8)}-${format}.csv`;
    try {
      let csvContent: string;
      try {
        csvContent = await payoutAdminService.fetchServerCsvContent(batch.id, format);
      } catch {
        const earningsMap: Record<string, AgencyPendingEarning> = {};
        agencyEarnings.forEach((e) => {
          earningsMap[e.agency_id] = e;
        });
        csvContent = payoutAdminService.generateCsvContent(batch, format, earningsMap);
      }
      await exportCsvOrTextFile({ filename, content: csvContent, title });
    } catch (err: any) {
      Alert.alert("Export Error", err?.message || "Failed to export payout CSV.");
    }
  };

  // Save Commission Splits
  const handleSaveSplits = async () => {
    if (!admin) return;
    try {
      setSavingSplits(true);
      const cmdResult = await executeAdminCommand(
        new UpdateCommissionSplitCommand(splits),
        admin
      );
      if (cmdResult.success) {
        Alert.alert("Success", "Commission splits updated and logged to admin audit trail.");
      } else {
        Alert.alert("Governance Block", cmdResult.error || "Failed to update commission splits.");
      }
    } finally {
      setSavingSplits(false);
    }
  };

  // Calculated Metrics
  const totalPendingPaisa = agencyEarnings.reduce((acc, curr) => acc + curr.pending_paisa, 0);
  const totalBatchedPaisa = batches.reduce((acc, b) => acc + b.total_paisa, 0);

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Financial Overview Cards */}
      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, { borderLeftColor: "#f59e0b" }]}>
          <Text style={styles.metricLabel}>Pending Agency Balances</Text>
          <Text style={styles.metricValue}>
            {payoutAdminService.formatPaisaToBdt(totalPendingPaisa)}
          </Text>
          <Text style={styles.metricSubtext}>{agencyEarnings.length} Partner Agencies</Text>
        </View>

        <View style={[styles.metricCard, { borderLeftColor: "#10b981" }]}>
          <Text style={styles.metricLabel}>Total Payout Batches</Text>
          <Text style={styles.metricValue}>
            {payoutAdminService.formatPaisaToBdt(totalBatchedPaisa)}
          </Text>
          <Text style={styles.metricSubtext}>{batches.length} Generated Batches</Text>
        </View>

        <View style={[styles.metricCard, { borderLeftColor: "#3b82f6" }]}>
          <Text style={styles.metricLabel}>Settlement Currency</Text>
          <Text style={styles.metricValue}>BDT (৳)</Text>
          <Text style={styles.metricSubtext}>Integer Paisa Precision</Text>
        </View>
      </View>

      {/* Navigation Sub-Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "batches" && styles.tabBtnActive]}
          onPress={() => setActiveTab("batches")}
        >
          <MaterialCommunityIcons
            name="layers-triple-outline"
            size={18}
            color={activeTab === "batches" ? "#fff" : "#64748b"}
          />
          <Text style={[styles.tabText, activeTab === "batches" && styles.tabTextActive]}>
            Disbursement Batches ({batches.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "balances" && styles.tabBtnActive]}
          onPress={() => setActiveTab("balances")}
        >
          <MaterialCommunityIcons
            name="wallet-outline"
            size={18}
            color={activeTab === "balances" ? "#fff" : "#64748b"}
          />
          <Text style={[styles.tabText, activeTab === "balances" && styles.tabTextActive]}>
            Agency Balances ({agencyEarnings.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "splits" && styles.tabBtnActive]}
          onPress={() => setActiveTab("splits")}
        >
          <MaterialCommunityIcons
            name="percent-outline"
            size={18}
            color={activeTab === "splits" ? "#fff" : "#64748b"}
          />
          <Text style={[styles.tabText, activeTab === "splits" && styles.tabTextActive]}>
            Commission Splits
          </Text>
        </TouchableOpacity>
      </View>

      {error && <ErrorStateCard message={error} onRetry={loadData} />}

      {loading && !refreshing && (
        <LoadingState message="Loading double-entry ledger batches..." />
      )}

      {/* TAB 1: DISBURSEMENT BATCHES */}
      {!loading && activeTab === "batches" && (
        <View style={styles.tabContent}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Payout Disbursement Batches</Text>
              <Text style={styles.sectionSubtitle}>
                Batched settlement cycles with BEFTN & bKash bulk export support
              </Text>
            </View>
            <TouchableOpacity style={styles.primaryActionBtn} onPress={handleCreateBatch}>
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.primaryActionBtnText}>Create Batch</Text>
            </TouchableOpacity>
          </View>

          {batches.length === 0 ? (
            <EmptyState
              title="No Payout Batches"
              description="No payout disbursement batches have been generated yet."
              type="generic"
            />
          ) : (
            batches.map((batch) => (
              <View key={batch.id} style={styles.batchCard}>
                <View style={styles.batchCardHeader}>
                  <View style={styles.batchIdRow}>
                    <MaterialCommunityIcons name="cube-send" size={20} color="#0284c7" />
                    <Text style={styles.batchIdText}>
                      Batch #{batch.id.substring(0, 8).toUpperCase()}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      batch.status === "paid"
                        ? styles.statusPillPaid
                        : batch.status === "approved"
                        ? styles.statusPillApproved
                        : styles.statusPillDraft,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        batch.status === "paid"
                          ? styles.statusPillTextPaid
                          : batch.status === "approved"
                          ? styles.statusPillTextApproved
                          : styles.statusPillTextDraft,
                      ]}
                    >
                      {batch.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.batchMetaGrid}>
                  <View style={styles.batchMetaCol}>
                    <Text style={styles.metaLabel}>Total Payout</Text>
                    <Text style={styles.metaValueHighlight}>{batch.total_bdt}</Text>
                  </View>
                  <View style={styles.batchMetaCol}>
                    <Text style={styles.metaLabel}>Agencies Included</Text>
                    <Text style={styles.metaValue}>{batch.payout_count} Payouts</Text>
                  </View>
                  <View style={styles.batchMetaCol}>
                    <Text style={styles.metaLabel}>Created Date</Text>
                    <Text style={styles.metaValue}>
                      {new Date(batch.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>

                <View style={styles.batchActionRow}>
                  <TouchableOpacity
                    style={styles.batchDetailBtn}
                    onPress={() => handleOpenBatch(batch)}
                  >
                    <Feather name="eye" size={15} color="#0284c7" />
                    <Text style={styles.batchDetailBtnText}>Inspect Batch</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.batchExportBtn}
                    onPress={() => handleExportCsv(batch, "bank")}
                  >
                    <Feather name="download" size={15} color="#475569" />
                    <Text style={styles.batchExportBtnText}>BEFTN CSV</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.batchExportBtn}
                    onPress={() => handleExportCsv(batch, "bkash")}
                  >
                    <Feather name="download" size={15} color="#d946ef" />
                    <Text style={[styles.batchExportBtnText, { color: "#d946ef" }]}>
                      bKash CSV
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* TAB 2: AGENCY BALANCES */}
      {!loading && activeTab === "balances" && (
        <View style={styles.tabContent}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Agency Settlement Balances</Text>
              <Text style={styles.sectionSubtitle}>
                Verified earnings eligible for disbursement
              </Text>
            </View>
          </View>

          {agencyEarnings.length === 0 ? (
            <EmptyState
              title="No Agency Balances"
              description="No agencies currently have active ledger records."
              type="generic"
            />
          ) : (
            agencyEarnings.map((agency) => (
              <View key={agency.agency_id} style={styles.agencyRowCard}>
                <View style={styles.agencyInfoRow}>
                  <View style={styles.agencyAvatar}>
                    <Text style={styles.agencyAvatarText}>
                      {agency.agency_name.substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={styles.agencyNameText}>{agency.agency_name}</Text>
                      {agency.is_verified && (
                        <MaterialCommunityIcons
                          name="check-decagram"
                          size={16}
                          color="#0284c7"
                          style={{ marginLeft: 4 }}
                        />
                      )}
                    </View>
                    <Text style={styles.bankDetailText}>
                      Bank: {agency.bank_name} • A/C: {agency.bank_account}
                    </Text>
                    <Text style={styles.bankDetailText}>
                      bKash Wallet: {agency.bkash_wallet}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.agencyBalanceText}>{agency.pending_bdt}</Text>
                    <Text style={styles.agencyBalanceLabel}>Available Balance</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* TAB 3: COMMISSION SPLITS */}
      {!loading && activeTab === "splits" && (
        <View style={styles.tabContent}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Global Commission Rates</Text>
              <Text style={styles.sectionSubtitle}>
                Default revenue share retained by ShopnoJatra platform
              </Text>
            </View>
            <TouchableOpacity
              style={styles.saveSplitsBtn}
              onPress={handleSaveSplits}
              disabled={savingSplits}
            >
              {savingSplits ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={16} color="#fff" />
                  <Text style={styles.saveSplitsBtnText}>Save Rates</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.splitsGrid}>
            {Object.keys(splits).map((vertical) => (
              <View key={vertical} style={styles.splitBox}>
                <Text style={styles.splitBoxTitle}>{vertical.toUpperCase()}</Text>
                <TextInput
                  style={styles.splitBoxInput}
                  value={splits[vertical]}
                  onChangeText={(val) => setSplits((prev) => ({ ...prev, [vertical]: val }))}
                  placeholder="e.g. 10%"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            ))}
          </View>
        </View>
      )}

      {/* BATCH DETAILS MODAL */}
      <Modal
        visible={batchModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setBatchModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedBatch && (
              <>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>
                      Disbursement Batch #{selectedBatch.id.substring(0, 8).toUpperCase()}
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      Status: {selectedBatch.status.toUpperCase()} • Total: {selectedBatch.total_bdt}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.closeModalBtn}
                    onPress={() => setBatchModalVisible(false)}
                  >
                    <Ionicons name="close" size={22} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalSectionLabel}>Itemized Agency Payouts</Text>
                  {selectedBatch.payouts && selectedBatch.payouts.length > 0 ? (
                    selectedBatch.payouts.map((p) => (
                      <View key={p.id} style={styles.payoutItemCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.payoutAgencyName}>
                            {p.agency_name || "Partner Agency"}
                          </Text>
                          <Text style={styles.payoutRef}>
                            Ref: {p.reference || p.id.substring(0, 8)}
                          </Text>
                        </View>
                        <Text style={styles.payoutAmount}>{p.amount_bdt}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noPayoutsText}>No individual payouts in this batch.</Text>
                  )}
                </ScrollView>

                {/* MODAL ACTIONS */}
                <View style={styles.modalFooter}>
                  {selectedBatch.status === "draft" && (
                    <TouchableOpacity
                      style={styles.approveBatchBtn}
                      onPress={() => handleApproveBatch(selectedBatch.id)}
                      disabled={processingAction}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.modalActionText}>Approve Batch</Text>
                    </TouchableOpacity>
                  )}

                  {selectedBatch.status === "approved" && (
                    <TouchableOpacity
                      style={styles.markPaidBatchBtn}
                      onPress={() => handleMarkPaid(selectedBatch.id)}
                      disabled={processingAction}
                    >
                      <MaterialCommunityIcons name="bank-transfer" size={18} color="#fff" />
                      <Text style={styles.modalActionText}>Mark Paid & Settle</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.exportCsvModalBtn}
                    onPress={() => handleExportCsv(selectedBatch, "bank")}
                  >
                    <Feather name="download" size={16} color="#0284c7" />
                    <Text style={styles.exportCsvModalText}>BEFTN CSV</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.exportCsvModalBtn}
                    onPress={() => handleExportCsv(selectedBatch, "bkash")}
                  >
                    <Feather name="download" size={16} color="#d946ef" />
                    <Text style={[styles.exportCsvModalText, { color: "#d946ef" }]}>
                      bKash CSV
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 16,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  metricCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
  },
  metricSubtext: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 10,
    padding: 4,
    marginBottom: 18,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: "#0284c7",
    shadowColor: "#0284c7",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  tabContent: {
    marginBottom: 40,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0284c7",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  primaryActionBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
  batchCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  batchCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  batchIdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  batchIdText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillDraft: {
    backgroundColor: "#fef3c7",
  },
  statusPillApproved: {
    backgroundColor: "#e0f2fe",
  },
  statusPillPaid: {
    backgroundColor: "#dcfce7",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusPillTextDraft: {
    color: "#b45309",
  },
  statusPillTextApproved: {
    color: "#0369a1",
  },
  statusPillTextPaid: {
    color: "#15803d",
  },
  batchMetaGrid: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  batchMetaCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    color: "#64748b",
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e293b",
    marginTop: 2,
  },
  metaValueHighlight: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0284c7",
    marginTop: 2,
  },
  batchActionRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  batchDetailBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    gap: 6,
  },
  batchDetailBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0284c7",
  },
  batchExportBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    gap: 6,
  },
  batchExportBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  agencyRowCard: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  agencyInfoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  agencyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e0f2fe",
    alignItems: "center",
    justifyContent: "center",
  },
  agencyAvatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0284c7",
  },
  agencyNameText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  bankDetailText: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  agencyBalanceText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#059669",
  },
  agencyBalanceLabel: {
    fontSize: 10,
    color: "#94a3b8",
  },
  saveSplitsBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  saveSplitsBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
  splitsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  splitBox: {
    flex: 1,
    minWidth: 140,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  splitBoxTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 6,
  },
  splitBoxInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    width: "100%",
    maxWidth: 600,
    maxHeight: "85%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  modalSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  closeModalBtn: {
    padding: 4,
  },
  modalBody: {
    padding: 18,
  },
  modalSectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  payoutItemCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  payoutAgencyName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
  },
  payoutRef: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  payoutAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0284c7",
  },
  noPayoutsText: {
    fontSize: 12,
    color: "#94a3b8",
    fontStyle: "italic",
    paddingVertical: 12,
  },
  modalFooter: {
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
    backgroundColor: "#f8fafc",
    flexWrap: "wrap",
  },
  approveBatchBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0284c7",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6,
  },
  markPaidBatchBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6,
  },
  modalActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
  exportCsvModalBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6,
  },
  exportCsvModalText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0284c7",
  },
});
