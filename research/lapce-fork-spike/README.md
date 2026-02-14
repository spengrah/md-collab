# Lapce fork spike artifacts (initial execution pass)

This directory contains isolated artifacts for the 2-week fork spike.

## Isolation
- Upstream Lapce clone (read-only inspection + prototype touchpoint mapping):
  - `lapce-upstream/` (cloned with `--depth 1`)
- Prototype concept code and runnable harness:
  - `prototype/thread-vertical-slice.mjs`
  - `prototype/sample.comments.json`
- Findings and gate status:
  - `spike-report-initial-pass-2026-02-14.md`

## Notes
- No attempt was made to check in the Lapce clone as a git submodule in `md-collab`.
- This pass targets feasibility proof and blocker capture, not production UI polish.
