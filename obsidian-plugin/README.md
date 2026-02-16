# md-collab Obsidian plugin (Phase 2 scaffold)

This folder contains an initial Obsidian plugin scaffold for md-collab sidecar collaboration.

## Implemented in this phase
- Obsidian plugin entrypoint + right-sidebar `ItemView` (`Threads`).
- Intent-only command routing (`ThreadIntent` + `IntentRouter`) so UI code does not mutate sidecars directly.
- Canonical sidecar mutations routed through existing core operations (`createThread`, `reply`, `resolveThread`, `reopenThread`, suggestion lifecycle hooks, reanchor).
- Conflict-guarded writes (revision token comparison before atomic write).
- Deterministic markdown/sidecar path helpers and selection offset conversion helpers.

## Build
From repo root:

```bash
npm run build
npm --prefix obsidian-plugin install
npm --prefix obsidian-plugin run build
```

This compiles TypeScript and syncs core artifacts into `obsidian-plugin/vendor/`.

## Command surface in current scaffold
- `md-collab: Open Threads Panel`
- `md-collab: Add Comment from Selection`
- `md-collab: Reload Sidecar`

Notes:
- Reply/resolve/reopen/suggestion actions are implemented in command handlers and intent router, with panel UI wiring planned in next pass.
- The panel currently renders grouped Open/Resolved thread summaries and count labels.
