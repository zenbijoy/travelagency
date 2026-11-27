# ShopnoJatra — Enterprise Target Architecture

**Unified Multi-Product, Multi-Tenant Travel SaaS Platform**  
**Phase 7: Autonomous Enterprise Platform Transformation**  
**Status**: APPROVED BASELINE ARCHITECTURE  
**Target Horizon**: 2026–2028  
**Author**: CTO & Principal Enterprise Architect (Antigravity Orchestrator)

---

## 1. Executive Vision & Core Architectural Philosophy

ShopnoJatra is an enterprise-grade Travel SaaS and Local Commerce ecosystem engineered to power thousands of independent travel agencies, boutique and chain hotels, verified logistics providers, and millions of domestic and international travelers across Bangladesh and Southeast Asia.

### Core Architectural Axioms
1. **Authoritative Single-Source Backend**: Business logic, pricing calculations, inventory reservations, commission splits, and state machines exist strictly in the authoritative FastAPI backend. Client applications (Web and Mobile) are strictly UI presentation consumers.
2. **Zero-Trust Multi-Tenant Isolation**: Tenant identity, subscription entitlements, and role claims are never trusted from client payloads. Every incoming transaction evaluates cryptographically verified Supabase JWTs mapped to database-enforced tenant boundaries.
3. **Pragmatic Modular Monolith over Premature Microservices**: ShopnoJatra leverages a high-performance modular monolith (FastAPI + AsyncPG + PostgreSQL + Redis + Celery) rather than fragile microservices, avoiding distributed transaction nightmares, network serialization overhead, and Temporal/Kafka operational tax before traffic metrics justify them.
4. **Financial Invariance & Idempotency**: All monetary movements (payouts, refunds, commissions, escrow releases) execute through an immutable, double-entry ledger. All mutating operations enforce idempotency keys to guarantee safe retry semantics.
5. **Deterministic Cell-Based Scaling**: Scalability is achieved by partitioning tenants horizontally into isolated database and compute "cells", allowing linear infrastructure expansion without global database lock contention.

---

## 2. High-Level Ecosystem Topology

```
                                  ┌───────────────────────────────┐
                                  │      Cloudflare Edge CDN      │
                                  │  DDoS, WAF, SSL, Rate Limits  │
                                  └──────────────┬────────────────┘
                                                 │
                   ┌─────────────────────────────┼─────────────────────────────┐
                   │                             │                             │
                   ▼                             ▼                             ▼
       ┌───────────────────────┐     ┌───────────────────────┐     ┌───────────────────────┐
       │   Customer Channels   │     │      B2B Channels     │     │   Platform Channels   │
       ├───────────────────────┤     ├───────────────────────┤     ├───────────────────────┤
       │ apps/web-public       │     │ apps/web-agency       │     │ apps/web-admin        │
       │ (Next.js 15 App Router│     │ (Vite + React 19 +    │     │ (Vite + React 19 +    │
       │  SSR / ISR Catalog)   │     │  TanStack Table B2B)  │     │  TanStack Command Ctr)│
       │                       │     │                       │     │                       │
       │ app/ & src/           │     │ apps/web-hotel        │     │ Regulatory / SRE      │
       │ (Traveler Expo Mobile)│     │ (Vite + React 19 PMS) │     │ Telemetry Dashboards  │
       │                       │     │                       │     │                       │
       │ rider/ (Rider Mobile) │     │ AGEN/ & hotel/ Mobile │     │ Audit Logs Inspector  │
       └───────────┬───────────┘     └───────────┬───────────┘     └───────────┬───────────┘
                   │                             │                             │
                   └─────────────────────────────┼─────────────────────────────┘
                                                 │ HTTPS / JSON-RPC / OpenAPI 3.1
                                                 ▼
                               ┌───────────────────────────────────┐
                               │     @shopnojatra/api-client       │
                               │  Typed Client + Auto-Auth Bearer  │
                               └─────────────────┬─────────────────┘
                                                 │
                                                 ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────┐
 │                            ShopnoJatra Authoritative Backend Engine                            │
 │                        (FastAPI 0.115 + Python 3.12 + SQLAlchemy 2.0 Async)                   │
 ├───────────────────────────────────────────────┬───────────────────────────────────────────────┤
 │ API Routing & Dependencies                    │ Distributed Core Services                     │
 │ ├─ /api/v1/auth & /api/v1/tenants             │ ├─ Booking Saga State Machine                 │
 │ ├─ /api/v1/flights & /api/v1/hotels           │ ├─ Double-Entry Financial Ledger              │
 │ ├─ /api/v1/hotel-pms & /api/v1/agency         │ ├─ Transactional Outbox Worker                │
 │ ├─ /api/v1/rides & /api/v1/local-commerce     │ ├─ Inventory Reservation Engine (FOR UPDATE)  │
 │ ├─ /api/v1/payments & /api/v1/webhooks        │ ├─ Dynamic Rate Yield Simulator               │
 │ └─ /api/v1/admin-payouts & /api/v1/kyc        │ └─ Supplier Circuit Breakers (Amadeus/Sabre)  │
 └───────────────────────┬───────────────────────────────────────────────┬───────────────────────┘
                         │                                               │
                         ▼                                               ▼
      ┌─────────────────────────────────────┐         ┌─────────────────────────────────────┐
      │   Redis 7 (In-Memory Data Store)    │         │  PostgreSQL 16 (Primary Datastore)  │
      ├─────────────────────────────────────┤         ├─────────────────────────────────────┤
      │ • Distributed Seat Locks (15m TTL)  │         │ • Strict Multi-Tenant Schema + RLS  │
      │ • Token Revocation Blacklist        │         │ • Immutable Ledger (`ledger_entries`)│
      │ • Celery Task Queue Broker          │         │ • Transactional Outbox Events       │
      │ • Search Flight/Hotel Result Cache  │         │ • Citus Cell-Based Tenant Sharding  │
      │ • IP & API Key Rate Limiting        │         │ • PgBouncer Connection Pooling      │
      └─────────────────────────────────────┘         └─────────────────────────────────────┘
```

---

## 3. Subsystem Breakdown & Tech Stacks

### A. Customer Website (`apps/web-public/`)
* **Technology**: Next.js 15.5 App Router, React 19, Tailwind CSS, Supabase SSR Auth.
* **Architecture**: Hybrid Rendering (Server-Side Dynamic for Bookings, ISR for Destination Guides, Static SSG for Marketing).
* **Security**: Zero access to private server keys; tokens fetched dynamically via Supabase browser client.

### B. Travel Agency Portal (`apps/web-agency/`)
* **Technology**: Vite 6, React 19, TanStack Router, TanStack Query, TanStack Table, TanStack Virtual.
* **Architecture**: High-density B2B operations table handling 600+ bookings with 60 FPS scrolling virtualization.
* **Security**: Server-authoritative `X-Tenant-Id` header enforcement; client role switching prohibited.

### C. Hotel Property Management System (`apps/web-hotel/`)
* **Technology**: Vite 6, React 19, TanStack Router, TanStack Query.
* **Architecture**: Visual room grid, Housekeeping Kanban, guest folios, Express Check-In.
* **Security**: Enforced `HotelAuthProvider` terminal authentication with 4-digit staff PIN and role separation.

### D. Admin Control Center (`apps/web-admin/`)
* **Technology**: Vite 6, React 19, TanStack Router, TanStack Table.
* **Architecture**: Platform-wide GMV oversight, KYC verification reviewer with SHA-256 OCR digest comparisons, refund authorization queue, supplier circuit-breaker toggles.
* **Security**: Strict zero-trust login screen with mandatory MFA; zero auto-login bypasses.

### E. Mobile Apps (`AGEN/`, `hotel/`, `app/`, `rider/`)
* **Technology**: React Native, Expo SDK 52, NativeWind / Tailwind.
* **Integrations**: Offline Ed25519 e-ticket verification using bundled public key; push notification handlers.

---

## 4. Multi-Tenant SaaS Control Plane

### A. Organization Hierarchy & Multi-Branch Tenancy
ShopnoJatra models organizational complexity through a three-tier hierarchy:
1. **Organization (Parent Entity)**: The legal enterprise holding company (e.g. "Heritage Travel Group").
2. **Tenants (Operational Units)**: Independent business operations under the parent (e.g. "Heritage Holidays Dhaka", "Heritage Inbound Cox's Bazar"). Each tenant has isolated financial balances, staff rosters, and booking ledgers.
3. **Branches / Desks**: Physical sales points or terminal locations with restricted agent access.

### B. Tenant Provisioning & Subscription Entitlements
* **Self-Service / Partner Onboarding**:
  1. Tenant registers profile & uploads trade license/TIN.
  2. KYC Review queue in `apps/web-admin` verifies document hashes.
  3. Tenant database record created with `status = 'active'`, plan assigned (`standard`, `professional`, `enterprise`).
* **Feature Flags & Entitlements Engine**:
  - Feature access is resolved dynamically based on active plan:
    - `white_label_domain`: Enterprise only.
    - `api_direct_gds`: Professional & Enterprise.
    - `sub_agent_roster`: All plans (tiered limits: Standard 5, Pro 25, Enterprise Unlimited).
    - `custom_markup_rules`: Professional & Enterprise.

---

## 5. Distributed System Reliability & Booking Sagas

```
[Customer Checkout] ──► [Lock Inventory (FOR UPDATE)]
                              │
                              ▼
                     [Create Outbox Event: 'booking.created']
                              │
                              ▼
                     [Initiate Payment Gateway (bKash/SSL)]
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
        [Payment Success]              [Payment Failed / Expired]
               │                             │
               ▼                             ▼
   [Transition: 'confirmed']     [Trigger Compensating Action]
   [Release Outbox: 'ticket.gen']│ • Unlock Room / Seats
   [Append Immutable Ledger]     │ • Transition: 'cancelled'
                                 │ • Record Audit Failure
```

### A. Booking Saga State Machine
* States: `draft` &rarr; `payment_pending` &rarr; `confirmed` &rarr; `completed` (or `cancelled`, `refunded`).
* Invariant: Inventory is locked atomically at `draft` with row-level locks (`SELECT ... FOR UPDATE`).
* Compensation: If payment fails or timeout expires (15 minutes), the saga issues a compensating transaction, unlocking inventory and alerting the customer.

### B. Transactional Outbox Pattern
* To prevent dual-write inconsistencies between PostgreSQL and Redis/Celery:
  1. Business entity updates and outbox event rows are written in the **exact same database transaction**.
  2. An asynchronous background poller reads unconsumed outbox events and publishes them to Celery/Redis.
  3. Events are acknowledged only after confirmed delivery.

### C. Double-Entry Immutable Ledger
* Every financial movement writes balanced debit and credit entries to `ledger_entries`.
* Accounts: `CUSTOMER_FUNDS_RECEIVABLE`, `GATEWAY_CLEARING`, `AGENCY_COMMISSION_PAYABLE`, `SUPPLIER_ESCROW`, `PLATFORM_REVENUE`.
* Invariant: $\sum \text{Debits} - \sum \text{Credits} = 0$.

---

## 6. Cell-Based Multi-Tenant Architecture & Migration Triggers

To eliminate global database bottlenecking as tenant count exceeds 1,000 agencies and 50,000 daily bookings:

```
                  ┌────────────────────────────────────────┐
                  │          Global Tenant Router          │
                  │   Resolves Tenant -> Cell via Metadata │
                  └───────────────────┬────────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            ▼                         ▼                         ▼
   ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
   │     Cell 01     │       │     Cell 02     │       │     Cell 03     │
   │  Tenants 0-500  │       │ Tenants 501-1000│       │ Large Enterprise│
   │  Postgres Cell  │       │  Postgres Cell  │       │ Dedicated Cell  │
   │  PgBouncer Pool │       │  PgBouncer Pool │       │  Dedicated Pool │
   └─────────────────┘       └─────────────────┘       └─────────────────┘
```

### Measurable Migration Triggers
Do NOT migrate to physical multi-cell infrastructure until any of the following triggers are met:
1. **Database Write IOPS**: PostgreSQL primary sustains >75% write IOPS capacity for 4 consecutive hours.
2. **Connection Pooling Saturation**: PgBouncer active client pool sustains >80% limit during non-surge periods.
3. **Database Disk Size**: Tenant operational data surpasses 1.5 TB on a single instance.
4. **Tenant Isolation SLA**: A Tier-1 enterprise partner contractually mandates physical dedicated database isolation.
