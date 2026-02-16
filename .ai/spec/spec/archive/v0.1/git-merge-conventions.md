# Git Merge Conventions for Comments Sidecar (v0)

Project: md-collab  
Date: 2026-02-12  
Status: Draft

## 1) Purpose
Define conventions that keep `*.comments.json` mergeable, auditable, and repairable in normal Git workflows.

For MVP, this project may run in a **single-workspace mode** where sidecar files are intentionally **gitignored** and not synced across environments. In that mode, merge policy is deferred and only local consistency rules apply.

## 2) File conventions
1. One sidecar per markdown file: `doc.md` ↔ `doc.comments.json`.
2. JSON encoded UTF-8, newline `\n`.
3. Deterministic key ordering for stable diffs.
4. ISO-8601 UTC timestamps.
5. **MVP default:** sidecar may be excluded from Git tracking via `.gitignore`.

## 3) Data-shape conventions to reduce conflicts
1. Stable IDs for threads/messages (`thread_id`, `message_id`).
2. Append-only message arrays per thread (except explicit edit/delete operations).
3. Prefer status updates on thread object over destructive edits.
4. Avoid rewriting unrelated thread objects during single-thread operations.

## 4) Writer behavior (extension/agent)
1. Read-latest before write.
2. Apply minimal patch (touch only required nodes).
3. Atomic write (temp file + fsync + rename where available).
4. Preserve unknown fields for forward compatibility.

## 5) Merge strategy guidance

### 5.0 Applicability
- If sidecar is gitignored (MVP single-workspace mode), this section is informational for future multi-environment rollout.
- If sidecar is tracked, apply rules below.

### 5.1 Git config recommendation
Use a custom merge driver for sidecar files where possible (later task), otherwise JSON-aware merge tooling in CI/hooks.

### 5.2 Conflict resolution rules
When conflicts occur, resolve by rule order:
1. **Thread existence:** keep union of unique `thread_id`s.
2. **Message existence:** keep union of unique `message_id`s within each thread.
3. **Thread status (`open/resolved`):** prefer most recent `updated_at`.
4. **Edits to same message body:** prefer most recent `edited_at`, retain losing version in `conflict_note` if needed.
5. **Anchor differences:** keep newer anchor but preserve previous anchor in `anchor_history` (bounded list).

### 5.3 Never do during merge
1. Drop entire thread due to local conflict unless both sides explicitly deleted it.
2. Rewrite IDs.
3. Silently discard messages with unique IDs.

## 6) Conflict markers handling
If raw Git conflict markers appear in sidecar:
1. Treat file as invalid until resolved.
2. Extension enters read-only warning mode for comments on that doc.
3. Provide “open merge repair guide” action.

## 7) Recommended repair workflow
1. Run JSON conflict repair tool/script (future task).
2. Validate with schema checker.
3. Recompute/revalidate anchors.
4. Commit with message prefix: `md-collab: merge-repair`.

## 8) CI/lint recommendations (future)
1. JSON schema validation.
2. Duplicate ID detection.
3. Timestamp monotonicity checks.
4. Orphan message/thread checks.

## 9) Example canonical ordering (top-level)
1. `schema_version`
2. `document`
3. `threads`

Within thread:
1. `thread_id`
2. `status`
3. `anchor`
4. `author`
5. `messages`
6. `created_at`
7. `updated_at`

## 10) Open questions
1. Do we enforce merge driver via repo config or keep optional?
2. Should message edits be immutable events instead of in-place body edits?
3. Should `anchor_history` be mandatory in v0 or deferred to v1?
