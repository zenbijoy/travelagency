import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { useSettingsStore } from "../store/settingsStore";
import { useAuthStore } from "../store/authStore";
import {
  AppNotification,
  NotificationCategoryFilter,
  useNotificationStore,
} from "../store/notificationStore";
import { WhySeeingThisModal } from "../components/notifications/WhySeeingThisModal";
import { ROUTES } from "../constants/routes";
import { resolveSafeNotificationRoute } from "../services/navigation/notificationDeepLinkRegistry";

interface CategoryTab {
  key: NotificationCategoryFilter;
  en: string;
  bn: string;
}

const CATEGORY_TABS: CategoryTab[] = [
  { key: "all", en: "All", bn: "সব" },
  { key: "booking", en: "Bookings", bn: "বুকিং" },
  { key: "flight_alert", en: "Flight Alerts", bn: "ফ্লাইট" },
  { key: "price_alert", en: "Price Alerts", bn: "দাম সতর্কতা" },
  { key: "travel_discovery", en: "Discovery", bn: "ডিসকভারি" },
  { key: "promo", en: "Offers", bn: "অফার" },
  { key: "security", en: "Security", bn: "নিরাপত্তা" },
  { key: "community", en: "Community", bn: "কমিউনিটি" },
];

function useSafeIsBn(): boolean {
  const lang = useSettingsStore((s) => s.language);
  try {
    return useLanguage().language === "bn";
  } catch {
    return lang === "bn";
  }
}

function getCategoryStyle(cat: string): { icon: string; color: string } {
  const c = cat.toLowerCase();
  if (c === "booking") return { icon: "briefcase-outline", color: "#10B981" };
  if (c === "flight_alert") return { icon: "airplane-outline", color: "#2563EB" };
  if (c === "price_alert") return { icon: "trending-down-outline", color: "#0D9488" };
  if (c === "travel_discovery") return { icon: "compass-outline", color: "#8B5CF6" };
  if (c === "promo" || c === "marketing") return { icon: "pricetag-outline", color: "#F59E0B" };
  if (c === "security") return { icon: "shield-checkmark-outline", color: "#EF4444" };
  if (c === "community") return { icon: "people-outline", color: "#6366F1" };
  return { icon: "notifications-outline", color: "#64748B" };
}

export function NotificationsInboxScreen() {
  const { colors, isDark } = useTheme();
  const isBn = useSafeIsBn();
  const userId = useAuthStore((s) => s.user?.id || "");

  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const isLoading = useNotificationStore((s) => s.isLoading);
  const selectedCategory = useNotificationStore((s) => s.selectedCategory);
  const unreadOnlyFilter = useNotificationStore((s) => s.unreadOnlyFilter);

  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const setSelectedCategory = useNotificationStore((s) => s.setSelectedCategory);
  const setUnreadOnlyFilter = useNotificationStore((s) => s.setUnreadOnlyFilter);
  const recordInteraction = useNotificationStore((s) => s.recordInteraction);

  const [refreshing, setRefreshing] = useState(false);
  const [whyTarget, setWhyTarget] = useState<AppNotification | null>(null);

  useEffect(() => {
    if (userId) {
      fetchNotifications(userId, {
        unreadOnly: unreadOnlyFilter,
        category: selectedCategory,
      });
    }
  }, [userId]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (userId) {
      await fetchNotifications(userId, {
        unreadOnly: unreadOnlyFilter,
        category: selectedCategory,
      });
    }
    setRefreshing(false);
  };

  const filteredItems = useMemo(() => {
    return notifications.filter((n) => {
      if (unreadOnlyFilter && n.is_read) return false;
      if (selectedCategory === "all") return true;
      const cat = String(n.category || n.type || "system").toLowerCase();
      if (selectedCategory === "promo") {
        return cat === "promo" || cat === "marketing";
      }
      return cat === selectedCategory || n.type === selectedCategory;
    });
  }, [notifications, selectedCategory, unreadOnlyFilter]);

  const handleOpenCta = (item: AppNotification) => {
    markAsRead(item.id);
    recordInteraction(item.id, item.cta_label ? "cta_completed" : "clicked", {
      channel: "in_app",
    }).catch(() => {});

    const target = item.deep_link || item.data?.route;
    const safeRoute = resolveSafeNotificationRoute(
      typeof target === "string" ? target : null,
      ROUTES.SCREENS.NOTIFICATIONS
    );
    router.push(safeRoute as any);
  };

  const handleFeedback = (
    item: AppNotification,
    feedback: "helpful" | "not_relevant"
  ) => {
    recordInteraction(
      item.id,
      feedback === "helpful" ? "clicked" : "dismissed",
      {
        channel: "in_app",
        feedback,
      }
    ).catch(() => {});
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      {/* Top Header */}
      <View
        style={[
          styles.topBar,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.iconBtn}
          accessibilityLabel={isBn ? "ফিরে যান" : "Back"}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>

        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {isBn ? "নোটিফিকেশন ইনবক্স" : "Notification Inbox"}
            </Text>
            {unreadCount > 0 && (
              <View
                style={[
                  styles.unreadBadge,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.headerSub, { color: colors.subtext }]}>
            {isBn
              ? "ব্যক্তিগতকৃত আপডেট ও সতর্কতা"
              : "Personalized Travel Updates & Alerts"}
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {unreadCount > 0 && (
            <Pressable
              onPress={markAllAsRead}
              style={[
                styles.headerActionBtn,
                { backgroundColor: colors.surface },
              ]}
            >
              <Ionicons
                name="checkmark-done-outline"
                size={16}
                color={colors.primary}
              />
            </Pressable>
          )}

          <Pressable
            onPress={() =>
              router.push(ROUTES.SCREENS.TRAVEL_PREFERENCES as any)
            }
            style={[
              styles.prefsBtn,
              { backgroundColor: colors.primaryLight },
            ]}
          >
            <Ionicons
              name="options-outline"
              size={15}
              color={colors.primary}
            />
            <Text style={[styles.prefsBtnText, { color: colors.primary }]}>
              {isBn ? "পছন্দ" : "Preferences"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Category Filter Bar */}
      <View
        style={[
          styles.filterBarWrapper,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <Pressable
            onPress={() => setUnreadOnlyFilter(!unreadOnlyFilter)}
            style={[
              styles.filterChip,
              {
                backgroundColor: unreadOnlyFilter
                  ? colors.primary
                  : colors.surface,
                borderColor: unreadOnlyFilter ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                { color: unreadOnlyFilter ? "#FFFFFF" : colors.text },
              ]}
            >
              {isBn ? "শুধু অপঠিত" : "Unread Only"}
            </Text>
          </Pressable>

          {CATEGORY_TABS.map((tab) => {
            const active = selectedCategory === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setSelectedCategory(tab.key)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    { color: active ? "#FFFFFF" : colors.text },
                  ]}
                >
                  {isBn ? tab.bn : tab.en}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading && filteredItems.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Ionicons
                name="notifications-off-outline"
                size={42}
                color={colors.textMuted}
              />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {isBn ? "কোনো নোটিফিকেশন নেই" : "No Notifications Here"}
              </Text>
              <Text style={[styles.emptySub, { color: colors.subtext }]}>
                {isBn
                  ? "আপনার পছন্দ অনুযায়ী ভ্রমণ অফার ও ফ্লাইট আপডেট পেতে পছন্দসমূহ সেট করুন।"
                  : "Adjust your Travel Preferences to tailor price drops, destination guides, and trip alerts."}
              </Text>
              <Pressable
                onPress={() =>
                  router.push(ROUTES.SCREENS.TRAVEL_PREFERENCES as any)
                }
                style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="sparkles-outline" size={16} color="#FFFFFF" />
                <Text style={styles.emptyBtnText}>
                  {isBn ? "ভ্রমণ পছন্দ সেট করুন" : "Open Travel Preferences"}
                </Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => {
            const rawCat = String(item.category || item.type || "system");
            const meta = getCategoryStyle(rawCat);
            const hasRoute = Boolean(item.deep_link || item.data?.route);

            return (
              <View
                style={[
                  styles.notifCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: !item.is_read ? colors.primary : colors.border,
                    borderLeftWidth: !item.is_read ? 4 : 1,
                  },
                ]}
              >
                {/* Header Row: Category + Relevance + Unread + Delete */}
                <View style={styles.cardTopRow}>
                  <View style={styles.cardBadges}>
                    <View
                      style={[
                        styles.catBadge,
                        { backgroundColor: `${meta.color}18` },
                      ]}
                    >
                      <Ionicons
                        name={meta.icon as any}
                        size={12}
                        color={meta.color}
                      />
                      <Text
                        style={[styles.catBadgeText, { color: meta.color }]}
                      >
                        {rawCat.replace(/_/g, " ").toUpperCase()}
                      </Text>
                    </View>

                    {(item.personalization_tier ||
                      typeof item.relevance_score === "number") && (
                      <View
                        style={[
                          styles.relBadge,
                          {
                            backgroundColor: isDark ? "#1e293b" : "#EEF6FF",
                          },
                        ]}
                      >
                        <Ionicons
                          name="sparkles"
                          size={11}
                          color={colors.primary}
                        />
                        <Text
                          style={[
                            styles.relBadgeText,
                            { color: colors.primary },
                          ]}
                        >
                          {typeof item.relevance_score === "number"
                            ? `${Math.round(item.relevance_score)}% Match`
                            : String(item.personalization_tier).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.topActions}>
                    {!item.is_read && (
                      <Pressable
                        onPress={() => markAsRead(item.id)}
                        hitSlop={8}
                        accessibilityLabel={
                          isBn ? "পঠিত হিসেবে চিহ্নিত" : "Mark as read"
                        }
                      >
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={18}
                          color={colors.primary}
                        />
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => removeNotification(item.id)}
                      hitSlop={8}
                      accessibilityLabel={isBn ? "মুছুন" : "Dismiss"}
                    >
                      <Ionicons
                        name="close-outline"
                        size={18}
                        color={colors.textMuted}
                      />
                    </Pressable>
                  </View>
                </View>

                {/* Content */}
                <Pressable
                  onPress={() => {
                    if (hasRoute) {
                      handleOpenCta(item);
                    } else {
                      markAsRead(item.id);
                    }
                  }}
                >
                  <Text style={[styles.notifTitle, { color: colors.text }]}>
                    {item.title}
                  </Text>
                  <Text style={[styles.notifBody, { color: colors.subtext }]}>
                    {item.body}
                  </Text>
                </Pressable>

                {/* Action Row: CTA + Why + Feedback */}
                <View
                  style={[
                    styles.cardFooter,
                    { borderTopColor: colors.borderSubtle },
                  ]}
                >
                  <View style={styles.footerLeft}>
                    {hasRoute && (
                      <Pressable
                        onPress={() => handleOpenCta(item)}
                        style={[
                          styles.ctaBtn,
                          { backgroundColor: colors.primary },
                        ]}
                      >
                        <Text style={styles.ctaBtnText}>
                          {item.cta_label || (isBn ? "বিস্তারিত" : "View")}
                        </Text>
                        <Ionicons
                          name="arrow-forward"
                          size={12}
                          color="#FFFFFF"
                        />
                      </Pressable>
                    )}

                    <Pressable
                      onPress={() => setWhyTarget(item)}
                      style={[
                        styles.whyBtn,
                        { backgroundColor: colors.surface },
                      ]}
                    >
                      <Ionicons
                        name="help-circle-outline"
                        size={14}
                        color={colors.subtext}
                      />
                      <Text
                        style={[styles.whyBtnText, { color: colors.subtext }]}
                      >
                        {isBn ? "কেন দেখছি?" : "Why am I seeing this?"}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.feedbackRow}>
                    <Pressable
                      onPress={() => handleFeedback(item, "helpful")}
                      style={[
                        styles.feedbackIconBtn,
                        item.feedback === "helpful" && {
                          backgroundColor: colors.successLight,
                        },
                      ]}
                      accessibilityLabel="Helpful"
                    >
                      <Ionicons
                        name={
                          item.feedback === "helpful"
                            ? "thumbs-up"
                            : "thumbs-up-outline"
                        }
                        size={15}
                        color={
                          item.feedback === "helpful"
                            ? colors.success
                            : colors.textMuted
                        }
                      />
                    </Pressable>

                    <Pressable
                      onPress={() => handleFeedback(item, "not_relevant")}
                      style={[
                        styles.feedbackIconBtn,
                        item.feedback === "not_relevant" && {
                          backgroundColor: colors.dangerLight,
                        },
                      ]}
                      accessibilityLabel="Not relevant"
                    >
                      <Ionicons
                        name={
                          item.feedback === "not_relevant"
                            ? "thumbs-down"
                            : "thumbs-down-outline"
                        }
                        size={15}
                        color={
                          item.feedback === "not_relevant"
                            ? colors.danger
                            : colors.textMuted
                        }
                      />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      <WhySeeingThisModal
        visible={Boolean(whyTarget)}
        notification={whyTarget}
        onClose={() => setWhyTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  headerSub: { fontSize: 11, marginTop: 1 },
  unreadBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  unreadBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  headerActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  prefsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  prefsBtnText: { fontSize: 12, fontWeight: "700" },
  filterBarWrapper: { borderBottomWidth: 1 },
  filterScroll: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterText: { fontSize: 12, fontWeight: "600" },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: {
    padding: 16,
    gap: 12,
    maxWidth: 820,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 40,
  },
  emptyCard: {
    alignItems: "center",
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    marginTop: 24,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  emptyBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  notifCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  catBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  catBadgeText: { fontSize: 10, fontWeight: "700" },
  relBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  relBadgeText: { fontSize: 10, fontWeight: "700" },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  notifTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  notifBody: { fontSize: 13, lineHeight: 19 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    marginTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  footerLeft: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  ctaBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  whyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  whyBtnText: { fontSize: 11, fontWeight: "600" },
  feedbackRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  feedbackIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default NotificationsInboxScreen;
