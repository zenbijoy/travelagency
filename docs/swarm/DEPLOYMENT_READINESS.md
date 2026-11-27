# ShopnoJatra Deployment Readiness & Production Playbook

**Date:** November 24, 2026  
**Platform:** ShopnoJatra Travel Operations Platform  
**Target Architecture:** FastAPI (Python 3.12) + Supabase (PostgreSQL 15) + Expo / React Native Web  
**Readiness Level:** Production-Hardened (Ready for Staging & Production Deployment)  

---

## 1. System Integration Classification

To maintain complete transparency and prevent false claims of third-party live connectivity, the platform's capabilities are classified into three strict operational tiers:

### 1.1 IMPLEMENTED & VERIFIED (Production-Ready)
- **Multi-Vertical Booking Operations Hub:** Real-time filtering, 5-tab detail drawer, manifest export, cancellation confirmation modal, voucher reissuance, internal notes.
- **Double-Entry Financial Ledger & Commission Engine:** Integer paisa precision, batch creation, batch review & approval workflow, balance checks, ledger audit records.
- **Bangladesh Banking & MFS Exports:** Formatted BEFTN CSV export (16-column standard), bKash bulk disbursement CSV, and batch reconciliation summaries.
- **Payment Operations Center & Webhook Inspector:** Multi-gateway status checks, transaction ledger, webhook audit inspector with HMAC validation badges, and sandbox event replay.
- **Multi-Entity Review Moderation Queue:** Cross-entity review management (agencies, hotels, destinations, community reports), rule-based spam/profanity detection, and bulk moderation.
- **Multi-Channel Notification Dispatch:** Push (FCM), In-App, Email, SMS routing, recipient targeting, scheduling queue, and mobile device lockscreen preview.
- **Ed25519 Ticket & Voucher Verification:** Cryptographic QR signing and offline tamper verification.
- **Full Test Suite & Static Health:** 124 passing FastAPI backend tests, 337 passing Jest frontend tests, 0 TypeScript compilation errors.

### 1.2 BLOCKED BY EXTERNAL CONFIGURATION (Graceful Sandbox Fallbacks Implemented)
- **Live Bank BEFTN Automated Direct Clearing:** Requires corporate host-to-host VPN credentials with Bangladesh Bank / partner commercial bank.  
  *Fallback:* Generates valid, validated BEFTN 16-column batch CSV files for manual upload through corporate internet banking portal.
- **Live bKash B2C Bulk Merchant Disbursal API:** Requires live production bKash Merchant App Key, Secret, and IP whitelisting.  
  *Fallback:* Sandbox test mode and standardized bKash bulk disbursement CSV export format.
- **Live SMS Gateway (Teletalk / SSL Wireless / Greenweb):** Requires live Bangladesh DLT / MNO registered sender ID and SMS credit balance.  
  *Fallback:* Multi-channel notification center logs SMS payload to `notification_delivery_logs` and displays test preview.
- **Live Bangladesh Meteorological Department (BMD) Radar Uplink:** Requires government weather portal API credentials.  
  *Fallback:* Automated BMD warning feed parser with cached fallback datasets.

### 1.3 REMAINING FUTURE WORK (Post-Launch Enhancements)
- Native mobile hardware camera OCR scanning on physical Android/iOS devices (currently verified via React Native Camera mocks and Web file uploads).
- Native Bluetooth Low Energy (BLE) peripheral advertising for offline peer-to-peer mesh synchronization (currently verified via software event bus simulation in `offGridMeshService.ts`).

---

## 2. Environment Configuration Matrix

### 2.1 Backend Environment Variables (`backend/.env`)

```ini
# Application Core
PROJECT_NAME="ShopnoJatra Backend"
API_V1_STR="/api/v1"
SECRET_KEY="<generate-using-openssl-rand-hex-32>"
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Database & Supabase
DATABASE_URL="postgresql+asyncpg://postgres:<password>@<supabase-host>:5432/postgres"
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_ANON_KEY="<public-anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<private-service-role-key>"

# Payment Gateways (MFS & Card)
BKASH_APP_KEY="<bkash-app-key>"
BKASH_APP_SECRET="<bkash-app-secret>"
BKASH_USERNAME="<bkash-merchant-username>"
BKASH_PASSWORD="<bkash-merchant-password>"
BKASH_BASE_URL="https://tokenized.sandbox.bka.sh/v1.2.0-beta"

SSLCOMMERZ_STORE_ID="<sslcommerz-store-id>"
SSLCOMMERZ_STORE_PASSWD="<sslcommerz-store-password>"
SSLCOMMERZ_IS_SANDBOX=True

NAGAD_MERCHANT_ID="<nagad-merchant-id>"
NAGAD_PUBLIC_KEY="<nagad-public-key>"
NAGAD_PRIVATE_KEY="<nagad-private-key>"

# Storage (Cloudflare R2)
R2_ACCOUNT_ID="<cloudflare-account-id>"
R2_ACCESS_KEY_ID="<cloudflare-r2-access-key>"
R2_SECRET_ACCESS_KEY="<cloudflare-r2-secret-key>"
R2_BUCKET_NAME="shopnojatra-documents"
R2_ENDPOINT_URL="https://<account-id>.r2.cloudflarestorage.com"
```

### 2.2 Frontend Environment Variables (`.env`)

```ini
# Core API & Supabase
EXPO_PUBLIC_BACKEND_URL="http://localhost:8000"
EXPO_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
EXPO_PUBLIC_SUPABASE_ANON_KEY="<public-anon-key>"

# App Metadata
EXPO_PUBLIC_APP_ENV="staging"
EXPO_PUBLIC_SUPPORT_EMAIL="operations@shopnojatra.com"
EXPO_PUBLIC_SUPPORT_PHONE="+8801700000000"
```

---

## 3. Operational Execution Commands

### 3.1 Verification Commands
```powershell
# 1. Run TypeScript Compilation Check across entire repository
npm run typecheck

# 2. Run Complete Frontend Unit & Integration Tests (Jest)
npm test -- --watchAll=false

# 3. Run Complete Backend Tests (pytest)
backend\.venv\Scripts\pytest backend\tests -q
```

### 3.2 Development Server Startup
```powershell
# 1. Start FastAPI Backend Server
cd backend
.\.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 2. Start Expo Metro Bundler (in separate terminal)
npx expo start --web
```

---

## 4. Production Deployment Checklist

- [x] All 23 admin tabs routed and verified in `app/admin/[slug].tsx` and `AdminPortalShell.tsx`.
- [x] Double-entry ledger math enforces integer paisa precision across commissions and payouts.
- [x] Payment webhook listeners verify HMAC SHA256 signatures with constant-time comparison.
- [x] Ephemeral presigned URLs enforced for KYC document inspection (300-second TTL).
- [x] All 124 backend tests passing.
- [x] All 41 frontend test suites passing (337 unit tests).
- [x] Zero TypeScript compilation errors workspace-wide.
- [x] Zero committed secrets or credentials in codebase.
- [x] Destructive operational actions gated by confirmation modals and administrative RBAC.
