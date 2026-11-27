# Phase 6 Authentication Report

Audit date: 2026-11-27. Source review only; no live Supabase or backend session was available.

## Implemented and source-verified

- Backend token issuer is Supabase Auth. `backend/app/core/security.py` validates bearer JWTs; `backend/app/api/v1/endpoints/auth.py` exposes protected `GET /api/v1/auth/me`, which resolves server identity and role/membership fields.
- The agency shell, hotel login screen and admin login screen now show explicit locked states. Client-created identities and default privileged role state no longer open the operational UI.
- Hotel and admin contexts do not restore caller-editable identity objects from localStorage. Admin `hasPermission` always denies until server identity and permission resolution are connected.

## Implemented but not runtime-verified

- None. No portal currently completes Supabase sign-in and `/auth/me` resolution.

## Blocked by missing integration

- Portal applications do not yet create a Supabase Auth client, sign in, refresh/revoke sessions, subscribe to auth changes, or pass the resulting token into a verified `/auth/me` flow.
- No server-side route middleware/session cookie implementation was verified for the Vite portals.
- Portal membership UI must consume `agency_id`, `hotel_id`, `admin_role`, and `admin_permissions` returned by the backend. Browser-selected tenant/property and UI role values cannot be authority.

## Known security risks

- Backend authorization and tenant isolation were not exercised. A protected OpenAPI declaration does not itself prove correct access checks.
- Supabase `user_metadata` is returned by the diagnostic claims endpoint; it must not be used for authorization. Use verified backend membership/permission resolution.
- Existing mock service modules remain in the repository; portal shells are locked, but removal/replacement of every mock service is incomplete.

## Changed files

- `apps/web-agency/src/components/layout/AgencyLayout.tsx`
- `apps/web-hotel/src/context/HotelAuthContext.tsx`
- `apps/web-hotel/src/components/auth/HotelLoginView.tsx`
- `apps/web-admin/src/context/AuthContext.tsx`
- `apps/web-admin/src/components/auth/AdminLoginView.tsx`
- `docs/web/PHASE_6_API_CONTRACT_MATRIX.md`

## Verification

- Backend source and checked-in `docs/openapi.json` inspected.
- Build/typecheck commands are pending; no runtime authentication test was possible in this source-only pass.
