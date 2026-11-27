# ShopnoJatra Security & Integrity Audit Report

**Date:** November 24, 2026  
**Scope:** Travel Platform Security, RBAC, Ledger Integrity, and Secrets Audit  
**Status:** Passed Verification  

---

## 1. Executive Summary

A comprehensive security audit of the ShopnoJatra travel platform was conducted across the React Native/Expo frontend, FastAPI backend services, Supabase database schemas, and integration boundaries. Special attention was paid to preventing the exposure of credentials, enforcing double-entry ledger immutability, ensuring idempotent financial operations, verifying webhook HMAC signatures, and strictly segregating multi-tenant data between consumer, agency, hotel, and admin boundaries.

---

## 2. Core Security Pillars

### 2.1 Role-Based Access Control (RBAC) & Command Execution
- **Admin Hierarchy:** Defined roles include `super_admin`, `finance_manager`, `support_lead`, `moderator`, and `operations_lead`.
- **Command Pattern Audit:** Administrative actions on sensitive entities (system settings, booking cancellations, payout batch approvals) execute via `executeAdminCommand()` which:
  1. Validates the administrator's permission mask before dispatch.
  2. Creates an immutable record in `admin_audit_logs` capturing `admin_id`, `action_type`, `payload`, `ip_address`, and timestamp.
  3. Reverts UI optimistic state immediately if permissions are denied.
- **Tenant Segregation:** The Agency Portal (`AGEN/`) uses `AgencyRBACContext` enforcing agency-level scoping (`agency_id`). The Hotel Portal (`hotel/`) uses `HotelRBACContext` scoping operations to property inventory. Cross-tenant leakage is prevented both via client context and PostgreSQL Row-Level Security (RLS) policies.

### 2.2 Financial Ledger Security & Double-Entry Accounting
- **No Floating-Point Arithmetic:** Financial calculations (commissions, payouts, bookings, refund adjustments) are strictly calculated and stored in **integer minor units (paisa)**. 1 BDT = 100 Paisa.
- **Ledger Invariance:** Payout batches reference immutable records in `ledger_entries` and `ledger_accounts`. Payout batches transition through a formal finite-state machine:
  `draft` -> `pending_approval` -> `approved` -> `processing` -> `paid` (or `rejected`).
- **Idempotency Keys:** Payout batch generation and payment webhook executions utilize UUIDv4 idempotency keys, preventing double-credit or replay vulnerabilities.

### 2.3 Payment Gateway Integration & Webhook Verification
- **HMAC Signatures:** All incoming payment webhooks (SSLCommerz, bKash, Nagad, Rocket, Upay) are verified against gateway-specific HMAC SHA256 signatures before processing order status changes.
- **Timing-Safe Equality:** Webhook signature comparisons employ timing-safe string comparison (`hmac.compare_digest`) in FastAPI backend endpoints to mitigate timing attack vectors.
- **Sandbox Event Replay Isolation:** The Webhook Inspector in `PaymentManagementScreen.tsx` clearly segregates live transactions from sandbox replay events and requires administrator privilege.

### 2.4 Ephemeral Presigned URLs & KYC Data Protection
- **Document Access Security:** Agency trade licenses, TIN certificates, and owner national ID documents are stored in Cloudflare R2 / S3 buckets configured with private access policies.
- **5-Minute Presigned GET URLs:** Document inspection in `AgencyKycReviewScreen.tsx` uses time-limited presigned GET URLs that expire in 300 seconds, preventing long-lived document leakages.
- **Masked Data:** National Identity Numbers (NID) and Bank Account numbers are masked in administrative table listings, displaying only the last 4 digits unless an authorized administrator explicitly expands the detail drawer.

### 2.5 Secrets Management & Environment Boundary
- **Zero Committed Secrets:** Confirmed no production secrets, private keys, service role keys, or database passwords are hardcoded in the repository.
- **Client Bundling Safety:** Sensitive credentials (`SUPABASE_SERVICE_ROLE_KEY`, payment gateway private merchant secrets, JWT signing private keys) are restricted to backend FastAPI services and are never prefixed with `EXPO_PUBLIC_`.
- **Safe Fallback Degradation:** Where external API credentials (such as production live bank disbursements) are not configured in local environments, the services safely transition to sandbox/mock modes with prominent UI indications rather than failing silently or pretending real financial settlement occurred.

---

## 3. Vulnerability Remediation Summary

| Component | Identified Vulnerability / Gap | Remediation Applied |
| :--- | :--- | :--- |
| `CommissionManagementScreen.tsx` | Mocked commission formula `ag.rating * 32000` | Replaced with real double-entry ledger queries and integer paisa precision. |
| `AdminSettingsScreen.tsx` | Pseudo-random API key generation via `Math.random()` | Replaced with authenticated cryptographic key creation and one-time display warning. |
| `BookingManagementScreen.tsx` | Direct cancellation without confirmation | Implemented destructive confirmation modal requiring cancellation reason. |
| `ReviewModerationScreen.tsx` | Absence of spam/abuse detection | Implemented rule-based risk evaluation scanning for spam patterns and profanity. |
| `ReportsScreen.tsx` | Static USD metrics and unwired export buttons | Converted to BDT ledger metrics and wired secure CSV/Excel and PDF generation. |
