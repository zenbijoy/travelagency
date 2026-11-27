# ShopnoJatra — Enterprise Security Remediation Tracker

**Zero-Trust Security, Multi-Tenant Isolation & Privilege Protection**  
**Phase 7: Autonomous Enterprise Platform Transformation**  
**Audit Standard**: OWASP ASVS 4.0 (Level 2/3), ISO 27001, PCI-DSS SAQ-A  
**Status**: ACTIVE VERIFICATION & REMEDIATION  
**Last Updated**: November 27, 2026  
**Architect**: CTO & Principal Enterprise Architect (Antigravity Orchestrator)

---

## 1. Executive Summary & Zero-Trust Security Posture

In Phase 7, ShopnoJatra transitioned from trusting client-asserted identity to a strict **Zero-Trust Enterprise Security Model**.
* **Zero Client Trust**: Client applications are never trusted for tenant IDs, subscription claims, role assignments, or pricing calculations.
* **Server-Authoritative Claims**: All authorization checks evaluate cryptographically verified Supabase JWTs signed with `SUPABASE_JWT_SECRET` and validated against database records (`admin_users`, `tenant_memberships`).
* **Cryptographic Perimeter**: Sensitive backend database connection strings and Ed25519 offline ticket signing private keys are quarantined strictly to backend server runtimes.

---

## 2. Security Remediation Action Tracker

| Finding ID | Severity | Subsystem / Target File | Description & Vulnerability Root Cause | Implemented Engineering Remediation | Responsible Agent | Verification Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **P0-SEC-01** | **CRITICAL** | `apps/web-admin/src/context/AuthContext.tsx` | Default `DEFAULT_SUPER_ADMIN` auto-login granted unauthenticated administrative control to anyone opening the admin URL. | Removed `DEFAULT_SUPER_ADMIN` fallback. `user` initializes to `null`. Implemented `AdminLoginView` requiring administrative email, password, and 6-digit TOTP MFA. | Antigravity / Kilo Code | Unauthenticated access renders login screen; protected routes require explicit session. | **RESOLVED & VERIFIED** |
| **P0-SEC-02** | **CRITICAL** | `apps/web-admin/src/components/layout/AdminSidebar.tsx` & `apps/web-agency/src/context/AgencyContext.tsx` | Unrestricted client-side role and tenant dropdowns enabled arbitrary privilege escalation and cross-tenant data access. | Eliminated client-driven role mutation. `switchRole` throws security warnings and is blocked. Replaced dropdown with "VERIFIED RBAC" audited badge. Agency tenant switching enforces server membership validation. | Antigravity / Kilo Code | `backend/tests/test_tenant_isolation.py` proves client-supplied tenant headers are validated server-side. | **RESOLVED & VERIFIED** |
| **P0-SEC-03** | **CRITICAL** | `.env` (Monorepo root) | Live PostgreSQL credentials and Ed25519 ticket private signing key were present in root `.env`, risking bundle leakage into frontend builds. | Removed `DATABASE_URL` and `TICKET_SIGNING_PRIVATE_KEY` from root `.env`. Confirmed backend credentials reside strictly in `backend/.env`. Preserved only `EXPO_PUBLIC_*` client variables. | Antigravity | Root `.env` verified sanitized. Frontend build outputs contain zero backend secrets. | **RESOLVED & VERIFIED** |
| **P1-SEC-01** | **HIGH** | `apps/web-hotel/src/main.tsx` | Hotel PMS application rendered operational rooms, folios, and passcodes without an authentication barrier. | Created `HotelAuthContext` and `HotelLoginView`. Wrapped `apps/web-hotel/src/main.tsx` in `HotelAuthProvider` and route guard checking `isAuthenticated`. | Antigravity / Kilo Code | Unauthenticated visitors to `/`, `/rooms`, `/reservations` are intercepted and redirected to staff login. | **RESOLVED & VERIFIED** |
| **P1-SEC-02** | **HIGH** | `apps/web-public/src/lib/api.ts` | Custom API client read static token from `localStorage` instead of Supabase session cookie/storage, causing 401 on protected booking APIs. | Configured `ShopnoJatraClient.getToken` to dynamically query `createSupabaseBrowserClient().auth.getSession()`, passing fresh Bearer token. | Copilot | Authenticated requests to `/api/v1/bookings` include valid Supabase Bearer JWTs. | **RESOLVED & VERIFIED** |
| **P1-SEC-03** | **HIGH** | `backend/app/api/deps.py` | Missing `BadRequestError` import in FastAPI dependency injector caused 500 internal server error during invalid tenant validation. | Added `BadRequestError` import to `backend/app/api/deps.py`. Handled invalid UUID format with structured 400 Bad Request error response. | Cline / Antigravity | `test_booking_concurrency.py` and `test_tenant_isolation.py` pass cleanly. | **RESOLVED & VERIFIED** |
| **P2-SEC-01** | **MEDIUM** | `backend/app/core/security.py` | JWT verification required defense against algorithm confusion attacks (e.g. `none` or `RS256` public key confusion). | Enforced explicit `algorithms=["HS256"]` in `jwt.decode` and verified minimum 32-character secret length. | Cline | `tests/test_auth_rbac.py` passed with 0 security exceptions. | **RESOLVED & VERIFIED** |
| **P2-SEC-02** | **MEDIUM** | `backend/app/api/v1/endpoints/webhooks.py` | Payment webhook endpoints (bKash, Nagad, Rocket, Stripe) must reject unauthenticated payloads. | Enforced constant-time HMAC signature verification (`compare_digest`) using dedicated webhook secret keys. | Cline | `tests/test_payment_webhooks.py` and `test_production_webhook_secrets.py` pass 100%. | **RESOLVED & VERIFIED** |

---

## 3. Server-Authoritative Multi-Tenant Isolation Architecture

```
Client Request (Browser / Mobile)
        │
        ▼ (HTTP Header: Authorization: Bearer <JWT>, Optional: X-Tenant-Id: <uuid>)
┌────────────────────────────────────────────────────────────────────────┐
│ FastAPI Dependency Pipeline (`backend/app/api/deps.py`)                │
├────────────────────────────────────────────────────────────────────────┤
│ 1. `get_current_user`:                                                 │
│    - Decodes Supabase JWT cryptographically                            │
│    - Extracts `sub` (user_id UUID) and `email`                         │
│    - Queries database `admin_users` table for platform admin roles     │
│                                                                        │
│ 2. `get_tenant_context`:                                               │
│    - Calls `TenantService.resolve_tenant_context(db, user_id, x_tenant)`│
│    - Queries active memberships: `TenantMembership.status == 'active'`  │
│    - If `X-Tenant-Id` supplied: validates user belongs to that tenant  │
│      (Raises 400 BAD_REQUEST if user is not a member)                  │
│    - If omitted: defaults to single tenant (or raises 400 if ambiguous)│
│                                                                        │
│ 3. `require_tenant`:                                                   │
│    - Rejects any operation without an authoritative tenant context     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼ (Guaranteed Valid Tenant ID)
┌────────────────────────────────────────────────────────────────────────┐
│ Business Logic & Repository Layer                                      │
├────────────────────────────────────────────────────────────────────────┤
│ - Queries automatically append `.where(Model.tenant_id == tenant_id)`  │
│ - Inserts set `Model.tenant_id = tenant_context.tenant_id`             │
│ - Database RLS policies enforce `auth.uid() = user_id` at PostgreSQL   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. API Key Lifecycle & Rate Limiting Controls

1. **Scoped API Key Generation**:
   - Agency and Hotel developer API keys are generated with SHA-256 digests (`sj_live_...`).
   - Plaintext keys are shown exactly once to the tenant administrator.
   - Keys have granular permission scopes: `bookings:read`, `bookings:write`, `inventory:read`, `rates:write`.
2. **Abuse Protection & Rate Limiting (`slowapi`)**:
   - Public endpoints (Search, Auth, Booking creation) are guarded by Redis-backed sliding window rate limiters:
     - `/api/v1/auth/*`: 5 requests / minute per IP (prevents credential stuffing).
     - `/api/v1/flights/search`, `/api/v1/hotels/search`: 30 requests / minute per IP/Session.
     - `/api/v1/bookings`: 10 requests / minute per User ID (prevents inventory hoarding).

---

## 5. Secret Management & Credential Rotation Runbook

1. **Zero Hardcoded Secrets Policy**:
   - Automated git pre-commit hooks run `trufflehog` / regex scans for private keys and connection strings.
2. **Rotation Procedure (Supabase Database Password)**:
   - Step 1: Generate high-entropy 32-character password.
   - Step 2: Update connection string in Supabase Dashboard.
   - Step 3: Update `DATABASE_URL` in secure environment vault (AWS Secrets Manager / Doppler).
   - Step 4: Perform rolling reload of backend worker containers with zero downtime.
3. **Ed25519 Ticket Key Rotation**:
   - Public keys are indexed with key version numbers (`v1`, `v2`).
   - Mobile and web verifiers accept signatures signed with `v1` until `v1` expiration window elapses.
