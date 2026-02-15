# Post-testing notes (md-collab VS Code extension)

## Highlight semantics (intended)

- Thread anchors are modeled as start/end UTF-16 offsets where end is exclusive.
- Inline gutter marker always appears for non-broken anchors and includes confidence/relevance/timeline in hover.
- Background range highlighting is intentionally limited to `high` and `medium` confidence anchors.
- `low` confidence anchors keep only the gutter marker (no range fill) to avoid implying precise anchoring when match quality is weak.
- `broken` anchors do not highlight range and are surfaced via warning/relink affordance.

## Conflict repro steps (deterministic)

1. Open the same markdown document in two VS Code windows.
2. In window A, add a comment (writes sidecar).
3. In window B, without reloading sidecar, add/reply/resolve a thread.
4. Expected: sidecar conflict warning appears (reload required).

### When conflicts are/aren't expected

- Expected: concurrent/multi-process sidecar writes, git operations touching sidecars, manual sidecar edits.
- Not expected: single editor window with only md-collab writing sidecar.
