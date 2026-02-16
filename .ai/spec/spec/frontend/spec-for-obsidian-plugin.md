# spec-for-obsidian-plugin

Status: draft v0.1  
Scope: Obsidian plugin frontend for md-collab sidecar collaboration.

## 1. Goal
Deliver an Obsidian plugin that provides Google-Docs-like discussion panel flow on top of canonical Markdown + sidecar JSON, with deterministic host-routed mutations and no schema breakage.

## 2. Non-goals
1. No cloud sync/sharing/permissions layer.
2. No CRDT/live cursor collaboration.
3. No sidecar schema redesign in this pass.
4. No requirement to fully match VS Code UI component-for-component.

## 3. Core model constraints
1. Markdown remains source of truth.
2. Comments/suggestions remain in `*.comments.json` sidecar.
3. Existing sidecar schema remains compatible.
4. Existing conflict and suggestion safety semantics are preserved.

## 4. Plugin architecture
1. **Core adapter layer**
   - Reuse md-collab core operations where possible.
   - Add Obsidian-specific adapter for file IO, editor selection, and commands.
2. **Thread panel UI**
   - Obsidian `ItemView` for chat-style thread panel.
3. **Command layer**
   - Expose command palette actions for add comment, reply, resolve/reopen, suggest/apply/reject, reload/reanchor.
4. **Persistence layer**
   - Atomic sidecar writes + conflict-aware reload path.

## 5. UX requirements
1. Right-sidebar “Threads” panel with `Open (N)` and `Resolved (N)` groups.
2. Expanded thread renders message bubbles with author/timestamp/body.
3. Explicit per-thread actions:
   - Reply
   - Resolve/Reopen
   - Suggest from selection
   - Jump to anchor
4. Suggestion cards include:
   - Apply
   - Reject
   - View base context
5. Top-level action for “Add comment from current selection”.

## 6. Command-routing and write safety
1. UI may emit intents only.
2. Host/plugin command handlers execute canonical operations.
3. No direct sidecar mutation in UI rendering code.
4. Hash mismatch on suggestion apply marks obsolete and does not mutate markdown.

## 7. Obsidian-specific integration requirements
1. Works in Source mode and Live Preview with deterministic anchor behavior.
2. Handles vault rename/move events for markdown/sidecar pairing.
3. Debounces file watcher update bursts.
4. Supports large-vault performance without full rerender on every event.

## 8. Accessibility and usability
1. Keyboard navigation for thread rows and action controls.
2. Explicit text labels for thread/suggestion states (non-color-only).
3. Focus-visible styling for interactive controls.

## 9. Failure/recovery UX
1. Sidecar conflict surfaces visible banner with reload action.
2. Broken anchor threads expose relink action.
3. Base-context unavailable states include plain-language explanation.

## 10. Acceptance criteria
1. User can add comment/reply/resolve/suggest from Obsidian without editing sidecar manually.
2. Chat-style thread readability is clearly better than flat metadata rows.
3. Mutation safety behavior matches md-collab backend expectations.
4. Existing md-collab sidecars from VS Code are readable/editable without migration.
5. Smoke tests pass for create/reply/resolve/suggest/apply/reject + reload/reanchor.
