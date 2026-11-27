# ShopnoJatra Web Architecture Audit

Audit date: 2026-11-27

## Scope and evidence

Inspected the four `apps/web-*` workspaces, shared design tokens/system and API client, app entry points, relevant data services, the public API contract gap note, workspace manifests, and current Git status. This is a source inspection, not a deployment, backend connectivity test, or production audit.

## Verified architecture

- `apps/web-public` is a Next.js App Router application with SSR/ISR routes, Supabase browser auth, a typed API client, and marketplace search calls.
- `apps/web-agency`, `apps/web-hotel`, and `apps/web-admin` are separate Vite/React apps. Agency uses TanStack Router/Query; hotel and admin have their own application contexts and services.
- `packages/design-tokens`, `packages/design-system`, `packages/api-client`, `packages/validation`, and `packages/web-config` exist. The root also contains Expo mobile apps and a FastAPI backend; this implementation did not edit those systems.
- The public website explicitly blocks checkout because the backend lacks a secure quote-redemption contract (`apps/web-public/API_CONTRACT_GAPS.md`).

## Key gaps

- Public destinations come from the static `DESTINATIONS` catalog in `apps/web-public/src/lib/mock-data.ts`; destination detail pages read that catalog. Public hotel/flight search and tour reads call the API, but empty/error responses can look like an empty catalogue. Availability and price contracts need verification against a running backend.
- Agency services seed demo tenants and generated bookings; dashboard metrics are locally derived. The API client exists but those dashboard paths are not backend-backed.
- Hotel PMS initializes room, reservation, housekeeping, staff, rates, blocks, and analytics from `mockData.ts` into an in-memory service. `HotelAuthContext` locally constructs a user from caller-supplied email, role, and hotel ID. This is demo auth and must not authorize production operations.
- Admin service initializes all platform metrics, tenants, transactions, refunds, audit records, and supplier health from local mock data. Its audit digest helper is a short integer hash labeled `sha256_`, not a cryptographic digest. Admin auth context contains client-side role state. These are not production controls.
- API integration matrix and backend route/security contracts need a systematic endpoint-by-endpoint review before claims of tenant isolation or persistent workflow support.
- Reported prior backend test counts in README were not rerun during this audit.

## Implemented in this change

- Light-first base styling for agency, hotel, and admin web shells; reduced-motion CSS support added to the changed agency/hotel/admin shells.
- Shared design tokens now include explicit semantic status foreground/background values.
- Shared Modal now has generated accessible title/description associations, initial focus, and focus restoration.
- Declared `clsx` and `tailwind-merge` dependencies in the design-system package manifest because its utilities import both packages.

## Priority plan

1. Replace demo auth with the existing server-issued identity/session mechanism; enforce tenant and role checks server-side.
2. Create an endpoint/capability matrix from actual OpenAPI routes for agency, hotel, and admin screens; convert mock-backed service surfaces to explicit loading/empty/error/blocked states.
3. Keep public checkout disabled until quote, booking redemption, payment, idempotency, and authoritative status contracts are implemented.
4. Promote editorial destination content to an explicitly curated CMS/static source or a supported backend contract; label estimates and avoid implying live inventory.
5. Unify shared UI adoption and verify responsive behavior, accessibility, and app builds.
6. Run package typechecks/builds and focused security/accessibility checks in an environment where package scripts are runnable.

## Verification status

The five direct TypeScript compiler commands for design-system and the four apps completed without printed diagnostics. `git diff --check` passed. The pnpm PowerShell shim was blocked by the host execution policy, so package build scripts and tests were not run. The TypeScript command updated the tracked Next `tsconfig.tsbuildinfo`; restoring it was blocked because Git could not create `.git/index.lock`. This incidental metadata diff is left untouched for review.

## Known limits

No live credentials, external service behavior, backend API responses, role enforcement, tenant isolation, full accessibility tree, browser viewport, production build, or payment path was verified. Existing user modifications in `docs/SECURITY_AUDIT_REPORT.md` and `docs/SCALE_READINESS_REPORT.md` were preserved.
