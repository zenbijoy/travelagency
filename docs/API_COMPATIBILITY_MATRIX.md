# ShopnoJatra — API Compatibility Matrix & Endpoint Verification

**Phase 4: Full Ecosystem Integration Audit**  
**Specification Reference**: `docs/openapi.json` (OpenAPI 3.1.0) & `backend/app/api/v1/router.py`  
**Client Reference**: `packages/api-client/src/client.ts`  

---

## 1. Complete API Compatibility Matrix

| Domain Endpoint | FastAPI Backend Route & Method | `@shopnojatra/api-client` Method | Frontend App Usage | Integration Status | Compatibility Notes / Gaps |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Check Email** | `POST /api/v1/auth/check-email` | `client.auth.checkEmail` | `apps/web-public` | **COMPATIBLE** | Matches `CheckEmailRequest` & `StandardResponse[CheckEmailResponse]`. |
| **Current User** | `GET /api/v1/auth/me` | `client.auth.me` | None (Unused) | **GAPPED** | `web-admin` and `web-agency` do not call `/auth/me`; they use local mock users. |
| **Inspect Claims** | `GET /api/v1/auth/claims` | `client.auth.inspectClaims` | None (Unused) | **COMPATIBLE** | Present in client; unused by frontend apps. |
| **Flight Search** | `GET /api/v1/flights/search` | `client.flights.search` | `apps/web-public` | **COMPATIBLE** | Correctly maps query params: origin, destination, departure_date. |
| **Flight Seats** | `GET /api/v1/flights/{flight_id}/seats` | `client.flights.getSeats` | None (Unused) | **COMPATIBLE** | Client supports seat maps; public web does not currently render seat selection. |
| **Lock Seat** | `POST /api/v1/flights/seats/lock` | `client.flights.lockSeat` | None (Unused) | **COMPATIBLE** | Supported in client and backend; unused in web checkout. |
| **Hotel Search** | `GET /api/v1/hotels/search` | `client.hotels.search` | `apps/web-public` | **COMPATIBLE** | Maps city, check-in, check-out, min/max price, star rating. |
| **Hotel Details** | `GET /api/v1/hotels/{hotel_id}` | `client.hotels.getById` | `apps/web-public` | **COMPATIBLE** | Matches `HotelResponse`. |
| **Hotel Rooms** | `GET /api/v1/hotels/{hotel_id}/rooms` | `client.hotels.getRooms` | `apps/web-public` | **COMPATIBLE** | Retrieves room categories and rates. |
| **Hotel PMS Matrix** | `GET /api/v1/hotel-pms/{hotel_id}/matrix` | `client.hotelPms.getMatrix` | None (`web-hotel` uses mock) | **DISCONNECTED** | Backend provides full room rack matrix; `web-hotel` reads `INITIAL_ROOMS` from mock. |
| **Hotel PMS Room Create** | `POST /api/v1/hotel-pms/{hotel_id}/units` | `client.hotelPms.createUnit` | None (`web-hotel` uses mock) | **DISCONNECTED** | Backend supports dynamic room provisioning; `web-hotel` mutates local array. |
| **Hotel PMS Express Checkin**| `POST /api/v1/hotel-pms/{hotel_id}/checkin` | `client.hotelPms.expressCheckin` | None (`web-hotel` uses mock) | **DISCONNECTED** | Backend generates digital keys & passcodes; `web-hotel` simulates locally. |
| **Hotel PMS Folio Charges** | `POST /api/v1/hotel-pms/{hotel_id}/folio` | `client.hotelPms.postFolioCharge` | None (`web-hotel` uses mock) | **DISCONNECTED** | Backend calculates VAT and service charges; `web-hotel` uses client formula. |
| **Hotel PMS Housekeeping** | `POST /api/v1/hotel-pms/{hotel_id}/housekeeping` | `client.hotelPms.createHousekeepingTask` | None (`web-hotel` uses mock) | **DISCONNECTED** | Backend persists task status transitions; `web-hotel` mutates local state. |
| **Hotel PMS Analytics** | `GET /api/v1/hotel-pms/{hotel_id}/analytics` | `client.hotelPms.getAnalytics` | None (`web-hotel` uses mock) | **DISCONNECTED** | Backend computes RevPAR, ADR, and occupancy; `web-hotel` uses static numbers. |
| **Create Booking** | `POST /api/v1/bookings` | `client.bookings.create` | `apps/web-public` | **COMPATIBLE** | Direct integration in `submitBooking()` with idempotency key. |
| **List Bookings** | `GET /api/v1/bookings` | `client.bookings.list` | `apps/web-public` (broken auth) | **BROKEN AUTH** | Endpoint supported; client lacks auth token injection due to token mismatch. |
| **Get Booking By ID** | `GET /api/v1/bookings/{booking_id}` | `client.bookings.getById` | None (Unused) | **COMPATIBLE** | Supported in client and backend. |
| **Booking Price Quote** | `POST /api/v1/bookings/quote` | `client.bookings.quote` | None (Unused) | **COMPATIBLE** | Allows server-side price computation without local simulation. |
| **Initiate Payment** | `POST /api/v1/payments/initiate` | `client.payments.initiate` | `apps/web-public` | **COMPATIBLE** | Integrates with payment gateway dispatch (bKash/Nagad/Cards). |
| **Verify Payment** | `GET /api/v1/payments/{payment_id}/verify`| `client.payments.verify` | None (Unused) | **COMPATIBLE** | Server-side IPN verification. |
| **Agency Balances** | `GET /api/v1/agency/earnings/balances` | `client.agency.getBalances` | None (`web-agency` uses mock) | **DISCONNECTED** | Backend returns verified balances; `web-agency` reads `DEMO_TENANTS[0].balanceBDT`. |
| **Agency Payout Request** | `POST /api/v1/agency/earnings/payouts` | `client.agency.requestPayout` | None (`web-agency` uses mock) | **DISCONNECTED** | Backend writes payout withdrawal; `web-agency` pushes to in-memory array. |
| **Agency Statement** | `GET /api/v1/agency/earnings/statement` | `client.agency.getStatement` | None (`web-agency` uses mock) | **DISCONNECTED** | Backend generates double-entry statements; `web-agency` reads `DEMO_COMMISSIONS`. |
| **Admin KYC Queue** | `GET /api/v1/kyc/admin/queue` | `client.admin.kyc.getQueue` | None (`web-admin` uses mock) | **DISCONNECTED** | Backend returns submitted documents; `web-admin` reads `INITIAL_KYC_QUEUE`. |
| **Admin KYC Approve** | `POST /api/v1/kyc/admin/{submission_id}/approve` | `client.admin.kyc.approve` | None (`web-admin` uses mock) | **DISCONNECTED** | Backend promotes agency/hotel; `web-admin` updates local mock state. |
| **Admin Provider Approvals** | `POST /api/v1/marketplace/providers/{id}/approve` | `client.admin.approveProvider` | None (`web-admin` uses mock) | **DISCONNECTED** | Backend activates marketplace provider; `web-admin` updates local mock. |
| **Admin Payout Batches** | `GET /api/v1/admin-payouts/batches` | `client.admin.listPayoutBatches` | None (`web-admin` uses mock) | **DISCONNECTED** | Backend manages treasury disbursements; `web-admin` renders mock ledger. |
| **Itineraries (Tours)** | `GET /api/v1/itineraries` | `customApiClient.request("/api/v1/itineraries")` | `apps/web-public` | **COMPATIBLE** | Correctly maps itinerary items to `Tour` types. |

---

## 2. Identified Backend Defects & Incompatibilities

### Bug 1: `NameError: name 'BadRequestError' is not defined`
* **File**: `backend/app/api/deps.py` (lines 198, 218)
* **Root Cause**: The module catches missing or invalid `X-Tenant-Id` headers and executes `raise BadRequestError(...)`, but `BadRequestError` was omitted from the imports from `app.core.exceptions`.
* **Impact**: Triggers an unhandled 500 Internal Server Error exception instead of returning a clean 400 Bad Request RFC-7807 problem response.
* **Fix**:
  ```python
  from app.core.exceptions import AuthenticationError, BadRequestError, PermissionDeniedError
  ```

### Bug 2: Local Commerce Escrow Release Permission Denied (403 instead of 200)
* **File**: `backend/tests/test_local_commerce_api.py:482`
* **Root Cause**: Endpoint `POST /api/v1/local-commerce/orders/{id}/deliver` checks user role or seller ID match, rejecting valid escrow transitions for authorized actors.
