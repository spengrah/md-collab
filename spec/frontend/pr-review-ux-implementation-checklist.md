# PR-Review UX Implementation Checklist (v0.2)

Status: ready to execute  
Depends on: v0.1 extension baseline + frontend v0.2 spec set

## P0 — Data model and relevance engine
- [ ] Add additive thread/message version-context fields per `../backend/spec-for-review-state-and-versioning.md`.
- [ ] Preserve v0.1 read compatibility and lazy-populate new fields.
- [ ] Add reason code enum plumbing and deterministic relevance evaluation pipeline.
- [ ] Add transition rules (`active/outdated/orphaned`) with explainable reason mapping.
- [ ] Add cache + invalidation triggers (save/sidecar change/head change/manual reload).

## P0 — Overlay UX baseline
- [ ] Add range highlight layer (status/relevance aware).
- [ ] Add inline signal layer (chip/codelens/inlay minimal set).
- [ ] Add gutter marker layer and tooltips.
- [ ] Ensure actions route through canonical command handlers.

## P1 — Suggestion workflow
- [ ] Define suggestion sidecar object + status machine.
- [ ] Implement propose/apply/reject/view-base commands.
- [ ] Enforce before-text hash checks and obsolete handling.
- [ ] Append audit messages for decision events.

## P1 — Navigation and accessibility
- [ ] Keyboard next/prev thread commands.
- [ ] Tooltip/text alternatives for all color states.
- [ ] Low-clutter mode toggle.

## P1 — Git hooks and historical context
- [ ] Add “view referenced content/version” command path.
- [ ] Surface commit/blob context in thread detail UI.
- [ ] Show outdated badges with commit-aware explanation.

## P2 — Performance hardening
- [ ] Avoid full-doc recompute on cursor movement.
- [ ] Add stress test fixtures for large markdown + high thread count.
- [ ] Verify responsiveness under Remote-SSH.

## Acceptance test checklist
- [ ] Thread can indicate “relevant to version A”.
- [ ] Thread can indicate “outdated since commit XYZ” with rationale.
- [ ] Overlay actions work without opening thread panel.
- [ ] Suggestion apply rejects stale before-text safely.
- [ ] All behavior works in local + Remote-SSH.
