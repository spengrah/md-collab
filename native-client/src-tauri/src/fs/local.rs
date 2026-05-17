//! Local filesystem adapter — read-only.
//!
//! All methods are async (mirroring future SSH variant); local IO runs via
//! `tokio::fs`. Built-in exclude directories are baked in here; user-supplied
//! globs are layered on top in `Workspace::open`.

use std::path::{Path, PathBuf};
use std::time::SystemTime;

use globset::GlobSet;
use walkdir::WalkDir;

use crate::errors::IpcError;

use super::{RelPath, SidecarRead, StatInfo};

const BUILTIN_EXCLUDED_DIRS: &[&str] = &[".git", "node_modules", "dist", "target"];

pub struct LocalFs {
    root: PathBuf,
}

impl LocalFs {
    pub fn new(root: impl Into<PathBuf>) -> Result<Self, IpcError> {
        let root = root.into();
        if !root.is_absolute() {
            return Err(IpcError::workspace_invalid(
                root.display().to_string(),
                "workspace root must be absolute",
            ));
        }
        if !root.is_dir() {
            return Err(IpcError::workspace_invalid(
                root.display().to_string(),
                "workspace root is not a directory",
            ));
        }
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Walk the workspace and return all `.md` files (relative paths, forward slashes).
    /// `walkdir` is synchronous; for PR1 workspaces (<1000 files) this is fine. SSH
    /// variant will use an async walk in PR4.
    pub async fn list_markdown(&self, exclude_globs: &GlobSet) -> Result<Vec<RelPath>, IpcError> {
        let root = self.root.clone();
        let exclude = exclude_globs.clone();
        tokio::task::spawn_blocking(move || list_markdown_blocking(&root, &exclude))
            .await
            .map_err(|err| IpcError::internal(format!("list_markdown join: {err}")))?
    }

    pub async fn read_file(&self, rel: &RelPath) -> Result<String, IpcError> {
        let abs = rel.resolve_within(&self.root)?;
        tokio::fs::read_to_string(&abs).await.map_err(|err| {
            map_io_error(err, &abs)
        })
    }

    pub async fn read_sidecar(&self, doc_rel: &RelPath) -> Result<Option<SidecarRead>, IpcError> {
        let Some(side_rel) = doc_rel.sidecar() else {
            return Ok(None);
        };
        let abs = side_rel.resolve_within(&self.root)?;
        match tokio::fs::read_to_string(&abs).await {
            Ok(contents) => {
                let metadata = tokio::fs::metadata(&abs)
                    .await
                    .map_err(|err| map_io_error(err, &abs))?;
                let mtime_ms = metadata
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                Ok(Some(SidecarRead { contents, mtime_ms }))
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(err) => Err(map_io_error(err, &abs)),
        }
    }

    pub async fn stat(&self, rel: &RelPath) -> Result<StatInfo, IpcError> {
        let abs = rel.resolve_within(&self.root)?;
        let metadata = tokio::fs::metadata(&abs)
            .await
            .map_err(|err| map_io_error(err, &abs))?;
        let mtime_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        Ok(StatInfo {
            mtime_ms,
            size: metadata.len(),
            is_file: metadata.is_file(),
        })
    }
}

fn map_io_error(err: std::io::Error, abs: &Path) -> IpcError {
    match err.kind() {
        std::io::ErrorKind::NotFound => IpcError::fs_not_found(abs.display().to_string()),
        std::io::ErrorKind::PermissionDenied => {
            IpcError::fs_permission_denied(abs.display().to_string())
        }
        _ => IpcError::fs_io(format!("{}: {err}", abs.display())),
    }
}

fn list_markdown_blocking(root: &Path, exclude: &GlobSet) -> Result<Vec<RelPath>, IpcError> {
    let mut out = Vec::new();
    let walker = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            // Apply built-in dir excludes at the directory level so we don't
            // descend into massive trees like node_modules.
            if entry.file_type().is_dir() && entry.depth() > 0 {
                if let Some(name) = entry.file_name().to_str() {
                    if BUILTIN_EXCLUDED_DIRS.contains(&name) {
                        return false;
                    }
                }
            }
            true
        });

    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(err) => {
                // A single unreadable directory should not abort the whole scan.
                log::warn!("walkdir error: {err}");
                continue;
            }
        };

        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let Some(ext) = path.extension() else {
            continue;
        };
        if ext != "md" {
            continue;
        }

        let rel = match path.strip_prefix(root) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let rel_str = rel.to_string_lossy().replace('\\', "/");

        // Apply user-supplied glob excludes.
        if exclude.is_match(&rel_str) {
            continue;
        }

        match RelPath::new(&rel_str) {
            Ok(p) => out.push(p),
            Err(err) => {
                log::warn!("skipping path {rel_str}: {err}");
            }
        }
    }

    out.sort_by(|a, b| a.as_str().cmp(b.as_str()));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use globset::GlobSetBuilder;
    use std::fs;
    use tempfile::TempDir;

    fn empty_globset() -> GlobSet {
        GlobSetBuilder::new().build().unwrap()
    }

    fn globset_from(patterns: &[&str]) -> GlobSet {
        let mut builder = GlobSetBuilder::new();
        for p in patterns {
            builder.add(globset::Glob::new(p).unwrap());
        }
        builder.build().unwrap()
    }

    #[tokio::test]
    async fn local_fs_lists_markdown_only() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.md"), "alpha").unwrap();
        fs::write(dir.path().join("b.txt"), "ignored").unwrap();
        fs::write(dir.path().join("c.md"), "charlie").unwrap();
        fs::create_dir_all(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join("sub/d.md"), "delta").unwrap();

        let fs = LocalFs::new(dir.path()).unwrap();
        let out = fs.list_markdown(&empty_globset()).await.unwrap();
        let names: Vec<&str> = out.iter().map(|r| r.as_str()).collect();
        assert_eq!(names, vec!["a.md", "c.md", "sub/d.md"]);
    }

    #[tokio::test]
    async fn local_fs_excludes_defaults() {
        let dir = TempDir::new().unwrap();
        for d in &["node_modules", ".git", "dist", "target"] {
            fs::create_dir_all(dir.path().join(d)).unwrap();
            fs::write(dir.path().join(d).join("README.md"), "x").unwrap();
        }
        fs::write(dir.path().join("kept.md"), "y").unwrap();

        let fs = LocalFs::new(dir.path()).unwrap();
        let out = fs.list_markdown(&empty_globset()).await.unwrap();
        let names: Vec<&str> = out.iter().map(|r| r.as_str()).collect();
        assert_eq!(names, vec!["kept.md"]);
    }

    #[tokio::test]
    async fn local_fs_excludes_user_globs() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("keep.md"), "x").unwrap();
        fs::write(dir.path().join("drop.tmp.md"), "y").unwrap();
        fs::create_dir_all(dir.path().join("build")).unwrap();
        fs::write(dir.path().join("build/skip.md"), "z").unwrap();

        let fs = LocalFs::new(dir.path()).unwrap();
        let exclude = globset_from(&["*.tmp.md", "build/**"]);
        let out = fs.list_markdown(&exclude).await.unwrap();
        let names: Vec<&str> = out.iter().map(|r| r.as_str()).collect();
        assert_eq!(names, vec!["keep.md"]);
    }

    #[tokio::test]
    async fn local_fs_read_file_returns_contents() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("hello.md"), "hello world").unwrap();
        let fs = LocalFs::new(dir.path()).unwrap();
        let s = fs
            .read_file(&RelPath::new("hello.md").unwrap())
            .await
            .unwrap();
        assert_eq!(s, "hello world");
    }

    #[tokio::test]
    async fn local_fs_read_file_missing_maps_to_not_found() {
        let dir = TempDir::new().unwrap();
        let fs = LocalFs::new(dir.path()).unwrap();
        let err = fs
            .read_file(&RelPath::new("missing.md").unwrap())
            .await
            .unwrap_err();
        match err {
            IpcError::FsNotFound { .. } => {}
            other => panic!("expected FsNotFound, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn local_fs_read_sidecar_missing_returns_none() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.md"), "alpha").unwrap();
        let fs = LocalFs::new(dir.path()).unwrap();
        let out = fs
            .read_sidecar(&RelPath::new("a.md").unwrap())
            .await
            .unwrap();
        assert!(out.is_none());
    }

    #[tokio::test]
    async fn local_fs_read_sidecar_present_returns_some() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.md"), "alpha").unwrap();
        fs::write(dir.path().join("a.md.comments.json"), "{}").unwrap();
        let fs = LocalFs::new(dir.path()).unwrap();
        let out = fs
            .read_sidecar(&RelPath::new("a.md").unwrap())
            .await
            .unwrap()
            .expect("expected Some");
        assert_eq!(out.contents, "{}");
        assert!(out.mtime_ms > 0);
    }

    #[tokio::test]
    async fn local_fs_stat_returns_mtime_and_size() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.md"), "alphabet").unwrap();
        let fs = LocalFs::new(dir.path()).unwrap();
        let stat = fs
            .stat(&RelPath::new("a.md").unwrap())
            .await
            .unwrap();
        assert_eq!(stat.size, 8);
        assert!(stat.is_file);
        assert!(stat.mtime_ms > 0);
    }
}
