import React from "react";
import {
  RiderDashboardView,
  RiderPortalTab,
} from "@/features/rider/screens/RiderDashboardView";

interface Props {
  onNavigateTab?: (tab: RiderPortalTab) => void;
}

export const RiderDashboardScreen: React.FC<Props> = ({ onNavigateTab }) => {
  return <RiderDashboardView onNavigateTab={onNavigateTab} />;
};
