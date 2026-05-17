# spec-for-native-client-mvp

Status: v0.1 baseline (active for MVP)
Date: 2026-05-16
Paired guidance: `../../guidance/frontend/guidance-for-native-client-mvp.md`
Parent research: `.ai/research/host-platform-reevaluation-2026-05-16.md`, `pierre-components-spike-2026-05-16.md`, `jot-anchor-model-analysis-2026-05-16.md`

## 1. Scope

Normative MVP behavior for the native md-collab desktop client. The client is a Tauri-based macOS application that hosts a CodeMirror 6 editor pane plus Pierre Trees file browser plus thread/suggestion review panels, communicating over SSH/SFTP to a shared agent workspace.

The native client is a *frontend* — it does not replace `src/` (TS core) or `mdc` (CLI), and must consume them unmodified.

## 2. Goals

1. Open and edit `.md` files on local or SSH-reachable filesystems.
2. Render anchored comment threads as inline + gutter UI driven by md-collab core.
3. Create / reply / resolve / reopen threads on text selections.
4. Display and accept/reject suggested edits (`proposed_edit` lifecycle).
5. Browse `.md` files in a project tree with per-file unresolved-thread counts.
6. Detect external sidecar mutations from agents and reload deterministically.

## 3. Non-goals (MVP)

1. Real-time multi-cursor collaboration (CRDTs).
2. Remote-daemon architecture (VS Code Remote-SSH equivalent). SFTP-only for v1.
3. Windows / Linux distribution (macOS-only for v1; codebase remains cross-platform-capable).
4. App Store distribution (direct distribution only for v1; sandbox decisions deferred).
5. Sidecar-aware git merge resolution.
6. Authoring `.md` from scratch with markdown-editor affordances (slash menus, etc.) — CM6 default authoring is acceptable.
7. Multi-host workspace federation (single host per workspace in v1).

## 4. Lifecycle

1. On app launch, restore last-opened workspace if present; otherwise show the "open workspace" screen.
2. Workspace = `{ root: local-path | ssh-uri, host?: SSH host alias }`. SSH URIs resolve through `~/.ssh/config` host aliases (e.g. `ssh://lyle/home/lyle/notes`).
3. On workspace open: enumerate `.md` files via the active filesystem adapter, populate file tree.
4. On `.md` file open: load file contents; attempt to load paired `*.comments.json`; if present, run re-anchoring via TS core; emit decorations to CM6.
5. On selection + comment-action invocation: create thread via TS core operations; atomically persist sidecar via active filesystem adapter.
6. On external sidecar mutation detection: re-load sidecar, re-anchor, re-emit decorations. UI must surface that a reload occurred.
7. On workspace close: close SSH sessions, persist last-workspace state.

## 5. Commands (contract)

1. `mdCollab.openWorkspace` — show workspace picker (local dir or SSH URI).
2. `mdCollab.addComment` — selection → create thread.
3. `mdCollab.replyToThread` — focused thread → add message.
4. `mdCollab.resolveThread` — focused thread → resolved.
5. `mdCollab.reopenThread` — focused thread → reopened.
6. `mdCollab.reanchorCurrentFile` — explicit re-anchor invocation.
7. `mdCollab.proposeSuggestion` — selection + replacement text → proposed_edit.
8. `mdCollab.acceptSuggestion` — focused suggestion → apply + status=applied.
9. `mdCollab.rejectSuggestion` — focused suggestion → status=rejected.
10. `mdCollab.openThreadPanel` / `mdCollab.closeThreadPanel` — toggle right side panel.
11. `mdCollab.openFileTree` / `mdCollab.closeFileTree` — toggle left side panel.
12. `mdCollab.refreshSidecar` — force reload of current file's sidecar.

All commands must be triggerable via:
- Menu bar (native macOS menu)
- Keyboard shortcuts (configurable, defaults documented in guidance)
- Command palette (Cmd+K)

## 6. Decoration / rendering rules

1. Open threads render as: (a) gutter dot in CM6 gutter, (b) inline mark on anchor range, (c) entry in right-side thread panel.
2. Resolved threads are panel-visible by default; inline rendering hidden by default; toggleable per session.
3. Anchor confidence states render distinctly:
   - `high` — default style.
   - `medium` — muted color, tooltip indicates confidence.
   - `low` — dashed underline, tooltip indicates confidence.
   - `broken` — panel-only. Editing-capable frontends MUST provide an explicit "relink" CTA. Read-only frontends MUST surface the broken anchor in the panel and indicate that relink is available in editing-capable contexts. No inline mark in either case.
4. Suggested edits with status `proposed` render as: (a) gutter affordance indicating suggestion, (b) clickable to open diff view in dedicated suggestion pane.
5. Suggestion diff view uses `@pierre/diffs` in split layout, with Accept/Reject buttons rendered outside the diff component (per spike findings).
6. File tree rows with unresolved threads show a badge with `{open_count}`; rows with only resolved threads show no badge.
7. The currently-open file is highlighted in the file tree.
8. The file tree must support: search, expand/collapse, keyboard navigation, click-to-open.

## 7. State model

1. Source of truth: sidecar JSON on the active filesystem (local or SSH).
2. UI-only ephemeral state (selection, panel expansion, scroll position) is not persisted to disk.
3. Workspace state (last open, panel widths, theme) is persisted to the app's local app-support dir.
4. Thread/message/suggestion IDs must round-trip unchanged through any mutation.
5. The TS core is the single sidecar mutation authority — the native client must not write to sidecars except via TS core operations.

## 8. SSH / remote behavior

1. SSH connectivity must leverage the system OpenSSH client and the user's `~/.ssh/config`. No bespoke key management UI in MVP.
2. One persistent SSH session per host, multiplexed via ControlMaster.
3. Sidecar writes must be atomic on the remote filesystem (write `.tmp`, fsync, rename) — same contract as local writes.
4. External sidecar mutation detection: poll `stat` mtime of currently-open sidecar every N seconds (configurable, default 3s) while file is open. v1 acceptable; remote inotify/fswatch deferred to v2.
5. On SSH connection failure: surface a clear error in UI; do not silently drop writes. Pending mutations queue up to a soft cap; beyond that, surface "reconnect to apply N pending changes."
6. SSH sessions must be torn down on workspace close or app quit.

## 9. File tree behavior

1. Tree is populated by enumerating `.md` files under workspace root (recursively), excluding `.git/`, `node_modules/`, `dist/`, `target/`, and user-configurable additional patterns.
2. Tree must re-enumerate when the workspace's file set changes (poll or watch — implementation choice). Re-enumeration is debounced.
3. Per-file unresolved thread counts are computed by scanning sibling `*.comments.json` files; this scan must be incremental (mtime-keyed cache) to keep workspace open snappy on large workspaces.
4. Tree must use `@pierre/trees` (per spike findings) with `paths`, `renderRowDecoration`, `onSelectionChange`, and `setGitStatus` (when md-collab adds git awareness in future).

## 10. Settings schema (minimum)

1. `mdCollab.authorId` — string, required for writes.
2. `mdCollab.authorLabel` — string, required for writes.
3. `mdCollab.showResolvedInline` — boolean, default false.
4. `mdCollab.reanchorOnOpen` — boolean, default true.
5. `mdCollab.sidecarPollIntervalMs` — integer, default 3000, range 500..60000.
6. `mdCollab.workspace.excludePatterns` — string array, default `[".git/", "node_modules/", "dist/", "target/"]`.
7. `mdCollab.ui.theme` — enum `auto|light|dark`, default `auto` (follows system).
8. `mdCollab.ssh.defaultControlMaster` — boolean, default true.

Settings are stored as JSON in the app's local app-support dir; per-workspace overrides supported via a `.md-collab/native-client.json` at the workspace root (optional).

## 11. Error and recovery behavior

1. If sidecar JSON parse fails (`SCHEMA_INVALID`), the native client enters read-only warning mode for that file; no auto-rewrite.
2. The user must be provided an action: "Open sidecar to repair manually." Frontends MAY implement this as in-app CM6 JSON editing OR by launching the user's default `.json` handler (e.g. via `tauri-plugin-opener` on the native client). The reload-after-repair flow must work in either case.
3. If SSH connection fails mid-session, the active file enters read-only mode with a banner; reads continue from in-memory cache; writes are blocked until reconnect.
4. If atomic sidecar write fails (rename failure), the failed `.tmp` file must be cleaned up; the prior sidecar must remain intact.
5. If re-anchoring produces a `broken` state for any threads, surface them in the panel. Functional relink is required only of frontends that support sidecar mutations; read-only frontends MUST still surface the broken anchor and indicate that relink is available in editing-capable contexts.

## 12. Undo/redo semantics

1. CM6 editor undo/redo applies to `.md` text content only.
2. Comment/suggestion operations are not part of the CM6 undo stack.
3. Operations on threads/suggestions may be reversible via explicit "undo last comment action" command (deferred to v0.2+). MVP: no undo for comment ops.

## 13. Resolved-thread lifecycle

1. Resolved threads persist in sidecar (no archival in v1).
2. Resolved threads are panel-visible by default; inline-hidden by default.
3. Reopen restores `status=open` but does not re-create anchor; current anchor and confidence are retained.

## 14. Suggested-edit lifecycle

1. `propose` creates `suggestions[].status=proposed` via TS core; sidecar is persisted.
2. `accept` applies the `proposed_edit` to the `.md` file (text replacement), sets `status=applied`, records `decision.decided_by` and `decision.decided_at`; sidecar is persisted.
3. `reject` sets `status=rejected`, records same decision metadata; `.md` file is unchanged.
4. If the original anchored range no longer matches `before_text_hash`, the accept action must surface a conflict warning and decline to apply automatically.
5. Suggestion status changes do not implicitly resolve the parent thread.

## 15. Cross-frontend consistency

1. All sidecar mutations must go through `mdc` CLI or the TS core's `operations.ts` — not directly through hand-rolled sidecar writers.
2. The native client must not introduce new sidecar fields or invariants not defined in `schemas/comments-sidecar.schema.json`.
3. A file opened in the native client and then in the VS Code extension must show the same threads with the same anchor positions and confidence states.
4. Round-tripping a sidecar through native-client open + save + close + reopen must produce a byte-identical sidecar (modulo `updated_at`, `relevance_checked_at` timestamps, and any `primary` anchors updated by re-anchoring per `spec-for-anchor-engine-patches-from-jot.md` Patch 4).
5. Native client v1 depends on the patches captured in `../backend/spec-for-anchor-engine-patches-from-jot.md` (sort-on-serialize, sanitization caps, unified context-window constant, persisted relocated `primary`). Patches 1-3 are HARD prerequisites: they must merge to TS core BEFORE the first native-client PR ships. Patch 4 (`doc_revision` field completion) is required for native v1's persist-after-reanchor path and lands alongside the first native-client mutation PR. All four are inherited transparently via vendor sync.

## 16. Acceptance criteria

1. End-to-end create / reply / resolve / reopen of a thread works on a local `.md` file with sidecar persistence.
2. End-to-end propose / accept / reject of a suggestion works with `.md` text mutation on accept.
3. End-to-end same workflows work over SSH against a host configured in `~/.ssh/config`.
4. Opening a file with a corrupt sidecar enters read-only mode with the documented "repair manually" action.
5. Modifying a sidecar externally (e.g. via `mdc` from another shell) results in the native client reloading the sidecar within `sidecarPollIntervalMs * 2` and updating decorations.
6. File tree shows unresolved-thread counts that match the actual sidecar contents.
7. Reanchoring produces the same `anchor_confidence` values for a given file/sidecar pair as the VS Code extension (verified via existing TS core test fixtures).
8. SSH session is torn down on app quit; no stale `ssh` processes remain.
9. App launches and reaches usable state (editable for editing-capable frontends; read-only display for read-only frontends) on a typical workspace (<1000 `.md` files, local) in under 2 seconds.
10. App launches and reaches editable state on a typical SSH workspace in under 5 seconds (after first ControlMaster connect).
