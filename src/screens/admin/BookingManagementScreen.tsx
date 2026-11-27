/**
 * Booking Management Screen - Admin Panel
 * Professional Enterprise Booking.com/Expedia Style Multi-Vertical Operations
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
  Share,
} from "react-native";
import { MaterialCommunityIcons, Ionicons, Feather } from "@expo/vector-icons";
import { bookingAdminService, DetailedBooking } from "@/services/adminService";
import { useBookingRealtimeSync } from "../../services/bookingRealtimeService";
import { AdminPagination } from "./AdminPagination";
import { DestructiveConfirmModal } from "./DestructiveConfirmModal";
import { useRBAC } from "./rbac";
import { executeAdminCommand, CancelBookingCommand, ConfirmBookingCommand } from "./commands";
import { withErrorBoundary } from "../../components/common/ErrorBoundaryView";
import { ErrorStateCard } from "../../components/common/ErrorStateCard";
import { LoadingState } from "../../components/ui/LoadingState";
import { AdminTableRowSkeleton } from "@/components/ui/AdminSkeletons";
import { BlinkingText } from "@/components/ui/BlinkingText";
import { EmptyState } from "../../components/ui/EmptyState";

type VerticalFilter = "all" | "flight" | "hotel" | "train" | "bus" | "launch" | "tour";

const BookingManagementScreenComponent: React.FC = () => {
  const { admin, hasPermission } = useRBAC();
  const [error, setError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<DetailedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [verticalFilter, setVerticalFilter] = useState<VerticalFilter>("all");

  // Selected Booking Drawer State
  const [selectedBooking, setSelectedBooking] = useState<DetailedBooking | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [actionNotes, setActionNotes] = useState("");
  const [activeDetailsTab, setActiveDetailsTab] = useState<"overview" | "passengers" | "items" | "payments" | "timeline">("overview");

  // Pagination & Modals
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [executingAction, setExecutingAction] = useState(false);

  const loadBookings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await bookingAdminService.getBookings({
        vertical: verticalFilter,
        status: statusFilter,
        searchQuery: searchQuery.trim(),
        limit: 100,
      });
      setBookings(data || []);
      setPage(1);
    } catch (err: any) {
      console.error("Error loading bookings:", err);
      setError(err?.message || "Failed to load bookings. Please check database connectivity.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, [verticalFilter, statusFilter]);

  const didMountSearchRef = React.useRef(false);
  useEffect(() => {
    if (!didMountSearchRef.current) {
      didMountSearchRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      loadBookings();
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Real-time synchronization
  useBookingRealtimeSync({
    onStatusChange: (payload) => {
      setBookings((prev) =>
        prev.map((b) =>
          b.id === payload.bookingId || b.booking_reference === payload.bookingReference
            ? { ...b, status: payload.newStatus }
            : b
        )
      );
    },
    onBookingCreated: () => {
      loadBookings();
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBookings();
  };

  // Open Full Booking Details
  const handleOpenDetails = async (booking: DetailedBooking) => {
    setSelectedBooking(booking);
    setDetailsModalVisible(true);
    setActiveDetailsTab("overview");
    setActionNotes("");

    try {
      setLoadingDetails(true);
      const fullDetails = await bookingAdminService.getBookingDetails(booking.id);
      if (fullDetails) {
        setSelectedBooking(fullDetails);
      }
    } catch (e) {
      console.warn("Could not fetch extra booking timeline details:", e);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Status Action: Confirm
  const handleExecuteConfirm = async () => {
    if (!selectedBooking || !admin) return;
    setExecutingAction(true);
    try {
      const command = new ConfirmBookingCommand(selectedBooking.id, actionNotes || "Confirmed by administrator");
      const cmdRes = await executeAdminCommand(command, admin as any);
      if (!cmdRes.success) {
        Alert.alert("Permission Error", cmdRes.error || "Failed to confirm booking.");
        return;
      }

      setBookings((prev) =>
        prev.map((b) => (b.id === selectedBooking.id ? { ...b, status: "confirmed" } : b))
      );
      setSelectedBooking((prev) => (prev ? { ...prev, status: "confirmed" } : null));
      Alert.alert("Success", `Booking ${selectedBooking.booking_reference} confirmed successfully.`);
    } catch (err: any) {
      Alert.alert("Permission Error", err.message || "Failed to confirm booking.");
    } finally {
      setExecutingAction(false);
    }
  };

  // Status Action: Mark Completed
  const handleExecuteComplete = async () => {
    if (!selectedBooking || !admin) return;
    if (!hasPermission("bookings.modify")) {
      Alert.alert("Permission Error", "You do not have permission to modify bookings.");
      return;
    }
    setExecutingAction(true);
    try {
      const ok = await bookingAdminService.updateBookingStatus(
        selectedBooking.id,
        "completed",
        actionNotes || "Completed journey marked by administrator",
        admin.id
      );
      if (!ok) {
        Alert.alert("Error", "Failed to mark booking as completed.");
        return;
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === selectedBooking.id ? { ...b, status: "completed" } : b))
      );
      setSelectedBooking((prev) => (prev ? { ...prev, status: "completed" } : null));
      Alert.alert("Success", `Booking marked as COMPLETED.`);
    } finally {
      setExecutingAction(false);
    }
  };

  // Cancellation Execution
  const handleExecuteCancel = async (reason?: string) => {
    if (!selectedBooking || !admin) return;
    setCancelLoading(true);
    try {
      const cancellationReason = reason || actionNotes || "Administrative cancellation";
      const command = new CancelBookingCommand(selectedBooking.id, cancellationReason);
      const cmdRes = await executeAdminCommand(command, admin as any);
      if (!cmdRes.success) {
        Alert.alert("Permission Error", cmdRes.error || "Failed to cancel booking.");
        return;
      }

      setBookings((prev) =>
        prev.map((b) => (b.id === selectedBooking.id ? { ...b, status: "cancelled" } : b))
      );
      setCancelModalVisible(false);
      setDetailsModalVisible(false);
      Alert.alert("Success", `Booking ${selectedBooking.booking_reference} cancelled successfully.`);
    } catch (err: any) {
      Alert.alert("Permission Error", err.message || "Failed to cancel booking.");
    } finally {
      setCancelLoading(false);
    }
  };

  // Reissue Ticket Voucher
  const handleReissueVoucher = async () => {
    if (!selectedBooking) return;
    Alert.alert(
      "Reissue Digital Voucher",
      "Generate and sign a new digital e-ticket voucher with updated QR verification payload?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reissue",
          onPress: async () => {
            setExecutingAction(true);
            const res = await bookingAdminService.reissueTicketVoucher(selectedBooking.id, admin?.id);
            setExecutingAction(false);
            if (res.success) {
              Alert.alert("Voucher Reissued", `New digital voucher code: ${res.voucherCode}`);
              const updated = await bookingAdminService.getBookingDetails(selectedBooking.id);
              if (updated) setSelectedBooking(updated);
            } else {
              Alert.alert("Error", "Failed to reissue ticket voucher.");
            }
          },
        },
      ]
    );
  };

  // Resend Email / SMS Notification
  const handleResend = async (channel: "email" | "sms") => {
    if (!selectedBooking) return;
    const recipient =
      channel === "email"
        ? selectedBooking.traveler_details?.email || "customer@shopnojatra.com"
        : selectedBooking.traveler_details?.phone || "+8801700000000";

    Alert.alert(
      `Resend ${channel.toUpperCase()}`,
      `Send trip confirmation and e-ticket link to ${recipient}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Resend",
          onPress: async () => {
            setExecutingAction(true);
            const success = await bookingAdminService.resendBookingNotification(
              selectedBooking.id,
              channel,
              recipient,
              selectedBooking.booking_reference
            );
            setExecutingAction(false);
            if (success) {
              Alert.alert("Success", `Confirmation dispatched to ${recipient}`);
            } else {
              Alert.alert("Error", "Failed to resend confirmation.");
            }
          },
        },
      ]
    );
  };

  // Save Internal Note
  const handleSaveNote = async () => {
    if (!selectedBooking || !actionNotes.trim()) return;
    setExecutingAction(true);
    const success = await bookingAdminService.addInternalNote(selectedBooking.id, actionNotes.trim(), admin?.id);
    setExecutingAction(false);
    if (success) {
      Alert.alert("Note Saved", "Operational note recorded to booking timeline.");
      setActionNotes("");
      const updated = await bookingAdminService.getBookingDetails(selectedBooking.id);
      if (updated) setSelectedBooking(updated);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "#10b981";
      case "completed":
        return "#0284c7";
      case "payment_pending":
      case "draft":
        return "#f59e0b";
      case "cancelled":
        return "#ef4444";
      case "refunded":
        return "#8b5cf6";
      default:
        return "#64748b";
    }
  };

  const getVerticalIcon = (productType: string) => {
    switch (productType?.toLowerCase()) {
      case "flight":
        return "airplane";
      case "hotel":
        return "bed-outline";
      case "train":
        return "train";
      case "bus":
        return "bus";
      case "launch":
        return "ferry";
      case "tour":
      case "package":
        return "compass-outline";
      default:
        return "ticket-confirmation-outline";
    }
  };

  // Filtering & Pagination
  const filteredBookings = bookings.filter((b) => {
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchRef = b.booking_reference?.toLowerCase().includes(q);
      const matchDest = b.destination_city?.toLowerCase().includes(q);
      const matchName =
        b.traveler_details?.first_name?.toLowerCase().includes(q) ||
        b.traveler_details?.last_name?.toLowerCase().includes(q);
      const matchEmail = b.traveler_details?.email?.toLowerCase().includes(q);
      if (!matchRef && !matchDest && !matchName && !matchEmail) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredBookings.length / PAGE_SIZE) || 1;
  const paginatedBookings = filteredBookings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <View style={styles.container}>
      {/* Header Search & Filter Bar */}
      <View style={styles.headerArea}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by Reference, Customer Name, Destination, Email..."
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

        {/* Vertical Selector Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.verticalScroll}>
          {(
            [
              { id: "all", label: "All Verticals" },
              { id: "flight", label: "Flights ✈️" },
              { id: "hotel", label: "Hotels 🏨" },
              { id: "train", label: "Trains 🚆" },
              { id: "bus", label: "Bus 🚌" },
              { id: "launch", label: "Launch 🚢" },
              { id: "tour", label: "Tour Packages 🌴" },
            ] as const
          ).map((v) => (
            <TouchableOpacity
              key={v.id}
              style={[
                styles.verticalPill,
                verticalFilter === v.id && styles.verticalPillActive,
              ]}
              onPress={() => setVerticalFilter(v.id)}
            >
              <Text
                style={[
                  styles.verticalPillText,
                  verticalFilter === v.id && styles.verticalPillTextActive,
                ]}
              >
                {v.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Status Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusScroll}>
          {["all", "confirmed", "payment_pending", "completed", "cancelled", "refunded"].map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.statusPillBtn,
                statusFilter === status && styles.statusPillBtnActive,
              ]}
              onPress={() => setStatusFilter(status)}
            >
              <Text
                style={[
                  styles.statusPillBtnText,
                  statusFilter === status && styles.statusPillBtnTextActive,
                ]}
              >
                {status.replace("_", " ").toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {error && <ErrorStateCard message={error} onRetry={loadBookings} />}

      {/* Bookings List */}
      {loading && !refreshing ? (
        <AdminTableRowSkeleton count={6} />
      ) : (
        <FlatList
          data={paginatedBookings}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.bookingCard}
              onPress={() => handleOpenDetails(item)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.refRow}>
                  <MaterialCommunityIcons
                    name={getVerticalIcon(item.product_type) as any}
                    size={20}
                    color="#0284c7"
                  />
                  <Text style={styles.refText}>{item.booking_reference}</Text>
                  <View style={styles.verticalTag}>
                    <Text style={styles.verticalTagText}>{item.product_type.toUpperCase()}</Text>
                  </View>
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

              <View style={styles.cardBody}>
                <View style={styles.infoCol}>
                  <Text style={styles.destinationText}>
                    {item.origin_city ? `${item.origin_city} ➔ ` : ""}
                    {item.destination_city}
                  </Text>
                  <Text style={styles.travelerName}>
                    {item.traveler_details
                      ? `${item.traveler_details.first_name || ""} ${item.traveler_details.last_name || ""}`.trim() || "Guest Traveler"
                      : "Direct Booking"}
                  </Text>
                  <Text style={styles.dateSubtext}>
                    {item.start_date || "Open Date"} • {item.number_of_guests} Guest(s)
                  </Text>
                </View>

                <View style={styles.priceCol}>
                  <Text style={styles.priceAmount}>
                    {item.currency} {Number(item.total_price || 0).toLocaleString()}
                  </Text>
                  <Text style={styles.flowStepText}>Flow: {item.flow_step}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No Bookings Found"
              description="No bookings match the selected vertical and status filters."
              type="booking"
            />
          }
          ListFooterComponent={
            filteredBookings.length > PAGE_SIZE ? (
              <AdminPagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={filteredBookings.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            ) : null
          }
        />
      )}

      {/* FULL BOOKING DETAILS MODAL / DRAWER */}
      <Modal
        visible={detailsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedBooking && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={styles.modalTitle}>{selectedBooking.booking_reference}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: `${getStatusColor(selectedBooking.status)}15` },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: getStatusColor(selectedBooking.status) },
                          ]}
                        >
                          {selectedBooking.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.modalSubtitle}>
                      {selectedBooking.product_type.toUpperCase()} • Created on{" "}
                      {new Date(selectedBooking.created_at).toLocaleString()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => setDetailsModalVisible(false)}
                  >
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Sub-tabs inside drawer */}
                <View style={styles.drawerTabs}>
                  {(
                    [
                      { id: "overview", label: "Overview" },
                      { id: "passengers", label: `Passengers (${selectedBooking.booking_passengers?.length || 0})` },
                      { id: "items", label: `Items (${selectedBooking.booking_items?.length || 0})` },
                      { id: "payments", label: "Payment & Tax" },
                      { id: "timeline", label: "Audit Timeline" },
                    ] as const
                  ).map((tab) => (
                    <TouchableOpacity
                      key={tab.id}
                      style={[
                        styles.drawerTabBtn,
                        activeDetailsTab === tab.id && styles.drawerTabBtnActive,
                      ]}
                      onPress={() => setActiveDetailsTab(tab.id)}
                    >
                      <Text
                        style={[
                          styles.drawerTabText,
                          activeDetailsTab === tab.id && styles.drawerTabTextActive,
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  {loadingDetails && (
                    <ActivityIndicator size="small" color="#0284c7" style={{ marginVertical: 10 }} />
                  )}

                  {/* TAB 1: OVERVIEW */}
                  {activeDetailsTab === "overview" && (
                    <View style={styles.detailSection}>
                      <Text style={styles.sectionHeading}>Traveler Profile & Contact</Text>
                      <View style={styles.metaCard}>
                        <Text style={styles.metaRowText}>
                          Name:{" "}
                          <Text style={styles.boldText}>
                            {selectedBooking.traveler_details
                              ? `${selectedBooking.traveler_details.first_name || ""} ${selectedBooking.traveler_details.last_name || ""}`
                              : "Direct Booking"}
                          </Text>
                        </Text>
                        <Text style={styles.metaRowText}>
                          Email:{" "}
                          <Text style={styles.boldText}>
                            {selectedBooking.traveler_details?.email || "N/A"}
                          </Text>
                        </Text>
                        <Text style={styles.metaRowText}>
                          Phone:{" "}
                          <Text style={styles.boldText}>
                            {selectedBooking.traveler_details?.phone || "N/A"}
                          </Text>
                        </Text>
                        <Text style={styles.metaRowText}>
                          Destination:{" "}
                          <Text style={styles.boldText}>
                            {selectedBooking.destination_city} ({selectedBooking.destination_country || "Bangladesh"})
                          </Text>
                        </Text>
                      </View>

                      {/* Digital Vouchers Section */}
                      <Text style={styles.sectionHeading}>Digital Travel Voucher & QR</Text>
                      {selectedBooking.vouchers && selectedBooking.vouchers.length > 0 ? (
                        selectedBooking.vouchers.map((v) => (
                          <View key={v.id} style={styles.voucherBox}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                              <Text style={styles.voucherCodeText}>{v.voucher_code}</Text>
                              <Text style={styles.voucherStatusText}>{v.status.toUpperCase()}</Text>
                            </View>
                            <Text style={styles.voucherQrText}>Payload: {v.qr_payload || "Standard QR"}</Text>
                            {v.valid_until && (
                              <Text style={styles.voucherExpiryText}>
                                Valid Until: {new Date(v.valid_until).toLocaleDateString()}
                              </Text>
                            )}
                          </View>
                        ))
                      ) : (
                        <View style={styles.voucherBox}>
                          <Text style={styles.voucherQrText}>No voucher issued yet.</Text>
                        </View>
                      )}

                      {/* Operational Note Composer */}
                      <Text style={styles.sectionHeading}>Internal Operational Note</Text>
                      <TextInput
                        style={styles.noteInput}
                        placeholder="Log internal note, passenger special requests, or VIP instructions..."
                        value={actionNotes}
                        onChangeText={setActionNotes}
                        placeholderTextColor="#94a3b8"
                        multiline
                        numberOfLines={3}
                      />
                      <TouchableOpacity
                        style={styles.saveNoteBtn}
                        onPress={handleSaveNote}
                        disabled={executingAction || !actionNotes.trim()}
                      >
                        <Feather name="file-text" size={14} color="#fff" />
                        <Text style={styles.saveNoteBtnText}>Record Internal Note</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* TAB 2: PASSENGERS MANIFEST */}
                  {activeDetailsTab === "passengers" && (
                    <View style={styles.detailSection}>
                      <Text style={styles.sectionHeading}>Passenger / Guest Manifest</Text>
                      {selectedBooking.booking_passengers && selectedBooking.booking_passengers.length > 0 ? (
                        selectedBooking.booking_passengers.map((p, idx) => (
                          <View key={p.id} style={styles.passengerCard}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <MaterialCommunityIcons name="account-tie-outline" size={18} color="#0284c7" />
                              <Text style={styles.passengerName}>
                                #{idx + 1}: {p.first_name} {p.last_name}
                              </Text>
                              {p.is_primary && (
                                <View style={styles.primaryBadge}>
                                  <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.passengerSub}>
                              Type: {p.passenger_type?.toUpperCase()} • Passport: {p.passport_number || "National ID / None"}
                            </Text>
                            {p.seat_preference && (
                              <Text style={styles.passengerSub}>Seat Preference: {p.seat_preference}</Text>
                            )}
                            {p.meal_preference && (
                              <Text style={styles.passengerSub}>Meal: {p.meal_preference}</Text>
                            )}
                          </View>
                        ))
                      ) : (
                        <Text style={styles.emptyDetailText}>No passenger records found.</Text>
                      )}
                    </View>
                  )}

                  {/* TAB 3: ITEMS */}
                  {activeDetailsTab === "items" && (
                    <View style={styles.detailSection}>
                      <Text style={styles.sectionHeading}>Itemized Products & Services</Text>
                      {selectedBooking.booking_items && selectedBooking.booking_items.length > 0 ? (
                        selectedBooking.booking_items.map((it) => (
                          <View key={it.id} style={styles.itemCard}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.itemTitle}>{it.product_name}</Text>
                              <Text style={styles.itemType}>Vertical: {it.product_type?.toUpperCase()}</Text>
                              {it.description && <Text style={styles.itemDesc}>{it.description}</Text>}
                            </View>
                            <View style={{ alignItems: "flex-end" }}>
                              <Text style={styles.itemTotal}>
                                {selectedBooking.currency} {Number(it.line_total || it.unit_price).toLocaleString()}
                              </Text>
                              <Text style={styles.itemQty}>Qty: {it.quantity}</Text>
                            </View>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.emptyDetailText}>No line items recorded.</Text>
                      )}
                    </View>
                  )}

                  {/* TAB 4: PAYMENTS & TAX */}
                  {activeDetailsTab === "payments" && (
                    <View style={styles.detailSection}>
                      <Text style={styles.sectionHeading}>Financial Breakdown & Ledger</Text>
                      <View style={styles.pricingGrid}>
                        <View style={styles.priceRow}>
                          <Text style={styles.priceLabel}>Subtotal</Text>
                          <Text style={styles.priceVal}>
                            {selectedBooking.currency} {Number(selectedBooking.total_price || 0).toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.priceRow}>
                          <Text style={styles.priceLabel}>Discount</Text>
                          <Text style={[styles.priceVal, { color: "#059669" }]}>
                            - {selectedBooking.currency} {Number(selectedBooking.discount_amount || 0).toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.priceRow}>
                          <Text style={styles.priceLabel}>Tax & VAT</Text>
                          <Text style={styles.priceVal}>
                            + {selectedBooking.currency} {Number(selectedBooking.tax_amount || 0).toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.priceRow}>
                          <Text style={styles.priceLabel}>Platform Service Fee</Text>
                          <Text style={styles.priceVal}>
                            + {selectedBooking.currency} {Number(selectedBooking.service_fee || 0).toLocaleString()}
                          </Text>
                        </View>
                        <View style={[styles.priceRow, styles.totalRow]}>
                          <Text style={styles.totalLabel}>Total Final Price</Text>
                          <Text style={styles.totalVal}>
                            {selectedBooking.currency} {Number(selectedBooking.final_price || selectedBooking.total_price).toLocaleString()}
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.sectionHeading, { marginTop: 18 }]}>Payment Transactions</Text>
                      {selectedBooking.booking_payments && selectedBooking.booking_payments.length > 0 ? (
                        selectedBooking.booking_payments.map((pmt) => (
                          <View key={pmt.id} style={styles.pmtBox}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.pmtGateway}>
                                Method: {pmt.payment_method?.toUpperCase()} • Gateway: {pmt.payment_gateway || "Gateway"}
                              </Text>
                              <Text style={styles.pmtTxn}>Txn ID: {pmt.transaction_id || "N/A"}</Text>
                            </View>
                            <View style={{ alignItems: "flex-end" }}>
                              <Text style={styles.pmtAmount}>
                                {pmt.currency} {Number(pmt.amount).toLocaleString()}
                              </Text>
                              <Text style={[styles.pmtStatus, { color: pmt.payment_status === "completed" ? "#059669" : "#f59e0b" }]}>
                                {pmt.payment_status?.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.emptyDetailText}>No payment transaction records.</Text>
                      )}
                    </View>
                  )}

                  {/* TAB 5: AUDIT TIMELINE */}
                  {activeDetailsTab === "timeline" && (
                    <View style={styles.detailSection}>
                      <Text style={styles.sectionHeading}>Trip Lifecycle & Event Stream</Text>
                      {selectedBooking.timeline_events && selectedBooking.timeline_events.length > 0 ? (
                        selectedBooking.timeline_events.map((ev, idx) => (
                          <View key={ev.id || idx} style={styles.timelineRow}>
                            <View style={styles.timelineBullet} />
                            <View style={styles.timelineContent}>
                              <Text style={styles.timelineTitle}>{ev.title || ev.event_type}</Text>
                              {ev.description && <Text style={styles.timelineDesc}>{ev.description}</Text>}
                              <Text style={styles.timelineDate}>
                                {new Date(ev.timestamp || ev.created_at || Date.now()).toLocaleString()}
                              </Text>
                            </View>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.emptyDetailText}>No timeline history events recorded yet.</Text>
                      )}
                    </View>
                  )}
                </ScrollView>

                {/* MODAL BOTTOM ACTION BUTTONS */}
                <View style={styles.modalActionToolbar}>
                  {selectedBooking.status !== "confirmed" && selectedBooking.status !== "completed" && (
                    <TouchableOpacity
                      style={styles.actionBtnConfirm}
                      onPress={handleExecuteConfirm}
                      disabled={executingAction || !hasPermission("bookings.modify")}
                    >
                      <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Confirm</Text>
                    </TouchableOpacity>
                  )}

                  {selectedBooking.status === "confirmed" && (
                    <TouchableOpacity
                      style={[styles.actionBtnConfirm, { backgroundColor: "#0284c7" }]}
                      onPress={handleExecuteComplete}
                      disabled={executingAction || !hasPermission("bookings.modify")}
                    >
                      <Ionicons name="flag-outline" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Complete</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.actionBtnSecondary}
                    onPress={handleReissueVoucher}
                    disabled={executingAction}
                  >
                    <MaterialCommunityIcons name="qrcode-scan" size={16} color="#0284c7" />
                    <Text style={styles.actionBtnSecondaryText}>Reissue Voucher</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnSecondary}
                    onPress={() => handleResend("email")}
                    disabled={executingAction}
                  >
                    <Feather name="mail" size={16} color="#0284c7" />
                    <Text style={styles.actionBtnSecondaryText}>Resend Email</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnSecondary}
                    onPress={() => handleResend("sms")}
                    disabled={executingAction}
                  >
                    <Feather name="message-square" size={16} color="#0284c7" />
                    <Text style={styles.actionBtnSecondaryText}>Resend SMS</Text>
                  </TouchableOpacity>

                  {selectedBooking.status !== "cancelled" && (
                    <TouchableOpacity
                      style={styles.actionBtnCancel}
                      onPress={() => setCancelModalVisible(true)}
                      disabled={executingAction || !hasPermission("bookings.cancel")}
                    >
                      <Ionicons name="trash-outline" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Cancellation Modal */}
      <DestructiveConfirmModal
        visible={cancelModalVisible}
        title="Confirm Booking Cancellation"
        description="Are you sure you want to cancel this booking? This action is permanent and will trigger an automated cancellation notice to the customer and suppliers."
        targetName={`Ref: ${selectedBooking?.booking_reference || "N/A"}`}
        targetId={selectedBooking?.id}
        confirmLabel="Cancel Booking"
        onConfirm={handleExecuteCancel}
        onCancel={() => setCancelModalVisible(false)}
        isLoading={cancelLoading}
        severity="danger"
        requireTypedConfirmation={true}
        confirmationWord="CANCEL"
        requireReason={true}
        reasonPlaceholder="Enter cancellation reason for audit record..."
        auditLogRef={`AUD-BKG-CAN-${selectedBooking?.id?.slice(-6).toUpperCase() || "LOG"}`}
      />
    </View>
  );
};

export const BookingManagementScreen = withErrorBoundary(
  BookingManagementScreenComponent,
  { screenName: "BookingOperationsCenter" }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  headerArea: {
    padding: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0f172a",
  },
  verticalScroll: {
    flexDirection: "row",
    marginBottom: 8,
  },
  verticalPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  verticalPillActive: {
    backgroundColor: "#0284c7",
    borderColor: "#0284c7",
  },
  verticalPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  verticalPillTextActive: {
    color: "#ffffff",
  },
  statusScroll: {
    flexDirection: "row",
  },
  statusPillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#f8fafc",
    marginRight: 6,
  },
  statusPillBtnActive: {
    backgroundColor: "#334155",
  },
  statusPillBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  statusPillBtnTextActive: {
    color: "#ffffff",
  },
  bookingCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  refRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  verticalTag: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verticalTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0284c7",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  cardBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  infoCol: {
    flex: 1,
  },
  destinationText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 2,
  },
  travelerName: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 2,
  },
  dateSubtext: {
    fontSize: 11,
    color: "#94a3b8",
  },
  priceCol: {
    alignItems: "flex-end",
  },
  priceAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  flowStepText: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
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
    maxWidth: 680,
    maxHeight: "90%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
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
  closeBtn: {
    padding: 6,
  },
  drawerTabs: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
    gap: 4,
    flexWrap: "wrap",
  },
  drawerTabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 2,
    borderColor: "transparent",
  },
  drawerTabBtnActive: {
    borderColor: "#0284c7",
  },
  drawerTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  drawerTabTextActive: {
    color: "#0284c7",
    fontWeight: "700",
  },
  modalScroll: {
    padding: 16,
  },
  detailSection: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 6,
  },
  metaCard: {
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 6,
  },
  metaRowText: {
    fontSize: 12,
    color: "#475569",
  },
  boldText: {
    fontWeight: "600",
    color: "#0f172a",
  },
  voucherBox: {
    backgroundColor: "#f0fdf4",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    marginBottom: 8,
  },
  voucherCodeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#166534",
  },
  voucherStatusText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#15803d",
  },
  voucherQrText: {
    fontSize: 11,
    color: "#166534",
    marginTop: 4,
    fontFamily: "monospace",
  },
  voucherExpiryText: {
    fontSize: 10,
    color: "#15803d",
    marginTop: 2,
  },
  noteInput: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: "#0f172a",
    minHeight: 60,
    textAlignVertical: "top",
    marginBottom: 8,
  },
  saveNoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#0284c7",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    gap: 6,
  },
  saveNoteBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  passengerCard: {
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
  },
  passengerName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
  },
  primaryBadge: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  primaryBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#0284c7",
  },
  passengerSub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  itemCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
  },
  itemType: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
  },
  itemDesc: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
  },
  itemTotal: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  itemQty: {
    fontSize: 10,
    color: "#64748b",
  },
  pricingGrid: {
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 6,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  priceLabel: {
    fontSize: 12,
    color: "#64748b",
  },
  priceVal: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0f172a",
  },
  totalRow: {
    borderTopWidth: 1,
    borderColor: "#e2e8f0",
    paddingTop: 6,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  totalVal: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0284c7",
  },
  pmtBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 6,
  },
  pmtGateway: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0f172a",
  },
  pmtTxn: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  pmtAmount: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  pmtStatus: {
    fontSize: 10,
    fontWeight: "700",
  },
  timelineRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  timelineBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0284c7",
    marginTop: 5,
    marginRight: 10,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  timelineDesc: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  timelineDate: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 2,
  },
  emptyDetailText: {
    fontSize: 12,
    color: "#94a3b8",
    fontStyle: "italic",
    paddingVertical: 10,
  },
  modalActionToolbar: {
    flexDirection: "row",
    padding: 14,
    borderTopWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    gap: 8,
    flexWrap: "wrap",
  },
  actionBtnConfirm: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  actionBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  actionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0284c7",
  },
  actionBtnCancel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ef4444",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
  },
});
