/**
 * Payment Operations & Gateway Reconciliations Screen - Admin Panel
 * Enterprise Gateway Monitoring, Webhook Event Telemetry & Sandbox Replay
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { MaterialCommunityIcons, Ionicons, Feather } from "@expo/vector-icons";
import {
  paymentAdminService,
  PaymentTransactionRecord,
  WebhookLogRecord,
  GatewayHealthStatus,
} from "@/services/adminService";
import { useRBAC } from "./rbac";
import { executeAdminCommand, VerifyPaymentCommand } from "./commands";
import { withErrorBoundary } from "../../components/common/ErrorBoundaryView";
import { ErrorStateCard } from "../../components/common/ErrorStateCard";
import { LoadingState } from "../../components/ui/LoadingState";
import { AdminTableRowSkeleton } from "@/components/ui/AdminSkeletons";
import { BlinkingText } from "@/components/ui/BlinkingText";
import { EmptyState } from "../../components/ui/EmptyState";

const PaymentManagementScreenComponent: React.FC = () => {
  const { admin } = useRBAC();
  const [activeTab, setActiveTab] = useState<"transactions" | "gateways" | "webhooks">("transactions");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data Collections
  const [transactions, setTransactions] = useState<PaymentTransactionRecord[]>([]);
  const [gateways, setGateways] = useState<GatewayHealthStatus[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookLogRecord[]>([]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gatewayFilter, setGatewayFilter] = useState("all");

  // Transaction Details Drawer State
  const [selectedTxn, setSelectedTxn] = useState<PaymentTransactionRecord | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Webhook Details Modal State
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookLogRecord | null>(null);
  const [webhookModalVisible, setWebhookModalVisible] = useState(false);
  const [replaying, setReplaying] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [txnData, gwData, whData] = await Promise.all([
        paymentAdminService.getTransactions({
          gateway: gatewayFilter,
          status: statusFilter,
          search: searchQuery,
          limit: 100,
        }),
        paymentAdminService.getGatewayStatuses(),
        paymentAdminService.getWebhookLogs(50),
      ]);

      setTransactions(txnData || []);
      setGateways(gwData || []);
      setWebhooks(whData || []);
    } catch (err: any) {
      console.error("Error loading payment operations data:", err);
      setError(err?.message || "Failed to load payment operations data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [gatewayFilter, statusFilter]);

  const didMountSearchRef = React.useRef(false);
  useEffect(() => {
    if (!didMountSearchRef.current) {
      didMountSearchRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      loadData();
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // Manual Payment Verification Override
  const handleManualVerification = () => {
    if (!selectedTxn || !admin) return;

    Alert.alert(
      "Confirm Administrative Override",
      `Manually verify and mark transaction ${selectedTxn.transaction_id} (${selectedTxn.currency} ${selectedTxn.amount}) as completed in ledger?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm & Settle",
          onPress: async () => {
            try {
              setVerifying(true);
              const command = new VerifyPaymentCommand(
                selectedTxn.id,
                `Manual override verification by ${admin.name || admin.id}`
              );
              const cmdRes = await executeAdminCommand(command, admin);
              if (!cmdRes.success) {
                Alert.alert("Permission Error", cmdRes.error || "Manual verification denied.");
                return;
              }

              setTransactions((prev) =>
                prev.map((t) => (t.id === selectedTxn.id ? { ...t, payment_status: "completed" } : t))
              );
              setSelectedTxn((prev) => (prev ? { ...prev, payment_status: "completed" } : null));
              Alert.alert("Verified", "Transaction marked as completed and audit logged.");
            } catch (err: any) {
              Alert.alert("Error", err.message || "Manual verification failed.");
            } finally {
              setVerifying(false);
            }
          },
        },
      ]
    );
  };

  // Safe Sandbox Webhook Replay
  const handleReplayWebhook = async (webhookId: string) => {
    Alert.alert(
      "Safe Sandbox Webhook Replay",
      "Re-execute HMAC signature verification and webhook logic in isolated sandbox mode without altering production ledger?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replay in Sandbox",
          onPress: async () => {
            setReplaying(true);
            const res = await paymentAdminService.replayWebhookInSandbox(webhookId);
            setReplaying(false);
            if (res.success) {
              Alert.alert("Sandbox Replay Success", res.message);
            } else {
              Alert.alert("Replay Failed", res.message);
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return "#10b981";
      case "pending":
      case "processing":
        return "#f59e0b";
      case "failed":
        return "#ef4444";
      case "refunded":
        return "#8b5cf6";
      default:
        return "#64748b";
    }
  };

  const getGatewayIcon = (gateway: string) => {
    const gw = (gateway || "").toLowerCase();
    if (gw.includes("bkash")) return "cellphone-check";
    if (gw.includes("nagad")) return "shield-lock-outline";
    if (gw.includes("rocket")) return "rocket-launch-outline";
    if (gw.includes("stripe")) return "credit-card-outline";
    if (gw.includes("wallet")) return "wallet-outline";
    return "credit-card-multiple-outline";
  };

  return (
    <View style={styles.container}>
      {/* Top Navigation Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "transactions" && styles.tabBtnActive]}
          onPress={() => setActiveTab("transactions")}
        >
          <MaterialCommunityIcons
            name="cash-multiple"
            size={18}
            color={activeTab === "transactions" ? "#fff" : "#64748b"}
          />
          <Text style={[styles.tabText, activeTab === "transactions" && styles.tabTextActive]}>
            Transactions ({transactions.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "gateways" && styles.tabBtnActive]}
          onPress={() => setActiveTab("gateways")}
        >
          <MaterialCommunityIcons
            name="server-network"
            size={18}
            color={activeTab === "gateways" ? "#fff" : "#64748b"}
          />
          <Text style={[styles.tabText, activeTab === "gateways" && styles.tabTextActive]}>
            Gateway Health ({gateways.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "webhooks" && styles.tabBtnActive]}
          onPress={() => setActiveTab("webhooks")}
        >
          <MaterialCommunityIcons
            name="webhook"
            size={18}
            color={activeTab === "webhooks" ? "#fff" : "#64748b"}
          />
          <Text style={[styles.tabText, activeTab === "webhooks" && styles.tabTextActive]}>
            Webhook Queue ({webhooks.length})
          </Text>
        </TouchableOpacity>
      </View>

      {error && <ErrorStateCard message={error} onRetry={loadData} />}

      {/* TAB 1: TRANSACTIONS & RECONCILIATIONS */}
      {activeTab === "transactions" && (
        <View style={{ flex: 1 }}>
          {/* Search & Filter Header */}
          <View style={styles.filterSection}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="#64748b" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search Txn ID, Booking Ref, Customer Name, Email..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#94a3b8"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Gateway Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
              {[
                { id: "all", label: "All Gateways" },
                { id: "bkash", label: "bKash" },
                { id: "nagad", label: "Nagad" },
                { id: "rocket", label: "Rocket" },
                { id: "sslcommerz", label: "SSLCommerz" },
                { id: "stripe", label: "Stripe" },
                { id: "wallet", label: "Wallet" },
              ].map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.filterPill, gatewayFilter === g.id && styles.filterPillActive]}
                  onPress={() => setGatewayFilter(g.id)}
                >
                  <Text style={[styles.filterPillText, gatewayFilter === g.id && styles.filterPillTextActive]}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Status Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
              {["all", "completed", "pending", "failed", "refunded"].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.statusPillBtn, statusFilter === s && styles.statusPillBtnActive]}
                  onPress={() => setStatusFilter(s)}
                >
                  <Text style={[styles.statusPillBtnText, statusFilter === s && styles.statusPillBtnTextActive]}>
                    {s.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Transaction List */}
          {loading && !refreshing ? (
            <AdminTableRowSkeleton count={5} />
          ) : (
            <FlatList
              data={transactions}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.txnCard}
                  onPress={() => {
                    setSelectedTxn(item);
                    setDetailsModalVisible(true);
                  }}
                >
                  <View style={styles.txnCardHeader}>
                    <View style={styles.txnIdBox}>
                      <MaterialCommunityIcons
                        name={getGatewayIcon(item.payment_gateway) as any}
                        size={20}
                        color="#0284c7"
                      />
                      <Text style={styles.txnIdText}>{item.transaction_id}</Text>
                      <View style={styles.gwBadge}>
                        <Text style={styles.gwBadgeText}>{item.payment_gateway.toUpperCase()}</Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: `${getStatusColor(item.payment_status)}15` },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: getStatusColor(item.payment_status) }]}>
                        {item.payment_status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.txnCardBody}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.customerName}>{item.customer_name || "Direct Customer"}</Text>
                      <Text style={styles.bookingRefText}>Booking Ref: {item.booking_reference}</Text>
                      <Text style={styles.txnDateText}>
                        {new Date(item.created_at).toLocaleString()}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.amountText}>
                        {item.currency} {Number(item.amount).toLocaleString()}
                      </Text>
                      <Text style={styles.methodText}>Method: {item.payment_method}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <EmptyState
                  title="No Transactions Found"
                  description="No payment records match the current gateway and status filters."
                  type="generic"
                />
              }
            />
          )}
        </View>
      )}

      {/* TAB 2: GATEWAY HEALTH STATUS */}
      {activeTab === "gateways" && (
        <ScrollView
          style={styles.gatewayScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Text style={styles.sectionTitle}>Payment Gateway Integration Status</Text>
          <Text style={styles.sectionSubtitle}>
            Live operational status, HMAC verification & latency telemetry
          </Text>

          <View style={styles.gatewayGrid}>
            {gateways.map((gw) => (
              <View key={gw.gateway} style={styles.gatewayCard}>
                <View style={styles.gwHeader}>
                  <MaterialCommunityIcons
                    name={getGatewayIcon(gw.gateway) as any}
                    size={24}
                    color="#0284c7"
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.gwDisplayName}>{gw.displayName}</Text>
                    <Text style={styles.gwCurrency}>Currency: {gw.currency}</Text>
                  </View>
                  <View style={[styles.gwStatusPill, gw.status === "operational" ? styles.gwStatusOperational : styles.gwStatusSandbox]}>
                    <Text style={[styles.gwStatusText, gw.status === "operational" ? styles.gwStatusTextOp : styles.gwStatusTextSb]}>
                      {gw.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.gwStatsRow}>
                  <View style={styles.gwStatCol}>
                    <Text style={styles.gwStatLabel}>Success Rate</Text>
                    <Text style={[styles.gwStatVal, { color: "#059669" }]}>{gw.successRate}%</Text>
                  </View>
                  <View style={styles.gwStatCol}>
                    <Text style={styles.gwStatLabel}>Avg Latency</Text>
                    <Text style={styles.gwStatVal}>{gw.avgLatencyMs} ms</Text>
                  </View>
                  <View style={styles.gwStatCol}>
                    <Text style={styles.gwStatLabel}>Transactions</Text>
                    <Text style={styles.gwStatVal}>{gw.activeTodayCount}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* TAB 3: WEBHOOK EVENT INSPECTOR */}
      {activeTab === "webhooks" && (
        <FlatList
          data={webhooks}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.whCard}
              onPress={() => {
                setSelectedWebhook(item);
                setWebhookModalVisible(true);
              }}
            >
              <View style={styles.whHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <MaterialCommunityIcons name="webhook" size={18} color="#0284c7" />
                  <Text style={styles.whGateway}>{item.gateway.toUpperCase()}</Text>
                  <Text style={styles.whEventType}>{item.event_type}</Text>
                </View>
                <View
                  style={[
                    styles.sigBadge,
                    item.signature_verified ? styles.sigValid : styles.sigInvalid,
                  ]}
                >
                  <Ionicons
                    name={item.signature_verified ? "checkmark-circle" : "alert-circle"}
                    size={14}
                    color={item.signature_verified ? "#15803d" : "#b91c1c"}
                  />
                  <Text
                    style={[
                      styles.sigText,
                      item.signature_verified ? styles.sigTextValid : styles.sigTextInvalid,
                    ]}
                  >
                    {item.signature_verified ? "HMAC VERIFIED" : "UNVERIFIED"}
                  </Text>
                </View>
              </View>

              <Text style={styles.whIpText}>Source IP: {item.ip_address} • {new Date(item.created_at).toLocaleString()}</Text>

              <View style={styles.whActionRow}>
                <TouchableOpacity
                  style={styles.whReplayBtn}
                  onPress={() => handleReplayWebhook(item.id)}
                  disabled={replaying}
                >
                  <Feather name="refresh-cw" size={14} color="#0284c7" />
                  <Text style={styles.whReplayBtnText}>Replay in Sandbox</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No Webhook Events"
              description="No incoming webhook payloads recorded in queue."
              type="generic"
            />
          }
        />
      )}

      {/* TRANSACTION DETAILS MODAL */}
      <Modal
        visible={detailsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedTxn && (
              <>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Transaction Inspector</Text>
                    <Text style={styles.modalSubtitle}>{selectedTxn.transaction_id}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody}>
                  <View style={styles.modalMetaCard}>
                    <Text style={styles.metaRow}>Amount: <Text style={styles.bold}>{selectedTxn.currency} {Number(selectedTxn.amount).toLocaleString()}</Text></Text>
                    <Text style={styles.metaRow}>Status: <Text style={styles.bold}>{selectedTxn.payment_status.toUpperCase()}</Text></Text>
                    <Text style={styles.metaRow}>Gateway: <Text style={styles.bold}>{selectedTxn.payment_gateway.toUpperCase()}</Text></Text>
                    <Text style={styles.metaRow}>Booking Ref: <Text style={styles.bold}>{selectedTxn.booking_reference}</Text></Text>
                    <Text style={styles.metaRow}>Customer: <Text style={styles.bold}>{selectedTxn.customer_name || "N/A"}</Text></Text>
                    <Text style={styles.metaRow}>Email: <Text style={styles.bold}>{selectedTxn.customer_email || "N/A"}</Text></Text>
                    <Text style={styles.metaRow}>Date: <Text style={styles.bold}>{new Date(selectedTxn.created_at).toLocaleString()}</Text></Text>
                  </View>

                  <Text style={styles.sectionHeading}>Gateway Response Payload</Text>
                  <View style={styles.jsonBox}>
                    <Text style={styles.jsonText}>
                      {JSON.stringify(selectedTxn.payment_gateway_response || {}, null, 2)}
                    </Text>
                  </View>
                </ScrollView>

                <View style={styles.modalFooter}>
                  {selectedTxn.payment_status !== "completed" && (
                    <TouchableOpacity
                      style={styles.verifyBtn}
                      onPress={handleManualVerification}
                      disabled={verifying}
                    >
                      <Ionicons name="checkmark-done" size={16} color="#fff" />
                      <Text style={styles.verifyBtnText}>Manual Override Settle</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.closeBtnFooter}
                    onPress={() => setDetailsModalVisible(false)}
                  >
                    <Text style={styles.closeBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* WEBHOOK INSPECTOR MODAL */}
      <Modal
        visible={webhookModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setWebhookModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedWebhook && (
              <>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Webhook Payload Inspector</Text>
                    <Text style={styles.modalSubtitle}>{selectedWebhook.gateway.toUpperCase()} • {selectedWebhook.event_type}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setWebhookModalVisible(false)}>
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody}>
                  <Text style={styles.sectionHeading}>Raw Event Payload</Text>
                  <View style={styles.jsonBox}>
                    <Text style={styles.jsonText}>
                      {JSON.stringify(selectedWebhook.payload || {}, null, 2)}
                    </Text>
                  </View>
                </ScrollView>

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.verifyBtn}
                    onPress={() => handleReplayWebhook(selectedWebhook.id)}
                    disabled={replaying}
                  >
                    <Feather name="refresh-cw" size={16} color="#fff" />
                    <Text style={styles.verifyBtnText}>Replay in Sandbox</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.closeBtnFooter}
                    onPress={() => setWebhookModalVisible(false)}
                  >
                    <Text style={styles.closeBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export const PaymentManagementScreen = withErrorBoundary(
  PaymentManagementScreenComponent,
  { screenName: "PaymentManagementScreen" }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 10,
    padding: 4,
    margin: 16,
    marginBottom: 0,
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
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  filterSection: {
    padding: 16,
    paddingBottom: 4,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0f172a",
  },
  pillScroll: {
    flexDirection: "row",
    marginBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    marginRight: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  filterPillActive: {
    backgroundColor: "#0284c7",
    borderColor: "#0284c7",
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  filterPillTextActive: {
    color: "#ffffff",
  },
  statusPillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#f8fafc",
    marginRight: 6,
  },
  statusPillBtnActive: {
    backgroundColor: "#334155",
  },
  statusPillBtnText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
  },
  statusPillBtnTextActive: {
    color: "#ffffff",
  },
  txnCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  txnCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  txnIdBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  txnIdText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  gwBadge: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gwBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#0284c7",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  txnCardBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  customerName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e293b",
  },
  bookingRefText: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  txnDateText: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 2,
  },
  amountText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  methodText: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
  },
  gatewayScroll: {
    padding: 16,
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
    marginBottom: 16,
  },
  gatewayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 40,
  },
  gatewayCard: {
    flex: 1,
    minWidth: 260,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  gwHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  gwDisplayName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  gwCurrency: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
  },
  gwStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gwStatusOperational: {
    backgroundColor: "#dcfce7",
  },
  gwStatusSandbox: {
    backgroundColor: "#fef3c7",
  },
  gwStatusText: {
    fontSize: 9,
    fontWeight: "700",
  },
  gwStatusTextOp: {
    color: "#166534",
  },
  gwStatusTextSb: {
    color: "#b45309",
  },
  gwStatsRow: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 8,
  },
  gwStatCol: {
    flex: 1,
  },
  gwStatLabel: {
    fontSize: 10,
    color: "#64748b",
    textTransform: "uppercase",
  },
  gwStatVal: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e293b",
    marginTop: 2,
  },
  whCard: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  whHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  whGateway: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0284c7",
  },
  whEventType: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  sigBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sigValid: {
    backgroundColor: "#dcfce7",
  },
  sigInvalid: {
    backgroundColor: "#fee2e2",
  },
  sigText: {
    fontSize: 9,
    fontWeight: "700",
  },
  sigTextValid: {
    color: "#15803d",
  },
  sigTextInvalid: {
    color: "#b91c1c",
  },
  whIpText: {
    fontSize: 11,
    color: "#94a3b8",
    marginBottom: 8,
  },
  whActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    borderTopWidth: 1,
    borderColor: "#f1f5f9",
    paddingTop: 8,
  },
  whReplayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0f9ff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  whReplayBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0284c7",
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
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  modalSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  modalBody: {
    padding: 16,
  },
  modalMetaCard: {
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 6,
    marginBottom: 14,
  },
  metaRow: {
    fontSize: 12,
    color: "#475569",
  },
  bold: {
    fontWeight: "700",
    color: "#0f172a",
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  jsonBox: {
    backgroundColor: "#0f172a",
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  jsonText: {
    fontSize: 11,
    color: "#38bdf8",
    fontFamily: "monospace",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 14,
    borderTopWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    gap: 8,
  },
  verifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  verifyBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
  },
  closeBtnFooter: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  closeBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
});
