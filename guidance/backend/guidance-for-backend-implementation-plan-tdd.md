# guidance-for-backend-implementation-plan-tdd-v0

Status: v0.1 draft

## Intent
Provide a single operational playbook for sequencing backend delivery.

## Execution guidance
1. Do not start extension rendering work until sidecar schema + anchor fixtures are green.
2. Keep backend-core as a TypeScript library with explicit public API and pure-function reanchoring core where possible.
3. Treat fixture updates as product changes, not incidental test churn.
4. Require reviewer sign-off when thresholds or scoring logic change.

## Suggested sprint order
1. Schema parser/validator + deterministic serializer.
2. Anchor model utilities + hash normalization.
3. Reanchoring engine (exact, then disambiguation, then fuzzy).
4. Full fixture corpus + CI replay.
5. Writer operations and error-class wiring.

## Done criteria discipline
A task is not done unless:
1. tests pass,
2. requirement mapping is still accurate,
3. checklist items are satisfied for touched areas,
4. docs reflect behavior.
