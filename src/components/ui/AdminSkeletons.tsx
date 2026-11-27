/**
 * AdminSkeletons — Admin portal–specific skeleton loading states.
 * Dark-themed (#0f172a) skeleton layouts matching admin screen designs.
 * Uses the base Skeleton component from ./Skeleton.
 */

import React from "react";
import { View, StyleSheet } from "react-native";
import { Skeleton } from "./Skeleton";

const BG = "#0f172a";
const CARD_BG = "#1e293b";

// ─── Admin KPI Card Skeleton ───────────────────────────────────────────────
export const AdminKPICardSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <View style={styles.kpiRow}>
    {Array.from({ length: count }).map((_, i) => (
      <View key={i} style={styles.kpiCard}>
        <Skeleton variant="rect" width="40%" height={12} borderRadius={6} style={styles.mb8} />
        <Skeleton variant="rect" width="65%" height={28} borderRadius={6} style={styles.mb8} />
        <Skeleton variant="rect" width="50%" height={10} borderRadius={5} />
      </View>
    ))}
  </View>
);

// ─── Admin Table Row Skeleton ──────────────────────────────────────────────
export const AdminTableRowSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <View>
    {Array.from({ length: count }).map((_, i) => (
      <View key={i} style={styles.tableRow}>
        <Skeleton variant="circle" width={36} height={36} style={styles.mr12} />
        <View style={styles.flex1}>
          <Skeleton variant="rect" width="55%" height={12} borderRadius={6} style={styles.mb6} />
          <Skeleton variant="rect" width="35%" height={10} borderRadius={5} />
        </View>
        <Skeleton variant="rect" width={60} height={22} borderRadius={11} />
      </View>
    ))}
  </View>
);

// ─── Admin List Card Skeleton ──────────────────────────────────────────────
export const AdminListCardSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <View>
    {Array.from({ length: count }).map((_, i) => (
      <View key={i} style={styles.listCard}>
        <View style={styles.listCardLeft}>
          <Skeleton variant="circle" width={44} height={44} style={styles.mr12} />
          <View>
            <Skeleton variant="rect" width={120} height={13} borderRadius={6} style={styles.mb6} />
            <Skeleton variant="rect" width={80} height={10} borderRadius={5} />
          </View>
        </View>
        <View style={styles.listCardRight}>
          <Skeleton variant="rect" width={70} height={22} borderRadius={11} style={styles.mb6} />
          <Skeleton variant="rect" width={50} height={10} borderRadius={5} />
        </View>
      </View>
    ))}
  </View>
);

// ─── Admin Dashboard Skeleton ──────────────────────────────────────────────
export const AdminDashboardSkeleton: React.FC = () => (
  <View style={styles.dashContainer}>
    {/* Header */}
    <View style={styles.dashHeader}>
      <Skeleton variant="rect" width="40%" height={20} borderRadius={8} style={styles.mb8} />
      <Skeleton variant="rect" width="25%" height={12} borderRadius={6} />
    </View>
    {/* KPI Cards */}
    <AdminKPICardSkeleton count={4} />
    {/* Chart area */}
    <View style={styles.chartCard}>
      <Skeleton variant="rect" width="30%" height={14} borderRadius={6} style={styles.mb12} />
      <Skeleton variant="rect" width="100%" height={120} borderRadius={8} />
    </View>
    {/* Activity list */}
    <View style={styles.activityCard}>
      <Skeleton variant="rect" width="35%" height={14} borderRadius={6} style={styles.mb12} />
      <AdminTableRowSkeleton count={4} />
    </View>
  </View>
);

// ─── Admin Profile Row Skeleton ────────────────────────────────────────────
export const AdminProfileRowSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <View>
    {Array.from({ length: count }).map((_, i) => (
      <View key={i} style={styles.profileRow}>
        <Skeleton variant="circle" width={48} height={48} style={styles.mr12} />
        <View style={styles.flex1}>
          <Skeleton variant="rect" width="45%" height={14} borderRadius={6} style={styles.mb6} />
          <Skeleton variant="rect" width="65%" height={11} borderRadius={5} style={styles.mb6} />
          <Skeleton variant="rect" width="30%" height={10} borderRadius={5} />
        </View>
        <Skeleton variant="rect" width={80} height={30} borderRadius={15} />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  // KPI
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  kpiCard: {
    flex: 1, minWidth: 140, backgroundColor: CARD_BG,
    borderRadius: 12, padding: 16, marginBottom: 4,
  },
  // Table
  tableRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: CARD_BG, borderRadius: 10,
    padding: 12, marginBottom: 8,
  },
  // List Card
  listCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  listCardLeft: { flexDirection: "row", alignItems: "center" },
  listCardRight: { alignItems: "flex-end" },
  // Dashboard
  dashContainer: { backgroundColor: BG, flex: 1, padding: 16 },
  dashHeader: { marginBottom: 20 },
  chartCard: { backgroundColor: CARD_BG, borderRadius: 12, padding: 16, marginBottom: 12 },
  activityCard: { backgroundColor: CARD_BG, borderRadius: 12, padding: 16 },
  // Profile
  profileRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  // Utilities
  flex1: { flex: 1 },
  mb6: { marginBottom: 6 },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
  mr12: { marginRight: 12 },
});

const AdminSkeletons = {
  AdminKPICardSkeleton,
  AdminTableRowSkeleton,
  AdminListCardSkeleton,
  AdminDashboardSkeleton,
  AdminProfileRowSkeleton,
};

export default AdminSkeletons;
