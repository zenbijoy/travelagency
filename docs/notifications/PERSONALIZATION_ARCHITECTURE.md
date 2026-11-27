# Hyper-Personalized Notification Intelligence Architecture

**Platform**: ShopnoJatra (স্বপ্ন যাত্রা) Travel Ecosystem  
**Extension Target**: Event-Driven Notification Intelligence Platform (`v1.0` -> `v2.0`)  
**Scope**: 20-Dimensional User Intelligence, Time-Decayed Behavioral Scoring, 10-Feature Relevance & Separate Confidence Engine, 24-Step Decision Pipeline, Fatigue & Adaptive Timing, Privacy & Non-Gating AI Guardrails, 10 Travel Automations (`A–J`), and Controlled A/B Experimentation.

---

## 1. Architectural Integration with Existing Notification Platform

This architecture preserves and extends the existing transactional notification platform (`docs/notifications/ARCHITECTURE.md`, `EVENT_CATALOG.md`, `backend/app/models/notification.py`, `backend/app/notifications/events/*`, and `backend/app/notifications/outbox/publisher.py`).

### Integration Principles
1. **Zero Duplication of Core Tables**: Existing tables from `20260621_notification_platform_event_driven_architecture.sql` (`notifications`, `notification_outbox`, `notification_deliveries`, `notification_devices`, `notification_user_preferences`, `notification_templates`, `notification_rules`, `notification_campaigns`, `notification_analytics`, `notification_dlq`) remain authoritative for outbox staging, device tokens, delivery logs, and DLQ quarantine.
2. **Domain Events Flow Through OutboxPublisher**: All 34 domain events across the 8 catalog categories (`user.*`, `security.*`, `booking.*`, `flight.*` / `hotel.*` / `travel.*`, `agency.*`, `marketplace.*`, `system.*`) continue to be staged atomically via `OutboxPublisher.publish(db, event)` inside caller transactions.
3. **Personalized Decision Gate in Outbox Worker & Broadcasts**:
   - The Outbox Worker (`OutboxWorkerProcessor`) polls pending rows (`SELECT ... FOR UPDATE SKIP LOCKED` on Postgres, mutex-guarded query on SQLite) and routes each event through `NotificationDecisionPipeline` before channel adapters (`PushDeliveryAdapter`, `InAppDeliveryAdapter`, `EmailDeliveryAdapter`, `SmsDeliveryAdapter`) dispatch.
   - Admin broadcasts (`POST /api/v1/notifications/admin/broadcast`) and scheduled automations (`A–J`) evaluate recipients individually through `NotificationDecisionPipeline`—never sending identical promotional blasts blindly.
4. **Critical Alert Non-Suppression**: High-priority transactional/safety events (`priority >= 9`, security OTPs/logins, SOS panic alerts, booking confirmations, payment receipts/failures, ticket issuance, cancellations/refunds, verified travel disruptions) strictly bypass promotional suppression, fatigue throttling, and A/B experimentation.

```
[34 Domain Events / 10 Automations (A-J) / Admin Broadcast]
                           │
                           ▼
             [OutboxPublisher (Atomic ACID)]
                           │
                           ▼
         [notification_outbox -> OutboxWorkerProcessor]
                           │
                           ▼
        [24-Step NotificationDecisionPipeline]
          ├── Privacy & Consent Guard (Server-side)
          ├── 20-Dim Profile Snapshot (Batched Query)
          ├── RelevanceEngine (10 Features) + Confidence
          ├── TravelContextEngine (Timeline + Verified Context)
          ├── FatigueEngine & AdaptiveTimingEngine & ChannelSelector
          ├── Non-Gating AI Enrichment (Gemini + 1.5s Breaker -> EN/BN Templates)
          └── FactualValidator & Deep-Link Allowlist
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
      [Suppressed]   [Scheduled]    [Dispatched]
      (DecisionLog)  (Outbox Future) (Push/In-App/Email/SMS -> Deliveries / DLQ)
```

---

## 2. 20-Dimensional User Intelligence Profile Model

Every user profile is structured around **20 canonical dimensions**. Each dimension is stored with strict metadata:
- `value`: JSON-compatible typed payload (or `"unknown"` when unobserved)
- `confidence`: float in `[0.0, 100.0]` (`0.0` when unobserved)
- `source`: `"user_preference" | "behavioral" | "transactional" | "contextual" | "unknown"`
- `updated_at`: UTC timestamp
- `data_quality`: `"high" | "medium" | "low" | "unknown"`
- `expiration_policy` & `expires_at`: dimension-specific staleness/TTL rule
- `is_user_provided`: boolean (explicit `True` overrides behavioral inference)
- `permission_granted`: boolean (consent state gating usage)

### Canonical 20 Dimensions
| # | Dimension Key | Primary Data & Purpose | Default Source / Expiration |
|---|---|---|---|
| 1 | `profile_context` | Account role, preferred currency (`BDT`), active trip flags (no sensitive demographics) | `user_preference` / 365d sliding |
| 2 | `location_context` | Consented `home_city` & optional `travel_origin` (never continuous background GPS) | `user_preference` / 180d sliding |
| 3 | `destination_interest` | Time-decayed top destinations + explicit favorites (`Cox's Bazar`, `Sylhet`, etc.) | `behavioral` / 90d sliding |
| 4 | `search_behavior` | Search velocity, recent queries, filters, search abandonment indicators | `behavioral` / 30d sliding |
| 5 | `travel_frequency` | Historical completed trips & cadence (never equated with account age) | `transactional` / 365d sliding |
| 6 | `budget_profile` | Tier (`budget`, `economy`, `mid_range`, `premium`, `luxury`, `flexible`), spend range | `user_preference` or `transactional` / 180d sliding |
| 7 | `travel_style` | Multi-label styles (`solo`, `family`, `couple`, `friends`, `business`, `adventure`, `relaxation`, `cultural`, opt-in `religious_travel`) | `user_preference` or `behavioral` / 180d sliding |
| 8 | `transport_preference` | Preferred modes (`flight`, `train`, `bus`, `launch`, `private_vehicle`, `mixed`) | `user_preference` or `behavioral` / 180d sliding |
| 9 | `accommodation_preference` | Property types (`hotel`, `resort`, `eco_stay`, etc.) & amenities (`pool`, `wifi`, `breakfast`, `ac`, `parking`, `family_room`) | `user_preference` or `behavioral` / 180d sliding |
| 10 | `time_preference` | Explicit preferred send window (`morning`, `afternoon`, `evening`, `late_evening`) + quiet hours + timezone | `user_preference` / 120d sliding |
| 11 | `activity_level` | Lifecycle state (`new_user`, `active`, `highly_active`, `returning`, `inactive`, `dormant`, `reactivated`) | `behavioral` / 30d sliding |
| 12 | `engagement_behavior` | Open/click/CTA completion rates, category-specific engagement, hourly histogram | `behavioral` / 90d sliding |
| 13 | `notification_tolerance` | Category-level fatigue scores, dismissal streaks, frequency cap tolerance | `behavioral` / 30d sliding |
| 14 | `language_communication_style` | Preferred language (`en` \| `bn`) and tone (`concise`, `informative`, `friendly`, `formal`) | `user_preference` / non-expiring |
| 15 | `price_sensitivity` | Sensitivity index (`0–100`), price alert subscriptions, deal-click elasticity | `behavioral` / 90d sliding |
| 16 | `travel_timeline` | 10-stage journey lifecycle (`no_planned_trip` -> `booked` -> `traveling` -> `post_trip`) | `contextual` / 14d sliding |
| 17 | `loyalty_engagement_tier` | Tier (`explorer`, `silver`, `gold`, `diamond`), points engagement | `transactional` / 180d sliding |
| 18 | `contextual_travel_conditions` | Verified external weather, route advisories, price trends, seasonality for user's active interests | `contextual` / provider `valid_until` (3d default) |
| 19 | `consent_communication_preferences` | Server-side opt-ins per channel & category, personalization toggle, marketing consent | `user_preference` / non-expiring |
| 20 | `personalization_confidence` | Aggregate profile confidence (`0–100`), sufficiency tier (`low`, `medium`, `high`), dimension coverage | `contextual` / computed (30d) |

### Profile Integrity Rules
- **Unknown Preserved**: Unobserved dimensions stay `value = "unknown"`, `confidence = 0.0`, `data_quality = "unknown"`, `source = "unknown"`. Missing data is never fabricated.
- **Explicit Wins**: User-provided preferences (`is_user_provided = True`) always override behavioral inferences and are recorded in `user_profile_change_logs` with `profile_version` increment.
- **Zero Sensitive Demographics**: Religion, health, political affiliation, ethnicity, and sensitive financial attributes are never inferred. `religious_travel` is stored strictly if explicitly selected by the user inside `travel_style`.

---

## 3. Hybrid Normalized Relational + Dimension Schema

Defined in `supabase/migrations/20260622_hyper_personalized_notification_intelligence.sql` and `backend/app/models/personalization.py` using SQLite-compatible generic `JSON` columns (`DateTime(timezone=True)`, `UUIDMixin`, `TimestampMixin`) and PostgreSQL `(SELECT auth.uid())` + `public.is_admin()` RLS policies.

| Table | ORM Class | Responsibility |
|---|---|---|
| `user_personalization_profiles` | `UserPersonalizationProfile` | Core 1:1 user personalization state, consent flags, language/tone/digest settings, confidence, active trip snapshot, `profile_version` |
| `user_profile_dimensions` | `UserProfileDimension` | Normalized per-dimension `(user_id, dimension_key)` rows storing value, confidence, source, data quality, permission, and expiry |
| `user_profile_change_logs` | `UserProfileChangeLog` | Immutable audit trail of preference edits, explicit corrections, resets, and overrides |
| `user_behavioral_signals` | `UserBehavioralSignal` | Indexed stream of permitted behavioral signals with `signal_weight`, `price_paisa`, `occurred_at`, and `expires_at` |
| `user_destination_interests` | `UserDestinationInterest` | Materialized per-`(user_id, destination)` time-decayed interest scores (`0–100`), search/booking counts, explicit favorite flag |
| `user_notification_fatigue` | `UserNotificationFatigue` | Per-`(user_id, category)` rolling fatigue scores (`0–100`), 24h/7d counts, opens/clicks/dismissals/ignores, `cooldown_until` |
| `personalization_rule_configs` | `PersonalizationRuleConfig` | Versioned admin configurations for 10 feature weights, dimension toggles, timing, fatigue, AI toggles, and thresholds (supports rollback) |
| `personalization_segments` | `PersonalizationSegment` | Dynamic query criteria definitions (14 system segments + custom rules) evaluated live against DB tables |
| `contextual_travel_conditions` | `ContextualTravelCondition` | Verified weather, advisory, flight status, and hotel availability context with `provider`, `observed_at`, `valid_until`, `reliability_score`, `is_verified` |
| `personalization_decision_logs` | `PersonalizationDecisionLog` | Auditable 24-step evaluation record (`relevance_score`, `confidence_score`, `fatigue_score`, `personalization_tier`, `explanation_factors`, `feature_breakdown`, outcome metrics) |
| `personalization_experiments` | `PersonalizationExperiment` | Controlled A/B test definitions, variants, sample size & opt-out spike stop conditions |
| `personalization_experiment_assignments` | `PersonalizationExperimentAssignment` | Deterministic per-`(experiment_id, user_id)` variant allocation and conversion/revenue attribution |

### Batch Query Performance Strategy
During campaign broadcasts or batch automation runs, `UserProfileService.build_20d_snapshots_batch(db, user_ids)` executes batched `IN (...)` queries across `UserPersonalizationProfile`, `UserProfileDimension`, `UserDestinationInterest`, `UserNotificationFatigue`, and `NotificationUserPreference`—avoiding `N+1` or `20 * N` per-recipient round trips.

---

## 4. Time-Decay Interest Mathematics

Behavioral signals lose strength over time according to an exponential decay function:

$$\text{InterestRaw}(u, d) = \sum_{s \in S_{u,d}} w_s \cdot \exp\big(-\lambda \cdot t_{\text{days}}(s)\big) \cdot c_s$$

Where:
- $\lambda$: Configurable decay constant (default `0.08`, half-life $\approx 8.66$ days) stored in `PersonalizationRuleConfig.decay_lambda`.
- $t_{\text{days}}(s) = \max(0, \frac{t_{\text{now}} - t_{\text{occurred}}}{86400})$.
- $w_s$: Signal-type weight (configurable; negative weights reduce affinity).
- $c_s \in [0, 1]$: Signal confidence multiplier.

### Default Signal Weights & Guardrails
| Signal Type | Default Weight | Guardrail / Behavior |
|---|---|---|
| `explicit_favorite` | `+15.0` | Explicit user choice; establishes strong baseline intent |
| `booking` (`hotel_booking`) | `+12.0` (`+11.5`) | Verified transactional commitment |
| `converted` (`notification_conversion`) | `+8.5` | Post-notification booking conversion attribution |
| `price_alert_subscribe` | `+8.0` | Explicit price intent |
| `saved_destination` / `wishlist` | `+7.5` / `+7.0` | Deliberate save action |
| `repeated_search` | `+6.0` | Requires $\ge 2$ searches within window |
| `booking_attempt` | `+5.0` | Checkout / reservation intent |
| `cta_completed` / `search` | `+3.5` / `+3.0` | Single search insufficient alone for high confidence |
| `transport_selected` | `+2.5` | Preferred transit interaction |
| `notification_click` | `+1.5` | Subject to anti-feedback-loop cap |
| `filter_used` / `hotel_view` | `+1.2` | Soft attribute signal |
| `notification_open` / `destination_view` | `+0.8` | Soft engagement / view |
| `page_view` | `+0.6` | Single accidental page view cannot reach high score or trigger promo |
| `ignored` / `cancellation` | `-0.6` / `-2.5` | Mild negative decay adjustment |
| `dismissal` | `-4.5` | Reduces destination/category affinity & raises fatigue |
| `explicit_remove` / `opt_out` | `-10.0` / `-16.0` | Strong negative + triggers server-side consent suppression |

Normalized destination score is mapped smoothly into `[0.0, 100.0]` (`100 * (1 - exp(-raw / scale))` or bounded saturation curve) while **confidence** is computed independently from signal diversity, recency, and explicit confirmations so a single accidental click yields low confidence and never triggers aggressive messaging.

---

## 5. 10-Feature Relevance Scoring & Separate Confidence Model

`RelevanceEngine` evaluates every candidate notification per recipient into a `RelevanceResult` containing two orthogonal scores:

### 5.1 Relevance Score (`0.0 – 100.0`)
Computed as a weighted linear combination of 10 normalized `[0, 100]` features using the active `PersonalizationRuleConfig` weights (validated so `all(w >= 0)` and `abs(sum(w) - 1.0) <= 1e-4`):

| # | Feature | Default Weight | Evaluation Inputs |
|---|---|---|---|
| 1 | `DestinationInterest` | `0.20` | Time-decayed destination affinity + explicit favorites vs candidate destination |
| 2 | `TravelIntent` | `0.15` | `travel_timeline` stage alignment (e.g., searching/comparing boosts offer relevance) |
| 3 | `BudgetMatch` | `0.12` | Candidate price/tier vs `budget_profile` & `price_sensitivity` |
| 4 | `SearchRelevance` | `0.10` | Recent search routes, dates, filters vs candidate payload |
| 5 | `TravelStyleMatch` | `0.10` | Overlap with user `travel_style` tags |
| 6 | `TransportMatch` | `0.08` | Candidate transport mode (`flight`, `train`, `bus`, `launch`) vs preference |
| 7 | `EngagementMatch` | `0.07` | Historical category & content engagement rate |
| 8 | `TimingMatch` | `0.07` | Alignment with preferred send window & active trip window |
| 9 | `SeasonalityMatch` | `0.06` | Destination seasonal suitability + verified weather/advisory context |
| 10 | `CategoryPreference` | `0.05` | Category opt-in strength and lack of negative category sentiment |

### 5.2 Separate Confidence Score (`0.0 – 100.0`)
Relevance measures **fit**; Confidence measures **evidence certainty** across 4 axes:
1. **Data Sufficiency**: Number of populated relevant dimensions.
2. **Freshness**: Recency of supporting signals vs expiration thresholds.
3. **Explicit vs Inferred Ratio**: User-supplied preferences score higher than passive inference.
4. **Consistency**: Absence of contradictory signals or recent dismissals.

### Tier Assignment & Permission Separation
- `confidence < 35`: **Generic / Safe Onboarding** (`generic` tier) — avoids presumptuous personalization.
- `35 <= confidence <= 70`: **Light Personalization** (`light` tier) — uses explicit language/tone & high-confidence facts only.
- `confidence > 70` and `relevance >= min_relevance_threshold`: **Deep Personalization** (`deep` tier) — tailored destination, style, budget, and timing.
- **Crucial Invariant**: High relevance (`95/100`) **NEVER** grants permission to send if server-side consent is false, category is opted out, or fatigue/caps block dispatch.

---

## 6. 24-Step Notification Decision Pipeline

Every non-preview dispatch path executes `NotificationDecisionPipeline` in strict order:

1. **Identify Eligible Recipients**: Resolve target user IDs from event payload, segment query, or broadcast audience.
2. **Server-Side Consent Verification**: Check `PrivacyAndConsentGuard` (`NotificationUserPreference` + `UserPersonalizationProfile.personalization_enabled` + channel/category opt-ins). Critical transactional/security events proceed on mandatory safety channels only.
3. **Event Validity & Expiration Check**: Reject expired events or stale automation triggers (`expires_at < now`).
4. **Build Minimal Context**: Hydrate batched 20D profile snapshot + verified `TravelContextEngine` facts (zero raw sensitive PII).
5. **Compute Relevance Score (`0–100`)**: Evaluate 10 features using active `PersonalizationRuleConfig`.
6. **Compute Confidence Score (`0–100`)**: Evaluate evidence certainty & tier (`generic` \| `light` \| `deep`).
7. **Evaluate Travel Timeline (`Dim 16`)**: Align message framing with the user's current journey stage (`no_planned_trip` .. `post_trip`).
8. **Fatigue Check (`FatigueEngine`)**: Inspect per-user & per-category fatigue score (`0–100`) and cooldowns. Suppress or downgrade low-priority promos if fatigued; **never** suppress critical alerts.
9. **Duplicate / Similar Suppression**: Check recent `PersonalizationDecisionLog` / `NotificationDelivery` within configurable TTL window for same event/destination/topic.
10. **Frequency Cap Enforcement**: Enforce daily/weekly marketing & category caps (`frequency_cap_marketing_per_day`, admin global/campaign caps).
11. **Quiet Hours Evaluation**: Enforce user `quiet_hours_start`–`quiet_hours_end` in user `timezone`; bypass only for critical priority (`>= 9`) or imminent trip departures.
12. **Category Classification & Policy Gate**: Verify category rules (`booking`, `security`, `flight_alerts`, `price_alerts`, `marketing`, `community`, `system`).
13. **Channel Selection (`ChannelSelector`)**: Choose optimal opted-in channel(s) (`push`, `in_app`, `email`, `sms`) based on urgency, reliability, and user engagement—avoiding redundant multi-channel blasts.
14. **Adaptive Send-Time Optimization (`AdaptiveTimingEngine`)**: Pick optimal delivery slot honoring explicit `time_preference` override, histogram peak hour, and `max_delay_hours`; critical alerts dispatch immediately.
15. **Template Selection**: Resolve bilingual (`en` \| `bn`) template matching category, tone (`concise`, `informative`, `friendly`, `formal`), and personalization tier.
16. **Safe AI / Template Personalization**: If eligible for AI (`non-critical`, `ai_enabled`, `confidence` adequate), invoke `AIPersonalizationService` with Gemini (`1.5s` timeout + circuit breaker) using PII-stripped `verified_facts`; fall back instantaneously to deterministic templates on any error/timeout.
17. **Factual Validation (`FactualValidator`)**: Confirm rendered copy introduces zero unverified prices, discounts, seat/hotel availability, weather, or PII leaks; fall back to deterministic template if validation fails.
18. **Deep-Link Validation**: Verify `deep_link` matches allowed ShopnoJatra route prefixes (`/(tabs)`, `/screens/`, `shopnojatra://`) with zero open-redirect vectors.
19. **Create Notification & Decision Log**: Persist `PersonalizationDecisionLog` (with `explanation_factors` & `feature_breakdown`, never AI chain-of-thought) and stage/record `Notification` / `NotificationOutbox`.
20. **Dispatch or Schedule**: Dispatch immediately via `DeliveryAdapter`s or persist `scheduled_for` in `NotificationOutbox`.
21. **Track Delivery**: Write `NotificationDelivery` records with latency, provider message ID, and error codes; retry with exponential backoff + jitter (`min(2^attempts * 5, 3600) + jitter`), quarantining to `NotificationDLQ` at `max_attempts`.
22. **Track Engagement**: Capture `opened`, `clicked`, `dismissed`, `ignored`, `cta_completed`, `converted` via `POST /notifications/{id}/interact`.
23. **Update Behavioral Profile (Anti-Feedback-Loop Guard)**: Update engagement & destination scores safely. **Guardrail**: A notification open/click updates engagement statistics and `opened`/`clicked` flags, but has a bounded/dampened weight and **never** spawns cascading promotional follow-ups or self-reinforcing spam loops.
24. **Experiment & Revenue Attribution**: Attribute exposure, engagement, and `revenue_paisa` to active `PersonalizationExperimentAssignment` (if assigned) and daily `NotificationAnalytics`.

---

## 7. Fatigue Scoring & Adaptive Timing

### Fatigue Engine (`0.0 – 100.0`)
- Evaluated independently per `(user_id, category)` in `user_notification_fatigue`.
- Inputs: `received_24h`, `received_7d`, `ignored_7d`, `dismissed_7d`, `opt_out_count`, recent burst density, offset slightly by positive opens/clicks.
- Effects of **High Fatigue** (`>= 65`):
  - Suppresses low-priority promotional campaigns.
  - Triggers category cooldown (`cooldown_until`).
  - Routes eligible recommendations to scheduled digest (`daily` / `weekly`) rather than push interruption.
- Effects of **Low Fatigue**: Never overrides consent or frequency caps and never increases sending beyond policy limits.

### Adaptive Timing Engine
- Explicit `time_preference` (e.g., `"evening"`) is an authoritative override over inferred hours.
- Otherwise scores candidate delivery windows using user timezone (`Asia/Dhaka` default), engagement hour histogram, category norms, and quiet hours.
- Configurable via `PersonalizationRuleConfig.timing_config_json`: `adaptive_timing_enabled`, `min_confidence`, `eligible_categories`, `allowed_windows`, `max_delay_hours`, `fallback_hour`, `emergency_override_policy`.

---

## 8. Privacy, Consent & Security Guardrails

1. **Server-Side Consent Enforcement**: All eligibility checks verify persisted `notification_user_preferences` and `user_personalization_profiles` on the server; client flags alone cannot bypass opt-outs.
2. **Sensitive Attribute Prohibition**: `PrivacyAndConsentGuard` rejects signals/corrections attempting to infer or store religion, health, political affiliation, ethnicity, or sensitive financial attributes. Only explicit user selection of `"religious_travel"` within `travel_style` is permitted.
3. **Lock-Screen Safe Push Copy**: Abandoned search and behavioral alerts use neutral, privacy-preserving `push_short_title` / `push_short_body` so sensitive search details are not exposed on lock screens.
4. **PII Exclusion from AI Prompts**: Passports, NID numbers, phone numbers, email addresses, payment tokens, and raw IP addresses are stripped before calling Gemini.
5. **User Transparency & Control**:
   - `"Why am I seeing this?"` (`GET /api/v1/notifications/{id}/why`) returns safe, human-readable `explanation_factors` derived from auditable decision facts.
   - Users can inspect their 20D profile (`GET /personalization/profile`), correct inferred dimensions (`PATCH /personalization/profile/correct`), opt out (`POST /personalization/opt-out`), reset behavioral data (`POST /personalization/reset`), or delete all personalization profile records (`DELETE /personalization/profile`).
6. **Retention**: Expired `UserBehavioralSignal` and stale `ContextualTravelCondition` records are purged by retention policies.

---

## 9. AI Non-Gating Guardrails & Bilingual Templates

- **Non-Gating**: Critical transactional notifications (`booking.confirmed`, `security.auth.*`, `flight.schedule_changed`, `travel.disruption.detected`, `marketplace.trip.sos_triggered`) bypass AI personalization completely.
- **Circuit Breaker & Timeout**: `AIPersonalizationService` wraps `GeminiConciergeService` (`google-genai`) with `asyncio.wait_for(..., timeout=1.5)` and `gemini_circuit_breaker`.
- **Deterministic EN/BN Template Pipeline**: `ai/templates.py` renders authentic English (`en`) and Bangla (`bn`) copy across all 4 tones (`concise`, `informative`, `friendly`, `formal`) and 3 confidence tiers (`low`/`generic`, `medium`/`light`, `high`/`deep`).
- **Factual Validation**: `FactualValidator` guarantees AI-generated text contains zero unverified prices, discounts, room/seat availability claims, weather claims, or forbidden URLs. Any failure falls back transparently to deterministic template output.

---

## 10. The 10 Personalized Travel Automations (`A–J`)

Evaluated dynamically via `TravelAutomationsService` (`POST /api/v1/personalization/admin/automations/{automation_key}/evaluate` and scheduled workers):

| Key | Automation Name | Trigger & Personalization Rules | Safety / Suppression Guardrail |
|---|---|---|---|
| **A** | Destination Discovery | Top time-decayed destinations matched with `travel_style`, `budget_profile`, and regional seasonality | Suppresses repeated pushes for same destination within TTL |
| **B** | Smart Price Alert | Triggered on verified price drop for explicit `PriceAlert` or high `price_sensitivity` | Requires meaningful delta %, availability check, cooldown, deep-link to search |
| **C** | Abandoned Search | Recent high-intent searches (`>= 2` or filter usage) without subsequent booking | Suppresses immediately once booked; lock-screen safe push summary |
| **D** | Trip Preparation | Upcoming confirmed booking (`preparing_for_departure` timeline) | Surfaces departure time, transport, e-ticket QR readiness, hotel check-in, passenger info |
| **E** | Returning Traveler | `post_trip` window after trip end date | Sends review prompt & complementary destination ideas; blocks immediate promo spam |
| **F** | Inactive User Reactivation | `inactive` / `dormant` user with historical destination affinity, valid consent, and low fatigue | Sends tailored offer matching historical interest—never generic `"We miss you"` spam |
| **G** | Weather-Based Personalization | Verified, non-expired `ContextualTravelCondition` (`condition_type='weather'`) for user's interest/upcoming trip | Ignores unverified/expired weather; avoids false urgency |
| **H** | Hotel Personalization | Aligns hotel offers with user `budget_profile`, `accommodation_preference` (amenities/stay type), `travel_style`, and dates | Never fabricates room availability or unverified rates |
| **I** | Transport Personalization | Aligns flight/train/bus/launch recommendations with `transport_preference`, route history, duration, and price sensitivity | Respects explicit transport exclusions |
| **J** | Personalized Travel Digest | Respects `digest_frequency` (`daily` \| `weekly` \| `disabled`) | Bundles top destinations, verified deals, active price alerts, and upcoming trip prep |

---

## 11. Controlled A/B Testing & Bounded Adaptive Learning

- **Deterministic Assignment**: `sha256(f"{experiment_id}:{user_id}")` guarantees stable per-user variant assignment (including explicit `control` arm).
- **Critical Exclusion**: Critical transactional, payment, security, and SOS safety notifications are **never** enrolled in A/B experiments.
- **Statistical & Safety Monitoring**: Computes conversion rates, two-proportion z-test significance / 95% confidence intervals, and enforces automatic stop conditions (`min_sample_size`, `max_duration_days`, and `opt_out_stop_threshold` spike protection).
- **Bounded Adaptive Learning**: Recommends incremental feature weight adjustments capped at `±0.03` per iteration (re-normalized to `1.0`) for explicit admin review and approval—never mutating production rule weights silently.

---

## 12. API Contract Overview

- **User Inbox & Delivery (`/api/v1/notifications`)**:
  - `GET /notifications` (paginated, filterable by `unread_only` & `category`)
  - `POST /notifications/{id}/read`, `POST /notifications/read-all`
  - `POST /notifications/{id}/interact` (anti-feedback-loop safe engagement tracking)
  - `GET /notifications/{id}/why` (safe explainability factors)
  - `POST /notifications/devices` (push token registration)
- **Admin Delivery & Ops (`/api/v1/notifications/admin/...`)**:
  - `GET /outbox`, `POST /process-outbox`, `GET /dlq`, `POST /dlq/{id}/replay`, `POST /dlq/{id}/discard`, `POST /broadcast` (evaluates per-recipient via `NotificationDecisionPipeline`)
- **User Personalization (`/api/v1/personalization`)**:
  - `GET/PUT /preferences`, `GET /profile`, `PATCH /profile/correct`, `POST /signals`, `POST /opt-out`, `POST /reset`, `DELETE /profile`
- **Admin Command Center (`/api/v1/personalization/admin/...`)**:
  - `GET /overview`, `GET /dimensions`, `GET/PUT /rules`, `POST /rules/rollback/{version}`, `POST /preview` (Preview Only — Never Sends), `GET/POST /segments`, `GET /segments/{id}/members`, `GET /fatigue`, `PUT /fatigue/controls`, `GET /analytics`, `GET/POST /experiments`, `POST /experiments/{id}/stop`, `GET /profiles/{user_id}`, `POST /automations/{automation_key}/evaluate`
