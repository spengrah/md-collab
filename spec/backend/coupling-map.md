# Coupling Map: spec-for-* ↔ guidance-for-* (v0.1)

This file mirrors the spec/guidance pairing style from the assurances pattern.

| Spec (normative) | Guidance (implementation) | Coupling intent |
|---|---|---|
| `spec-for-comments-sidecar.md` | `../../guidance/backend/guidance-for-comments-sidecar.md` | deterministic schema + safe write behavior |
| `spec-for-anchor-model.md` | `../../guidance/backend/guidance-for-anchor-model.md` | robust anchor payload creation |
| `spec-for-reanchoring-engine.md` | `../../guidance/backend/guidance-for-reanchoring-engine.md` | conservative, trust-preserving reattachment |
| `spec-for-anchor-test-fixtures.md` | `../../guidance/backend/guidance-for-anchor-test-fixtures.md` | fixture discipline + TDD workflow |
| `spec-for-backend-implementation-plan-tdd.md` | `../../guidance/backend/guidance-for-backend-implementation-plan-tdd.md` | delivery sequencing + regression control |
| `spec-for-author-identity.md` | `../../guidance/backend/guidance-for-author-identity.md` | deterministic identity + verification semantics |

## Coupling rule
A spec change should either:
1. require no implementation-behavior guidance change (explicitly noted), or
2. include a paired guidance update in the same commit.

## No-change rationale references
- 2026-02-12 checklist/process-only update: `./no-guidance-change-rationale.md`.
