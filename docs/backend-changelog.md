# Backend Changelog

Tracks backend behavior changes relevant to regression governance (MDC-BE-012).

## 2026-02-12

### Re-anchoring algorithm / threshold baseline (recorded)
- Confirmed active defaults in `src/reanchor.ts`:
  - Search window `W = 600`
  - High-confidence threshold `T_high = 0.90`
  - Fuzzy-recovery threshold `T_low = 0.72`
- Confirmed context disambiguation tie-break delta guard remains `0.03`.
- No threshold change in this update; this entry establishes the explicit baseline for future deltas.

### Mutation identity guardrail hardening
- Enforced runtime author payload validation on **all** mutation operations:
  - `createThread`/`reply` use `author`
  - `editMessage` requires valid `editor`
  - `resolveThread`/`reopenThread` require valid `actor`
- Added coverage proving invalid or missing author payload fails with `AUTHOR_INVALID` across each mutation path.
