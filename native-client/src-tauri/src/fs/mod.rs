//! FS adapter — enum-dispatched (Local in PR1; Ssh stub for PR4).

pub mod local;
pub mod ssh;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::errors::IpcError;

/// Workspace-relative POSIX-style path. Constructor rejects:
///   - absolute paths
///   - `..` traversal segments
///   - empty segments / weird whitespace
///
/// The newtype is the **only** input shape commands accept for "give me a path
/// inside the workspace". This is the single chokepoint for path validation.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct RelPath(String);

impl RelPath {
    pub fn new(input: impl AsRef<str>) -> Result<Self, IpcError> {
        let raw = input.as_ref();
        if raw.is_empty() {
            return Err(IpcError::path_invalid("empty path"));
        }
        // Reject Windows-drive prefixes too (defense-in-depth for cross-platform tests).
        if raw.starts_with('/') || raw.starts_with('\\') || raw.contains(":\\") {
            return Err(IpcError::path_invalid(format!("absolute path: {raw}")));
        }

        // Reject any segment equal to ".." (case-sensitive). Allow segments like "..hidden".
        let path = Path::new(raw);
        for component in path.components() {
            use std::path::Component;
            match component {
                Component::ParentDir => {
                    return Err(IpcError::path_invalid(format!("traversal: {raw}")));
                }
                Component::Prefix(_) | Component::RootDir => {
                    return Err(IpcError::path_invalid(format!("absolute path: {raw}")));
                }
                Component::CurDir => {
                    // "./foo" is fine; strip it during normalization.
                }
                Component::Normal(seg) => {
                    if seg.is_empty() {
                        return Err(IpcError::path_invalid("empty segment"));
                    }
                }
            }
        }

        // Normalize to forward slashes for stable serialization across platforms.
        let normalized = raw.replace('\\', "/");
        Ok(RelPath(normalized))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn to_path_buf(&self) -> PathBuf {
        PathBuf::from(&self.0)
    }

    /// Resolve against a workspace root. Returns the absolute path or an error
    /// if the resolved path escapes the root (defense-in-depth).
    pub fn resolve_within(&self, root: &Path) -> Result<PathBuf, IpcError> {
        let candidate = root.join(&self.0);
        // We cannot canonicalize here without touching the FS; instead, verify
        // that joining did not introduce a `..` or absolute reset.
        if !candidate.starts_with(root) {
            return Err(IpcError::path_invalid(format!(
                "resolved path escapes workspace: {}",
                self.0
            )));
        }
        Ok(candidate)
    }

    /// Compute the sidecar path for a `.md` document: append `.comments.json`.
    /// Returns `None` if this RelPath does not end with `.md`.
    pub fn sidecar(&self) -> Option<RelPath> {
        if !self.0.ends_with(".md") {
            return None;
        }
        RelPath::new(format!("{}.comments.json", self.0)).ok()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct StatInfo {
    pub mtime_ms: u64,
    pub size: u64,
    pub is_file: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SidecarRead {
    pub contents: String,
    pub mtime_ms: u64,
}

/// Enum dispatch: PR4 adds `Ssh(SshFs)` here in one place.
pub enum FsAdapter {
    Local(local::LocalFs),
    /// Reserved for PR4. PR1 leaves the variant unused; constructing it is
    /// allowed (we want to verify the stub compiles) but every method returns
    /// `NotImplemented`.
    #[allow(dead_code)]
    Ssh(ssh::SshFs),
}

impl FsAdapter {
    pub fn root(&self) -> &Path {
        match self {
            FsAdapter::Local(fs) => fs.root(),
            FsAdapter::Ssh(fs) => fs.root(),
        }
    }

    pub async fn list_markdown(
        &self,
        exclude_globs: &globset::GlobSet,
    ) -> Result<Vec<RelPath>, IpcError> {
        match self {
            FsAdapter::Local(fs) => fs.list_markdown(exclude_globs).await,
            FsAdapter::Ssh(fs) => fs.list_markdown(exclude_globs).await,
        }
    }

    pub async fn read_file(&self, rel: &RelPath) -> Result<String, IpcError> {
        match self {
            FsAdapter::Local(fs) => fs.read_file(rel).await,
            FsAdapter::Ssh(fs) => fs.read_file(rel).await,
        }
    }

    pub async fn read_sidecar(&self, doc_rel: &RelPath) -> Result<Option<SidecarRead>, IpcError> {
        match self {
            FsAdapter::Local(fs) => fs.read_sidecar(doc_rel).await,
            FsAdapter::Ssh(fs) => fs.read_sidecar(doc_rel).await,
        }
    }

    pub async fn stat(&self, rel: &RelPath) -> Result<StatInfo, IpcError> {
        match self {
            FsAdapter::Local(fs) => fs.stat(rel).await,
            FsAdapter::Ssh(fs) => fs.stat(rel).await,
        }
    }

    /// Resolve a workspace-relative path to an absolute path on the host FS.
    /// Used by the `fs_open_sidecar_externally` command after it has validated
    /// the path is a sidecar under the workspace root.
    pub fn resolve_absolute(&self, rel: &RelPath) -> Result<PathBuf, IpcError> {
        match self {
            FsAdapter::Local(fs) => rel.resolve_within(fs.root()),
            FsAdapter::Ssh(_) => Err(IpcError::not_implemented(
                "ssh resolve_absolute (PR4)",
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rel_path_rejects_absolute() {
        assert!(RelPath::new("/etc/passwd").is_err());
        assert!(RelPath::new("\\\\Windows\\System32").is_err());
    }

    #[test]
    fn rel_path_rejects_traversal() {
        assert!(RelPath::new("../foo").is_err());
        assert!(RelPath::new("a/../b").is_err());
        assert!(RelPath::new("a/b/..").is_err());
    }

    #[test]
    fn rel_path_rejects_empty() {
        assert!(RelPath::new("").is_err());
    }

    #[test]
    fn rel_path_accepts_dotfiles() {
        // ".hidden" is a valid segment (it's not "..").
        assert!(RelPath::new(".hidden/foo.md").is_ok());
    }

    #[test]
    fn rel_path_accepts_simple_relative() {
        let p = RelPath::new("docs/README.md").unwrap();
        assert_eq!(p.as_str(), "docs/README.md");
    }

    #[test]
    fn rel_path_normalizes_backslashes() {
        let p = RelPath::new("docs\\nested\\file.md").unwrap();
        assert_eq!(p.as_str(), "docs/nested/file.md");
    }

    #[test]
    fn rel_path_sidecar() {
        let p = RelPath::new("docs/README.md").unwrap();
        let sc = p.sidecar().unwrap();
        assert_eq!(sc.as_str(), "docs/README.md.comments.json");
    }

    #[test]
    fn rel_path_sidecar_non_md_returns_none() {
        let p = RelPath::new("docs/README.txt").unwrap();
        assert!(p.sidecar().is_none());
    }
}
