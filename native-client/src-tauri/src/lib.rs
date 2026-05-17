//! md-collab native client (Tauri 2) — read-only PR1 foundation.
//!
//! Architecture: see `.ai/log/plan/native-client-mvp-pr1-foundation.md` §4.1.
//! All FS access goes through `fs::FsAdapter` (enum dispatch). The webview never
//! gets a direct FS allowlist; it talks to the Rust commands in `commands.rs`.

pub mod commands;
pub mod errors;
pub mod fs;
pub mod state;
pub mod workspace;

use std::sync::Mutex;
use tauri::Manager;
use tokio::sync::Mutex as AsyncMutex;

/// Mutable app state. The workspace lives behind an **async** mutex because
/// FS reads are awaited while holding the lock; sync mutexes would force the
/// take-and-restore pattern that Codex round-1 finding #1 flagged as
/// racing under concurrent IPC during the polling loop. Settings stay behind
/// a sync mutex because reads are synchronous.
pub struct AppState {
    pub workspace: AsyncMutex<Option<workspace::Workspace>>,
    pub persisted: Mutex<state::PersistedState>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::try_init().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Load persisted state from app_local_data_dir. Failures are tolerated:
            // missing file ⇒ defaults; corrupt ⇒ logged, defaults used.
            let data_dir = app
                .path()
                .app_local_data_dir()
                .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;
            let persisted = state::PersistedState::load_from(&data_dir).unwrap_or_else(|err| {
                log::warn!("Failed to load persisted state ({err}); using defaults");
                state::PersistedState::default()
            });

            app.manage(AppState {
                workspace: AsyncMutex::new(None),
                persisted: Mutex::new(persisted),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workspace_open,
            commands::workspace_current,
            commands::workspace_list_markdown,
            commands::workspace_refresh_counts,
            commands::fs_read_file,
            commands::fs_read_sidecar,
            commands::fs_open_sidecar_externally,
            commands::fs_stat,
            commands::settings_load,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
