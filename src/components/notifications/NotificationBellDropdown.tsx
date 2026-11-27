import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../context/LanguageContext";
import { useSettingsStore } from "../../store/settingsStore";
import {
  AppNotification,
  useNotificationStore,
} from "../../store/notificationStore";
import { ROUTES } from "../../constants/routes";
import { resolveSafeNotificationRoute } from "../../services/navigation/notificationDeepLinkRegistry";
import { WhySeeingThisModal } from "./WhySeeingThisModal";

export interface NotificationBellDropdownProps {
  onOpenInbox?: () => void;
  onOpenPreferences?: () => void;
  onSelectNotification?: (notification: AppNotification) => void;
  maxPreviewItems?: number;
}

function useSafeIsBengali(): boolean {
  const storeLang = useSettingsStore((s) => s.language);
  try {
    const langCtx = useLanguage();
    return langCtx.language === "bn";
  } catch {
    return storeLang === "bn";
  }
}

export const NotificationBellDropdown: React.FC<
  NotificationBellDropdownProps
> = ({
  onOpenInbox,
  onOpenPreferences,
  onSelectNotification,
  maxPreviewItems = 5,
}) => {
  const { colors, isDark } = useTheme();
  const isBn = useSafeIsBengali();

  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const recordInteraction = useNotificationStore((s) => s.recordInteraction);

  const [open, setOpen] = useState(false);
  const [whyTarget, setWhyTarget] = useState<AppNotification | null>(null);

  const previewItems = notifications.slice(0, maxPreviewItems);

  const handleNotificationPress = (item: AppNotification) => {
    markAsRead(item.id);
    recordInteraction(item.id, "clicked", { channel: "in_app" }).catch(
      () => {}
    );
    setOpen(false);
    if (onSelectNotification) {
      onSelectNotification(item);
      return;
    }
    const targetRoute = item.deep_link || item.data?.route;
    const safeRoute = resolveSafeNotificationRoute(
      typeof targetRoute === "string" ? targetRoute : null,
      ROUTES.SCREENS.NOTIFICATIONS
    );
    router.push(safeRoute as any);
  };

  const handleOpenInbox = () => {
    setOpen(false);
    if (onOpenInbox) {
      onOpenInbox();
    } else {
      router.push(ROUTES.SCREENS.NOTIFICATIONS as any);
    }
  };

  const handleOpenPreferences = () => {
    setOpen(false);
    if (onOpenPreferences) {
      onOpenPreferences();
    } else {
      router.push(ROUTES.SCREENS.TRAVEL_PREFERENCES as any);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.bellButton,
          {
            backgroundColor: isDark ? "#1E293B" : colors.surface,
            borderColor: colors.border,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={isBn ? "নোটিফিকেশন ইনবক্স" : "Notifications"}
      >
        <Ionicons
          name="notifications-outline"
          size={19}
          color={colors.text}
        />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </Text>
          </View>
        )}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={[
              styles.dropdownCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => {}}
          >
            {/* Header */}
            <View
              style={[
                styles.dropdownHeader,
                { borderBottomColor: colors.borderSubtle },
              ]}
            >
              <View style={styles.headerTitleGroup}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                  {isBn ? "নোটিফিকেশন" : "Notifications"}
                </Text>
                {unreadCount > 0 && (
                  <View
                    style={[
                      styles.unreadPill,
                      { backgroundColor: colors.primaryLight },
                    ]}
                  >
                    <Text
                      style={[styles.unreadPillText, { color: colors.primary }]}
                    >
                      {unreadCount} {isBn ? "অপঠিত" : "unread"}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.headerActions}>
                {unreadCount > 0 && (
                  <Pressable
                    onPress={markAllAsRead}
                    style={styles.headerLinkBtn}
                  >
                    <Text
                      style={[
                        styles.headerLinkText,
                        { color: colors.primary },
                      ]}
                    >
                      {isBn ? "সব পঠিত" : "Mark read"}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={handleOpenPreferences}
                  hitSlop={8}
                  accessibilityLabel={
                    isBn ? "ভ্রমণ পছন্দসমূহ" : "Travel Preferences"
                  }
                >
                  <Ionicons
                    name="options-outline"
                    size={18}
                    color={colors.subtext}
                  />
                </Pressable>
              </View>
            </View>

            {/* Notification Preview List */}
            <ScrollView
              style={styles.listScroll}
              showsVerticalScrollIndicator={false}
            >
              {previewItems.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons
                    name="notifications-off-outline"
                    size={30}
                    color={colors.textMuted}
                  />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    {isBn ? "কোনো নতুন বার্তা নেই" : "You're all caught up"}
                  </Text>
                  <Text style={[styles.emptySub, { color: colors.subtext }]}>
                    {isBn
                      ? "নতুন ভ্রমণ আপডেট এখানে দেখা যাবে।"
                      : "Personalized alerts and trip updates will appear here."}
                  </Text>
                </View>
              ) : (
                previewItems.map((item) => {
                  const categoryLabel = String(
                    item.category || item.type || "system"
                  ).replace(/_/g, " ");
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.itemCard,
                        {
                          borderBottomColor: colors.borderSubtle,
                          backgroundColor: !item.is_read
                            ? isDark
                              ? "rgba(59,130,246,0.08)"
                              : "#F8FAFF"
                            : "transparent",
                        },
                      ]}
                    >
                      <Pressable
                        onPress={() => handleNotificationPress(item)}
                        style={styles.itemMain}
                      >
                        <View style={styles.itemTopRow}>
                          <Text
                            style={[
                              styles.itemCategory,
                              { color: colors.primary },
                            ]}
                          >
                            {categoryLabel.toUpperCase()}
                          </Text>
                          {!item.is_read && (
                            <View
                              style={[
                                styles.unreadDot,
                                { backgroundColor: colors.primary },
                              ]}
                            />
                          )}
                        </View>
                        <Text
                          style={[styles.itemTitle, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        <Text
                          style={[styles.itemBody, { color: colors.subtext }]}
                          numberOfLines={2}
                        >
                          {item.body}
                        </Text>
                      </Pressable>

                      <View style={styles.itemFooter}>
                        <Pressable
                          onPress={() => {
                            setOpen(false);
                            setWhyTarget(item);
                          }}
                          style={styles.whyLink}
                        >
                          <Ionicons
                            name="help-circle-outline"
                            size={14}
                            color={colors.subtext}
                          />
                          <Text
                            style={[
                              styles.whyLinkText,
                              { color: colors.subtext },
                            ]}
                          >
                            {isBn ? "কেন দেখছি?" : "Why am I seeing this?"}
                          </Text>
                        </Pressable>

                        {item.cta_label && (
                          <Pressable
                            onPress={() => handleNotificationPress(item)}
                          >
                            <Text
                              style={[
                                styles.ctaText,
                                { color: colors.primary },
                              ]}
                            >
                              {item.cta_label} →
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* Footer Navigation */}
            <View
              style={[
                styles.dropdownFooter,
                { borderTopColor: colors.borderSubtle },
              ]}
            >
              <Pressable
                style={[styles.footerBtn, { backgroundColor: colors.primary }]}
                onPress={handleOpenInbox}
              >
                <Text style={styles.footerPrimaryText}>
                  {isBn ? "পূর্ণ ইনবক্স খুলুন" : "Open Personalized Inbox"}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.footerSecondaryBtn,
                  { borderColor: colors.border },
                ]}
                onPress={handleOpenPreferences}
              >
                <Ionicons
                  name="sparkles-outline"
                  size={15}
                  color={colors.primary}
                />
                <Text
                  style={[styles.footerSecondaryText, { color: colors.text }]}
                >
                  {isBn ? "ভ্রমণ পছন্দসমূহ" : "Travel Preferences"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <WhySeeingThisModal
        visible={Boolean(whyTarget)}
        notification={whyTarget}
        onClose={() => setWhyTarget(null)}
        onAdjustPreferences={() => {
          setWhyTarget(null);
          handleOpenPreferences();
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 68,
    paddingHorizontal: 16,
  },
  dropdownCard: {
    width: "100%",
    maxWidth: 380,
    maxHeight: "75%",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  unreadPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  unreadPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerLinkBtn: {
    paddingVertical: 2,
  },
  headerLinkText: {
    fontSize: 12,
    fontWeight: "600",
  },
  listScroll: {
    maxHeight: 360,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 20,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptySub: {
    fontSize: 12,
    textAlign: "center",
  },
  itemCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  itemMain: {
    gap: 3,
  },
  itemTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemCategory: {
    fontSize: 10,
    fontWeight: "700",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  itemBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  itemFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  whyLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  whyLinkText: {
    fontSize: 11,
    fontWeight: "600",
  },
  ctaText: {
    fontSize: 11,
    fontWeight: "700",
  },
  dropdownFooter: {
    padding: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  footerBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  footerPrimaryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  footerSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  footerSecondaryText: {
    fontSize: 12,
    fontWeight: "600",
  },
});

export default NotificationBellDropdown;
