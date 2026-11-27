# ShopnoJatra — Enterprise Agent Ownership Matrix

**Ecosystem Governance & Codebase Authority**  
**Phase 7: Autonomous Enterprise Platform Transformation**  
**Status**: APPROVED & ACTIVE  
**Last Updated**: November 27, 2026  
**Architect**: CTO & Principal Enterprise Architect (Antigravity Orchestrator)

---

## 1. Governance Principles & Strict File Boundaries

To prevent race conditions, merge conflicts, simultaneous conflicting edits, and architectural drift across autonomous agent sessions, the ShopnoJatra travel ecosystem enforces strict subsystem ownership.

### Rules of Engagement
1. **Single-Agent Subsystem Authority**: Only the designated Lead Agent may author, modify, or refactor files within their assigned boundary.
2. **Contract-Driven Cross-Subsystem Requests**: Cross-cutting changes (e.g. backend endpoint additions needed by frontend portals) must be mediated via OpenAPI contracts (`docs/openapi.json` and `@shopnojatra/api-client`) or requested through the Orchestrator.
3. **No Direct Secret Access**: Agents operating on client-facing applications (`apps/web-*`, `AGEN/`, `hotel/`, `app/`) are strictly forbidden from embedding, touching, or committing server secrets, database URLs, or private cryptographic signing keys.
4. **Preservation of Mobile Apps**: Mobile applications (`AGEN/`, `hotel/`, `app/`, `rider/`) are production assets with active typecheck gates. Any cross-package change in `packages/*` must preserve backward compatibility.

---

## 2. Agent Subsystem Ownership Roster

| Agent Identifier | Specialist Role | Primary Ownership Scope | Secondary / Support Scope |
| :--- | :--- | :--- | :--- |
| **Antigravity** | CTO, Enterprise Architect & Orchestrator | System Architecture, Monorepo Boundaries, Swarm Orchestration, Final Acceptance, Root Governance (`docs/*`, `pnpm-workspace.yaml`, `.system_generated/*`) | Cross-system integration, Security Governance, CI/CD Orchestration |
| **Cline** | Backend, Database, SaaS & Integration Lead | `backend/app/`, `backend/alembic/`, `backend/tests/`, `supabase/migrations/`, `supabase/` | Distributed Sagas, Transactional Outbox, Celery Tasks, Ledger Services |
| **Copilot** | Public Web, API Client & CI/CD Lead | `apps/web-public/`, `packages/api-client/`, `packages/validation/`, `.github/workflows/`, `scripts/ci/` | SSR Caching, Next.js 15 App Router, SEO Architecture |
| **Kilo Code** | Multi-Portal Frontend Lead | `apps/web-agency/`, `apps/web-hotel/`, `apps/web-admin/`, `packages/design-system/`, `packages/design-tokens/`, `packages/web-config/` | TanStack Router/Table/Virtual, B2B Portals, Hotel PMS, Admin Desk |
| **Blackbox** | Independent QA, Testing & API Contracts | Test Automation, Integration Verification, OpenAPI Auditing (`packages/api-client/src/__tests__/`, `apps/*/e2e/`, Security Verification) | Static Analysis, Flaky Test Resolution, Load Testing Scripts |
| **ChatGPT** | Independent Architecture Reviewer | Architectural Decision Records (ADRs), Failure Mode Effect Analyses (FMEA), Security Posture Verification | SRE SLI/SLO Audits, Cell Architecture Review, DR Verification |

---

## 3. Granular Directory & File Ownership Matrix

```
Directory / File Pattern                             Owner Agent     Reviewer / Gate
========================================================================================
backend/app/api/                                     Cline           Antigravity / Blackbox
backend/app/core/ (security, database, redis)        Cline           Antigravity / Security
backend/app/models/                                  Cline           Antigravity
backend/app/services/ (sagas, ledger, outbox)        Cline           Antigravity
backend/app/tasks/ (celery background workers)       Cline           Blackbox
backend/tests/                                       Cline / Blackbox Antigravity
supabase/migrations/                                 Cline           Antigravity / DBA

packages/api-client/                                 Copilot         Cline / Blackbox
packages/validation/                                 Copilot         Cline / Kilo Code
packages/design-tokens/                              Kilo Code       Copilot
packages/design-system/                              Kilo Code       Copilot
packages/web-config/                                 Kilo Code       Copilot
packages/shared/ (mobile shared)                     Antigravity     Kilo Code

apps/web-public/                                     Copilot         Antigravity
apps/web-agency/                                     Kilo Code       Antigravity
apps/web-hotel/                                      Kilo Code       Antigravity
apps/web-admin/                                      Kilo Code       Antigravity

app/ (Traveler Expo Mobile)                          Preserved       Antigravity / Blackbox
AGEN/ (Agency Expo Mobile)                           Preserved       Antigravity / Blackbox
hotel/ (Hotel Expo Mobile)                           Preserved       Antigravity / Blackbox
rider/ (Rider Expo Mobile)                           Preserved       Antigravity / Blackbox

.github/workflows/                                   Copilot         Antigravity / DevOps
docs/                                                Antigravity     ChatGPT / All Leads
root configuration (.env, tsconfig.json, etc.)       Antigravity     All Leads
```

---

## 4. Conflict Prevention & Pre-Delegation Protocol

Before any agent executes non-trivial file modifications:
1. **Scope Declaration**: Agent posts the exact file list to be touched.
2. **Pre-Flight Lock Check**: Confirm no other active task has open uncommitted buffers in that path.
3. **Contract Dependency Verification**:
   - Backend API endpoints must be committed and pass unit tests before frontend teams wire them.
   - Database schema migrations must run and pass before ORM models are deployed.
4. **Autonomous Quality Gate Check**:
   - `git diff` must be reviewed before committing.
   - Relevant unit and integration tests must run and report zero failures.
   - No destructive commands (`git reset --hard`, `git push --force`, `rm -rf`) are permitted.
