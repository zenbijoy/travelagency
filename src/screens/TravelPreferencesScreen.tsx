import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { useSettingsStore } from "../store/settingsStore";
import {
  BudgetTier,
  CommunicationTone,
  DigestFrequency,
  DimensionEntry,
  PersonalizationLanguage,
  PreferredSendWindow,
  PriceSensitivityLevel,
  usePersonalizationStore,
} from "../store/personalizationStore";
import { ROUTES } from "../constants/routes";
import { fcmNotificationService } from "../services/fcmNotificationService";

interface OptionItem<T extends string = string> {
  key: T;
  en: string;
  bn: string;
}

const DESTINATION_OPTIONS: string[] = [
  "Cox's Bazar",
  "Sajek",
  "Sylhet",
  "Sreemangal",
  "Bandarban",
  "Saint Martin",
  "Sundarbans",
  "Kuakata",
  "Kathmandu",
  "Bangkok",
  "Dubai",
  "Singapore",
  "Kuala Lumpur",
];

const INTEREST_OPTIONS: OptionItem[] = [
  { key: "nature", en: "Nature", bn: "প্রকৃতি" },
  { key: "beach", en: "Beach", bn: "সমুদ্র সৈকত" },
  { key: "mountains", en: "Mountains", bn: "পাহাড়" },
  { key: "heritage", en: "Heritage", bn: "ঐতিহ্য" },
  { key: "tea_gardens", en: "Tea Gardens", bn: "চা বাগান" },
  { key: "wildlife", en: "Wildlife", bn: "বন্যপ্রাণী" },
  { key: "food", en: "Food", bn: "খাবার" },
  { key: "wellness", en: "Wellness", bn: "সুস্থতা ও বিশ্রাম" },
];

const STYLE_OPTIONS: OptionItem[] = [
  { key: "solo", en: "Solo", bn: "একাকী" },
  { key: "family", en: "Family", bn: "পরিবার" },
  { key: "couple", en: "Couple", bn: "দম্পতি" },
  { key: "friends", en: "Friends / Group", bn: "বন্ধু / গ্রুপ" },
  { key: "business", en: "Business", bn: "ব্যবসা" },
  { key: "adventure", en: "Adventure", bn: "অ্যাডভেঞ্চার" },
  { key: "relaxation", en: "Relaxation", bn: "রিল্যাক্সেশন" },
  { key: "cultural", en: "Cultural", bn: "সাংস্কৃতিক" },
];

const TRANSPORT_OPTIONS: OptionItem[] = [
  { key: "flight", en: "Flight", bn: "ফ্লাইট" },
  { key: "train", en: "Train", bn: "ট্রেন" },
  { key: "bus", en: "Bus", bn: "বাস" },
  { key: "launch", en: "Launch", bn: "লঞ্চ" },
  { key: "private_vehicle", en: "Private Vehicle", bn: "ব্যক্তিগত গাড়ি" },
  { key: "mixed", en: "Mixed", bn: "মিশ্র" },
];

const ACCOMMODATION_OPTIONS: OptionItem[] = [
  { key: "hotel", en: "Hotel", bn: "হোটেল" },
  { key: "resort", en: "Resort", bn: "রিসোর্ট" },
  { key: "budget_stay", en: "Budget Stay", bn: "বাজেট স্টে" },
  { key: "premium_hotel", en: "Premium Hotel", bn: "প্রিমিয়াম হোটেল" },
  { key: "family_hotel", en: "Family Hotel", bn: "ফ্যামিলি হোটেল" },
  { key: "eco_stay", en: "Eco-Stay", bn: "ইকো-স্টে" },
  { key: "guesthouse", en: "Guesthouse", bn: "গেস্টহাউস" },
];

const AMENITY_OPTIONS: OptionItem[] = [
  { key: "pool", en: "Pool", bn: "সুইমিং পুল" },
  { key: "wifi", en: "Wi-Fi", bn: "ওয়াই-ফাই" },
  { key: "breakfast", en: "Breakfast", bn: "সকালের নাস্তা" },
  { key: "ac", en: "AC", bn: "এসি" },
  { key: "parking", en: "Parking", bn: "পার্কিং" },
  { key: "family_room", en: "Family Room", bn: "ফ্যামিলি রুম" },
  { key: "location_proximity", en: "Prime Location", bn: "কেন্দ্রীয় অবস্থান" },
];

const BUDGET_TIERS: OptionItem<Exclude<BudgetTier, "unknown">>[] = [
  { key: "budget", en: "Budget", bn: "বাজেট" },
  { key: "economy", en: "Economy", bn: "ইকোনমি" },
  { key: "mid_range", en: "Mid-range", bn: "মিড-রেঞ্জ" },
  { key: "premium", en: "Premium", bn: "প্রিমিয়াম" },
  { key: "luxury", en: "Luxury", bn: "লাক্সারি" },
  { key: "flexible", en: "Flexible", bn: "নমনীয়" },
];

const PRICE_SENSITIVITY_OPTIONS: OptionItem<PriceSensitivityLevel>[] = [
  { key: "high", en: "High (Deal Hunter)", bn: "বেশি (অফার-সচেতন)" },
  { key: "medium", en: "Medium (Balanced)", bn: "মাঝারি (সুষম)" },
  { key: "low", en: "Low (Comfort First)", bn: "কম (আরাম-অগ্রাধিকার)" },
];

const TONE_OPTIONS: OptionItem<CommunicationTone>[] = [
  { key: "friendly", en: "Friendly", bn: "বন্ধুত্বপূর্ণ" },
  { key: "concise", en: "Concise", bn: "সংক্ষিপ্ত" },
  { key: "informative", en: "Informative", bn: "তথ্যবহুল" },
  { key: "formal", en: "Formal", bn: "আনুষ্ঠানিক" },
];

const DIGEST_OPTIONS: OptionItem<DigestFrequency>[] = [
  { key: "daily", en: "Daily", bn: "দৈনিক" },
  { key: "weekly", en: "Weekly", bn: "সাপ্তাহিক" },
  { key: "disabled", en: "Disabled", bn: "বন্ধ" },
];

const SEND_WINDOW_OPTIONS: OptionItem<PreferredSendWindow>[] = [
  { key: "morning", en: "Morning", bn: "সকাল" },
  { key: "afternoon", en: "Afternoon", bn: "বিকাল" },
  { key: "evening", en: "Evening", bn: "সন্ধ্যা" },
  { key: "late_evening", en: "Late Evening", bn: "রাত" },
  { key: "flexible", en: "Flexible", bn: "যেকোনো সময়" },
];

function useSafeLanguageControl() {
  const storeLanguage = useSettingsStore((s) => s.language);
  const setStoreLanguage = useSettingsStore((s) => s.setLanguage);
  try {
    const ctx = useLanguage();
    return {
      isBn: ctx.language === "bn",
      changeLanguage: ctx.changeLanguage,
    };
  } catch {
    return {
      isBn: storeLanguage === "bn",
      changeLanguage: async (lng: "en" | "bn") => setStoreLanguage(lng),
    };
  }
}

function toggleItem(list: string[], item: string): string[] {
  if (list.includes(item)) {
    return list.filter((x) => x !== item);
  }
  return [...list, item];
}

function formatDimensionValue(value: unknown, isBn: boolean): string {
  if (value === null || value === undefined || value === "unknown") {
    return isBn ? "অজানা" : "Unknown";
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : isBn ? "খালি" : "None";
  }
  if (typeof value === "object") {
    try {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .slice(0, 4)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("/") : String(v)}`);
      return entries.length > 0 ? entries.join(" • ") : JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function TravelPreferencesScreen() {
  const { colors, isDark } = useTheme();
  const { isBn, changeLanguage } = useSafeLanguageControl();

  const preferences = usePersonalizationStore((s) => s.preferences);
  const profile = usePersonalizationStore((s) => s.profile);
  const isLoading = usePersonalizationStore((s) => s.isLoading);
  const isSaving = usePersonalizationStore((s) => s.isSaving);
  const error = usePersonalizationStore((s) => s.error);
  const syncNotice = usePersonalizationStore((s) => s.syncNotice);

  const fetchPreferences = usePersonalizationStore((s) => s.fetchPreferences);
  const updatePreferences = usePersonalizationStore((s) => s.updatePreferences);
  const fetchProfile = usePersonalizationStore((s) => s.fetchProfile);
  const correctDimension = usePersonalizationStore((s) => s.correctDimension);
  const optOut = usePersonalizationStore((s) => s.optOut);
  const resetPersonalization = usePersonalizationStore(
    (s) => s.resetPersonalization
  );
  const deleteProfileData = usePersonalizationStore((s) => s.deleteProfileData);

  const [refreshing, setRefreshing] = useState(false);
  const [customDestination, setCustomDestination] = useState("");
  const [homeCityInput, setHomeCityInput] = useState(preferences.home_city || "");
  const [originInput, setOriginInput] = useState(preferences.travel_origin || "");
  const [quietStartInput, setQuietStartInput] = useState(
    preferences.notification_preferences.quiet_hours_start || "22:00"
  );
  const [quietEndInput, setQuietEndInput] = useState(
    preferences.notification_preferences.quiet_hours_end || "07:00"
  );

  // Modals
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [correctModalDim, setCorrectModalDim] = useState<DimensionEntry | null>(
    null
  );
  const [correctValueInput, setCorrectValueInput] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string>("checking");
  const [pushSyncing, setPushSyncing] = useState(false);

  useEffect(() => {
    fetchPreferences();
    fetchProfile();
    fcmNotificationService
      .checkPermissionStatus()
      .then((s) => setPushStatus(String(s)))
      .catch(() => setPushStatus("undetermined"));
  }, []);

  const handleEnablePushAndSync = async () => {
    try {
      setPushSyncing(true);
      const res = await fcmNotificationService.requestPushPermissionsAndSync();
      setPushStatus(String(res.status));
      if (res.status === "granted") {
        await updatePreferences({ push_enabled: true });
        showToast(
          res.syncedBackend
            ? isBn
              ? "পুশ নোটিফিকেশন ও ডিভাইস সিঙ্ক সম্পন্ন"
              : "Push enabled & device synced"
            : isBn
            ? "পুশ অনুমতি চালু হয়েছে"
            : "Push permission granted"
        );
      } else {
        showToast(
          isBn
            ? "ডিভাইস সেটিংস থেকে পুশ অনুমতি দিন"
            : "Enable push permission in device settings"
        );
      }
    } finally {
      setPushSyncing(false);
    }
  };

  useEffect(() => {
    setHomeCityInput(preferences.home_city || "");
    setOriginInput(preferences.travel_origin || "");
    setQuietStartInput(
      preferences.notification_preferences.quiet_hours_start || "22:00"
    );
    setQuietEndInput(
      preferences.notification_preferences.quiet_hours_end || "07:00"
    );
  }, [
    preferences.home_city,
    preferences.travel_origin,
    preferences.notification_preferences.quiet_hours_start,
    preferences.notification_preferences.quiet_hours_end,
  ]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPreferences(), fetchProfile()]);
    setRefreshing(false);
  };

  const handleSaveLocation = async () => {
    if (!preferences.location_consent) {
      Alert.alert(
        isBn ? "অবস্থান সম্মতি প্রয়োজন" : "Location Consent Required",
        isBn
          ? "হোম সিটি বা যাত্রা শুরুর স্থান সংরক্ষণ করতে আগে অবস্থান সম্মতি চালু করুন।"
          : "Enable explicit location consent before saving your home city or travel origin."
      );
      return;
    }
    const ok = await updatePreferences({
      location_consent: true,
      home_city: homeCityInput.trim() || null,
      travel_origin: originInput.trim() || null,
    });
    if (ok) {
      showToast(isBn ? "অবস্থান সংরক্ষিত হয়েছে" : "Location preferences saved");
    }
  };

  const handleToggleLocationConsent = async (enabled: boolean) => {
    if (!enabled) {
      setHomeCityInput("");
      setOriginInput("");
      await updatePreferences({
        location_consent: false,
      });
      showToast(
        isBn
          ? "অবস্থান সম্মতি বন্ধ ও তথ্য মুছে ফেলা হয়েছে"
          : "Location consent withdrawn and city cleared"
      );
    } else {
      await updatePreferences({
        location_consent: true,
      });
    }
  };

  const handleAddCustomDestination = async () => {
    const trimmed = customDestination.trim();
    if (!trimmed) return;
    if (!preferences.favorite_destinations.includes(trimmed)) {
      await updatePreferences({
        favorite_destinations: [...preferences.favorite_destinations, trimmed],
      });
      showToast(
        isBn ? `${trimmed} পছন্দে যুক্ত হয়েছে` : `Added ${trimmed} to favorites`
      );
    }
    setCustomDestination("");
  };

  const handleLanguageSelect = async (lang: PersonalizationLanguage) => {
    await updatePreferences({ preferred_language: lang });
    changeLanguage(lang).catch(() => {});
    showToast(
      lang === "bn"
        ? "নোটিফিকেশন ভাষা বাংলা নির্ধারণ করা হয়েছে"
        : "Notification language set to English"
    );
  };

  const handleConfirmReset = async () => {
    setShowResetModal(false);
    const ok = await resetPersonalization();
    if (ok) {
      showToast(
        isBn
          ? "ব্যক্তিগতকরণ প্রোফাইল রিসেট হয়েছে"
          : "Personalization profile has been reset"
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") return;
    setShowDeleteModal(false);
    setDeleteConfirmText("");
    const ok = await deleteProfileData();
    if (ok) {
      showToast(
        isBn
          ? "ব্যক্তিগতকরণ ডাটা স্থায়ীভাবে মুছে ফেলা হয়েছে"
          : "Personalization profile data deleted"
      );
    }
  };

  const handleSubmitDimensionCorrection = async () => {
    if (!correctModalDim || !correctValueInput.trim()) return;
    const rawText = correctValueInput.trim();
    const parsedValue = rawText.includes(",")
      ? rawText
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : rawText;
    const ok = await correctDimension({
      dimension_key: correctModalDim.dimension_key,
      action: "set",
      corrected_value: parsedValue,
      reason: "user_corrected_in_mobile_ui",
    });
    setCorrectModalDim(null);
    setCorrectValueInput("");
    if (ok) {
      showToast(isBn ? "পছন্দ সংশোধন করা হয়েছে" : "Preference corrected");
    }
  };

  const handleRemoveInferredDimension = async (dimKey: string) => {
    const ok = await correctDimension({
      dimension_key: dimKey,
      action: "remove",
      reason: "user_removed_inaccurate_inference",
    });
    if (ok) {
      showToast(isBn ? "অনুমিত তথ্য সরানো হয়েছে" : "Inferred preference removed");
    }
  };

  const inferredDimensions = useMemo(() => {
    if (!profile?.dimensions) return [];
    return Object.values(profile.dimensions).filter(
      (d) =>
        d &&
        d.value !== "unknown" &&
        d.value !== null &&
        d.confidence > 0
    );
  }, [profile]);

  const religiousSelected =
    preferences.travel_styles.includes("religious_travel") ||
    preferences.travel_styles.includes("religious");

  const np = preferences.notification_preferences;
  const discoveryEnabled = np.category_travel_discovery ?? true;

  const destinationChoices = useMemo(() => {
    const merged = new Set([
      ...DESTINATION_OPTIONS,
      ...preferences.favorite_destinations,
    ]);
    return Array.from(merged);
  }, [preferences.favorite_destinations]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      {/* Top Bar */}
      <View
        style={[
          styles.topBar,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.iconBtn}
          accessibilityLabel={isBn ? "ফিরে যান" : "Go back"}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>

        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {isBn ? "ভ্রমণ পছন্দ ও ব্যক্তিগতকরণ" : "Travel Preferences"}
          </Text>
          <Text style={[styles.headerSub, { color: colors.subtext }]}>
            {isBn
              ? "স্মার্ট নোটিফিকেশন ও প্রোফাইল নিয়ন্ত্রণ"
              : "Hyper-Personalized Notification Intelligence"}
          </Text>
        </View>

        <Pressable
          onPress={() => router.push(ROUTES.SCREENS.NOTIFICATIONS as any)}
          style={[
            styles.inboxChip,
            { backgroundColor: colors.primaryLight },
          ]}
        >
          <Ionicons
            name="notifications-outline"
            size={15}
            color={colors.primary}
          />
          <Text style={[styles.inboxChipText, { color: colors.primary }]}>
            {isBn ? "ইনবক্স" : "Inbox"}
          </Text>
        </Pressable>
      </View>

      {/* Status Toast / Sync Notice */}
      {toastMessage && (
        <View
          style={[styles.toastBanner, { backgroundColor: colors.success }]}
        >
          <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
      {error && (
        <View
          style={[
            styles.noticeBanner,
            { backgroundColor: colors.dangerLight, borderColor: colors.danger },
          ]}
        >
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={[styles.noticeText, { color: colors.danger }]}>
            {error}
          </Text>
        </View>
      )}
      {!error && syncNotice && (
        <View
          style={[
            styles.noticeBanner,
            {
              backgroundColor: colors.warningLight,
              borderColor: colors.warning,
            },
          ]}
        >
          <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
          <Text style={[styles.noticeText, { color: colors.text }]}>
            {syncNotice}
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {isLoading && !profile && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.subtext }]}>
              {isBn ? "পছন্দসমূহ লোড হচ্ছে..." : "Loading personalization profile..."}
            </Text>
          </View>
        )}

        {/* 1. Master Personalization & Marketing Opt-Out Card */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {isBn
                  ? "ব্যক্তিগতকৃত অভিজ্ঞতা চালু রাখুন"
                  : "Enable Hyper-Personalization"}
              </Text>
              <Text style={[styles.cardDesc, { color: colors.subtext }]}>
                {isBn
                  ? "বন্ধ করলে শুধুমাত্র জরুরি ও সাধারণ ভ্রমণ আপডেট পাবেন।"
                  : "When disabled, you only receive essential booking & generic notices."}
              </Text>
            </View>
            <Switch
              value={preferences.personalization_enabled}
              onValueChange={(val) => {
                void updatePreferences({ personalization_enabled: val });
              }}
              trackColor={{
                false: isDark ? "#334155" : "#cbd5e1",
                true: colors.primary,
              }}
            />
          </View>

          <View style={styles.quickActionRow}>
            <Pressable
              style={[
                styles.outlineBtn,
                {
                  borderColor: np.category_marketing
                    ? colors.danger
                    : colors.success,
                  backgroundColor: np.category_marketing
                    ? colors.dangerLight
                    : colors.successLight,
                },
              ]}
              onPress={async () => {
                if (np.category_marketing) {
                  await optOut("all_marketing", undefined, "user_clicked_opt_out");
                  showToast(
                    isBn
                      ? "সব মার্কেটিং নোটিফিকেশন বন্ধ হয়েছে"
                      : "Opted out of all marketing alerts"
                  );
                } else {
                  await updatePreferences({ category_marketing: true });
                  showToast(
                    isBn
                      ? "মার্কেটিং অফার চালু হয়েছে"
                      : "Marketing alerts enabled"
                  );
                }
              }}
            >
              <Ionicons
                name={
                  np.category_marketing
                    ? "notifications-off-outline"
                    : "checkmark-circle-outline"
                }
                size={15}
                color={np.category_marketing ? colors.danger : colors.success}
              />
              <Text
                style={[
                  styles.outlineBtnText,
                  {
                    color: np.category_marketing
                      ? colors.danger
                      : colors.success,
                  },
                ]}
              >
                {np.category_marketing
                  ? isBn
                    ? "মার্কেটিং থেকে অপ্ট-আউট করুন"
                    : "Opt Out of Marketing"
                  : isBn
                  ? "মার্কেটিং বন্ধ আছে (চালু করুন)"
                  : "Marketing Opted Out (Re-enable)"}
              </Text>
            </Pressable>

            {isSaving && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>
        </View>

        {/* 2. Favorite Destinations & Consented Location */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {isBn ? "পছন্দের গন্তব্য ও অবস্থান" : "Favorite Destinations & Origin"}
          </Text>
          <Text style={[styles.sectionHint, { color: colors.subtext }]}>
            {isBn
              ? "আপনার প্রিয় গন্তব্য নির্বাচন করুন:"
              : "Tap destinations you love visiting or want alerts for:"}
          </Text>

          <View style={styles.chipGrid}>
            {destinationChoices.map((dest) => {
              const selected = preferences.favorite_destinations.includes(dest);
              return (
                <Pressable
                  key={dest}
                  onPress={() =>
                    updatePreferences({
                      favorite_destinations: toggleItem(
                        preferences.favorite_destinations,
                        dest
                      ),
                    })
                  }
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {dest}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.inlineInputRow}>
            <TextInput
              value={customDestination}
              onChangeText={setCustomDestination}
              placeholder={
                isBn
                  ? "অন্য গন্তব্য যোগ করুন (যেমন: রঙ্গামাটি)"
                  : "Add custom destination (e.g. Rangamati)"
              }
              placeholderTextColor={colors.textMuted}
              style={[
                styles.textInput,
                {
                  flex: 1,
                  color: colors.text,
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                },
              ]}
            />
            <Pressable
              onPress={handleAddCustomDestination}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.addBtnText}>
                {isBn ? "যোগ" : "Add"}
              </Text>
            </Pressable>
          </View>

          {/* Explicit Location Consent */}
          <View
            style={[
              styles.divider,
              { backgroundColor: colors.borderSubtle },
            ]}
          />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>
                {isBn
                  ? "হোম সিটি ও যাত্রা শুরুর অনুমোদন"
                  : "Location & Departure Origin Consent"}
              </Text>
              <Text style={[styles.rowSub, { color: colors.subtext }]}>
                {isBn
                  ? "আপনার সম্মতি ছাড়া কখনোই অবস্থান সংরক্ষণ বা ট্র্যাক করা হয় না।"
                  : "Only stored with explicit consent; never continuously tracked."}
              </Text>
            </View>
            <Switch
              value={preferences.location_consent}
              onValueChange={handleToggleLocationConsent}
              trackColor={{
                false: isDark ? "#334155" : "#cbd5e1",
                true: colors.primary,
              }}
            />
          </View>

          {preferences.location_consent && (
            <View style={{ marginTop: 10, gap: 8 }}>
              <TextInput
                value={homeCityInput}
                onChangeText={setHomeCityInput}
                placeholder={isBn ? "হোম সিটি (যেমন: Dhaka)" : "Home City (e.g. Dhaka)"}
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                  },
                ]}
              />
              <View style={styles.inlineInputRow}>
                <TextInput
                  value={originInput}
                  onChangeText={setOriginInput}
                  placeholder={
                    isBn
                      ? "যাত্রার শহর/বিমানবন্দর (যেমন: DAC)"
                      : "Preferred Travel Origin (e.g. DAC)"
                  }
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.textInput,
                    {
                      flex: 1,
                      color: colors.text,
                      backgroundColor: colors.inputBg,
                      borderColor: colors.inputBorder,
                    },
                  ]}
                />
                <Pressable
                  onPress={handleSaveLocation}
                  style={[styles.addBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.addBtnText}>
                    {isBn ? "সংরক্ষণ" : "Save"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* 3. Travel Interests & Travel Styles */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {isBn ? "ভ্রমণের আগ্রহ ও ধরন" : "Travel Interests & Styles"}
          </Text>

          <Text style={[styles.subHeading, { color: colors.subtext }]}>
            {isBn ? "আগ্রহের বিষয়" : "TRAVEL INTERESTS"}
          </Text>
          <View style={styles.chipGrid}>
            {INTEREST_OPTIONS.map((item) => {
              const selected = preferences.travel_interests.includes(item.key);
              return (
                <Pressable
                  key={item.key}
                  onPress={() =>
                    updatePreferences({
                      travel_interests: toggleItem(
                        preferences.travel_interests,
                        item.key
                      ),
                    })
                  }
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {isBn ? item.bn : item.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text
            style={[
              styles.subHeading,
              { color: colors.subtext, marginTop: 14 },
            ]}
          >
            {isBn ? "ভ্রমণের ধরন (একাধিক বাছাইযোগ্য)" : "TRAVEL STYLES (MULTI-SELECT)"}
          </Text>
          <View style={styles.chipGrid}>
            {STYLE_OPTIONS.map((item) => {
              const selected = preferences.travel_styles.includes(item.key);
              return (
                <Pressable
                  key={item.key}
                  onPress={() =>
                    updatePreferences({
                      travel_styles: toggleItem(
                        preferences.travel_styles,
                        item.key
                      ),
                    })
                  }
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {isBn ? item.bn : item.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Explicit Opt-In Religious Travel */}
          <View
            style={[
              styles.optInBox,
              {
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>
                {isBn
                  ? "ধর্মীয় / তীর্থ ভ্রমণ প্যাকেজ (ঐচ্ছিক অপ্ট-ইন)"
                  : "Religious Travel Packages (Explicit Opt-In)"}
              </Text>
              <Text style={[styles.rowSub, { color: colors.subtext }]}>
                {isBn
                  ? "শুধুমাত্র আপনি চালু করলেই ওমরাহ/হজ বা তীর্থ ভ্রমণ সম্পর্কিত তথ্য পাবেন।"
                  : "Never inferred automatically. Enabled only if you explicitly choose it."}
              </Text>
            </View>
            <Switch
              value={religiousSelected}
              onValueChange={(val) => {
                const base = preferences.travel_styles.filter(
                  (x) => x !== "religious_travel" && x !== "religious"
                );
                updatePreferences({
                  travel_styles: val ? [...base, "religious_travel"] : base,
                });
              }}
              trackColor={{
                false: isDark ? "#334155" : "#cbd5e1",
                true: colors.primary,
              }}
            />
          </View>
        </View>

        {/* 4. Transport & Accommodation */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {isBn ? "যাতায়াত ও আবাসন পছন্দ" : "Transport & Accommodation"}
          </Text>

          <Text style={[styles.subHeading, { color: colors.subtext }]}>
            {isBn ? "পছন্দের যানবাহন" : "PREFERRED TRANSPORT"}
          </Text>
          <View style={styles.chipGrid}>
            {TRANSPORT_OPTIONS.map((item) => {
              const selected = preferences.preferred_transport.includes(item.key);
              return (
                <Pressable
                  key={item.key}
                  onPress={() =>
                    updatePreferences({
                      preferred_transport: toggleItem(
                        preferences.preferred_transport,
                        item.key
                      ),
                    })
                  }
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {isBn ? item.bn : item.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text
            style={[
              styles.subHeading,
              { color: colors.subtext, marginTop: 14 },
            ]}
          >
            {isBn ? "পছন্দের আবাসন" : "PREFERRED ACCOMMODATION"}
          </Text>
          <View style={styles.chipGrid}>
            {ACCOMMODATION_OPTIONS.map((item) => {
              const selected = preferences.preferred_accommodation.includes(
                item.key
              );
              return (
                <Pressable
                  key={item.key}
                  onPress={() =>
                    updatePreferences({
                      preferred_accommodation: toggleItem(
                        preferences.preferred_accommodation,
                        item.key
                      ),
                    })
                  }
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {isBn ? item.bn : item.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text
            style={[
              styles.subHeading,
              { color: colors.subtext, marginTop: 14 },
            ]}
          >
            {isBn ? "পছন্দের সুবিধাসমূহ" : "PREFERRED AMENITIES"}
          </Text>
          <View style={styles.chipGrid}>
            {AMENITY_OPTIONS.map((item) => {
              const selected = preferences.preferred_amenities.includes(item.key);
              return (
                <Pressable
                  key={item.key}
                  onPress={() =>
                    updatePreferences({
                      preferred_amenities: toggleItem(
                        preferences.preferred_amenities,
                        item.key
                      ),
                    })
                  }
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {isBn ? item.bn : item.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 5. Budget Tier, Price Sensitivity, Language & Tone */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {isBn ? "বাজেট, ভাষা ও বার্তার ধরন" : "Budget, Language & Tone"}
          </Text>

          <Text style={[styles.subHeading, { color: colors.subtext }]}>
            {isBn ? "বাজেট স্তর" : "BUDGET TIER"}
          </Text>
          <View style={styles.chipGrid}>
            {BUDGET_TIERS.map((tier) => {
              const selected = preferences.budget_tier === tier.key;
              return (
                <Pressable
                  key={tier.key}
                  onPress={() => updatePreferences({ budget_tier: tier.key })}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {isBn ? tier.bn : tier.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text
            style={[
              styles.subHeading,
              { color: colors.subtext, marginTop: 14 },
            ]}
          >
            {isBn ? "মূল্য ও অফার সংবেদনশীলতা" : "PRICE SENSITIVITY"}
          </Text>
          <View style={styles.chipGrid}>
            {PRICE_SENSITIVITY_OPTIONS.map((opt) => {
              const selected = preferences.price_sensitivity_level === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() =>
                    updatePreferences({ price_sensitivity_level: opt.key })
                  }
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {isBn ? opt.bn : opt.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text
            style={[
              styles.subHeading,
              { color: colors.subtext, marginTop: 14 },
            ]}
          >
            {isBn ? "নোটিফিকেশনের ভাষা" : "NOTIFICATION LANGUAGE"}
          </Text>
          <View style={styles.chipGrid}>
            {(
              [
                { key: "en", label: "English (EN)" },
                { key: "bn", label: "বাংলা (BN)" },
              ] as const
            ).map((l) => {
              const selected = preferences.preferred_language === l.key;
              return (
                <Pressable
                  key={l.key}
                  onPress={() => handleLanguageSelect(l.key)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {l.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text
            style={[
              styles.subHeading,
              { color: colors.subtext, marginTop: 14 },
            ]}
          >
            {isBn ? "বার্তার ধরন" : "COMMUNICATION TONE"}
          </Text>
          <View style={styles.chipGrid}>
            {TONE_OPTIONS.map((tone) => {
              const selected = preferences.communication_tone === tone.key;
              return (
                <Pressable
                  key={tone.key}
                  onPress={() =>
                    updatePreferences({ communication_tone: tone.key })
                  }
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {isBn ? tone.bn : tone.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 6. Cadence, Digest, Window, Quiet Hours, Channels & Categories */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {isBn
              ? "সময়সূচী, চ্যানেল ও ক্যাটাগরি নিয়ন্ত্রণ"
              : "Timing, Channels & Category Opt-Ins"}
          </Text>

          {/* Frequency Cap Stepper */}
          <View style={styles.stepperRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>
                {isBn
                  ? "দৈনিক সর্বোচ্চ প্রোমো সীমা"
                  : "Daily Promotional Frequency Cap"}
              </Text>
              <Text style={[styles.rowSub, { color: colors.subtext }]}>
                {isBn
                  ? "জরুরি বুকিং বা ফ্লাইট সতর্কতা এতে বাধাগ্রস্ত হয় না।"
                  : "Essential booking & safety alerts bypass this cap."}
              </Text>
            </View>
            <View style={styles.stepperControls}>
              <Pressable
                onPress={() =>
                  updatePreferences({
                    frequency_cap_marketing_per_day: Math.max(
                      0,
                      np.frequency_cap_marketing_per_day - 1
                    ),
                  })
                }
                style={[styles.stepBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.stepBtnText, { color: colors.text }]}>
                  −
                </Text>
              </Pressable>
              <Text style={[styles.stepValue, { color: colors.primary }]}>
                {np.frequency_cap_marketing_per_day}
              </Text>
              <Pressable
                onPress={() =>
                  updatePreferences({
                    frequency_cap_marketing_per_day: Math.min(
                      15,
                      np.frequency_cap_marketing_per_day + 1
                    ),
                  })
                }
                style={[styles.stepBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.stepBtnText, { color: colors.text }]}>
                  +
                </Text>
              </Pressable>
            </View>
          </View>

          <Text
            style={[
              styles.subHeading,
              { color: colors.subtext, marginTop: 12 },
            ]}
          >
            {isBn ? "ট্রাভেল ডাইজেস্ট" : "TRAVEL DIGEST FREQUENCY"}
          </Text>
          <View style={styles.chipGrid}>
            {DIGEST_OPTIONS.map((d) => {
              const selected = preferences.digest_frequency === d.key;
              return (
                <Pressable
                  key={d.key}
                  onPress={() =>
                    updatePreferences({ digest_frequency: d.key })
                  }
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {isBn ? d.bn : d.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text
            style={[
              styles.subHeading,
              { color: colors.subtext, marginTop: 14 },
            ]}
          >
            {isBn ? "পছন্দের নোটিফিকেশন সময়" : "PREFERRED NOTIFICATION WINDOW"}
          </Text>
          <View style={styles.chipGrid}>
            {SEND_WINDOW_OPTIONS.map((w) => {
              const selected = preferences.preferred_send_window === w.key;
              return (
                <Pressable
                  key={w.key}
                  onPress={() =>
                    updatePreferences({ preferred_send_window: w.key })
                  }
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#FFFFFF" : colors.text },
                    ]}
                  >
                    {isBn ? w.bn : w.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Quiet Hours */}
          <View
            style={[
              styles.divider,
              { backgroundColor: colors.borderSubtle },
            ]}
          />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>
                {isBn ? "নীরব সময় (Quiet Hours)" : "Quiet Hours"}
              </Text>
              <Text style={[styles.rowSub, { color: colors.subtext }]}>
                {isBn
                  ? "নন-ক্রিটিকাল অফার ও ডাইজেস্ট স্থগিত থাকবে"
                  : "Pauses non-critical promos & digests during rest hours"}
              </Text>
            </View>
            <Switch
              value={np.quiet_hours_enabled}
              onValueChange={(val) => {
                void updatePreferences({ quiet_hours_enabled: val });
              }}
              trackColor={{
                false: isDark ? "#334155" : "#cbd5e1",
                true: colors.primary,
              }}
            />
          </View>

          {np.quiet_hours_enabled && (
            <View style={styles.quietHoursRow}>
              <TextInput
                value={quietStartInput}
                onChangeText={setQuietStartInput}
                placeholder="22:00"
                style={[
                  styles.timeInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                  },
                ]}
              />
              <Text style={{ color: colors.subtext }}>→</Text>
              <TextInput
                value={quietEndInput}
                onChangeText={setQuietEndInput}
                placeholder="07:00"
                style={[
                  styles.timeInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                  },
                ]}
              />
              <Pressable
                onPress={() =>
                  updatePreferences({
                    quiet_hours_start: quietStartInput.trim() || "22:00",
                    quiet_hours_end: quietEndInput.trim() || "07:00",
                  })
                }
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.addBtnText}>
                  {isBn ? "সেট" : "Apply"}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Channels */}
          <Text
            style={[
              styles.subHeading,
              { color: colors.subtext, marginTop: 14 },
            ]}
          >
            {isBn ? "পুশ ও ডিভাইস সিঙ্ক" : "PUSH PERMISSION & DEVICE REGISTRATION"}
          </Text>
          <View
            style={{
              backgroundColor: colors.surfaceSubtle,
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: colors.borderSubtle,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>
                {isBn ? "পুশ অনুমতি স্ট্যাটাস" : "Device Push Status"}:{" "}
                <Text style={{ color: pushStatus === "granted" ? "#10B981" : "#F59E0B" }}>
                  {pushStatus.toUpperCase()}
                </Text>
              </Text>
              <Text style={[styles.rowSub, { color: colors.subtext }]}>
                {isBn
                  ? "Expo Push টোকেন নিরাপদভাবে সার্ভারে রেজিস্টার করুন"
                  : "Registers Expo Push token with your notification profile"}
              </Text>
            </View>
            <Pressable
              onPress={handleEnablePushAndSync}
              disabled={pushSyncing}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.addBtnText}>
                {pushSyncing
                  ? isBn
                    ? "সিঙ্ক হচ্ছে..."
                    : "Syncing..."
                  : pushStatus === "granted"
                  ? isBn
                    ? "রিসিঙ্ক"
                    : "Re-Sync"
                  : isBn
                  ? "অনুমতি দিন"
                  : "Enable"}
              </Text>
            </Pressable>
          </View>

          <Text
            style={[
              styles.subHeading,
              { color: colors.subtext, marginTop: 6 },
            ]}
          >
            {isBn ? "যোগাযোগের চ্যানেল" : "DELIVERY CHANNELS"}
          </Text>
          {(
            [
              { key: "push_enabled", en: "Push Notifications", bn: "পুশ নোটিফিকেশন" },
              { key: "in_app_enabled", en: "In-App Inbox", bn: "অ্যাপ ইনবক্স" },
              { key: "email_enabled", en: "Email", bn: "ইমেইল" },
              { key: "sms_enabled", en: "SMS Alerts", bn: "এসএমএস (SMS)" },
            ] as const
          ).map((ch) => (
            <View key={ch.key} style={styles.toggleRow}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>
                {isBn ? ch.bn : ch.en}
              </Text>
              <Switch
                value={Boolean(np[ch.key])}
                onValueChange={(val) => { void updatePreferences({ [ch.key]: val }); }}
                trackColor={{
                  false: isDark ? "#334155" : "#cbd5e1",
                  true: colors.primary,
                }}
              />
            </View>
          ))}

          {/* Categories */}
          <Text
            style={[
              styles.subHeading,
              { color: colors.subtext, marginTop: 14 },
            ]}
          >
            {isBn ? "নোটিফিকেশন ক্যাটাগরি" : "NOTIFICATION CATEGORIES"}
          </Text>
          {(
            [
              { key: "category_booking", en: "Bookings & Receipts", bn: "বুকিং ও রসিদ" },
              { key: "category_security", en: "Account Security", bn: "নিরাপত্তা সতর্কতা" },
              { key: "category_flight_alerts", en: "Flight & Disruption Alerts", bn: "ফ্লাইট ও যাত্রা আপডেট" },
              { key: "category_price_alerts", en: "Price Drop Alerts", bn: "দাম কমার সতর্কতা" },
              { key: "category_marketing", en: "Marketing & Offers", bn: "অফার ও প্রচারণা" },
              { key: "category_community", en: "Community Activity", bn: "কমিউনিটি" },
            ] as const
          ).map((cat) => (
            <View key={cat.key} style={styles.toggleRow}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>
                {isBn ? cat.bn : cat.en}
              </Text>
              <Switch
                value={Boolean(np[cat.key])}
                onValueChange={(val) => { void updatePreferences({ [cat.key]: val }); }}
                trackColor={{
                  false: isDark ? "#334155" : "#cbd5e1",
                  true: colors.primary,
                }}
              />
            </View>
          ))}

          <View style={styles.toggleRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              {isBn ? "ট্রাভেল ডিসকভারি পরামর্শ" : "Travel Discovery"}
            </Text>
            <Switch
              value={Boolean(discoveryEnabled)}
              onValueChange={(val) => {
                void updatePreferences({
                  extra_preferences: {
                    ...(preferences.extra_preferences || {}),
                    category_travel_discovery: val,
                  },
                });
              }}
              trackColor={{
                false: isDark ? "#334155" : "#cbd5e1",
                true: colors.primary,
              }}
            />
          </View>
        </View>

        {/* 7. Review & Correct Inferred Preferences (20-Dimensional Transparency) */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {isBn
                  ? "অনুমিত আগ্রহ ও প্রোফাইল পর্যালোচনা"
                  : "Inferred Interests & 20D Profile Review"}
              </Text>
              <Text style={[styles.sectionHint, { color: colors.subtext }]}>
                {isBn
                  ? "ভুল অনুমিত পছন্দ সংশোধন বা মুছে ফেলতে পারবেন।"
                  : "Inspect what the system learned from your activity and correct or remove inaccurate items."}
              </Text>
            </View>
          </View>

          {profile ? (
            <>
              <View
                style={[
                  styles.profileSummaryGrid,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.summaryCell}>
                  <Text style={[styles.summaryLabel, { color: colors.subtext }]}>
                    {isBn ? "আস্থা" : "Confidence"}
                  </Text>
                  <Text style={[styles.summaryVal, { color: colors.primary }]}>
                    {Math.round(profile.overall_confidence)}% (
                    {profile.confidence_tier})
                  </Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={[styles.summaryLabel, { color: colors.subtext }]}>
                    {isBn ? "ভ্রমণ ধাপ" : "Timeline"}
                  </Text>
                  <Text style={[styles.summaryVal, { color: colors.text }]}>
                    {profile.travel_timeline_stage.replace(/_/g, " ")}
                  </Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={[styles.summaryLabel, { color: colors.subtext }]}>
                    {isBn ? "সক্রিয়তা" : "Activity"}
                  </Text>
                  <Text style={[styles.summaryVal, { color: colors.text }]}>
                    {profile.activity_level.replace(/_/g, " ")}
                  </Text>
                </View>
              </View>

              {profile.top_destinations.length > 0 && (
                <>
                  <Text
                    style={[
                      styles.subHeading,
                      { color: colors.subtext, marginTop: 12 },
                    ]}
                  >
                    {isBn ? "শীর্ষ গন্তব্য আগ্রহ" : "TOP DESTINATION INTERESTS"}
                  </Text>
                  {profile.top_destinations.map((item) => (
                    <View
                      key={item.destination}
                      style={[
                        styles.dimRow,
                        { borderBottomColor: colors.borderSubtle },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.dimName, { color: colors.text }]}>
                          {item.destination}
                          {item.is_explicit_favorite ? " ★" : ""}
                        </Text>
                        <Text style={[styles.dimMeta, { color: colors.subtext }]}>
                          {isBn ? "স্কোর" : "Score"}: {Math.round(item.score)}/100 •{" "}
                          {isBn ? "আস্থা" : "Confidence"}:{" "}
                          {Math.round(item.confidence)}% •{" "}
                          {item.is_explicit_favorite
                            ? isBn
                              ? "আপনার পছন্দ"
                              : "Explicit favorite"
                            : isBn
                            ? "আচরণগত অনুমান"
                            : "Behavioral signal"}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              <Text
                style={[
                  styles.subHeading,
                  { color: colors.subtext, marginTop: 14 },
                ]}
              >
                {isBn ? "সক্রিয় মাত্রা ও সংশোধন" : "ACTIVE DIMENSIONS"}
              </Text>
              {inferredDimensions.length === 0 ? (
                <Text style={[styles.emptyDimText, { color: colors.subtext }]}>
                  {isBn
                    ? "এখনও কোনো অনুমিত মাত্রা তৈরি হয়নি।"
                    : "No inferred dimensions recorded yet. Select preferences above or browse destinations."}
                </Text>
              ) : (
                inferredDimensions.map((dim) => (
                  <View
                    key={dim.dimension_key}
                    style={[
                      styles.dimRow,
                      { borderBottomColor: colors.borderSubtle },
                    ]}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.dimName, { color: colors.text }]}>
                        {dim.dimension_key.replace(/_/g, " ")}
                      </Text>
                      <Text style={[styles.dimVal, { color: colors.text }]}>
                        {formatDimensionValue(dim.value, isBn)}
                      </Text>
                      <Text style={[styles.dimMeta, { color: colors.subtext }]}>
                        {isBn ? "আস্থা" : "Confidence"}:{" "}
                        {Math.round(dim.confidence)}% •{" "}
                        {isBn ? "উৎস" : "Source"}: {dim.source}
                      </Text>
                    </View>
                    <View style={styles.dimActions}>
                      <Pressable
                        onPress={() => {
                          setCorrectModalDim(dim);
                          setCorrectValueInput(
                            formatDimensionValue(dim.value, false)
                          );
                        }}
                        style={[
                          styles.dimActionBtn,
                          { backgroundColor: colors.primaryLight },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dimActionText,
                            { color: colors.primary },
                          ]}
                        >
                          {isBn ? "সংশোধন" : "Correct"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          handleRemoveInferredDimension(dim.dimension_key)
                        }
                        style={[
                          styles.dimActionBtn,
                          { backgroundColor: colors.dangerLight },
                        ]}
                      >
                        <Text
                          style={[
                            styles.dimActionText,
                            { color: colors.danger },
                          ]}
                        >
                          {isBn ? "মুছুন" : "Remove"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </>
          ) : (
            <Text style={[styles.emptyDimText, { color: colors.subtext }]}>
              {isBn
                ? "প্রোফাইল পর্যালোচনা অফলাইনে উপলব্ধ নয়।"
                : "Sign in and connect to review your live 20-dimensional inferred profile."}
            </Text>
          )}
        </View>

        {/* 8. Data Privacy: Reset & Delete Profile Data */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.danger },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.danger }]}>
            {isBn ? "ডাটা নিয়ন্ত্রণ ও গোপনীয়তা" : "Data Privacy & Controls"}
          </Text>
          <Text style={[styles.sectionHint, { color: colors.subtext }]}>
            {isBn
              ? "আপনি যেকোনো সময় আপনার ব্যক্তিগতকরণ ইতিহাস রিসেট বা সম্পূর্ণ মুছে ফেলতে পারেন।"
              : "Reset behavioral inferences or permanently delete all personalization profile records."}
          </Text>

          <View style={styles.dangerActionsRow}>
            <Pressable
              onPress={() => setShowResetModal(true)}
              style={[
                styles.dangerOutlineBtn,
                { borderColor: colors.warning, backgroundColor: colors.warningLight },
              ]}
            >
              <Ionicons name="refresh-outline" size={16} color={colors.warning} />
              <Text style={[styles.dangerBtnText, { color: colors.text }]}>
                {isBn ? "ব্যক্তিগতকরণ রিসেট" : "Reset Personalization"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShowDeleteModal(true)}
              style={[
                styles.dangerOutlineBtn,
                { borderColor: colors.danger, backgroundColor: colors.dangerLight },
              ]}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.dangerBtnText, { color: colors.danger }]}>
                {isBn ? "প্রোফাইল ডাটা মুছুন" : "Delete Profile Data"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Correct Dimension Modal */}
      <Modal
        visible={Boolean(correctModalDim)}
        transparent
        animationType="fade"
        onRequestClose={() => setCorrectModalDim(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {isBn ? "পছন্দ সংশোধন করুন" : "Correct Preference"}
            </Text>
            <Text style={[styles.modalBody, { color: colors.subtext }]}>
              {correctModalDim?.dimension_key.replace(/_/g, " ")}
            </Text>
            <TextInput
              value={correctValueInput}
              onChangeText={setCorrectValueInput}
              placeholder={
                isBn ? "নতুন মান লিখুন..." : "Enter corrected value (comma-separated for lists)"
              }
              placeholderTextColor={colors.textMuted}
              style={[
                styles.textInput,
                {
                  color: colors.text,
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  marginBottom: 14,
                },
              ]}
            />
            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setCorrectModalDim(null)}
                style={[styles.modalCancelBtn, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.text }]}>
                  {isBn ? "বাতিল" : "Cancel"}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSubmitDimensionCorrection}
                style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.modalConfirmText}>
                  {isBn ? "সংরক্ষণ" : "Save Correction"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reset Personalization Confirmation Modal */}
      <Modal
        visible={showResetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResetModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Ionicons name="refresh-circle" size={38} color={colors.warning} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {isBn ? "ব্যক্তিগতকরণ রিসেট করবেন?" : "Reset Personalization?"}
            </Text>
            <Text style={[styles.modalBody, { color: colors.subtext }]}>
              {isBn
                ? "আপনার আচরণগত সিগন্যাল ও অনুমিত আগ্রহ মুছে গিয়ে নতুন প্রোফাইল হিসেবে শুরু হবে।"
                : "This clears inferred interests and behavioral history while keeping your core account safe."}
            </Text>
            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setShowResetModal(false)}
                style={[styles.modalCancelBtn, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.text }]}>
                  {isBn ? "বাতিল" : "Cancel"}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmReset}
                style={[styles.modalConfirmBtn, { backgroundColor: colors.warning }]}
              >
                <Text style={styles.modalConfirmText}>
                  {isBn ? "রিসেট করুন" : "Confirm Reset"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Profile Data Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Ionicons name="warning" size={38} color={colors.danger} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {isBn ? "প্রোফাইল ডাটা মুছে ফেলবেন?" : "Delete Profile Data?"}
            </Text>
            <Text style={[styles.modalBody, { color: colors.subtext }]}>
              {isBn
                ? "নিশ্চিত করতে নিচে DELETE লিখুন। আপনার সব ব্যক্তিগতকরণ ডাটা স্থায়ীভাবে মুছে যাবে।"
                : "Type DELETE to permanently erase all personalization preferences, signals, and inferred dimensions."}
            </Text>
            <TextInput
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="DELETE"
              autoCapitalize="characters"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.textInput,
                {
                  width: "100%",
                  textAlign: "center",
                  color: colors.text,
                  backgroundColor: colors.inputBg,
                  borderColor: colors.border,
                  marginBottom: 14,
                },
              ]}
            />
            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText("");
                }}
                style={[styles.modalCancelBtn, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.text }]}>
                  {isBn ? "বাতিল" : "Cancel"}
                </Text>
              </Pressable>
              <Pressable
                disabled={deleteConfirmText.trim().toUpperCase() !== "DELETE"}
                onPress={handleConfirmDelete}
                style={[
                  styles.modalConfirmBtn,
                  {
                    backgroundColor:
                      deleteConfirmText.trim().toUpperCase() === "DELETE"
                        ? colors.danger
                        : "#fca5a5",
                  },
                ]}
              >
                <Text style={styles.modalConfirmText}>
                  {isBn ? "স্থায়ীভাবে মুছুন" : "Delete Forever"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  inboxChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  inboxChipText: { fontSize: 12, fontWeight: "700" },
  toastBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toastText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  noticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  noticeText: { flex: 1, fontSize: 12 },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    gap: 16,
    maxWidth: 840,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 48,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  loadingText: { fontSize: 12 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardDesc: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  quickActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  outlineBtnText: { fontSize: 12, fontWeight: "700" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  sectionHint: { fontSize: 12, marginBottom: 12, lineHeight: 17 },
  subHeading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: "600" },
  inlineInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  textInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  addBtn: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  divider: { height: 1, marginVertical: 14 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  rowLabel: { fontSize: 14, fontWeight: "600" },
  rowSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  optInBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 14,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: { fontSize: 16, fontWeight: "700" },
  stepValue: { fontSize: 16, fontWeight: "800", minWidth: 22, textAlign: "center" },
  quietHoursRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  timeInput: {
    width: 82,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },
  profileSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  summaryCell: { minWidth: 96, flex: 1 },
  summaryLabel: { fontSize: 11, fontWeight: "600" },
  summaryVal: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  dimRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dimName: { fontSize: 13, fontWeight: "700", textTransform: "capitalize" },
  dimVal: { fontSize: 12, marginTop: 2 },
  dimMeta: { fontSize: 11, marginTop: 2 },
  dimActions: { flexDirection: "row", gap: 6 },
  dimActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  dimActionText: { fontSize: 11, fontWeight: "700" },
  emptyDimText: { fontSize: 12, fontStyle: "italic", paddingVertical: 8 },
  dangerActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  dangerOutlineBtn: {
    flex: 1,
    minWidth: 150,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  dangerBtnText: { fontSize: 13, fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
  },
  modalTitle: { fontSize: 17, fontWeight: "700", marginTop: 8, marginBottom: 6 },
  modalBody: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 14,
  },
  modalBtnRow: { flexDirection: "row", gap: 10, width: "100%" },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 13, fontWeight: "600" },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
  },
  modalConfirmText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});

export default TravelPreferencesScreen;
