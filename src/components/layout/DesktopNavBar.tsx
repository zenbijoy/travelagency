import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "../../theme";
import { useAuthStore } from "../../store/authStore";
import { useNotificationStore } from "../../store/notificationStore";
import { useLanguage } from "../../context/LanguageContext";
import { useSettingsStore } from "../../store/settingsStore";
import { useResponsive } from "../../hooks/useResponsive";

export interface DesktopNavBarProps {
  currentRoute?: string;
}

export const DesktopNavBar: React.FC<DesktopNavBarProps> = () => {
  const { isDesktop } = useResponsive();
  const { theme, isDark, toggleTheme } = useTheme();
  const { t, language, changeLanguage, isBengali } = useLanguage();
  const { currency, setCurrency } = useSettingsStore();
  const pathname = usePathname();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isAdmin = useAuthStore((s) => s.is_admin);
  const isAgency = useAuthStore((s) => s.is_agency);
  const logout = useAuthStore((s) => s.logout);

  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);

  // If not desktop/laptop screen width, do not render desktop header
  if (!isDesktop) {
    return null;
  }

  const navLinks = [
    { label: isBengali ? "হোম" : "Home", route: "/(tabs)", icon: "home-outline" },
    { label: isBengali ? "হোটেল ও রিসোর্ট" : "Stays & Hotels", route: "/screens/search-stays", icon: "bed-outline" },
    { label: isBengali ? "ফ্লাইট" : "Flights", route: "/screens/flights", icon: "airplane-outline" },
    { label: isBengali ? "বাস ও লঞ্চ" : "Bus & Launch", route: "/screens/bus-launch", icon: "boat-outline" },
    { label: isBengali ? "ট্যুর গাইড" : "Tour Guides", route: "/screens/tour-guides", icon: "compass-outline" },
    { label: isBengali ? "ট্রাভেল বাডি" : "Travel Buddy", route: "/screens/travel-match", icon: "people-outline" },
    { label: isBengali ? "কমিউনিটি" : "Community", route: "/(tabs)/community", icon: "chatbubbles-outline" },
    { label: isBengali ? "আমার ট্রিপ" : "My Trips", route: "/(tabs)/trips", icon: "briefcase-outline" },
  ];

  const handleNav = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  const toggleLanguage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    changeLanguage(language === "bn" ? "en" : "bn");
  };

  const toggleCurrency = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrency(currency === "BDT" ? "USD" : "BDT");
  };

  const handleLogout = async () => {
    setProfileMenuVisible(false);
    await logout();
    router.replace("/(tabs)" as any);
  };

  const avatarUrl =
    profile?.avatar_url ||
    user?.user_metadata?.avatar_url ||
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80";

  const displayName = profile?.full_name || user?.user_metadata?.full_name || (user?.email?.split("@")[0] ?? "Traveler");

  return (
    <View
      style={[
        styles.headerWrapper,
        {
          backgroundColor: isDark ? "#0A1120" : "#FFFFFF",
          borderBottomColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#E2E8F0",
        },
      ]}
    >
      <View style={styles.headerContainer}>
        {/* 1. BRAND LOGO & BADGE */}
        <Pressable
          style={styles.brandRow}
          onPress={() => handleNav("/(tabs)")}
          accessibilityRole="button"
          accessibilityLabel="ShopnoJatra Home"
        >
          <View style={styles.brandIconCircle}>
            <Ionicons name="paper-plane" size={17} color="#0055F2" style={{ transform: [{ rotate: "-20deg" }] }} />
          </View>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.brandTitle, { color: isDark ? "#FFFFFF" : "#0F172A" }]}>
                ShopnoJatra
              </Text>
              <View style={styles.webBadge}>
                <Text style={styles.webBadgeText}>WEB PORTAL</Text>
              </View>
            </View>
            <Text style={[styles.brandSubtitle, { color: isDark ? "#94A3B8" : "#64748B" }]}>
              {isBengali ? "স্বপ্নযাত্রা ট্রাভেল ইকোসিস্টেম" : "Smart Travel Ecosystem"}
            </Text>
          </View>
        </Pressable>

        {/* 2. DESKTOP NAVIGATION LINKS */}
        <View style={styles.navLinksRow}>
          {navLinks.map((item) => {
            const isActive = pathname === item.route || (item.route === "/(tabs)" && pathname === "/");
            return (
              <Pressable
                key={item.route}
                style={[
                  styles.navLinkItem,
                  isActive && [
                    styles.navLinkItemActive,
                    { borderBottomColor: theme.gold, backgroundColor: isDark ? "rgba(229, 169, 60, 0.08)" : "rgba(229, 169, 60, 0.1)" },
                  ],
                ]}
                onPress={() => handleNav(item.route)}
                accessibilityRole="link"
              >
                <Ionicons
                  name={item.icon as any}
                  size={15}
                  color={isActive ? theme.gold : isDark ? "#94A3B8" : "#475569"}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.navLinkText,
                    {
                      color: isActive ? theme.gold : isDark ? "#E2E8F0" : "#334155",
                      fontWeight: isActive ? "700" : "500",
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* 3. RIGHT UTILITIES & AUTH */}
        <View style={styles.rightGroup}>
          {/* Quick Search Shortcut */}
          <Pressable
            style={[
              styles.quickSearchBtn,
              {
                backgroundColor: isDark ? "#1E293B" : "#F1F5F9",
                borderColor: isDark ? "#334155" : "#E2E8F0",
              },
            ]}
            onPress={() => handleNav("/screens/search")}
            accessibilityLabel="Search"
          >
            <Ionicons name="search" size={14} color={isDark ? "#94A3B8" : "#64748B"} style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 12, color: isDark ? "#94A3B8" : "#64748B" }}>
              {isBengali ? "অনুসন্ধান..." : "Search..."}
            </Text>
          </Pressable>

          {/* Currency Toggle */}
          <Pressable
            style={[
              styles.pillButton,
              {
                backgroundColor: isDark ? "#1E293B" : "#F8FAFC",
                borderColor: isDark ? "#334155" : "#E2E8F0",
              },
            ]}
            onPress={toggleCurrency}
            accessibilityLabel="Switch Currency"
          >
            <Text style={[styles.pillButtonText, { color: theme.gold }]}>
              {currency === "BDT" ? "৳ BDT" : "$ USD"}
            </Text>
          </Pressable>

          {/* Language Toggle */}
          <Pressable
            style={[
              styles.pillButton,
              {
                backgroundColor: isDark ? "#1E293B" : "#F8FAFC",
                borderColor: isDark ? "#334155" : "#E2E8F0",
              },
            ]}
            onPress={toggleLanguage}
            accessibilityLabel="Switch Language"
          >
            <Text style={[styles.pillButtonText, { color: isDark ? "#CBD5E1" : "#334155" }]}>
              {language === "bn" ? "বাংলা" : "EN"}
            </Text>
          </Pressable>

          {/* Theme Toggle */}
          <Pressable
            style={[
              styles.iconBtn,
              {
                backgroundColor: isDark ? "#1E293B" : "#F8FAFC",
                borderColor: isDark ? "#334155" : "#E2E8F0",
              },
            ]}
            onPress={toggleTheme}
            accessibilityLabel="Toggle Theme"
          >
            <Ionicons
              name={isDark ? "sunny-outline" : "moon-outline"}
              size={17}
              color={isDark ? "#FBBF24" : "#475569"}
            />
          </Pressable>

          {/* Notification Bell */}
          <Pressable
            style={[
              styles.iconBtn,
              {
                backgroundColor: isDark ? "#1E293B" : "#F8FAFC",
                borderColor: isDark ? "#334155" : "#E2E8F0",
              },
            ]}
            onPress={() => handleNav("/screens/settings")}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={17} color={isDark ? "#CBD5E1" : "#475569"} />
            {unreadCount > 0 && (
              <View style={styles.unreadDot}>
                <Text style={styles.unreadDotText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            )}
          </Pressable>

          {/* Auth Button or User Menu */}
          {isAuthenticated ? (
            <View style={{ position: "relative" }}>
              <Pressable
                style={[
                  styles.profilePill,
                  {
                    backgroundColor: isDark ? "#1E293B" : "#F1F5F9",
                    borderColor: isDark ? "#334155" : "#E2E8F0",
                  },
                ]}
                onPress={() => setProfileMenuVisible(!profileMenuVisible)}
                accessibilityLabel="User Menu"
              >
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                <Text style={[styles.profileName, { color: isDark ? "#F1F5F9" : "#0F172A" }]} numberOfLines={1}>
                  {displayName}
                </Text>
                <Ionicons name="chevron-down" size={14} color={isDark ? "#94A3B8" : "#64748B"} />
              </Pressable>

              {/* Dropdown Menu Modal */}
              {profileMenuVisible && (
                <Modal
                  transparent
                  visible={profileMenuVisible}
                  animationType="fade"
                  onRequestClose={() => setProfileMenuVisible(false)}
                >
                  <Pressable style={styles.modalBackdrop} onPress={() => setProfileMenuVisible(false)}>
                    <View
                      style={[
                        styles.dropdownCard,
                        {
                          backgroundColor: isDark ? "#1E293B" : "#FFFFFF",
                          borderColor: isDark ? "#334155" : "#E2E8F0",
                        },
                      ]}
                    >
                      <View style={styles.dropdownHeader}>
                        <Text style={[styles.dropdownName, { color: isDark ? "#FFFFFF" : "#0F172A" }]}>
                          {displayName}
                        </Text>
                        <Text style={[styles.dropdownEmail, { color: isDark ? "#94A3B8" : "#64748B" }]}>
                          {user?.email || "user@shopnojatra.com"}
                        </Text>
                      </View>

                      <View style={[styles.dropdownDivider, { backgroundColor: isDark ? "#334155" : "#E2E8F0" }]} />

                      <Pressable
                        style={styles.dropdownItem}
                        onPress={() => {
                          setProfileMenuVisible(false);
                          handleNav("/(tabs)/account");
                        }}
                      >
                        <Ionicons name="person-outline" size={16} color="#3B82F6" />
                        <Text style={[styles.dropdownItemText, { color: isDark ? "#E2E8F0" : "#1E293B" }]}>
                          {isBengali ? "আমার প্রোফাইল ও অ্যাকাউন্ট" : "My Profile & Account"}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={styles.dropdownItem}
                        onPress={() => {
                          setProfileMenuVisible(false);
                          handleNav("/(tabs)/trips");
                        }}
                      >
                        <Ionicons name="briefcase-outline" size={16} color="#10B981" />
                        <Text style={[styles.dropdownItemText, { color: isDark ? "#E2E8F0" : "#1E293B" }]}>
                          {isBengali ? "আমার বুকিং ও ট্রিপ" : "My Bookings & Trips"}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={styles.dropdownItem}
                        onPress={() => {
                          setProfileMenuVisible(false);
                          handleNav("/screens/saved");
                        }}
                      >
                        <Ionicons name="heart-outline" size={16} color="#EF4444" />
                        <Text style={[styles.dropdownItemText, { color: isDark ? "#E2E8F0" : "#1E293B" }]}>
                          {isBengali ? "সংরক্ষিত স্থান ও হোটেল" : "Saved Wishlist"}
                        </Text>
                      </Pressable>

                      {(isAdmin || isAgency) && (
                        <Pressable
                          style={styles.dropdownItem}
                          onPress={() => {
                            setProfileMenuVisible(false);
                            handleNav(isAdmin ? "/admin" : "/agency");
                          }}
                        >
                          <MaterialCommunityIcons name="shield-crown" size={16} color="#F59E0B" />
                          <Text style={[styles.dropdownItemText, { color: isDark ? "#E2E8F0" : "#1E293B" }]}>
                            {isAdmin ? "Admin Console" : "B2B Agency Portal"}
                          </Text>
                        </Pressable>
                      )}

                      <View style={[styles.dropdownDivider, { backgroundColor: isDark ? "#334155" : "#E2E8F0" }]} />

                      <Pressable style={styles.dropdownItem} onPress={handleLogout}>
                        <Ionicons name="log-out-outline" size={16} color="#EF4444" />
                        <Text style={[styles.dropdownItemText, { color: "#EF4444", fontWeight: "600" }]}>
                          {isBengali ? "লগআউট" : "Sign Out"}
                        </Text>
                      </Pressable>
                    </View>
                  </Pressable>
                </Modal>
              )}
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                style={[
                  styles.signInBtn,
                  {
                    backgroundColor: theme.gold,
                  },
                ]}
                onPress={() => handleNav("/(auth)/login")}
              >
                <Text style={styles.signInBtnText}>
                  {isBengali ? "লগইন" : "Sign In"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerWrapper: {
    width: "100%",
    borderBottomWidth: 1,
    zIndex: 1000,
    ...(Platform.OS === "web"
      ? ({
          position: "sticky",
          top: 0,
          boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        } as any)
      : {}),
  },
  headerContainer: {
    width: "100%",
    maxWidth: 1360,
    alignSelf: "center",
    paddingHorizontal: 24,
    height: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginRight: 20,
  },
  brandIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  webBadge: {
    backgroundColor: "rgba(229, 169, 60, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(229, 169, 60, 0.3)",
  },
  webBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#D97706",
  },
  brandSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  navLinksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  navLinkItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    transitionDuration: "150ms",
  } as any,
  navLinkItemActive: {
    borderBottomWidth: 2,
  },
  navLinkText: {
    fontSize: 13,
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quickSearchBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    width: 130,
  },
  pillButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  pillButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  unreadDot: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#EF4444",
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  unreadDotText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  profilePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  avatarImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  profileName: {
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 90,
  },
  signInBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  signInBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 74,
    paddingRight: 24,
  },
  dropdownCard: {
    width: 260,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  dropdownHeader: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  dropdownName: {
    fontSize: 14,
    fontWeight: "700",
  },
  dropdownEmail: {
    fontSize: 11,
    marginTop: 2,
  },
  dropdownDivider: {
    height: 1,
    marginVertical: 8,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  dropdownItemText: {
    fontSize: 13,
  },
});
