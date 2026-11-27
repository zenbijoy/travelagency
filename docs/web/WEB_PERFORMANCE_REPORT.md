# Web Performance Report

Audit date: 2026-11-27. No runtime profiling was performed.

## Source observations

- Public Next app has an ISR setting on the home route and uses Next Image for the hero. Route-wide caching, metadata quality, image behavior, and Core Web Vitals were not measured.
- Agency config sets TanStack Query defaults; source contains virtual table dependencies. Actual row counts and rendering cost were not profiled.
- Hotel/admin performance and bundle sizes were not measured.
- No Lighthouse, Web Vitals, bundle analyzer, network trace, or production build was run.

## Status

Performance targets are **not verified**. Capture production-like route traces and mobile/desktop Web Vitals before making performance claims. Avoid caching tenant-specific or authenticated data across users.
