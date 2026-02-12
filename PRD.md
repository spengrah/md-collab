# md-collab — Product Requirements Document

Status: **Locked v0.1**  
Owners: Spencer + Lyle  
Date: 2026-02-12

## 1) Executive summary

md-collab adds inline comment threads to Markdown documents while keeping canonical content in `.md` files.

For v0.1, we will:
1. Build a **VS Code extension** as the frontend.
2. Use a **JSON sidecar** (`*.comments.json`) as the comments backend.
3. Ship in **single-workspace mode** (sidecars gitignored by default), optimized for SSH collaboration directly in the agent workspace.

## 2) Problem statement

We want Google-Docs-style review ergonomics without abandoning local files, Markdown-first workflows, or agent-readable data.

Key pain points:
1. SaaS editors are often upload-first and custody-first.
2. Markdown often gets transformed or polluted by review metadata.
3. Anchor drift under edits breaks comment trust.
4. Identity attribution can be ambiguous in shared/remote workflows.

## 3) Goals and non-goals

### 3.1 Goals (v0.1)
1. Canonical source remains plain `.md`.
2. Users can create/reply/resolve/reopen inline comment threads.
3. Comment state is stored in deterministic sidecar JSON.
4. Re-anchoring behavior is deterministic and confidence-labeled.
5. Works in local and Remote-SSH VS Code workflows.

### 3.2 Non-goals (v0.1)
1. Real-time CRDT multi-cursor collaboration.
2. Hosted identity infrastructure.
3. Signed comment payloads.
4. Git-sidecar merge automation as an MVP blocker.

## 4) Product decisions locked in v0.1

1. **Host platform:** VS Code first.
2. **Anchor strategy:** hybrid positional + quote/context fallback.
3. **Per-message signatures:** out of scope.
4. **Trusted author mapping:** in-repo.
5. **Resolved visibility default:** panel-only unless toggled inline.
6. **MVP storage mode:** sidecars gitignored by default in single-workspace SSH mode.
7. **Git merge policy:** documented for future multi-environment mode, not required for MVP.

## 5) Users and core jobs

### 5.1 Users
1. Spencer (primary human collaborator)
2. Lyle/agents (automation collaborators)
3. Trusted human collaborators using the same workspace/repo

### 5.2 Jobs-to-be-done
1. Add discussion directly on exact text ranges in Markdown.
2. Review and resolve changes without mutating canonical prose format.
3. Let agents read/write thread state safely via filesystem.

## 6) Functional requirements

### 6.1 Must-have
1. Render inline markers + thread panel for `*.md`.
2. Create thread from text selection.
3. Reply/edit/reopen/resolve threads.
4. Persist sidecar atomically.
5. Re-anchor on open/save/refresh using deterministic algorithm.
6. Show anchor confidence (`high/medium/low/broken`).
7. Show minimal attribution markers (`author_id`, `author_label`, `verified`).
8. Default hide resolved inline markers (panel remains source of truth).

### 6.2 Should-have
1. Filter by state/author.
2. Jump marker ↔ thread panel.
3. Re-anchor audit reason display.

## 7) Non-functional requirements

1. Deterministic sidecar writes (stable IDs, key ordering, timestamps).
2. No automatic writes to canonical `.md` from comment actions.
3. Local-first operation with no required cloud dependency.
4. Safe rendering of comment body content.

## 8) Data model summary

Authoritative spec: `spec/comments-sidecar-v0.md`

Top-level:
```json
{
  "schema_version": "0.1.0",
  "document": {"path": "doc.md", "fingerprint": "sha256:..."},
  "threads": []
}
```

Thread essentials:
- `thread_id`, `status`, `anchor`, `author`, `messages[]`, `created_at`, `updated_at`
- Hybrid anchor fields:
  - positional (`line/column/offset_utf16`)
  - fallback (`quote/prefix/suffix/hash`)
- `anchor_confidence`: `high|medium|low|broken`

## 9) Anchor & re-anchoring behavior

Authoritative spec: `spec/anchor-reanchoring-v0.md`

Algorithm order:
1. Fast path exact positional match.
2. Nearby exact quote search.
3. Context disambiguation scoring.
4. Fuzzy recovery (low confidence only).
5. Broken state + manual relink.

Design principle: avoid false-positive reattachment.

## 10) Storage and Git mode (MVP)

1. Sidecar files are gitignored by default in MVP.
2. Collaboration assumes shared workspace access (SSH into agent workspace).
3. Merge conventions are **not** a core MVP build input; they are maintained for future tracked mode.

Authoritative future-mode policy: `spec/git-merge-conventions-v0.md`

## 11) Milestones

### Milestone A — v0.1 specs (current)
1. `spec/comments-sidecar-v0.md`
2. `spec/anchor-reanchoring-v0.md`
3. `spec/git-merge-conventions-v0.md`
4. `spec/vscode-extension-plan-v0.md`

### Milestone B — VS Code MVP implementation
1. Sidecar load/render
2. Create/reply/resolve/reopen
3. Re-anchoring + confidence states
4. Local + Remote-SSH validation

### Milestone C — hardening
1. Fixture-based anchor test suite
2. Sidecar validator
3. Optional Git-tracked sidecar mode

## 12) Success criteria (MVP)

1. Two collaborators can complete end-to-end comment workflow in one shared workspace.
2. Comment operations do not corrupt canonical Markdown.
3. Broken anchors are surfaced clearly and manually recoverable.
4. Sidecar remains readable and writable by both extension and agent tooling.

## 13) Open questions (post-v0.1)

1. Add `offset_utf8` alongside `offset_utf16`?
2. Add AST-aware block anchors in v1?
3. Require `anchor_history` in future Git-tracked mode?

## 14) Project file map

- `PRD.md` (this file)
- `README.md`
- `spec/comments-sidecar-v0.md`
- `spec/anchor-reanchoring-v0.md`
- `spec/git-merge-conventions-v0.md`
- `spec/vscode-extension-plan-v0.md`
- `research/host-platform-rubric-v0.md`
- `research/host-platform-candidates-v0.md`
