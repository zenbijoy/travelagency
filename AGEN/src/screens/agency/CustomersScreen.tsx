/**
 * Customers Screen — B2B Agency CRM
 * Real customer data derived from agency bookings. Light SaaS design system.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../hooks/useAuth";
import { agencyCustomersService } from "../../services/agencyService";
import { CustomersStackParamList } from "../../App";
import {
  Icon,
  Card,
  Badge,
  SectionHeader,
  StateView,
  Skeleton,
} from "../../components/ui/DashboardUI";
import { palette, spacing, radius, typography } from "../../theme/tokens";

export interface CustomerItem {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  bookings: number;
  spent: number;
  vip: boolean;
  stage?: "lead" | "quote_sent" | "confirmed" | "completed";
  lastBooking?: string;
}

type PipelineFilter = "all" | "vip" | "frequent" | "leads";

type Props = NativeStackScreenProps<CustomersStackParamList, "CustomersList">;

const FILTERS: { key: PipelineFilter; label: string; icon: React.ComponentProps<typeof Icon>["name"] }[] = [
  { key: "all", label: "All Travelers", icon: "users" },
  { key: "vip", label: "VIP Travelers", icon: "award" },
  { key: "frequent", label: "Frequent (3+ trips)", icon: "send" },
  { key: "leads", label: "New Leads", icon: "compass" },
];

const formatBDT = (value: number): string =>
  `৳ ${Math.round(value || 0).toLocaleString("en-IN")}`;

export default function CustomersScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<PipelineFilter>("all");
  const [customers, setCustomers] = useState<CustomerItem[]>([]);

  const agencyId = user?.agency?.id || "";

  const loadCustomers = useCallback(async () => {
    if (!agencyId) {
      setCustomers([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      setError(null);
      const data = await agencyCustomersService.getCustomers(agencyId);
      const mapped: CustomerItem[] = (data || []).map((c: any) => ({
        id: c.id,
        name: c.name || `Customer #${String(c.id).slice(0, 5)}`,
        email: c.email || undefined,
        bookings: Number(c.bookings) || 1,
        spent: Number(c.spent) || 0,
        vip: Boolean(c.vip),
        stage: c.bookings >= 3 ? "confirmed" : c.bookings === 2 ? "quote_sent" : "lead",
        lastBooking: c.lastBooking,
      }));
      setCustomers(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agencyId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const onRefresh = () => {
    setRefreshing(true);
    loadCustomers();
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (activeFilter === "vip" && !c.vip) return false;
      if (activeFilter === "frequent" && c.bookings < 3) return false;
      if (activeFilter === "leads" && c.stage !== "lead") return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = c.name.toLowerCase().includes(q);
        const emailMatch = c.email?.toLowerCase().includes(q) ?? false;
        const phoneMatch = c.phone?.includes(q) ?? false;
        return nameMatch || emailMatch || phoneMatch;
      }
      return true;
    });
  }, [customers, activeFilter, searchQuery]);

  const metrics = useMemo(() => {
    const total = customers.length;
    const vips = customers.filter((c) => c.vip).length;
    const totalSpent = customers.reduce((sum, c) => sum + c.spent, 0);
    const avgSpent = total > 0 ? Math.round(totalSpent / total) : 0;
    return { total, vips, totalSpent, avgSpent };
  }, [customers]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="chevron-left" size={24} color={palette.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Customer CRM</Text>
          <Text style={styles.headerSubtitle}>Traveler & lead pipeline</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="refresh-cw" size={20} color={palette.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.body}>
          <Skeleton style={{ height: 48, marginBottom: spacing.md }} />
          <Skeleton style={{ height: 96, marginBottom: spacing.md }} />
          <Skeleton style={{ height: 72, marginBottom: spacing.md }} />
          <Skeleton style={{ height: 72 }} />
        </View>
      ) : error ? (
        <StateView
          variant="error"
          title="Couldn't load customers"
          message={error}
          actionLabel="Retry"
          onActionPress={loadCustomers}
        />
      ) : (
        <ScrollView
          style={styles.body}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.primary}
              colors={[palette.primary]}
            />
          }
        >
          {/* Search */}
          <View style={styles.search}>
            <Icon name="search" size={16} color={palette.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, email or phone"
              placeholderTextColor={palette.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                <Icon name="x" size={14} color={palette.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Filter pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map((f) => {
              const active = activeFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setActiveFilter(f.key)}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                >
                  <Icon
                    name={f.icon}
                    size={14}
                    color={active ? palette.textInverse : palette.textSecondary}
                  />
                  <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Overview metrics */}
          <View style={styles.overviewRow}>
            <Card style={styles.overviewCard}>
              <Icon name="users" size={18} color={palette.primary} />
              <Text style={styles.overviewValue}>{metrics.total}</Text>
              <Text style={styles.overviewLabel}>Total Travelers</Text>
            </Card>
            <Card style={styles.overviewCard}>
              <Icon name="award" size={18} color={palette.warning} />
              <Text style={styles.overviewValue}>{metrics.vips}</Text>
              <Text style={styles.overviewLabel}>VIP High-Value</Text>
            </Card>
            <Card style={styles.overviewCard}>
              <Icon name="dollar-sign" size={18} color={palette.success} />
              <Text style={styles.overviewValue} numberOfLines={1}>
                {formatBDT(metrics.totalSpent)}
              </Text>
              <Text style={styles.overviewLabel}>Total GMV</Text>
            </Card>
          </View>

          {/* Directory */}
          <View style={styles.section}>
            <SectionHeader
              title={
                activeFilter === "all"
                  ? "Active Traveler Directory"
                  : activeFilter === "vip"
                  ? "VIP Customer Directory"
                  : activeFilter === "frequent"
                  ? "Frequent Travelers"
                  : "New Travel Leads"
              }
              subtitle={`${filteredCustomers.length} results`}
            />

            {filteredCustomers.length === 0 ? (
              <Card>
                <StateView
                  variant="empty"
                  title="No travelers found"
                  message="Try adjusting your search or filters."
                  icon="users"
                  actionLabel="Reset filters"
                  onActionPress={() => {
                    setActiveFilter("all");
                    setSearchQuery("");
                  }}
                />
              </Card>
            ) : (
              filteredCustomers.map((customer) => (
                <Card key={customer.id} style={{ marginBottom: spacing.md }}>
                  <TouchableOpacity
                    style={styles.customerItem}
                    onPress={() =>
                      navigation.navigate("CustomerDetails", { customerId: customer.id })
                    }
                    activeOpacity={0.8}
                  >
                    <View style={styles.customerAvatar}>
                      <Text style={styles.avatarText}>
                        {customer.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.customerInfo}>
                      <View style={styles.customerHeader}>
                        <Text style={styles.customerName} numberOfLines={1}>
                          {customer.name}
                        </Text>
                        {customer.vip ? <Badge label="VIP" tone="warning" /> : null}
                      </View>
                      {customer.email ? (
                        <Text style={styles.customerEmail} numberOfLines={1}>
                          {customer.email}
                        </Text>
                      ) : null}
                      <Text style={styles.customerStats}>
                        {customer.bookings} bookings • {formatBDT(customer.spent)}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={palette.textMuted} />
                  </TouchableOpacity>
                </Card>
              ))
            )}
          </View>

          {/* Segment distribution */}
          <View style={styles.section}>
            <SectionHeader title="Segment Distribution" />
            <View style={styles.segmentsGrid}>
              <Card style={styles.segmentBox}>
                <Icon name="award" size={22} color={palette.warning} />
                <Text style={styles.segmentValue}>{metrics.vips}</Text>
                <Text style={styles.segmentLabel}>VIP Tier</Text>
              </Card>
              <Card style={styles.segmentBox}>
                <Icon name="star" size={22} color={palette.info} />
                <Text style={styles.segmentValue}>
                  {Math.max(0, metrics.total - metrics.vips)}
                </Text>
                <Text style={styles.segmentLabel}>Regular</Text>
              </Card>
              <Card style={styles.segmentBox}>
                <Icon name="activity" size={22} color={palette.textMuted} />
                <Text style={styles.segmentValue}>{metrics.total}</Text>
                <Text style={styles.segmentLabel}>Active</Text>
              </Card>
            </View>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      )}
    </View>
  );
}

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
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, ...typography.body, color: palette.text, paddingVertical: 0 },
  filterRow: { gap: spacing.sm, paddingVertical: spacing.md },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  filterPillActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  filterPillText: { ...typography.label, color: palette.textSecondary },
  filterPillTextActive: { color: palette.textInverse },
  overviewRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.xl },
  overviewCard: { flex: 1, gap: 4 },
  overviewValue: { ...typography.h3, color: palette.text },
  overviewLabel: { ...typography.caption, color: palette.textMuted },
  section: { marginBottom: spacing.xl },
  customerItem: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  customerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...typography.h3, color: palette.primary, fontWeight: "800" },
  customerInfo: { flex: 1 },
  customerHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  customerName: { ...typography.body, color: palette.text, fontWeight: "700", flexShrink: 1 },
  customerEmail: { ...typography.caption, color: palette.textMuted, marginTop: 2 },
  customerStats: { ...typography.label, color: palette.textSecondary, marginTop: 4 },
  segmentsGrid: { flexDirection: "row", gap: spacing.md },
  segmentBox: { flex: 1, alignItems: "center", gap: 4 },
  segmentValue: { ...typography.h3, color: palette.text },
  segmentLabel: { ...typography.caption, color: palette.textMuted },
});