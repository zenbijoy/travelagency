# Notification Platform Codebase Audit

**Original Audit Date**: 2026-11-24  
**Updated Status Date**: 2026-11-27  
**Author**: Notification Architecture & Engineering Team  
**Scope**: Complete inventory of legacy notification components, architectural deficiencies identified pre-platform, modernization remediation status across database migrations, backend pipelines, and client UI.

---

## 0. Remediation Status Summary (As of 2026-11-27)

| Deficiency / Gap (Section 3) | Original State (2026-11-24) | Current State (2026-11-27) | Primary Evidence |
|---|---|---|---|
| **3.1 Dual-Write Anti-Pattern** | Direct Celery `.delay()` calls in services without outbox persistence | Transactional `OutboxPublisher.publish` / `publish_idempotent` wired across core services (`booking_saga.py`, `booking_service.py`, `payment_service.py`, `ticket_service.py`, `kyc_service.py`, `ledger_service.py`, `hotel_pms_service.py`, `local_commerce_service.py`, `marketplace_service.py`, `ride_service.py`) and tasks (`kyc_tasks.py`, `ledger_tasks.py`, `price_alert_tasks.py`, `travel_automation_tasks.py`). | `backend/app/notifications/outbox/publisher.py` |
| **3.2 Schema Drift (`notifications` & admin inserts)** | Missing `recipient_id`, `priority`, `channels`, `data`, `expires_at`, `updated_at`; missing `notification_outbox` / `notification_dlq` | Resolved in `20260621_notification_platform_event_driven_architecture.sql` (verified on PostgreSQL 18.6 across ENUM/TEXT/idempotency runs) and `20260622_hyper_personalized_notification_intelligence.sql`. | `supabase/migrations/20260621_*.sql`, `20260622_*.sql` |
| **3.3 Missing SQLAlchemy Declarative Models** | Zero notification/personalization ORM models | 10 core notification models (`backend/app/models/notification.py`) + 12 personalization models (`backend/app/models/personalization.py`) implemented using SQLite+PostgreSQL dialect-hybrid types (`JSON().with_variant(ARRAY(Text), "postgresql")` / `JSONB`). | `backend/app/models/__init__.py` |
| **3.4 Uncoordinated Delivery Channels** | Ad-hoc `smtplib`, raw SMS HTTP, push stub | Unified `BaseDeliveryAdapter` implemented across `PushDeliveryAdapter` (Expo/FCM/mock), `InAppDeliveryAdapter` (`notifications` table + WebSockets), `EmailDeliveryAdapter` (`html.escape` HTML + SMTP/mock), and `SmsDeliveryAdapter` (BD `+880` E.164 + HTTP/mock). | `backend/app/notifications/delivery/*.py` |
| **3.5 No Rules Engine / Quiet Hours Enforcement** | Preferences existed in DB without runtime evaluation | Deterministic `RulesEngine` (`backend/app/notifications/rules/engine.py`) + 20D `DecisionPipeline` (`backend/app/notifications/personalization/decision_pipeline.py`) + non-gating AI layer (`backend/app/notifications/ai/service.py`). | `backend/app/notifications/{rules,personalization,ai}/` |
| **RBAC & RLS Hardening** | Legacy permissive policies & parameter/ENUM bugs | `20260622000000_admin_rbac_and_rls_hardening.sql` preserves `is_admin(check_user_id DEFAULT auth.uid())`, fixes `role::text = ANY(roles)`, blocks non-admin UUID enumeration, eliminates `multiple_permissive_policies`, and applies `(SELECT auth.uid())` + `FORCE ROW LEVEL SECURITY`. | `supabase/migrations/20260622000000_*.sql` |
| **Open / Remaining Items** | Legacy coexistence & test/credential gaps | Legacy `public.user_device_tokens` coexists alongside `public.notification_devices`; Celery legacy tasks (`notification_tasks.py`, `price_alert_tasks.py:send_push_notification_task`) coexist alongside outbox paths; live SMTP/SMS/Expo/Gemini credentials default to dev mock mode when unset. Final backend/frontend test pass pending peer & verifier sign-off. | `backend/app/core/config.py` |

---

## 1. Original Baseline Executive Summary (2026-11-24)

ShopnoJatra's existing notification handling consists of fragmented, point-to-point delivery mechanisms spread across Celery background tasks, direct SMTP/SMS gateway calls, WebSocket channels, and disparate database tables created across multiple migration epochs. 

While core business processes (booking, payments, price alerts, KYC) trigger customer communications, the architecture currently exhibits **critical dual-write vulnerabilities**, **schema drift** between frontend services and database migrations, **lack of outbox persistence**, and **uncoordinated multi-channel dispatch**.

This audit provides an exhaustive accounting of all existing components, identifies technical debt and failure points, and outlines the migration strategy to an enterprise-grade, event-driven notification intelligence platform.

---

## 2. Existing Codebase Inventory

### 2.1 Backend Tasks & Delivery Sinks

| Component / Task | File Location | Mechanism | Trigger / Invocation Point | Current Behavior / Limitations |
|---|---|---|---|---|
| `send_email_sync` | `backend/app/tasks/notification_tasks.py:18-41` | Python `smtplib` / MIME | Called inside Celery tasks | Uses live SMTP if configured; falls back to `[DEV MOCK]` log when `SMTP_PASSWORD` is unset or `"mock-smtp-password"`. No retry tracking or outbox persistence. |
| `send_sms_sync` | `backend/app/tasks/notification_tasks.py:43-62` | HTTP POST via `requests` | Called inside Celery tasks | Dispatches to `SMS_GATEWAY_URL`. Falls back to `[DEV MOCK]` log when `SMS_GATEWAY_API_KEY` is empty or `"mock-sms-gateway-key"`. No delivery status feedback. |
| `send_booking_confirmation_email_task` | `backend/app/tasks/notification_tasks.py:64-91` | Celery Task (`@celery_app.task`) | `booking_service.py:284`, `payment_service.py:308` | Asynchronously generates HTML email body and calls `send_email_sync`. Enqueued directly via `.delay()` inside service functions. |
| `send_sms_otp_task` | `backend/app/tasks/notification_tasks.py:93-110` | Celery Task (`@celery_app.task`) | Auth & Verification services | Dispatches 6-digit OTP code to passenger/user mobile number via `send_sms_sync`. |
| `send_push_notification_task` | `backend/app/tasks/price_alert_tasks.py:137-150` | Celery Task (`@celery_app.task`) | `evaluate_active_price_alerts_task` | Currently a stub returning `logger.info(f"[PUSH NOTIFICATION] ...")` and `True`. Does not interface with Expo Push or FCM SDK. |
| `evaluate_active_price_alerts_task` | `backend/app/tasks/price_alert_tasks.py:270-320` | Celery Beat Periodic Task | Scheduled flight fare scans | Evaluates price snapshots against active alert thresholds, triggering `send_push_notification_task.delay()`. |
| `check_expiring_kyc_documents_task` | `backend/app/tasks/kyc_tasks.py:280-310` | Celery Beat Periodic Task | Daily KYC verification check | Scans agency verification documents expiring within 30 days and sends alerts. |
| `generate_travel_ticket_task` | `backend/app/tasks/ticket_tasks.py` | Celery Task (`@celery_app.task`) | `booking_service.py:280`, `payment_service.py:306` | Generates cryptographically signed ticket vouchers and triggers email attachment delivery. |
| `DistributedConnectionManager` | `backend/app/websockets/connection_manager.py:18-100` | FastAPI WebSockets + Redis Pub/Sub | Real-time browser/mobile channels | Maintains active socket connections grouped by channel (e.g. `booking:{id}`, `flight_tracker:{id}`). Gracefully falls back to in-memory dispatch if Redis is absent. |

---

### 2.2 Frontend Notification Components, Stores & Services

| Component / Service | File Location | Responsibility | Schema / Interaction Details |
|---|---|---|---|
| `notificationStore.ts` | `src/store/notificationStore.ts` | Zustand client state store | Maintains client notification lists, unread badge counters, category filtering (`all`, `booking`, `flight`, `promo`, `security`), and optimistic read toggles. |
| `notificationService.ts` | `src/services/notificationService.ts` | Supabase data service | Queries `public.notifications`. Discrepancy: queries `.eq("recipient_id", userId)` and uses fields `read`, `priority`, `channels`, which do not match the database migration schema. |
| `fcmNotificationService.ts` | `src/services/fcmNotificationService.ts` | Device push token management | Manages Expo notifications and FCM push tokens; registers device tokens into `public.user_device_tokens`. |
| `adminService.ts` | `src/services/adminService.ts:2160-2220` | Administrative actions | Provides `sendBroadcast()`, `getNotificationTemplates()`, and campaign operations. Discrepancy: inserts into `notifications` omitting mandatory `user_id`. |
| `AdminNotificationsScreen.tsx` | `src/screens/admin/AdminNotificationsScreen.tsx` | Legacy admin UI | Basic broadcast composer and template viewer; lacks DLQ management, rule building, provider status, and multi-channel analytics. |

---

### 2.3 Original Pre-Migration Database Audit (Historical Snapshot prior to `20260621`)

Inspection of the 38 baseline migration scripts prior to `20260621` revealed the following state across notification-related tables (remediated in `20260621_notification_platform_event_driven_architecture.sql`, `20260622000000_admin_rbac_and_rls_hardening.sql`, and `20260622_hyper_personalized_notification_intelligence.sql` — see Section 0):

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               DATABASE MIGRATION AUDIT                                 │
├────────────────────────────────┬───────────────────────────┬───────────────────────────┤
│ Table Name                     │ Source Migration          │ Schema Status / Columns   │
├────────────────────────────────┼───────────────────────────┼───────────────────────────┤
│ public.notifications           │ 20260608_comprehensive_   │ id (UUID), user_id (UUID),│
│                                │ travel_platform_schema.sql│ title (TEXT), message,    │
│                                │                           │ type, is_read, read_at,   │
│                                │                           │ created_at. RLS secured   │
│                                │                           │ in 20260618.              │
├────────────────────────────────┼───────────────────────────┼───────────────────────────┤
│ public.user_device_tokens      │ 20260608h_create_user_    │ id, user_id, fcm_token,   │
│                                │ device_tokens.sql         │ platform, created_at,     │
│                                │                           │ updated_at. RLS enabled.  │
├────────────────────────────────┼───────────────────────────┼───────────────────────────┤
│ public.user_device_sessions    │ 20260614_create_user_     │ id, user_id, device_id,   │
│                                │ device_sessions.sql       │ platform, os_version,     │
│                                │                           │ ip_address, is_revoked.   │
├────────────────────────────────┼───────────────────────────┼───────────────────────────┤
│ public.booking_events          │ 20260615_booking_         │ id, booking_id, type,     │
│                                │ events.sql                │ actor_id, payload,        │
│                                │                           │ created_at. CDC enabled.  │
├────────────────────────────────┼───────────────────────────┼───────────────────────────┤
│ public.notification_preferences│ 20260615_add_missing_     │ id, user_id, email/push/  │
│ (Legacy)                       │ system_tables.sql         │ sms booleans. No quiet    │
│                                │                           │ hours or frequency caps.  │
├────────────────────────────────┼───────────────────────────┼───────────────────────────┤
│ public.travel_notification_    │ 20260616_travel_          │ user_id, disruption caps, │
│ preferences                    │ intelligence.sql          │ quiet_hours_enabled,      │
│                                │                           │ quiet_hours_start/end.    │
├────────────────────────────────┼───────────────────────────┼───────────────────────────┤
│ public.notification_rules      │ 20260615_add_missing_     │ id, name, trigger_event,  │
│ (Legacy)                       │ system_tables.sql         │ channels, conditions.     │
├────────────────────────────────┼───────────────────────────┼───────────────────────────┤
│ public.notification_templates  │ 20260605_create_admin_    │ id, notification_type,    │
│ (Legacy)                       │ panel.sql                 │ template_content, channel.│
├────────────────────────────────┼───────────────────────────┼───────────────────────────┤
│ public.notification_delivery_  │ 20260616_travel_          │ Specific to travel        │
│ logs                           │ intelligence.sql          │ disruptions; lacks general│
│                                │                           │ multi-channel tracking.   │
├────────────────────────────────┼───────────────────────────┼───────────────────────────┤
│ notification_outbox            │ MISSING                   │ Table does not exist in   │
│                                │                           │ any migration.            │
├────────────────────────────────┼───────────────────────────┼───────────────────────────┤
│ notification_dlq               │ MISSING                   │ Table does not exist in   │
│                                │                           │ any migration.            │
└────────────────────────────────┴───────────────────────────┴───────────────────────────┘
```

---

## 3. Critical Deficiencies & Architectural Vulnerabilities

### 3.1 Dual-Write Anti-Pattern (At-Most-Once Delivery Failure)
In `backend/app/services/booking_service.py` (lines 274-286) and `backend/app/services/payment_service.py` (lines 298-310), tasks are dispatched using `celery_task.delay()` inside service functions.
- **Problem**: If the application process crashes or the database transaction fails to commit *after* the `.delay()` call, a notification is dispatched for a phantom transaction. Conversely, if Redis is unreachable when `.delay()` is invoked, the database commit succeeds but the customer never receives confirmation.
- **Remedy**: Must adopt the **Transactional Outbox Pattern**, persisting domain events into `public.notification_outbox` inside the same atomic database transaction as the domain state change.

### 3.2 Schema Drift Between Frontend and Backend
- `src/services/notificationService.ts` expects columns `recipient_id`, `read`, `priority`, `channels`, and `expires_at`.
- `public.notifications` table only possesses `id`, `user_id`, `title`, `message`, `type`, `is_read`, `read_at`, `created_at`.
- Queries executing `.eq("recipient_id", userId)` fail or return empty result sets in live environments.
- `src/services/adminService.ts:sendBroadcast` attempts to insert records with missing `user_id`, violating NOT NULL constraints.

### 3.3 Missing SQLAlchemy Declarative Models
None of the notification tables (`notifications`, `user_device_tokens`, `notification_templates`, `notification_rules`, `notification_preferences`) possess corresponding SQLAlchemy models in `backend/app/models/`. This prevents backend services from querying or managing notifications with type safety and ORM relationships.

### 3.4 Uncoordinated Multi-Channel Delivery & Provider Lock-in
- Email dispatches rely directly on `smtplib`.
- SMS dispatches rely on raw HTTP POST calls to a single gateway.
- Push notifications are currently stubbed in Python (`price_alert_tasks.py`).
- There is no unified adapter contract (`BaseDeliveryAdapter`), no automated fallback, and no centralized delivery latency/success logging.

### 3.5 Absence of Deterministic Rules & Quiet Hours Enforcement
- While `travel_notification_preferences` has `quiet_hours_start` and `quiet_hours_end`, no backend rules engine actually evaluates these constraints before dispatching emails or SMS.
- Non-critical alerts (marketing, promotional price drops) risk waking travelers during quiet hours (e.g. 23:00 to 07:00).
- High-priority transactional events (SOS panic, OTP, booking confirmation) lack a formal bypass mechanism.

---

## 4. Modernization Strategy & Migration Blueprint

1. **Schema Harmonization**: Deploy `supabase/migrations/20260621_notification_platform_event_driven_architecture.sql` to establish dedicated, production-ready tables:
   - `notification_outbox` (Transactional event queue with `status`, `priority`, `attempts`, `payload`)
   - `notification_deliveries` (Multi-channel delivery log with provider latency & status)
   - `notification_devices` (Cross-platform push tokens with active state tracking)
   - `notification_user_preferences` (Channel toggles, quiet hours, category subscriptions)
   - `notification_templates` (Multi-lingual bilingual templates with versioning)
   - `notification_rules` (Deterministic rule evaluation with conditions JSONB)
   - `notification_campaigns` (Scheduled & broadcast marketing campaigns)
   - `notification_analytics` (Aggregated daily delivery & interaction metrics)
   - `notification_dlq` (Dead-letter quarantine with manual & automated replay hooks)
2. **Unified SQLAlchemy Models**: Define models in `backend/app/models/notification.py` using SQLite-compatible `JSON` column types and export them in `backend/app/models/__init__.py`.
3. **Transactional Outbox Publisher**: Implement `OutboxPublisher` to atomically stage domain events during booking, payment, and KYC transactions.
4. **Worker Queue & Pluggable Delivery Adapters**: Build an asynchronous/synchronous polling worker with row-level locking (`SKIP LOCKED`), deduplication, exponential backoff, and mock/live adapters for Push, In-App, Email, and SMS.
5. **Deterministic Rules Engine & Non-Gating AI**: Evaluate audience, quiet hours, and frequency capping deterministically, with optional AI summarization and timing optimization operating as a non-gating enrichment layer.
6. **Command Center & Client Inbox**: Integrate high-density admin controls and real-time client notification dropdowns and inbox screens.
