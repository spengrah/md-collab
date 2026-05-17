# guidance-for-native-client-mvp

Status: v0.1 baseline (active for MVP)
Date: 2026-05-16
Paired spec: `../../spec/frontend/spec-for-native-client-mvp.md`
Parent research:
- `.ai/research/host-platform-reevaluation-2026-05-16.md` (substrate decision)
- `.ai/research/pierre-components-spike-2026-05-16.md` (UI components validation)
- `.ai/research/jot-anchor-model-analysis-2026-05-16.md` (anchor-model lessons to borrow)

## 1. Purpose

Implementation guidance for the native md-collab desktop client. Captures architecture decisions, repo layout, technology choices with rationale, and phased delivery cuts. Read alongside the normative spec, not in place of it.

## 2. Architecture overview

```
┌─ Tauri 2 application (macOS .app) ────────────────────────────┐
│                                                               │
│  ┌─ WKWebView frontend ─────────────────────────────────────┐ │
│  │  Web tech (TS + Vite) running inside the WKWebView       │ │
│  │                                                          │ │
│  │  ┌────────────┐  ┌────────────────┐  ┌────────────────┐  │ │
│  │  │ Pierre     │  │ CodeMirror 6   │  │ Thread / sugg. │  │ │
│  │  │ Trees      │  │ editor +       │  │ panel (lit/    │  │ │
│  │  │ (file      │  │ md-collab      │  │ vanilla/Preact)│  │ │
│  │  │  tree)     │  │ decorations    │  │                │  │ │
│  │  └────────────┘  └────────────────┘  └────────────────┘  │ │
│  │                                                          │ │
│  │  Pierre Diffs (rendered on demand for suggestion view)   │ │
│  │  md-collab TS core (vendored from `src/`)                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                              │                                │
│                              │ Tauri IPC                      │
│                              ▼                                │
│  ┌─ Rust backend ─────────────────────────────────────────── ┐│
│  │  • SSH layer (openssh + openssh-sftp-client)              ││
│  │  • Local FS layer (std::fs + notify crate for watch)      ││
│  │  • mdc CLI invoker (tokio::process)                       ││
│  │  • Workspace enumeration / sidecar scanning               ││
│  │  • Atomic write contract                                  ││
│  │  • Settings + workspace state persistence                 ││
│  └────────────────────────────────────────────────────────── ┘│
└───────────────────────────────────────────────────────────────┘
```

## 3. Repo layout (additions to existing repo)

New top-level directory: `native-client/`

```
native-client/
  src-tauri/              # Rust backend (Tauri)
    src/
      main.rs             # Tauri app entry
      commands.rs         # Tauri IPC commands exposed to frontend
      fs/
        local.rs          # Local filesystem adapter
        ssh.rs            # SSH filesystem adapter (openssh + sftp)
        mod.rs            # Adapter trait
      mdc.rs              # mdc CLI invocation
      workspace.rs        # Workspace state, sidecar enumeration
      settings.rs         # Settings persistence
    Cargo.toml
    tauri.conf.json
    build.rs
  src/                    # Web frontend (TS + Vite)
    app/
      main.ts             # Entry point, mounts components
      ipc.ts              # Tauri IPC client (typed wrappers)
    components/
      file-tree/          # @pierre/trees integration
      editor/             # CM6 editor + md-collab decorations
      thread-panel/       # Right-side review panel
      suggestion-view/    # @pierre/diffs integration
      settings-panel/
    state/                # State management (lightweight; Zustand or signals)
    styles/
    main.html
  vendor/                 # Vendored md-collab TS core (synced from /dist)
  scripts/
    sync-core.mjs         # Mirrors /dist into vendor/, like obsidian-plugin does
  package.json
  tsconfig.json
  vite.config.ts
  README.md
```

Naming: directory is `native-client/` to match sibling `vscode-extension/` and `obsidian-plugin/` (host-named). User-facing app name TBD (e.g., "md-collab" or "md-collab desktop").

## 4. Stack decisions

### Tauri 2 (Rust shell) — chosen
- **Why**: bundles ~10-30MB vs Electron's ~100MB; Rust backend gives clean SSH/FS code; WKWebView native to macOS; cross-platform-capable for future.
- **Rejected**: pure SwiftUI (loses Pierre components, doubles the substrate-language story); pure Electron (heavier, no Rust ergonomics); Wails/Neutralino (smaller ecosystem).

### CodeMirror 6 (editor) — chosen
- **Why**: decoration/transaction/state-effect APIs are purpose-built for anchored markers, gutter overlays, suggestion hunks. Battle-tested in Obsidian, HackMD, GitHub web. Position-tracking primitives align with md-collab's live-session needs.
- **Rejected**: ProseMirror (similar capability, less code-editor-shaped); Monaco (heavier, less customizable); custom (months of editor primitive work).

### `@pierre/trees` (file tree) — chosen
- **Why**: spike validated production-grade quality. Saves ~2-3 weeks vs building from scratch (virtualization + a11y + shadow DOM + theming).
- **Caveat**: pre-1.0 (`1.0.0-beta.3`). Acceptable risk for MVP; revisit if API churns.

### `@pierre/diffs` (suggestion diff renderer) — chosen
- **Why**: spike validated production-grade rendering. Saves ~1-2 weeks vs custom Shiki integration.
- **Caveat**: Accept/Reject buttons NOT built-in despite marketing; render externally. Bundle adds ~1.5MB gzipped Shiki grammars — mitigate by lazy-loading grammars beyond markdown + json.

### `openssh` + `openssh-sftp-client` (SSH) — chosen
- **Why**: wraps system OpenSSH; leverages `~/.ssh/config`, ssh-agent, known_hosts, ControlMaster for free. ~300 lines of Rust code total. Inherits the user's already-working SSH posture (Lyle, raspberet, dappnode).
- **Rejected**: `russh` (would require implementing key management UX, known_hosts UI, ssh-config parsing); `async-ssh2-tokio` (C dependency, less momentum); FUSE/sshfs (macFUSE system-extension friction on macOS 15+).

### md-collab TS core — vendored, unchanged
- **Why**: single source of truth across all three frontends (VS Code, Obsidian, native). Vendoring from `dist/` per existing `obsidian-plugin/scripts/sync-core.mjs` precedent.
- **Constraint**: native client must not introduce native-only mutation paths; all sidecar writes route through TS core operations or via `mdc` CLI shell-out (see § 6).

## 5. Tauri IPC contract

Frontend ↔ backend communication via Tauri's typed command/event system. All commands return `Result<T, NativeClientError>` shaped for the web frontend.

Commands (Rust → exposed to frontend):

```
fs.list_markdown(root: WorkspaceRoot) -> Vec<PathInfo>
fs.read_file(path: WorkspaceUri) -> String
fs.read_sidecar(path: WorkspaceUri) -> Option<String>
fs.write_sidecar_atomic(path: WorkspaceUri, contents: String, expect_rev?: String) -> WriteResult
fs.write_file_atomic(path: WorkspaceUri, contents: String) -> WriteResult
fs.stat(path: WorkspaceUri) -> StatInfo  // for mtime polling
fs.list_dir(path: WorkspaceUri) -> Vec<DirEntry>

ssh.open_session(host_alias: String) -> SessionId
ssh.close_session(session_id: SessionId)
ssh.session_status(session_id: SessionId) -> SessionStatus

mdc.invoke(args: Vec<String>, stdin?: String, cwd?: WorkspaceUri) -> CliResult
// All sidecar mutations should prefer `mdc.invoke` to keep TS core as single mutation authority

workspace.open(root: WorkspaceUri) -> WorkspaceState
workspace.close()
workspace.current() -> Option<WorkspaceState>

settings.get() -> Settings
settings.update(patch: Partial<Settings>)
```

Events (backend → frontend):

```
fs:changed { path: WorkspaceUri, kind: "modified"|"deleted"|"created" }
ssh:disconnected { session_id, reason }
ssh:reconnecting { session_id }
ssh:connected { session_id }
mdc:progress { id, message }
```

The frontend wraps these in typed TS modules (`src/app/ipc.ts`).

## 6. Sidecar mutation policy

**Reads + re-anchoring**: native client imports the browser-safe subset of the vendored TS core directly in the WKWebView. This is the fast, frequent path used to render decorations and recompute confidence tiers without any subprocess overhead.

**Mutations (all writes — create / reply / resolve / reopen / propose / accept / reject / relink)**: route through `mdc.invoke`, shelling out to the `mdc` CLI that all frontends share. This enforces the "agent-safe single source of truth" guarantee at the cost of subprocess + JSON envelope parse latency. The native client never introduces a direct vendored-core mutation path — keeping all writes behind `mdc` preserves the cross-frontend invariant guarantee even as new operations land.

For remote (SSH) mutations: shell out to `mdc` *on the remote host* via `ssh.exec` — this naturally serializes through the same CLI the agents use, eliminating the "local TS core vs remote agent disagreement" risk. Local fallback only if `mdc` not present on remote.

PR1 of the native client ships **zero** mutation paths: the first PR is read-only (workspace + tree + viewer + panel). PR2 introduces `mdc.invoke` and the first sidecar-write surface area. See `.ai/log/plan/native-client-mvp-pr1-foundation.md` § 11.1.

## 7. SSH layer detail

Single Rust module `src-tauri/src/fs/ssh.rs`:

```rust
use openssh::{Session, KnownHosts, SessionBuilder};
use openssh_sftp_client::Sftp;

// One Session per host alias, held in a HashMap<String, Arc<Mutex<Session>>>
// Sessions are lazy: opened on first read, persisted for app lifetime
// ControlMaster reuse is automatic via system OpenSSH

pub async fn open_session(host: &str) -> Result<Session> {
    SessionBuilder::default()
        .known_hosts_check(KnownHosts::Strict)
        .connect(host)
        .await
}

pub async fn sftp(session: &Session) -> Result<Sftp> {
    Sftp::from_session(session.clone(), Default::default()).await
}

pub async fn read(sftp: &Sftp, path: &str) -> Result<String> {
    sftp.fs().read(path).await.map(|b| String::from_utf8(b)).??
}

pub async fn atomic_write(sftp: &Sftp, path: &str, contents: &str) -> Result<()> {
    let tmp = format!("{path}.tmp.{pid}", pid = std::process::id());
    sftp.fs().write(&tmp, contents).await?;
    // fsync on the remote — SFTP fsync extension when available
    sftp.fs().rename(&tmp, path).await?;
    Ok(())
}
```

Per-host connection lifecycle:
- Opened on first FS operation against that host
- Closed on workspace switch or app quit
- On unexpected disconnect: emit `ssh:disconnected` event; subsequent reads return `Err(SessionLost)` until next `ssh.open_session` succeeds
- ControlMaster path: rely on system `~/.ssh/config` settings; if not configured, set `ControlMaster auto / ControlPath ~/.ssh/cm-%r@%h:%p / ControlPersist 10m` via `SessionBuilder::known_hosts_check(...).control_master(...)` extensions (`openssh` crate's API)

## 8. FS watching strategy

| Scope | Mechanism | Notes |
|---|---|---|
| Local workspace file enumeration | `notify` crate (FSEvents on macOS) | Native, low overhead |
| Local currently-open sidecar | Same `notify` watcher, scoped to sidecar path | Sub-second update latency |
| Remote workspace enumeration | Poll `list_dir` mtime every 10s when workspace tree is visible | Acceptable for v1; revisit if user reports staleness |
| Remote currently-open sidecar | Poll `stat` mtime every `sidecarPollIntervalMs` (default 3s) | Cheap over SSH ControlMaster; only polls one file |
| Remote inotify / fswatch | **Deferred to v2** | Requires remote daemon or `inotifywait` tunnel; not MVP |

The frontend treats `fs:changed` events uniformly regardless of source.

## 9. Theming

1. System theme follow by default (`prefers-color-scheme` listener in webview).
2. Pierre Trees: pass `themeToTreeStyles(theme)` output as CSS variables to the tree's shadow root.
3. Pierre Diffs: pin `theme: { dark: 'github-dark', light: 'github-light' }` + dynamic `themeType` based on system preference. Override via settings for users who want custom Shiki themes.
4. CM6 editor: use a CM6 theme that matches the surrounding dark/light, with anchor-confidence colors defined in a shared CSS variable file consumed by both CM6 and the thread panel.
5. Bundle Shiki grammars on-demand: ship only `markdown` and `json` at startup; lazy-load others if the user opens an unfamiliar file type.

## 10. Build & dev tooling

- **Rust**: `cargo build`, `cargo test`, managed by `tauri-cli`
- **Frontend**: `npm install`, `npm run dev` (vite), `npm run build` (vite). `npm` is used instead of `bun` for parity with the existing `vscode-extension/` and `obsidian-plugin/` frontends — keeps tooling consistent across the three frontends, even though `bun` would be marginally faster.
- **Both**: `cargo tauri dev` (runs Rust + vite + opens the app with hot reload) and `cargo tauri build` (produces signed `.app` for distribution)
- **TS core sync**: `npm run sync-core` mirrors `dist/index.js` and `dist/index.d.ts` into `native-client/vendor/` (script modeled on `obsidian-plugin/scripts/sync-core.mjs`)
- **AJV standalone validator**: `npm run build-validator` runs at build time (`prebuild` / `predev` / `pretypecheck` hooks) and emits `src/app/generated/sidecar-validator.js`. This keeps the WKWebView's CSP at `default-src 'self'` with no `unsafe-eval` exception (AJV's standard `compile()` uses `new Function()` at runtime, which the default Tauri CSP blocks).
- **CI**: extend existing `.github/workflows/` with a `native-client.yml` that runs `cargo test` + `npm run typecheck` + `cargo tauri build --debug` on macOS runners. Build artifact is not published in MVP; gated for verification only.

## 11. Phased delivery cuts

### v0 (PR1 — read-only foundation) — ~3 weeks
- Local-only workspace open + restore-last-workspace
- File tree (Pierre Trees) with `{open_count}` badges
- Single-file open + render existing sidecar threads as CM6 decorations (strictly read-only editor)
- Minimal right-side thread panel (Open / Broken / Resolved sections)
- Sidecar parse-error mode with external-editor repair flow (`tauri-plugin-opener`)
- **No mutations.** No thread CRUD, no relink, no atomic write, no `mdc.invoke`.
- Acceptance: open a real md-collab `.md` + sidecar locally, view threads in panel + inline decorations, browse the tree, open a corrupt sidecar and trigger external repair

### v0.5 (PR2 — mutation foundation + functional relink) — ~3-4 weeks
- All sidecar mutations through `mdc.invoke` (no direct vendored-core writes)
- Editable CM6 for `.md` docs (save round-trip via `mdc doc save` or equivalent)
- Thread CRUD: create from selection, reply, resolve, reopen
- Functional broken-anchor relink via new core `manualRelinkThread` operation (coordinated TS core + CLI + sibling-frontend addition)
- Atomic sidecar write contract lives in `mdc` (already present); inherited by native client transparently
- Rich thread panel with message bodies + reply composer (replaces PR1's minimal panel)
- In-app JSON repair editor (additional repair path alongside PR1's external-editor flow)
- Acceptance: full thread lifecycle, round-trippable, sidecar byte-identical modulo timestamps

### v1 (target shippable MVP) — ~6-8 additional weeks
- Suggested-edit UI (propose / accept / reject) using Pierre Diffs (PR3)
- SSH workspace via `openssh` + SFTP (PR4)
- FS watching (notify local, poll remote) — replaces PR1's polling for badge counts (PR5)
- Rich thread panel + Settings panel UI (PR6)
- Cross-frontend invariant verification (open same file in VS Code, then native, then back; threads + anchors identical)
- Native macOS menu bar, command palette (Cmd+K), configurable keyboard shortcuts
- Code-signing + Developer ID + notarization (PR7)
- Acceptance: all 10 criteria in spec § 16

### v2 (deferred) — open-ended
- Remote daemon architecture (replaces poll-based SSH FS watch with push)
- Multi-host workspace federation
- App Store packaging (requires sandbox audit of SSH usage)
- Optional SwiftUI shell migration (re-host the same webview frontend)
- Cross-platform builds (Windows, Linux)
- Real-time multi-cursor (requires CRDT layer, separate spec)

## 12. Cross-frontend invariants

To keep the three frontends (VS Code, Obsidian, native) coherent:

1. **No new sidecar fields** introduced by the native client without updating `schemas/comments-sidecar.schema.json` and the TS core.
2. **No mutation paths bypassing TS core / `mdc`** — all writes route through `mdc.invoke` (§ 6). PR1 ships zero mutation paths; PR2 introduces all sidecar mutations through `mdc` invocation, preserving the cross-frontend invariant guarantee.
3. **Re-anchoring is deterministic**: a sidecar + a `.md` opened in the native client must produce the same anchor positions and confidence states as the VS Code extension. Verifiable via shared `tests/fixtures/anchors/` test cases — native client's Rust + JS test suite snapshots these via a vitest-based parity test (see `tests/native-client/parity/anchor-fixtures.test.ts`).
4. **Atomic write contract**: temporary file + rename + cleanup on failure, identical to TS core's `sidecar-file.ts` behavior. The native client inherits this transparently because all writes go through `mdc` (which uses the same `sidecar-file.ts`). No native atomic-write code is required.
5. **Sort order on serialize**: threads sorted by `anchor.primary.start.offset_utf16` ascending — captured normatively by `spec-for-anchor-engine-patches-from-jot.md` Patch 1, inherited by the native client transparently.

## 13. TS core dependencies

Native client v1 depends on the patches captured in `../../spec/backend/spec-for-anchor-engine-patches-from-jot.md`:

1. **Patch 1** — sort threads by `anchor.primary.start.offset_utf16` on serialization
2. **Patch 2** — anchor sanitization caps (`quote` ≤1000, `prefix`/`suffix` ≤200) in schema + operations
3. **Patch 3** — unified `ANCHOR_CONTEXT_WINDOW_CHARS` constant across all frontends
4. **Patch 4** — persist relocated `primary` after successful re-anchor; preserve `fallback` untouched

These are TS core changes benefiting all three frontends. Sequencing: Patches 1–3 in a single sprint before native client v0; Patch 4 alongside or shortly after. The native client inherits all four transparently via vendor sync — no native-client-specific code change required.

## 14. Open questions

1. **Directory name**: `native-client/` vs `desktop/` vs `tauri-app/`. Default: `native-client/`. Open to change.
2. **User-facing app name** in `Info.plist`: e.g. "md-collab" or "md-collab desktop" or something brand-new.
3. **`mdc` discovery on remote**: assume on `PATH` and shell out? Or ship our own `mdc` to the remote on first connect? MVP: assume on `PATH`; surface clear error if missing.
4. **Anchor decoration visual design**: borrow from VS Code extension's existing palette or design fresh? Suggest reuse for v0, polish in v1.
5. **CodeMirror 6 markdown preview mode**: enable for the native client (renders markdown formatting inline) or stay in plain-text mode? MVP: plain-text mode; preview-mode investigation in v1.
6. **Pierre components: 1.0.0-beta.3 risk**: pin to exact version; document upgrade path; revisit when 1.0.0 ships.
7. **Tauri 2 macOS code-signing**: distribution outside App Store requires a Developer ID. Document the signing flow in v1 README.

## 15. References

- Spec: `../../spec/frontend/spec-for-native-client-mvp.md`
- Research (substrate, components, anchor model):
  - `.ai/research/host-platform-reevaluation-2026-05-16.md`
  - `.ai/research/pierre-components-spike-2026-05-16.md`
  - `.ai/research/jot-anchor-model-analysis-2026-05-16.md`
- TS core: `src/`
- Schema: `schemas/comments-sidecar.schema.json`
- Sibling frontends: `vscode-extension/`, `obsidian-plugin/`
- Pierre Trees: https://github.com/pierrecomputer/pierre/tree/main/packages/trees
- Pierre Diffs: https://github.com/pierrecomputer/pierre/tree/main/packages/diffs
- CodeMirror 6 decorations: https://codemirror.net/docs/guide/#decorations
- Tauri 2: https://v2.tauri.app/
- `openssh` Rust crate: https://github.com/openssh-rust/openssh
- `openssh-sftp-client` crate: https://docs.rs/openssh-sftp-client/
- `notify` (FS watch): https://docs.rs/notify/
