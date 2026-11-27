# ShopnoJatra — Security & Tenant Isolation Audit Report

**Phase 4: Full Ecosystem Integration Audit**  
**Audit Scope**: RBAC, Multi-Tenant Isolation, Authentication Tokens, Secret Handling, API Security  
**Severity Rating Standard**: P0 (Critical), P1 (High), P2 (Medium), P3 (Low)  

---

## 1. Vulnerability Findings & Security Exposures

### Finding 1: [P0-SEC-01] Default Super Admin Privilege Escalation in Web Admin
* **Component**: `apps/web-admin/src/context/AuthContext.tsx`
* **Vulnerability Description**:
  The application initializes the global auth state with `DEFAULT_SUPER_ADMIN`:
  ```typescript
  const DEFAULT_SUPER_ADMIN: AdminUser = {
    id: 'usr-admin-001',
    name: 'Tariqul Islam',
    email: 'tariqul.admin@shopnojatra.com',
    role: 'super_admin',
    permissions: ROLE_PERMISSIONS.super_admin
  };
  ```
  If no prior session is detected in `localStorage`, the user is granted automatic, unauthenticated `super_admin` access.
* **Attack Scenario**: Any unauthorized person navigating to `http://localhost:5174/` or the admin domain gets immediate access to the KYC document reviewer, transaction ledger, and circuit breaker controls.
* **Remediation**:
  1. Remove `DEFAULT_SUPER_ADMIN` auto-login.
  2. Require a valid Supabase Auth session or administrative JWT issued by `/api/v1/auth/me`.
  3. Validate role claims (`role == 'platform_admin'`) server-side before rendering any protected routes.

---

### Finding 2: [P0-SEC-02] Arbitrary Client-Side Role & Tenant Impersonation
* **Component**: `apps/web-admin/src/context/AuthContext.tsx` (`switchRole`) & `apps/web-agency/src/context/AgencyContext.tsx` (`switchRole`, `switchTenant`)
* **Vulnerability Description**:
  Both the Admin and Agency portals implement client-side functions that allow users to change their active role or tenant identifier with a UI click:
  ```typescript
  const switchRole = (newRole: AdminRole) => {
    const updated = { ...user, role: newRole, permissions: ROLE_PERMISSIONS[newRole] };
    setUser(updated);
  };
  const switchTenant = (tenantId: string) => {
    setCurrentTenantId(tenantId);
  };
  ```
  Neither function verifies permissions with the backend.
* **Attack Scenario**: A low-privileged agency staff member (`AGENCY_AGENT`) can switch their role to `AGENCY_OWNER` or switch their active agency ID to access another agency's bookings and commission payouts.
* **Remediation**:
  1. Eliminate client-driven role and tenant switching.
  2. Rely exclusively on server-signed claims embedded inside the cryptographic JWT.
  3. Ensure the FastAPI backend rejects any `X-Tenant-Id` header that does not match the authenticated user's authorized tenants in the database.

---

### Finding 3: [P0-SEC-03] Database Credentials and Private Key in Root `.env`
* **Component**: `.env` (Project root)
* **Vulnerability Description**:
  The workspace root contains live PostgreSQL database credentials and an Ed25519 offline ticket-signing private key:
  ```env
  DATABASE_URL=postgresql://postgres.htkpmrfhoijznigwimwj:TPQQDA1paSGqphH2@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres
  TICKET_SIGNING_PRIVATE_KEY=d185746f92486759278795d65a9407683ee5f8b625eeb73d035c87cd94b7cd9c
  ```
* **Attack Scenario**: If web bundlers or build tools include `.env` without strict variable whitelisting, database connection strings or ticket signing keys could be exposed in client bundles.
* **Remediation**:
  1. Restrict `DATABASE_URL` and `TICKET_SIGNING_PRIVATE_KEY` strictly to `backend/.env`.
  2. Rotate database passwords immediately.
  3. Ensure all frontend web apps only consume `NEXT_PUBLIC_` or `VITE_` prefixed variables.

---

### Finding 4: [P1-SEC-01] Missing Authentication Shell in Hotel PMS
* **Component**: `apps/web-hotel/src/main.tsx`
* **Vulnerability Description**:
  `apps/web-hotel` renders `HotelPMSApp` directly on `/`, `/dashboard`, `/rooms`, `/reservations`, and `/housekeeping` without an `AuthProvider`, login route, or token validator.
* **Attack Scenario**: Anyone visiting the URL can view guest registration cards, digital room passcodes, and daily revenue statistics.
* **Remediation**:
  Wrap the router in an `AuthProvider` that enforces `role == 'hotel_staff' | 'hotel_admin'` and associates the session with the authenticated `hotel_id`.

---

### Finding 5: [P1-SEC-02] Token Storage Mismatch in Public Web Booking Flow
* **Component**: `apps/web-public/src/lib/api.ts`
* **Vulnerability Description**:
  `customApiClient.getToken` reads from `localStorage.getItem("shopnojatra_access_token")`. However, Supabase Auth stores tokens in `@supabase/ssr` cookies or `sb-*-auth-token`.
* **Impact**:
  Requests sent to protected booking endpoints (`GET /api/v1/bookings`) lack the `Authorization: Bearer <token>` header, failing with 401 Unauthorized.
* **Remediation**:
  Update `getToken` in `apps/web-public/src/lib/api.ts` to query `supabase.auth.getSession()` dynamically.

---

## 2. Server-Side Tenant Isolation Audit

The backend FastAPI implementation was audited against tenant cross-access:
* **Database Routing**: `backend/app/core/database.py` enforces tenant separation when `X-Tenant-Id` is passed.
* **Row-Level Security (RLS)**: PostgreSQL migrations in `supabase/migrations/` apply RLS policies based on `auth.uid()` and `tenant_id`.
* **Backend Isolation Tests**: `backend/tests/test_tenant_isolation.py` passed all **10 tenant isolation tests**, verifying that cross-tenant queries fail with 403 Forbidden or return empty sets when executed against the database.
