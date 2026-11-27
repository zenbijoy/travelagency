# Web Security Audit

Audit date: 2026-11-27. This is a limited source review, not a penetration test or certification.

## Findings

- **Critical readiness blocker:** hotel demo auth constructs identity, role, and hotel ID locally. Do not expose operational data/actions in production until backed by server-issued identity and server authorization.
- **Critical readiness blocker:** agency/admin service data and privileged mutations are local demo stores. Client UI checks do not provide authorization.
- **High integrity issue:** admin audit helper produces a short custom integer hash while naming it `sha256_`; it is not cryptographic or tamper-evident. Remove this claim and use server-managed append-only audit records with a cryptographic design.
- **High commerce blocker:** public booking API rejects checkout until quote validation and persisted-amount payment contracts exist; keep it disabled.
- **Positive control:** public login delegates password sign-in to the configured Supabase client; server/middleware cookie enforcement was not verified.
- **Positive accessibility change:** shared modal now exposes title and description associations and restores focus. Focus trapping remains unimplemented.

## Not verified

No live endpoint authorization, tenant-isolation, secret exposure, CSRF, rate-limiting, webhook signature, dependency vulnerability, or deployment configuration testing was performed.
