import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  NotificationWhyDetails,
  useNotificationStore,
} from "../../store/notificationStore";
import { usePersonalizationStore } from "../../store/personalizationStore";
import { ROUTES } from "../../constants/routes";

export interface WhySeeingThisModalProps {
  visible: boolean;
  notification: AppNotification | null;
  onClose: () => void;
  onOptOutCategory?: (category: string) => void | Promise<void>;
  onAdjustPreferences?: () => void;
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

export const WhySeeingThisModal: React.FC<WhySeeingThisModalProps> = ({
  visible,
  notification,
  onClose,
  onOptOutCategory,
  onAdjustPreferences,
}) => {
  const { colors, isDark } = useTheme();
  const isBn = useSafeIsBengali();

  const fetchWhySeeingThis = useNotificationStore((s) => s.fetchWhySeeingThis);
  const recordInteraction = useNotificationStore((s) => s.recordInteraction);
  const whyCache = useNotificationStore((s) => s.whyCache);
  const whyLoadingId = useNotificationStore((s) => s.whyLoadingId);
  const optOut = usePersonalizationStore((s) => s.optOut);

  const [details, setDetails] = useState<NotificationWhyDetails | null>(null);
  const [optingOut, setOptingOut] = useState(false);
  const [optedOutBanner, setOptedOutBanner] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setOptedOutBanner(null);

    if (!visible || !notification) {
      setDetails(null);
      return;
    }

    const cached = whyCache[notification.id];
    if (cached) {
      setDetails(cached);
    }

    fetchWhySeeingThis(notification.id).then((res) => {
      if (active && res) {
        setDetails(res);
      }
    });

    return () => {
      active = false;
    };
  }, [visible, notification?.id]);

  if (!notification) return null;

  const isLoading = whyLoadingId === notification.id && !details;
  const category = String(
    details?.category || notification.category || notification.type || "system"
  );
  const tier = details?.personalization_tier || notification.personalization_tier || "generic";
  const relevance =
    details?.relevance_score ?? notification.relevance_score ?? null;
  const confidence =
    details?.confidence_score ?? notification.confidence_score ?? null;

  const fallbackFactors: string[] = Array.isArray(
    notification.data?.explanation_factors
  )
    ? notification.data.explanation_factors.map(String)
    : [];

  const factors =
    details?.explanation_factors && details.explanation_factors.length > 0
      ? details.explanation_factors
      : fallbackFactors;

  const matchedPreferences = details?.matched_preferences || [];

  const isEssentialCategory =
    category === "booking" || category === "security";
  const canOptOutCategory =
    details?.can_opt_out_category ?? !isEssentialCategory;

  const tierLabel =
    tier === "deep"
      ? isBn
        ? "গভীর ব্যক্তিগতকরণ"
        : "Deep Personalization"
      : tier === "light"
      ? isBn
        ? "হালকা ব্যক্তিগতকরণ"
        : "Light Personalization"
      : tier === "suppressed"
      ? isBn
        ? "সীমিত"
        : "Suppressed"
      : isBn
      ? "সাধারণ তথ্য"
      : "General Update";

  const handleAdjustPreferences = () => {
    onClose();
    if (onAdjustPreferences) {
      onAdjustPreferences();
    } else {
      router.push(
        (details?.preferences_route ||
          ROUTES.SCREENS.TRAVEL_PREFERENCES) as any
      );
    }
  };

  const handleOptOut = async () => {
    if (!canOptOutCategory || optingOut) return;
    setOptingOut(true);
    try {
      await optOut("category", category, "user_opted_out_from_why_modal");
      await recordInteraction(notification.id, "dismissed", {
        feedback: "not_relevant",
        metadata: { opted_out_category: category },
      });
      if (onOptOutCategory) {
        await onOptOutCategory(category);
      }
      setOptedOutBanner(
        isBn
          ? `"${category}" ক্যাটাগরির নোটিফিকেশন বন্ধ করা হয়েছে।`
          : `You have opted out of "${category}" notifications.`
      );
    } finally {
      setOptingOut(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              { borderBottomColor: colors.borderSubtle },
            ]}
          >
            <View style={styles.headerLeft}>
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: colors.primaryLight },
                ]}
              >
                <Ionicons
                  name="sparkles-outline"
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {isBn ? "আমি কেন এটি দেখছি?" : "Why am I seeing this?"}
                </Text>
                <Text
                  style={[styles.subtitle, { color: colors.subtext }]}
                  numberOfLines={1}
                >
                  {notification.title}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityLabel={isBn ? "বন্ধ করুন" : "Close"}
            >
              <Ionicons name="close" size={22} color={colors.subtext} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.bodyScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Badges Row */}
            <View style={styles.badgesRow}>
              <View
                style={[
                  styles.badgePill,
                  { backgroundColor: colors.primaryLight },
                ]}
              >
                <Text style={[styles.badgeText, { color: colors.primary }]}>
                  {category.replace(/_/g, " ").toUpperCase()}
                </Text>
              </View>
              <View
                style={[
                  styles.badgePill,
                  {
                    backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                  },
                ]}
              >
                <Text style={[styles.badgeText, { color: colors.text }]}>
                  {tierLabel}
                </Text>
              </View>
            </View>

            {/* Scores (only rendered when available from backend/metadata) */}
            {(relevance !== null || confidence !== null) && (
              <View
                style={[
                  styles.scoreBox,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.border,
                  },
                ]}
              >
                {relevance !== null && (
                  <View style={styles.scoreCol}>
                    <Text style={[styles.scoreLabel, { color: colors.subtext }]}>
                      {isBn ? "প্রাসঙ্গিকতা" : "Relevance Score"}
                    </Text>
                    <Text style={[styles.scoreValue, { color: colors.primary }]}>
                      {Math.round(relevance)}/100
                    </Text>
                  </View>
                )}
                {confidence !== null && (
                  <View style={styles.scoreCol}>
                    <Text style={[styles.scoreLabel, { color: colors.subtext }]}>
                      {isBn ? "প্রোফাইল আস্থা" : "Profile Confidence"}
                    </Text>
                    <Text style={[styles.scoreValue, { color: colors.success }]}>
                      {Math.round(confidence)}/100
                    </Text>
                  </View>
                )}
              </View>
            )}

            {isLoading ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.loaderText, { color: colors.subtext }]}>
                  {isBn
                    ? "ব্যক্তিগতকরণের কারণ লোড হচ্ছে..."
                    : "Loading personalization explanation..."}
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.summaryText, { color: colors.text }]}>
                  {details?.summary ||
                    (isBn
                      ? "আপনার সক্রিয় ভ্রমণ পছন্দ ও নোটিফিকেশন সম্মতির ওপর ভিত্তি করে এই বার্তাটি পাঠানো হয়েছে।"
                      : "Sent based on your active travel preferences and notification consent settings.")}
                </Text>

                {/* Auditable Explanation Factors */}
                <Text style={[styles.sectionLabel, { color: colors.subtext }]}>
                  {isBn ? "প্রধান কারণসমূহ" : "Key Factors"}
                </Text>
                <View style={styles.factorList}>
                  {factors.map((factor, idx) => (
                    <View key={`${idx}-${factor}`} style={styles.factorRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color={colors.success}
                        style={{ marginTop: 2 }}
                      />
                      <Text style={[styles.factorText, { color: colors.text }]}>
                        {factor}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Matched Preferences */}
                {matchedPreferences.length > 0 && (
                  <>
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: colors.subtext, marginTop: 12 },
                      ]}
                    >
                      {isBn ? "মিলে যাওয়া পছন্দ" : "Matched Preferences"}
                    </Text>
                    <View style={styles.chipWrap}>
                      {matchedPreferences.map((pref) => (
                        <View
                          key={pref}
                          style={[
                            styles.prefChip,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.prefChipText,
                              { color: colors.text },
                            ]}
                          >
                            {pref}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {isEssentialCategory && (
                  <View
                    style={[
                      styles.noticeBox,
                      {
                        backgroundColor: colors.infoLight,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={16}
                      color={colors.info}
                    />
                    <Text style={[styles.noticeText, { color: colors.text }]}>
                      {isBn
                        ? "বুকিং ও নিরাপত্তা আপডেট আপনার ট্রিপ সুরক্ষার জন্য অপরিহার্য।"
                        : "Essential booking and security updates stay active to protect your active trips and account."}
                    </Text>
                  </View>
                )}

                {optedOutBanner && (
                  <View
                    style={[
                      styles.noticeBox,
                      {
                        backgroundColor: colors.successLight,
                        borderColor: colors.success,
                      },
                    ]}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={colors.success}
                    />
                    <Text style={[styles.noticeText, { color: colors.text }]}>
                      {optedOutBanner}
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Footer Quick Controls */}
          <View
            style={[
              styles.footer,
              { borderTopColor: colors.borderSubtle },
            ]}
          >
            <Pressable
              style={[
                styles.primaryBtn,
                { backgroundColor: colors.primary },
              ]}
              onPress={handleAdjustPreferences}
            >
              <Ionicons name="options-outline" size={16} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>
                {isBn ? "পছন্দ পরিবর্তন করুন" : "Adjust Preferences"}
              </Text>
            </Pressable>

            {canOptOutCategory && (
              <Pressable
                style={[
                  styles.secondaryBtn,
                  {
                    backgroundColor: colors.dangerLight,
                    borderColor: colors.danger,
                  },
                ]}
                onPress={handleOptOut}
                disabled={optingOut}
              >
                {optingOut ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <>
                    <Ionicons
                      name="notifications-off-outline"
                      size={15}
                      color={colors.danger}
                    />
                    <Text
                      style={[
                        styles.secondaryBtnText,
                        { color: colors.danger },
                      ]}
                    >
                      {isBn
                        ? "এই ক্যাটাগরি বন্ধ করুন"
                        : "Opt out of this category"}
                    </Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "85%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  bodyScroll: {
    padding: 18,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  badgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  scoreBox: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  scoreCol: {
    alignItems: "center",
  },
  scoreLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  scoreValue: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
  loaderWrap: {
    paddingVertical: 20,
    alignItems: "center",
    gap: 8,
  },
  loaderText: {
    fontSize: 13,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  factorList: {
    gap: 8,
  },
  factorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  factorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  prefChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  prefChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  footer: {
    padding: 14,
    borderTopWidth: 1,
    gap: 8,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
});

export default WhySeeingThisModal;
