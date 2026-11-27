# Phase 6 Agency Integration Report

Audit date: 2026-11-27.

## Implemented and verified at source level

- The agency route shell displays a blocked state until server identity and agency membership resolution exist. Mock-backed screens are not reachable through this shell.
- The only matching authenticated backend surface found in the checked-in OpenAPI snapshot is `GET /api/v1/agency/earnings/summary`, `GET /api/v1/agency/earnings/payouts`, and `GET /api/v1/agency/earnings/statement`.

## Implemented but not runtime-verified

- No agency workflow is connected end to end. Shared client methods exist for earnings but their contract and tenant authorization have not been exercised.

## Blocked by missing backend capability

- Tenant membership list/switch contract, agency dashboard metrics, agency bookings, customer directory, package management, profile/settings, team management, and agency-initiated payout request were not found in OpenAPI.
- No trusted pagination/filtering support has been confirmed for every agency workflow.

## Not implemented / known risks

- `apps/web-agency/src/services/agencyApi.ts` still contains generated bookings, demo tenants/customers/commissions, and locally calculated dashboard metrics.
- `AgencyContext` still has demo identity and role/tenant state, although the locked shell prevents its protected screens from rendering.
- No tenant-isolation security tests or live backend checks were run.

## Changed files

- `apps/web-agency/src/components/layout/AgencyLayout.tsx`
- `docs/web/PHASE_6_API_CONTRACT_MATRIX.md`

## Verification

- Route tree and service module inspected. Runtime persistence and tenant authorization remain unverified.
