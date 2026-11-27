# Feature Matrix: ShopnoJatra Travel Platform

| Domain | Feature | UI Screen | Backend Endpoint | Database Tables | Current Status | Target Wave |
|---|---|---|---|---|---|---|
| **Bookings** | Multi-vertical Filters | `BookingManagementScreen.tsx` | `GET /api/v1/bookings` | `bookings`, `booking_items` | Needs Upgrade | Wave 1 (P0) |
| **Bookings** | Passenger Manifest & Voucher | `BookingManagementScreen.tsx` | `GET /api/v1/bookings/{id}` | `booking_passengers`, `vouchers` | Incomplete | Wave 1 (P0) |
| **Bookings** | Resend Notifications / Reissue | `BookingManagementScreen.tsx` | `POST /api/v1/bookings/{id}/resend` | `trip_timeline_events`, `tickets` | Missing | Wave 1 (P0) |
| **Finance** | Real Payout Batches | `CommissionManagementScreen.tsx` | `GET /api/v1/admin/payouts/batches` | `payout_batches`, `payouts` | Mocked -> Real | Wave 1 (P0) |
| **Finance** | BEFTN / bKash CSV Export | `CommissionManagementScreen.tsx` | `GET /admin/payouts/batches/{id}/export/*`| `agency_bank_accounts`, `payouts` | Disconnected | Wave 1 (P0) |
| **Finance** | Ledger Settlement Workflow | `CommissionManagementScreen.tsx` | `POST /admin/payouts/batches/{id}/mark-paid`| `ledger_entries`, `ledger_accounts`| Disconnected | Wave 1 (P0) |
| **Notifications**| Push / SMS / Email Broadcast | `NotificationCenterScreen.tsx` | `POST /api/v1/admin/notifications/broadcast` | `notification_delivery_logs` | Fake -> Real | Wave 1 (P0) |
| **Notifications**| Audience Targeting & Scheduled | `NotificationCenterScreen.tsx`| `POST /api/v1/admin/notifications/schedule` | `scheduled_notifications` | Missing | Wave 1 (P0) |
| **Payments** | Gateway Health & Logs | `PaymentManagementScreen.tsx` | `GET /api/v1/admin/payments/overview` | `payment_transactions`, `webhooks`| Incomplete | Wave 2 (P1) |
| **Payments** | Webhook Inspection & Safe Replay| `PaymentManagementScreen.tsx`| `POST /api/v1/admin/payments/webhooks/replay`| `webhook_logs` | Missing | Wave 2 (P1) |
| **Reviews** | Multi-entity Moderation | `ReviewModerationScreen.tsx` | `GET /api/v1/admin/reviews` | `review_moderation`, `hotel_reviews`| Incomplete | Wave 2 (P1) |
| **Reviews** | Spam & Abuse Detection Rules | `ReviewModerationScreen.tsx` | Rule-based engine + backend | `community_moderation` | Missing | Wave 2 (P1) |
| **KYC** | OCR Verification & Risk Score | `AgencyKycReviewScreen.tsx` | `POST /api/v1/kyc/verify` | `agency_kyc_submissions` | Operational | Wave 2 (P1) |
| **Analytics** | Spatial Demand Heatmap | `DemandHeatmapScreen.tsx` | `GET /api/v1/admin/analytics/heatmap`| Spatial queries / aggregations | Operational | Wave 3 (P2) |
| **Portals** | Agency B2B Management | `AGEN` & `AgencyManagementScreen.tsx`| `/agency/earnings`, `/admin/agencies` | `agencies`, `agency_staff` | Operational | Wave 3 (P2) |
| **Portals** | Hotel PMS & Room Allotment | `hotel` & `HotelManagementScreen.tsx`| `/hotels`, `/hotel_rooms` | `hotels`, `hotel_room_availability`| Operational | Wave 3 (P2) |
| **Settings** | Feature Flags & Maintenance | `AdminSettingsScreen.tsx` | `GET/PUT /api/v1/admin/settings` | `system_settings` | Operational | Wave 3 (P2) |
