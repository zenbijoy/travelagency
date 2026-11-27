# ShopnoJatra — Production Readiness Checklist & Remediation Plan

**Phase 4: Full Ecosystem Integration Audit**  
**Assessment Date**: November 27, 2026  
**Final Production Recommendation**: **NO-GO (BLOCKED)**  

---

## 1. Production Readiness Scorecard

| Domain | Readiness Status | Score | Critical Blockers |
| :--- | :--- | :--- | :--- |
| **Monorepo & Build Health** | **READY** | 100% | None. All 5 shared packages and 4 web products build cleanly. |
| **Mobile App Integrity** | **READY** | 100% | None. All 3 Expo mobile apps (`AGEN/`, `hotel/`, root) compile with 0 errors. |
| **Backend Core & Security** | **ACTION REQUIRED** | 98% | 3 failed pytest cases; `deps.py` missing `BadRequestError` import. |
| **Public Customer Website** | **ACTION REQUIRED** | 85% | Auth token retrieval disconnect in `api.ts`; destination catalog fallback. |
| **Agency B2B Portal** | **NOT READY** | 30% | Mock data service; zero live FastAPI backend integration. |
| **Hotel PMS Web App** | **NOT READY** | 25% | Mock data service; zero live FastAPI integration; missing authentication shell. |
| **Admin Control Center** | **NOT READY** | 20% | Mock data service; default super-admin bypass; client-side role toggling. |
| **Overall Platform Readiness**| **BLOCKED** | **51%** | **NO-GO FOR PRODUCTION** |

---

## 2. Prioritized Remediation Action Items

### Priority P0: Critical Security & Access Control
| Item ID | Description | Impact | Target File | Assigned Agent | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P0-01** | Remove `DEFAULT_SUPER_ADMIN` auto-login in Web Admin. Enforce real Supabase Auth login. | Platform-wide administrative compromise | `apps/web-admin/src/context/AuthContext.tsx` | `@adminportal` | **OPEN** |
| **P0-02** | Remove client-side role and tenant switching in Admin and Agency portals. | Privilege escalation, horizontal tenant data breach | `apps/web-admin/src/context/AuthContext.tsx`, `apps/web-agency/src/context/AgencyContext.tsx` | `@adminportal`, `@agencyportal` | **OPEN** |
| **P0-03** | Remove database credentials and offline ticket private key from root `.env`. Rotate Supabase DB password. | Direct database compromise, ticket counterfeiting | `.env` | `@devops` / Security | **OPEN** |

---

### Priority P1: Production-Blocking Integration & Backend Fixes
| Item ID | Description | Impact | Target File | Assigned Agent | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P1-01** | Connect `apps/web-agency` to `@shopnojatra/api-client` endpoints (`/api/v1/agency/earnings`, `/api/v1/bookings`). | Agency portal cannot view real bookings or request real payouts | `apps/web-agency/src/services/agencyApi.ts` | `@agencyportal` | **OPEN** |
| **P1-02** | Connect `apps/web-hotel` to `@shopnojatra/api-client` (`/api/v1/hotel-pms/*`) for room matrix, reservations, and housekeeping. | Hotel PMS changes are not saved to the backend database | `apps/web-hotel/src/services/pmsService.ts` | `@hotelpms` | **OPEN** |
| **P1-03** | Connect `apps/web-admin` to `@shopnojatra/api-client` (`/api/v1/kyc/*`, `/api/v1/marketplace/*`, `/api/v1/admin-payouts/*`). | Admin actions (KYC approval, provider activation) are not persisted | `apps/web-admin/src/services/adminService.ts` | `@adminportal` | **OPEN** |
| **P1-04** | Fix `BadRequestError` import in backend `deps.py`. | Unhandled 500 runtime error on tenant validation failures | `backend/app/api/deps.py` | Cline / `@backend` | **OPEN** |
| **P1-05** | Update `customApiClient.getToken` in `web-public` to query Supabase session. | Protected customer booking history calls fail with 401 | `apps/web-public/src/lib/api.ts` | Copilot / `@publicweb` | **OPEN** |
| **P1-06** | Fix Local Commerce escrow delivery check failure in pytest. | Local commerce orders fail escrow release | `backend/app/services/local_commerce_service.py` | Cline / `@backend` | **OPEN** |

---

### Priority P2: Important Quality & Operational Enhancements
| Item ID | Description | Impact | Target File | Assigned Agent | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P2-01** | Add authentication shell and route protection to `apps/web-hotel`. | Unauthenticated visitors can view operational room keys and guest info | `apps/web-hotel/src/main.tsx` | `@hotelpms` | **OPEN** |
| **P2-02** | Add `vitest` dependency and test script to `packages/api-client` and `packages/validation`. | Shared packages lack CI automated unit testing | `packages/*/package.json` | `@foundation` | **OPEN** |
| **P2-03** | Replace static `DESTINATIONS` mock array in `web-public` with dynamic API endpoint. | New destinations created in admin portal do not appear on public site | `apps/web-public/src/lib/api.ts` | `@publicweb` | **OPEN** |

---

### Priority P3: Non-Blocking Optimizations
| Item ID | Description | Impact | Target File | Assigned Agent | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P3-01** | Add code-splitting / dynamic imports (`React.lazy`) for heavy modal dialogs and chart components in Vite apps. | Reduces initial JS bundle size from ~600 kB to <250 kB | `apps/web-*/src/routes/router.tsx` | Product Teams | **OPEN** |
| **P3-02** | Add ARIA live regions and keyboard focus traps to slide-over drawers and alert modals. | Improves screen-reader and keyboard accessibility | `packages/design-system/` | `@foundation` | **OPEN** |

---

## 3. Go-Live Verification Criteria
Before changing the production recommendation to **GO**, the following steps must be completed and validated:
1. `backend/app/api/deps.py` fixed and `pytest backend/tests` reports **254 passed, 0 failed**.
2. Root `.env` cleaned of raw database passwords and private keys.
3. `DEFAULT_SUPER_ADMIN` removed from `apps/web-admin/src/context/AuthContext.tsx`.
4. `apps/web-hotel`, `apps/web-agency`, and `apps/web-admin` refactored to fetch and mutate data via `@shopnojatra/api-client`.
5. Authenticated end-to-end booking, room check-in, and KYC review verified against live FastAPI backend.
