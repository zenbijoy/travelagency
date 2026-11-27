/**
 * Personalization & Notification Intelligence Service
 *
 * Typed FastAPI client for the 20-Dimensional Personalization Engine,
 * 24-Step Notification Decision Pipeline, User Inbox/Preferences/Explainability,
 * and Admin Personalization Command Center + Outbox/DLQ Operations.
 *
 * Authentication: Uses Supabase session JWT attached automatically via `apiRequest`.
 * Error Policy: Never fabricates or falls back to fake production metrics. Surfaces
 * typed `AppError` / honest unavailable states when the backend is unreachable.
 */

import { apiRequest, AppError, AppErrorKind } from "./apiClient";

// ============================================================================
// Canonical Enums, Literals & Constants
// ============================================================================

export type LanguageCode = "en" | "bn";
export type CommunicationTone = "concise" | "informative" | "friendly" | "formal";
export type DigestFrequency = "daily" | "weekly" | "disabled";
export type DimensionSource =
  | "user_preference"
  | "behavioral"
  | "transactional"
  | "contextual"
  | "unknown";
export type DataQuality = "high" | "medium" | "low" | "unknown";
export type PersonalizationTier = "generic" | "light" | "deep" | "suppressed";
export type ChannelType = "push" | "in_app" | "email" | "sms" | "webhook";
export type InteractionType =
  | "opened"
  | "clicked"
  | "dismissed"
  | "ignored"
  | "cta_completed"
  | "converted";
export type PreferredSendWindow =
  | "morning"
  | "afternoon"
  | "evening"
  | "late_evening"
  | "flexible";
export type BudgetTier =
  | "budget"
  | "economy"
  | "mid_range"
  | "premium"
  | "luxury"
  | "flexible"
  | "unknown";
export type PriceSensitivityLevel = "low" | "medium" | "high";
export type PersonaPreset =
  | "family_midrange"
  | "budget_student"
  | "premium_luxury"
  | "adventure_solo"
  | "inactive_dormant"
  | "new_user"
  | "deal_seeker"
  | "fatigued_opted_out";
export type AutomationKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J";
export type ExperimentType =
  | "generic_vs_personalized"
  | "short_vs_detailed"
  | "destination_vs_style"
  | "timing"
  | "cta"
  | "channel";
export type AllowedSignalType =
  | "search"
  | "repeated_search"
  | "page_view"
  | "destination_view"
  | "filter_used"
  | "explicit_favorite"
  | "wishlist"
  | "saved_destination"
  | "booking_attempt"
  | "booking"
  | "cancellation"
  | "hotel_view"
  | "hotel_booking"
  | "transport_selected"
  | "price_alert_subscribe"
  | "notification_open"
  | "notification_click"
  | "dismissal"
  | "ignored"
  | "cta_completed"
  | "opt_out";

export const CANONICAL_DIMENSION_KEYS = [
  "profile_context",
  "location_context",
  "destination_interest",
  "search_behavior",
  "travel_frequency",
  "budget_profile",
  "travel_style",
  "transport_preference",
  "accommodation_preference",
  "time_preference",
  "activity_level",
  "engagement_behavior",
  "notification_tolerance",
  "language_communication_style",
  "price_sensitivity",
  "travel_timeline",
  "loyalty_engagement_tier",
  "contextual_travel_conditions",
  "consent_communication_preferences",
  "personalization_confidence",
] as const;

export type CanonicalDimensionKey = (typeof CANONICAL_DIMENSION_KEYS)[number];

export const DEFAULT_RELEVANCE_WEIGHTS: Record<string, number> = {
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
};

export const BUILTIN_SEGMENTS_META: ReadonlyArray<{
  key: string;
  name: string;
  description: string;
  defaultCriteria: Record<string, unknown>;
}> = [
  {
    key: "family_travelers",
    name: "Family Travelers",
    description: "Users with explicit or behavioral family travel style preferences.",
    defaultCriteria: { travel_styles_any: ["family"], personalization_enabled: true },
  },
  {
    key: "budget_travelers",
    name: "Budget Travelers",
    description: "Cost-conscious travelers preferring budget or economy tiers.",
    defaultCriteria: { budget_tiers_any: ["budget", "economy"], personalization_enabled: true },
  },
  {
    key: "premium_travelers",
    name: "Premium & Luxury Travelers",
    description: "Travelers preferring premium or luxury stays and flights.",
    defaultCriteria: { budget_tiers_any: ["premium", "luxury"], personalization_enabled: true },
  },
  {
    key: "adventure_enthusiasts",
    name: "Adventure Enthusiasts",
    description: "Users interested in adventure, trekking, and nature expeditions.",
    defaultCriteria: { travel_styles_any: ["adventure", "nature"], personalization_enabled: true },
  },
  {
    key: "sylhet_interested",
    name: "Sylhet Interested",
    description: "Users with strong time-decayed interest or favorite in Sylhet / Sreemangal.",
    defaultCriteria: { destinations_any: ["Sylhet", "Sreemangal"], min_interest_score: 35 },
  },
  {
    key: "coxs_bazar_interested",
    name: "Cox's Bazar Interested",
    description: "Users with strong time-decayed interest or favorite in Cox's Bazar / Saint Martin.",
    defaultCriteria: { destinations_any: ["Cox's Bazar", "Saint Martin"], min_interest_score: 35 },
  },
  {
    key: "frequent_travelers",
    name: "Frequent Travelers",
    description: "Active repeat travelers with multiple bookings or high activity level.",
    defaultCriteria: { activity_levels_any: ["highly_active", "active", "returning"], min_bookings: 2 },
  },
  {
    key: "dormant_users",
    name: "Dormant Users",
    description: "Inactive or dormant users eligible for low-fatigue reactivation.",
    defaultCriteria: { activity_levels_any: ["inactive", "dormant"], personalization_enabled: true },
  },
  {
    key: "upcoming_trips",
    name: "Upcoming Trips",
    description: "Travelers preparing for departure or holding active booked itineraries.",
    defaultCriteria: { travel_timeline_stages_any: ["booked", "preparing_for_departure"] },
  },
  {
    key: "recent_searchers",
    name: "Recent Searchers",
    description: "Users with recent destination or route search signals.",
    defaultCriteria: {
      travel_timeline_stages_any: ["searching_for_trip", "comparing_options", "booking_in_progress"],
    },
  },
  {
    key: "price_alert_subscribers",
    name: "Price Alert Subscribers",
    description: "Users with active fare alerts or price alert opt-ins.",
    defaultCriteria: { has_price_alerts: true },
  },
  {
    key: "hotel_oriented",
    name: "Hotel-Oriented Travelers",
    description: "Users showing strong hotel/resort preference or browsing history.",
    defaultCriteria: { preferred_product_types_any: ["hotel", "resort"] },
  },
  {
    key: "flight_oriented",
    name: "Flight-Oriented Travelers",
    description: "Users preferring air travel for domestic or regional routes.",
    defaultCriteria: { transport_modes_any: ["flight"] },
  },
  {
    key: "deal_responsive",
    name: "Deal-Responsive Travelers",
    description: "High price-sensitivity users engaging with price drop and deal alerts.",
    defaultCriteria: { price_sensitivity_any: ["high", "medium"], min_engagement_rate: 0.15 },
  },
];

export const PERSONA_PRESETS_META: ReadonlyArray<{
  key: PersonaPreset;
  label: string;
  summary: string;
}> = [
  {
    key: "family_midrange",
    label: "User A: Family Mid-Range",
    summary: "Sylhet/Cox's Bazar interest, mid-range, family hotel, friendly tone.",
  },
  {
    key: "budget_student",
    label: "User B: Budget Traveler",
    summary: "Economy/budget tier, bus/train transport, high price sensitivity.",
  },
  {
    key: "premium_luxury",
    label: "User C: Premium / Luxury",
    summary: "Luxury resorts, flight priority, concise executive tone.",
  },
  {
    key: "adventure_solo",
    label: "User D: Adventure Solo",
    summary: "Bandarban/Sajek, trekking/nature, eco-stay, flexible schedule.",
  },
  {
    key: "inactive_dormant",
    label: "User E: Inactive / Dormant",
    summary: "Historical interest, low recent activity, gentle reactivation eligible.",
  },
  {
    key: "new_user",
    label: "User F: New User (Low Confidence)",
    summary: "Onboarding-only profile, sparse behavioral history, safe generic fallback.",
  },
  {
    key: "deal_seeker",
    label: "User G: Engaged Deal Seeker",
    summary: "Price alerts enabled, high open/click affinity, morning window.",
  },
  {
    key: "fatigued_opted_out",
    label: "User H: Fatigued / Promo Opt-Out",
    summary: "High fatigue score & marketing opt-out; promo suppressed, transactional allowed.",
  },
];

// ============================================================================
// 1. 20-Dimensional Profile & Preferences Interfaces
// ============================================================================

export interface DimensionEntry {
  dimension_key: string;
  display_name?: string | null;
  value: unknown;
  confidence: number;
  source: DimensionSource;
  updated_at?: string | null;
  data_quality: DataQuality;
  expiration_policy?: string | null;
  expires_at?: string | null;
  is_expired?: boolean;
  is_user_provided: boolean;
  permission_granted: boolean;
  metadata: Record<string, unknown>;
}

export interface DestinationInterestItem {
  destination: string;
  score: number;
  confidence: number;
  signal_count: number;
  search_count: number;
  booking_count: number;
  is_explicit_favorite: boolean;
  last_signal_at?: string | null;
}

export interface PersonalizationProfileResponse {
  user_id: string;
  profile_version: number;
  personalization_enabled: boolean;
  preferred_language: LanguageCode;
  communication_tone: CommunicationTone;
  digest_frequency: DigestFrequency;
  home_city?: string | null;
  travel_origin?: string | null;
  location_consent: boolean;
  travel_timeline_stage: string;
  loyalty_tier: string;
  activity_level: string;
  overall_confidence: number;
  confidence_tier: "low" | "medium" | "high";
  dimensions: Record<string, DimensionEntry>;
  top_destinations: DestinationInterestItem[];
  explicit_preferences: Record<string, unknown>;
  explanation_summary: string[];
  last_activity_at?: string | null;
  last_aggregated_at?: string | null;
  reset_at?: string | null;
}

export interface NotificationPreferenceSummary {
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  in_app_enabled: boolean;
  category_booking: boolean;
  category_security: boolean;
  category_flight_alerts: boolean;
  category_marketing: boolean;
  category_community: boolean;
  category_price_alerts: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  frequency_cap_marketing_per_day: number;
}

export interface PreferenceResponse {
  user_id: string;
  personalization_enabled: boolean;
  preferred_language: LanguageCode;
  communication_tone: CommunicationTone;
  digest_frequency: DigestFrequency;
  preferred_send_window: PreferredSendWindow;
  home_city?: string | null;
  travel_origin?: string | null;
  location_consent: boolean;
  favorite_destinations: string[];
  travel_interests: string[];
  travel_styles: string[];
  preferred_transport: string[];
  preferred_accommodation: string[];
  preferred_amenities: string[];
  budget_tier: BudgetTier;
  price_sensitivity_level?: PriceSensitivityLevel | null;
  notification_preferences: NotificationPreferenceSummary;
  updated_at?: string | null;
}

export interface PreferenceUpdateRequest {
  personalization_enabled?: boolean;
  preferred_language?: LanguageCode;
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
  extra_preferences?: Record<string, unknown>;
}

export interface ProfileCorrectionRequest {
  dimension_key: string;
  action: "set" | "remove";
  corrected_value?: unknown;
  reason?: string;
}

export interface OptOutRequest {
  scope: "all_marketing" | "personalization" | "category" | "channel";
  target?: string;
  reason?: string;
}

export interface OptOutResponse {
  success: boolean;
  user_id: string;
  scope: string;
  target?: string | null;
  personalization_enabled: boolean;
  category_marketing: boolean;
  message: string;
}

export interface ProfileLifecycleResponse {
  success: boolean;
  user_id: string;
  action: "reset" | "deleted";
  profile_version?: number | null;
  cleared_records: number;
  message: string;
}

// ============================================================================
// 2. Behavioral Signals
// ============================================================================

export interface BehavioralSignalCreate {
  signal_type: AllowedSignalType;
  category?: string;
  destination?: string;
  route_key?: string;
  product_type?: string;
  price_paisa?: number;
  currency?: string;
  filters?: Record<string, unknown>;
  occurred_at?: string;
  metadata?: Record<string, unknown>;
}

export interface BehavioralSignalResponse {
  success: boolean;
  signal_id?: string | null;
  recorded: boolean;
  profile_version?: number | null;
  updated_dimensions: string[];
  message: string;
}

// ============================================================================
// 3. User Inbox, Interactions & Explainability
// ============================================================================

export interface InboxNotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  category: string;
  priority: string;
  is_read: boolean;
  read_at?: string | null;
  channels: string[];
  cta_label?: string | null;
  deep_link?: string | null;
  personalization_tier?: PersonalizationTier | null;
  relevance_score?: number | null;
  confidence_score?: number | null;
  has_explanation: boolean;
  data: Record<string, unknown>;
  expires_at?: string | null;
  created_at: string;
}

export interface InboxListResponse {
  items: InboxNotificationItem[];
  total: number;
  unread_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface InboxReadResponse {
  success: boolean;
  notification_id: string;
  is_read: boolean;
  read_at?: string | null;
}

export interface InboxReadAllResponse {
  success: boolean;
  marked_count: number;
}

export interface InboxInteractionRequest {
  interaction_type: InteractionType;
  channel?: ChannelType;
  revenue_paisa?: number;
  metadata?: Record<string, unknown>;
}

export interface InboxInteractionResponse {
  success: boolean;
  notification_id: string;
  interaction_type: InteractionType;
  decision_logged: boolean;
  anti_feedback_loop_applied: boolean;
  message: string;
}

export interface NotificationWhyResponse {
  notification_id: string;
  category: string;
  personalization_tier: PersonalizationTier;
  relevance_score?: number | null;
  confidence_score?: number | null;
  summary: string;
  explanation_factors: string[];
  matched_preferences: string[];
  can_adjust_preferences: boolean;
  can_opt_out_category: boolean;
  preferences_route: string;
}

export interface DeviceRegisterRequest {
  device_id: string;
  push_token: string;
  token_type?: "expo" | "fcm" | "apns" | "web_push";
  platform: "android" | "ios" | "web" | "desktop";
  device_name?: string;
  os_version?: string;
  app_version?: string;
}

export interface DeviceRegisterResponse {
  id: string;
  user_id: string;
  device_id: string;
  token_type: string;
  platform: string;
  is_active: boolean;
  last_active_at: string;
}

// ============================================================================
// 4. Admin Outbox, DLQ & Personalized Broadcast
// ============================================================================

export interface OutboxItemResponse {
  id: string;
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  last_attempt_at?: string | null;
  next_retry_at?: string | null;
  error_message?: string | null;
  last_error?: string | null;
  processed_at?: string | null;
  created_at: string;
}

export interface OutboxListResponse {
  items: OutboxItemResponse[];
  total: number;
  total_count?: number;
  page: number;
  page_size: number;
  status_counts: Record<string, number>;
}

export interface OutboxProcessResponse {
  success: boolean;
  processed_count: number;
  delivered_count: number;
  suppressed_count: number;
  rescheduled_count: number;
  failed_count: number;
  quarantined_count: number;
}

export interface DLQItemResponse {
  id: string;
  outbox_id?: string | null;
  outbox_event_id?: string | null;
  last_error?: string | null;
  event_id: string;
  event_type: string;
  channel?: string | null;
  recipient?: string | null;
  failure_reason: string;
  exception_class?: string | null;
  attempts: number;
  resolution_status: string;
  resolution_notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
  failed_at?: string;
}

export interface DLQListResponse {
  items: DLQItemResponse[];
  total: number;
  total_count?: number;
  page: number;
  page_size: number;
}

export interface OutboxReplayResponse {
  success: boolean;
  dlq_id: string;
  outbox_id?: string | null;
  resolution_status: string;
  message: string;
}

export interface DLQDiscardRequest {
  resolution_notes?: string;
}

export interface PersonalizedBroadcastRequest {
  title: string;
  message: string;
  category?: string;
  event_type?: string;
  channel?: "push" | "in_app" | "email" | "sms" | "auto";
  segment_key?: string | null;
  target_user_ids?: string[] | null;
  destination?: string | null;
  travel_styles?: string[];
  budget_tier?: BudgetTier | null;
  transport_mode?: string | null;
  cta_label?: string | null;
  deep_link?: string;
  priority?: number;
  allow_ai_enrichment?: boolean;
  verified_facts?: Record<string, unknown>;
  experiment_id?: string | null;
  scheduled_for?: string | null;
}

export interface BroadcastRecipientDecisionSummary {
  user_id: string;
  eligibility_passed: boolean;
  suppression_reason?: string | null;
  personalization_tier: PersonalizationTier;
  relevance_score: number;
  confidence_score: number;
  selected_channel?: string | null;
  scheduled_for?: string | null;
}

export interface PersonalizedBroadcastResponse {
  success: boolean;
  campaign_id?: string | null;
  total_candidates: number;
  approved_count: number;
  suppressed_count: number;
  rescheduled_count: number;
  dispatched_count: number;
  decisions_sample: BroadcastRecipientDecisionSummary[];
}

// ============================================================================
// 5. Admin Decision Preview ("PREVIEW ONLY — NEVER SENDS")
// ============================================================================

export interface DecisionPreviewRequest {
  user_id?: string | null;
  persona_preset?: PersonaPreset | null;
  event_type?: string;
  category?: string;
  base_title?: string;
  base_body?: string;
  destination?: string | null;
  travel_styles?: string[];
  budget_tier?: BudgetTier | null;
  transport_mode?: string | null;
  price_paisa?: number | null;
  discount_pct?: number | null;
  deep_link?: string;
  priority?: number;
  language_override?: LanguageCode | null;
  allow_ai_enrichment?: boolean;
  verified_facts?: Record<string, unknown>;
}

export interface RenderedCopyVariant {
  language: LanguageCode;
  tier: PersonalizationTier;
  title: string;
  body: string;
  cta?: string | null;
  deep_link: string;
  push_short_title?: string | null;
  push_short_body?: string | null;
}

export interface DecisionPreviewResponse {
  preview_only: boolean;
  dispatched: boolean;
  target_label: string;
  eligibility_passed: boolean;
  suppression_reason?: string | null;
  relevance_score: number;
  confidence_score: number;
  fatigue_score: number;
  personalization_tier: PersonalizationTier;
  selected_channel?: string | null;
  recommended_send_at?: string | null;
  feature_breakdown: Record<string, number>;
  explanation_factors: string[];
  ai_used: boolean;
  ai_provider: string;
  fallback_used: boolean;
  factual_validation_passed: boolean;
  factual_validation_errors: string[];
  estimated_tokens: number;
  estimated_cost_usd: number;
  generic_variant: RenderedCopyVariant;
  personalized_variant: RenderedCopyVariant;
  bilingual_variants: Record<string, RenderedCopyVariant>;
}

// ============================================================================
// 6. Admin Rules, Weights & Rollback
// ============================================================================

export interface RuleConfigSchema {
  id?: string | null;
  version: number;
  is_active: boolean;
  weights: Record<string, number>;
  dimension_configs: Record<string, any>;
  timing_config: Record<string, any>;
  fatigue_config: Record<string, any>;
  ai_config: Record<string, any>;
  decay_lambda: number;
  min_relevance_threshold: number;
  min_confidence_threshold: number;
  change_notes?: string | null;
  created_by?: string | null;
  created_at?: string | null;
}

export interface RuleConfigUpdateRequest {
  weights: Record<string, number>;
  dimension_configs?: Record<string, any>;
  timing_config?: Record<string, any>;
  fatigue_config?: Record<string, any>;
  ai_config?: Record<string, any>;
  decay_lambda?: number;
  min_relevance_threshold?: number;
  min_confidence_threshold?: number;
  change_notes?: string;
}

export interface RulesListResponse {
  active_rule: RuleConfigSchema;
  history: RuleConfigSchema[];
}

export interface RuleRollbackResponse {
  success: boolean;
  rolled_back_from_version?: number | null;
  active_version: number;
  active_rule: RuleConfigSchema;
  message: string;
}

// ============================================================================
// 7. Dynamic Segments
// ============================================================================

export interface SegmentCreateRequest {
  key: string;
  name: string;
  description?: string;
  query_criteria: Record<string, unknown>;
  is_active?: boolean;
}

export interface SegmentResponse {
  id?: string | null;
  key: string;
  name: string;
  description?: string | null;
  query_criteria: Record<string, unknown>;
  is_system: boolean;
  is_active: boolean;
  cached_member_count: number;
  last_evaluated_at?: string | null;
}

export interface SegmentMemberItem {
  user_id: string;
  loyalty_tier: string;
  activity_level: string;
  travel_timeline_stage: string;
  overall_confidence: number;
  preferred_language: LanguageCode;
}

export interface SegmentMembersResponse {
  segment_key: string;
  total: number;
  total_count?: number;
  page: number;
  page_size: number;
  members: SegmentMemberItem[];
}

// ============================================================================
// 8. Admin Overview, Dimension Explorer, Fatigue & Analytics
// ============================================================================

export interface PersonalizationOverviewResponse {
  total_profiles: number;
  profiles_sufficient_data: number;
  profiles_incomplete_data: number;
  personalization_enabled_count: number;
  total_decisions_24h: number;
  ai_assisted_count_24h: number;
  avg_relevance_score: number;
  avg_confidence_score: number;
  suppression_rate_pct: number;
  fatigue_distribution: Record<string, number>;
  conversion_count_30d: number;
  attributed_revenue_paisa_30d: number;
  active_rule_version: number;
}

export interface DimensionExplorerItem {
  dimension_key: string;
  coverage_count: number;
  coverage_pct: number;
  avg_confidence: number;
  source_distribution: Record<string, number>;
  quality_distribution: Record<string, number>;
  user_provided_count: number;
  permission_granted_count: number;
  top_values_summary: Record<string, number>;
  last_updated_at?: string | null;
}

export interface DimensionExplorerResponse {
  total_profiles: number;
  dimensions: DimensionExplorerItem[];
}

export interface FatigueUserCategoryItem {
  user_id: string;
  category: string;
  fatigue_score: number;
  received_24h: number;
  received_7d: number;
  opened_7d: number;
  clicked_7d: number;
  dismissed_7d: number;
  ignored_7d: number;
  opt_out_count: number;
  cooldown_until?: string | null;
  last_sent_at?: string | null;
}

export interface FatigueOverviewResponse {
  high_fatigue_users_count: number;
  users_exceeding_caps_count: number;
  avg_fatigue_score: number;
  global_daily_marketing_cap: number;
  high_fatigue_threshold: number;
  cooldown_hours: number;
  category_breakdown: Record<string, Record<string, any>>;
  high_fatigue_entries: FatigueUserCategoryItem[];
}

export interface FatigueControlsUpdateRequest {
  global_daily_marketing_cap: number;
  high_fatigue_threshold?: number;
  cooldown_hours?: number;
  prefer_digest_on_high_fatigue?: boolean;
  change_notes?: string;
}

export interface TierPerformanceMetrics {
  tier: string;
  total_decisions: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  converted_count: number;
  dismissed_count: number;
  suppressed_count: number;
  avg_relevance_score: number;
  avg_fatigue_score: number;
  open_rate_pct: number;
  ctr_pct: number;
  conversion_rate_pct: number;
  revenue_paisa: number;
}

export interface PerformanceAnalyticsResponse {
  window_days: number;
  tier_comparison: TierPerformanceMetrics[];
  channel_breakdown: Record<string, Record<string, any>>;
  total_suppressed: number;
  suppression_reasons: Record<string, number>;
}

// ============================================================================
// 9. A/B Experiments & Bounded Weight Learning
// ============================================================================

export interface ExperimentVariantSpec {
  name: string;
  weight: number;
  description?: string;
  config?: Record<string, unknown>;
}

export interface ExperimentCreateRequest {
  key: string;
  name: string;
  hypothesis: string;
  experiment_type: ExperimentType;
  variants: ExperimentVariantSpec[];
  min_sample_size?: number;
  max_duration_days?: number;
  opt_out_stop_threshold?: number;
  target_categories?: string[];
}

export interface ExperimentVariantStats {
  variant: string;
  exposures: number;
  opens: number;
  clicks: number;
  conversions: number;
  opt_outs: number;
  revenue_paisa: number;
  conversion_rate: number;
  ci_95_lower: number;
  ci_95_upper: number;
}

export interface ExperimentResponse {
  id: string;
  key: string;
  name: string;
  hypothesis: string;
  experiment_type: string;
  status: string;
  variants: Array<Record<string, any>>;
  min_sample_size: number;
  max_duration_days: number;
  opt_out_stop_threshold: number;
  started_at?: string | null;
  ended_at?: string | null;
  results_summary: Record<string, any>;
  variant_stats: ExperimentVariantStats[];
  recommended_weight_adjustments: Record<string, number>;
  created_at: string;
}

export interface ExperimentStopRequest {
  reason?: string;
}

// ============================================================================
// 10. Automations Evaluation
// ============================================================================

export interface AutomationEvaluateRequest {
  user_ids?: string[];
  limit?: number;
  dry_run?: boolean;
  context_overrides?: Record<string, unknown>;
}

export interface AutomationCandidateSummary {
  user_id: string;
  automation_key: string;
  event_type: string;
  destination?: string | null;
  title: string;
  relevance_score?: number | null;
  confidence_score?: number | null;
  eligible: boolean;
  suppression_reason?: string | null;
}

export interface AutomationEvaluateResponse {
  automation_key: string;
  dry_run: boolean;
  evaluated_users: number;
  candidates_generated: number;
  staged_to_outbox: number;
  candidates: AutomationCandidateSummary[];
}

// ============================================================================
// Typed Error Formatting & Envelope Unwrapping
// ============================================================================

export interface ParsedPersonalizationError {
  message: string;
  kind: AppErrorKind;
  status?: number;
  fieldErrors?: Record<string, string[]>;
  isUnavailable: boolean;
  isAuthError: boolean;
}

export function formatPersonalizationError(err: unknown): ParsedPersonalizationError {
  if (err instanceof AppError) {
    const isUnavailable =
      err.kind === "network" ||
      err.status === 404 ||
      err.status === 502 ||
      err.status === 503 ||
      err.status === 504;
    const isAuthError = err.kind === "auth" || err.status === 401 || err.status === 403;
    return {
      message: err.message,
      kind: err.kind,
      status: err.status,
      fieldErrors: err.fieldErrors,
      isUnavailable,
      isAuthError,
    };
  }
  const msg = (err as { message?: string } | null)?.message || String(err || "Unknown error");
  return {
    message: msg,
    kind: "unknown",
    isUnavailable:
      msg.toLowerCase().includes("network") ||
      msg.toLowerCase().includes("fetch") ||
      msg.toLowerCase().includes("unreachable"),
    isAuthError: false,
  };
}

function unwrapResponse<T>(raw: unknown): T {
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    "data" in (raw as Record<string, unknown>) &&
    "success" in (raw as Record<string, unknown>) &&
    Object.keys(raw as Record<string, unknown>).length <= 3
  ) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

function unwrapArray<T>(raw: unknown, fallbackKeys: string[] = ["items"]): T[] {
  const unwrapped = unwrapResponse<unknown>(raw);
  if (Array.isArray(unwrapped)) {
    return unwrapped as T[];
  }
  if (unwrapped && typeof unwrapped === "object") {
    const obj = unwrapped as Record<string, unknown>;
    for (const key of fallbackKeys) {
      if (Array.isArray(obj[key])) {
        return obj[key] as T[];
      }
    }
  }
  return [];
}

// ============================================================================
// Service Implementation
// ============================================================================

export const personalizationService = {
  // --------------------------------------------------------------------------
  // User Preferences & 20-Dimensional Profile
  // --------------------------------------------------------------------------

  async getPreferences(): Promise<PreferenceResponse> {
    const res = await apiRequest<unknown>("/personalization/preferences", {
      method: "GET",
      retries: 1,
      timeoutMs: 10000,
    });
    return unwrapResponse<PreferenceResponse>(res);
  },

  async updatePreferences(payload: PreferenceUpdateRequest): Promise<PreferenceResponse> {
    const res = await apiRequest<unknown>("/personalization/preferences", {
      method: "PUT",
      body: JSON.stringify(payload),
      retries: 0,
      timeoutMs: 12000,
    });
    return unwrapResponse<PreferenceResponse>(res);
  },

  async getProfile(): Promise<PersonalizationProfileResponse> {
    const res = await apiRequest<unknown>("/personalization/profile", {
      method: "GET",
      retries: 1,
      timeoutMs: 10000,
    });
    return unwrapResponse<PersonalizationProfileResponse>(res);
  },

  async correctProfile(
    payload: ProfileCorrectionRequest
  ): Promise<PersonalizationProfileResponse> {
    const res = await apiRequest<unknown>("/personalization/profile/correct", {
      method: "PATCH",
      body: JSON.stringify(payload),
      retries: 0,
      timeoutMs: 12000,
    });
    return unwrapResponse<PersonalizationProfileResponse>(res);
  },

  async recordSignal(payload: BehavioralSignalCreate): Promise<BehavioralSignalResponse> {
    const res = await apiRequest<unknown>("/personalization/signals", {
      method: "POST",
      body: JSON.stringify(payload),
      retries: 0,
      timeoutMs: 8000,
    });
    return unwrapResponse<BehavioralSignalResponse>(res);
  },

  async optOut(payload: OptOutRequest): Promise<OptOutResponse> {
    const res = await apiRequest<unknown>("/personalization/opt-out", {
      method: "POST",
      body: JSON.stringify(payload),
      retries: 0,
      timeoutMs: 10000,
    });
    return unwrapResponse<OptOutResponse>(res);
  },

  async resetProfile(): Promise<ProfileLifecycleResponse> {
    const res = await apiRequest<unknown>("/personalization/reset", {
      method: "POST",
      retries: 0,
      timeoutMs: 12000,
    });
    return unwrapResponse<ProfileLifecycleResponse>(res);
  },

  async deleteProfile(): Promise<ProfileLifecycleResponse> {
    const res = await apiRequest<unknown>("/personalization/profile", {
      method: "DELETE",
      retries: 0,
      timeoutMs: 12000,
    });
    return unwrapResponse<ProfileLifecycleResponse>(res);
  },

  // --------------------------------------------------------------------------
  // User Inbox, Explainability ("Why am I seeing this?") & Devices
  // --------------------------------------------------------------------------

  async getInbox(params?: {
    page?: number;
    page_size?: number;
    unread_only?: boolean;
    category?: string;
  }): Promise<InboxListResponse> {
    const res = await apiRequest<unknown>("/notifications", {
      method: "GET",
      params: {
        page: params?.page ?? 1,
        page_size: params?.page_size ?? 20,
        unread_only: params?.unread_only,
        category: params?.category || undefined,
      },
      retries: 1,
      timeoutMs: 10000,
    });
    return unwrapResponse<InboxListResponse>(res);
  },

  async markNotificationRead(notificationId: string): Promise<InboxReadResponse> {
    const res = await apiRequest<unknown>(`/notifications/${notificationId}/read`, {
      method: "POST",
      retries: 0,
      timeoutMs: 10000,
    });
    return unwrapResponse<InboxReadResponse>(res);
  },

  async markAllNotificationsRead(): Promise<InboxReadAllResponse> {
    const res = await apiRequest<unknown>("/notifications/read-all", {
      method: "POST",
      retries: 0,
      timeoutMs: 10000,
    });
    return unwrapResponse<InboxReadAllResponse>(res);
  },

  async recordNotificationInteraction(
    notificationId: string,
    payload: InboxInteractionRequest
  ): Promise<InboxInteractionResponse> {
    const res = await apiRequest<unknown>(`/notifications/${notificationId}/interact`, {
      method: "POST",
      body: JSON.stringify(payload),
      retries: 0,
      timeoutMs: 10000,
    });
    return unwrapResponse<InboxInteractionResponse>(res);
  },

  async getNotificationWhy(notificationId: string): Promise<NotificationWhyResponse> {
    const res = await apiRequest<unknown>(`/notifications/${notificationId}/why`, {
      method: "GET",
      retries: 1,
      timeoutMs: 10000,
    });
    return unwrapResponse<NotificationWhyResponse>(res);
  },

  async registerDevice(payload: DeviceRegisterRequest): Promise<DeviceRegisterResponse> {
    const res = await apiRequest<unknown>("/notifications/devices", {
      method: "POST",
      body: JSON.stringify(payload),
      retries: 0,
      timeoutMs: 10000,
    });
    return unwrapResponse<DeviceRegisterResponse>(res);
  },

  // --------------------------------------------------------------------------
  // Admin Personalization Command Center
  // --------------------------------------------------------------------------

  async getAdminOverview(): Promise<PersonalizationOverviewResponse> {
    const res = await apiRequest<unknown>("/personalization/admin/overview", {
      method: "GET",
      retries: 1,
      timeoutMs: 10000,
    });
    return unwrapResponse<PersonalizationOverviewResponse>(res);
  },

  async getAdminDimensions(): Promise<DimensionExplorerResponse> {
    const res = await apiRequest<unknown>("/personalization/admin/dimensions", {
      method: "GET",
      retries: 1,
      timeoutMs: 10000,
    });
    return unwrapResponse<DimensionExplorerResponse>(res);
  },

  async getAdminUserProfile(userId: string): Promise<PersonalizationProfileResponse> {
    const res = await apiRequest<unknown>(
      `/personalization/admin/profiles/${encodeURIComponent(userId)}`,
      {
        method: "GET",
        retries: 1,
        timeoutMs: 10000,
      }
    );
    return unwrapResponse<PersonalizationProfileResponse>(res);
  },

  async getAdminRules(): Promise<RulesListResponse> {
    const res = await apiRequest<unknown>("/personalization/admin/rules", {
      method: "GET",
      retries: 1,
      timeoutMs: 10000,
    });
    return unwrapResponse<RulesListResponse>(res);
  },

  async updateAdminRules(payload: RuleConfigUpdateRequest): Promise<RuleConfigSchema> {
    const res = await apiRequest<unknown>("/personalization/admin/rules", {
      method: "PUT",
      body: JSON.stringify(payload),
      retries: 0,
      timeoutMs: 12000,
    });
    return unwrapResponse<RuleConfigSchema>(res);
  },

  async rollbackAdminRules(version: number): Promise<RuleRollbackResponse> {
    const res = await apiRequest<unknown>(`/personalization/admin/rules/rollback/${version}`, {
      method: "POST",
      retries: 0,
      timeoutMs: 12000,
    });
    return unwrapResponse<RuleRollbackResponse>(res);
  },

  async previewDecision(payload: DecisionPreviewRequest): Promise<DecisionPreviewResponse> {
    const res = await apiRequest<unknown>("/personalization/admin/preview", {
      method: "POST",
      body: JSON.stringify(payload),
      retries: 0,
      timeoutMs: 15000,
    });
    return unwrapResponse<DecisionPreviewResponse>(res);
  },

  async listSegments(): Promise<SegmentResponse[]> {
    const res = await apiRequest<unknown>("/personalization/admin/segments", {
      method: "GET",
      retries: 1,
      timeoutMs: 10000,
    });
    return unwrapArray<SegmentResponse>(res, ["segments", "items"]);
  },

  async createSegment(payload: SegmentCreateRequest): Promise<SegmentResponse> {
    const res = await apiRequest<unknown>("/personalization/admin/segments", {
      method: "POST",
      body: JSON.stringify(payload),
      retries: 0,
      timeoutMs: 12000,
    });
    return unwrapResponse<SegmentResponse>(res);
  },

  async getSegmentMembers(
    segmentIdOrKey: string,
    page = 1,
    pageSize = 20
  ): Promise<SegmentMembersResponse> {
    const res = await apiRequest<unknown>(
      `/personalization/admin/segments/${encodeURIComponent(segmentIdOrKey)}/members`,
      {
        method: "GET",
        params: { page, page_size: pageSize },
        retries: 1,
        timeoutMs: 10000,
      }
    );
    return unwrapResponse<SegmentMembersResponse>(res);
  },

  async getFatigueOverview(): Promise<FatigueOverviewResponse> {
    const res = await apiRequest<unknown>("/personalization/admin/fatigue", {
      method: "GET",
      retries: 1,
      timeoutMs: 10000,
    });
    return unwrapResponse<FatigueOverviewResponse>(res);
  },

  async updateFatigueControls(
    payload: FatigueControlsUpdateRequest
  ): Promise<FatigueOverviewResponse> {
    const res = await apiRequest<unknown>("/personalization/admin/fatigue/controls", {
      method: "PUT",
      body: JSON.stringify(payload),
      retries: 0,
      timeoutMs: 12000,
    });
    return unwrapResponse<FatigueOverviewResponse>(res);
  },

  async getPerformanceAnalytics(windowDays = 30): Promise<PerformanceAnalyticsResponse> {
    const res = await apiRequest<unknown>("/personalization/admin/analytics", {
      method: "GET",
      params: { window_days: windowDays },
      retries: 1,
      timeoutMs: 10000,
    });
    return unwrapResponse<PerformanceAnalyticsResponse>(res);
  },

  async listExperiments(): Promise<ExperimentResponse[]> {
    const res = await apiRequest<unknown>("/personalization/admin/experiments", {
      method: "GET",
      retries: 1,
      timeoutMs: 10000,
    });
    return unwrapArray<ExperimentResponse>(res, ["experiments", "items"]);
  },

  async createExperiment(payload: ExperimentCreateRequest): Promise<ExperimentResponse> {
    const res = await apiRequest<unknown>("/personalization/admin/experiments", {
      method: "POST",
      body: JSON.stringify(payload),
      retries: 0,
      timeoutMs: 12000,
    });
    return unwrapResponse<ExperimentResponse>(res);
  },

  async stopExperiment(
    experimentId: string,
    payload?: ExperimentStopRequest
  ): Promise<ExperimentResponse> {
    const res = await apiRequest<unknown>(
      `/personalization/admin/experiments/${encodeURIComponent(experimentId)}/stop`,
      {
        method: "POST",
        body: payload ? JSON.stringify(payload) : undefined,
        retries: 0,
        timeoutMs: 12000,
      }
    );
    return unwrapResponse<ExperimentResponse>(res);
  },

  async evaluateAutomation(
    automationKey: AutomationKey,
    payload: AutomationEvaluateRequest = { limit: 50, dry_run: true }
  ): Promise<AutomationEvaluateResponse> {
    const res = await apiRequest<unknown>(
      `/personalization/admin/automations/${encodeURIComponent(automationKey)}/evaluate`,
      {
        method: "POST",
        body: JSON.stringify(payload),
        retries: 0,
        timeoutMs: 15000,
      }
    );
    return unwrapResponse<AutomationEvaluateResponse>(res);
  },

  // --------------------------------------------------------------------------
  // Admin Delivery, Outbox & DLQ Operations
  // --------------------------------------------------------------------------

  async getOutbox(params?: {
    page?: number;
    page_size?: number;
    status?: string;
  }): Promise<OutboxListResponse> {
    const res = await apiRequest<unknown>("/notifications/admin/outbox", {
      method: "GET",
      params: {
        page: params?.page ?? 1,
        page_size: params?.page_size ?? 20,
        status: params?.status || undefined,
      },
      retries: 1,
      timeoutMs: 10000,
    });
    return unwrapResponse<OutboxListResponse>(res);
  },

  async processOutbox(limit = 50): Promise<OutboxProcessResponse> {
    const res = await apiRequest<unknown>("/notifications/admin/process-outbox", {
      method: "POST",
      params: { limit },
      retries: 0,
      timeoutMs: 15000,
    });
    return unwrapResponse<OutboxProcessResponse>(res);
  },

  async getDlq(params?: {
    page?: number;
    page_size?: number;
    resolution_status?: string;
  }): Promise<DLQListResponse> {
    const res = await apiRequest<unknown>("/notifications/admin/dlq", {
      method: "GET",
      params: {
        page: params?.page ?? 1,
        page_size: params?.page_size ?? 20,
        resolution_status: params?.resolution_status || undefined,
      },
      retries: 1,
      timeoutMs: 10000,
    });
    return unwrapResponse<DLQListResponse>(res);
  },

  async replayDlqEntry(dlqId: string): Promise<OutboxReplayResponse> {
    const res = await apiRequest<unknown>(
      `/notifications/admin/dlq/${encodeURIComponent(dlqId)}/replay`,
      {
        method: "POST",
        retries: 0,
        timeoutMs: 12000,
      }
    );
    return unwrapResponse<OutboxReplayResponse>(res);
  },

  async discardDlqEntry(
    dlqId: string,
    payload?: DLQDiscardRequest
  ): Promise<OutboxReplayResponse> {
    const res = await apiRequest<unknown>(
      `/notifications/admin/dlq/${encodeURIComponent(dlqId)}/discard`,
      {
        method: "POST",
        body: payload ? JSON.stringify(payload) : undefined,
        retries: 0,
        timeoutMs: 12000,
      }
    );
    return unwrapResponse<OutboxReplayResponse>(res);
  },

  async sendPersonalizedBroadcast(
    payload: PersonalizedBroadcastRequest
  ): Promise<PersonalizedBroadcastResponse> {
    const res = await apiRequest<unknown>("/notifications/admin/broadcast", {
      method: "POST",
      body: JSON.stringify(payload),
      retries: 0,
      timeoutMs: 20000,
    });
    return unwrapResponse<PersonalizedBroadcastResponse>(res);
  },
};

export default personalizationService;
