# Backend Verification Checklist (v0.1)

Use before calling backend spec changes "ready".

## Workflow timing and ownership
1. **Pre-commit (author, manual):** run sections A and touched parts of B/C/D/E.
2. **Pre-merge (reviewer + CI):** all sections A–F must pass; CI evidence required for B/C/D/E/F items with tests.
3. **Pre-release tag (maintainer):** rerun full checklist, confirm regression baseline + changelog notes.

## A) Contract checks
- [ ] `requirements-index.md` updated for any new/changed requirement.
- [ ] Affected `spec-for-*` doc updated with explicit requirement IDs.
- [ ] Paired `guidance-for-*` updated (or no-change rationale documented).

## B) Schema + IO checks
- [ ] Sidecar schema validation passes for valid fixtures.
- [ ] Invalid fixtures fail with expected error classes.
- [ ] No-op read/write is byte-stable.
- [ ] Atomic write path tested (temp + rename behavior).

## C) Anchoring checks
- [ ] Anchor payload validation enforces required fields.
- [ ] Hash normalization is deterministic across runtimes.
- [ ] Re-anchoring reason codes emitted for every run.
- [ ] Confidence transitions persist correctly.

## D) Identity checks
- [ ] Author resolution order behaves as specified.
- [ ] `verified` semantics are respected (`true|false|null`).
- [ ] Writes are blocked when required author settings are missing.

## E) Fixture checks
- [ ] Required scenario classes all present.
- [ ] Ambiguous duplicate-quote case does not false-attach.
- [ ] Heavy rewrite case returns `broken` (unless high-signal recovery expected).

## F) Regression controls
- [ ] Baseline fixture outputs unchanged or explicitly reviewed.
- [ ] Changelog/notes include any threshold or algorithm changes.
- [ ] CI target for backend test suite passes.
