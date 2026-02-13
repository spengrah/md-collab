# Review System Composition Map (v0.2)

Status: active composition contract

## 1. Purpose
Define ownership boundaries and dependency order across backend/frontend review specs so implementation remains composable.

## 2. Ownership boundaries
1. **Storage contract (backend)**
   - `spec/backend/spec-for-comments-sidecar.md`
2. **Version/relevance state contract (backend)**
   - `spec/backend/spec-for-review-state-and-versioning.md`
3. **Anchor/reanchor algorithm (backend)**
   - `spec/backend/spec-for-anchor-model.md`
   - `spec/backend/spec-for-reanchoring-engine.md`
4. **Interaction/rendering contract (frontend)**
   - `spec/frontend/spec-for-review-interaction-model.md`
5. **Execution sequencing (frontend)**
   - `spec/frontend/pr-review-ux-implementation-checklist.md`

## 3. Dependency order (normative)
1. Sidecar schema+operations valid
2. Version/relevance fields available (additive)
3. Relevance evaluation pipeline active
4. Overlay + suggestion interactions enabled
5. Performance/accessibility hardening

## 4. Command-routing composition rule
All thread/suggestion mutations must route through canonical guarded command handlers:
- conflict prewrite checks
- deterministic serialization
- audit message append
No overlay/webview direct-write path is allowed.

## 5. Compatibility contract
1. v0.1 sidecars remain valid inputs.
2. v0.2 fields are additive and lazily materialized.
3. Unknown fields must round-trip unchanged.

## 6. Traceability hooks
Each v0.2 feature should map to:
1. one backend requirement/contract section,
2. one frontend interaction requirement,
3. one checklist item,
4. one acceptance test step.
