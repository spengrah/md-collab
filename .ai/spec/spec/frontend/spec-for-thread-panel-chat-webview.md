# spec-for-thread-panel-chat-webview

Status: draft v0.4  
Scope: replace flat tree-style thread panel UX with threaded chat-bubble Webview while preserving canonical command-routing + sidecar safety.

## 1. Goal
Provide a thread panel UX that feels like Google Docs-style discussion:
1. chat-bubble message rendering,
2. clear per-thread grouping,
3. highly discoverable actions (`Reply`, `Resolve/Reopen`, `Suggest`),
4. no regression in mutation safety or deterministic behavior,
5. practical parity for the **discussion panel experience** (readability + flow), even if the rest of the product remains local-first/Markdown-native.

## 2. Non-goals
1. No direct sidecar writes from webview JS (all writes still go through extension-host commands).
2. No schema changes required for initial panel redesign.
3. No CRDT/live multi-cursor features in this pass.
4. Full end-to-end Google Docs feature parity outside thread-panel UX (sharing model, permissions, cloud presence, etc.) is out of scope for this iteration.

Clarification: comment/reply authoring **from the webview UI** is in scope, as long as execution is routed through canonical host commands.

## 3. Architecture decision (normative)
Use a VS Code `WebviewView` (or `WebviewPanel`) for primary thread UI.

Reasons:
1. Native TreeView cannot express bubble layouts, rich spacing, and action placement cleanly.
2. Webview supports richer message blocks while still delegating writes to extension commands.

## 4. Data contract into webview
Webview receives a read-model projection only (serialized JSON):
1. `document`: uri/path/display label
2. `groups`: `open[]`, `resolved[]`
3. each thread:
   - `thread_id`, `status`, `relevance_state`, `timeline_kind`, `anchor_confidence`
   - `can_resolve`, `can_reopen`, `can_reply`, `can_suggest`
   - `messages[]` (ordered asc by `created_at`)
   - `suggestions[]` summary (status/count/latest)
4. UI state:
   - expanded/collapsed thread ids
   - active thread id
   - filters (open/resolved, mine/all, has suggestions)

No sidecar internals beyond required display fields should be exposed.

## 5. Interaction model

### 5.1 Thread list
1. Top-level sections:
   - `Open (N)`
   - `Resolved (N)`
2. Each thread row shows concise heading:
   - title snippet (latest message excerpt)
   - subtle metadata badge row (relevance/timeline/confidence)
3. Clicking thread expands in-place to show message bubbles.

### 5.2 Message bubble rendering
Each message renders as a vertical bubble block:
1. header row:
   - author label
   - relative/absolute timestamp
2. bubble body:
   - wrapped text, multiline, markdown-safe display
3. optional adornments:
   - system/audit messages styled distinctly
   - suggestion-related messages with icon + status chip

### 5.3 Thread actions (high discoverability)
Within expanded thread, render sticky action row near top or bottom:
1. `Reply` (opens inline composer in-panel, then submits via `mdCollab.replyToThread`)
2. `Resolve` (if open) / `Reopen` (if resolved)
3. `Suggest from Selection (Auto-thread if needed)`
4. `Jump to anchor`
5. `View base version` (when suggestion selected/available)

Action labels must be explicit and not hidden behind ambiguous context menus.

### 5.4 In-panel comment/reply authoring
1. The webview should support creating new top-level comments from current editor selection.
2. The webview should support replying inline inside an expanded thread (lightweight composer: textarea + submit/cancel).
3. Submission path must remain command-routed through extension host (no direct sidecar mutation in webview runtime).
4. If selection is missing/invalid for top-level comment, show immediate actionable guidance.
5. Inline composer must support keyboard submit (`Cmd/Ctrl+Enter`) and button submit.
6. After submit, keep the thread expanded.
7. Draft text must persist per thread across rerenders/reloads in the same session.
8. Clicking a visible action must never silently no-op; if command dispatch fails, show inline thread error state.
9. Mutation UX uses optimistic update; on failure, rollback or mark pending item failed with clear inline state.
10. On sidecar conflict during submit, auto-retry exactly once; if second attempt fails, show inline prompt with explicit reload action.

### 5.5 Suggestion actions and diff presentation
For each proposed suggestion bubble/card:
1. `Apply`
2. `Reject`
3. `View base version context` remains available but de-emphasized as secondary affordance.

Suggestion body presentation requirements:
1. Primary representation is unified diff-style (before/after in one flow).
2. Include word-level highlights inside changed lines.
3. Use simplified human labels (not raw hunk syntax like `@@ ... @@`).
4. Multi-line suggestion diffs must be collapsible/expandable.
5. Applied/rejected suggestions are hidden by default behind filter controls.
6. V1 skips syntax-coloring specialization for fenced code; focus on markdown-first readable diff rendering.

Hash mismatch behavior remains unchanged: mark `obsolete`, do not mutate doc.

## 6. Command-routing safety contract
Webview may only send intents to extension host; extension host executes canonical commands.

Required mapping:
1. add-comment intent -> `mdCollab.addComment` (selection-based top-level comment)
2. reply intent -> `mdCollab.replyToThread`
3. resolve intent -> `mdCollab.resolveThread`
4. reopen intent -> `mdCollab.reopenThread`
5. suggest intent -> `mdCollab.proposeSuggestion` or `mdCollab.proposeSuggestionFromSelection`
6. apply/reject/base intents -> existing suggestion commands

Forbidden:
1. direct file writes in webview runtime,
2. bypassing preflight/conflict checks.

## 7. Visual design constraints
1. Bubble separation must be obvious via spacing + border/background (not color-only).
2. Avoid dense horizontal metadata clutter in primary reading path.
3. Keep line length readable; prefer wrapping over truncation for message body.
4. Preserve dark/light theme compatibility with VS Code tokens.

## 8. Accessibility requirements
1. Keyboard navigation across threads and actions (tab/shift-tab + enter/space).
2. ARIA labels for action buttons and suggestion state.
3. Focus ring visibility on all interactive controls.
4. Non-color state encoding (icons/text labels for open/resolved/obsolete/etc).

## 9. Performance requirements
1. Smooth interaction with >=100 threads and >=500 total messages in a file.
2. Incremental updates: patch active thread/group when possible; avoid full rerender on minor events.
3. Debounce refresh bursts from sidecar watcher.

## 10. Failure and recovery UX
1. Conflict errors surface inline thread-level error state first, with `Reload Sidecar` action.
2. Base-version unavailable explains why and links to settings/help.
3. Broken anchor threads show relink CTA.
4. Retry policy for submit mutations is fixed: one automatic retry, then explicit user prompt.
5. Failed optimistic submissions must be visibly recoverable (retry/edit/discard) without losing draft text.

## 11. Migration and rollout
1. Keep current TreeView behind fallback command during transition.
2. Enable chat webview as default once acceptance checks pass.
3. No sidecar migration required.

## 12. Acceptance criteria
1. Spencer can perform comment/reply/resolve/suggest without hunting in nested menus, and action clicks never silently no-op.
2. Message history reads as chat-style thread, not flattened metadata rows.
3. Suggestion cards read like unified git-diff style changes with word-level highlights and collapsible long diffs.
4. All mutation paths still pass existing conflict/guard behavior, including optimistic submit + retry-once + inline recovery.
5. Existing tests pass + new UI contract/integration tests cover command mapping, composer keybind, draft persistence, and conflict recovery.
6. Remote-SSH workflow remains functional.
7. Usability bar: user can work on a real document with suggestions end-to-end.
