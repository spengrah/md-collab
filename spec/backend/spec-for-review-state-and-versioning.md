# spec-for-review-state-and-versioning

Status: draft v0.2  
Scope: unified backend contract for version-context fields and deterministic relevance state evaluation

## 1. Goal
Model review threads/messages as versioned artifacts and define deterministic rules for `active/outdated/orphaned` classification.

## 2. Additive sidecar model extensions
These fields are optional-but-preferred and additive to v0.1.

### 2.1 Thread-level version context
1. `thread_version_context.base_commit`
2. `thread_version_context.head_commit`
3. `thread_version_context.file_path_at_create`
4. `thread_version_context.base_blob_sha` (optional)
5. `thread_version_context.head_blob_sha` (optional)
6. `thread_version_context.anchor_at_create`

### 2.2 Thread relevance state envelope
1. `relevance_state`: `active | outdated | orphaned`
2. `relevance_reason` code (see §4)
3. `relevance_checked_at` (ISO-8601)
4. `relevance_checked_against_commit`

### 2.3 Message-level version context
1. `message_version_context.seen_head_commit`
2. `message_version_context.seen_blob_sha` (optional)

## 3. Backward compatibility
1. v0.1 sidecars remain readable and writable.
2. Extension/tooling may lazily populate v0.2 fields.
3. Missing version context must not block create/reply/resolve/reopen.

## 4. Relevance reason codes (minimum)
1. `CONTENT_CHANGED`
2. `ANCHOR_RELOCATED`
3. `ANCHOR_NOT_FOUND`
4. `FILE_RENAMED`
5. `FILE_DELETED`
6. `COMMIT_CONTEXT_UNAVAILABLE`

## 5. Deterministic relevance pipeline (normative order)
1. Direct anchor match in current file.
2. Reanchor attempt using core engine.
3. Git path continuity check (rename/deletion).
4. Version delta check (stored context vs current HEAD/blob).
5. Assign `relevance_state` + `relevance_reason` + check metadata.

## 6. Deterministic state rules
1. High-confidence direct/compatible match -> `active`.
2. Reanchored with material quote/content change -> `outdated`.
3. Removed/unrecoverable target -> `orphaned`.
4. Missing Git context -> conservative result + `COMMIT_CONTEXT_UNAVAILABLE` as needed.

## 7. State transitions
Allowed:
- `active -> outdated`
- `active -> orphaned`
- `outdated -> active`
- `orphaned -> outdated|active`

Resolve/reopen status remains orthogonal and must not be conflated with relevance.

## 8. Caching and invalidation
1. Cache relevance results by document + HEAD.
2. Invalidate on file save, sidecar change, HEAD change, manual reload.

## 9. User-facing outputs (required data contract)
1. Badge state token.
2. Reason code for deterministic UI mapping.
3. Referenced-version lookup metadata when available.

## 10. Acceptance criteria
1. Same input state yields same relevance result across runs.
2. Reason codes explain every outdated/orphaned assignment.
3. Existing v0.1 sidecars continue working without migration breakage.
