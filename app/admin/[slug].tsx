import React, { Suspense, lazy } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { AdminTab } from "@/screens/admin/AdminPortalShell";

// Dynamic Import: Ensure the heavy AdminPortalShell is an asynchronous chunk
const LazyAdminPortalShell = lazy(() =>
  import("../../src/screens/admin/AdminPortalShell").then((m) => ({ default: m.AdminPortalShell }))
);

const VALID_TABS: AdminTab[] = [
  "dashboard",
  "hero-banners",
  "marketplace",
  "booking-ops",
  "users",
  "hotels",
  "agencies",
  "agency-ops",
  "payment-ops",
  "refunds",
  "commissions",
  "destinations",
  "reviews",
  "support",
  "notifications",
  "marketing",
  "ads",
  "reports",
  "demand-heatmap",
  "monitoring",
  "audit-trail",
  "agency-kyc",
  "settings",
];

const AdminLoadingFallback = () => (
  <View style={styles.fallback}>
    <ActivityIndicator size="large" color="#0284c7" />
  </View>
);

export default function AdminSlugPage() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const initialTab: AdminTab =
    slug && VALID_TABS.includes(slug as AdminTab) ? (slug as AdminTab) : "dashboard";

  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <LazyAdminPortalShell initialTab={initialTab} />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
  },
});
