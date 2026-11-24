import React, { useEffect, useRef, useMemo, useState } from "react";
import {
  Animated,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../theme/typography";
import { useLanguage } from "../context/LanguageContext";
import { AudioMiniBar } from "../components/audio/AudioMiniBar";
import { useAuthStore } from "../store/authStore";
import { useNotificationStore } from "../store/notificationStore";
import * as Haptics from "expo-haptics";

// ─── Tab Config Matching Reference Screenshots & Clean Expo Router Paths ─────
export const TABS = [
  { label: "Home", name: "index", icon: "home-outline" as const, route: "/(tabs)" },
  {
    label: "Messages",
    name: "messages",
    icon: "mail-outline" as const,
    route: "/(tabs)/messages",
  },
  {
    label: "Community",
    name: "community",
    icon: "people-outline" as const,
    route: "/(tabs)/community",
  },
  {
    label: "My Trips",
    name: "trips",
    icon: "briefcase-outline" as const,
    route: "/(tabs)/trips",
  },
  {
    label: "Account",
    name: "account",
    icon: "person-circle-outline" as const,
    route: "/(tabs)/account",
  },
] as const;

export function getLocalizedTabLabel(t: (k: string, d?: string) => string, label: string): string {
  switch (label) {
    case "Home":
    case "index":
      return t("nav.home", "Home");
    case "Messages":
    case "messages":
      return t("nav.messages", "Messages");
    case "Community":
    case "community":
      return t("nav.community", "Community");
    case "My Trips":
    case "trips":
      return t("nav.trips", "My Trips");
    case "Account":
      return t("nav.account", "Account");
    case "Sign In":
      return t("nav.signIn", "Sign In");
    case "account":
      return t("nav.account", "Account");
    case "Back to top":
      return t("nav.backToTop", "Back to top");
    default:
      return t(label, label);
  }
}

// ─── Floating AI Assistant Pill ───────────────────────────────────────────────
export function AiPill({ color, extraBottomOffset = 0 }: { color: string; extraBottomOffset?: number }) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();

  const insets = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const aiPillBottom = useMemo(
    () => Math.max(insets.bottom, 12) + 54 + extraBottomOffset,
    [insets.bottom, extraBottomOffset]
  );

  const goldAccent = isDark ? "#ECC46E" : "#C59B27";

  return (
    <Animated.View
      style={[
        styles.aiWrap,
        {
          bottom: aiPillBottom,
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={({ pressed }) => [
          styles.aiPillContainer,
          {
            backgroundColor: isDark ? "rgba(22, 22, 26, 0.94)" : "rgba(255, 255, 255, 0.97)",
            borderColor: isDark ? "rgba(236, 196, 110, 0.35)" : "rgba(197, 155, 39, 0.3)",
            shadowColor: goldAccent,
          },
          pressed && styles.aiPillPressed,
        ]}
        onPress={() => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch {}
          router.push("/screens/trip-planner" as any);
        }}
      >
        {/* Left: Waveform animation / bars */}
        <View style={styles.waveformWrap}>
          <View style={[styles.waveBar, { height: 7, backgroundColor: goldAccent }]} />
          <View style={[styles.waveBar, { height: 13, backgroundColor: goldAccent }]} />
          <View style={[styles.waveBar, { height: 18, backgroundColor: goldAccent }]} />
          <View style={[styles.waveBar, { height: 10, backgroundColor: goldAccent }]} />
          <View style={[styles.waveBar, { height: 15, backgroundColor: goldAccent }]} />
          <View style={[styles.waveBar, { height: 8, backgroundColor: goldAccent }]} />
        </View>

        {/* Center: Stylized Robot face + Text */}
        <View style={styles.aiCenterRow}>
          <View style={[styles.robotIconContainer, { backgroundColor: isDark ? "#28251D" : "#F3EBDD" }]}>
            <View style={styles.robotAntenna} />
            <View style={styles.robotFace}>
              <View style={styles.robotEye} />
              <View style={styles.robotEye} />
            </View>
          </View>
          <Text
            style={[
              styles.aiText,
              { color: isDark ? "#E5E5E5" : "#1A1A1A" },
            ]}
            numberOfLines={1}
          >
            {t("nav.askAi", "Ask AI or hold to speak")}
          </Text>
        </View>

        {/* Right: Golden Microphone Button */}
        <View style={styles.micCircle}>
          <LinearGradient
            colors={isDark ? ["#ECC46E", "#C59B27"] : ["#E5C369", "#B8860B"]}
            style={styles.micGradient}
          >
            <Ionicons name="mic" size={17} color="#FFFFFF" />
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Official Custom Bottom Tab Bar for React Navigation / Expo Router ────────
export function CustomBottomTabBar(props: BottomTabBarProps) {
  const [isAudioMiniBarVisible, setIsAudioMiniBarVisible] = useState(false);
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const { state, descriptors, navigation, insets } = props;
  const currentRoute = state.routes[state.index];
  const currentOptions = descriptors[currentRoute.key]?.options;

  // 1. Hide on deep screen if tabBarStyle has display: "none"
  const tabBarStyle = currentOptions?.tabBarStyle as any;
  if (tabBarStyle?.display === "none") {
    return null;
  }

  // 2. Keyboard visibility awareness: automatically hide when keyboard is shown
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardVisible && currentOptions?.tabBarHideOnKeyboard !== false) {
    return null;
  }

  // Visible tabs only: exactly the 5 primary tabs defined in TABS
  const visibleRoutes = state.routes.filter((route) =>
    TABS.some((t) => t.name === route.name)
  );

  return (
    <>
      <AiPill color={colors.primary} extraBottomOffset={isAudioMiniBarVisible ? 58 : 0} />
      <View
        style={[
          styles.navContainer,
          { backgroundColor: colors.tabBarBg, borderTopColor: colors.tabBarBorder },
        ]}
      >
        <View
          style={[
            styles.bottomNav,
            { backgroundColor: colors.tabBarBg, paddingBottom: Math.max(insets.bottom, 8) },
          ]}
        >
          <View style={styles.tabWrapper}>
            {visibleRoutes.map((route) => {
              const routeIndex = state.routes.indexOf(route);
              const isFocused = state.index === routeIndex;
              const options = descriptors[route.key]?.options;

              // Find tab configuration or match by name
              const tabConfig =
                TABS.find((t) => t.name === route.name) || {
                  label: options?.title ?? route.name,
                  name: route.name,
                  icon: "ellipse-outline" as const,
                  route: `/(tabs)/${route.name}` as any,
                };

              const accountLabel = isAuthenticated ? "Account" : "Sign In";
              const rawLabel = options?.title ?? (route.name === "account" ? accountLabel : tabConfig.label);
              const displayLabel = getLocalizedTabLabel(t, rawLabel);
              const badge = route.name === "messages"
                ? (options?.tabBarBadge ?? (unreadCount > 0 ? unreadCount : undefined))
                : options?.tabBarBadge;

              const onPress = () => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              };

              const onLongPress = () => {
                navigation.emit({
                  type: "tabLongPress",
                  target: route.key,
                });
              };

              const isHomeTab = tabConfig.name === "index" || tabConfig.label === "Home";
              const goldColor = isDark ? "#ECC46E" : "#C59B27";
              const inactiveColor = isDark ? "#8E8E93" : "#64748B";
              const activeColor = isHomeTab ? goldColor : (isDark ? "#FFFFFF" : colors.primary);
              const tabColor = isFocused ? activeColor : inactiveColor;
              const tabIconName = isFocused && (tabConfig as any).activeIcon
                ? (tabConfig as any).activeIcon
                : (isFocused && isHomeTab ? "home" : tabConfig.icon);

              return (
                <Pressable
                  key={route.key}
                  style={styles.bottomItem}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  accessibilityLabel={options?.tabBarAccessibilityLabel ?? displayLabel}
                  hitSlop={8}
                >
                  <View style={styles.tabContentCenter}>
                    <View style={styles.iconContainer}>
                      <Ionicons
                        name={tabIconName}
                        size={22}
                        color={tabColor}
                      />
                      {badge != null && (
                        <View style={styles.badgeContainer}>
                          <Text style={styles.badgeText}>
                            {typeof badge === "number" && badge > 99 ? "99+" : String(badge)}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text
                      style={[
                        styles.bottomLabel,
                        {
                          color: tabColor,
                          fontWeight: isFocused ? "700" : "500",
                          fontFamily: FONTS.bengali.medium,
                          fontSize: 11,
                        },
                      ]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {displayLabel}
                    </Text>

                    {isHomeTab && isFocused && (
                      <View
                        style={[
                          styles.homeActiveIndicator,
                          { backgroundColor: goldColor },
                        ]}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.homeIndicator, { backgroundColor: isDark ? "#333333" : "#D1D5DB" }]} />
        </View>
      </View>
    </>
  );
}

// ─── Legacy Bottom Navigation Bar for Direct In-Screen Standalone Usage ───────
export function BottomNav({
  active,
  color,
  isScrolled,
  onScrollToTop,
}: {
  active: string;
  color?: string;
  isScrolled?: boolean;
  onScrollToTop?: () => void;
}) {
  const { colors } = useTheme();
  const activeColor = color || colors.primary;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabWidth = (width - 16) / TABS.length;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const index = TABS.findIndex((tab) =>
      tab.label === active ||
      tab.name === active.toLowerCase() ||
      (tab.name === "account" && (active === "Account" || active === "Sign In"))
    );
    if (index !== -1) {
      Animated.spring(translateX, {
        toValue: index * tabWidth,
        useNativeDriver: true,
        friction: 10,
        tension: 60,
      }).start();
    }
  }, [active, tabWidth]);

  return (
    <View
      style={[
        styles.navContainer,
        { backgroundColor: colors.tabBarBg, borderTopColor: colors.tabBarBorder },
      ]}
    >
      <View
        style={[
          styles.bottomNav,
          { backgroundColor: colors.tabBarBg, paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        <View style={styles.tabWrapper}>
          {TABS.map((tab) => {
            const selected = tab.label === active;
            return (
              <TabItem
                key={tab.label}
                tab={tab}
                selected={selected}
                color={activeColor}
                isScrolled={isScrolled}
                onScrollToTop={onScrollToTop}
              />
            );
          })}
        </View>
        <View
          style={[
            styles.homeIndicator,
            { backgroundColor: colors.borderStrong },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Individual Tab Item with Morphing Back to Top Logic ─────────────────────
interface TabItemProps {
  key?: React.Key;
  tab: any;
  selected: boolean;
  color: string;
  isScrolled?: boolean;
  onScrollToTop?: () => void;
}

function TabItem({ tab, selected, color, isScrolled, onScrollToTop }: TabItemProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const isHomeTab = tab.label === "Home";
  const isScrolledActive = selected && isScrolled;
  const fallbackLabel = tab.name === "account" ? (isAuthenticated ? "Account" : "Sign In") : tab.label;
  const rawLabel = isScrolledActive ? "Back to top" : fallbackLabel;
  const displayLabel = getLocalizedTabLabel(t, rawLabel);

  const handlePress = () => {
    if (isScrolledActive && onScrollToTop) {
      onScrollToTop();
    } else {
      router.push(tab.route as any);
    }
  };

  return (
    <Pressable style={styles.bottomItem} onPress={handlePress} hitSlop={8}>
      <View style={styles.tabContentCenter}>
        {isScrolledActive ? (
          <View style={[styles.backToTopCircle, { backgroundColor: colors.accent }]}>
            <Ionicons name="arrow-up" size={16} color="#FFFFFF" />
          </View>
        ) : (
          <View style={styles.iconContainer}>
            <Ionicons
              name={tab.icon}
              size={22}
              color={selected ? colors.primary : colors.textMuted}
            />
            {isHomeTab && selected && (
              <View
                style={[
                  styles.homeYellowRoofDot,
                  { borderColor: colors.tabBarBg },
                ]}
              />
            )}
          </View>
        )}

        <Text
          style={[
            styles.bottomLabel,
            {
              color: isScrolledActive ? colors.primary : selected ? colors.primary : colors.textMuted,
              fontWeight: selected || isScrolledActive ? "800" : "500",
              fontFamily: FONTS.bengali.medium,
              fontSize: 12,
            },
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {displayLabel}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  aiWrap: {
    alignItems: "center",
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 1000,
  },
  aiPillContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "88%",
    maxWidth: 360,
    height: 48,
    borderRadius: 24,
    paddingLeft: 12,
    paddingRight: 6,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    ...(Platform.OS === "web" ? { boxShadow: "0px 3px 12px rgba(184, 134, 11, 0.16)" } : {}),
  },
  aiPillPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  waveformWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5,
    paddingLeft: 2,
    height: 20,
  },
  waveBar: {
    width: 2.5,
    borderRadius: 1.5,
  },
  aiCenterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  robotIconContainer: {
    width: 24,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.4)",
  },
  robotAntenna: {
    width: 4,
    height: 2,
    backgroundColor: "#C59B27",
    borderRadius: 1,
    marginBottom: 1,
  },
  robotFace: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  robotEye: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#222222",
  },
  aiText: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  micCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
  },
  micGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  homeActiveIndicator: {
    width: 22,
    height: 2.5,
    borderRadius: 1.5,
    marginTop: 2,
  },
  navContainer: {
    left: 0,
    right: 0,
    bottom: 0,
    position: "absolute",
    zIndex: 999,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  bottomNav: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  tabWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    height: 56,
    width: "100%",
    paddingHorizontal: 8,
  },
  bottomItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  tabContentCenter: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  iconContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  homeYellowRoofDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#FACC15",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  badgeContainer: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#EF4444",
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },
  backToTopCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#EAB308",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#EAB308",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
    ...(Platform.OS === "web" ? { boxShadow: "0px 2px 4px rgba(15, 23, 42, 0.3)" } : {}),
  },
  bottomLabel: {
    fontSize: 12,
    lineHeight: 14,
    textAlign: "center",
  },
  homeIndicator: {
    height: 4,
    backgroundColor: "#D1D5DB",
    width: "36%",
    alignSelf: "center",
    marginBottom: 4,
    borderRadius: 2,
  },
});
