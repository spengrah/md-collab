//! Persisted state on disk: `~/Library/Application Support/md-collab/state.json`
//! (or whatever Tauri's `app_local_data_dir()` resolves to).
//!
//! Forward-compat is achieved via `#[serde(flatten)] unknown` blocks on both the
//! top-level `PersistedState` and the nested `Settings`. An older binary reading
//! a newer file preserves any unrecognized keys through a serialize-deserialize
//! cycle. Migration policy: bump `schema_version` only on breaking changes
//! (renamed/retyped keys). Additive keys do not require a bump.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::errors::IpcError;

pub const STATE_FILE_NAME: &str = "state.json";
pub const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ThemeChoice {
    Auto,
    Light,
    Dark,
}

impl Default for ThemeChoice {
    fn default() -> Self {
        ThemeChoice::Auto
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Settings {
    pub author_id: String,
    pub author_label: String,
    pub show_resolved_inline: bool,
    pub reanchor_on_open: bool,
    pub sidecar_poll_interval_ms: u32,
    pub workspace_exclude_patterns: Vec<String>,
    pub ui_theme: ThemeChoice,
    pub ssh_default_control_master: bool,
    /// Forward-compat sink. Any keys the current binary doesn't recognize live
    /// here and round-trip on the next write.
    #[serde(flatten, default)]
    pub unknown: serde_json::Map<String, serde_json::Value>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            author_id: String::new(),
            author_label: String::new(),
            show_resolved_inline: false,
            reanchor_on_open: true,
            sidecar_poll_interval_ms: 3000,
            workspace_exclude_patterns: Vec::new(),
            ui_theme: ThemeChoice::Auto,
            ssh_default_control_master: true,
            unknown: serde_json::Map::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PersistedState {
    pub schema_version: u32,
    pub last_workspace: Option<PathBuf>,
    pub settings: Settings,
    #[serde(flatten, default)]
    pub unknown: serde_json::Map<String, serde_json::Value>,
}

impl Default for PersistedState {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_SCHEMA_VERSION,
            last_workspace: None,
            settings: Settings::default(),
            unknown: serde_json::Map::new(),
        }
    }
}

impl PersistedState {
    pub fn load_from(data_dir: &Path) -> Result<Self, IpcError> {
        let path = data_dir.join(STATE_FILE_NAME);
        match fs::read_to_string(&path) {
            Ok(contents) => {
                // Tolerate partial keys (older versions) by deserializing into a
                // generic Value first and merging in defaults for any missing
                // field. The flattened `unknown` map captures any extras.
                let value: serde_json::Value = serde_json::from_str(&contents)
                    .map_err(|e| IpcError::internal(format!("state.json parse: {e}")))?;
                let merged = merge_with_defaults(value);
                let state: PersistedState = serde_json::from_value(merged)
                    .map_err(|e| IpcError::internal(format!("state.json deserialize: {e}")))?;
                Ok(state)
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(err) => Err(IpcError::fs_io(format!("state.json: {err}"))),
        }
    }

    pub fn save_to(&self, data_dir: &Path) -> Result<(), IpcError> {
        fs::create_dir_all(data_dir)
            .map_err(|e| IpcError::fs_io(format!("create_dir_all: {e}")))?;
        let path = data_dir.join(STATE_FILE_NAME);
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| IpcError::internal(format!("state.json serialize: {e}")))?;
        fs::write(&path, json).map_err(|e| IpcError::fs_io(format!("state.json write: {e}")))?;
        Ok(())
    }
}

/// Merge an on-disk JSON value with `PersistedState::default()`. Missing keys
/// in the on-disk file are filled from defaults; extra keys are preserved by
/// the `#[serde(flatten)] unknown` field once deserialization runs.
fn merge_with_defaults(mut value: serde_json::Value) -> serde_json::Value {
    let defaults = serde_json::to_value(PersistedState::default()).expect("defaults serialize");

    let serde_json::Value::Object(ref mut obj) = value else {
        return defaults;
    };
    let serde_json::Value::Object(default_obj) = defaults else {
        return value;
    };

    for (k, v) in default_obj {
        if k == "settings" {
            // Settings sub-object: merge keys.
            let serde_json::Value::Object(ref mut settings_obj) = *obj
                .entry("settings".to_string())
                .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()))
            else {
                obj.insert(k, v);
                continue;
            };
            let serde_json::Value::Object(default_settings) = v else { continue };
            for (sk, sv) in default_settings {
                settings_obj.entry(sk).or_insert(sv);
            }
        } else {
            obj.entry(k).or_insert(v);
        }
    }
    value
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn state_roundtrip() {
        let dir = TempDir::new().unwrap();
        let mut state = PersistedState::default();
        state.last_workspace = Some(PathBuf::from("/tmp/workspace"));
        state.settings.author_id = "alice".to_string();
        state.save_to(dir.path()).unwrap();
        let loaded = PersistedState::load_from(dir.path()).unwrap();
        assert_eq!(loaded.last_workspace, Some(PathBuf::from("/tmp/workspace")));
        assert_eq!(loaded.settings.author_id, "alice");
        assert_eq!(loaded.schema_version, CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn state_missing_returns_defaults() {
        let dir = TempDir::new().unwrap();
        let loaded = PersistedState::load_from(dir.path()).unwrap();
        assert_eq!(loaded, PersistedState::default());
    }

    #[test]
    fn state_partial_keys_filled() {
        let dir = TempDir::new().unwrap();
        // Write a minimal state.json with only `last_workspace`. Everything else
        // should come from defaults.
        let json = r#"{ "last_workspace": "/tmp/ws" }"#;
        fs::write(dir.path().join(STATE_FILE_NAME), json).unwrap();
        let loaded = PersistedState::load_from(dir.path()).unwrap();
        assert_eq!(loaded.last_workspace, Some(PathBuf::from("/tmp/ws")));
        assert_eq!(loaded.settings.sidecar_poll_interval_ms, 3000);
        assert_eq!(loaded.settings.ui_theme, ThemeChoice::Auto);
        assert!(loaded.settings.reanchor_on_open);
        assert_eq!(loaded.schema_version, CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn state_unknown_keys_preserved() {
        let dir = TempDir::new().unwrap();
        // Future binary writes a key we don't know.
        let json = r#"{
            "schema_version": 1,
            "last_workspace": null,
            "settings": {
                "author_id": "",
                "author_label": "",
                "show_resolved_inline": false,
                "reanchor_on_open": true,
                "sidecar_poll_interval_ms": 3000,
                "workspace_exclude_patterns": [],
                "ui_theme": "auto",
                "ssh_default_control_master": true,
                "future_only_setting": "experimental-value"
            },
            "future_only_top_level": { "foo": 42 }
        }"#;
        fs::write(dir.path().join(STATE_FILE_NAME), json).unwrap();
        let loaded = PersistedState::load_from(dir.path()).unwrap();
        assert_eq!(
            loaded.settings.unknown.get("future_only_setting"),
            Some(&serde_json::json!("experimental-value"))
        );
        assert_eq!(
            loaded.unknown.get("future_only_top_level"),
            Some(&serde_json::json!({ "foo": 42 }))
        );

        // Round-trip: save and reload, keys must still be present.
        loaded.save_to(dir.path()).unwrap();
        let reloaded = PersistedState::load_from(dir.path()).unwrap();
        assert_eq!(
            reloaded.settings.unknown.get("future_only_setting"),
            Some(&serde_json::json!("experimental-value"))
        );
        assert_eq!(
            reloaded.unknown.get("future_only_top_level"),
            Some(&serde_json::json!({ "foo": 42 }))
        );
    }
}
