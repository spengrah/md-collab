//! Stable IPC error envelope. The webview matches on `code` only; never on `message`.

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize, Clone, PartialEq, Eq)]
#[serde(tag = "code")]
pub enum IpcError {
    #[error("not found: {path}")]
    #[serde(rename = "FS_NOT_FOUND")]
    FsNotFound { path: String, message: String },

    #[error("permission denied: {path}")]
    #[serde(rename = "FS_PERMISSION_DENIED")]
    FsPermissionDenied { path: String, message: String },

    #[error("io error: {message}")]
    #[serde(rename = "FS_IO")]
    FsIo { message: String },

    #[error("invalid workspace: {path}")]
    #[serde(rename = "WORKSPACE_INVALID")]
    WorkspaceInvalid { path: String, message: String },

    #[error("path validation failed: {message}")]
    #[serde(rename = "PATH_INVALID")]
    PathInvalid { message: String },

    #[error("not implemented: {message}")]
    #[serde(rename = "NOT_IMPLEMENTED")]
    NotImplemented { message: String },

    #[error("internal error: {message}")]
    #[serde(rename = "INTERNAL")]
    Internal { message: String },
}

impl IpcError {
    pub fn fs_not_found(path: impl Into<String>) -> Self {
        let path = path.into();
        let message = format!("file not found: {path}");
        Self::FsNotFound { path, message }
    }

    pub fn fs_permission_denied(path: impl Into<String>) -> Self {
        let path = path.into();
        let message = format!("permission denied: {path}");
        Self::FsPermissionDenied { path, message }
    }

    pub fn fs_io(message: impl Into<String>) -> Self {
        Self::FsIo {
            message: message.into(),
        }
    }

    pub fn workspace_invalid(path: impl Into<String>, message: impl Into<String>) -> Self {
        Self::WorkspaceInvalid {
            path: path.into(),
            message: message.into(),
        }
    }

    pub fn path_invalid(message: impl Into<String>) -> Self {
        Self::PathInvalid {
            message: message.into(),
        }
    }

    pub fn not_implemented(message: impl Into<String>) -> Self {
        Self::NotImplemented {
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal {
            message: message.into(),
        }
    }
}

impl From<std::io::Error> for IpcError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => IpcError::FsNotFound {
                path: String::new(),
                message: err.to_string(),
            },
            std::io::ErrorKind::PermissionDenied => IpcError::FsPermissionDenied {
                path: String::new(),
                message: err.to_string(),
            },
            _ => IpcError::FsIo {
                message: err.to_string(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ipc_error_serializes_with_code_fs_not_found() {
        let err = IpcError::fs_not_found("/tmp/missing");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "FS_NOT_FOUND");
        assert_eq!(json["path"], "/tmp/missing");
        assert!(json["message"].is_string());
    }

    #[test]
    fn ipc_error_serializes_with_code_not_implemented() {
        let err = IpcError::not_implemented("ssh");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "NOT_IMPLEMENTED");
        assert_eq!(json["message"], "ssh");
    }

    #[test]
    fn ipc_error_serializes_with_code_internal() {
        let err = IpcError::internal("oops");
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "INTERNAL");
    }
}
