/**
 * Customers Screen - B2B Agency CRM (Twenty-CRM Inspired)
 * Customer CRM with live pipeline segmentation, search, and booking analytics
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
  ActivityIndicator,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "../../App";
import { CustomersStackParamList } from "../../App";
import { Card, SectionHeader, Badge } from "../ui/UIComponents";
import { useAuth } from "../../hooks/useAuth";
import { agencyCustomersService } from "../../services/agencyService";

export interface CustomerItem {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  bookings: number;
  spent: number;
  vip: boolean;
  avatar: string;
  stage?: "lead" | "quote_sent" | "confirmed" | "completed";
  lastBooking?: string;
}

const FALLBACK_CUSTOMERS: CustomerItem[] = [
  {
    id: "demo-cust-1",
    name: "Mohammad Tanvir Hossain",
    email: "tanvir.hossain@example.com",
    phone: "+880 1712-345678",
    bookings: 6,
    spent: 85400,
    vip: true,
    avatar: "👨‍💼",
    stage: "confirmed",
    lastBooking: "2026-11-18",
  },
  {
    id: "demo-cust-2",
    name: "Sadia Sultana",
    email: "sadia.sultana@example.com",
    phone: "+880 1819-234567",
    bookings: 4,
    spent: 52300,
    vip: true,
    avatar: "👩‍💼",
    stage: "confirmed",
    lastBooking: "2026-11-15",
  },
  {
    id: "demo-cust-3",
    name: "Arifur Rahman",
    email: "arif.rahman@example.com",
    phone: "+880 1911-987654",
    bookings: 2,
    spent: 24000,
    vip: false,
    avatar: "👨‍💻",
    stage: "quote_sent",
    lastBooking: "2026-11-10",
  },
  {
    id: "demo-cust-4",
    name: "Farhana Yasmin",
    email: "farhana.y@example.com",
    phone: "+880 1610-112233",
    bookings: 1,
    spent: 14500,
    vip: false,
    avatar: "👩‍🦰",
    stage: "lead",
    lastBooking: "2026-11-05",
  },
];

type PipelineFilter = "all" | "vip" | "frequent" | "leads";

type Props = NativeStackScreenProps<CustomersStackParamList, "CustomersList">;

export default function CustomersScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<PipelineFilter>("all");
  const [customers, setCustomers] = useState<CustomerItem[]>([]);

  const agencyId = user?.agency?.id || user?.id || "demo-agency-id";

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await agencyCustomersService.getCustomers(agencyId);
      if (data && data.length > 0) {
        const avatars = ["👨‍💼", "👩‍💼", "👨‍💻", "👩‍🦰", "🧕", "🧔"];
        const mapped: CustomerItem[] = data.map((c, idx) => ({
          id: c.id,
          name: c.name || `Customer #${c.id.slice(0, 5)}`,
          email: c.email || undefined,
          bookings: Number(c.bookings) || 1,
          spent: Number(c.spent) || 0,
          vip: Boolean(c.vip),
          avatar: avatars[idx % avatars.length],
          stage: c.bookings >= 3 ? "confirmed" : c.bookings === 2 ? "quote_sent" : "lead",
          lastBooking: c.lastBooking,
        }));
        setCustomers(mapped);
      } else {
        setCustomers(FALLBACK_CUSTOMERS);
      }
    } catch {
      setCustomers(FALLBACK_CUSTOMERS);
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

  // Pipeline Filtered & Searched Customers
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // 1. Pipeline filter
      if (activeFilter === "vip" && !c.vip) return false;
      if (activeFilter === "frequent" && c.bookings < 3) return false;
      if (activeFilter === "leads" && c.stage !== "lead") return false;

      // 2. Search query filter
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

  // Aggregate Metrics
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
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Customer CRM</Text>
            <Text style={styles.headerSubtitle}>ট্রাভেলার ও লিড পাইপলাইন (Twenty CRM)</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onRefresh}>
          <MaterialCommunityIcons name="refresh" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Search Input Bar */}
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons name="magnify" size={20} color={COLORS.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by customer name, email, or phone..."
            placeholderTextColor={COLORS.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Pipeline Stage Filter Pills (Twenty-CRM Style) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillsContainer}
        >
          <TouchableOpacity
            style={[styles.filterPill, activeFilter === "all" && styles.filterPillActive]}
            onPress={() => setActiveFilter("all")}
          >
            <Text
              style={[
                styles.filterPillText,
                activeFilter === "all" && styles.filterPillTextActive,
              ]}
            >
              All Travelers ({customers.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, activeFilter === "vip" && styles.filterPillActive]}
            onPress={() => setActiveFilter("vip")}
          >
            <Text
              style={[
                styles.filterPillText,
                activeFilter === "vip" && styles.filterPillTextActive,
              ]}
            >
              👑 VIP Travelers ({metrics.vips})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, activeFilter === "frequent" && styles.filterPillActive]}
            onPress={() => setActiveFilter("frequent")}
          >
            <Text
              style={[
                styles.filterPillText,
                activeFilter === "frequent" && styles.filterPillTextActive,
              ]}
            >
              ✈️ Frequent Flyers (3+ trips)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, activeFilter === "leads" && styles.filterPillActive]}
            onPress={() => setActiveFilter("leads")}
          >
            <Text
              style={[
                styles.filterPillText,
                activeFilter === "leads" && styles.filterPillTextActive,
              ]}
            >
              🎯 New Inquiries / Leads
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Customer Overview Card */}
        <View style={styles.section}>
          <LinearGradient
            colors={["#0055F2", "#4F46E5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.overviewCard}
          >
            <View style={styles.overviewContent}>
              <View style={styles.metricCol}>
                <Text style={styles.overviewLabel}>Total Travelers</Text>
                <Text style={styles.overviewValue}>{metrics.total}</Text>
                <Text style={styles.overviewTrend}>↑ Verified Profiles</Text>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.metricCol}>
                <Text style={styles.overviewLabel}>VIP High-Value</Text>
                <Text style={styles.overviewValue}>{metrics.vips}</Text>
                <Text style={styles.overviewTrend}>Top Tier Spenders</Text>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.metricCol}>
                <Text style={styles.overviewLabel}>Total GMV</Text>
                <Text style={styles.overviewValue}>৳{metrics.totalSpent.toLocaleString()}</Text>
                <Text style={styles.overviewTrend}>Avg ৳{metrics.avgSpent.toLocaleString()}</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Filtered Customers List */}
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
            action={`${filteredCustomers.length} results`}
          />

          {loading ? (
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 24 }} />
          ) : filteredCustomers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color={COLORS.textTertiary} />
              <Text style={styles.emptyText}>No travelers found matching your filter</Text>
            </View>
          ) : (
            filteredCustomers.map((customer) => (
              <Card key={customer.id}>
                <TouchableOpacity
                  style={styles.customerItem}
                  onPress={() =>
                    navigation.navigate("CustomerDetails", {
                      customerId: customer.id,
                    })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.customerAvatar}>
                    <Text style={styles.avatarEmoji}>{customer.avatar}</Text>
                  </View>
                  <View style={styles.customerInfo}>
                    <View style={styles.customerHeader}>
                      <Text style={styles.customerName} numberOfLines={1}>
                        {customer.name}
                      </Text>
                      {customer.vip && <Badge label="VIP" status="active" size="small" />}
                    </View>
                    {customer.email && (
                      <Text style={styles.customerEmail} numberOfLines={1}>
                        {customer.email}
                      </Text>
                    )}
                    <Text style={styles.customerStats}>
                      {customer.bookings} Bookings • ৳{customer.spent.toLocaleString()}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
                </TouchableOpacity>
              </Card>
            ))
          )}
        </View>

        {/* Customer Segments Quick Overview */}
        <View style={styles.section}>
          <SectionHeader title="Segment Distribution" />
          <View style={styles.segmentsGrid}>
            <Card>
              <View style={styles.segmentBox}>
                <MaterialCommunityIcons name="crown" size={24} color={COLORS.warning} />
                <Text style={styles.segmentLabel}>VIP Tier</Text>
                <Text style={styles.segmentValue}>{metrics.vips}</Text>
              </View>
            </Card>
            <Card>
              <View style={styles.segmentBox}>
                <MaterialCommunityIcons name="star" size={24} color={COLORS.secondary} />
                <Text style={styles.segmentLabel}>Regular</Text>
                <Text style={styles.segmentValue}>{Math.max(0, metrics.total - metrics.vips)}</Text>
              </View>
            </Card>
            <Card>
              <View style={styles.segmentBox}>
                <MaterialCommunityIcons name="clock-outline" size={24} color={COLORS.textTertiary} />
                <Text style={styles.segmentLabel}>Active</Text>
                <Text style={styles.segmentValue}>{metrics.total}</Text>
              </View>
            </Card>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 11,
    color: COLORS.textTertiary,
    marginTop: 1,
  },
  content: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 0,
  },
  filterPillsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  filterPillTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  overviewCard: {
    borderRadius: 16,
    padding: 16,
    shadowColor: "#0055F2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  overviewContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricCol: {
    flex: 1,
    alignItems: "center",
  },
  overviewDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  overviewLabel: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "500",
  },
  overviewValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 4,
  },
  overviewTrend: {
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: 2,
    fontWeight: "500",
  },
  customerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  customerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarEmoji: {
    fontSize: 22,
  },
  customerInfo: {
    flex: 1,
  },
  customerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  customerName: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
    flex: 1,
  },
  customerEmail: {
    fontSize: 11,
    color: COLORS.textTertiary,
    marginTop: 2,
  },
  customerStats: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textTertiary,
  },
  segmentsGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  segmentBox: {
    padding: 14,
    alignItems: "center",
    minWidth: 100,
  },
  segmentLabel: {
    fontSize: 11,
    color: COLORS.textTertiary,
    marginTop: 6,
  },
  segmentValue: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 2,
  },
});
