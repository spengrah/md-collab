# Fixture Baseline Governance (Backend)

Purpose: make fixture-output drift explicit and reviewable (MDC-BE-012).

## Rules
1. Treat current passing outputs from `tests/backend/reanchor-fixtures.test.ts` as the baseline.
2. Any fixture output change must be accompanied by:
   - a changelog entry in `docs/backend-changelog.md` describing why,
   - updated expectation(s) in tests, and
   - reviewer acknowledgement in PR notes.
3. Threshold or scoring adjustments (`W`, `T_high`, `T_low`, tie-break logic) require explicit before/after impact notes.
4. If output changes are unintended, revert and investigate before merge.

## Verification hook
- Run `npm test` locally and in CI (`.github/workflows/backend-tests.yml`).
- Ensure fixture tests remain deterministic and passing before merge/release.
