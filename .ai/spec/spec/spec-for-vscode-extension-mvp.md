# spec-for-vscode-extension-mvp

Status: v0.1 baseline (active for MVP), superseded-in-scope for v0.2 by `spec/frontend/*` PR-review-style docs

## 1. Scope
Normative MVP behavior for the VS Code extension frontend.

## 2. Lifecycle
1. On markdown file open, attempt to load sidecar.
2. If sidecar missing, initialize empty in-memory comment state (no write until first comment action).
3. On save/refresh command, run re-anchoring pass and update confidence states.

## 3. Commands (contract)
1. `mdCollab.addComment`
2. `mdCollab.replyToThread`
3. `mdCollab.resolveThread`
4. `mdCollab.reopenThread`
5. `mdCollab.reanchorCurrentFile`
6. `mdCollab.openThreadPanel`

## 4. Decoration/rendering rules
1. Open threads render inline marker + panel entry.
2. Resolved threads are panel-visible and inline-hidden by default.
3. Low/medium confidence markers show distinct visual state.
4. Broken anchors are panel-visible with explicit relink CTA.

## 5. State model
1. Source of truth: sidecar JSON + current in-memory parse.
2. UI-only ephemeral state (selection, expanded panel items) is not persisted.
3. Thread/message IDs must round-trip unchanged.

## 6. Settings schema (minimum)
1. `mdCollab.authorId` (string, required for writes)
2. `mdCollab.authorLabel` (string, required for writes)
3. `mdCollab.showResolvedInline` (boolean, default false)
4. `mdCollab.reanchorOnSave` (boolean, default true)

## 7. Error and recovery behavior
1. If sidecar parse fails (`SCHEMA_INVALID`), extension enters read-only warning mode for that file.
2. Extension must provide action: "Open sidecar to repair manually".
3. Extension must not overwrite malformed sidecar automatically.

## 8. Undo/redo semantics
1. VS Code editor undo/redo does not guarantee sidecar undo semantics.
2. Comment operations are explicit extension actions and are not part of markdown text undo stack.

## 9. Resolved-thread lifecycle
1. Resolved threads persist in sidecar in v0.1.
2. No archival/purge in MVP.
3. Future archival policy is v1+ scope.

## 10. Acceptance criteria
1. End-to-end create/reply/resolve/reopen works with sidecar persistence.
2. Corrupt sidecar triggers safe read-only mode.
3. Command contract and settings work in local + Remote-SSH sessions.
