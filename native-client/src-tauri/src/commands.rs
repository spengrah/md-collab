//! Tauri IPC command surface. All commands return `Result<T, IpcError>` so the
//! webview sees a stable `{ code, ... }` envelope on errors.

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::errors::IpcError;
use crate::fs::{RelPath, SidecarRead, StatInfo};
use crate::state::PersistedState;
use crate::workspace::{ThreadCountsDelta, Workspace, WorkspaceState};
use crate::AppState;

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, IpcError> {
    app.path()
        .app_local_data_dir()
        .map_err(|e| IpcError::internal(format!("app_local_data_dir: {e}")))
}

#[tauri::command]
pub async fn workspace_open(
    root: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<WorkspaceState, IpcError> {
    let path = PathBuf::from(&root);
    if !path.is_absolute() {
        return Err(IpcError::workspace_invalid(
            root.clone(),
            "workspace path must be absolute",
        ));
    }

    let exclude_patterns = {
        let guard = state
            .persisted
            .lock()
            .map_err(|e| IpcError::internal(format!("persisted lock poisoned: {e}")))?;
        guard.settings.workspace_exclude_patterns.clone()
    };

    let workspace = Workspace::open_local(path.clone(), &exclude_patterns).await?;
    let snapshot = workspace.snapshot();

    {
        let mut guard = state
            .workspace
            .lock()
            .map_err(|e| IpcError::internal(format!("workspace lock poisoned: {e}")))?;
        *guard = Some(workspace);
    }

    // Persist last_workspace.
    {
        let mut persisted = state
            .persisted
            .lock()
            .map_err(|e| IpcError::internal(format!("persisted lock poisoned: {e}")))?;
        persisted.last_workspace = Some(path);
        if let Ok(dir) = app_data_dir(&app) {
            if let Err(err) = persisted.save_to(&dir) {
                log::warn!("could not persist last_workspace: {err}");
            }
        }
    }

    Ok(snapshot)
}

#[tauri::command]
pub async fn workspace_current(state: State<'_, AppState>) -> Result<Option<WorkspaceState>, IpcError> {
    let guard = state
        .workspace
        .lock()
        .map_err(|e| IpcError::internal(format!("workspace lock poisoned: {e}")))?;
    Ok(guard.as_ref().map(|ws| ws.snapshot()))
}

#[tauri::command]
pub async fn workspace_list_markdown(
    state: State<'_, AppState>,
) -> Result<Vec<RelPath>, IpcError> {
    let guard = state
        .workspace
        .lock()
        .map_err(|e| IpcError::internal(format!("workspace lock poisoned: {e}")))?;
    let ws = guard
        .as_ref()
        .ok_or_else(|| IpcError::workspace_invalid(String::new(), "no workspace open"))?;
    Ok(ws.files().to_vec())
}

#[tauri::command]
pub async fn workspace_refresh_counts(
    state: State<'_, AppState>,
) -> Result<ThreadCountsDelta, IpcError> {
    // We need an async path while holding the workspace; take it out, refresh,
    // put it back. This is fine because only one refresh is in flight at a time
    // (the webview polls; we don't fan out).
    let mut workspace = {
        let mut guard = state
            .workspace
            .lock()
            .map_err(|e| IpcError::internal(format!("workspace lock poisoned: {e}")))?;
        guard.take().ok_or_else(|| {
            IpcError::workspace_invalid(String::new(), "no workspace open")
        })?
    };

    let result = workspace.refresh_counts().await;

    {
        let mut guard = state
            .workspace
            .lock()
            .map_err(|e| IpcError::internal(format!("workspace lock poisoned: {e}")))?;
        *guard = Some(workspace);
    }

    result
}

#[tauri::command]
pub async fn fs_read_file(
    rel: String,
    state: State<'_, AppState>,
) -> Result<String, IpcError> {
    let rel = RelPath::new(&rel)?;
    let workspace = {
        let mut guard = state
            .workspace
            .lock()
            .map_err(|e| IpcError::internal(format!("workspace lock poisoned: {e}")))?;
        guard.take().ok_or_else(|| {
            IpcError::workspace_invalid(String::new(), "no workspace open")
        })?
    };

    let result = workspace.adapter().read_file(&rel).await;

    {
        let mut guard = state
            .workspace
            .lock()
            .map_err(|e| IpcError::internal(format!("workspace lock poisoned: {e}")))?;
        *guard = Some(workspace);
    }

    result
}

#[tauri::command]
pub async fn fs_read_sidecar(
    doc_rel: String,
    state: State<'_, AppState>,
) -> Result<Option<SidecarRead>, IpcError> {
    let rel = RelPath::new(&doc_rel)?;
    let workspace = {
        let mut guard = state
            .workspace
            .lock()
            .map_err(|e| IpcError::internal(format!("workspace lock poisoned: {e}")))?;
        guard.take().ok_or_else(|| {
            IpcError::workspace_invalid(String::new(), "no workspace open")
        })?
    };

    let result = workspace.adapter().read_sidecar(&rel).await;

    {
        let mut guard = state
            .workspace
            .lock()
            .map_err(|e| IpcError::internal(format!("workspace lock poisoned: {e}")))?;
        *guard = Some(workspace);
    }

    result
}

#[tauri::command]
pub async fn fs_stat(
    rel: String,
    state: State<'_, AppState>,
) -> Result<StatInfo, IpcError> {
    let rel = RelPath::new(&rel)?;
    let workspace = {
        let mut guard = state
            .workspace
            .lock()
            .map_err(|e| IpcError::internal(format!("workspace lock poisoned: {e}")))?;
        guard.take().ok_or_else(|| {
            IpcError::workspace_invalid(String::new(), "no workspace open")
        })?
    };

    let result = workspace.adapter().stat(&rel).await;

    {
        let mut guard = state
            .workspace
            .lock()
            .map_err(|e| IpcError::internal(format!("workspace lock poisoned: {e}")))?;
        *guard = Some(workspace);
    }

    result
}

/// Launch the user's macOS default `.json` handler on a sidecar path.
///
/// Validation: (a) `RelPath` rejects absolute paths / traversal. (b) Path must
/// end in `.comments.json`. (c) Resolve must stay under workspace root.
/// Only then do we invoke `tauri-plugin-opener`'s `open_path()`.
#[tauri::command]
pub async fn fs_open_sidecar_externally(
    sidecar_rel: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), IpcError> {
    let rel = RelPath::new(&sidecar_rel)?;
    if !rel.as_str().ends_with(".comments.json") {
        return Err(IpcError::path_invalid(format!(
            "not a sidecar path: {sidecar_rel}"
        )));
    }

    let abs = {
        let mut guard = state
            .workspace
            .lock()
            .map_err(|e| IpcError::internal(format!("workspace lock poisoned: {e}")))?;
        let ws = guard
            .as_mut()
            .ok_or_else(|| IpcError::workspace_invalid(String::new(), "no workspace open"))?;
        let abs = ws.adapter().resolve_absolute(&rel)?;
        if !abs.exists() {
            return Err(IpcError::fs_not_found(abs.display().to_string()));
        }
        abs
    };

    app.opener()
        .open_path(abs.to_string_lossy(), None::<&str>)
        .map_err(|e| IpcError::internal(format!("opener: {e}")))?;
    Ok(())
}

#[derive(Serialize)]
pub struct SettingsPayload {
    pub state: PersistedState,
}

#[tauri::command]
pub async fn settings_load(state: State<'_, AppState>) -> Result<PersistedState, IpcError> {
    let guard = state
        .persisted
        .lock()
        .map_err(|e| IpcError::internal(format!("persisted lock poisoned: {e}")))?;
    Ok(guard.clone())
}

#[tauri::command]
pub async fn settings_save(
    next: PersistedState,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), IpcError> {
    let dir = app_data_dir(&app)?;
    next.save_to(&dir)?;
    let mut guard = state
        .persisted
        .lock()
        .map_err(|e| IpcError::internal(format!("persisted lock poisoned: {e}")))?;
    *guard = next;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_externally_rejects_non_sidecar_path() {
        // We test the validation predicate directly because we can't easily
        // construct an AppHandle in a unit test. Symmetric coverage to the
        // documented commands_open_externally_rejects_non_sidecar test in the
        // plan § 8.1.
        let bad = RelPath::new("docs/notes.md").unwrap();
        assert!(!bad.as_str().ends_with(".comments.json"));

        let good = RelPath::new("docs/notes.md.comments.json").unwrap();
        assert!(good.as_str().ends_with(".comments.json"));
    }

    #[test]
    fn open_externally_rejects_absolute_path_via_rel_path() {
        // Absolute paths can never reach the validation chain because RelPath
        // rejects them at construction time.
        assert!(RelPath::new("/etc/hosts.comments.json").is_err());
    }

    #[test]
    fn open_externally_rejects_traversal_via_rel_path() {
        assert!(RelPath::new("../escape.comments.json").is_err());
    }
}
