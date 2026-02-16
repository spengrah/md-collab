# Recommendation summary for Spencer: safe agent CLI for md-collab sidecars

## Recommendation
Adopt a dedicated `md-collab` CLI as the **only write path** for sidecars, with guarded operations and machine-readable behavior for agents.

## Why this is the right move now
- Existing backend already has strong operation primitives (create/reply/resolve/reopen/reanchor/relevance/suggestions).
- We can get high safety quickly by adding a thin CLI orchestration layer instead of new storage logic.
- This prevents fragile raw JSON edits by agents and improves repeatability.

## What to build first (P0)
1. Commands: `inspect status`, `comment add`, `comment reply`, `thread resolve`, `thread reopen`, `validate sidecar`.
2. Guarantees: schema validation + deterministic serialization + atomic writes.
3. Agent UX: `--json`, stable exit codes, `--dry-run`.

## Safety hardening next (P1)
1. Add revision token checks (`--expect-rev`) to prevent silent lost updates.
2. Add suggestion/reanchor/relevance commands.
3. Add mandatory preflight for `suggestion apply`.
4. Add audit trail envelopes (stdout/file NDJSON).

## Biggest current gaps
- No optimistic revision conflict guard yet.
- No explicit CLI preflight layer for suggestion apply.
- No standardized audit output format for agents.

## Main risk to watch
Concurrent writes are currently the largest mistake surface. Atomic writes protect file integrity but not logical lost updates; revision tokens should be prioritized early.

## Deliverables produced
- Normative spec: `spec/cli/spec-for-agent-safe-sidecar-cli.md`
- Implementation guidance: `guidance/cli/guidance-for-agent-safe-sidecar-cli.md`
- This summary: `docs/recommendations/recommendation-summary-for-spencer-agent-safe-cli.md`
