import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { Tabs, useRouter, usePathname } from "expo-router";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";

const NAVY = "#0F172A";
const GOLD = "#E5A93C";
const NAVY_LIGHT = "#1E293B";

interface NavItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  route: string;
  name: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    icon: "home-outline",
    iconActive: "home",
    route: "/hotel",
    name: "index",
  },
  {
    label: "Rooms",
    icon: "bed-outline",
    iconActive: "bed",
    route: "/hotel/rooms",
    name: "rooms",
  },
  {
    label: "Bookings",
    icon: "calendar-outline",
    iconActive: "calendar",
    route: "/hotel/bookings",
    name: "bookings",
  },
  {
    label: "Revenue",
    icon: "stats-chart-outline",
    iconActive: "stats-chart",
    route: "/hotel/revenue",
    name: "revenue",
  },
  {
    label: "More",
    icon: "menu-outline",
    iconActive: "menu",
    route: "/hotel/more",
    name: "more",
  },
];

function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <Ionicons name="business" size={28} color={GOLD} />
        <Text style={styles.sidebarTitle}>Hotel{"\n"}Manager</Text>
      </View>
      <ScrollView style={styles.sidebarNav} showsVerticalScrollIndicator={false}>
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.route ||
            (item.name === "index" && pathname === "/hotel");
          return (
            <Pressable
              key={item.name}
              style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
              onPress={() => router.push(item.route as Parameters<typeof router.push>[0])}
            >
              <Ionicons
                name={isActive ? item.iconActive : item.icon}
                size={22}
                color={isActive ? GOLD : "#94A3B8"}
              />
              <Text
                style={[
                  styles.sidebarLabel,
                  isActive && styles.sidebarLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function HotelLayout() {
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
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: "none" },
            }}
          >
            <Tabs.Screen name="index" />
            <Tabs.Screen name="rooms" />
            <Tabs.Screen name="bookings" />
            <Tabs.Screen name="calendar" />
            <Tabs.Screen name="revenue" />
            <Tabs.Screen name="contract" />
            <Tabs.Screen name="more" />
          </Tabs>
        </View>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: "#64748B",
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="rooms"
        options={{
          title: "Rooms",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "bed" : "bed-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Bookings",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "calendar" : "calendar-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="revenue"
        options={{
          title: "Revenue",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "stats-chart" : "stats-chart-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "menu" : "menu-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="contract" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  desktopContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: NAVY,
  },
  sidebar: {
    width: 180,
    backgroundColor: NAVY_LIGHT,
    borderRightWidth: 1,
    borderRightColor: "#334155",
  },
  sidebarHeader: {
    padding: 20,
    paddingTop: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  sidebarTitle: {
    color: GOLD,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  sidebarNav: {
    flex: 1,
    paddingTop: 8,
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 10,
  },
  sidebarItemActive: {
    backgroundColor: "#1E3A5F",
  },
  sidebarLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "500",
  },
  sidebarLabelActive: {
    color: GOLD,
    fontWeight: "700",
  },
  desktopContent: {
    flex: 1,
    backgroundColor: NAVY,
  },
  tabBar: {
    backgroundColor: NAVY_LIGHT,
    borderTopColor: "#334155",
    borderTopWidth: 1,
    height: 60,
    paddingBottom: 6,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
});
