# Phase 6 Remaining Blockers

Audit date: 2026-11-27.

## Critical blockers

1. Connect Supabase Auth sign-in/session refresh/sign-out in agency, hotel and admin portals, then resolve identity with protected `GET /api/v1/auth/me`.
2. Add backend tests proving agency/property membership checks and admin permission checks on every sensitive operation. The frontend must never authorize tenant or role selection.
3. Replace mock-backed agency, hotel and admin services with verified endpoint calls. Remove all `DEMO_*`, generated booking, `INITIAL_*`, and local mutation paths from production portals.
4. Add and verify missing business contracts: agency dashboard/bookings/customers/packages/profile/team; hotel room assignment, staff membership, rates/availability and payout workflows; admin platform metrics, tenant directories, transaction/refund oversight, and server audit records.
5. Confirm quote expiration/redemption, persisted booking amount, payment idempotency and confirmation contracts before enabling checkout. Keep checkout disabled until those checks pass.

## Current portal behavior

- Agency, hotel, and admin surfaces show blocked states because no verified auth handshake is wired. Operational screens are not usable in this interim state.
- `docs/web/PHASE_6_API_CONTRACT_MATRIX.md` reflects the checked-in OpenAPI snapshot. It may be stale relative to a running backend.
- Hotel PMS and selected agency earnings/admin operational endpoints exist in the snapshot, but their tenant authorization and live response contracts are unverified.

## Not completed

- Full API-client timeout/cancellation/correlation/runtime financial schema validation work.
- Workflow conversions, UI loading/error/retry states for all operations, integration tests, browser accessibility/responsive review, and live API checks.
- End-to-end verification and all required Phase 6 security tests.

## Verification

- Command results are recorded in `PHASE_6_SECURITY_VERIFICATION.md` after implementation checks complete.
