# ShopnoJatra — API Compatibility Matrix & Endpoint Verification

**Phase 5: Critical Security & Integration Remediation**  
**Specification Reference**: `docs/openapi.json` (OpenAPI 3.1.0) & `backend/app/api/v1/router.py`  
**Client Reference**: `packages/api-client/src/client.ts`  
**Integration Status**: **ALL DOMAIN APIS FULLY COMPATIBLE & WIRED**

---

## 1. Complete API Compatibility Matrix

| Domain Endpoint | FastAPI Backend Route & Method | `@shopnojatra/api-client` Method | Frontend App Usage | Integration Status | Compatibility Notes / Verification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Check Email** | `POST /api/v1/auth/check-email` | `client.auth.checkEmail` | `apps/web-public` | **COMPATIBLE** | Matches `CheckEmailRequest` & `StandardResponse[CheckEmailResponse]`. |
| **Current User** | `GET /api/v1/auth/me` | `client.auth.me` | `apps/web-admin`, `apps/web-agency` | **COMPATIBLE** | Token-backed profile resolution in auth contexts. |
| **Inspect Claims** | `GET /api/v1/auth/claims` | `client.auth.inspectClaims` | Shared Auth Middleware | **COMPATIBLE** | Inspects verified JWT roles and scopes. |
| **Flight Search** | `GET /api/v1/flights/search` | `client.flights.search` | `apps/web-public` | **COMPATIBLE** | Maps origin, destination, departure_date, cabin_class with pagination. |
| **Flight Seats** | `GET /api/v1/flights/{flight_id}/seats` | `client.flights.getSeats` | `apps/web-public` | **COMPATIBLE** | Retrieves seat grid with row-level availability. |
| **Lock Seat** | `POST /api/v1/flights/seats/lock` | `client.flights.lockSeat` | `apps/web-public` | **COMPATIBLE** | Atomically locks flight seat using pessimistic locks. |
| **Hotel Search** | `GET /api/v1/hotels/search` | `client.hotels.search` | `apps/web-public` | **COMPATIBLE** | Maps city, check-in, check-out, guests, rooms, min/max price, star rating. |
| **Hotel Details** | `GET /api/v1/hotels/{hotel_id}` | `client.hotels.getById` | `apps/web-public` | **COMPATIBLE** | Matches `HotelResponse` with room categories and amenities. |
| **Hotel Rooms** | `GET /api/v1/hotels/{hotel_id}/rooms` | `client.hotels.getRooms` | `apps/web-public` | **COMPATIBLE** | Retrieves room types, pricing, and availability. |
| **Hotel PMS Matrix** | `GET /api/v1/hotel-pms/{hotel_id}/matrix` | `client.hotelPms.getMatrix` | `apps/web-hotel` | **WIRED & COMPATIBLE** | Wired via `pmsService.fetchLiveRoomMatrix(hotelId)`. |
| **Hotel PMS Room Create** | `POST /api/v1/hotel-pms/{hotel_id}/units` | `client.hotelPms.createUnit` | `apps/web-hotel` | **WIRED & COMPATIBLE** | Supports dynamic room unit creation with category, floor, and amenities. |
| **Hotel PMS Express Checkin**| `POST /api/v1/hotel-pms/{hotel_id}/checkin` | `client.hotelPms.checkIn` | `apps/web-hotel` | **WIRED & COMPATIBLE** | Generates digital key passcodes & sets room occupancy. |
| **Hotel PMS Housekeeping** | `GET /api/v1/hotel-pms/{hotel_id}/housekeeping` | `client.hotelPms.getHousekeeping` | `apps/web-hotel` | **WIRED & COMPATIBLE** | Wired via `pmsService.fetchLiveHousekeeping(hotelId)`. |
| **Hotel PMS Housekeeping Transition** | `POST /api/v1/hotel-pms/housekeeping/{taskId}/transition` | `client.hotelPms.transitionHousekeeping` | `apps/web-hotel` | **WIRED & COMPATIBLE** | Updates cleaning task status (`clean`, `inspected`, `ready`). |
| **Hotel PMS Yield Analytics** | `GET /api/v1/hotel-pms/{hotel_id}/analytics` | `client.hotelPms.getAnalytics` | `apps/web-hotel` | **WIRED & COMPATIBLE** | Wired via `pmsService.fetchLiveAnalytics(hotelId)`. |
| **Create Booking** | `POST /api/v1/bookings` | `client.bookings.create` | `apps/web-public`, `apps/web-agency` | **COMPATIBLE** | Row-level locking (FOR UPDATE) with idempotency key enforcement. |
| **List Bookings** | `GET /api/v1/bookings` | `client.bookings.list` | `apps/web-public`, `apps/web-agency` | **WIRED & COMPATIBLE** | Wired via `fetchLiveAgencyBookings()`; auth token dynamically attached. |
| **Get Booking By ID** | `GET /api/v1/bookings/{booking_id}` | `client.bookings.getById` | `apps/web-agency` | **COMPATIBLE** | Retrieves full booking breakdown, passengers, and audit state. |
| **Booking Price Quote** | `POST /api/v1/bookings/quote` | `client.bookings.getQuote` | `apps/web-public` | **COMPATIBLE** | Enforces server-calculated pricing; client-supplied prices rejected. |
| **Initiate Payment** | `POST /api/v1/payments/initiate` | `client.payments.initiate` | `apps/web-public` | **COMPATIBLE** | Dispatches to bKash, Nagad, Rocket, or SSLCommerz card gateways. |
| **Agency Earnings Summary** | `GET /api/v1/agency/earnings/summary` | `client.agency.getEarningsSummary` | `apps/web-agency` | **WIRED & COMPATIBLE** | Wired via `agencyApi.fetchLiveAgencyEarningsSummary()`. |
| **Agency Statement** | `GET /api/v1/agency/earnings/statement` | `client.agency.getEarningsStatement` | `apps/web-agency` | **WIRED & COMPATIBLE** | Returns monthly commission statements with VAT breakdown. |
| **Agency Payouts List** | `GET /api/v1/agency/earnings/payouts` | `client.agency.getPayouts` | `apps/web-agency` | **WIRED & COMPATIBLE** | Lists pending and processed agency withdrawal batches. |
| **Admin KYC Queue** | `GET /api/v1/kyc/admin/queue` | `client.admin.getPendingProviders` | `apps/web-admin` | **WIRED & COMPATIBLE** | Wired via `adminService.fetchLivePendingProviders()`. |
| **Admin Provider Approvals** | `POST /api/v1/admin/marketplace/providers/{id}/approve` | `client.admin.approveProvider` | `apps/web-admin` | **WIRED & COMPATIBLE** | Activates verified tour guides and boatmen. |
| **Admin Payout Batches** | `GET /api/v1/admin/payouts/batches` | `client.admin.getPayoutBatches` | `apps/web-admin` | **WIRED & COMPATIBLE** | Wired via `adminService.fetchLivePayoutBatches()`. |
| **Admin Approve Payout Batch**| `POST /api/v1/admin/payouts/batches/{batchId}/approve` | `client.admin.approvePayoutBatch` | `apps/web-admin` | **WIRED & COMPATIBLE** | Wired via `adminService.approveLivePayoutBatch(batchId)`. |
| **Itineraries (Tours)** | `GET /api/v1/itineraries` | `customApiClient.request("/api/v1/itineraries")` | `apps/web-public` | **COMPATIBLE** | Retrieves curated tours with day-by-day itineraries. |

---

## 2. Remediated Backend & Test Defects

### Defect 1: `NameError: name 'BadRequestError' is not defined`
* **File**: `backend/app/api/deps.py` (lines 13, 198, 218)
* **Root Cause**: Missing import for `BadRequestError` in dependency provider when throwing tenant validation exceptions.
* **Fix Applied**: Added `BadRequestError` to `from app.core.exceptions import AuthenticationError, BadRequestError, PermissionDeniedError`.
* **Outcome**: Resolved 500 runtime crash into proper 400 Bad Request RFC-7807 response. Concurrency tests pass cleanly.

### Defect 2: Booking Concurrency Tenant Isolation In Test Suite
* **File**: `backend/tests/test_booking_concurrency.py`
* **Root Cause**: `create_booking` enforces `require_tenant`. Tests were generating raw user UUIDs without creating corresponding tenant memberships in the test database.
* **Fix Applied**: Added active test `Tenant` and `TenantMembership` records for booking callers.
* **Outcome**: `test_atomic_booking_creation_and_state_transition` and `test_flight_seat_double_booking_prevention` pass (201 Created).

### Defect 3: Local Commerce Escrow Release Rider Vehicle Requirement
* **File**: `backend/tests/test_local_commerce_api.py`
* **Root Cause**: `claim_dispatch` enforces that a rider must have an active registered vehicle before claiming parcel delivery jobs (`_require_active_vehicle`). The test onboarded a rider profile without creating a vehicle record, causing dispatch claim to fail silently and leaving `job.rider_id = None`, which caused `/verify-dropoff` to fail with 403 Forbidden.
* **Fix Applied**: Registered an active bike vehicle (`/api/v1/rides/riders/vehicles`) during rider setup.
* **Outcome**: `test_fulfillment_delivery_escrow_release_and_verified_review` passed cleanly with 200 OK.
