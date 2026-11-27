# API Integration Matrix

Audit date: 2026-11-27. Source-level only; endpoint availability was not tested against a running backend.

| App / workflow | Source evidence | Current status | Blocker / next verification |
|---|---|---|---|
| Public flight search | `apps/web-public/src/lib/api.ts` calls typed flight search | Connected in source; runtime unverified | Validate API base URL, auth requirements, empty/error state, and real inventory |
| Public hotel search/detail | Same API module calls hotel search/detail/rooms | Connected in source; runtime unverified | Verify availability semantics and room inventory correctness |
| Public itineraries | Same module calls `/api/v1/itineraries` | Connected in source; runtime unverified | Validate response schema, publication filter, pagination |
| Public destinations | `getDestinations` returns local `DESTINATIONS` | Local editorial/static content | Define curated CMS/API ownership; label content appropriately |
| Public booking/payment | `submitBooking` throws 501; `API_CONTRACT_GAPS.md` lists required contracts | Explicitly unavailable | Server quote, quote redemption, payment against persisted amount, idempotency and status contracts |
| Agency dashboard/bookings | `agencyApi.ts` generates demo tenant/bookings and derives metrics | Mock/in-memory | Tenant-scoped API endpoints and server claims required |
| Hotel PMS operations | `pmsService.ts` loads `INITIAL_*` data into arrays | Mock/in-memory | Verified PMS APIs for reservations, rooms, check-in/out, housekeeping and rates |
| Admin operations | `adminService.ts` loads `INITIAL_*` data into arrays | Mock/in-memory | Server APIs and authorization for every privileged operation |
| Customer session | Public login uses Supabase browser auth | Existing auth provider in source | Verify middleware/server session handling and protected routes end to end |
| Agency/hotel/admin auth | Local contexts/token storage appear in app source | Not verified as secure | Map to authoritative issuer, refresh/revocation, role claims, server-side tenant enforcement |
