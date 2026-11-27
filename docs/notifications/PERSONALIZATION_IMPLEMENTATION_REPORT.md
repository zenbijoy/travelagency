# ShopnoJatra Hyper-Personalized Notifications
## Implementation Report

**Project:** ShopnoJatra Hyper-Personalized Notification Intelligence  
**Report Date:** 2026-11-26  
**Status:** ✅ COMPLETE — All tests passing, all deliverables verified

---

## 1. Executive Summary

The hyper-personalized notification system for ShopnoJatra has been fully implemented, tested, and verified. The system delivers AI-driven, context-aware notifications tailored to each traveler's 20-dimension behavioral profile, with full fatigue management, consent enforcement, delivery orchestration, and admin observability.

**Key Metrics:**
- **Backend:** 77 pytest tests passed, 0 failures
- **Admin UI:** 13/13 Jest tests passed (e2e pipeline suite)
- **Mobile UI:** 7/7 Jest tests passed (personalization UI suite)
- **TypeScript:** 0 errors in all owned files (`tsc --noEmit`)

---

## 2. Architecture Overview

### 2.1 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Decision Pipeline                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Segments │→ │Relevance │→ │ Fatigue  │→ │ Channel  │   │
│  │ Engine   │  │ Scoring  │  │ Control  │  │ Selector │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                     ↓                       │
│               ┌─────────────────────────────┐              │
│               │    Outbox / Worker / DLQ     │              │
│               └─────────────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
         ↑                              ↓
┌────────────────┐              ┌───────────────────┐
│  Admin UI      │              │   Mobile UI        │
│  (8 tabs)      │              │   (Inbox + Prefs)  │
└────────────────┘              └───────────────────┘
```

### 2.2 Backend Modules

| Module | File | Purpose |
|--------|------|---------|
| Travel Context | `travel_context.py` | Extracts traveler context (destination, trip phase, booking window) |
| Relevance Scoring | `relevance.py` | Multi-factor notification relevance (0–100) |
| User Segments | `segments.py` | 20D profile-based segment classification |
| Automations | `automations.py` | Trigger-based automation rules (A/B testing) |
| Profile Dimensions | `dimensions.py` | 20 behavioral dimensions with TTLs |
| Time Decay | `time_decay.py` | Exponential decay for dimension weights |
| Behavioral Signals | `signals.py` | Signal ingestion and processing |
| Profile Service | `profile_service.py` | CRUD for user personalization profiles |
| Fatigue Engine | `fatigue.py` | Multi-tier fatigue detection and suppression |
| Timing Engine | `timing.py` | Optimal send-time prediction |
| Channel Selector | `channel_selector.py` | Consent-aware channel prioritization |
| Decision Pipeline | `decision_pipeline.py` | Orchestrates the full evaluate → deliver flow |
| Outbox Worker | `worker/processor.py` | Async batch processing with retry + DLQ |
| DLQ | `dlq/` | Dead letter queue with quarantine and replay |

### 2.3 API Endpoints

**Notifications Router** (`/api/v1/notifications/`):
- `POST /send` — Send a notification with full pipeline evaluation
- `GET /outbox` — Query outbox with filtering
- `POST /outbox/{id}/retry` — Manual retry for failed delivery
- `GET /{notification_id}/why` — Explanation for personalization decision

**Personalization Router** (`/api/v1/personalization/`):
- `GET /preferences/{user_id}` — Get user notification preferences
- `PUT /preferences/{user_id}` — Update preferences
- `GET /profile/{user_id}` — Get 20D behavioral profile
- `POST /profile/{user_id}/correct` — Correct inferred dimension
- `POST /profile/{user_id}/signal` — Record behavioral signal
- `POST /profile/{user_id}/opt-out` — Opt out of personalization
- `POST /profile/{user_id}/reset` — Reset personalization data
- `DELETE /profile/{user_id}` — GDPR profile deletion
- `POST /admin/preview` — Admin decision preview (dry run)
- `GET /admin/segments` — List all segments with member counts
- `POST /admin/batch-evaluate` — Batch evaluate campaign decisions

---

## 3. 20-Dimension Behavioral Profile

| Dimension | TTL | Weight | Description |
|-----------|-----|--------|-------------|
| `preferred_destinations` | 90d | 0.15 | Destination affinity (home/visited/wishlist) |
| `travel_frequency` | 30d | 0.12 | Historical booking cadence |
| `booking_lead_time` | 60d | 0.10 | Days in advance user typically books |
| `price_sensitivity` | 45d | 0.09 | Price elasticity (budget/value/premium/luxury) |
| `travel_style` | 90d | 0.08 | Adventure/cultural/relaxation/business |
| `accommodation_pref` | 90d | 0.08 | Hotel/hostel/resort/apartment/guesthouse |
| `transport_mode` | 60d | 0.07 | Flight/bus/train/car preferences |
| `travel_party_size` | 30d | 0.06 | Solo/couple/family/group |
| `notification_response_rate` | 14d | 0.06 | CTR on past notifications |
| `preferred_send_window` | 14d | 0.05 | Optimal notification time (08:00–21:00) |
| `category_affinity` | 21d | 0.05 | Deal/reminder/recommendation/update affinity |
| `channel_preference` | 30d | 0.04 | Push/email/SMS/in-app channel ranking |
| `content_language` | 90d | 0.04 | EN/BN content preference |
| `fatigue_sensitivity` | 7d | 0.04 | Sensitivity to notification frequency |
| `engagement_recency` | 7d | 0.03 | Days since last app engagement |
| `seasonal_patterns` | 365d | 0.03 | Eid/summer/winter travel patterns |
| `deal_urgency_response` | 21d | 0.03 | Response rate to limited-time offers |
| `loyalty_tier_behavior` | 90d | 0.02 | Tier-specific notification preferences |
| `religious_travel_interest` | 365d | 0.02 | Explicit opt-in Hajj/Umrah preferences |
| `home_city` | 365d | 0.01 | Consent-gated home location |

---

## 4. Fatigue Management

The fatigue engine uses a 5-tier model:

| Tier | Score Range | Action |
|------|-------------|--------|
| None | 0–44 | Full delivery, `allow=True` |
| Moderate | 45–64 | Reduced cap, `prefer_digest=True` |
| High | 65–74 | Minimal cap (≥1/day), promo suppression |
| Critical | 75–89 | Critical-only delivery |
| Extreme | 90–100 | Full suppression, `should_suppress=True` |

Fatigue score factors: 7-day open rate decline, unsubscribe signals, notification frequency vs. cap, complaint signals.

---

## 5. Delivery Architecture

### Outbox Pattern
1. `evaluate_batch()` creates `NotificationOutbox` rows atomically
2. `OutboxWorkerProcessor.process_batch()` claims rows with `SELECT FOR UPDATE SKIP LOCKED`
3. Delivery adapters (Push/Email/SMS/In-App) attempt delivery
4. Failed rows enter exponential backoff: `min(2^attempts × 5, 3600) + jitter` seconds
5. After `max_attempts` (default 5), rows quarantine to DLQ

### Per-Recipient Deferred UUIDs
When scheduling deferred notifications for multiple recipients from a single campaign event, each recipient receives a deterministic UUID:
```python
event_id = uuid.uuid5(base_ev_id, f"{uid}:{decision_id}") if base_ev_id else uuid.uuid4()
```
Parent campaign ID preserved in `payload["source_event_id"]`.

---

## 6. Test Suite Results

### Backend (pytest)

| Suite | Tests | Result |
|-------|-------|--------|
| `test_notifications_events_outbox.py` | 20 | ✅ PASS |
| `test_notifications_e2e.py` | 32 | ✅ PASS |
| `test_personalization_20d.py` | 8 | ✅ PASS |
| `test_personalization_decision_pipeline.py` | 9 | ✅ PASS |
| `test_personalization_acceptance_8_users.py` | 5 | ✅ PASS |
| `test_personalization_api_and_automations.py` | 3 | ✅ PASS |
| **TOTAL** | **77** | ✅ **77 passed, 0 failed** |

Run time: 101.28s

### Frontend (Jest)

| Suite | Tests | Result |
|-------|-------|--------|
| `e2e_notification_pipeline.test.tsx` (Admin UI) | 13 | ✅ PASS |
| `personalization_ui.test.tsx` (Mobile UI) | 7 | ✅ PASS |
| **TOTAL** | **20** | ✅ **20 passed, 0 failed** |

### TypeScript

- `tsc --noEmit` on all 13 mobile UI owned files: **0 errors**
- `tsc --noEmit` on all admin UI owned files: **0 errors** (3 unrelated pre-existing errors in `AdminSkeletons.tsx`, `RBACContext.tsx`, `RBACGuard.tsx` — not in scope)

---

## 7. Admin UI Tabs

The `NotificationCenterScreen` integrates 8 personalization-focused admin tabs:

| Tab | Component | Functionality |
|-----|-----------|---------------|
| Overview | `OverviewTab` | Real-time delivery KPIs, funnel, fatigue distribution |
| Profile Explorer | `ProfileExplorerTab` | Search + inspect any user's 20D profile |
| Rules | `RulesTab` | CRUD notification rules with segment targeting |
| AI Lab | `AILabTab` | A/B test management, variant performance |
| Segment Builder | `SegmentBuilderTab` | Visual segment builder with criteria mapping |
| Fatigue Monitoring | `FatigueMonitoringTab` | Fleet-wide fatigue heatmap, suppression rates |
| Performance Analytics | `PerformanceAnalyticsTab` | Per-category CTR, conversion, revenue attribution |
| DLQ & Ops | `DLQOpsTab` | Dead letter queue review, replay, quarantine management |

---

## 8. Mobile UI Components

| Component/Screen | File | Features |
|-----------------|------|---------|
| `usePersonalizationStore` | `src/store/personalizationStore.ts` | Preferences sync, consent invariant, dimension correction |
| `useNotificationStore` | `src/store/notificationStore.ts` | Personalized fields, `/why` cache, interaction tracking |
| `WhySeeingThisModal` | `src/components/notifications/WhySeeingThisModal.tsx` | Explanation factors, adjust/opt-out actions |
| `NotificationBellDropdown` | `src/components/notifications/NotificationBellDropdown.tsx` | Badge, preview, deep-link, modal trigger |
| `TravelPreferencesScreen` | `src/screens/TravelPreferencesScreen.tsx` | Full bilingual (EN/BN) 20D preferences UI |
| `NotificationsInboxScreen` | `src/screens/NotificationsInboxScreen.tsx` | Category filters, relevance badges, feedback |

---

## 9. Privacy & Consent

- **FORBIDDEN_SENSITIVE_ATTRIBUTES** enforced: religion, ethnicity, health data never inferred
- `religious_travel_interest` requires **explicit opt-in** only
- `home_city` requires `location_consent` grant before update
- `personalization_enabled` and `marketing_opt_in` gated at every pipeline step
- GDPR `DELETE /profile/{user_id}` wipes all stored dimensions and signals
- No PII logged at any pipeline step

---

## 10. Deployment Notes

### Environment Variables Required
```env
DATABASE_URL=postgresql+asyncpg://user:pass@host/db
REDIS_URL=redis://host:6379/0
NOTIFICATION_ENCRYPTION_KEY=<32-byte-hex>
PUSH_FCM_SERVER_KEY=<firebase-key>
EMAIL_SMTP_HOST=<smtp-host>
SMS_GATEWAY_API_KEY=<gateway-key>
```

### Database Migrations
Run `alembic upgrade head` before first deployment. New tables from migration `20260622_hyper_personalized_notification_intelligence.sql`:
- `user_personalization_profiles`
- `user_profile_dimensions`
- `user_profile_change_logs`
- `user_behavioral_signals`
- `user_destination_interests`
- `user_notification_fatigue`
- `personalization_rule_configs`
- `personalization_segments`
- `contextual_travel_conditions`
- `personalization_decision_logs`
- `personalization_experiments`
- `personalization_experiment_assignments`
(Reuses existing notification tables from `20260621`: `notifications`, `notification_outbox`, `notification_deliveries`, `notification_devices`, `notification_user_preferences`, `notification_templates`, `notification_rules`, `notification_campaigns`, `notification_analytics`, `notification_dlq`).

### Worker Startup
The outbox worker auto-starts with the FastAPI application via `lifespan`. No separate process needed for development. For production, scale with:
```bash
uvicorn app.main:app --workers 4 --loop uvloop
```

---

## 11. Operational Notes & Design Safeguards

1. **Deterministic A/B Testing**: Assignments use SHA-256 hashing (`hashlib.sha256(f"{exp_id}:{user_id}".encode()).hexdigest()`) across buckets for 100% stable user assignment, with strict exclusion of critical transactional/security notifications.
2. **Delivery Adapters**: Core framework supports pluggable multi-channel delivery (Push, Email, SMS, In-App). Outbox processor uses zero-credential in-memory fallback for local dev/test; production uses live FCM/SMTP/Twilio API keys.
3. **Async SQLite Compatibility**: All SQLAlchemy models use cross-dialect types (`JSON`, SQLite-compatible foreign keys) ensuring 100% unit and integration test compatibility in CI/CD without Postgres server requirements.

---

*Report generated by ShopnoJatra Notification Intelligence Swarm — 2026-11-26*
