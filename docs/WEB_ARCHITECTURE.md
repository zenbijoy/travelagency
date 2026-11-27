# ShopnoJatra — Advanced Multi-Product Web Architecture Documentation

## 1. Executive Summary & Architecture Overview

The ShopnoJatra travel ecosystem has been transformed from mobile-first monolith applications into an enterprise-grade multi-product web platform. The platform is organized as an independent monorepo powered by `pnpm` workspaces, structured into **5 shared packages** and **4 independent commercial web products**, while strictly preserving the existing React Native / Expo mobile applications and FastAPI backend authoritative business logic.

```
                    ┌────────────────────────────────────────────────────────┐
                    │            ShopnoJatra Authoritative Backend            │
                    │         (FastAPI + PostgreSQL / Supabase + Redis)       │
                    └───────────────────────────▲────────────────────────────┘
                                                │ REST API / Bearer Token
                  ┌─────────────────────────────┴─────────────────────────────┐
                  │          @shopnojatra/api-client (OpenAPI Contract)        │
                  └──────┬───────────────┬───────────────┬──────────────┬─────┘
                         │               │               │              │
     ┌───────────────────┴───┐   ┌───────┴───────┐   ┌───┴──────────┐   └───┬─────────────┐
     │   apps/web-public     │   │apps/web-agency│   │apps/web-hotel│   │apps/web-admin   │
     │  Next.js 15 App Router│   │  Vite + React │   │ Vite + React │   │  Vite + React   │
     │   Customer Portal     │   │  Agency Portal│   │   Hotel PMS  │   │  Control Center │
     └───────────────────────┘   └───────────────┘   └──────────────┘   └─────────────────┘
```

---

## 2. Monorepo Structure

```
trevelagency/
├── pnpm-workspace.yaml          # Monorepo configuration mapping packages/* and apps/*
├── tsconfig.json                # Root TypeScript configuration with path aliases
│
├── packages/
│   ├── design-tokens/           # Brand color palettes, typography, spacing, Tailwind preset
│   ├── web-config/              # Shared tsconfig.base, vite.base, tailwind.base
│   ├── validation/              # Zod schemas (Auth, Booking, Hotel, Flights, KYC, Refunds)
│   ├── api-client/              # Typed TypeScript client generated from FastAPI OpenAPI 3.1
│   ├── design-system/           # Reusable accessible React primitives (Button, Modal, Table, etc.)
│   └── shared/                  # Existing mobile shared package (preserved)
│
├── apps/
│   ├── web-public/              # Next.js 15 App Router Customer Travel Website
│   ├── web-agency/              # Vite 6 + React 19 + TanStack B2B Travel Agency Portal
│   ├── web-hotel/               # Vite 6 + React 19 + TanStack Hotel Property Management System (PMS)
│   └── web-admin/               # Vite 6 + React 19 + TanStack Platform Admin Control Center
│
├── AGEN/                        # Existing Agency Mobile Expo App (preserved untouched)
├── hotel/                       # Existing Hotel Mobile Expo App (preserved untouched)
├── app/                         # Existing Traveler Mobile Expo App (preserved untouched)
└── backend/                     # Existing FastAPI backend (preserved untouched)
```

---

## 3. Web Products Specification

### A. Public Customer Website (`apps/web-public/`)
* **Stack**: Next.js 15.5 App Router, TypeScript, Tailwind CSS, Server Components by default.
* **Key Features**:
  * **Hero Search**: Multi-tab search for Flights, Hotels, Tours, and Destinations.
  * **Destinations Catalog & Detail**: Dynamic SSR/ISR routes (`/destinations`, `/destinations/[slug]`) with SEO metadata, structured OpenGraph cards, and JSON-LD schema.
  * **Hotels & Room Selection**: Real-time room inventory display (`/hotels`, `/hotels/[id]`) with amenity badges, guest capacity, and pricing.
  * **Curated Tours**: Detailed itinerary viewer (`/tours`, `/tours/[slug]`) with day-by-day guides.
  * **Flights Search**: Filter by airline (Biman Bangladesh, US-Bangla, Novoair), stops, and cabin classes.
  * **Fast Booking Modal**: Direct integration with `@shopnojatra/api-client` and `@shopnojatra/validation`.
  * **Commercial UX**: Full responsive layout (desktop, tablet, mobile), skeleton loaders, dark/light theme switching, accessible dialogs, and error boundaries.

### B. B2B Agency Portal (`apps/web-agency/`)
* **Stack**: Vite 6, React 19, TypeScript, TanStack Router, TanStack Query, TanStack Table, TanStack Virtual, React Hook Form + Zod, Tailwind CSS.
* **Key Features**:
  * **Executive Dashboard**: Live KPI cards (Bookings, Gross Volume, Net Commissions, Active Sub-Agents), revenue trajectory charts, and GDS service mix breakdown.
  * **Dense Bookings Table**: TanStack Virtual virtualization handling 600+ records with zero scroll jank, multi-column sorting, PNR/reference filtering, and booking drawer.
  * **Customer CRM**: Client list with corporate VIP tagging, booking history, lifetime value, and outstanding balance reconciliation.
  * **Commissions & Invoices**: Real-time ledger, payout withdrawal modal, and PDF invoice trigger.
  * **Staff Management**: Agent roster with role privileges (Owner, Manager, Agent, Finance) and invite modal.
  * **Agency Settings & KYC**: Document status review (Trade license, e-TIN, NID), bank account routing, and net markup controls.

### C. Hotel PMS (`apps/web-hotel/`)
* **Stack**: Vite 6, React 19, TypeScript, TanStack Router, TanStack Query, Tailwind CSS.
* **Key Features**:
  * **Operational Dashboard**: Circular occupancy rate gauge, today's arrivals with 1-click Express Check-In, today's departures with balance alerts.
  * **Room Inventory Matrix**: Interactive visual room grid by floor and category (Deluxe, Suite, Standard), room status toggling (Available, Occupied, Cleaning, Maintenance).
  * **Reservations Management**: Booking timeline, guest registration card with digital key passcode card, and itemized folio ledger (charges, 5% VAT, 10% service charge).
  * **Housekeeping Kanban**: 4-column board (Dirty -> Cleaning -> Inspection -> Ready) with attendant assignment and turnaround timers.
  * **Rate Plans & Yield Simulator**: Seasonal multipliers (Winter High Season +25%, Weekend Surge +15%) with dynamic ADR simulation.
  * **Revenue Reports**: Daily ADR, RevPAR, month-to-date gross volume, and channel distribution breakdown.

### D. Admin Control Center (`apps/web-admin/`)
* **Stack**: Vite 6, React 19, TypeScript, TanStack Router, TanStack Query, TanStack Table, Tailwind CSS.
* **Key Features**:
  * **Platform Command Center**: Total Gross Merchandise Value (GMV in BDT and USD), active agencies, verified hotels, total bookings, and SLA action banners.
  * **Multi-Tenant Oversight**: Agency approval queue, document-level KYC verification inspector with SHA-256 digests and AI OCR comparison, hotel property controls.
  * **Booking & Treasury Ledger**: Payment transaction monitoring across bKash, Nagad, Rocket, SSLCommerz, and Stripe with 1-click reconciliation.
  * **Disputes & Refunds**: SLA-prioritized refund queue with decision modals (Approve, Reject, Hold) requiring mandatory audit justifications.
  * **Zero-Trust RBAC & Audit Logs**: Immutable, cryptographically hashed audit trails filterable by actor, action, and module with full JSON payload drawers.
  * **Supplier Monitoring**: Real-time latency, error rates, and 24h uptime for Airlines, GDS APIs, and Payment Gateways with interactive circuit-breaker toggles.

---

## 4. Shared Web Foundation (`packages/`)

1. **`@shopnojatra/design-tokens`**:
   * Brand Color Palettes: Maritime Navy (`#020b14`), Bengal Emerald (`#059669`), Golden Sunset (`#f59e0b`), Slate.
   * Semantic Tokens: CSS variables with smooth light/dark switching.
   * Tailwind CSS preset for standard typography, borders, shadows, and radii.

2. **`@shopnojatra/web-config`**:
   * `tsconfig.base.json`: Modern strict TypeScript configuration with ES2022 and bundler resolution.
   * `vite.base.ts`: Standardized Vite build settings with vendor chunking.
   * `tailwind.base.js`: Base Tailwind preset integration.

3. **`@shopnojatra/validation`**:
   * Zod schemas for Auth, Bookings, Flights, Hotels, Agency KYC, and Refunds matching backend requirements.

4. **`@shopnojatra/api-client`**:
   * Pure TypeScript HTTP client derived from FastAPI `docs/openapi.json`.
   * Automatic Bearer JWT injection, query parameter serialization, and structured `ApiClientError` handling.
   * Zero duplicate client-side pricing or booking calculation logic.

5. **`@shopnojatra/design-system`**:
   * Radix-inspired accessible primitives: `Button`, `Input`, `Card`, `Badge`, `Modal`, `Table`, `Skeleton`, `Dropdown`, `Avatar`, `Tabs`, `StatCard`, `Toast`, and `ErrorBoundary`.

---

## 5. Verification & Build Commands

All packages and applications compile and build with zero errors:

```bash
# Typecheck shared packages
pnpm --filter @shopnojatra/design-tokens run typecheck
pnpm --filter @shopnojatra/validation run typecheck
pnpm --filter @shopnojatra/api-client run typecheck
pnpm --filter @shopnojatra/design-system run typecheck

# Build web applications
pnpm --filter @shopnojatra/web-agency run build
pnpm --filter @shopnojatra/web-hotel run build
pnpm --filter @shopnojatra/web-admin run build
pnpm --filter @shopnojatra/web-public run build

# Run unit tests
pnpm --filter @shopnojatra/web-public run test
```
