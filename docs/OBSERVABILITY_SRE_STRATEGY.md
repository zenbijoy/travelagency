# ShopnoJatra — Observability & SRE Strategy

**Production Telemetry, Distributed Tracing, SLI/SLO Engineering & Alerting**  
**Phase 7: Autonomous Enterprise Platform Transformation**  
**Status**: APPROVED SRE BASELINE  
**Target Availability**: 99.9% (Tier 1 APIs), 99.95% (Payment Webhooks)  
**Author**: CTO & Principal Enterprise Architect (Antigravity Orchestrator)

---

## 1. SRE Core Principles & Pragmatic Reliability Targets

Rather than asserting unrealistic "100% uptime", ShopnoJatra establishes measurable, contractually grounded Service Level Indicators (SLIs) and Service Level Objectives (SLOs), protected by managed error budgets.

### Core Principles
1. **Error Budgets Govern Release Velocity**: If the monthly error budget is depleted (>43 minutes of customer-impacting degradation in 30 days), feature releases halt; engineering focuses exclusively on stability, testing, and performance.
2. **Correlation Context Propagation**: Every transaction carries an immutable `correlation_id` across client browser, FastAPI router, SQLAlchemy async queries, Redis caches, and Celery outbox tasks.
3. **Graceful Supplier Degradation**: Third-party airline GDS (Amadeus, Sabre) and local mobile financial service (MFS) gateways are assumed to fail unpredictably. Automatic circuit breakers isolate flaky suppliers, falling back to cached quotes or secondary aggregators.

---

## 2. Service Level Objectives (SLOs) & Service Level Indicators (SLIs)

| Service Domain | Service Level Indicator (SLI) | Service Level Objective (SLO) | Monthly Error Budget | Measurement Window |
| :--- | :--- | :--- | :--- | :--- |
| **Search APIs** (`/api/v1/flights/search`, `/api/v1/hotels/search`) | Proportion of successful search requests (HTTP 200) with latency < 1,200ms | **99.9%** availability; P95 < 650ms, P99 < 1,500ms | 43.8 minutes / month | 30-day rolling window |
| **Atomic Booking Engine** (`/api/v1/bookings`) | Proportion of booking creation attempts returning 201 or clean 409 Conflict without 5xx errors | **99.95%** availability; P95 < 850ms, P99 < 2,000ms | 21.9 minutes / month | 30-day rolling window |
| **Payment Webhooks** (`/api/v1/payments/webhook/*`) | Proportion of valid payment gateway callback events ingested, verified, and reconciled without drop | **99.99%** ingestion success; P95 < 400ms | 4.3 minutes / month | 30-day rolling window |
| **Agency B2B Portal APIs** (`/api/v1/agency/*`) | Availability of agency booking table and ledger retrieval endpoints | **99.9%** availability; P95 < 500ms | 43.8 minutes / month | 30-day rolling window |
| **Hotel PMS Operations** (`/api/v1/hotel-pms/*`) | Availability of room matrix, arrival lists, and check-in status mutations | **99.9%** availability; P95 < 450ms | 43.8 minutes / month | 30-day rolling window |
| **E-Ticket Voucher Generation** (`/api/v1/bookings/{id}/ticket`) | Successful synchronous PDF voucher rendering or presigned retrieval | **99.5%** rendering success; P95 < 2,500ms | 3.65 hours / month | 30-day rolling window |

---

## 3. OpenTelemetry Distributed Tracing & Structured Logs

```
Client (Browser / Mobile)
   │ (Header: traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01)
   ▼
[FastAPI Gateway Middleware] ─── Logs JSON: {"correlation_id": "...", "tenant_id": "..."}
   │
   ├─► [Span 1: Auth & Tenant Resolution] (Duration: 8ms)
   ├─► [Span 2: Redis Distributed Lock]   (Duration: 4ms)
   ├─► [Span 3: PostgreSQL FOR UPDATE]    (Duration: 18ms)
   └─► [Span 4: Outbox Event Enqueue]     (Duration: 6ms)
```

### A. W3C Trace Context Propagation
* Standard headers (`traceparent`, `tracestate`) are injected by `@shopnojatra/api-client` and propagated across all asynchronous execution contexts.
* Spans record database queries, Redis cache lookups, and third-party supplier HTTP requests.

### B. Standardized Structured JSON Log Format
All backend loggers emit machine-parsable JSON lines to `stdout`:
```json
{
  "timestamp": "2026-11-27T18:42:01.124Z",
  "level": "INFO",
  "service": "shopnojatra-backend",
  "correlation_id": "db8986ad-15a7-4809-99ba-814ec2630fa4",
  "tenant_id": "8f1a23c4-d5e6-7890-abcd-1234567890ab",
  "user_id": "usr-00124",
  "method": "POST",
  "path": "/api/v1/bookings",
  "status_code": 201,
  "duration_ms": 142.6,
  "db_query_count": 4,
  "db_duration_ms": 38.2
}
```

---

## 4. Platform Metrics & SRE Dashboards

1. **RED Metrics (Rate, Errors, Duration)**:
   - Request throughput (RPS) segmented by product channel (`web-public`, `web-agency`, `web-hotel`, `mobile`).
   - HTTP 4xx (client errors) vs. HTTP 5xx (server faults).
   - P50, P90, P95, and P99 latency heatmaps.
2. **Third-Party Supplier Health**:
   - Outbound latency and error rates for GDS APIs (Biman, US-Bangla, Novoair, Sabre).
   - Automated Circuit Breakers: If supplier error rate exceeds 30% over 5 minutes, state flips to `OPEN`; traffic bypasses dead supplier for 60 seconds before half-open probe.
3. **Database & Infrastructure Telemetry**:
   - PostgreSQL active connections vs. PgBouncer pool limits (Alert at >80%).
   - Transaction lock wait time (Alert at >500ms).
   - Slow Query Log: All queries exceeding 250ms logged with execution plan.
   - Redis Memory Utilization & Eviction Rate (Alert at >85% capacity).
   - Celery Task Queue Lag & Dead Letter Queue (DLQ) depth (Alert if DLQ > 0).

---

## 5. Incident Response & Escalation Matrix

| Severity | Definition | Response SLA | Primary Responder | Communication Channel | Escalation Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P0 (Critical)** | Complete platform outage, payment processing halted, or booking creation failure impacting multiple tenants. | **< 15 minutes** | On-Call Lead SRE & Lead Backend Engineer | Slack `#incident-war-room`, Voice Pager | CTO & VP of Engineering |
| **P1 (Major)** | Major feature failure (e.g. Flight search unavailable, bKash webhook dropping), or single large tenant blocked. | **< 30 minutes** | Component Lead (Cline / Copilot / Kilo Code) | Slack `#incident-p1` | Lead SRE |
| **P2 (Minor)** | Degraded non-blocking component (e.g. PDF voucher delay, analytics metrics lag), workaround available. | **< 4 hours** | Assigned Subsystem Engineer | Engineering Jira / Github Issues | Engineering Manager |
| **P3 (Low)** | UI cosmetic defects, minor admin table sorting issues, non-impacting telemetry gaps. | Next Business Day | Subsystem Team | Backlog Sprint Planning | Product Lead |
