# Domain Event Catalog

**Platform**: ShopnoJatra Event-Driven Notification Intelligence Platform  
**Version**: 1.1.0  
**Last Updated**: 2026-11-27  
**Specification**: Typed Domain Events (`EVENT_REGISTRY`) + Extended Service & Automation Runtime Events

---

## 1. Domain Event Architecture & Standards

All domain events emitted within the ShopnoJatra ecosystem adhere to an immutable JSON-serializable envelope structure compliant with the CloudEvents 1.0 specification:

```typescript
interface DomainEventEnvelope<T = Record<string, any>> {
  event_id: string;              // UUIDv4 unique identifier
  event_type: string;            // Dot-delimited domain event name (e.g. "booking.confirmed")
  aggregate_type: string;        // Aggregate root name (e.g. "booking", "user", "payment")
  aggregate_id: string;          // Primary key of the aggregate
  actor_id?: string | null;      // UUID of the triggering user/admin/system
  timestamp: string;             // ISO-8601 UTC timestamp
  priority: number;              // 1 (lowest) to 10 (critical emergency)
  payload: T;                    // Typed event-specific payload
  headers: {
    correlation_id?: string;     // Distributed tracing correlation ID
    causation_id?: string;       // Preceding event ID in saga/flow
    schema_version: string;      // Event schema version (e.g. "1.0")
    source_service: string;      // Originating microservice / module
  };
}
```

### Priority Tiers & Quiet Hours Rules

| Priority | Level | Score | Description & Quiet Hours Handling |
|---|---|---|---|
| **P0** | **Critical** | `9 - 10` | Mission-critical emergencies, OTP security codes, payment confirmations, and SOS safety alerts. **Strictly bypasses quiet hours and frequency caps.** Delivered immediately across all designated high-urgency channels. |
| **P1** | **High** | `7 - 8` | Time-sensitive operational alerts (flight gate changes, booking cancellations, KYC rejection, immediate schedule disruptions). Dispatched immediately during daytime; queued for delivery at quiet-hours end (`07:00`) unless traveler requested emergency bypass. |
| **P2** | **Normal** | `4 - 6` | Standard transactional updates, ticket issuance, price alert matches, review requests, and agency settlement reports. **Suppressed or rescheduled during quiet hours (`22:00 - 07:00`).** |
| **P3** | **Low** | `1 - 3` | Promotional campaigns, newsletter digests, personalized travel recommendations, and loyalty milestone announcements. Subject to strict frequency capping (max 3/day) and quiet-hours postponement. |

---

## 2. Event Catalog by Category

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            EVENT CATEGORY OVERVIEW                           │
├────┬─────────────────────────────┬──────────┬────────────────────────────────┤
│ #  │ Domain Category             │ Events   │ Key Aggregates                 │
├────┼─────────────────────────────┼──────────┼────────────────────────────────┤
│ 1  │ User & Account              │ 4 Events │ user, profile, loyalty         │
│ 2  │ Security & Defense          │ 4 Events │ session, device, security_gate │
│ 3  │ Booking & Reservation       │ 6 Events │ booking, payment, ticket       │
│ 4  │ Travel Products & Inventory │ 4 Events │ flight, hotel, price_alert     │
│ 5  │ Agency & B2B Operations     │ 4 Events │ agency, kyc, payout            │
│ 6  │ Hotel Partner & Hospitality │ 4 Events │ hotel, room, review            │
│ 7  │ Marketplace & Local Guides  │ 4 Events │ guide, trip_session, emergency │
│ 8  │ System Telemetry & Health   │ 4 Events │ worker, dlq, provider          │
├────┴─────────────────────────────┴──────────┴────────────────────────────────┤
│ TOTAL: 34 Typed Schemas in EVENT_REGISTRY (+ 14 Runtime DomainEvent Types)  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### Category 1: User & Account Events

#### 1.1 `user.registered`
- **Aggregate**: `user` | **Aggregate ID**: `user_id`
- **Priority**: Normal (`5`) | **Default Channels**: `["email", "in_app"]`
- **Quiet Hours**: Respects quiet hours (delivers at 07:00 if registered overnight)
- **Payload Schema**:
  ```json
  {
    "user_id": "UUID",
    "email": "string (email)",
    "full_name": "string",
    "signup_method": "string (email | google | apple | phone)",
    "locale": "string (en | bn)",
    "verification_token": "string (optional)"
  }
  ```

#### 1.2 `user.profile_updated`
- **Aggregate**: `profile` | **Aggregate ID**: `user_id`
- **Priority**: Low (`3`) | **Default Channels**: `["in_app"]`
- **Quiet Hours**: Suppressed during quiet hours
- **Payload Schema**:
  ```json
  {
    "user_id": "UUID",
    "updated_fields": ["string"],
    "ip_address": "string",
    "timestamp": "string (ISO8601)"
  }
  ```

#### 1.3 `user.loyalty.tier_upgraded`
- **Aggregate**: `loyalty` | **Aggregate ID**: `account_id`
- **Priority**: Normal (`6`) | **Default Channels**: `["in_app", "push", "email"]`
- **Quiet Hours**: Rescheduled to quiet hours end
- **Payload Schema**:
  ```json
  {
    "user_id": "UUID",
    "account_id": "UUID",
    "previous_tier": "string (Silver)",
    "new_tier": "string (Gold | Platinum)",
    "points_balance": 14500,
    "tier_benefits": ["free_lounge_access", "priority_booking"]
  }
  ```

#### 1.4 `user.loyalty.points_awarded`
- **Aggregate**: `loyalty` | **Aggregate ID**: `transaction_id`
- **Priority**: Low (`3`) | **Default Channels**: `["in_app"]`
- **Quiet Hours**: Suppressed during quiet hours
- **Payload Schema**:
  ```json
  {
    "user_id": "UUID",
    "points": 500,
    "reason": "string (booking_completion | referral | promo)",
    "booking_id": "UUID (optional)",
    "new_balance": 5250
  }
  ```

---

### Category 2: Security & Defense Events

#### 2.1 `security.auth.otp_requested`
- **Aggregate**: `security` | **Aggregate ID**: `user_id`
- **Priority**: Critical (`10`) | **Default Channels**: `["sms"]`
- **Quiet Hours**: **Strict Bypass** (Immediate dispatch)
- **Payload Schema**:
  ```json
  {
    "user_id": "UUID",
    "phone": "string (E.164)",
    "otp_code": "string (6 digits)",
    "expires_at": "string (ISO8601, 5 min TTL)",
    "purpose": "string (login | password_reset | payout_authorization)"
  }
  ```

#### 2.2 `security.auth.new_device_login`
- **Aggregate**: `session` | **Aggregate ID**: `session_id`
- **Priority**: Critical (`9`) | **Default Channels**: `["email", "push", "in_app"]`
- **Quiet Hours**: **Strict Bypass** (Security risk notification)
- **Payload Schema**:
  ```json
  {
    "user_id": "UUID",
    "device_name": "string (e.g. Chrome 124 on macOS)",
    "ip_address": "string",
    "location": "string (e.g. Dhaka, Bangladesh)",
    "session_id": "UUID",
    "is_suspicious": false
  }
  ```

#### 2.3 `security.defense.bot_detected`
- **Aggregate**: `security_gate` | **Aggregate ID**: `client_fingerprint`
- **Priority**: High (`8`) | **Default Channels**: `["in_app", "webhook"]`
- **Quiet Hours**: **Strict Bypass** (Admin/System security alert)
- **Payload Schema**:
  ```json
  {
    "ip_address": "string",
    "user_agent": "string",
    "triggered_rule": "string (high_velocity_scraping | credential_stuffing)",
    "action_taken": "string (rate_limited | blocked | captcha_challenged)",
    "request_uri": "string"
  }
  ```

#### 2.4 `security.auth.password_changed`
- **Aggregate**: `user` | **Aggregate ID**: `user_id`
- **Priority**: Critical (`9`) | **Default Channels**: `["email", "push"]`
- **Quiet Hours**: **Strict Bypass**
- **Payload Schema**:
  ```json
  {
    "user_id": "UUID",
    "changed_at": "string (ISO8601)",
    "ip_address": "string",
    "revoked_sessions_count": 3
  }
  ```

---

### Category 3: Booking & Reservation Events

#### 3.1 `booking.created`
- **Aggregate**: `booking` | **Aggregate ID**: `booking_id`
- **Priority**: Normal (`6`) | **Default Channels**: `["in_app"]`
- **Quiet Hours**: Rescheduled to quiet hours end
- **Payload Schema**:
  ```json
  {
    "booking_id": "UUID",
    "booking_reference": "string (SJ-74921-2026)",
    "user_id": "UUID",
    "product_type": "string (hotel | flight | train | tour)",
    "total_price": 12500.00,
    "currency": "BDT",
    "destination": "string (Cox's Bazar)"
  }
  ```

#### 3.2 `booking.confirmed`
- **Aggregate**: `booking` | **Aggregate ID**: `booking_id`
- **Priority**: Critical (`9`) | **Default Channels**: `["in_app", "push", "email", "sms"]`
- **Quiet Hours**: **Strict Bypass** (Customer expects instant confirmation)
- **Payload Schema**:
  ```json
  {
    "booking_id": "UUID",
    "booking_reference": "string",
    "user_id": "UUID",
    "customer_name": "string",
    "customer_email": "string",
    "customer_phone": "string",
    "product_type": "string",
    "total_paid": 12500.00,
    "currency": "BDT",
    "start_date": "string (YYYY-MM-DD)",
    "ticket_ids": ["UUID"]
  }
  ```

#### 3.3 `booking.payment_succeeded`
- **Aggregate**: `payment` | **Aggregate ID**: `payment_id`
- **Priority**: High (`8`) | **Default Channels**: `["in_app", "email"]`
- **Quiet Hours**: **Strict Bypass** (Receipt generation)
- **Payload Schema**:
  ```json
  {
    "payment_id": "UUID",
    "booking_id": "UUID",
    "user_id": "UUID",
    "amount": 12500.00,
    "gateway": "string (bkash | nagad | sslcommerz | stripe)",
    "gateway_transaction_id": "string",
    "invoice_url": "string"
  }
  ```

#### 3.4 `booking.payment_failed`
- **Aggregate**: `payment` | **Aggregate ID**: `payment_id`
- **Priority**: High (`8`) | **Default Channels**: `["in_app", "push", "sms"]`
- **Quiet Hours**: Rescheduled unless within 30 min of reservation hold expiry
- **Payload Schema**:
  ```json
  {
    "payment_id": "UUID",
    "booking_id": "UUID",
    "user_id": "UUID",
    "amount": 12500.00,
    "failure_reason": "string (insufficient_balance | timeout | gateway_declined)",
    "retry_url": "string"
  }
  ```

#### 3.5 `booking.cancelled`
- **Aggregate**: `booking` | **Aggregate ID**: `booking_id`
- **Priority**: High (`7`) | **Default Channels**: `["in_app", "push", "email"]`
- **Quiet Hours**: Suppressed overnight unless travel is within 24 hours
- **Payload Schema**:
  ```json
  {
    "booking_id": "UUID",
    "booking_reference": "string",
    "user_id": "UUID",
    "cancellation_reason": "string",
    "refund_amount": 11000.00,
    "cancellation_fee": 1500.00
  }
  ```

#### 3.6 `booking.ticket_issued`
- **Aggregate**: `ticket` | **Aggregate ID**: `ticket_id`
- **Priority**: High (`8`) | **Default Channels**: `["in_app", "email"]`
- **Quiet Hours**: Dispatched immediately with digital QR boarding voucher
- **Payload Schema**:
  ```json
  {
    "ticket_id": "UUID",
    "booking_id": "UUID",
    "user_id": "UUID",
    "passenger_name": "string",
    "transport_mode": "string (flight | train | boat)",
    "departure_time": "string (ISO8601)",
    "qr_signature": "string (Ed25519 hash)"
  }
  ```

---

### Category 4: Travel Products & Inventory Events

#### 4.1 `flight.price_alert.triggered`
- **Aggregate**: `price_alert` | **Aggregate ID**: `alert_id`
- **Priority**: Normal (`6`) | **Default Channels**: `["push", "in_app"]`
- **Quiet Hours**: Postponed to `07:00` AM
- **Payload Schema**:
  ```json
  {
    "alert_id": "UUID",
    "user_id": "UUID",
    "origin": "DAC",
    "destination": "CXB",
    "target_price": 4500.00,
    "current_price": 3950.00,
    "price_drop_pct": 12.2,
    "airline": "Biman Bangladesh",
    "booking_deeplink": "string"
  }
  ```

#### 4.2 `flight.schedule_changed`
- **Aggregate**: `flight` | **Aggregate ID**: `flight_id`
- **Priority**: Critical (`9`) | **Default Channels**: `["push", "sms", "in_app"]`
- **Quiet Hours**: **Strict Bypass** (Immediate travel schedule disruption)
- **Payload Schema**:
  ```json
  {
    "flight_id": "UUID",
    "flight_number": "BG-433",
    "affected_booking_ids": ["UUID"],
    "original_departure": "string (ISO8601)",
    "revised_departure": "string (ISO8601)",
    "delay_minutes": 110,
    "gate": "string (optional)"
  }
  ```

#### 4.3 `hotel.booking.confirmed`
- **Aggregate**: `hotel_booking` | **Aggregate ID**: `booking_id`
- **Priority**: High (`8`) | **Default Channels**: `["in_app", "email"]`
- **Quiet Hours**: Bypassed if check-in is today
- **Payload Schema**:
  ```json
  {
    "booking_id": "UUID",
    "hotel_id": "UUID",
    "hotel_name": "string (Sayeman Beach Resort)",
    "room_type": "string (Deluxe Ocean View)",
    "check_in": "string (YYYY-MM-DD)",
    "check_out": "string (YYYY-MM-DD)",
    "guests_count": 2
  }
  ```

#### 4.4 `travel.disruption.detected`
- **Aggregate**: `disruption` | **Aggregate ID**: `disruption_id`
- **Priority**: Critical (`9`) | **Default Channels**: `["push", "sms", "in_app"]`
- **Quiet Hours**: **Strict Bypass** (Severe weather, cyclone, or strike alerts)
- **Payload Schema**:
  ```json
  {
    "disruption_id": "UUID",
    "disruption_type": "string (weather_cyclone | road_blockade | flight_cancellation)",
    "region": "string (Chittagong Division)",
    "severity": "string (warning | critical | catastrophic)",
    "suggested_actions": ["reroute", "free_cancellation"]
  }
  ```

---

### Category 5: Agency & B2B Operations Events

#### 5.1 `agency.kyc.submitted`
- **Aggregate**: `agency` | **Aggregate ID**: `agency_id`
- **Priority**: Normal (`5`) | **Default Channels**: `["in_app", "email"]`
- **Quiet Hours**: Suppressed overnight
- **Payload Schema**:
  ```json
  {
    "agency_id": "UUID",
    "agency_name": "string",
    "trade_license_number": "string",
    "submitted_by": "UUID",
    "document_urls": ["string"]
  }
  ```

#### 5.2 `agency.kyc.approved`
- **Aggregate**: `agency` | **Aggregate ID**: `agency_id`
- **Priority**: High (`7`) | **Default Channels**: `["in_app", "email", "sms"]`
- **Quiet Hours**: Rescheduled to `07:00`
- **Payload Schema**:
  ```json
  {
    "agency_id": "UUID",
    "agency_name": "string",
    "reviewed_by": "UUID",
    "tier": "string (Gold)",
    "credit_limit": 500000.00
  }
  ```

#### 5.3 `agency.kyc.expiring_warning`
- **Aggregate**: `agency` | **Aggregate ID**: `agency_id`
- **Priority**: Normal (`6`) | **Default Channels**: `["in_app", "email"]`
- **Quiet Hours**: Postponed to daytime
- **Payload Schema**:
  ```json
  {
    "agency_id": "UUID",
    "agency_name": "string",
    "document_type": "string (Trade License)",
    "days_until_expiration": 15,
    "renewal_portal_url": "string"
  }
  ```

#### 5.4 `agency.payout.batch_processed`
- **Aggregate**: `payout_batch` | **Aggregate ID**: `batch_id`
- **Priority**: High (`7`) | **Default Channels**: `["in_app", "email"]`
- **Quiet Hours**: Rescheduled to daytime
- **Payload Schema**:
  ```json
  {
    "batch_id": "UUID",
    "agency_id": "UUID",
    "total_disbursed": 85000.00,
    "currency": "BDT",
    "disbursement_method": "string (BEFTN | bKash_merchant)",
    "bank_reference": "string"
  }
  ```

---

### Category 6: Hotel Partner & Hospitality Events

#### 6.1 `hotel.room.inventory_low`
- **Aggregate**: `hotel_room` | **Aggregate ID**: `room_id`
- **Priority**: Normal (`5`) | **Default Channels**: `["in_app", "email"]`
- **Quiet Hours**: Suppressed overnight
- **Payload Schema**:
  ```json
  {
    "hotel_id": "UUID",
    "room_id": "UUID",
    "room_type": "string (Super Deluxe)",
    "available_count": 2,
    "target_date": "string (YYYY-MM-DD)"
  }
  ```

#### 6.2 `hotel.guest.check_in_reminder`
- **Aggregate**: `booking` | **Aggregate ID**: `booking_id`
- **Priority**: Normal (`5`) | **Default Channels**: `["push", "in_app"]`
- **Quiet Hours**: Dispatched at 09:00 on day of check-in
- **Payload Schema**:
  ```json
  {
    "booking_id": "UUID",
    "user_id": "UUID",
    "hotel_name": "string",
    "check_in_time": "14:00",
    "address": "string",
    "directions_deeplink": "string"
  }
  ```

#### 6.3 `hotel.review.submitted`
- **Aggregate**: `hotel_review` | **Aggregate ID**: `review_id`
- **Priority**: Low (`4`) | **Default Channels**: `["in_app"]`
- **Quiet Hours**: Suppressed overnight
- **Payload Schema**:
  ```json
  {
    "review_id": "UUID",
    "hotel_id": "UUID",
    "rating": 4.8,
    "author_name": "string",
    "comment_excerpt": "string"
  }
  ```

#### 6.4 `hotel.staff.assigned`
- **Aggregate**: `hotel` | **Aggregate ID**: `hotel_id`
- **Priority**: Normal (`5`) | **Default Channels**: `["in_app", "email"]`
- **Quiet Hours**: Suppressed overnight
- **Payload Schema**:
  ```json
  {
    "hotel_id": "UUID",
    "staff_id": "UUID",
    "role": "string (front_desk | manager)",
    "granted_by": "UUID"
  }
  ```

---

### Category 7: Marketplace & Local Guide Events

#### 7.1 `marketplace.trip.sos_triggered`
- **Aggregate**: `trip_session` | **Aggregate ID**: `session_id`
- **Priority**: Critical (`10`) | **Default Channels**: `["push", "sms", "in_app", "webhook"]`
- **Quiet Hours**: **Strict Bypass** (Emergency panic response)
- **Payload Schema**:
  ```json
  {
    "session_id": "UUID",
    "user_id": "UUID",
    "guide_id": "UUID",
    "location": {
      "latitude": 21.4272,
      "longitude": 91.9701,
      "accuracy_meters": 5.0
    },
    "battery_level": 74,
    "battery_charging": false,
    "timestamp": "string (ISO8601)",
    "sos_message": "string"
  }
  ```

#### 7.2 `marketplace.guide.quote_requested`
- **Aggregate**: `marketplace_booking` | **Aggregate ID**: `booking_id`
- **Priority**: High (`7`) | **Default Channels**: `["push", "in_app", "sms"]`
- **Quiet Hours**: Rescheduled to `07:00`
- **Payload Schema**:
  ```json
  {
    "booking_id": "UUID",
    "guide_id": "UUID",
    "traveler_name": "string",
    "destination": "Sundarbans Delta Tour",
    "requested_dates": ["2026-12-01", "2026-12-03"],
    "group_size": 4
  }
  ```

#### 7.3 `marketplace.guide.booked`
- **Aggregate**: `marketplace_booking` | **Aggregate ID**: `booking_id`
- **Priority**: High (`8`) | **Default Channels**: `["in_app", "push", "sms"]`
- **Quiet Hours**: Bypassed if starting within 12 hours
- **Payload Schema**:
  ```json
  {
    "booking_id": "UUID",
    "guide_id": "UUID",
    "traveler_id": "UUID",
    "service_title": "string (Certified Tanguar Haor Boatman)",
    "total_fee": 6000.00,
    "meeting_point": "Sunamganj Ghat"
  }
  ```

#### 7.4 `marketplace.itinerary.cloned`
- **Aggregate**: `itinerary` | **Aggregate ID**: `itinerary_id`
- **Priority**: Low (`3`) | **Default Channels**: `["in_app"]`
- **Quiet Hours**: Suppressed overnight
- **Payload Schema**:
  ```json
  {
    "original_itinerary_id": "UUID",
    "creator_user_id": "UUID",
    "cloner_user_id": "UUID",
    "itinerary_title": "string (Sylhet Tea Gardens & Waterfalls)"
  }
  ```

---

### Category 8: System Telemetry & Operational Health Events

#### 8.1 `system.worker.health_heartbeat`
- **Aggregate**: `system_worker` | **Aggregate ID**: `worker_node_id`
- **Priority**: Low (`2`) | **Default Channels**: `["webhook"]`
- **Quiet Hours**: Suppressed (Telemetry only)
- **Payload Schema**:
  ```json
  {
    "node_id": "worker-lon1-01",
    "queue_depth": 14,
    "active_concurrency": 4,
    "last_poll_latency_ms": 32,
    "uptime_seconds": 86400
  }
  ```

#### 8.2 `system.dlq.message_quarantined`
- **Aggregate**: `notification_dlq` | **Aggregate ID**: `dlq_id`
- **Priority**: Critical (`9`) | **Default Channels**: `["in_app", "webhook", "email"]`
- **Quiet Hours**: **Strict Bypass** (Admin alert for undeliverable messages)
- **Payload Schema**:
  ```json
  {
    "dlq_id": "UUID",
    "outbox_id": "UUID",
    "event_type": "string",
    "failure_reason": "string (Max retries exceeded: 5)",
    "channel": "push",
    "recipient": "string"
  }
  ```

#### 8.3 `system.provider.circuit_breaker_tripped`
- **Aggregate**: `provider` | **Aggregate ID**: `provider_name`
- **Priority**: Critical (`9`) | **Default Channels**: `["in_app", "email", "webhook"]`
- **Quiet Hours**: **Strict Bypass** (External SMS/Email outage alert)
- **Payload Schema**:
  ```json
  {
    "provider": "string (ExpoPush | TwilioSMS | SendGridSMTP)",
    "consecutive_failures": 10,
    "cooldown_seconds": 60,
    "fallback_active": true
  }
  ```

#### 8.4 `system.campaign.completed`
- **Aggregate**: `campaign` | **Aggregate ID**: `campaign_id`
- **Priority**: Low (`4`) | **Default Channels**: `["in_app", "email"]`
- **Quiet Hours**: Rescheduled to daytime
- **Payload Schema**:
  ```json
  {
    "campaign_id": "UUID",
    "campaign_title": "string (Eid Holiday Travel Blast)",
    "total_targets": 25000,
    "sent_count": 24980,
    "failed_count": 20,
    "delivery_rate_pct": 99.92
  }
  ```

---

## 2B. Extended Service & Automation Runtime Events (`DomainEvent` Direct Emissions)

In addition to the 34 strongly typed subclasses registered in `EVENT_REGISTRY` (`backend/app/notifications/events/`), domain services and scheduled Celery automation jobs emit **14 additional event types** via `DomainEvent(event_type=..., ...)` and `OutboxPublisher.publish_idempotent(...)`:

| Event Type | Category | Aggregate | Source Producer(s) | Trigger Condition |
|---|---|---|---|---|
| `booking.refunded` | Booking | `booking` | `booking_service.py`, `ledger_service.py`, `travel_automation_tasks.py` | Booking refund settled/detected (idempotency-deduplicated across service & reconciliation sweep) |
| `agency.kyc.rejected` | Agency | `agency` | `kyc_service.py` | Admin rejects an agency KYC submission |
| `agency.kyc.changes_requested` | Agency | `agency` | `kyc_service.py` | Admin requests additional KYC verification documents/changes |
| `hotel.guest.checked_in` | Hotel | `hotel_folio` | `hotel_pms_service.py` | Express or front-desk guest check-in completed |
| `hotel.guest.checked_out` | Hotel | `hotel_folio` | `hotel_pms_service.py` | Guest check-out / folio settlement completed |
| `hotel.guest.check_out_reminder` | Hotel | `booking` | `travel_automation_tasks.py` | Scheduled check-out morning reminder prior to departure |
| `marketplace.order.placed` | Marketplace | `marketplace_order` | `local_commerce_service.py` | Local commerce cart checkout confirmed |
| `marketplace.order.fulfillment_updated` | Marketplace | `marketplace_order` | `local_commerce_service.py` | Seller updates order fulfillment status |
| `marketplace.provider.approved` | Marketplace | `provider_profile` | `marketplace_service.py` | Admin approves guide/provider marketplace onboarding |
| `marketplace.provider.rejected` | Marketplace | `provider_profile` | `marketplace_service.py` | Admin rejects guide/provider marketplace onboarding |
| `marketplace.seller.verification_updated` | Marketplace | `marketplace_seller` | `local_commerce_service.py` | Admin updates local commerce seller verification status |
| `system.ledger.imbalance_detected` | System | `ledger` | `ledger_tasks.py` | Nightly double-entry ledger audit identifies non-zero group balance |
| `automation.trip_preparation` | Automation | `booking` | `travel_automation_tasks.py` | Confirmed booking reaches 7d / 3d / 1d pre-departure milestone |
| `automation.incomplete_booking_recovery` | Automation | `booking` | `travel_automation_tasks.py` | Unpaid pending booking recovery window with post-booking suppression & cooldown |

> **Inventory Note**: Total currently observed distinct event types in backend code = **48** (`34` typed schemas in `EVENT_REGISTRY` + `14` direct `DomainEvent` runtime event types). Any further event additions from `@event-automations` will be synced into `FINAL_IMPLEMENTATION_REPORT.md`.

---

## 3. Implementation Guidelines for Producers

1. **Transactional Staging**:
   Domain producers must never call delivery services directly. They must stage events inside their active SQLAlchemy `AsyncSession` via `OutboxPublisher.publish_idempotent(db, event, idempotency_key=...)` (or `OutboxPublisher.publish(db, event)`).
2. **Idempotency Key Formulation**:
   `idempotency_key = f"{event.aggregate_type}:{event.aggregate_id}:{event.event_type}:{event.headers.get('causation_id', '')}"` (mapped deterministically via UUIDv5 in `OutboxPublisher.deterministic_event_id`).
3. **Payload Sanitization**:
   Pay no credit card numbers, passwords, or raw cryptographic tokens in `payload`. Only public/masked references are permitted.
