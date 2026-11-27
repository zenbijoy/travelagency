import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RiderDashboardScreen } from "../screens/RiderDashboardScreen";
import { RiderRadarScreen } from "../screens/RiderRadarScreen";
import { RiderDeliveriesScreen } from "../screens/RiderDeliveriesScreen";
import { RiderEarningsScreen } from "../screens/RiderEarningsScreen";
import { RiderSafetyScreen } from "../screens/RiderSafetyScreen";
import { RiderVehicleScreen } from "../screens/RiderVehicleScreen";
import { RIDER_COLORS } from "@/features/rider/components/RiderDesignSystem";
import { RiderPortalTab } from "@/features/rider/screens/RiderDashboardView";

export type RiderTab = RiderPortalTab;

export const RiderNavigation: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<RiderTab>("index");

  const renderScreen = () => {
    switch (currentTab) {
      case "index":
        return <RiderDashboardScreen onNavigateTab={setCurrentTab} />;
      case "dispatch":
        return <RiderRadarScreen />;
      case "deliveries":
        return <RiderDeliveriesScreen />;
      case "earnings":
        return <RiderEarningsScreen />;
      case "safety":
        return <RiderSafetyScreen />;
      case "vehicle":
        return <RiderVehicleScreen />;
      default:
        return <RiderDashboardScreen onNavigateTab={setCurrentTab} />;
    }
  };

  const navItems: Array<{
    key: RiderTab;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconActive: keyof typeof Ionicons.glyphMap;
  }> = [
    { key: "index", label: "Duty", icon: "speedometer-outline", iconActive: "speedometer" },
    { key: "dispatch", label: "Radar", icon: "radio-outline", iconActive: "radio" },
    { key: "deliveries", label: "Parcels", icon: "cube-outline", iconActive: "cube" },
    { key: "earnings", label: "Earnings", icon: "wallet-outline", iconActive: "wallet" },
    { key: "safety", label: "Safety", icon: "shield-outline", iconActive: "shield" },
    { key: "vehicle", label: "Vehicle", icon: "car-sport-outline", iconActive: "car-sport" },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.screenContainer}>{renderScreen()}</View>

      <View style={styles.bottomNav}>
        {navItems.map((item) => {
          const active = currentTab === item.key;
          return (
            <Pressable
              key={item.key}
              style={styles.navItem}
              onPress={() => setCurrentTab(item.key)}
            >
              <Ionicons
                name={active ? item.iconActive : item.icon}
                size={20}
                color={active ? RIDER_COLORS.emerald : RIDER_COLORS.textSecondary}
              />
              <Text style={[styles.navText, active && styles.navTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: RIDER_COLORS.bg,
  },
  screenContainer: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: RIDER_COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: RIDER_COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: "space-around",
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  navText: {
    fontSize: 10,
    color: RIDER_COLORS.textSecondary,
    marginTop: 2,
    fontWeight: "600",
  },
  navTextActive: {
    color: RIDER_COLORS.emerald,
    fontWeight: "800",
  },
});
