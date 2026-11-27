/**
 * Personalization Store (Zustand)
 * Manages the user's 20-dimensional travel personalization preferences,
 * inferred profile review/corrections, privacy & consent controls,
 * and behavioral signal telemetry backed by /api/v1/personalization/*.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  personalizationService,
  formatPersonalizationError,
  type AllowedSignalType,
  type BudgetTier as ServiceBudgetTier,
  type CommunicationTone as ServiceCommunicationTone,
  type DataQuality as ServiceDataQuality,
  type DestinationInterestItem as ServiceDestinationInterestItem,
  type DigestFrequency as ServiceDigestFrequency,
  type DimensionEntry as ServiceDimensionEntry,
  type DimensionSource as ServiceDimensionSource,
  type LanguageCode as ServiceLanguageCode,
  type NotificationPreferenceSummary as ServiceNotificationPreferenceSummary,
  type PersonalizationProfileResponse,
  type PreferredSendWindow as ServicePreferredSendWindow,
  type PriceSensitivityLevel as ServicePriceSensitivityLevel,
} from "../services/personalizationService";
import { cachedStateStorage } from "./storage";
import { useSettingsStore } from "./settingsStore";

export type PersonalizationLanguage = ServiceLanguageCode;
export type CommunicationTone = ServiceCommunicationTone;
export type DigestFrequency = ServiceDigestFrequency;
export type PreferredSendWindow = ServicePreferredSendWindow;
export type BudgetTier = ServiceBudgetTier;
export type PriceSensitivityLevel = ServicePriceSensitivityLevel;
export type DimensionSource = ServiceDimensionSource;
export type DataQuality = ServiceDataQuality;
export type DimensionEntry = ServiceDimensionEntry;
export type DestinationInterestItem = ServiceDestinationInterestItem;

export interface NotificationPreferenceSummary
  extends ServiceNotificationPreferenceSummary {
  category_travel_discovery?: boolean;
}

export interface PersonalizationPreferences {
  user_id?: string;
  personalization_enabled: boolean;
  preferred_language: PersonalizationLanguage;
  communication_tone: CommunicationTone;
  digest_frequency: DigestFrequency;
  preferred_send_window: PreferredSendWindow;
  home_city: string | null;
  travel_origin: string | null;
  location_consent: boolean;
  favorite_destinations: string[];
  travel_interests: string[];
  travel_styles: string[];
  preferred_transport: string[];
  preferred_accommodation: string[];
  preferred_amenities: string[];
  budget_tier: BudgetTier;
  price_sensitivity_level: PriceSensitivityLevel | null;
  notification_preferences: NotificationPreferenceSummary;
  extra_preferences?: Record<string, any>;
  updated_at?: string | null;
}

export type PersonalizationProfile = PersonalizationProfileResponse;

export interface PreferenceUpdatePayload {
  personalization_enabled?: boolean;
  preferred_language?: PersonalizationLanguage;
  communication_tone?: CommunicationTone;
  digest_frequency?: DigestFrequency;
  preferred_send_window?: PreferredSendWindow;
  home_city?: string | null;
  travel_origin?: string | null;
  location_consent?: boolean;
  favorite_destinations?: string[];
  travel_interests?: string[];
  travel_styles?: string[];
  preferred_transport?: string[];
  preferred_accommodation?: string[];
  preferred_amenities?: string[];
  budget_tier?: BudgetTier;
  price_sensitivity_level?: PriceSensitivityLevel | null;
  push_enabled?: boolean;
  email_enabled?: boolean;
  sms_enabled?: boolean;
  in_app_enabled?: boolean;
  category_booking?: boolean;
  category_security?: boolean;
  category_flight_alerts?: boolean;
  category_marketing?: boolean;
  category_community?: boolean;
  category_price_alerts?: boolean;
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  timezone?: string;
  frequency_cap_marketing_per_day?: number;
  extra_preferences?: Record<string, any>;
}

export interface ProfileCorrectionPayload {
  dimension_key: string;
  action: "set" | "remove";
  corrected_value?: any;
  reason?: string;
}

export interface BehavioralSignalPayload {
  signal_type: AllowedSignalType;
  category?: string;
  destination?: string;
  route_key?: string;
  product_type?: string;
  price_paisa?: number;
  currency?: string;
  filters?: Record<string, any>;
  occurred_at?: string;
  metadata?: Record<string, any>;
}

export const createDefaultNotificationPreferences =
  (): NotificationPreferenceSummary => ({
    push_enabled: true,
    email_enabled: true,
    sms_enabled: true,
    in_app_enabled: true,
    category_booking: true,
    category_security: true,
    category_flight_alerts: true,
    category_marketing: false,
    category_community: true,
    category_price_alerts: true,
    category_travel_discovery: true,
    quiet_hours_enabled: false,
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
    timezone: "Asia/Dhaka",
    frequency_cap_marketing_per_day: 3,
  });

export const createDefaultPersonalizationPreferences =
  (): PersonalizationPreferences => ({
    personalization_enabled: true,
    preferred_language: "en",
    communication_tone: "friendly",
    digest_frequency: "weekly",
    preferred_send_window: "flexible",
    home_city: null,
    travel_origin: null,
    location_consent: false,
    favorite_destinations: [],
    travel_interests: [],
    travel_styles: [],
    preferred_transport: [],
    preferred_accommodation: [],
    preferred_amenities: [],
    budget_tier: "flexible",
    price_sensitivity_level: null,
    notification_preferences: createDefaultNotificationPreferences(),
    extra_preferences: { category_travel_discovery: true },
    updated_at: null,
  });

function syncPreferencesToSettingsStore(prefs: PersonalizationPreferences): void {
  try {
    const settingsState = useSettingsStore.getState();
    const np = prefs.notification_preferences;
    if (np) {
      settingsState.updateNotificationPreference("pushEnabled", np.push_enabled);
      settingsState.updateNotificationPreference("bookingUpdates", np.category_booking);
      settingsState.updateNotificationPreference("priceAlerts", np.category_price_alerts);
      settingsState.updateNotificationPreference("tripUpdates", np.category_flight_alerts);
      settingsState.updateNotificationPreference("promoOffers", np.category_marketing);
      settingsState.updateNotificationPreference("communityActivity", np.category_community);
      settingsState.updateNotificationPreference("quietHoursEnabled", np.quiet_hours_enabled);
      settingsState.updateNotificationPreference("quietHoursStart", np.quiet_hours_start);
      settingsState.updateNotificationPreference("quietHoursEnd", np.quiet_hours_end);
    }
    if (prefs.preferred_language === "en" || prefs.preferred_language === "bn") {
      if (settingsState.language !== prefs.preferred_language) {
        settingsState.setLanguage(prefs.preferred_language);
      }
    }
  } catch {
    // Non-fatal in isolated test environments
  }
}

function normalizePreferencesResponse(
  raw: any,
  prev: PersonalizationPreferences
): PersonalizationPreferences {
  const np = raw?.notification_preferences || {};
  const extra = raw?.extra_preferences || prev.extra_preferences || {};
  const discoveryOptIn =
    typeof extra.category_travel_discovery === "boolean"
      ? extra.category_travel_discovery
      : typeof np.category_travel_discovery === "boolean"
      ? np.category_travel_discovery
      : prev.notification_preferences.category_travel_discovery ?? true;

  return {
    user_id: raw?.user_id ?? prev.user_id,
    personalization_enabled:
      typeof raw?.personalization_enabled === "boolean"
        ? raw.personalization_enabled
        : prev.personalization_enabled,
    preferred_language:
      raw?.preferred_language === "bn" ? "bn" : raw?.preferred_language === "en" ? "en" : prev.preferred_language,
    communication_tone: raw?.communication_tone || prev.communication_tone,
    digest_frequency: raw?.digest_frequency || prev.digest_frequency,
    preferred_send_window: raw?.preferred_send_window || prev.preferred_send_window,
    location_consent:
      typeof raw?.location_consent === "boolean"
        ? raw.location_consent
        : prev.location_consent,
    home_city:
      raw?.location_consent === false ? null : raw?.home_city ?? prev.home_city,
    travel_origin:
      raw?.location_consent === false ? null : raw?.travel_origin ?? prev.travel_origin,
    favorite_destinations: Array.isArray(raw?.favorite_destinations)
      ? raw.favorite_destinations
      : prev.favorite_destinations,
    travel_interests: Array.isArray(raw?.travel_interests)
      ? raw.travel_interests
      : prev.travel_interests,
    travel_styles: Array.isArray(raw?.travel_styles)
      ? raw.travel_styles
      : prev.travel_styles,
    preferred_transport: Array.isArray(raw?.preferred_transport)
      ? raw.preferred_transport
      : prev.preferred_transport,
    preferred_accommodation: Array.isArray(raw?.preferred_accommodation)
      ? raw.preferred_accommodation
      : prev.preferred_accommodation,
    preferred_amenities: Array.isArray(raw?.preferred_amenities)
      ? raw.preferred_amenities
      : prev.preferred_amenities,
    budget_tier: raw?.budget_tier || prev.budget_tier,
    price_sensitivity_level:
      raw?.price_sensitivity_level !== undefined
        ? raw.price_sensitivity_level
        : prev.price_sensitivity_level,
    notification_preferences: {
      push_enabled: np.push_enabled ?? prev.notification_preferences.push_enabled,
      email_enabled: np.email_enabled ?? prev.notification_preferences.email_enabled,
      sms_enabled: np.sms_enabled ?? prev.notification_preferences.sms_enabled,
      in_app_enabled: np.in_app_enabled ?? prev.notification_preferences.in_app_enabled,
      category_booking: np.category_booking ?? prev.notification_preferences.category_booking,
      category_security: np.category_security ?? prev.notification_preferences.category_security,
      category_flight_alerts:
        np.category_flight_alerts ?? prev.notification_preferences.category_flight_alerts,
      category_marketing:
        np.category_marketing ?? prev.notification_preferences.category_marketing,
      category_community:
        np.category_community ?? prev.notification_preferences.category_community,
      category_price_alerts:
        np.category_price_alerts ?? prev.notification_preferences.category_price_alerts,
      category_travel_discovery: discoveryOptIn,
      quiet_hours_enabled:
        np.quiet_hours_enabled ?? prev.notification_preferences.quiet_hours_enabled,
      quiet_hours_start:
        np.quiet_hours_start ?? prev.notification_preferences.quiet_hours_start,
      quiet_hours_end: np.quiet_hours_end ?? prev.notification_preferences.quiet_hours_end,
      timezone: np.timezone ?? prev.notification_preferences.timezone,
      frequency_cap_marketing_per_day:
        typeof np.frequency_cap_marketing_per_day === "number"
          ? np.frequency_cap_marketing_per_day
          : prev.notification_preferences.frequency_cap_marketing_per_day,
    },
    extra_preferences: {
      ...extra,
      category_travel_discovery: discoveryOptIn,
    },
    updated_at: raw?.updated_at ?? new Date().toISOString(),
  };
}

function mergeLocalPatch(
  prev: PersonalizationPreferences,
  patch: PreferenceUpdatePayload
): PersonalizationPreferences {
  const nextLocationConsent =
    patch.location_consent !== undefined ? patch.location_consent : prev.location_consent;

  return {
    ...prev,
    personalization_enabled:
      patch.personalization_enabled ?? prev.personalization_enabled,
    preferred_language: patch.preferred_language ?? prev.preferred_language,
    communication_tone: patch.communication_tone ?? prev.communication_tone,
    digest_frequency: patch.digest_frequency ?? prev.digest_frequency,
    preferred_send_window: patch.preferred_send_window ?? prev.preferred_send_window,
    location_consent: nextLocationConsent,
    home_city: nextLocationConsent
      ? patch.home_city !== undefined
        ? patch.home_city
        : prev.home_city
      : null,
    travel_origin: nextLocationConsent
      ? patch.travel_origin !== undefined
        ? patch.travel_origin
        : prev.travel_origin
      : null,
    favorite_destinations: patch.favorite_destinations ?? prev.favorite_destinations,
    travel_interests: patch.travel_interests ?? prev.travel_interests,
    travel_styles: patch.travel_styles ?? prev.travel_styles,
    preferred_transport: patch.preferred_transport ?? prev.preferred_transport,
    preferred_accommodation: patch.preferred_accommodation ?? prev.preferred_accommodation,
    preferred_amenities: patch.preferred_amenities ?? prev.preferred_amenities,
    budget_tier: patch.budget_tier ?? prev.budget_tier,
    price_sensitivity_level:
      patch.price_sensitivity_level !== undefined
        ? patch.price_sensitivity_level
        : prev.price_sensitivity_level,
    notification_preferences: {
      ...prev.notification_preferences,
      push_enabled: patch.push_enabled ?? prev.notification_preferences.push_enabled,
      email_enabled: patch.email_enabled ?? prev.notification_preferences.email_enabled,
      sms_enabled: patch.sms_enabled ?? prev.notification_preferences.sms_enabled,
      in_app_enabled: patch.in_app_enabled ?? prev.notification_preferences.in_app_enabled,
      category_booking:
        patch.category_booking ?? prev.notification_preferences.category_booking,
      category_security:
        patch.category_security ?? prev.notification_preferences.category_security,
      category_flight_alerts:
        patch.category_flight_alerts ??
        prev.notification_preferences.category_flight_alerts,
      category_marketing:
        patch.category_marketing ?? prev.notification_preferences.category_marketing,
      category_community:
        patch.category_community ?? prev.notification_preferences.category_community,
      category_price_alerts:
        patch.category_price_alerts ?? prev.notification_preferences.category_price_alerts,
      category_travel_discovery:
        typeof patch.extra_preferences?.category_travel_discovery === "boolean"
          ? patch.extra_preferences.category_travel_discovery
          : prev.notification_preferences.category_travel_discovery,
      quiet_hours_enabled:
        patch.quiet_hours_enabled ?? prev.notification_preferences.quiet_hours_enabled,
      quiet_hours_start:
        patch.quiet_hours_start ?? prev.notification_preferences.quiet_hours_start,
      quiet_hours_end:
        patch.quiet_hours_end ?? prev.notification_preferences.quiet_hours_end,
      timezone: patch.timezone ?? prev.notification_preferences.timezone,
      frequency_cap_marketing_per_day:
        patch.frequency_cap_marketing_per_day ??
        prev.notification_preferences.frequency_cap_marketing_per_day,
    },
    extra_preferences: {
      ...prev.extra_preferences,
      ...(patch.extra_preferences || {}),
    },
    updated_at: new Date().toISOString(),
  };
}

export interface PersonalizationState {
  preferences: PersonalizationPreferences;
  profile: PersonalizationProfile | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  syncNotice: string | null;
  lastSyncedAt: string | null;

  fetchPreferences: () => Promise<PersonalizationPreferences | null>;
  updatePreferences: (patch: PreferenceUpdatePayload) => Promise<boolean>;
  fetchProfile: () => Promise<PersonalizationProfile | null>;
  correctDimension: (payload: ProfileCorrectionPayload) => Promise<boolean>;
  recordSignal: (payload: BehavioralSignalPayload) => Promise<boolean>;
  optOut: (
    scope: "all_marketing" | "personalization" | "category" | "channel",
    target?: string,
    reason?: string
  ) => Promise<boolean>;
  resetPersonalization: () => Promise<boolean>;
  deleteProfileData: () => Promise<boolean>;
  setLocalPreferences: (patch: PreferenceUpdatePayload) => void;
  clearError: () => void;
}

export const usePersonalizationStore = create<PersonalizationState>()(
  persist(
    (set, get) => ({
      preferences: createDefaultPersonalizationPreferences(),
      profile: null,
      isLoading: false,
      isSaving: false,
      error: null,
      syncNotice: null,
      lastSyncedAt: null,

      setLocalPreferences: (patch) => {
        const merged = mergeLocalPatch(get().preferences, patch);
        set({ preferences: merged });
        syncPreferencesToSettingsStore(merged);
      },

      clearError: () => set({ error: null, syncNotice: null }),

      fetchPreferences: async () => {
        set({ isLoading: true, error: null });
        try {
          const res = await personalizationService.getPreferences();
          const normalized = normalizePreferencesResponse(res, get().preferences);
          set({
            preferences: normalized,
            isLoading: false,
            syncNotice: null,
            lastSyncedAt: new Date().toISOString(),
          });
          syncPreferencesToSettingsStore(normalized);
          return normalized;
        } catch (err: unknown) {
          const parsed = formatPersonalizationError(err);
          set({
            isLoading: false,
            syncNotice:
              parsed.message || "Showing locally cached preferences (backend unavailable).",
          });
          return get().preferences;
        }
      },

      updatePreferences: async (patch) => {
        set({ isSaving: true, error: null, syncNotice: null });
        const prev = get().preferences;

        // Enforce location consent invariant before dispatching to backend
        const sanitizedPayload: PreferenceUpdatePayload = { ...patch };
        const effectiveConsent =
          patch.location_consent !== undefined
            ? patch.location_consent
            : prev.location_consent;
        if (!effectiveConsent) {
          delete sanitizedPayload.home_city;
          delete sanitizedPayload.travel_origin;
          if (patch.location_consent === false) {
            sanitizedPayload.location_consent = false;
          }
        }

        const optimistic = mergeLocalPatch(prev, sanitizedPayload);
        set({ preferences: optimistic });
        syncPreferencesToSettingsStore(optimistic);

        try {
          const res = await personalizationService.updatePreferences(sanitizedPayload);
          const normalized = normalizePreferencesResponse(res, optimistic);
          set({
            preferences: normalized,
            isSaving: false,
            syncNotice: null,
            lastSyncedAt: new Date().toISOString(),
          });
          syncPreferencesToSettingsStore(normalized);
          return true;
        } catch (err: unknown) {
          const parsed = formatPersonalizationError(err);
          const isValidationOrAuth =
            parsed.kind === "validation" || parsed.isAuthError;
          if (isValidationOrAuth) {
            set({
              preferences: prev,
              isSaving: false,
              error: parsed.message || "Invalid preference settings.",
            });
            syncPreferencesToSettingsStore(prev);
            return false;
          }

          set({
            isSaving: false,
            syncNotice:
              "Saved locally on device. Changes will sync when the personalization API is reachable.",
          });
          return true;
        }
      },

      fetchProfile: async () => {
        set({ isLoading: true, error: null });
        try {
          const profile = await personalizationService.getProfile();
          set({
            profile,
            isLoading: false,
            syncNotice: null,
            lastSyncedAt: new Date().toISOString(),
          });
          return profile;
        } catch (err: unknown) {
          const parsed = formatPersonalizationError(err);
          set({
            isLoading: false,
            syncNotice:
              parsed.message || "20-dimensional intelligence profile is currently offline.",
          });
          return get().profile;
        }
      },

      correctDimension: async (payload) => {
        set({ isSaving: true, error: null });
        try {
          const updatedProfile = await personalizationService.correctProfile(payload);
          set({
            profile: updatedProfile,
            isSaving: false,
            lastSyncedAt: new Date().toISOString(),
          });
          return true;
        } catch (err: unknown) {
          const parsed = formatPersonalizationError(err);
          // Local optimistic removal/correction when profile is cached offline
          const currentProfile = get().profile;
          if (
            !parsed.isAuthError &&
            parsed.kind !== "validation" &&
            currentProfile &&
            currentProfile.dimensions[payload.dimension_key]
          ) {
            const nextDims = { ...currentProfile.dimensions };
            if (payload.action === "remove") {
              nextDims[payload.dimension_key] = {
                ...nextDims[payload.dimension_key],
                value: "unknown",
                confidence: 0,
                source: "unknown",
                data_quality: "unknown",
                is_user_provided: false,
                updated_at: new Date().toISOString(),
              };
            } else {
              nextDims[payload.dimension_key] = {
                ...nextDims[payload.dimension_key],
                value: payload.corrected_value,
                confidence: 100,
                source: "user_preference",
                data_quality: "high",
                is_user_provided: true,
                updated_at: new Date().toISOString(),
              };
            }
            set({
              profile: { ...currentProfile, dimensions: nextDims },
              isSaving: false,
              syncNotice:
                parsed.message ||
                "Updated locally; server sync pending connection.",
            });
            return true;
          }
          set({
            isSaving: false,
            error: parsed.message || "Failed to update inferred preference.",
          });
          return false;
        }
      },

      recordSignal: async (payload) => {
        try {
          await personalizationService.recordSignal(payload);
          return true;
        } catch {
          return false;
        }
      },

      optOut: async (scope, target, reason) => {
        set({ isSaving: true, error: null });
        const prev = get().preferences;
        const patch: PreferenceUpdatePayload = {};
        if (scope === "all_marketing") {
          patch.category_marketing = false;
        } else if (scope === "personalization") {
          patch.personalization_enabled = false;
        } else if (scope === "category" && target) {
          const norm = target.toLowerCase();
          if (norm.includes("marketing") || norm === "promo") {
            patch.category_marketing = false;
          } else if (norm.includes("price")) {
            patch.category_price_alerts = false;
          } else if (norm.includes("flight")) {
            patch.category_flight_alerts = false;
          } else if (norm.includes("community")) {
            patch.category_community = false;
          } else if (norm.includes("discovery")) {
            patch.extra_preferences = {
              ...prev.extra_preferences,
              category_travel_discovery: false,
            };
          }
        } else if (scope === "channel" && target) {
          if (target === "push") patch.push_enabled = false;
          if (target === "email") patch.email_enabled = false;
          if (target === "sms") patch.sms_enabled = false;
          if (target === "in_app") patch.in_app_enabled = false;
        }

        const localNext = mergeLocalPatch(prev, patch);
        set({ preferences: localNext });
        syncPreferencesToSettingsStore(localNext);

        try {
          await personalizationService.optOut({ scope, target, reason });
          set({ isSaving: false, lastSyncedAt: new Date().toISOString() });
          return true;
        } catch (err: unknown) {
          const parsed = formatPersonalizationError(err);
          set({
            isSaving: false,
            syncNotice:
              parsed.message || "Opt-out applied locally; server sync pending.",
          });
          return true;
        }
      },

      resetPersonalization: async () => {
        set({ isSaving: true, error: null });
        try {
          await personalizationService.resetProfile();
          await Promise.all([get().fetchPreferences(), get().fetchProfile()]);
          set({ isSaving: false, lastSyncedAt: new Date().toISOString() });
          return true;
        } catch (err: unknown) {
          const parsed = formatPersonalizationError(err);
          const resetDefaults = createDefaultPersonalizationPreferences();
          set({
            preferences: resetDefaults,
            profile: null,
            isSaving: false,
            syncNotice:
              parsed.message || "Personalization signals reset locally.",
          });
          syncPreferencesToSettingsStore(resetDefaults);
          return true;
        }
      },

      deleteProfileData: async () => {
        set({ isSaving: true, error: null });
        try {
          await personalizationService.deleteProfile();
        } catch (err: unknown) {
          const parsed = formatPersonalizationError(err);
          if (parsed.isAuthError) {
            set({
              isSaving: false,
              error: parsed.message || "Authentication required to delete profile data.",
            });
            return false;
          }
        }

        const freshDefaults = createDefaultPersonalizationPreferences();
        set({
          preferences: freshDefaults,
          profile: null,
          isSaving: false,
          syncNotice: null,
          lastSyncedAt: new Date().toISOString(),
        });
        syncPreferencesToSettingsStore(freshDefaults);
        return true;
      },
    }),
    {
      name: "personalization_store",
      storage: createJSONStorage(() => cachedStateStorage),
      partialize: (state) => ({
        preferences: state.preferences,
        profile: state.profile,
        lastSyncedAt: state.lastSyncedAt,
      }),
    }
  )
);
