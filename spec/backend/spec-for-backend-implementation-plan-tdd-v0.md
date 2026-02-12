# spec-for-backend-implementation-plan-tdd-v0

Status: v0.1 draft

## Objective
Deliver backend correctness first (schema + anchoring) before UI-heavy extension work.

## Requirement IDs covered
- MDC-BE-012

## Workstreams
1. Sidecar schema + validator
2. Anchor model primitives
3. Re-anchoring engine
4. Fixture harness + regression suite
5. IO layer (atomic read/modify/write)

## Sequence (test-driven)
1. Lock schema contract tests (parse/serialize/validation).
2. Lock anchor hash normalization tests.
3. Add simple re-anchor fixtures (exact/nearby).
4. Add ambiguity and heavy-rewrite fixtures.
5. Implement reason codes and confidence mapping.
6. Add operation tests for create/reply/edit/resolve/reopen.

## Deliverables
1. `backend-core` TypeScript library module API.
2. Fixture corpus under `tests/fixtures/anchors/`.
3. CI test target for deterministic replay.
4. Backend changelog documenting behavior changes.

## Definition of done (backend v0.1)
1. All fixture classes implemented and passing.
2. Deterministic serializer stable under no-op rewrite.
3. Re-anchoring outputs reason code + confidence consistently.
4. Atomic writes and error handling covered by tests.
