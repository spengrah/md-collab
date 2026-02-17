# guidance-for-obsidian-plugin

Status: draft v0.1

## Intent
Prototype an Obsidian-native md-collab experience quickly while preserving sidecar determinism and compatibility with existing VS Code workflows.

## Implementation guidance

1. Start with core reuse
- Import/reuse md-collab core operations for sidecar mutation and validation.
- Keep Obsidian plugin code focused on UI + adapter glue.

2. Treat plugin UI as intent-only
- Thread panel and inline controls should emit typed intents.
- Route intents to command handlers that call canonical core operations.
- Avoid sidecar writes in view rendering code.

3. Keep anchor math deterministic
- Convert editor selection offsets consistently (Source/Live Preview path split if needed).
- Centralize conversion helpers and test them with fixtures.

4. Design for mixed-tool coexistence
- Assume same sidecar may be edited from VS Code and Obsidian.
- Always reload before write and preserve conflict/retry UX.

5. Prefer incremental render updates
- Patch changed thread/group where possible.
- Avoid full rerender for every file event in large vaults.

## Suggested phased rollout

1. Phase A — plugin scaffold + read-only panel
- Register Obsidian plugin, commands, and sidebar view.
- Render grouped threads from existing sidecars.

2. Phase B — core mutation intents
- Add comment from selection.
- Reply, resolve/reopen.
- Keep conflict reload path visible.

3. Phase C — suggestions + recovery polish
- Suggest/apply/reject flows.
- Base-context help path.
- Broken-anchor relink affordance.

4. Phase D — compatibility/perf hardening
- Vault move/rename handling.
- Debounce/watcher tuning.
- Accessibility and keyboard pass.

## Test plan guidance

Unit tests:
1. Markdown ↔ sidecar path mapping.
2. Intent routing to canonical operations.
3. Selection/offset conversion for anchor creation.

Integration tests:
1. Create/reply/resolve/reopen from panel.
2. Suggest/apply/reject lifecycle including obsolete path.
3. Conflict detection + reload workflow.

Manual acceptance:
1. Validate with existing md-collab sidecars created in VS Code.
2. Validate Source + Live Preview behavior.
3. Validate performance with high thread/message count note.

## Settings tab

- Extend `PluginSettingTab` in a dedicated `settings-tab.ts` module.
- Use the `Setting` builder with `.addText()` for each field (`authorId`, `authorLabel`).
- On change: update `plugin.settings.<field>` and call `plugin.saveSettings()`.
- `saveSettings()` delegates to `this.saveData(this.settings)`.
- `loadSettings()` merges saved data over `DEFAULT_SETTINGS` via `Object.assign()`, ensuring empty fields fall back to defaults at usage sites (the `author()` helper).

## Diff-based buffer capture (MDC-FE-016)
- Cache document text in a module-level `Map<string, string>` keyed by document path in `service.ts`.
- In `reanchorAll`, compare current file text against cached text; compute `diffMap` via `computeDiffMap` and pass to each `reanchor` call.
- Export the cache as `__testOnlyLastDocumentText` for test access.
- The Obsidian service reads document text via `readFileSync` (not editor buffer), so the cache captures the last-read disk state.

## Anti-patterns to avoid
1. Obsidian-specific sidecar fork/schema drift.
2. Re-implementing core write logic inside UI classes.
3. Hiding primary actions behind context-only menus.
4. Silent write failures without explicit recovery hints.
