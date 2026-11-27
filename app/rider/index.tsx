import React from "react";
import { useRouter } from "expo-router";
import {
  RiderDashboardView,
  RiderPortalTab,
} from "@/features/rider/screens/RiderDashboardView";

export default function RiderIndexRoute() {
  const router = useRouter();

  const handleNavigateTab = (tab: RiderPortalTab) => {
    const target = tab === "index" ? "/rider" : `/rider/${tab}`;
    router.push(target as Parameters<typeof router.push>[0]);
  };

  return <RiderDashboardView onNavigateTab={handleNavigateTab} />;
}
