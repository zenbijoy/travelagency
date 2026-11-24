# Maestro End-to-End (E2E) Test Suite

Automated deterministic end-to-end user journey testing for **Shopno Jatra (স্বপ্ন যাত্রা)**.  
Inspired by `mobile-dev-inc/maestro`.

## Available Test Flows:
1. `01_login_flow.yaml`: Phone authentication, OTP entry, and dashboard initialization.
2. `02_itinerary_clone_flow.yaml`: Itinerary marketplace browsing, 1-Click Clone, and AI budget optimization.
3. `03_flight_train_booking.yaml`: Transit search, seat selection, and multi-service checkout.
4. `04_offline_eticket.yaml`: E-ticket QR pass display and offline survival vault inspection.

## Running Tests Locally:

### Prerequisites:
Install Maestro CLI:
```bash
curl -FsSL "https://get.maestro.mobile.dev" | bash
```

### Run on Connected Android Device or Emulator:
```bash
maestro test .maestro/01_login_flow.yaml
maestro test .maestro/02_itinerary_clone_flow.yaml
maestro test .maestro/03_flight_train_booking.yaml
maestro test .maestro/04_offline_eticket.yaml
```

### Run Continuous Testing with Maestro Studio:
```bash
maestro studio
```

## Running in GitHub Actions CI:
Maestro flows can run headlessly in GitHub Actions using the official `mobile-dev-inc/action-maestro`.
