# Phase 6 Hotel Integration Report

Audit date: 2026-11-27.

## Implemented and verified at source level

- The hotel login screen is now an explicit blocked state. The portal does not accept user-entered role, hotel ID, or hotel name as identity.
- The backend exposes protected PMS routes for room matrix/units, check-in, folios, housekeeping, maintenance, rate rules and analytics. See the full checked-in OpenAPI endpoint list in `PHASE_6_API_CONTRACT_MATRIX.md`.

## Implemented but not runtime-verified

- No PMS operation is connected end to end. Existing client/service mappings have not been validated against live responses or backend membership enforcement.

## Blocked by missing integration / contract

- The portal has no Supabase Auth client and does not resolve `hotel_id` from `GET /api/v1/auth/me`.
- Some PMS endpoints take a hotel ID in the path. The server must verify that the bearer identity is a member of that property on every request; this was not verified.
- The checked-in contract does not cover every current UI workflow, including room assignment, staff directory/assignment, rate blocks, or payouts.

## Not implemented / known risks

- `apps/web-hotel/src/services/pmsService.ts` still seeds `INITIAL_*` arrays and performs in-memory mutations.
- Room, reservation, housekeeping, rates, and analytics screens remain intentionally unreachable through the blocked login gate.
- No cross-property tests or runtime persistence checks were run.

## Changed files

- `apps/web-hotel/src/context/HotelAuthContext.tsx`
- `apps/web-hotel/src/components/auth/HotelLoginView.tsx`
- `docs/web/PHASE_6_API_CONTRACT_MATRIX.md`

## Verification

- Hotel entry point and actual backend router/OpenAPI were inspected. Runtime authorization remains unverified.
