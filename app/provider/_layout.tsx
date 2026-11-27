import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Tabs, useRouter, usePathname } from "expo-router";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";

const TEAL = "#0D9488";
const TEAL_DARK = "#0F4C40";
const GOLD = "#E5A93C";
const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const BORDER = "#334155";

interface NavItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  route: string;
  name: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", icon: "home-outline", iconActive: "home", route: "/provider", name: "index" },
  { label: "Services", icon: "grid-outline", iconActive: "grid", route: "/provider/services", name: "services" },
  { label: "Schedule", icon: "calendar-outline", iconActive: "calendar", route: "/provider/schedule", name: "schedule" },
  { label: "Earnings", icon: "wallet-outline", iconActive: "wallet", route: "/provider/earnings", name: "earnings" },
  { label: "More", icon: "menu-outline", iconActive: "menu", route: "/provider/more", name: "more" },
];

function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <Ionicons name="compass" size={28} color={TEAL} />
        <Text style={styles.sidebarTitle}>{"Provider\nHub"}</Text>
      </View>
      <ScrollView style={styles.sidebarNav} showsVerticalScrollIndicator={false}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.route || (item.name === "index" && pathname === "/provider");
          return (
            <Pressable
              key={item.name}
              style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
              onPress={() => router.push(item.route as Parameters<typeof router.push>[0])}
            >
              <Ionicons name={isActive ? item.iconActive : item.icon} size={22} color={isActive ? GOLD : "#94A3B8"} />
              <Text style={[styles.sidebarLabel, isActive && styles.sidebarLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function ProviderLayout() {
  const { isDesktop } = useResponsive();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login" as any);
    });
  }, [router]);
  if (isDesktop) {
    return (
      <View style={styles.desktopContainer}>
        <DesktopSidebar />
        <View style={styles.desktopContent}>
          <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: "none" } }}>
            <Tabs.Screen name="index" />
            <Tabs.Screen name="services" />
            <Tabs.Screen name="schedule" />
            <Tabs.Screen name="earnings" />
            <Tabs.Screen name="contract" />
            <Tabs.Screen name="more" />
          </Tabs>
        </View>
      </View>
    );
  }
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: styles.tabBar, tabBarActiveTintColor: TEAL, tabBarInactiveTintColor: "#64748B", tabBarLabelStyle: styles.tabLabel }}>
      <Tabs.Screen name="index" options={{ title: "Dashboard", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="services" options={{ title: "Services", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "grid" : "grid-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="schedule" options={{ title: "Schedule", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="earnings" options={{ title: "Earnings", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "wallet" : "wallet-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "menu" : "menu-outline"} size={22} color={color} /> }} />
      <Tabs.Screen name="contract" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  desktopContainer: { flex: 1, flexDirection: "row", backgroundColor: NAVY },
  sidebar: { width: 180, backgroundColor: NAVY_LIGHT, borderRightWidth: 1, borderRightColor: BORDER },
  sidebarHeader: { padding: 20, paddingTop: 40, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  sidebarTitle: { color: TEAL, fontSize: 14, fontWeight: "700", lineHeight: 18 },
  sidebarNav: { flex: 1, paddingTop: 8 },
  sidebarItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 8, marginVertical: 2, borderRadius: 10 },
  sidebarItemActive: { backgroundColor: TEAL_DARK },
  sidebarLabel: { color: "#94A3B8", fontSize: 13, fontWeight: "500" },
  sidebarLabelActive: { color: GOLD, fontWeight: "700" },
  desktopContent: { flex: 1, backgroundColor: NAVY },
  tabBar: { backgroundColor: NAVY_LIGHT, borderTopColor: BORDER, borderTopWidth: 1, height: 60, paddingBottom: 6 },
  tabLabel: { fontSize: 10, fontWeight: "600" },
});
