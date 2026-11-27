import React, { useState, useCallback, useMemo } from "react";
import {
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../hooks/useAuth";
import { BRAND } from "../constants/brand";
import { useNotificationStore } from "../store/notificationStore";
import { FONTS } from "../theme/typography";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── COLOR PALETTE TOKENS ────────────────────────────────────────────────────
const GOLD = {
  primary: "#D4AF37",
  light: "#FFE58F",
  dark: "#99731C",
  accent: "#ECC46E",
  champagneBg: "#FAF5EC",
  champagneBorder: "#E8D9BD",
  iconBg: "#F3E8D3",
  iconDark: "#382A14",
  badgeBg: "#FFE699",
  badgeText: "#3B2C04",
};

// ─── SERVICES CONFIGURATION ──────────────────────────────────────────────────
interface ServiceItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const ROW_1_SERVICES: ServiceItem[] = [
  { id: "hotels", label: "Hotels", icon: "bed", route: "/screens/hotels-homes" },
  { id: "flights", label: "Flights", icon: "airplane", route: "/screens/flights" },
  { id: "flight_hotel", label: "Flight + Hotel", icon: "business", route: "/screens/packages" },
  { id: "trains", label: "Trains", icon: "train", route: "/screens/trains" },
];

const ROW_2_SERVICES: ServiceItem[] = [
  { id: "vacation_rentals", label: "Vacation\nRentals", icon: "home", route: "/screens/hotels-homes" },
  { id: "attractions_tours", label: "Attractions\n& Tours", icon: "people", route: "/screens/recommended-tours" },
  { id: "car_rentals", label: "Car Rentals", icon: "car", route: "/screens/car-rentals" },
  { id: "package_tours", label: "Package\nTours", icon: "earth", route: "/screens/packages" },
  { id: "more", label: "More", icon: "apps", route: "modal" },
];

const MORE_SERVICES: Array<{
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}> = [
  {
    id: "bus-launch",
    title: "Bus & Launch",
    subtitle: "AC coaches, sleeper & river ferries",
    icon: "bus-outline",
    route: "/screens/bus-launch",
  },
  {
    id: "admission-bus",
    title: "Admission Bus",
    subtitle: "Student university & exam shuttles",
    icon: "school-outline",
    route: "/screens/admission-bus",
  },
  {
    id: "tour-guides",
    title: "Tour Guides",
    subtitle: "Certified local multilingual guides",
    icon: "compass-outline",
    route: "/screens/tour-guides",
  },
  {
    id: "abroad-agency",
    title: "Abroad Agency",
    subtitle: "Visa processing & global consulting",
    icon: "globe-outline",
    route: "/screens/abroad-agency",
  },
  {
    id: "ride-hailing",
    title: "Ride-Hailing & Mobility",
    subtitle: "Instant bike, CNG, sedan & airport chauffeur",
    icon: "car-sport-outline",
    route: "/screens/car-rentals",
  },
  {
    id: "local-marketplace",
    title: "Local Marketplace",
    subtitle: "Authentic artisan goods & gear",
    icon: "bag-handle-outline",
    route: "/screens/local-marketplace",
  },
  {
    id: "rider-portal",
    title: "Rider & Delivery Partner",
    subtitle: "Driver shift cockpit & earnings radar",
    icon: "bicycle-outline",
    route: "/rider",
  },
  {
    id: "hotel-pms",
    title: "Hotel PMS & Partner Portal",
    subtitle: "Tape chart, room matrix, housekeeping & folios",
    icon: "business-outline",
    route: "/hotel",
  },
  {
    id: "digital-passport",
    title: "Digital Passport",
    subtitle: "Secure encrypted travel wallet",
    icon: "card-outline",
    route: "/screens/digital-passport",
  },
  {
    id: "off-grid-mesh",
    title: "Off-Grid Mesh",
    subtitle: "P2P BLE trail radar & zero-net chat",
    icon: "radio-outline",
    route: "/screens/off-grid-mesh",
  },
  {
    id: "emergency",
    title: "Emergency SOS",
    subtitle: "24/7 Police, Medical & Embassy hotline",
    icon: "shield-checkmark-outline",
    route: "/screens/emergency",
  },
];

// ─── QUICK DESTINATION CHIPS ─────────────────────────────────────────────────
interface DestinationChip {
  id: string;
  name: string;
  imageUrl: string;
}

const DESTINATION_CHIPS: DestinationChip[] = [
  {
    id: "lalmonirhat",
    name: "Lalmonirhat",
    imageUrl: "https://images.unsplash.com/photo-1608958435020-e8a7109ba809?w=120&auto=format&fit=crop&q=80",
  },
  {
    id: "beijing",
    name: "Beijing",
    imageUrl: "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=120&auto=format&fit=crop&q=80",
  },
  {
    id: "shanghai",
    name: "Shanghai",
    imageUrl: "https://images.unsplash.com/photo-1538428494232-9c0d8a3ab403?w=120&auto=format&fit=crop&q=80",
  },
  {
    id: "singapore",
    name: "Singapore",
    imageUrl: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=120&auto=format&fit=crop&q=80",
  },
  {
    id: "coxs_bazar",
    name: "Cox's Bazar",
    imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=120&auto=format&fit=crop&q=80",
  },
  {
    id: "sylhet",
    name: "Sylhet",
    imageUrl: "https://images.unsplash.com/photo-1588668214407-6ea9a6d8c272?w=120&auto=format&fit=crop&q=80",
  },
];

// ─── SECONDARY ACTION ICONS ──────────────────────────────────────────────────
interface ActionIconItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const ACTION_ICONS: ActionIconItem[] = [
  { id: "deals", label: "Deals", icon: "pricetag", route: "/screens/rewards" },
  { id: "events", label: "Events", icon: "calendar", route: "/screens/events" },
  { id: "planner", label: "Shopno Planner", icon: "flash", route: "/screens/trip-planner" },
  { id: "trending", label: "Trending", icon: "trending-up", route: "/screens/recommended-tours" },
];

// ─── DISCOVER CARDS ──────────────────────────────────────────────────
interface DiscoverCard {
  id: string;
  badge?: string;
  pageIndicator?: string;
  verified?: boolean;
  titlePrimary: string;
  titleAccent?: string;
  subtitle: string;
  promoTag?: string;
  buttonLabel: string;
  imageUrl: string;
  route: string;
}

const DISCOVER_CARDS: DiscoverCard[] = [
  {
    id: "explore_asia",
    badge: "FEATURED",
    pageIndicator: "1/3",
    titlePrimary: "Explore",
    titleAccent: "Asia",
    subtitle: "Unforgettable journeys across Asia",
    promoTag: "🎁 Special Offers & Deals",
    buttonLabel: "View Deals →",
    imageUrl: "https://images.unsplash.com/photo-1528127269322-539801943592?w=600&auto=format&fit=crop&q=80",
    route: "/screens/packages",
  },
  {
    id: "tuesday_deals",
    verified: true,
    badge: "WEEKLY DROP",
    pageIndicator: "2/3",
    titlePrimary: "Tuesday",
    titleAccent: "Deals",
    subtitle: "Up to 35% off regional flights & getaways",
    promoTag: "✈ Limited Fare Alert",
    buttonLabel: "Explore Flights →",
    imageUrl: "https://images.unsplash.com/photo-1436491865332-7a61a109c0f3?w=600&auto=format&fit=crop&q=80",
    route: "/screens/flights",
  },
  {
    id: "curated_bengal",
    badge: "LOCAL PICK",
    pageIndicator: "3/3",
    titlePrimary: "Cox's Bazar",
    titleAccent: "& Sylhet",
    subtitle: "Curated boutique villas & tea-garden retreats",
    promoTag: "🏝 Instant Confirmation",
    buttonLabel: "Discover Stays →",
    imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80",
    route: "/screens/hotels-homes",
  },
];

// ─── MAIN HOMESCREEN COMPONENT ───────────────────────────────────────────────
export function HomeScreen() {
  const { colors, isDark } = useTheme();
  const { user, refreshSession } = useAuth();
  const unreadNotifs = useNotificationStore((s) => s.unreadCount);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMoreModalOpen, setIsMoreModalOpen] = useState(false);

  const displayName =
    user?.user_metadata?.full_name ||
    (user?.email ? user.email.split("@")[0] : "");
  const userInitial = displayName ? displayName.trim()[0].toUpperCase() : "";

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    try {
      const tasks: Array<Promise<any>> = [refreshSession()];
      if (user?.id) {
        tasks.push(fetchNotifications(user.id));
      }
      await Promise.allSettled(tasks);
    } finally {
      setIsRefreshing(false);
    }
  }, [user?.id, refreshSession, fetchNotifications]);

  const handleServicePress = (route: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (route === "modal") {
      setIsMoreModalOpen(true);
    } else {
      router.push(route as any);
    }
  };

  const handleDestinationPress = (destinationName: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    router.push({
      pathname: "/screens/search" as any,
      params: { q: destinationName },
    });
  };

  const handleActionPress = (route: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    router.push(route as any);
  };

  const shellBg = isDark ? colors.background : "#F8F9FA";

  // Service grid card styling
  const serviceCardBg = isDark ? colors.card : "#FFFFFF";
  const serviceCardBorder = isDark ? colors.border : "#FFFFFF";
  const serviceLabelColor = isDark ? colors.text : "#1F2937";

  return (
    <SafeAreaView style={[styles.shell, { backgroundColor: shellBg }]} edges={["top"]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={GOLD.primary}
            colors={[GOLD.primary]}
          />
        }
      >
        {/* ================================================================== */}
        {/* 1. NATIVE ATMOSPHERIC HERO HEADER                                  */}
        {/* ================================================================== */}
        <LinearGradient
          colors={
            isDark
              ? ["#0A1229", "#111C3D", "#1E293B"]
              : ["#0B3B8C", "#185ADB", "#38BDF8"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroContainer, { height: 118, paddingHorizontal: 18, paddingBottom: 18 }]}
        >
          <View style={[styles.headerRow, { justifyContent: "space-between", alignItems: "center" }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="airplane" size={18} color={GOLD.light} />
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 20,
                    fontWeight: "800",
                    letterSpacing: -0.3,
                  }}
                >
                  {BRAND.name.en}
                </Text>
                <View
                  style={{
                    backgroundColor: "rgba(255,230,153,0.22)",
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,230,153,0.4)",
                  }}
                >
                  <Text
                    style={{
                      color: GOLD.light,
                      fontSize: 10,
                      fontWeight: "700",
                      fontFamily: FONTS.bengali.semiBold,
                    }}
                  >
                    {BRAND.name.bn}
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  color: "rgba(255,255,255,0.86)",
                  fontSize: 12.5,
                  fontWeight: "500",
                  marginTop: 4,
                }}
                numberOfLines={1}
              >
                {displayName
                  ? `Welcome back, ${displayName.split(" ")[0]} — Ready for takeoff`
                  : "Discover flights, boutique stays & curated journeys"}
              </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Pressable
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  } catch {}
                  router.push("/screens/notifications" as any);
                }}
                accessibilityLabel="Notifications"
                accessibilityRole="button"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: "rgba(255,255,255,0.16)",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
                {unreadNotifs > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 5,
                      minWidth: 15,
                      height: 15,
                      borderRadius: 8,
                      backgroundColor: "#EF4444",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 3,
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "800" }}>
                      {unreadNotifs > 9 ? "9+" : unreadNotifs}
                    </Text>
                  </View>
                )}
              </Pressable>

              <Pressable
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  overflow: "hidden",
                  borderWidth: 1.5,
                  borderColor: GOLD.light,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(212, 175, 55, 0.25)",
                }}
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  } catch {}
                  router.push("/(tabs)/account" as any);
                }}
                accessibilityLabel="Account Profile"
                accessibilityRole="button"
              >
                {user?.user_metadata?.avatar_url ? (
                  <Image
                    source={{ uri: user.user_metadata.avatar_url }}
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : userInitial ? (
                  <Text style={styles.avatarText}>{userInitial}</Text>
                ) : (
                  <Ionicons name="person-outline" size={19} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
          </View>
        </LinearGradient>

        {/* ================================================================== */}
        {/* 2. PRIMARY SERVICES CARD (DUAL ROW: 4 + 5 SERVICES)                */}
        {/* ================================================================== */}
        <View style={[styles.sectionWrapper, { marginTop: -12 }]}>
          <View
            style={[
              styles.primaryCard,
              {
                backgroundColor: serviceCardBg,
                borderColor: serviceCardBorder,
              },
              isDark ? styles.primaryCardShadowDark : styles.primaryCardShadowLight,
            ]}
          >
            {/* ROW 1: Hotels | Flights | Flight + Hotel | Trains */}
            <View style={styles.serviceRow1}>
              {ROW_1_SERVICES.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.serviceItemCol}
                  onPress={() => handleServicePress(item.route)}
                  hitSlop={6}
                >
                  <View
                    style={[
                      styles.serviceIconCircle1,
                      isDark && { backgroundColor: "rgba(212, 175, 55, 0.16)" },
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={24}
                      color={isDark ? GOLD.accent : GOLD.iconDark}
                    />
                  </View>
                  <Text
                    style={[styles.serviceLabel1, { color: serviceLabelColor }]}
                    numberOfLines={2}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* ROW 2: Vacation Rentals | Attractions | Car Rentals | Package Tours | +7 more */}
            <View style={styles.serviceRow2}>
              {ROW_2_SERVICES.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.serviceItemCol2}
                  onPress={() => handleServicePress(item.route)}
                  hitSlop={6}
                >
                  <View
                    style={[
                      styles.serviceIconCircle2,
                      isDark && { backgroundColor: "rgba(212, 175, 55, 0.14)" },
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={item.id === "more" ? 18 : 20}
                      color={isDark ? GOLD.accent : GOLD.iconDark}
                    />
                  </View>
                  <Text
                    style={[styles.serviceLabel2, { color: serviceLabelColor }]}
                    numberOfLines={2}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* ================================================================== */}
        {/* 3. SEARCH PILL BAR                                                 */}
        {/* ================================================================== */}
        <View style={styles.sectionWrapper}>
          <Pressable
            style={({ pressed }) => [
              styles.searchBarContainer,
              {
                backgroundColor: isDark ? colors.card : "#FFFFFF",
                borderColor: isDark ? GOLD.primary : GOLD.champagneBorder,
              },
              isDark ? styles.searchBarShadowDark : styles.searchBarShadowLight,
              pressed && { opacity: 0.94 },
            ]}
            onPress={() => handleDestinationPress("Bali")}
            accessibilityLabel="Search destination Bali"
            accessibilityRole="search"
          >
            {/* Left: Bronze Chat Icon with Dots */}
            <View style={styles.searchLeftIconWrap}>
              <Ionicons name="chatbubble-ellipses" size={20} color={GOLD.primary} />
            </View>

            {/* Middle: Destination Placeholder / Query */}
            <Text style={[styles.searchQueryText, { color: colors.text }]}>
              Search Bali, Cox's Bazar, Flights...
            </Text>

            {/* Right: Golden Circular Search Button with Magnifying Glass */}
            <View style={styles.searchCircleButton}>
              <LinearGradient
                colors={["#E2BF65", "#C59B27"]}
                style={styles.searchCircleGradient}
              >
                <Ionicons name="search" size={19} color="#FFFFFF" />
              </LinearGradient>
            </View>
          </Pressable>
        </View>

        {/* ================================================================== */}
        {/* 4. QUICK DESTINATION CHIPS (HORIZONTAL SCROLL)                     */}
        {/* ================================================================== */}
        <View style={styles.chipsSectionWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScrollContent}
          >
            {DESTINATION_CHIPS.map((chip) => (
              <Pressable
                key={chip.id}
                style={({ pressed }) => [
                  styles.chipPill,
                  {
                    backgroundColor: isDark ? colors.card : "#FFFFFF",
                    borderColor: isDark ? colors.border : "#E5E7EB",
                  },
                  pressed && { opacity: 0.88 },
                ]}
                onPress={() => handleDestinationPress(chip.name)}
              >
                <Image
                  source={{ uri: chip.imageUrl }}
                  style={styles.chipThumbnail}
                  resizeMode="cover"
                />
                <Text style={[styles.chipText, { color: colors.text }]}>{chip.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* ================================================================== */}
        {/* 5. SECONDARY ACTION ICONS (Deals | Events | Shopno Planner | Trending) */}
        {/* ================================================================== */}
        <View style={styles.sectionWrapper}>
          <View style={styles.actionIconsRow}>
            {ACTION_ICONS.map((action) => (
              <Pressable
                key={action.id}
                style={styles.actionIconCol}
                onPress={() => handleActionPress(action.route)}
                hitSlop={6}
              >
                <View
                  style={[
                    styles.actionCircle,
                    isDark
                      ? styles.actionCircleDark
                      : styles.actionCircleLight,
                  ]}
                >
                  <Ionicons
                    name={action.icon}
                    size={22}
                    color={isDark ? GOLD.accent : "#8C6615"}
                  />
                </View>
                <Text
                  style={[
                    styles.actionLabel,
                    { color: isDark ? "#EDEDED" : "#374151" },
                  ]}
                  numberOfLines={1}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ================================================================== */}
        {/* 6. "DISCOVER ✨" SECTION (HORIZONTAL NATIVE CARDS)                 */}
        {/* ================================================================== */}
        <View style={styles.discoverSectionWrapper}>
          {/* Section Header */}
          <View style={styles.discoverHeaderRow}>
            <View style={styles.discoverTitleGroup}>
              <Text
                style={[
                  styles.discoverTitle,
                  { color: isDark ? "#FFFFFF" : "#111827" },
                ]}
              >
                Discover ✨
              </Text>
              {isDark && (
                <Text style={styles.discoverNearbyText}> | Nearby</Text>
              )}
            </View>

            <Pressable
              onPress={() => handleActionPress("/screens/explore")}
              hitSlop={8}
            >
              <Text
                style={[
                  styles.seeAllText,
                  { color: isDark ? GOLD.accent : "#B8860B" },
                ]}
              >
                See All →
              </Text>
            </Pressable>
          </View>

          {/* Native Discover Cards Scroll (no clipped PNG screenshots) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.discoverScrollContent}
          >
            {DISCOVER_CARDS.map((card) => (
              <Pressable
                key={card.id}
                style={styles.discoverCardContainer}
                onPress={() => handleActionPress(card.route)}
              >
                <Image
                  source={{ uri: card.imageUrl }}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={["rgba(15,23,42,0.28)", "rgba(15,23,42,0.88)"]}
                  style={{
                    flex: 1,
                    padding: 12,
                    justifyContent: "space-between",
                  }}
                >
                  <View style={styles.cardHeaderRow}>
                    {card.badge ? (
                      <View style={styles.cardBadgeFeatured}>
                        <Text style={styles.cardBadgeFeaturedText}>{card.badge}</Text>
                      </View>
                    ) : (
                      <View />
                    )}
                    {card.pageIndicator && (
                      <View style={styles.cardPageBadge}>
                        <Text style={styles.cardPageBadgeText}>{card.pageIndicator}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.cardBottomWrap}>
                    <Text style={styles.cardMainTitle} numberOfLines={2}>
                      {card.titlePrimary}{" "}
                      {card.titleAccent ? (
                        <Text style={{ color: GOLD.light }}>{card.titleAccent}</Text>
                      ) : null}
                    </Text>
                    <Text style={styles.cardSubtitle} numberOfLines={2}>
                      {card.subtitle}
                    </Text>
                    {card.promoTag && (
                      <View style={styles.cardPromoPill}>
                        <Text style={styles.cardPromoText} numberOfLines={1}>
                          {card.promoTag}
                        </Text>
                      </View>
                    )}
                    <View style={styles.cardCtaButton}>
                      <Text style={{ color: "#0F172A", fontSize: 11.5, fontWeight: "700" }}>
                        {card.buttonLabel}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Extra Bottom Padding for AI Concierge Pill & Bottom Tab Bar */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* ================================================================== */}
      {/* 7. "+7 MORE SERVICES" BOTTOM SHEET MODAL                           */}
      {/* ================================================================== */}
      <Modal
        visible={isMoreModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsMoreModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setIsMoreModalOpen(false)}
          />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: isDark ? "#12141A" : "#FFFFFF" },
            ]}
          >
            {/* Sheet Handle */}
            <View style={styles.modalHandle} />

            {/* Header with Close Button */}
            <View style={styles.modalHeaderRow}>
              <View>
                <Text
                  style={[
                    styles.modalTitle,
                    { color: isDark ? "#FFFFFF" : "#111827" },
                  ]}
                >
                  More Travel & Partner Services
                </Text>
                <Text
                  style={[
                    styles.modalSubtitle,
                    { color: isDark ? "#9CA3AF" : "#64748B" },
                  ]}
                >
                  Explore specialized travel & transit solutions
                </Text>
              </View>

              <Pressable
                onPress={() => setIsMoreModalOpen(false)}
                style={styles.modalCloseBtn}
                hitSlop={8}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={isDark ? "#FFFFFF" : "#374151"}
                />
              </Pressable>
            </View>

            {/* Services List */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalListContent}
            >
              {MORE_SERVICES.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.modalServiceRow,
                    {
                      backgroundColor: isDark ? "#1A1D24" : "#F8FAFC",
                      borderColor: isDark ? "#282C37" : "#E2E8F0",
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => {
                    setIsMoreModalOpen(false);
                    try {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    } catch {}
                    router.push(item.route as any);
                  }}
                >
                  <View
                    style={[
                      styles.modalIconWrap,
                      { backgroundColor: isDark ? "#262319" : "#FEF9EC" },
                    ]}
                  >
                    <Ionicons name={item.icon} size={22} color={GOLD.primary} />
                  </View>
                  <View style={styles.modalTextGroup}>
                    <Text
                      style={[
                        styles.modalServiceTitle,
                        { color: isDark ? "#FFFFFF" : "#111827" },
                      ]}
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={[
                        styles.modalServiceSub,
                        { color: isDark ? "#9CA3AF" : "#64748B" },
                      ]}
                    >
                      {item.subtitle}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={isDark ? "#64748B" : "#94A3B8"}
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── STYLESHEET ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  bottomSpacer: {
    height: 140,
  },

  // 1. Hero Header
  heroContainer: {
    height: 105,
    width: "100%",
    position: "relative",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    width: "100%",
    height: "100%",
  },
  avatarButton: {
    width: 50,
    height: 50,
    marginRight: 8,
    marginTop: 6,
    borderRadius: 25,
  },
  avatarGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "500",
  },

  // 2. Primary Services Card
  sectionWrapper: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  primaryCard: {
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1,
  },
  primaryCardShadowLight: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
    ...(Platform.OS === "web" ? { boxShadow: "0px 3px 14px rgba(0, 0, 0, 0.07)" } : {}),
  },
  primaryCardShadowDark: {
    shadowColor: "#ECC46E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 6,
    ...(Platform.OS === "web" ? { boxShadow: "0px 4px 18px rgba(236, 196, 110, 0.14)" } : {}),
  },
  serviceRow1: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  serviceItemCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  serviceIconCircle1: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: GOLD.iconBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  serviceLabel1: {
    fontSize: 11.5,
    fontWeight: "500",
    color: "#1F2937",
    textAlign: "center",
    letterSpacing: -0.1,
  },
  serviceRow2: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 10,
  },
  serviceItemCol2: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  serviceIconCircle2: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GOLD.iconBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  serviceLabel2: {
    fontSize: 10.5,
    fontWeight: "500",
    color: "#374151",
    textAlign: "center",
    lineHeight: 13,
  },

  // 3. Search Bar
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 9999,
    paddingHorizontal: 14,
    borderWidth: 1.5,
  },
  searchBarShadowLight: {
    shadowColor: "#C59B27",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    ...(Platform.OS === "web" ? { boxShadow: "0px 2px 8px rgba(197, 155, 39, 0.08)" } : {}),
  },
  searchBarShadowDark: {
    shadowColor: "#FFE082",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
    ...(Platform.OS === "web" ? { boxShadow: "0px 3px 12px rgba(255, 224, 130, 0.22)" } : {}),
  },
  searchLeftIconWrap: {
    marginRight: 10,
  },
  searchQueryText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1A1A",
  },
  searchCircleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
  },
  searchCircleGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // 4. Quick Destination Chips
  chipsSectionWrapper: {
    marginTop: 8,
  },
  chipsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chipPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 11,
    paddingLeft: 4,
    borderRadius: 9999,
    borderWidth: 1,
  },
  chipThumbnail: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#181818",
    marginLeft: 6,
  },

  // 5. Secondary Action Icons
  actionIconsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingHorizontal: 4,
  },
  actionIconCol: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  actionCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  actionCircleLight: {
    backgroundColor: "#FDFBF7",
    borderWidth: 1,
    borderColor: "#EDE6D8",
  },
  actionCircleDark: {
    backgroundColor: "#141416",
    borderWidth: 1.5,
    borderColor: "#C5A049",
    shadowColor: "#ECC46E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  actionLabel: {
    fontSize: 11.5,
    fontWeight: "500",
    textAlign: "center",
  },

  // 6. Discover Section
  discoverSectionWrapper: {
    marginTop: 12,
  },
  discoverHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  discoverTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  discoverTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  discoverNearbyText: {
    fontSize: 14,
    fontWeight: "400",
    color: "#8E8E93",
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: "600",
  },
  discoverScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  discoverCardContainer: {
    width: 178,
    height: 220,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "transparent",
  },
  discoverCardImage: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  cardHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "600",
  },
  cardBadgeFeatured: {
    backgroundColor: GOLD.badgeBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  cardBadgeFeaturedText: {
    color: GOLD.badgeText,
    fontSize: 9.5,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  cardPageBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  cardPageBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "500",
  },
  cardVerifiedBadge: {
    backgroundColor: GOLD.badgeBg,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  cardVerifiedText: {
    color: GOLD.badgeText,
    fontSize: 9,
    fontWeight: "600",
  },
  cardBottomWrap: {
    width: "100%",
  },
  cardMainTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "700",
    lineHeight: 25,
    marginBottom: 4,
  },
  cardSubtitle: {
    color: "#E2E8F0",
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 6,
  },
  cardPromoPill: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    marginBottom: 10,
  },
  cardPromoText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "500",
  },
  cardCtaButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCtaButtonText: {
    color: "#181818",
    fontSize: 11.5,
    fontWeight: "600",
    letterSpacing: 0.2,
  },

  // 7. "+7 More Services" Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 36,
    paddingHorizontal: 20,
    maxHeight: "80%",
  },
  modalHandle: {
    width: 44,
    height: 5,
    backgroundColor: "#94A3B8",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 14,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 12.5,
    fontWeight: "400",
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  modalListContent: {
    gap: 10,
  },
  modalServiceRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  modalIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  modalTextGroup: {
    flex: 1,
  },
  modalServiceTitle: {
    fontSize: 14.5,
    fontWeight: "600",
  },
  modalServiceSub: {
    fontSize: 12,
    fontWeight: "400",
    marginTop: 2,
  },
});
