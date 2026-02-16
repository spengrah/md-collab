# guidance-for-comment-authoring-ux-v0

## Intent
Make comment creation feel like mature doc-review tools (Google Docs/HackMD) without adding complexity to backend semantics.

## Guidance
1. Bind context menu action only when `editorTextFocus && editorHasSelection && resourceExtname == .md`.
2. Pick a conservative default keybinding and allow user override.
3. Reuse existing `addComment` command path to avoid duplicate logic.
4. Keep prompt copy short and action-oriented.

## Anti-patterns
1. Separate implementation paths for context-menu vs command palette.
2. Keybinding active without selection.
3. Silent failure when selection is missing.
