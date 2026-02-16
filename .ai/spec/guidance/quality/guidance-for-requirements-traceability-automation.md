# guidance-for-requirements-traceability-automation

## Intent
Keep requirement coverage explicit and continuously visible as specs evolve.

## Guidance
1. Prefer stable test IDs and explicit requirement tags in tests.
2. Keep parser logic strict for requirement table format drift.
3. Treat stale mappings as failures to avoid false confidence.
4. Include clear waiver mechanism for intentional partial coverage.

## Anti-patterns
1. Manual, ad-hoc coverage spreadsheets outside repo.
2. Mapping tests by fuzzy filename only.
3. Passing traceability checks when parser encounters unknown schema/format.
