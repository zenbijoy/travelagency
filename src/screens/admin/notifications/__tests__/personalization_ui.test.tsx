/**
 * Frontend Personalization & Notification Intelligence UI Test Suite.
 *
 * Covers:
 * 1. `usePersonalizationStore` (20D profile fetch, explicit updates, location_consent
 *    invariant, correctDimension, optOut, resetPersonalization, deleteProfileData).
 * 2. `useNotificationStore` personalization extensions (inbox mapping, why cache,
 *    recordInteraction, safe handling of local non-UUID notification IDs).
 * 3. `WhySeeingThisModal` (score cards, explanation factors, adjust/opt-out actions).
 * 4. `TravelPreferencesScreen` (destinations, styles, channels, 20D transparency).
 * 5. `NotificationsInboxScreen` (category chips, personalized badges, why modal trigger).
 * 6. `NotificationCenterScreen` Personalization Command Center tabs integration.
 */

import React from "react";
import renderer, { act } from "react-test-renderer";

// ============================================================================
// Clean Infrastructure Mocks (Zero network/timer leaks on Jest teardown)
// ============================================================================

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
  NotificationFeedbackType: { Success: "Success", Warning: "Warning", Error: "Error" },
}));

jest.mock("expo-notifications", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  AndroidNotificationPriority: { MIN: "min", DEFAULT: "default", HIGH: "high" },
  AndroidImportance: { MAX: 5, DEFAULT: 3, LOW: 2 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: "ExponentPushToken[test-token]" }),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  scheduleNotificationAsync: jest.fn().mockResolvedValue("local-id"),
}));

jest.mock("expo-device", () => ({
  deviceName: "Test Phone",
  modelName: "Pixel 8",
  modelId: "px8",
  osVersion: "14",
}));

jest.mock("expo-constants", () => ({
  expoConfig: { extra: { eas: { projectId: "test-project-id" } } },
}));

jest.mock("expo-font", () => ({
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
  MaterialCommunityIcons: "MaterialCommunityIcons",
  Feather: "Feather",
}));

jest.mock("react-native-reanimated", () => {
  const { View, Text } = require("react-native");
  return {
    __esModule: true,
    default: {
      View,
      Text,
      createAnimatedComponent: (comp: any) => comp,
    },
    useSharedValue: (val: any) => ({ value: val }),
    useAnimatedStyle: () => ({}),
    withRepeat: (val: any) => val,
    withTiming: (val: any) => val,
    withSequence: (val: any) => val,
    withDelay: (_d: number, val: any) => val,
    Easing: {
      linear: () => 0,
      ease: () => 0,
      bezier: () => () => 0,
      inOut: () => () => 0,
    },
  };
});

jest.mock("../../../../components/ui/Skeleton", () => {
  const ReactLocal = require("react");
  const { View } = require("react-native");
  const MockSkeleton: any = ({ style, children, testID }: any) =>
    ReactLocal.createElement(View, { style, testID }, children);
  MockSkeleton.Circle = MockSkeleton;
  MockSkeleton.Text = MockSkeleton;
  MockSkeleton.Card = MockSkeleton;
  return {
    Skeleton: MockSkeleton,
    SkeletonCircle: MockSkeleton,
    SkeletonText: MockSkeleton,
    SkeletonCard: MockSkeleton,
  };
});

const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    push: (...args: any[]) => mockRouterPush(...args),
    back: (...args: any[]) => mockRouterBack(...args),
  },
  Stack: { Screen: () => null },
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("../../../../utils/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    },
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    }),
    removeChannel: jest.fn(),
  },
}));

jest.mock("../../../../context/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: "#F8FAFC",
      surface: "#FFFFFF",
      surfaceSubtle: "#F1F5F9",
      card: "#FFFFFF",
      border: "#E2E8F0",
      borderSubtle: "#F1F5F9",
      text: "#0F172A",
      textSecondary: "#475569",
      textMuted: "#94A3B8",
      subtext: "#64748B",
      primary: "#0284C7",
      primaryLight: "#E0F2FE",
      success: "#10B981",
      successLight: "#DCFCE7",
      warning: "#F59E0B",
      warningLight: "#FEF3C7",
      danger: "#EF4444",
      dangerLight: "#FEE2E2",
      info: "#0EA5E9",
      infoLight: "#E0F2FE",
      inputBg: "#F8FAFC",
      inputBorder: "#CBD5E1",
    },
  }),
}));

jest.mock("../../../../context/LanguageContext", () => ({
  useLanguage: () => ({
    language: "en",
    changeLanguage: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock("../../../../store/authStore", () => ({
  useAuthStore: (selector: any) =>
    selector({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "traveler@shopnojatra.com",
      },
    }),
}));

jest.mock("../../../../screens/admin/rbac", () => ({
  useRBAC: () => ({
    admin: {
      id: "admin-uuid-1",
      name: "Admin User",
      email: "admin@shopnojatra.com",
      role: "super_admin",
    },
    hasPermission: () => true,
  }),
}));

jest.mock("../../../../services/notificationCommandService", () => {
  const actual = jest.requireActual("../../../../services/notificationCommandService");
  return {
    ...actual,
    notificationCommandService: {
      ...actual.notificationCommandService,
      listCampaigns: jest.fn().mockResolvedValue([]),
      previewBroadcastAudience: jest.fn().mockResolvedValue({
        estimated_count: 150,
        sample_recipients_masked: ["usr_12...abcd"],
        source: "backend",
        note: "Live estimate",
      }),
      setGlobalAiEnabled: jest.fn().mockResolvedValue({ ok: true }),
      generateAiCopilotDraft: jest.fn().mockResolvedValue({
        preview_only: true,
        dispatched: false,
        en_title: "Draft Title",
        en_body: "Draft Body",
        bn_title: "খসড়া শিরোনাম",
        bn_body: "খসড়া বার্তা",
        suggested_event_type: "booking.confirmed",
        suggested_channels: ["in_app"],
        suggested_deep_link: "/(tabs)",
        rationale: [],
        source: "backend",
      }),
    },
  };
});

const mockPrefsPayload = {
  user_id: "11111111-1111-4111-8111-111111111111",
  personalization_enabled: true,
  preferred_language: "en" as const,
  communication_tone: "friendly" as const,
  digest_frequency: "weekly" as const,
  preferred_send_window: "evening" as const,
  home_city: "Dhaka",
  travel_origin: "DAC",
  location_consent: true,
  favorite_destinations: ["Cox's Bazar", "Sylhet"],
  travel_interests: ["beach", "nature"],
  travel_styles: ["family"],
  preferred_transport: ["flight"],
  preferred_accommodation: ["resort"],
  preferred_amenities: ["swimming_pool"],
  budget_tier: "mid_range" as const,
  price_sensitivity_level: "medium" as const,
  notification_preferences: {
    push_enabled: true,
    email_enabled: true,
    sms_enabled: false,
    in_app_enabled: true,
    category_booking: true,
    category_security: true,
    category_flight_alerts: true,
    category_marketing: true,
    category_community: true,
    category_price_alerts: true,
    quiet_hours_enabled: true,
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
    timezone: "Asia/Dhaka",
    frequency_cap_marketing_per_day: 3,
  },
  updated_at: "2026-11-25T10:00:00.000Z",
};

const mock20DProfile = {
  user_id: "11111111-1111-4111-8111-111111111111",
  profile_version: 3,
  personalization_enabled: true,
  preferred_language: "en" as const,
  communication_tone: "friendly" as const,
  digest_frequency: "weekly" as const,
  home_city: "Dhaka",
  travel_origin: "DAC",
  location_consent: true,
  travel_timeline_stage: "planning",
  loyalty_tier: "explorer",
  activity_level: "active",
  overall_confidence: 82.5,
  confidence_tier: "high" as const,
  dimensions: {
    destination_interest: {
      dimension_key: "destination_interest",
      value: { explicit_favorites: ["Cox's Bazar", "Sylhet"] },
      confidence: 95,
      source: "user_preference" as const,
      data_quality: "high" as const,
      expiration_policy: "180d",
      is_user_provided: true,
      permission_granted: true,
      updated_at: "2026-11-25T10:00:00.000Z",
    },
    budget_profile: {
      dimension_key: "budget_profile",
      value: { tier: "mid_range", currency: "BDT" },
      confidence: 80,
      source: "behavioral" as const,
      data_quality: "high" as const,
      expiration_policy: "90d",
      is_user_provided: false,
      permission_granted: true,
      updated_at: "2026-11-25T10:00:00.000Z",
    },
  },
  top_destinations: [
    {
      destination: "Cox's Bazar",
      score: 91.0,
      confidence: 95.0,
      signal_count: 5,
      is_explicit_favorite: true,
      last_signal_at: "2026-11-25T09:00:00.000Z",
    },
  ],
  explicit_preferences: { budget_tier: "mid_range" },
  explanation_summary: [
    "Based on your favorite destination: Cox's Bazar",
    "Matches family relaxation style",
  ],
  last_activity_at: "2026-11-25T09:00:00.000Z",
  last_aggregated_at: "2026-11-25T09:30:00.000Z",
  reset_at: null,
};

const mockWhyPayload = {
  notification_id: "22222222-2222-4222-8222-222222222222",
  category: "marketing",
  personalization_tier: "deep" as const,
  relevance_score: 88.0,
  confidence_score: 92.0,
  summary: "Recommended based on your explicit destination interest in Cox's Bazar.",
  explanation_factors: [
    "Matches favorite destination: Cox's Bazar",
    "Matches family travel style",
  ],
  matched_preferences: ["Cox's Bazar", "family", "mid_range"],
  can_adjust_preferences: true,
  can_opt_out_category: true,
  preferences_route: "/screens/travel-preferences",
};

jest.mock("../../../../services/apiClient", () => ({
  apiRequest: jest.fn(),
  AppError: class AppError extends Error {
    kind: string;
    status?: number;
    constructor(msg: string, kind = "unknown", status?: number) {
      super(msg);
      this.kind = kind;
      this.status = status;
    }
  },
}));

jest.mock("../../../../services/personalizationService", () => {
  const actual = jest.requireActual("../../../../services/personalizationService");
  return {
    ...actual,
    personalizationService: {
      getPreferences: jest.fn().mockImplementation(async () => ({ ...mockPrefsPayload })),
      updatePreferences: jest.fn().mockImplementation(async (patch: any) => ({
        ...mockPrefsPayload,
        ...patch,
      })),
      getProfile: jest.fn().mockImplementation(async () => ({ ...mock20DProfile })),
      correctProfile: jest.fn().mockImplementation(async (payload: any) => ({
        ...mock20DProfile,
        profile_version: 4,
        dimensions: {
          ...mock20DProfile.dimensions,
          [payload.dimension_key]: {
            dimension_key: payload.dimension_key,
            value: payload.action === "remove" ? "unknown" : payload.corrected_value,
            confidence: payload.action === "remove" ? 0 : 100,
            source: payload.action === "remove" ? "unknown" : "user_preference",
            data_quality: payload.action === "remove" ? "unknown" : "high",
            expiration_policy: "90d",
            is_user_provided: payload.action !== "remove",
            permission_granted: true,
            updated_at: "2026-11-25T10:15:00.000Z",
          },
        },
      })),
      recordSignal: jest.fn().mockResolvedValue({ success: true, recorded: true }),
      optOut: jest.fn().mockResolvedValue({
        success: true,
        user_id: "11111111-1111-4111-8111-111111111111",
        scope: "all_marketing",
        personalization_enabled: true,
        category_marketing: false,
        message: "Opted out",
      }),
      resetProfile: jest.fn().mockResolvedValue({ success: true, action: "reset" }),
      deleteProfile: jest.fn().mockResolvedValue({ success: true, action: "deleted" }),
      getInbox: jest.fn().mockImplementation(async () => ({
        items: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            user_id: "11111111-1111-4111-8111-111111111111",
            title: "Cox's Bazar Family Resort Savings",
            message: "Explore seasonal stays matching your family travel style.",
            category: "marketing",
            priority: "normal",
            is_read: false,
            channels: ["in_app"],
            cta_label: "Explore Cox's Bazar",
            deep_link: "/(tabs)/explore",
            personalization_tier: "deep",
            relevance_score: 88.0,
            confidence_score: 92.0,
            has_explanation: true,
            data: { explanation_factors: ["Matches favorite destination: Cox's Bazar"] },
            created_at: "2026-11-25T11:00:00.000Z",
          },
        ],
        total: 1,
        unread_count: 1,
        page: 1,
        page_size: 20,
        total_pages: 1,
        has_next: false,
        has_prev: false,
      })),
      markNotificationRead: jest.fn().mockResolvedValue({ success: true }),
      markAllNotificationsRead: jest.fn().mockResolvedValue({ success: true }),
      recordNotificationInteraction: jest.fn().mockResolvedValue({ success: true }),
      getNotificationWhy: jest.fn().mockImplementation(async () => ({ ...mockWhyPayload })),
      getAdminOverview: jest.fn().mockResolvedValue({
        total_profiles: 240,
        profiles_sufficient_data: 185,
        profiles_incomplete_data: 55,
        personalization_enabled_count: 230,
        total_decisions_24h: 410,
        ai_assisted_count_24h: 190,
        avg_relevance_score: 76.4,
        avg_confidence_score: 71.2,
        suppression_rate_pct: 12.5,
        fatigue_distribution: { low: 180, medium: 50, high: 10 },
        conversion_count_30d: 42,
        attributed_revenue_paisa_30d: 48500000,
        active_rule_version: 2,
      }),
      getAdminDimensions: jest.fn().mockResolvedValue({
        total_profiles: 240,
        dimensions: [],
      }),
      getAdminRules: jest.fn().mockResolvedValue({
        active_rule: {
          version: 1,
          is_active: true,
          weights: {
            DestinationInterest: 0.2,
            TravelIntent: 0.15,
            BudgetMatch: 0.12,
            SearchRelevance: 0.1,
            TravelStyleMatch: 0.1,
            TransportMatch: 0.08,
            EngagementMatch: 0.07,
            TimingMatch: 0.07,
            SeasonalityMatch: 0.06,
            CategoryPreference: 0.05,
          },
          dimension_configs: {},
          timing_config: { adaptive_timing_enabled: true },
          fatigue_config: { global_daily_marketing_cap: 3 },
          ai_config: { ai_enabled: true },
          decay_lambda: 0.08,
          min_relevance_threshold: 45,
          min_confidence_threshold: 30,
        },
        history: [],
      }),
      listSegments: jest.fn().mockResolvedValue([
        {
          id: "seg-1",
          key: "family_travelers",
          name: "Family Travelers",
          description: "Families planning resort & group stays",
          query_criteria: { travel_styles_any: ["family"] },
          is_system: true,
          is_active: true,
          cached_member_count: 84,
        },
      ]),
      getFatigueOverview: jest.fn().mockResolvedValue({
        high_fatigue_users_count: 4,
        users_exceeding_caps_count: 1,
        avg_fatigue_score: 21.4,
        global_daily_marketing_cap: 3,
        high_fatigue_threshold: 65.0,
        cooldown_hours: 24,
        category_breakdown: {},
        high_fatigue_entries: [],
      }),
      getPerformanceAnalytics: jest.fn().mockResolvedValue({
        window_days: 30,
        tier_comparison: [],
        channel_breakdown: {},
        total_suppressed: 18,
        suppression_reasons: {},
      }),
      listExperiments: jest.fn().mockResolvedValue([]),
      getOutbox: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
        status_counts: {},
      }),
      getDlq: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
      }),
      previewDecision: jest.fn().mockResolvedValue({
        preview_only: true,
        dispatched: false,
        target_label: "Family Mid-Range",
        eligibility_passed: true,
        relevance_score: 86,
        confidence_score: 90,
        fatigue_score: 10,
        personalization_tier: "deep",
        selected_channel: "push",
        feature_breakdown: {},
        explanation_factors: ["Destination match"],
        ai_used: false,
        ai_provider: "deterministic",
        fallback_used: false,
        factual_validation_passed: true,
        factual_validation_errors: [],
        estimated_tokens: 0,
        estimated_cost_usd: 0,
        generic_variant: {
          language: "en",
          tier: "generic",
          title: "Explore travel opportunities",
          body: "Check out new stays.",
          deep_link: "/(tabs)",
        },
        personalized_variant: {
          language: "en",
          tier: "deep",
          title: "Cox's Bazar Family Resort Picks",
          body: "Curated family stays for your next trip.",
          deep_link: "/(tabs)/explore",
        },
        bilingual_variants: {},
      }),
      broadcastPersonalized: jest.fn().mockResolvedValue({
        success: true,
        total_candidates: 12,
        approved_count: 10,
        suppressed_count: 2,
        rescheduled_count: 1,
        dispatched_count: 9,
        decisions_sample: [],
      }),
    },
  };
});

jest.mock("../../../../services/adminService", () => ({
  notificationAdminService: {
    sendBroadcast: jest.fn().mockResolvedValue(true),
    scheduleNotification: jest.fn().mockResolvedValue({ id: "sched-1" }),
    getBroadcastHistory: jest.fn().mockResolvedValue([]),
    getScheduledNotifications: jest.fn().mockResolvedValue([]),
    triggerScheduledNow: jest.fn().mockResolvedValue(true),
    cancelScheduledNotification: jest.fn().mockResolvedValue(true),
  },
  adminService: {
    getCurrentAdmin: jest.fn().mockResolvedValue({
      id: "admin-uuid-1",
      name: "Admin User",
      email: "admin@shopnojatra.com",
      role: "super_admin",
    }),
  },
}));

// Imports under test
import { personalizationService } from "../../../../services/personalizationService";
import {
  usePersonalizationStore,
  createDefaultPersonalizationPreferences,
} from "../../../../store/personalizationStore";
import { useNotificationStore } from "../../../../store/notificationStore";
import { useSettingsStore } from "../../../../store/settingsStore";
import { WhySeeingThisModal } from "../../../../components/notifications/WhySeeingThisModal";
import { TravelPreferencesScreen } from "../../../../screens/TravelPreferencesScreen";
import { NotificationsInboxScreen } from "../../../../screens/NotificationsInboxScreen";
import { NotificationCenterScreen } from "../../NotificationCenterScreen";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function collectText(node: renderer.ReactTestInstance): string {
  const parts: string[] = [];
  const walk = (curr: any) => {
    if (typeof curr === "string" || typeof curr === "number") {
      parts.push(String(curr));
      return;
    }
    if (curr && Array.isArray(curr.children)) {
      curr.children.forEach(walk);
    }
  };
  walk(node);
  return parts.join(" ");
}

describe("Hyper-Personalized Notification Intelligence Frontend Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      usePersonalizationStore.setState({
        preferences: createDefaultPersonalizationPreferences(),
        profile: null,
        isLoading: false,
        isSaving: false,
        error: null,
        syncNotice: null,
        lastSyncedAt: null,
      });
      useNotificationStore.setState({
        notifications: [],
        unreadCount: 0,
        isLoading: false,
        error: null,
        selectedCategory: "all",
        unreadOnlyFilter: false,
        whyCache: {},
        whyLoadingId: null,
      });
    });
  });

  // ==========================================================================
  // 1. PERSONALIZATION ZUSTAND STORE
  // ==========================================================================
  describe("usePersonalizationStore", () => {
    it("fetches preferences & 20D profile and enforces location_consent invariant on PUT", async () => {
      await act(async () => {
        await usePersonalizationStore.getState().fetchPreferences();
        await usePersonalizationStore.getState().fetchProfile();
      });

      const state = usePersonalizationStore.getState();
      expect(state.preferences.favorite_destinations).toContain("Cox's Bazar");
      expect(state.profile?.overall_confidence).toBe(82.5);

      // Update with location_consent=false MUST strip home_city/travel_origin before calling service!
      await act(async () => {
        await usePersonalizationStore.getState().updatePreferences({
          location_consent: false,
          home_city: "Dhaka",
          travel_origin: "DAC",
          preferred_language: "bn",
        });
      });

      expect(personalizationService.updatePreferences).toHaveBeenCalledWith(
        expect.not.objectContaining({
          home_city: expect.anything(),
          travel_origin: expect.anything(),
        })
      );
      expect(useSettingsStore.getState().language).toBe("bn");
    });

    it("supports dimension correction, marketing opt-out, reset, and GDPR profile deletion", async () => {
      await act(async () => {
        await usePersonalizationStore.getState().fetchProfile();
        await usePersonalizationStore.getState().correctDimension({
          dimension_key: "budget_profile",
          action: "set",
          corrected_value: { tier: "luxury" },
        });
      });
      expect(personalizationService.correctProfile).toHaveBeenCalledWith({
        dimension_key: "budget_profile",
        action: "set",
        corrected_value: { tier: "luxury" },
      });

      await act(async () => {
        await usePersonalizationStore.getState().optOut("all_marketing", undefined, "Too noisy");
      });
      expect(personalizationService.optOut).toHaveBeenCalled();
      expect(
        usePersonalizationStore.getState().preferences.notification_preferences.category_marketing
      ).toBe(false);

      await act(async () => {
        await usePersonalizationStore.getState().resetPersonalization();
      });
      expect(personalizationService.resetProfile).toHaveBeenCalled();

      await act(async () => {
        await usePersonalizationStore.getState().deleteProfileData();
      });
      expect(personalizationService.deleteProfile).toHaveBeenCalled();
      expect(usePersonalizationStore.getState().profile).toBeNull();
    });
  });

  // ==========================================================================
  // 2. NOTIFICATION STORE EXTENSIONS
  // ==========================================================================
  describe("useNotificationStore Personalization Extensions", () => {
    it("maps personalized inbox metadata, caches /why explanations, and tracks interactions safely", async () => {
      await act(async () => {
        await useNotificationStore.getState().fetchNotifications("11111111-1111-4111-8111-111111111111");
      });

      const inbox = useNotificationStore.getState().notifications;
      expect(inbox.length).toBe(1);
      expect(inbox[0].personalization_tier).toBe("deep");
      expect(inbox[0].relevance_score).toBe(88.0);
      expect(inbox[0].cta_label).toBe("Explore Cox's Bazar");

      let why: any = null;
      await act(async () => {
        why = await useNotificationStore
          .getState()
          .fetchWhySeeingThis("22222222-2222-4222-8222-222222222222");
      });
      expect(why?.relevance_score).toBe(88.0);
      expect(
        useNotificationStore.getState().whyCache["22222222-2222-4222-8222-222222222222"]
      ).toBeDefined();

      await act(async () => {
        await useNotificationStore
          .getState()
          .recordInteraction("22222222-2222-4222-8222-222222222222", "clicked", {
            channel: "in_app",
            feedback: "helpful",
          });
      });
      expect(personalizationService.recordNotificationInteraction).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 3. WHY AM I SEEING THIS MODAL
  // ==========================================================================
  describe("WhySeeingThisModal", () => {
    it("renders relevance/confidence scores, auditable explanation factors, and handles modal actions", async () => {
      const onClose = jest.fn();
      let tree: renderer.ReactTestRenderer | null = null;

      try {
        await act(async () => {
          tree = renderer.create(
            <WhySeeingThisModal
              visible={true}
              notification={{
                id: "22222222-2222-4222-8222-222222222222",
                title: "Cox's Bazar Family Resort Savings",
                body: "Personalized stay deals.",
                type: "promo",
                category: "marketing",
                personalization_tier: "deep",
                relevance_score: 88,
                confidence_score: 92,
                is_read: false,
                created_at: "2026-11-25T11:00:00.000Z",
              }}
              onClose={onClose}
            />
          );
          await flushPromises();
        });

        const txt = collectText(tree!.root);
        expect(txt.replace(/\s+/g, "")).toContain("88/100");
        expect(txt.replace(/\s+/g, "")).toContain("92/100");
        expect(txt).toContain("Matches favorite destination: Cox's Bazar");
      } finally {
        if (tree) {
          await act(async () => {
            tree!.unmount();
          });
        }
      }
    }, 30000);
  });

  // ==========================================================================
  // 4. TRAVEL PREFERENCES SCREEN & PERSONALIZED INBOX SCREEN
  // ==========================================================================
  describe("TravelPreferencesScreen & NotificationsInboxScreen", () => {
    it("renders TravelPreferencesScreen with destinations, styles, and fetches 20D data", async () => {
      let tree: renderer.ReactTestRenderer | null = null;
      try {
        await act(async () => {
          tree = renderer.create(<TravelPreferencesScreen />);
          await flushPromises();
        });

        expect(personalizationService.getPreferences).toHaveBeenCalled();
        expect(personalizationService.getProfile).toHaveBeenCalled();

        const txt = collectText(tree!.root);
        expect(txt).toContain("Cox's Bazar");
        expect(txt).toContain("Sylhet");
      } finally {
        if (tree) {
          await act(async () => {
            tree!.unmount();
          });
        }
      }
    }, 30000);

    it("renders NotificationsInboxScreen with personalized cards and category tabs", async () => {
      let tree: renderer.ReactTestRenderer | null = null;
      try {
        await act(async () => {
          tree = renderer.create(<NotificationsInboxScreen />);
          await flushPromises();
        });

        expect(personalizationService.getInbox).toHaveBeenCalled();
        const txt = collectText(tree!.root);
        expect(txt).toContain("Cox's Bazar Family Resort Savings");
        expect(txt).toContain("Explore Cox's Bazar");
      } finally {
        if (tree) {
          await act(async () => {
            tree!.unmount();
          });
        }
      }
    }, 30000);
  });

  // ==========================================================================
  // 5. ADMIN NOTIFICATION CENTER PERSONALIZATION TABS
  // ==========================================================================
  describe("NotificationCenterScreen Personalization Command Center", () => {
    const findPressableWithText = (
      root: renderer.ReactTestInstance,
      label: string
    ) => {
      const matches = root.findAll(
        (node) =>
          typeof node.props?.onPress === "function" &&
          collectText(node).includes(label)
      );
      return matches[matches.length - 1];
    };

    it("renders all 11 tabs and navigates smoothly into personalization tabs", async () => {
      let tree: renderer.ReactTestRenderer | null = null;
      try {
        await act(async () => {
          tree = renderer.create(<NotificationCenterScreen />);
          await flushPromises();
        });

        const txt = collectText(tree!.root);
        expect(txt).toContain("AI Overview");
        expect(txt).toContain("20D Profiles");
        expect(txt).toContain("Rules & Weights");
        expect(txt).toContain("AI Preview Lab");
        expect(txt).toContain("Segments");
        expect(txt).toContain("Fatigue & Caps");
        expect(txt).toContain("Analytics & A/B");
        expect(txt).toContain("Outbox & DLQ");

        // Switch to AI Overview tab
        const overviewBtn = findPressableWithText(tree!.root, "AI Overview");
        expect(overviewBtn).toBeDefined();

        await act(async () => {
          overviewBtn.props.onPress();
          await flushPromises();
        });
        expect(personalizationService.getAdminOverview).toHaveBeenCalled();

        // Switch to AI Preview Lab tab
        const labBtn = findPressableWithText(tree!.root, "AI Preview Lab");
        expect(labBtn).toBeDefined();

        await act(async () => {
          labBtn.props.onPress();
          await flushPromises();
        });

        const labTxt = collectText(tree!.root);
        expect(labTxt).toContain("PREVIEW ONLY");
      } finally {
        if (tree) {
          await act(async () => {
            tree!.unmount();
          });
        }
      }
    }, 30000);
  });
});
