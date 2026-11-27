# Swarm Initial Audit: ShopnoJatra Travel Platform

**Date:** November 2026  
**Auditor:** Autonomous Engineering Swarm (20-Agent Roster)  
**Target Repository:** `zenbijoy/travelagency` (ShopnoJatra — স্বপ্ন যাত্রা)  
**Git Baseline:** `main` (clean working tree, HEAD verified)

---

## 1. System Overview & Baseline State

| Layer | Technologies | Current Verification Status |
|---|---|---|
| **Mobile & Web Client** | React Native 0.83.10, Expo ~55.0.30, Expo Router ~55.0.18, NativeWind v4, Zustand 5, Zod 4 | **Verified**: TypeScript compiles with 0 errors (`tsc --noEmit`). 40/41 Jest suites passing. 1 suite fixed (`moduleDirectories`). |
| **Backend Engine** | Python 3.14 (cpython-3.14) / 3.11+, FastAPI, SQLAlchemy 2.0 Async, Pydantic v2, SlowAPI, Pytest | **Verified**: 124/124 Pytest tests PASS (100% green). |
| **Database & Auth** | Supabase PostgreSQL 15+, 37 Migrations, RLS, Double-entry Ledger, CDC Realtime | **Verified**: 37 version-controlled SQL migrations under `supabase/migrations/`. |
| **B2B Portals** | `AGEN/` (Agency Portal) & `hotel/` (Hotel Portal) | **Verified**: Both workspaces present and type-checking cleanly. |

---

## 2. Admin Inventory Audit (23 Screens Identified)

| # | Screen Name | Route / Path | File | Functional Assessment | Priority |
|---|---|---|---|---|---|
| 01 | Executive Dashboard | `/admin` / `dashboard` | `src/screens/admin/AdminDashboard.tsx` | Operational metrics, KPI cards, activity log, real-time sync | P2 |
| 02 | Hero Banners & Search | `hero-banners` | `src/screens/admin/HeroBannerManagementScreen.tsx` | Slide management, search tags, scheduling | P2 |
| 03 | Local Marketplace & Guides | `marketplace` | `src/screens/admin/MarketplaceManagementScreen.tsx` | Guide list, boatmen, verification status, tidal data | P2 |
| 04 | **Booking Operations** | `booking-ops` | `src/screens/admin/BookingManagementScreen.tsx` | **INCOMPLETE**: Missing vertical filters (flights, hotels, trains, bus, launch, tours); missing details drawer with passengers, vouchers, payment logs; basic status update only | **P0** |
| 05 | User & KYC Management | `users` | `src/screens/admin/UserManagementScreen.tsx` | User list, KYC queue, verification badges | P1 |
| 06 | Hotels & Stays PMS | `hotels` | `src/screens/admin/HotelManagementScreen.tsx` | Property inventory, room allocations, seasonal tariffs | P2 |
| 07 | Agency Directory & Ops | `agencies` | `src/screens/admin/AgencyManagementScreen.tsx` | B2B agency verification, deposit monitoring, staff | P2 |
| 08 | Agency Ops Dashboard | `agency-ops` | `src/screens/admin/AgenAgencyManagementScreen.tsx` | Agency fleet, booking operations | P2 |
| 09 | **Payment Gateway Center** | `payment-ops` | `src/screens/admin/PaymentManagementScreen.tsx` | **INCOMPLETE**: Only queries wallet transactions; missing gateway status checks, webhook inspection/replay, dispute/refund links | **P1** |
| 10 | Refund Management | `refunds` | `src/screens/admin/RefundManagementScreen.tsx` | Refund queue, approve/reject, payout calculations | P1 |
| 11 | **Commission Ledger & Payouts** | `commissions` | `src/screens/admin/CommissionManagementScreen.tsx` | **CRITICAL DEFECT**: Mocked payout calculation (`ag.rating * 32000`); disconnected from real double-entry ledger & BEFTN/bKash batch backend | **P0** |
| 12 | Destination CMS | `destinations` | `src/screens/admin/DestinationManagementScreen.tsx` | Destination editor, attractions, rich media | P2 |
| 13 | **Review Moderation** | `reviews` | `src/screens/admin/ReviewModerationScreen.tsx` | **INCOMPLETE**: Only queries `agency_reviews`; lacks hotel, guide, destination reviews and community reports | **P1** |
| 14 | Support Center | `support` | `src/screens/admin/SupportCenterScreen.tsx` | Support tickets, SLA tracking, agent assignment | P2 |
| 15 | **Notification Center** | `notifications` | `src/screens/admin/NotificationCenterScreen.tsx` | **CRITICAL DEFECT**: Fake broadcast dispatcher (`Alert.alert` only); no backend dispatch, targeting, or delivery logs | **P0** |
| 16 | Marketing Campaigns | `marketing` | `src/screens/admin/MarketingScreen.tsx` | Promo codes, campaigns, discounts | P2 |
| 17 | Advertisement Engine | `ads` | `src/screens/admin/AdvertisementScreen.tsx` | In-app banners, ad placements, impression counters | P2 |
| 18 | Financial Reports | `reports` | `src/screens/admin/ReportsScreen.tsx` | P&L overview, tax reports, CSV download | P2 |
| 19 | Geospatial Heatmap | `demand-heatmap` | `src/screens/admin/DemandHeatmapScreen.tsx` | Destination demand clusters, search volume, booking density | P2 |
| 20 | Platform Monitoring | `monitoring` | `src/screens/admin/AgenPlatformMonitoringScreen.tsx` | API latency, Redis, PostgreSQL, error rates | P2 |
| 21 | Security Audit Logs | `audit-trail` | `src/screens/admin/AuditLogsScreen.tsx` | Admin activity logs, RBAC command traces, search | P2 |
| 22 | Agency KYC Review | `agency-kyc` | `src/screens/admin/AgencyKycReviewScreen.tsx` | Trade license, dual-pane document preview, verification | P1 |
| 23 | System Settings | `settings` | `src/screens/admin/AdminSettingsScreen.tsx` | Maintenance mode, feature flags, system config | P2 |

---

## 3. Discovered Defects & Gaps

1. **Commission Management Screen**: Line 50 computes fake payout amount `৳${Math.round((Number(ag.rating) || 4.5) * 32000).toLocaleString()}`. The backend has a full `admin_payouts.py` module with double-entry ledger, batch creation, BEFTN export, and bKash bulk payout that is completely unused by the frontend.
2. **Notification Center**: Does not call any API or database; clicking Broadcast simply triggers an alert and clears the text input. The database already contains `notification_delivery_logs`, `scheduled_notifications`, and `notification_templates`.
3. **Booking Operations Screen**: Only supports generic "all" status filter. Missing multi-vertical filtering (Flight, Hotel, Train, Bus, Launch, Tour Packages), passenger manifests, ticket voucher details, and operational actions (reissue, resend email/SMS, internal notes).
4. **Payment Operations Screen**: Only queries `shopno_wallet_transactions`. Needs real-time gateway status (bKash, Nagad, Rocket, Stripe, SSLCommerz), webhook event logs, idempotency checks, and transaction auditing.
5. **Review Moderation**: Only connects to `agency_reviews`. Does not support hotel reviews, destination ratings, or community post moderation.
6. **Admin Routing**: `app/admin/[slug].tsx` had a restricted `VALID_TABS` list omitting `hero-banners`, `marketplace`, `demand-heatmap`, and `agency-kyc`.
7. **Jest Configuration**: Root Jest had a module resolution conflict with `AGEN/node_modules/react-native`, now fixed with `moduleDirectories: ["<rootDir>/node_modules", "node_modules"]`.
