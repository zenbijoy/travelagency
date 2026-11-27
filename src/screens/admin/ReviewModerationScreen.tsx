/**
 * Review & Content Moderation Screen - Admin Panel
 * Multi-Entity Content Governance, Rule-Based Spam Detection & Bulk Actions
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  ScrollView,
} from "react-native";
import { MaterialCommunityIcons, Ionicons, Feather } from "@expo/vector-icons";
import { reviewAdminService, ModerationItem } from "@/services/adminService";
import { useRBAC } from "./rbac";
import { withErrorBoundary } from "../../components/common/ErrorBoundaryView";
import { ErrorStateCard } from "../../components/common/ErrorStateCard";
import { LoadingState } from "../../components/ui/LoadingState";
import { EmptyState } from "../../components/ui/EmptyState";

const ReviewModerationScreenComponent: React.FC = () => {
  const { admin } = useRBAC();
  const [activeTab, setActiveTab] = useState<"all" | "agency" | "hotel" | "destination" | "community">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkOperating, setIsBulkOperating] = useState(false);

  // Rejection Notes Modal State
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [itemToReject, setItemToReject] = useState<ModerationItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await reviewAdminService.listModerationItems(
        activeTab,
        statusFilter,
        searchQuery
      );
      setItems(data || []);
      setSelectedIds([]);
    } catch (err: any) {
      console.error("Error loading moderation items:", err);
      setError(err?.message || "Failed to load moderation queue.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, statusFilter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // Moderate Single Item
  const handleModerate = async (
    item: ModerationItem,
    action: "approved" | "rejected" | "hidden" | "flagged",
    notes?: string
  ) => {
    try {
      const ok = await reviewAdminService.moderateItem(
        item.id,
        item.entityType,
        action,
        notes,
        admin?.id
      );

      if (ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: action } : i))
        );
        Alert.alert("Success", `Item marked as ${action.toUpperCase()}.`);
      } else {
        Alert.alert("Error", "Failed to update review status.");
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Moderation action failed.");
    }
  };

  // Trigger Rejection Modal
  const openRejectModal = (item: ModerationItem) => {
    setItemToReject(item);
    setRejectionReason("");
    setRejectModalVisible(true);
  };

  const confirmRejection = async () => {
    if (!itemToReject) return;
    await handleModerate(itemToReject, "rejected", rejectionReason || "Violated community guidelines");
    setRejectModalVisible(false);
    setItemToReject(null);
  };

  // Bulk Selection Toggles
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((i) => i.id));
    }
  };

  const handleBulkAction = async (action: "approved" | "rejected") => {
    if (selectedIds.length === 0) return;

    Alert.alert(
      "Confirm Bulk Moderation",
      `Are you sure you want to mark ${selectedIds.length} item(s) as ${action.toUpperCase()}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Bulk ${action.toUpperCase()}`,
          onPress: async () => {
            setIsBulkOperating(true);
            const targetItems = items.filter((i) => selectedIds.includes(i.id));
            const count = await reviewAdminService.bulkModerate(
              targetItems.map((i) => ({ id: i.id, entityType: i.entityType })),
              action,
              admin?.id
            );
            setIsBulkOperating(false);
            Alert.alert("Bulk Completed", `${count} items updated.`);
            loadData();
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "#10b981";
      case "pending":
        return "#f59e0b";
      case "rejected":
        return "#ef4444";
      case "hidden":
        return "#64748b";
      case "flagged":
        return "#dc2626";
      default:
        return "#9ca3af";
    }
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case "agency":
        return "briefcase-outline";
      case "hotel":
        return "bed-outline";
      case "destination":
        return "map-marker-outline";
      case "community":
        return "account-group-outline";
      default:
        return "comment-text-outline";
    }
  };

  return (
    <View style={styles.container}>
      {/* Search & Top Filters */}
      <View style={styles.headerSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#64748b" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search review content, target name, or author..."
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

        {/* Entity Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
          {[
            { id: "all", label: "All Content" },
            { id: "agency", label: "Agency Reviews" },
            { id: "hotel", label: "Hotel Reviews" },
            { id: "destination", label: "Destinations" },
            { id: "community", label: "Community Reports" },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.entityPill, activeTab === tab.id && styles.entityPillActive]}
              onPress={() => setActiveTab(tab.id as any)}
            >
              <Text style={[styles.entityPillText, activeTab === tab.id && styles.entityPillTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Status Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
          {["all", "pending", "approved", "rejected", "flagged"].map((s) => (
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

      {/* Bulk Operations Toolbar */}
      {items.length > 0 && (
        <View style={styles.bulkToolbar}>
          <TouchableOpacity style={styles.selectAllBtn} onPress={selectAll}>
            <MaterialCommunityIcons
              name={selectedIds.length === items.length && items.length > 0 ? "checkbox-marked" : "checkbox-blank-outline"}
              size={18}
              color="#0284c7"
            />
            <Text style={styles.selectAllText}>
              {selectedIds.length > 0 ? `${selectedIds.length} Selected` : "Select All"}
            </Text>
          </TouchableOpacity>

          {selectedIds.length > 0 && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={styles.bulkApproveBtn}
                onPress={() => handleBulkAction("approved")}
                disabled={isBulkOperating}
              >
                <Ionicons name="checkmark-done" size={14} color="#fff" />
                <Text style={styles.bulkBtnText}>Approve</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.bulkRejectBtn}
                onPress={() => handleBulkAction("rejected")}
                disabled={isBulkOperating}
              >
                <Ionicons name="close" size={14} color="#fff" />
                <Text style={styles.bulkBtnText}>Reject</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {error && <ErrorStateCard message={error} onRetry={loadData} />}

      {/* Reviews List */}
      {loading && !refreshing ? (
        <LoadingState message="Loading review moderation queue..." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.entityType}-${item.id}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <View style={[styles.reviewCard, isSelected && styles.reviewCardSelected]}>
                {/* Header */}
                <View style={styles.cardHeader}>
                  <TouchableOpacity
                    style={styles.selectCheckbox}
                    onPress={() => toggleSelect(item.id)}
                  >
                    <MaterialCommunityIcons
                      name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
                      size={20}
                      color={isSelected ? "#0284c7" : "#94a3b8"}
                    />
                  </TouchableOpacity>

                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <MaterialCommunityIcons
                        name={getEntityIcon(item.entityType) as any}
                        size={16}
                        color="#0284c7"
                      />
                      <Text style={styles.targetNameText}>{item.targetName}</Text>
                      <View style={styles.entityTag}>
                        <Text style={styles.entityTagText}>{item.entityType.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.authorText}>
                      By {item.userName || item.userId} • {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: `${getStatusColor(item.status)}15` },
                    ]}
                  >
                    <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Rating & Content */}
                <View style={styles.cardContent}>
                  {item.rating !== undefined && (
                    <View style={styles.ratingRow}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <MaterialCommunityIcons
                          key={star}
                          name={star <= (item.rating || 0) ? "star" : "star-outline"}
                          size={16}
                          color="#f59e0b"
                        />
                      ))}
                      <Text style={styles.ratingNumber}>({item.rating}/5)</Text>
                    </View>
                  )}
                  <Text style={styles.contentText}>{item.content || "No text payload provided."}</Text>
                </View>

                {/* Spam & Risk Indicators */}
                {(item.spamFlags.isSpam || item.spamFlags.hasProfanity) && (
                  <View style={styles.riskBanner}>
                    <Ionicons name="warning-outline" size={14} color="#b91c1c" />
                    <Text style={styles.riskText}>
                      Risk Flags:{" "}
                      {[
                        item.spamFlags.hasProfanity ? "Profanity" : null,
                        item.spamFlags.hasSuspiciousLinks ? "External Links" : null,
                        item.spamFlags.isRepeated ? "Repetition Spam" : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </Text>
                  </View>
                )}

                {/* Moderation Actions */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.approveActionBtn}
                    onPress={() => handleModerate(item, "approved")}
                  >
                    <Ionicons name="checkmark" size={15} color="#166534" />
                    <Text style={styles.approveActionText}>Approve</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.rejectActionBtn}
                    onPress={() => openRejectModal(item)}
                  >
                    <Ionicons name="close" size={15} color="#b91c1c" />
                    <Text style={styles.rejectActionText}>Reject</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.flagActionBtn}
                    onPress={() => handleModerate(item, "flagged", "Flagged for fraud audit")}
                  >
                    <Feather name="flag" size={13} color="#64748b" />
                    <Text style={styles.flagActionText}>Flag</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title="No Content in Queue"
              description="No user reviews or community posts pending moderation."
              type="generic"
            />
          }
        />
      )}

      {/* REJECTION REASON MODAL */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Reject Content Submission</Text>
            <Text style={styles.modalSubtitle}>
              Provide a reason for rejection. This will be recorded in the audit log.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Inappropriate language, spam, or promotional link..."
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setRejectModalVisible(false)}
              >
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmRejectBtn}
                onPress={confirmRejection}
              >
                <Text style={styles.confirmRejectText}>Confirm Rejection</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export const ReviewModerationScreen = withErrorBoundary(
  ReviewModerationScreenComponent,
  { screenName: "ReviewModerationScreen" }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  headerSection: {
    padding: 16,
    paddingBottom: 6,
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
  entityPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    marginRight: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  entityPillActive: {
    backgroundColor: "#0284c7",
    borderColor: "#0284c7",
  },
  entityPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  entityPillTextActive: {
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
  bulkToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
  },
  selectAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0284c7",
  },
  bulkApproveBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  bulkRejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dc2626",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  bulkBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ffffff",
  },
  reviewCard: {
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
  reviewCardSelected: {
    borderColor: "#0284c7",
    backgroundColor: "#f0f9ff",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  selectCheckbox: {
    padding: 2,
  },
  targetNameText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  entityTag: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  entityTagText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#0284c7",
  },
  authorText: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
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
  cardContent: {
    marginVertical: 6,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginBottom: 4,
  },
  ratingNumber: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
    marginLeft: 4,
  },
  contentText: {
    fontSize: 13,
    color: "#334155",
    lineHeight: 18,
  },
  riskBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fee2e2",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 6,
    marginVertical: 6,
  },
  riskText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#991b1b",
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    borderTopWidth: 1,
    borderColor: "#f1f5f9",
    paddingTop: 8,
    marginTop: 6,
    gap: 8,
  },
  approveActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  approveActionText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#166534",
  },
  rejectActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  rejectActionText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#b91c1c",
  },
  flagActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  flagActionText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalBox: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  modalSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: "#0f172a",
    minHeight: 70,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  modalBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  cancelModalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#f1f5f9",
  },
  cancelModalText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  confirmRejectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#dc2626",
  },
  confirmRejectText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
  },
});
