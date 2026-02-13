# spec-for-comment-authoring-ux-v0

Status: superseded-in-scope (v0.1 baseline retained)  
Superseded by: `spec-for-pr-review-overlay-ui.md` and `../backend/spec-for-git-review-thread-model.md` for forward UX direction.

Scope: VS Code extension UX improvements for creating comments quickly

## 1. Goal
Reduce friction for creating new comments by adding editor-native affordances.

## 2. Normative requirements
1. Provide a right-click context menu action on markdown editor selection:
   - `md-collab: Add Comment`
2. Provide at least one keyboard shortcut for add-comment action when text is selected.
3. Keep command palette action (`mdCollab.addComment`) as canonical fallback.
4. If no selection exists, action must fail with clear user message and no sidecar write.

## 3. UX behavior
1. On valid selection, open input prompt for comment body.
2. On submit, create thread and persist sidecar.
3. On cancel, perform no write.

## 4. Acceptance criteria
1. User can create a comment without using command palette.
2. Context menu and keybinding both invoke same backend path.
3. No accidental sidecar writes on invalid/empty selection.
