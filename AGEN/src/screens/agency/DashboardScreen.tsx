/**
 * Agency Dashboard Screen — Light Travel SaaS Command Center
 *
 * Real data only (no fabricated metrics/bookings). Loads live agency metrics
 * and bookings from Supabase via the shared agency service layer, with proper
 * loading, empty and error states. Consistent Feather icons, light theme.
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
  Modal,
  Alert,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";

import { useAuth } from "../../hooks/useAuth";
import {
  agencyDashboardService,
  agencyBookingsService,
  type AgencyBooking,
  type AgencyMetrics,
} from "../../services/agencyService";
import { supabase } from "../../services/supabaseClient";
import { useAgencyRBAC } from "../../context/AgencyRBACContext";
import { initAgencyRealtimeBridge } from "../../services/events/supabaseRealtimeBridge";
import { appEventBus, APP_EVENTS } from "../../services/events/appEventBus";

import {
  Icon,
  Button,
  IconButton,
  Card,
  Badge,
  SectionHeader,
  StateView,
  KpiCard,
  Skeleton,
} from "../../components/ui/DashboardUI";
import {
  palette,
  spacing,
  radius,
  typography,
  shadow,
} from "../../theme/tokens";
import type { Tone } from "../../theme/tokens";

export type ServiceType = "all" | "flight" | "hotel" | "bus" | "holiday" | "visa";
export type BookingStatus = "all" | "confirmed" | "completed" | "pending" | "cancelled";

interface ServiceMeta {
  key: Exclude<ServiceType, "all">;
  label: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  tone: Tone;
}

const SERVICES: ServiceMeta[] = [
  { key: "flight", label: "Flight", icon: "send", tone: "info" },
  { key: "hotel", label: "Hotel", icon: "home", tone: "success" },
  { key: "bus", label: "Bus", icon: "truck", tone: "warning" },
  { key: "holiday", label: "Holiday", icon: "map", tone: "purple" },
  { key: "visa", label: "Visa", icon: "file-text", tone: "danger" },
];

const STATUS_TABS: { key: BookingStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "pending", label: "Pending" },
];

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

const serviceMeta = (productType: string): ServiceMeta =>
  SERVICES.find((s) => s.key === productType.toLowerCase()) ?? {
    key: "flight",
    label: productType || "Other",
    icon: "tag",
    tone: "neutral",
  };

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { roleMeta } = useAgencyRBAC();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<AgencyMetrics | null>(null);
  const [bookings, setBookings] = useState<AgencyBooking[]>([]);

  const [selectedService, setSelectedService] = useState<ServiceType>("all");
  const [selectedStatus, setSelectedStatus] = useState<BookingStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeModalBooking, setActiveModalBooking] = useState<AgencyBooking | null>(null);

  const [scopedAlerts, setScopedAlerts] = useState<
    { id: string; title: string; body: string; tenantId: string; isRead: boolean }[]
  >([]);
  const [alertsModalVisible, setAlertsModalVisible] = useState(false);

  const activeAgencyId = user?.agency?.id || "";

  const loadDashboard = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      setError(null);
      try {
        let targetAgencyId = user?.agency?.id;
        if (!targetAgencyId) {
          const { data: defaultAgency } = await supabase
            .from("agencies")
            .select("id")
            .limit(1)
            .maybeSingle();
          targetAgencyId = defaultAgency?.id;
        }

        if (!targetAgencyId) {
          setMetrics(null);
          setBookings([]);
          setError("No agency is linked to this account yet.");
          return;
        }

        const [nextMetrics, nextBookings] = await Promise.all([
          agencyDashboardService.getMetrics(targetAgencyId),
          agencyBookingsService.getBookings(targetAgencyId, "all", 50),
        ]);

        setMetrics(nextMetrics);
        setBookings(nextBookings);

        // Derive scoped alerts from live bookings (most recent first)
        setScopedAlerts(
          nextBookings.slice(0, 8).map((b) => ({
            id: `ag-bk-${b.id}`,
            title: `Booking ${b.booking_reference || b.id.slice(0, 8)}`,
            body: `${b.product_type || "Trip"} • ${String(b.status || "pending").toUpperCase()}`,
            tenantId: String(targetAgencyId),
            isRead: false,
          })),
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load dashboard data.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.agency?.id],
  );

  useEffect(() => {
    loadDashboard("initial");
  }, [loadDashboard]);

  useEffect(() => {
    if (!activeAgencyId) return;
    const stopBridge = initAgencyRealtimeBridge(activeAgencyId);
    const unsubBooking = appEventBus.subscribe(
      APP_EVENTS.BOOKING_STATUS_CHANGED,
      (payload) => {
        setScopedAlerts((prev) => [
          {
            id: `rt-bk-${payload.bookingId}-${payload.timestamp}`,
            title: `Booking ${payload.bookingReference || payload.bookingId}`,
            body: `Status updated to ${String(payload.currentStatus).toUpperCase()}`,
            tenantId: activeAgencyId,
            isRead: false,
          },
          ...prev.slice(0, 19),
        ]);
        // Reflect status change in the local list without a refetch
        setBookings((prev) =>
          prev.map((b) =>
            b.id === payload.bookingId
              ? { ...b, status: payload.currentStatus }
              : b,
          ),
        );
      },
    );
    return () => {
      unsubBooking();
      stopBridge();
    };
  }, [activeAgencyId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboard("refresh");
  }, [loadDashboard]);

  // ---- Derived data (all from real bookings) ----
  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status.toLowerCase() === "pending").length,
    [bookings],
  );

  const serviceCounts = useMemo(() => {
    const counts: Record<string, number> = { all: bookings.length };
    for (const s of SERVICES) counts[s.key] = 0;
    for (const b of bookings) {
      const key = b.product_type?.toLowerCase();
      if (key && key in counts) counts[key] += 1;
    }
    return counts;
  }, [bookings]);

  const revenueByService = useMemo(() => {
    const totals: Record<string, number> = {};
    let grand = 0;
    for (const b of bookings) {
      if (["cancelled", "pending"].includes(b.status.toLowerCase())) continue;
      const key = b.product_type?.toLowerCase() || "other";
      const amount = Number(b.final_price || 0);
      totals[key] = (totals[key] || 0) + amount;
      grand += amount;
    }
    return { totals, grand };
  }, [bookings]);

  const topDestinations = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const b of bookings) {
      if (["cancelled"].includes(b.status.toLowerCase())) continue;
      const key = b.destination_city || "Unspecified";
      totals[key] = (totals[key] || 0) + Number(b.final_price || 0);
    }
    const rows = Object.entries(totals)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    const max = rows[0]?.amount || 1;
    return rows.map((r) => ({ ...r, pct: Math.round((r.amount / max) * 100) }));
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bookings.filter((b) => {
      const matchService =
        selectedService === "all" ||
        b.product_type?.toLowerCase() === selectedService.toLowerCase();
      const matchStatus =
        selectedStatus === "all" ||
        b.status.toLowerCase() === selectedStatus.toLowerCase();
      const traveler = b.traveler_details;
      const customer = traveler
        ? `${traveler.first_name} ${traveler.last_name}`.trim()
        : "";
      const matchQuery =
        !q ||
        (b.booking_reference || "").toLowerCase().includes(q) ||
        (b.destination_city || "").toLowerCase().includes(q) ||
        customer.toLowerCase().includes(q);
      return matchService && matchStatus && matchQuery;
    });
  }, [bookings, selectedService, selectedStatus, searchQuery]);

  // ---- Actions ----
  const handleUpdateStatus = async (item: AgencyBooking, newStatus: BookingStatus) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const agencyId = user?.agency?.id;
      if (agencyId) {
        await agencyBookingsService.updateBookingStatus(agencyId, item.id, newStatus);
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === item.id ? { ...b, status: newStatus } : b)),
      );
      setActiveModalBooking((prev) =>
        prev && prev.id === item.id ? { ...prev, status: newStatus } : prev,
      );
      Alert.alert("Status Updated", `Booking is now ${newStatus.toUpperCase()}`);
    } catch (err) {
      Alert.alert(
        "Update Failed",
        err instanceof Error ? err.message : "Could not update booking status.",
      );
    }
  };

  const handleShareVoucher = async (item: AgencyBooking) => {
    try {
      Haptics.selectionAsync();
      const traveler = item.traveler_details;
      const customer = traveler
        ? `${traveler.first_name} ${traveler.last_name}`.trim()
        : "Customer";
      await Share.share({
        message: `Shopno Jatra E-Voucher
Booking: ${item.booking_reference || item.id}
Customer: ${customer}
Service: ${item.product_type} (${item.destination_city || "—"})
Travel Date: ${item.start_date || "TBD"}
Amount: ${formatBDT(Number(item.final_price || 0))}
Status: ${item.status.toUpperCase()}`,
      });
    } catch (err) {
      console.warn(err);
    }
  };

  const unreadCount = scopedAlerts.filter((a) => !a.isRead).length;
  const visibleAlerts = scopedAlerts.filter(
    (a) => !activeAgencyId || a.tenantId === activeAgencyId,
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" backgroundColor={palette.background} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerProfile}>
          <View style={[styles.avatar, { backgroundColor: roleMeta?.color || palette.primary }]}>
            <Icon name="briefcase" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.agencyName} numberOfLines={1}>
                {user?.agencyName || "Agency"}
              </Text>
              <Icon name="check-circle" size={14} color={palette.primary} />
              {roleMeta?.badge ? (
                <Badge label={roleMeta.badge} tone="primary" />
              ) : null}
            </View>
            <Text style={styles.agencyId} numberOfLines={1}>
              {activeAgencyId ? `ID: ${activeAgencyId.slice(0, 8).toUpperCase()}` : "No agency linked"}
            </Text>
          </View>
        </View>
        <IconButton
          icon="bell"
          onPress={() => {
            Haptics.selectionAsync();
            setAlertsModalVisible(true);
          }}
          badgeCount={unreadCount}
          accessibilityLabel="Open agency alerts"
        />
      </View>

      {loading ? (
        <View style={styles.body}>
          <Skeleton style={{ height: 64, marginBottom: spacing.lg }} />
          <View style={styles.kpiRow}>
            <Skeleton style={{ height: 110, flex: 1 }} />
            <Skeleton style={{ height: 110, flex: 1 }} />
          </View>
          <View style={styles.kpiRow}>
            <Skeleton style={{ height: 110, flex: 1 }} />
            <Skeleton style={{ height: 110, flex: 1 }} />
          </View>
          <Skeleton style={{ height: 200, marginTop: spacing.lg }} />
        </View>
      ) : error ? (
        <StateView
          variant="error"
          title="Couldn't load dashboard"
          message={error}
          actionLabel="Retry"
          onActionPress={() => loadDashboard("initial")}
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
          {/* Welcome */}
          <View style={styles.hero}>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.heroName}>{user?.agencyName || "Partner"}</Text>
            <Text style={styles.heroSub}>Live operations overview</Text>
          </View>

          {/* KPI Cards */}
          <View style={styles.kpiRow}>
            <KpiCard
              label="Total Bookings"
              value={String(metrics?.totalBookings ?? 0)}
              icon="briefcase"
              tone="primary"
              trend={metrics?.bookingGrowth}
              trendLabel="vs last month"
            />
            <KpiCard
              label="Total Revenue"
              value={formatBDT(metrics?.totalRevenue ?? 0)}
              icon="dollar-sign"
              tone="success"
              trend={metrics?.revenueGrowth}
              trendLabel="vs last month"
            />
          </View>
          <View style={[styles.kpiRow, { marginTop: spacing.md }]}>
            <KpiCard
              label="Pending Bookings"
              value={String(pendingCount)}
              icon="clock"
              tone="warning"
            />
            <KpiCard
              label="Total Customers"
              value={String(metrics?.activeCustomers ?? 0)}
              icon="users"
              tone="info"
            />
          </View>

          {/* Bookings by Service */}
          <View style={styles.section}>
            <SectionHeader title="Bookings by Service" />
            {bookings.length === 0 ? (
              <Card>
                <StateView
                  variant="empty"
                  title="No bookings yet"
                  message="Bookings will appear here once customers book through your agency."
                  icon="inbox"
                />
              </Card>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.serviceRow}
              >
                {SERVICES.map((s) => {
                  const active = selectedService === s.key;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      activeOpacity={0.8}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelectedService(active ? "all" : s.key);
                      }}
                      style={[
                        styles.serviceCard,
                        active && { borderColor: palette.primary, backgroundColor: palette.primarySoft },
                      ]}
                    >
                      <Icon name={s.icon} size={22} color={palette.primary} />
                      <Text style={styles.serviceLabel}>{s.label}</Text>
                      <Text style={styles.serviceCount}>{serviceCounts[s.key] ?? 0}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Booking Management */}
          <View style={styles.section}>
            <SectionHeader
              title="Booking Management"
              actionLabel="Reset"
              onActionPress={() => {
                setSelectedService("all");
                setSelectedStatus("all");
                setSearchQuery("");
              }}
            />

            {/* Service tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRow}
            >
              {[{ key: "all" as const, label: "All" }, ...SERVICES].map((tab) => {
                const active = selectedService === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedService(tab.key);
                    }}
                    style={[styles.tab, active && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Search */}
            <View style={styles.search}>
              <Icon name="search" size={16} color={palette.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by reference / destination / customer"
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

            {/* Status pills */}
            <View style={styles.statusRow}>
              {STATUS_TABS.map((st) => {
                const active = selectedStatus === st.key;
                return (
                  <TouchableOpacity
                    key={st.key}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedStatus(st.key);
                    }}
                    style={[styles.statusPill, active && styles.statusPillActive]}
                  >
                    <Text style={[styles.statusPillText, active && styles.statusPillTextActive]}>
                      {st.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Booking cards */}
            {filteredBookings.length === 0 ? (
              <Card>
                <StateView
                  variant="empty"
                  title="No matching bookings"
                  message="Try adjusting your search or filters."
                  icon="search"
                  actionLabel="Reset filters"
                  onActionPress={() => {
                    setSelectedService("all");
                    setSelectedStatus("all");
                    setSearchQuery("");
                  }}
                />
              </Card>
            ) : (
              filteredBookings.map((b) => {
                const meta = serviceMeta(b.product_type);
                const tone = statusTone(b.status);
                const traveler = b.traveler_details;
                const customer = traveler
                  ? `${traveler.first_name} ${traveler.last_name}`.trim()
                  : `Customer ${b.user_id?.slice(0, 6) ?? ""}`;
                return (
                  <Card key={b.id} style={{ marginBottom: spacing.md }}>
                    <View style={styles.bookingHeader}>
                      <View style={styles.bookingHeaderLeft}>
                        <Text style={styles.orderId}>
                          {b.booking_reference || `#${b.id.slice(0, 8).toUpperCase()}`}
                        </Text>
                        <Badge label={b.status.toUpperCase()} tone={tone} />
                      </View>
                      <Text style={styles.bookingAmount}>{formatBDT(Number(b.final_price || 0))}</Text>
                    </View>

                    <View style={styles.bookingBody}>
                      <View style={[styles.serviceCircle, { backgroundColor: palette.primarySoft }]}>
                        <Icon name={meta.icon} size={18} color={palette.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.customerName}>{customer}</Text>
                        <Text style={styles.routeText}>
                          {meta.label} • {b.destination_city || "Destination pending"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <View style={styles.dateChip}>
                        <Icon name="calendar" size={12} color={palette.textMuted} />
                        <Text style={styles.dateText}>{b.start_date || "Date pending"}</Text>
                      </View>
                      <View style={styles.dateChip}>
                        <Icon name="users" size={12} color={palette.textMuted} />
                        <Text style={styles.dateText}>{b.number_of_guests ?? 1} guests</Text>
                      </View>
                    </View>

                    <View style={styles.bookingActions}>
                      <Button
                        label="Details"
                        variant="outline"
                        size="sm"
                        icon="eye"
                        onPress={() => setActiveModalBooking(b)}
                      />
                      <Button
                        label="Voucher"
                        variant="ghost"
                        size="sm"
                        icon="download"
                        onPress={() => handleShareVoucher(b)}
                      />
                      {b.status.toLowerCase() === "pending" ? (
                        <Button
                          label="Confirm"
                          variant="primary"
                          size="sm"
                          icon="check"
                          onPress={() => handleUpdateStatus(b, "confirmed")}
                        />
                      ) : null}
                      {b.status.toLowerCase() === "confirmed" ? (
                        <Button
                          label="Complete"
                          variant="primary"
                          size="sm"
                          icon="check-circle"
                          onPress={() => handleUpdateStatus(b, "completed")}
                        />
                      ) : null}
                    </View>
                  </Card>
                );
              })
            )}
          </View>

          {/* Revenue Reports */}
          <View style={styles.section}>
            <SectionHeader title="Revenue Reports" subtitle="By service type" />
            <Card>
              <Text style={styles.revenueTitle}>Total Revenue</Text>
              <Text style={styles.revenueAmount}>{formatBDT(revenueByService.grand)}</Text>
              {revenueByService.grand > 0 ? (
                <>
                  <View style={styles.segmentBar}>
                    {SERVICES.map((s) => {
                      const amount = revenueByService.totals[s.key] || 0;
                      const pct = (amount / revenueByService.grand) * 100;
                      if (pct <= 0) return null;
                      return (
                        <View
                          key={s.key}
                          style={{ width: `${pct}%`, backgroundColor: palette.primary }}
                        />
                      );
                    })}
                  </View>
                  <View style={styles.breakdownGrid}>
                    {SERVICES.map((s) => {
                      const amount = revenueByService.totals[s.key] || 0;
                      const pct = revenueByService.grand
                        ? Math.round((amount / revenueByService.grand) * 100)
                        : 0;
                      return (
                        <View key={s.key} style={styles.breakdownItem}>
                          <View style={styles.breakdownLabelRow}>
                            <View style={[styles.dot, { backgroundColor: palette.primary }]} />
                            <Text style={styles.breakdownLabel}>{s.label}</Text>
                          </View>
                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={styles.breakdownVal}>{formatBDT(amount)}</Text>
                            <Text style={styles.breakdownPct}>{pct}%</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : (
                <Text style={styles.mutedNote}>No revenue recorded yet.</Text>
              )}
            </Card>
          </View>

          {/* Top Destinations */}
          {topDestinations.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader title="Top Destinations" />
              <Card>
                {topDestinations.map((d, i) => (
                  <View key={d.name} style={i > 0 ? styles.destRowSpaced : null}>
                    <View style={styles.destLabelRow}>
                      <View style={styles.breakdownLabelRow}>
                        <View style={[styles.dot, { backgroundColor: palette.primary }]} />
                        <Text style={styles.destinationName}>{d.name}</Text>
                      </View>
                      <Text style={styles.destinationAmount}>{formatBDT(d.amount)}</Text>
                    </View>
                    <View style={styles.destTrack}>
                      <View style={[styles.destBar, { width: `${d.pct}%` }]} />
                    </View>
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          {/* Quick Actions */}
          <View style={styles.section}>
            <SectionHeader title="Agency Quick Actions" />
            <View style={styles.actionsGrid}>
              {[
                { label: "B2B Book", icon: "navigation" as const, onPress: () => navigation.navigate("B2BSearchBooking") },
                { label: "Wallet Top-up", icon: "credit-card" as const, onPress: () => navigation.navigate("WalletTopUp") },
                { label: "Quotation", icon: "file-text" as const, onPress: () => navigation.navigate("QuotationBuilder") },
                { label: "Bookings", icon: "check-circle" as const, onPress: () => navigation.navigate("BookingsTab") },
                { label: "Customers", icon: "users" as const, onPress: () => navigation.navigate("CustomersTab") },
                { label: "Earnings", icon: "dollar-sign" as const, onPress: () => navigation.navigate("ProfileTab", { screen: "Earnings" }) },
                { label: "Staff Team", icon: "user-check" as const, onPress: () => navigation.navigate("ProfileTab", { screen: "TeamManagement" }) },
                { label: "Verification", icon: "shield" as const, onPress: () => navigation.navigate("ProfileTab", { screen: "Verification" }) },
              ].map((action) => (
                <TouchableOpacity
                  key={action.label}
                  activeOpacity={0.8}
                  style={styles.actionItem}
                  onPress={action.onPress}
                >
                  <View style={styles.actionIcon}>
                    <Icon name={action.icon} size={20} color={palette.primary} />
                  </View>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* Booking Details Modal */}
      <Modal
        visible={!!activeModalBooking}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveModalBooking(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            {activeModalBooking ? (
              <>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Booking Details</Text>
                    <Text style={styles.modalSub}>
                      {activeModalBooking.booking_reference || activeModalBooking.id.slice(0, 8)}
                    </Text>
                  </View>
                  <IconButton icon="x" onPress={() => setActiveModalBooking(null)} />
                </View>

                <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Customer</Text>
                    <Text style={styles.modalValue}>
                      {activeModalBooking.traveler_details
                        ? `${activeModalBooking.traveler_details.first_name} ${activeModalBooking.traveler_details.last_name}`.trim()
                        : `Customer ${activeModalBooking.user_id?.slice(0, 6) ?? ""}`}
                    </Text>
                    {activeModalBooking.traveler_details?.email ? (
                      <Text style={styles.modalFieldSub}>{activeModalBooking.traveler_details.email}</Text>
                    ) : null}
                    <Text style={styles.modalFieldSub}>
                      Guests: {activeModalBooking.number_of_guests ?? 1}
                    </Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Service & Itinerary</Text>
                    <Text style={styles.modalValue}>
                      {serviceMeta(activeModalBooking.product_type).label}
                    </Text>
                    <Text style={styles.modalFieldSub}>
                      {activeModalBooking.destination_city || "Destination pending"}
                    </Text>
                    <Text style={styles.modalFieldSub}>
                      Travel Date: {activeModalBooking.start_date || "TBD"}
                    </Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Financial Summary</Text>
                    <Text style={styles.modalPrice}>
                      {formatBDT(Number(activeModalBooking.final_price || 0))}
                    </Text>
                    <Text style={styles.modalFieldSub}>
                      Status: {activeModalBooking.status.toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalLabel}>Update Booking Status</Text>
                    <View style={styles.statusButtonGroup}>
                      {(["confirmed", "completed", "pending", "cancelled"] as BookingStatus[]).map(
                        (s) => (
                          <Button
                            key={s}
                            label={s.charAt(0).toUpperCase() + s.slice(1)}
                            size="sm"
                            variant={s === "cancelled" ? "danger" : "outline"}
                            onPress={() => handleUpdateStatus(activeModalBooking, s)}
                          />
                        ),
                      )}
                    </View>
                  </View>
                </ScrollView>

                <View style={styles.modalFooter}>
                  <Button
                    label="Share / Download E-Voucher"
                    icon="download"
                    onPress={() => handleShareVoucher(activeModalBooking)}
                  />
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Alerts Modal */}
      <Modal
        visible={alertsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAlertsModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: "75%" }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Agency Alerts</Text>
                <Text style={styles.modalSub}>
                  Scope: {activeAgencyId || "default"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                {unreadCount > 0 ? (
                  <Button
                    label="Mark all read"
                    size="sm"
                    variant="ghost"
                    onPress={() =>
                      setScopedAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })))
                    }
                  />
                ) : null}
                <IconButton icon="x" onPress={() => setAlertsModalVisible(false)} />
              </View>
            </View>
            <ScrollView>
              {visibleAlerts.length === 0 ? (
                <StateView
                  variant="empty"
                  title="No alerts"
                  message="You're all caught up for this agency."
                  icon="bell"
                />
              ) : (
                visibleAlerts.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.8}
                    style={[
                      styles.alertItem,
                      { backgroundColor: item.isRead ? palette.surfaceAlt : palette.primarySoft },
                    ]}
                    onPress={() =>
                      setScopedAlerts((prev) =>
                        prev.map((a) => (a.id === item.id ? { ...a, isRead: true } : a)),
                      )
                    }
                  >
                    <Text style={styles.alertTitle}>{item.title}</Text>
                    <Text style={styles.alertBody}>{item.body}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerProfile: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  agencyName: { ...typography.h3, color: palette.text, flexShrink: 1 },
  agencyId: { ...typography.caption, color: palette.textMuted, marginTop: 2 },
  body: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingTop: spacing.md },
  hero: { marginBottom: spacing.lg },
  greeting: { ...typography.body, color: palette.textMuted },
  heroName: { ...typography.h1, color: palette.text, marginTop: 2 },
  heroSub: { ...typography.body, color: palette.textMuted, marginTop: 4 },
  kpiRow: { flexDirection: "row", gap: spacing.md },
  section: { marginTop: spacing.xl },
  serviceRow: { gap: spacing.md, paddingBottom: spacing.xs },
  serviceCard: {
    width: 92,
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.card,
  },
  serviceLabel: { ...typography.caption, color: palette.textSecondary },
  serviceCount: { ...typography.h3, color: palette.text },
  tabsRow: { gap: spacing.sm, marginBottom: spacing.md },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  tabActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  tabText: { ...typography.label, color: palette.textSecondary },
  tabTextActive: { color: palette.textInverse },
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
  statusRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md, flexWrap: "wrap" },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  statusPillActive: { backgroundColor: palette.primarySoft, borderColor: palette.primary },
  statusPillText: { ...typography.label, color: palette.textSecondary },
  statusPillTextActive: { color: palette.primary },
  bookingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  bookingHeaderLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  orderId: { ...typography.label, color: palette.text, fontWeight: "800" },
  bookingAmount: { ...typography.h3, color: palette.text },
  bookingBody: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  serviceCircle: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  customerName: { ...typography.body, color: palette.text, fontWeight: "700" },
  routeText: { ...typography.caption, color: palette.textMuted, marginTop: 2 },
  metaRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md, flexWrap: "wrap" },
  dateChip: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dateText: { ...typography.caption, color: palette.textMuted },
  bookingActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end", flexWrap: "wrap" },
  revenueTitle: { ...typography.label, color: palette.textMuted },
  revenueAmount: { ...typography.h2, color: palette.text, marginTop: 2 },
  segmentBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: radius.sm,
    overflow: "hidden",
    marginVertical: spacing.lg,
    backgroundColor: palette.surfaceAlt,
  },
  breakdownGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.md },
  breakdownItem: {
    width: "48%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breakdownLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  breakdownLabel: { ...typography.label, color: palette.textSecondary },
  breakdownVal: { ...typography.label, color: palette.text, fontWeight: "700" },
  breakdownPct: { ...typography.caption, color: palette.textMuted },
  mutedNote: { ...typography.body, color: palette.textMuted, marginTop: spacing.sm },
  destRowSpaced: { marginTop: spacing.md },
  destLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  destinationName: { ...typography.body, color: palette.text, fontWeight: "600" },
  destinationAmount: { ...typography.body, color: palette.textSecondary, fontWeight: "700" },
  destTrack: { height: 6, borderRadius: 3, backgroundColor: palette.surfaceAlt, overflow: "hidden" },
  destBar: { height: "100%", borderRadius: 3, backgroundColor: palette.primary },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  actionItem: { width: "22%", alignItems: "center", gap: spacing.sm },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { ...typography.caption, color: palette.textSecondary, textAlign: "center" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  modalTitle: { ...typography.h3, color: palette.text },
  modalSub: { ...typography.caption, color: palette.textMuted, marginTop: 2 },
  modalSection: {
    marginBottom: spacing.md,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  modalLabel: { ...typography.label, color: palette.textMuted, textTransform: "uppercase", marginBottom: 6 },
  modalValue: { ...typography.body, color: palette.text, fontWeight: "700" },
  modalFieldSub: { ...typography.caption, color: palette.textMuted, marginTop: 2 },
  modalPrice: { ...typography.h2, color: palette.success },
  statusButtonGroup: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  modalFooter: { marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: palette.border },
  alertItem: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  alertTitle: { ...typography.label, color: palette.text, fontWeight: "700" },
  alertBody: { ...typography.caption, color: palette.textSecondary, marginTop: 2 },
});