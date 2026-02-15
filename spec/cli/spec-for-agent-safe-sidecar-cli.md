# spec-for-agent-safe-sidecar-cli

Status: draft v0.1  
Scope: safe, agent-oriented CLI for md-collab sidecar operations (no raw JSON mutation)

## 1) Objective
Provide a single CLI surface that enforces validated, deterministic, conflict-aware sidecar changes so agents never directly edit `*.comments.json`.

Primary constraint: **all mutations must route through md-collab core operation functions + guarded file I/O**.

---

## 2) CLI package shape
Proposed binary: `md-collab` (or `mdc` alias)

Command family:
- `md-collab inspect status`
- `md-collab comment add`
- `md-collab comment reply`
- `md-collab thread resolve`
- `md-collab thread reopen`
- `md-collab thread reanchor`
- `md-collab thread refresh-relevance`
- `md-collab suggestion propose`
- `md-collab suggestion apply`
- `md-collab suggestion reject`
- `md-collab validate sidecar`

Global flags:
- `--json` machine-readable output
- `--dry-run` compute/validate only; no write
- `--sidecar <path>` explicit sidecar path (default from `--doc` via pairing)
- `--doc <path/to/file.md>` source markdown path
- `--expect-rev <token>` optimistic conflict token
- `--audit [none|stdout|file]`
- `--audit-file <path>` (when `--audit=file`)

---

## 3) Safety model (normative)

### 3.1 Schema validation
- Parse/read via `readSidecarFile` / `parseSidecar`.
- Validate post-mutation before any write.
- `validate sidecar` must support:
  - file-only schema validation
  - optional strict checks (`--strict`) for cross-field invariants.

### 3.2 Revision/token conflict checks
- Define revision token as deterministic hash of current bytes (e.g. `sha256:<file-bytes>`).
- `inspect status` returns token.
- Mutating commands accept `--expect-rev`; mismatch => conflict error and no write.
- If absent, allow best-effort write (MVP) but report `conflict_check: skipped`.

### 3.3 Deterministic write / atomicity
- Serialize with `serializeDeterministic`.
- Persist with `writeSidecarFileAtomic` (temp + fsync + rename + re-read sanity).
- Must not partially write or emit non-deterministic key order.

### 3.4 Suggestion apply preflight
Before `suggestion apply`, CLI must:
1. Verify thread/suggestion exists and is `proposed`.
2. Verify target text hash matches `before_text_hash`.
3. Validate anchor applicability to current doc slice.
4. Return explicit preflight plan (replacement range/hash) in `--json`.
5. Refuse apply on mismatch unless explicit future override flag (`--force-obsolete`, P2).

### 3.5 Audit trail output
Each mutation returns/records:
- op id, op type, timestamp
- actor id/label
- sidecar path
- input ids (thread/message/suggestion)
- rev before / rev after
- dry-run boolean
- outcome status + error code (if any)

Audit output is append-only NDJSON when file mode is used.

---

## 4) Command contracts

## 4.1 `inspect status`
Purpose: non-mutating status snapshot.

Inputs:
- `--doc` or `--sidecar`
- optional filters (`--thread-id`, `--open-only`, `--resolved-only`)

Outputs (`--json`):
- sidecar metadata (schema version, path)
- revision token
- thread counts by status/relevance
- per-thread summary (id, status, relevance, updated_at)

## 4.2 `comment add`
Maps to: `createThread()`.

Required inputs:
- doc path + selection offsets (`--start`, `--end`) or future span format
- `--body`
- actor (`--author-id`, `--author-label`, `--author-verified`)

Behavior:
- read doc text
- read+validate sidecar
- apply createThread
- validate result
- atomic write unless dry-run

## 4.3 `comment reply`
Maps to: `reply()`.

Required:
- `--thread-id`
- `--body`
- actor fields

## 4.4 `thread resolve` / `thread reopen`
Maps to: `resolveThread()` / `reopenThread()`.

Required:
- `--thread-id`
- actor fields

## 4.5 `thread reanchor`
Maps to: `reanchor()` + `applyReanchor()`.

Required:
- `--thread-id`
- current doc text source

Output includes reason code/confidence/reanchored.

## 4.6 `thread refresh-relevance`
Maps to: `evaluateThreadRelevance()` / `evaluateSidecarRelevance()`.

Required:
- relevance context flags (`--timeline-kind`, workspace/git fields)

## 4.7 `suggestion propose`
Maps to: `proposeSuggestion()`.

Required:
- `--thread-id`
- anchor range / anchor payload
- `--replacement-text`
- `--before-text-hash` or computed hash option
- actor fields

## 4.8 `suggestion apply`
Maps to: `applySuggestion()` after preflight.

Required:
- `--thread-id`
- `--suggestion-id`
- actor fields
- doc text context for hash check

Behavior:
- preflight hash + anchor checks
- call applySuggestion with `beforeText`
- if hash mismatch, status becomes `obsolete` (current core behavior)

## 4.9 `suggestion reject`
Maps to: `rejectSuggestion()`.

Required:
- thread id + suggestion id + actor

## 4.10 `validate sidecar`
Maps to: `parseSidecar()` / `validateSidecar()`.

Outputs:
- valid boolean
- errors[] with JSON pointer if available

---

## 5) Agent-oriented UX contract

## 5.1 `--json` schema (stable top-level)
All commands return:
```json
{
  "ok": true,
  "command": "comment add",
  "code": "OK",
  "data": {},
  "audit": {}
}
```

Error shape:
```json
{
  "ok": false,
  "command": "suggestion apply",
  "code": "WRITE_CONFLICT",
  "message": "expected rev does not match",
  "details": {}
}
```

## 5.2 Stable exit codes
- `0` success
- `2` validation/schema failure (`SCHEMA_INVALID`, `ANCHOR_INVALID`, bad args)
- `3` not found (`THREAD_NOT_FOUND`, `MESSAGE_NOT_FOUND`, `SUGGESTION_NOT_FOUND`)
- `4` conflict (`WRITE_CONFLICT`, rev mismatch, id collision)
- `5` preflight blocked (apply suggestion safety checks)
- `10` internal/unexpected

## 5.3 Dry-run mode
- Executes full read/validate/mutate/preflight pipeline.
- Emits predicted `rev_after` and diff summary.
- Never writes sidecar.
- Exit code semantics unchanged.

## 5.4 Idempotency
- `resolve` on resolved thread should be no-op success with `changed=false`.
- `reopen` on open thread same behavior.
- `suggestion reject` on already rejected suggestion: no-op success (recommended P1).
- `comment add`/`reply` are non-idempotent by default (new IDs); add optional client op id (`--op-id`) in P2 dedupe layer.

---

## 6) Mapping to existing md-collab core and gaps

| CLI command | Existing function/file | Coverage | Gap |
|---|---|---|---|
| inspect status | `readSidecarFile` (`src/sidecar-file.ts`) | partial | needs status aggregator + rev token helper |
| comment add | `createThread` (`src/operations.ts`) | strong | CLI arg translation + doc read wrapper |
| comment reply | `reply` | strong | wrapper only |
| thread resolve/reopen | `resolveThread` / `reopenThread` | strong | wrapper + idempotent response contract |
| thread reanchor | `reanchor`, `applyReanchor` | strong | command orchestration |
| thread refresh-relevance | `evaluateThreadRelevance`, `evaluateSidecarRelevance` | strong | context collection helper |
| suggestion propose | `proposeSuggestion` | strong | before hash computation helper |
| suggestion apply | `applySuggestion` | medium | explicit preflight command/report missing |
| suggestion reject | `rejectSuggestion` | strong | idempotent policy choice |
| validate sidecar | `parseSidecar`, `validateSidecar` | strong | structured error format |
| all mutating writes | `writeSidecarFileAtomic` + deterministic serializer | strong | optimistic rev check not yet implemented |
| conflict tokens | none | missing | add file rev hashing + compare gate |
| audit sink | partial (audit message in-thread only) | missing | CLI-level NDJSON audit log |

---

## 7) Phased implementation plan

## P0 (must-have safe mutation shell)
- Build CLI scaffold + command parsing.
- Implement inspect/add/reply/resolve/reopen/validate.
- Use schema validation + deterministic atomic writes everywhere.
- Add `--json`, `--dry-run`, stable exit codes.

## P1 (safety hardening + relevance/suggestions)
- Add rev token generation + `--expect-rev` gate.
- Add reanchor + refresh-relevance + suggestion propose/apply/reject.
- Implement suggestion apply preflight report.
- Add audit trail output (stdout/file NDJSON).

## P2 (agent robustness)
- Idempotency keys (`--op-id`) for create/reply dedupe.
- Optional strict invariant checks and repair hints.
- Force/override policy flags with explicit risk acknowledgement.
- Batch mode with transactional-per-file semantics.

---

## 8) Mistake surface analysis

Top failure modes and mitigations:
1. **Raw file edits bypassing invariants**  
   Mitigation: document/CI policy: all writes through CLI only.
2. **Lost update from concurrent writers**  
   Mitigation: rev token optimistic checks; surface conflict exit code 4.
3. **Suggestion apply against stale text**  
   Mitigation: mandatory preflight hash/anchor check; block with exit 5.
4. **Non-deterministic output causes noisy diffs**  
   Mitigation: serializer + atomic writer only.
5. **Ambiguous agent error handling**  
   Mitigation: stable JSON envelope + exit code map.
6. **Incomplete relevance context**  
   Mitigation: explicit context flags + conservative reason codes.
7. **Audit blind spots**  
   Mitigation: required op-level audit envelope for every mutation.

---

## 9) Recommended file additions
- `src/cli/` command handlers + shared guards
- `src/cli/revision.ts` (rev token helper)
- `src/cli/audit.ts` (NDJSON sink)
- `src/cli/preflight.ts` (suggestion apply checks)
- `spec/cli/` and `guidance/cli/` docs (this set)

This approach keeps core logic in existing backend modules and places policy/UX guarantees in a thin CLI orchestration layer.
