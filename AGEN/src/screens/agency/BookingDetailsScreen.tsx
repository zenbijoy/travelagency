/**
 * Booking Details Screen — real data, light SaaS design system.
 * Loads a single booking via the agency service layer and persists status /
 * notes changes. No fabricated demo data.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useAuth } from "../../hooks/useAuth";
import {
  agencyBookingsService,
  type AgencyBooking,
} from "../../services/agencyService";
import {
  Icon,
  Button,
  Badge,
  Card,
  StateView,
  Skeleton,
} from "../../components/ui/DashboardUI";
import { palette, spacing, radius, typography } from "../../theme/tokens";
import type { Tone } from "../../theme/tokens";
import PdfExportModal from "./PdfExportModal";
import { useScreenCollaboration } from "../../hooks/useScreenCollaboration";
import { APP_EVENTS } from "../../services/events/appEventBus";

type BookingsStackParamList = {
  BookingsList: undefined;
  BookingDetails: { bookingId: string };
};

type Props = NativeStackScreenProps<BookingsStackParamList, "BookingDetails">;

type Status = "confirmed" | "pending" | "completed" | "cancelled";

interface BookingDetail {
  id: string;
  reference: string;
  service: string;
  customer: string;
  email: string;
  phone: string;
  date: string;
  location: string;
  status: Status;
  guests: number;
  amount: number;
  notes: string;
}

const formatBDT = (value: number): string =>
  `৳ ${Math.round(value || 0).toLocaleString("en-IN")}`;

const normalizeStatus = (status: string): Status => {
  if (status === "confirmed" || status === "completed" || status === "cancelled") {
    return status;
  }
  return "pending";
};

const statusTone = (status: string): Tone => {
  switch (status.toLowerCase()) {
    case "confirmed":
      return "success";
    case "completed":
      return "cyan";
    case "pending":
      return "warning";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
};

const mapBooking = (b: AgencyBooking): BookingDetail => {
  const traveler = b.traveler_details;
  return {
    id: b.id,
    reference: b.booking_reference || `#${b.id.slice(0, 8).toUpperCase()}`,
    service: b.product_type || "Service",
    customer: traveler
      ? `${traveler.first_name} ${traveler.last_name}`.trim()
      : `Customer ${b.user_id?.slice(0, 6) ?? ""}`,
    email: traveler?.email || "",
    phone: "",
    date: b.start_date || "TBD",
    location: b.destination_city || "Destination pending",
    status: normalizeStatus(b.status),
    guests: b.number_of_guests ?? 1,
    amount: Number(b.final_price || 0),
    notes: b.notes || "",
  };
};

export default function BookingDetailsScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { bookingId } = route.params;
  const agencyId = user?.agency?.id || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [pdfModalVisible, setPdfModalVisible] = useState(false);
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage((cur) => (cur === msg ? null : cur)), 3000);
  }, []);

  const loadBookingDetails = useCallback(async () => {
    if (!agencyId) {
      setError("No agency is linked to this account.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const details = await agencyBookingsService.getBookingDetail(agencyId, bookingId);
      if (!details) {
        setError("Booking not found.");
        setBooking(null);
      } else {
        setBooking(mapBooking(details));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load booking.");
    } finally {
      setLoading(false);
    }
  }, [agencyId, bookingId]);

  useEffect(() => {
    loadBookingDetails();
  }, [loadBookingDetails]);

  useScreenCollaboration(
    APP_EVENTS.BOOKING_STATUS_CHANGED,
    React.useCallback(
      (payload) => {
        if (!payload?.bookingId || payload.bookingId !== bookingId) return;
        const mapped = normalizeStatus(payload.currentStatus);
        setBooking((prev) => (prev ? { ...prev, status: mapped } : prev));
        showToast(`Status updated to ${mapped.toUpperCase()}`);
      },
      [bookingId, showToast],
    ),
    { replayLast: true, screenId: "AgencyBookingDetailsScreen" },
  );

  const handleStatusChange = async (newStatus: Status) => {
    if (!agencyId || !booking) return;
    setSaving(true);
    try {
      await agencyBookingsService.updateBookingStatus(agencyId, bookingId, newStatus);
      setBooking({ ...booking, status: newStatus });
      showToast(`Booking is now ${newStatus.toUpperCase()}`);
    } catch (err) {
      Alert.alert(
        "Update Failed",
        err instanceof Error ? err.message : "Could not update status.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!agencyId || !booking) return;
    setSaving(true);
    try {
      await agencyBookingsService.updateBookingStatus(
        agencyId,
        bookingId,
        booking.status,
        editNotes,
      );
      setBooking({ ...booking, notes: editNotes });
      setEditModalVisible(false);
      showToast("Notes saved");
    } catch (err) {
      Alert.alert(
        "Save Failed",
        err instanceof Error ? err.message : "Could not save notes.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!agencyId || !booking) return;
    Alert.alert("Cancel Booking", "Are you sure you want to cancel this booking?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel Booking",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await agencyBookingsService.cancelBooking(
              agencyId,
              bookingId,
              "Cancelled by agency",
            );
            setBooking({ ...booking, status: "cancelled" });
            showToast("Booking cancelled");
          } catch (err) {
            Alert.alert(
              "Failed",
              err instanceof Error ? err.message : "Could not cancel booking.",
            );
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {toastMessage ? (
        <View style={styles.toast}>
          <Icon name="check-circle" size={16} color={palette.primary} />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      ) : null}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="chevron-left" size={24} color={palette.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Booking Details</Text>
          <Text style={styles.headerSubtitle}>{booking?.reference ?? bookingId}</Text>
        </View>
        {booking ? (
          <TouchableOpacity
            onPress={() => {
              setEditNotes(booking.notes);
              setEditModalVisible(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="edit-2" size={20} color={palette.primary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.body}>
          <Skeleton style={{ height: 120, marginBottom: spacing.md }} />
          <Skeleton style={{ height: 160, marginBottom: spacing.md }} />
          <Skeleton style={{ height: 120 }} />
        </View>
      ) : error || !booking ? (
        <StateView
          variant="error"
          title="Couldn't load booking"
          message={error ?? "Booking not found."}
          actionLabel="Retry"
          onActionPress={loadBookingDetails}
        />
      ) : (
        <ScrollView
          style={styles.body}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Status */}
          <Card style={{ marginBottom: spacing.md }}>
            <View style={styles.statusHeader}>
              <Text style={styles.statusLabel}>Current Status</Text>
              <Badge label={booking.status.toUpperCase()} tone={statusTone(booking.status)} />
            </View>
            <View style={styles.statusActions}>
              {(["confirmed", "pending", "completed", "cancelled"] as Status[]).map((s) => (
                <Button
                  key={s}
                  label={s.charAt(0).toUpperCase() + s.slice(1)}
                  variant={booking.status === s ? "primary" : "outline"}
                  size="sm"
                  disabled={saving}
                  onPress={() => handleStatusChange(s)}
                />
              ))}
            </View>
          </Card>

          {/* Service & itinerary */}
          <Card style={{ marginBottom: spacing.md }}>
            <Text style={styles.cardTitle}>Service & Itinerary</Text>
            <DetailRow icon="tag" label="Service" value={booking.service} />
            <Divider />
            <DetailRow icon="map-pin" label="Destination" value={booking.location} />
            <Divider />
            <DetailRow icon="calendar" label="Travel Date" value={booking.date} />
          </Card>

          {/* Customer */}
          <Card style={{ marginBottom: spacing.md }}>
            <Text style={styles.cardTitle}>Customer</Text>
            <DetailRow icon="user" label="Name" value={booking.customer} />
            {booking.email ? (
              <>
                <Divider />
                <DetailRow icon="mail" label="Email" value={booking.email} />
              </>
            ) : null}
            <Divider />
            <DetailRow icon="users" label="Guests" value={String(booking.guests)} />
          </Card>

          {/* Financial */}
          <Card style={{ marginBottom: spacing.md }}>
            <Text style={styles.cardTitle}>Financial Summary</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Total Amount</Text>
              <Text style={styles.detailValue}>{formatBDT(booking.amount)}</Text>
            </View>
            <Divider />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Per Person</Text>
              <Text style={styles.detailValue}>
                {formatBDT(booking.amount / (booking.guests || 1))}
              </Text>
            </View>
          </Card>

          {/* Notes */}
          {booking.notes ? (
            <Card style={{ marginBottom: spacing.md }}>
              <Text style={styles.cardTitle}>Internal Notes</Text>
              <Text style={styles.notes}>{booking.notes}</Text>
            </Card>
          ) : null}

          {/* Actions */}
          <View style={styles.actionButtons}>
            <Button
              label="Export Branded PDF"
              variant="primary"
              icon="download"
              onPress={() => setPdfModalVisible(true)}
            />
            <Button
              label="Cancel Booking"
              variant="danger"
              icon="slash"
              disabled={saving || booking.status === "cancelled"}
              onPress={handleDelete}
            />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Edit Notes Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
              <Icon name="x" size={22} color={palette.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Notes</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView style={styles.modalContent}>
            <Text style={styles.inputLabel}>Internal Notes</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Add internal notes about this booking"
              placeholderTextColor={palette.textMuted}
              multiline
              numberOfLines={5}
            />
            <View style={styles.modalActions}>
              <Button
                label="Save Changes"
                variant="primary"
                loading={saving}
                onPress={handleSaveNotes}
              />
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setEditModalVisible(false)}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {booking ? (
        <PdfExportModal
          visible={pdfModalVisible}
          onClose={() => setPdfModalVisible(false)}
          bookingData={{
            bookingReference: booking.reference,
            tripTitle: booking.service,
            destination: booking.location,
            traveler: {
              leadPassengerName: booking.customer,
              contactEmail: booking.email,
              contactPhone: booking.phone,
              numberOfGuests: booking.guests,
              specialRequests: "",
            },
            paymentReceipt: {
              receiptNumber: `RCPT-${booking.id.slice(0, 8)}`,
              invoiceDate: booking.date,
              paymentMethod: "Online Gateway",
              transactionId: `TXN-${booking.id.slice(0, 8)}`,
              paymentStatus: booking.status === "confirmed" ? "Paid in Full" : "Due",
              currency: "BDT",
              currencySymbol: "৳",
              items: [
                {
                  description: `${booking.service} (${booking.guests} guests)`,
                  quantity: booking.guests,
                  unitPrice: booking.amount / (booking.guests || 1),
                  total: booking.amount,
                },
              ],
              subtotal: booking.amount,
              taxesAndFees: 0,
              totalAmount: booking.amount,
              amountPaid: booking.status === "confirmed" ? booking.amount : 0,
              balanceDue: booking.status === "confirmed" ? 0 : booking.amount,
              notes: booking.notes,
            },
          }}
        />
      ) : null}
    </View>
  );
}

const DetailRow: React.FC<{
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <View style={styles.detailRow}>
    <View style={styles.detailLabelRow}>
      <Icon name={icon} size={16} color={palette.textMuted} />
      <Text style={styles.detailLabel}>{label}</Text>
    </View>
    <Text style={styles.detailValue} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const Divider: React.FC = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerTitle: { ...typography.h3, color: palette.text },
  headerSubtitle: { ...typography.caption, color: palette.textMuted, marginTop: 2 },
  body: { flex: 1 },
  scrollContent: { padding: spacing.lg },
  statusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  statusLabel: { ...typography.body, color: palette.text, fontWeight: "700" },
  statusActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cardTitle: { ...typography.h3, color: palette.text, marginBottom: spacing.md },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  detailLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  detailLabel: { ...typography.body, color: palette.textSecondary },
  detailValue: { ...typography.body, color: palette.text, fontWeight: "700", maxWidth: "55%", textAlign: "right" },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: spacing.sm },
  notes: { ...typography.body, color: palette.textSecondary, lineHeight: 22 },
  actionButtons: { gap: spacing.md, marginTop: spacing.md },
  toast: {
    position: "absolute",
    top: 50,
    alignSelf: "center",
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: palette.border,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: { ...typography.label, color: palette.text },
  modalContainer: { flex: 1, backgroundColor: palette.background },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  modalTitle: { ...typography.h3, color: palette.text },
  modalContent: { flex: 1, padding: spacing.lg },
  inputLabel: { ...typography.label, color: palette.textSecondary, marginBottom: spacing.sm },
  input: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: palette.text,
    fontSize: typography.body.fontSize,
  },
  multilineInput: { textAlignVertical: "top" },
  modalActions: { gap: spacing.md, marginTop: spacing.xl, marginBottom: spacing["2xl"] },
});