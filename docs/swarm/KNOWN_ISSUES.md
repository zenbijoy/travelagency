# Known Issues & Remediation Plan

## Discovered Issues & Technical Debt

### 1. Mock Payout Math in Commission Management (CRITICAL — P0)
- **Symptom:** `src/screens/admin/CommissionManagementScreen.tsx` (line 50) computes fake payout earnings via `৳${Math.round((Number(ag.rating) || 4.5) * 32000).toLocaleString()}`.
- **Root Cause:** Screen was initially built as a visual mockup and never integrated with `backend/app/api/v1/endpoints/admin_payouts.py` or the `payout_batches` / `payouts` database tables.
- **Remediation:** Connect screen to backend payout batch API (`/admin/payouts/batches`), display real pending earnings from double-entry ledger accounts, add batch creation dialog, wire up BEFTN and bKash bulk export downloads, and require RBAC-verified mark-as-paid settlement.

### 2. Fake Broadcast in Notification Center (CRITICAL — P0)
- **Symptom:** `src/screens/admin/NotificationCenterScreen.tsx` displays an alert and clears inputs without sending any notification or recording delivery.
- **Root Cause:** Placeholder implementation without database queries or service calls.
- **Remediation:** Integrate with `notification_delivery_logs`, `scheduled_notifications`, and backend broadcast service. Support audience targeting (all travelers, agencies, hotel partners, VIPs), scheduled delivery, immediate dispatch with rate limiting, delivery history, and test-send modes.

### 3. Limited Vertical Filtering & Details in Booking Operations (P0)
- **Symptom:** `src/screens/admin/BookingManagementScreen.tsx` only offers status filtering (`all`).
- **Root Cause:** Incomplete UI controls and simple `getAllBookings` query that does not join `booking_items`, `booking_passengers`, `vouchers`, or `booking_payments`.
- **Remediation:** Add vertical selector tabs (All, Flights, Hotels, Trains, Bus, Launch, Tour Packages). Add comprehensive detail drawer displaying passenger manifest, cabin/room class, ticket QR verification, payment gateway transaction ID, and action controls (resend confirmation, reissue ticket, update operational status, add internal notes).

### 4. Admin Payment Center Missing Gateway Status & Webhooks (P1)
- **Symptom:** `src/screens/admin/PaymentManagementScreen.tsx` only queries wallet transactions table.
- **Root Cause:** Disconnected from gateway status monitoring and webhook failure logs.
- **Remediation:** Display real gateway cards (bKash, Nagad, Rocket, Stripe, SSLCommerz), recent transactions across all gateways, failed webhook queue inspection, signature status, and safe sandbox replay.

### 5. Review Moderation Single-Entity Limitation (P1)
- **Symptom:** `src/screens/admin/ReviewModerationScreen.tsx` only loads `agency_reviews`.
- **Root Cause:** Missing tabs for hotel reviews, guide ratings, destination reviews, and community moderation.
- **Remediation:** Add multi-entity tabs, content search, spam heuristic indicators (keyword filter, duplicate text detection), and bulk moderation actions.

### 6. Admin Routing Tab Discrepancy
- **Symptom:** `app/admin/[slug].tsx` had a restricted `VALID_TABS` array missing `hero-banners`, `marketplace`, `demand-heatmap`, `agency-kyc`.
- **Root Cause:** New admin tabs added to `AdminPortalShell.tsx` were not synced to `app/admin/[slug].tsx`.
- **Remediation:** Update `VALID_TABS` in `app/admin/[slug].tsx` to match all 23 valid tabs in `AdminPortalShell.tsx`.
