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

/// Mutable app state behind a single mutex. Workspace + settings live here; the
/// webview observes them through `#[tauri::command]` getters and refresh calls.
pub struct AppState {
    pub workspace: Mutex<Option<workspace::Workspace>>,
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
                workspace: Mutex::new(None),
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
            commands::settings_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
