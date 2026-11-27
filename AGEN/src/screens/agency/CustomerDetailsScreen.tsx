/**
 * Customer Details Screen — real data via agencyCustomersService, light system.
 * No fabricated profile or booking history.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { agencyCustomersService, type AgencyBooking } from "../../services/agencyService";
import { useAuth } from "../../hooks/useAuth";
import {
  Icon,
  Card,
  Badge,
  StateView,
  Skeleton,
  KpiCard,
} from "../../components/ui/DashboardUI";
import { palette, spacing, typography } from "../../theme/tokens";
import type { Tone } from "../../theme/tokens";

type CustomersStackParamList = {
  CustomersList: undefined;
  CustomerDetails: { customerId: string };
};

type Props = NativeStackScreenProps<CustomersStackParamList, "CustomerDetails">;

interface CustomerDetail {
  id: string;
  name: string;
  email: string;
  phone: string;
  vip: boolean;
  bookingsCount: number;
  totalSpent: number;
  joinDate: string;
  lastBooking: string;
  bookings: AgencyBooking[];
}

const formatBDT = (value: number): string =>
  `৳ ${Math.round(value || 0).toLocaleString("en-IN")}`;

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

export default function CustomerDetailsScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { customerId } = route.params;
  const agencyId = user?.agency?.id || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);

  const loadCustomerDetails = useCallback(async () => {
    if (!agencyId) {
      setError("No agency is linked to this account.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data: any = await agencyCustomersService.getCustomerDetail(agencyId, customerId);
      if (!data) {
        setError("Customer not found.");
        setCustomer(null);
        return;
      }
      const bookings: AgencyBooking[] = Array.isArray(data.bookings) ? data.bookings : [];
      const totalSpent = Number(data.totalSpent) || 0;
      const name =
        [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
        data.name ||
        data.email ||
        `Customer ${String(customerId).slice(0, 6)}`;
      setCustomer({
        id: customerId,
        name,
        email: data.email || "",
        phone: data.phone || "",
        vip: totalSpent >= 10000 || bookings.length >= 5,
        bookingsCount: bookings.length,
        totalSpent,
        joinDate: data.created_at || "",
        lastBooking: bookings[0]?.created_at || "",
        bookings,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer.");
    } finally {
      setLoading(false);
    }
  }, [agencyId, customerId]);

  useEffect(() => {
    loadCustomerDetails();
  }, [loadCustomerDetails]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="chevron-left" size={24} color={palette.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Customer Details</Text>
          <Text style={styles.headerSubtitle}>Profile & booking history</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.body}>
          <Skeleton style={{ height: 96, marginBottom: spacing.md }} />
          <Skeleton style={{ height: 110, marginBottom: spacing.md }} />
          <Skeleton style={{ height: 160 }} />
        </View>
      ) : error || !customer ? (
        <StateView
          variant="error"
          title="Couldn't load customer"
          message={error ?? "Customer not found."}
          actionLabel="Retry"
          onActionPress={loadCustomerDetails}
        />
      ) : (
        <ScrollView
          style={styles.body}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Profile */}
          <Card style={{ marginBottom: spacing.md }}>
            <View style={styles.profileHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {customer.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.customerName}>{customer.name}</Text>
                  {customer.vip ? <Badge label="VIP" tone="warning" /> : null}
                </View>
                <Text style={styles.statusText}>Traveler profile</Text>
              </View>
            </View>
          </Card>

          {/* Metrics */}
          <View style={styles.metricsRow}>
            <KpiCard
              label="Total Bookings"
              value={String(customer.bookingsCount)}
              icon="briefcase"
              tone="primary"
            />
            <KpiCard
              label="Total Spent"
              value={formatBDT(customer.totalSpent)}
              icon="dollar-sign"
              tone="success"
            />
          </View>

          {/* Contact */}
          <Card style={{ marginBottom: spacing.md }}>
            <Text style={styles.cardTitle}>Contact Information</Text>
            <DetailRow icon="mail" label="Email" value={customer.email || "—"} />
            <Divider />
            <DetailRow icon="phone" label="Phone" value={customer.phone || "—"} />
          </Card>

          {/* Account */}
          <Card style={{ marginBottom: spacing.md }}>
            <Text style={styles.cardTitle}>Account Information</Text>
            <DetailRow
              icon="calendar"
              label="Member Since"
              value={customer.joinDate ? new Date(customer.joinDate).toLocaleDateString() : "—"}
            />
            <Divider />
            <DetailRow
              icon="clock"
              label="Last Booking"
              value={customer.lastBooking ? new Date(customer.lastBooking).toLocaleDateString() : "—"}
            />
          </Card>

          {/* Booking history */}
          <Card style={{ marginBottom: spacing.md }}>
            <Text style={styles.cardTitle}>Booking History</Text>
            {customer.bookings.length === 0 ? (
              <StateView
                variant="empty"
                title="No bookings"
                message="This customer has no bookings yet."
                icon="briefcase"
              />
            ) : (
              customer.bookings.map((b, index) => (
                <View key={b.id}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.bookingItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bookingTitle}>
                        {b.product_type || "Service"} • {b.destination_city || "—"}
                      </Text>
                      <Text style={styles.bookingDate}>
                        {b.start_date ? new Date(b.start_date).toLocaleDateString() : "Date pending"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={styles.amount}>{formatBDT(Number(b.final_price || 0))}</Text>
                      <Badge label={b.status.toUpperCase()} tone={statusTone(b.status)} />
                    </View>
                  </View>
                </View>
              ))
            )}
          </Card>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const DetailRow: React.FC<{
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <View style={styles.infoRow}>
    <View style={styles.infoLabelRow}>
      <Icon name={icon} size={16} color={palette.textMuted} />
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
    <Text style={styles.infoValue} numberOfLines={1}>
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
  profileHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...typography.h2, color: palette.primary, fontWeight: "800" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  customerName: { ...typography.h3, color: palette.text, flexShrink: 1 },
  statusText: { ...typography.body, color: palette.textMuted, marginTop: 2 },
  metricsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  cardTitle: { ...typography.h3, color: palette.text, marginBottom: spacing.md },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  infoLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  infoLabel: { ...typography.body, color: palette.textSecondary },
  infoValue: { ...typography.body, color: palette.text, fontWeight: "600", maxWidth: "55%", textAlign: "right" },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: spacing.sm },
  bookingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  bookingTitle: { ...typography.body, color: palette.text, fontWeight: "600" },
  bookingDate: { ...typography.caption, color: palette.textMuted, marginTop: 2 },
  amount: { ...typography.body, color: palette.success, fontWeight: "700" },
});