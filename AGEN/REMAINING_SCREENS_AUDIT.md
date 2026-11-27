# AGEN Remaining Screens Audit

**Scope:** `AGEN/` only. No backend, database, migrations, or other apps were modified.
**Design system reused:** `AGEN/src/theme/tokens.ts`, `AGEN/src/components/ui/DashboardUI.tsx` (no duplicate design-system components created).

---

## 1. Screens inspected

Agency screens (`AGEN/src/screens/agency/`):
`DashboardScreen`, `BookingsScreen`, `BookingDetailsScreen`, `CustomersScreen`, `CustomerDetailsScreen`, `CustomerProfileScreen`, `SettingsScreen`, `OperationsScreen`, `EarningsScreen`, `ProfileScreen`, `SupportCenterScreen`, `TeamManagementScreen`, `BankAccountsScreen`, `VerificationScreen`, `B2BSearchBookingScreen`, `QuotationBuilderScreen`, `WalletTopUpScreen`, `ScannerScreen`, `ChatScreen`, `MessagesScreen`, `AgencyInfoScreen`, `PdfExportModal`.

Auth screens (`AGEN/src/screens/auth/`): `LoginScreen`, `SignUpScreen`, `ForgotPasswordScreen`, `OtpScreen` (reviewed, not modified — no demo business data, out of the light-dashboard scope).

---

## 2. Hardcoded / demo data found

| Screen | Issue | Action |
|---|---|---|
| `OperationsScreen` | Hardcoded `liveTours` ("Bali Explorer Pack", "Swiss Alps Adventure"), `operationalStatus` (18/2/1/12), `recentActivities` (Robert Fox $2,450, etc.); no-op Finish/Cancel; dark theme | **Rewritten** — demo arrays removed, honest "unavailable" states, light theme |
| `CustomerDetailsScreen` | Fully hardcoded "Sarah Johnson" profile + 3 fake bookings; service calls commented out; `$` currency; no-op Send Message / Create Booking | **Rewritten** — real `getCustomerDetail`, light theme, states, ৳ currency; fake buttons removed |
| `CustomerProfileScreen` | Hardcoded `customer.recentBookings` demo; `$` currency | Currency fixed to `৳` only (full rewrite deferred — see limitations) |
| `B2BSearchBookingScreen` | Client-generated random PNR `SJ-<random>` | Documented only (demo booking flow) |
| `BankAccountsScreen` | Local-only state (`Date.now()` ids), not persisted via `agencyPaymentsService` | Documented only |
| `TeamManagementScreen` | Local-only state, not persisted via `agencyProfileService` | Documented only |
| `VerificationScreen` | Simulated upload (local filenames) | Documented only |
| `QuotationBuilderScreen` | Client-side quotation generator, random ref | Acceptable (local tool, no backend claim) |

Previously fixed (earlier tasks): `DashboardScreen`, `BookingsScreen`, `CustomersScreen`, `SettingsScreen`, `BookingDetailsScreen` no longer use fabricated data.

---

## 3. Changes implemented (this task)

- **`OperationsScreen.tsx`** — Removed all demo tours/metrics/activity. Each section now renders an explicit `StateView` empty state explaining the data is unavailable because no tours/operations service is connected. Light theme via tokens + `DashboardUI` (`Icon`, `Button`, `Card`, `SectionHeader`, `StateView`). Scanner navigation preserved. Schedule modal preserved but clearly marked "Not connected" (no fake success).
- **`CustomerDetailsScreen.tsx`** — Now loads real data via `agencyCustomersService.getCustomerDetail(agencyId, customerId)`, maps profile + booking history, computes VIP/totals from real bookings, light theme, skeleton/error/empty states, ৳ currency. Removed no-op buttons and local-only status mutation (no backing service).
- **`CustomerProfileScreen.tsx`** — Currency symbol `$` → `৳` for consistency.

---

## 4. Real API integrations verified

| Screen | Service call | Status |
|---|---|---|
| Dashboard | `agencyDashboardService.getMetrics`, `agencyBookingsService.getBookings` | Real |
| Bookings | `agencyBookingsService.getBookings` | Real |
| BookingDetails | `getBookingDetail`, `updateBookingStatus`, `cancelBooking` | Real |
| Customers | `agencyCustomersService.getCustomers` | Real |
| CustomerDetails | `agencyCustomersService.getCustomerDetail` | Real |
| Earnings | `agencyPaymentsService.getPayoutHistory` / `getEarningsBalances` | Real (unchanged) |
| Settings | No business data (device preferences only) | N/A — login activity shown as honest empty state |
| Operations | **None available** | Honest "unavailable" states (no invented endpoints) |

---

## 5. Remaining missing backend services

- **Tours / live-operations service** — required before `OperationsScreen` can show live tours, status metrics and activity.
- **Customer status management service** — required to persist customer active/inactive/suspended changes.
- **Login activity / device session service** — required for `Settings` login history.
- **Persistent bank accounts & team management** — services exist (`agencyPaymentsService.addBankAccount`, `agencyProfileService.addTeamMember`) but the screens currently keep local-only state; wiring them is a follow-up.

---

## 6. Files changed

- `AGEN/src/screens/agency/OperationsScreen.tsx` (rewritten)
- `AGEN/src/screens/agency/CustomerDetailsScreen.tsx` (rewritten)
- `AGEN/src/screens/agency/CustomerProfileScreen.tsx` (currency only)

(From earlier tasks in this workstream: `DashboardScreen.tsx`, `BookingsScreen.tsx`, `CustomersScreen.tsx`, `SettingsScreen.tsx`, `BookingDetailsScreen.tsx`, `App.tsx`, `src/theme/tokens.ts`, `src/components/ui/DashboardUI.tsx`.)

---

## 7. Commands executed and actual results

- **TypeScript** — `tsc --noEmit -p AGEN/tsconfig.json` (with `--max-old-space-size=4096`): **exit 0 (pass)**.
- **ESLint** — `eslint --no-ignore` on changed files (`OperationsScreen`, `CustomerDetailsScreen`, `CustomerProfileScreen`): **0 errors**. Remaining warnings are pre-existing in `CustomerProfileScreen` (unused `MaterialCommunityIcons`, `customerId`, `setCustomer`) and were left untouched to avoid unrelated edits.
- **Jest (AGEN)** — `jest --config package.json`: **1 suite fails at import time** with `Invariant Violation: __fbBatchedBridgeConfig is not set` originating from `expo-sharing` → `itineraryPdfGenerator` → `PdfExportModal.tsx`. This is a pre-existing jest-expo native-module environment issue; `PdfExportModal` and its test were **not** modified. Confirmed unrelated to these changes.

---

## 8. Known limitations & recommended next tasks

**Limitations**
- `OperationsScreen` is intentionally data-less until a tours service exists (no fabricated data added).
- `CustomerProfileScreen` still uses hardcoded `recentBookings` (only currency fixed).
- `BankAccountsScreen` / `TeamManagementScreen` persist to local state only.
- `B2BSearchBookingScreen` generates a client-side random PNR (demo).
- AGEN has no local ESLint config; lint was run from the repo root with `--no-ignore` because the root config ignores the sub-app.

**Recommended next tasks**
1. Add a tours/operations service (Supabase `tours` + `agency_id`) and wire `OperationsScreen`.
2. Add a customer-status service and restore status management in `CustomerDetailsScreen`.
3. Wire `BankAccountsScreen` and `TeamManagementScreen` to their existing services (remove local-only state).
4. Replace `CustomerProfileScreen` demo history with `agencyCustomersService`.
5. Add a login-activity/device-session source for `Settings`.
6. Provide an AGEN-local ESLint config so `npm run lint` works in the sub-app.