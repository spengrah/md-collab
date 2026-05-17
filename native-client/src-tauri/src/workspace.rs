//! Workspace state: the open root + a count cache for `{open_count}` badges.
//!
//! The cache is internal (Rust-only); IPC only exposes `WorkspaceState` and
//! `ThreadCountsDelta` DTOs. See § 4.4 of the plan for the cache invariants.

use std::collections::HashMap;
use std::path::PathBuf;

use globset::{Glob, GlobSet, GlobSetBuilder};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::errors::IpcError;
use crate::fs::{local::LocalFs, FsAdapter, RelPath};

/// Force a full re-hash after this many poll cycles where (mtime, size) were
/// unchanged. Belt-and-suspenders for tooling that rewrites a sidecar while
/// preserving mtime + size (rare). See plan § 1 acceptance bullet 4.
const FORCE_REHASH_AFTER_CYCLES: u32 = 2;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkspaceUri {
    Local { path: PathBuf },
    // Ssh { host: String, path: PathBuf },  // PR4
}

impl WorkspaceUri {
    pub fn from_local(path: PathBuf) -> Self {
        WorkspaceUri::Local { path }
    }

    pub fn local_path(&self) -> Option<&std::path::Path> {
        match self {
            WorkspaceUri::Local { path } => Some(path.as_path()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceState {
    pub uri: WorkspaceUri,
    pub files: Vec<RelPath>,
    pub thread_counts: HashMap<String, u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ThreadCountsDelta {
    pub updated: HashMap<String, u32>,
    pub removed: Vec<String>,
}

#[derive(Debug, Clone)]
struct CountEntry {
    mtime_ms: u64,
    size: u64,
    content_hash: [u8; 32],
    open: u32,
    cycles_since_rehash: u32,
}

pub struct Workspace {
    uri: WorkspaceUri,
    adapter: FsAdapter,
    exclude: GlobSet,
    files: Vec<RelPath>,
    count_cache: HashMap<String, CountEntry>,
}

impl Workspace {
    pub async fn open_local(
        path: PathBuf,
        exclude_patterns: &[String],
    ) -> Result<Self, IpcError> {
        let local = LocalFs::new(path.clone())?;
        let adapter = FsAdapter::Local(local);
        let exclude = build_globset(exclude_patterns)?;
        let mut workspace = Self {
            uri: WorkspaceUri::from_local(path),
            adapter,
            exclude,
            files: Vec::new(),
            count_cache: HashMap::new(),
        };
        workspace.scan().await?;
        Ok(workspace)
    }

    pub fn uri(&self) -> &WorkspaceUri {
        &self.uri
    }

    pub fn adapter(&self) -> &FsAdapter {
        &self.adapter
    }

    pub fn snapshot(&self) -> WorkspaceState {
        let counts: HashMap<String, u32> = self
            .count_cache
            .iter()
            .filter(|(_, e)| e.open > 0)
            .map(|(k, e)| (k.clone(), e.open))
            .collect();
        WorkspaceState {
            uri: self.uri.clone(),
            files: self.files.clone(),
            thread_counts: counts,
        }
    }

    pub fn files(&self) -> &[RelPath] {
        &self.files
    }

    /// Full re-enumeration. Used on `open` and could be reused on explicit
    /// "refresh tree" if added later.
    pub async fn scan(&mut self) -> Result<(), IpcError> {
        self.files = self.adapter.list_markdown(&self.exclude).await?;
        let delta = self.refresh_counts().await?;
        let _ = delta; // initial fill; nothing to delta against
        Ok(())
    }

    /// Recompute counts for every known `.md` file. Returns a delta vs the
    /// pre-call cache so the frontend can selectively re-render rows.
    pub async fn refresh_counts(&mut self) -> Result<ThreadCountsDelta, IpcError> {
        let mut updated = HashMap::new();
        let mut seen: HashMap<String, ()> = HashMap::new();

        // Re-list to pick up new/removed files in case the tree changed.
        self.files = self.adapter.list_markdown(&self.exclude).await?;

        for rel in self.files.clone() {
            let key = rel.as_str().to_string();
            seen.insert(key.clone(), ());
            // Snapshot the previous count BEFORE mutation so we can compute a
            // real delta. Treat a missing entry as the implicit "0".
            let previous = self.count_cache.get(&key).map(|e| e.open).unwrap_or(0);
            let new_open = self.refresh_one(&rel).await?;
            if previous != new_open {
                updated.insert(key.clone(), new_open);
            }
        }

        // Drop cache entries for files no longer present.
        let removed: Vec<String> = self
            .count_cache
            .keys()
            .filter(|k| !seen.contains_key(*k))
            .cloned()
            .collect();
        for k in &removed {
            self.count_cache.remove(k);
        }

        Ok(ThreadCountsDelta { updated, removed })
    }

    async fn refresh_one(&mut self, doc_rel: &RelPath) -> Result<u32, IpcError> {
        let Some(side_rel) = doc_rel.sidecar() else {
            return Ok(0);
        };

        let stat = match self.adapter.stat(&side_rel).await {
            Ok(s) => s,
            Err(IpcError::FsNotFound { .. }) => {
                self.count_cache.remove(doc_rel.as_str());
                return Ok(0);
            }
            Err(err) => return Err(err),
        };
        if !stat.is_file {
            return Ok(0);
        }

        let key = doc_rel.as_str().to_string();
        let prev = self.count_cache.get(&key).cloned();

        let should_rehash = match &prev {
            None => true,
            Some(entry) => {
                entry.mtime_ms != stat.mtime_ms
                    || entry.size != stat.size
                    || entry.cycles_since_rehash + 1 >= FORCE_REHASH_AFTER_CYCLES
            }
        };

        if !should_rehash {
            // Bump cycle counter on the fast path.
            if let Some(entry) = self.count_cache.get_mut(&key) {
                entry.cycles_since_rehash += 1;
            }
            return Ok(prev.as_ref().map(|p| p.open).unwrap_or(0));
        }

        // Read + hash + (maybe) parse.
        let read = self.adapter.read_sidecar(doc_rel).await?;
        let Some(read) = read else {
            self.count_cache.remove(&key);
            return Ok(0);
        };
        let hash = sha256_bytes(read.contents.as_bytes());

        // If hash matches, just update (mtime, size) and keep the count.
        let new_open = if prev.as_ref().map(|p| p.content_hash) == Some(hash) {
            prev.as_ref().map(|p| p.open).unwrap_or(0)
        } else {
            count_open_threads(&read.contents)
        };

        self.count_cache.insert(
            key,
            CountEntry {
                mtime_ms: stat.mtime_ms,
                size: stat.size,
                content_hash: hash,
                open: new_open,
                cycles_since_rehash: 0,
            },
        );

        Ok(new_open)
    }
}

fn build_globset(patterns: &[String]) -> Result<GlobSet, IpcError> {
    let mut builder = GlobSetBuilder::new();
    for p in patterns {
        let glob = Glob::new(p)
            .map_err(|e| IpcError::workspace_invalid(p.clone(), format!("invalid glob: {e}")))?;
        builder.add(glob);
    }
    builder
        .build()
        .map_err(|e| IpcError::workspace_invalid("globset", e.to_string()))
}

fn sha256_bytes(bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let out = hasher.finalize();
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&out);
    arr
}

/// Count `threads[]` entries with `status == "open"`. Tolerates malformed JSON
/// and JSON-valid-but-schema-invalid sidecars (returns 0 / partial count). Full
/// schema validation happens in the webview when the user opens the file.
fn count_open_threads(json: &str) -> u32 {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        log::warn!("sidecar malformed JSON; treating open count as 0");
        return 0;
    };
    let Some(threads) = value.get("threads").and_then(|v| v.as_array()) else {
        return 0;
    };
    threads
        .iter()
        .filter(|t| {
            t.get("status")
                .and_then(|s| s.as_str())
                .map(|s| s == "open")
                .unwrap_or(false)
        })
        .count() as u32
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn sidecar_with_threads(open: usize, resolved: usize) -> String {
        let mut threads = Vec::new();
        for i in 0..open {
            threads.push(serde_json::json!({
                "thread_id": format!("t-open-{}", i),
                "status": "open",
            }));
        }
        for i in 0..resolved {
            threads.push(serde_json::json!({
                "thread_id": format!("t-res-{}", i),
                "status": "resolved",
            }));
        }
        serde_json::json!({
            "schema_version": "0.1.0",
            "document": { "path": "a.md" },
            "threads": threads,
        })
        .to_string()
    }

    async fn build_workspace(dir: &TempDir) -> Workspace {
        Workspace::open_local(dir.path().to_path_buf(), &[])
            .await
            .unwrap()
    }

    #[test]
    fn count_open_threads_basic() {
        let json = sidecar_with_threads(3, 1);
        assert_eq!(count_open_threads(&json), 3);
    }

    #[test]
    fn count_open_threads_malformed() {
        assert_eq!(count_open_threads("not json"), 0);
    }

    #[test]
    fn count_open_threads_schema_invalid_still_counts() {
        // A thread with `status: "open"` but missing other required fields is
        // still counted; full schema enforcement happens in the webview.
        let json = serde_json::json!({
            "threads": [
                { "status": "open" },
                { "status": "open" },
                { "status": "resolved" }
            ]
        })
        .to_string();
        assert_eq!(count_open_threads(&json), 2);
    }

    #[tokio::test]
    async fn workspace_count_cache_initial() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.md"), "alpha").unwrap();
        fs::write(
            dir.path().join("a.md.comments.json"),
            sidecar_with_threads(2, 0),
        )
        .unwrap();
        fs::write(dir.path().join("b.md"), "bravo").unwrap();

        let ws = build_workspace(&dir).await;
        let snap = ws.snapshot();
        assert_eq!(snap.files.len(), 2);
        assert_eq!(snap.thread_counts.get("a.md"), Some(&2));
        assert!(snap.thread_counts.get("b.md").is_none()); // no sidecar => no entry
    }

    #[tokio::test]
    async fn workspace_count_cache_incremental_mtime() {
        use filetime::{set_file_mtime, FileTime};

        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.md"), "alpha").unwrap();
        let sc = dir.path().join("a.md.comments.json");
        fs::write(&sc, sidecar_with_threads(1, 0)).unwrap();
        // Force an old mtime so a subsequent write definitely advances it.
        set_file_mtime(&sc, FileTime::from_unix_time(1_000_000, 0)).unwrap();

        let mut ws = build_workspace(&dir).await;
        assert_eq!(ws.snapshot().thread_counts.get("a.md"), Some(&1));

        // Touch sidecar with new content and new mtime.
        fs::write(&sc, sidecar_with_threads(3, 0)).unwrap();
        set_file_mtime(&sc, FileTime::from_unix_time(2_000_000, 0)).unwrap();

        let delta = ws.refresh_counts().await.unwrap();
        assert_eq!(delta.updated.get("a.md"), Some(&3));
        assert!(delta.removed.is_empty());
    }

    #[tokio::test]
    async fn workspace_count_cache_same_mtime_different_size_changed_hash() {
        use filetime::{set_file_mtime, FileTime};

        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.md"), "alpha").unwrap();
        let sc = dir.path().join("a.md.comments.json");
        fs::write(&sc, sidecar_with_threads(1, 0)).unwrap();
        set_file_mtime(&sc, FileTime::from_unix_time(1_000_000, 0)).unwrap();

        let mut ws = build_workspace(&dir).await;
        assert_eq!(ws.snapshot().thread_counts.get("a.md"), Some(&1));

        // Rewrite with different content (different size) but pin mtime back.
        fs::write(&sc, sidecar_with_threads(5, 0)).unwrap();
        set_file_mtime(&sc, FileTime::from_unix_time(1_000_000, 0)).unwrap();

        let delta = ws.refresh_counts().await.unwrap();
        assert_eq!(delta.updated.get("a.md"), Some(&5));
    }

    #[tokio::test]
    async fn workspace_count_cache_same_mtime_same_size_forces_rehash_after_2_cycles() {
        use filetime::{set_file_mtime, FileTime};

        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.md"), "alpha").unwrap();
        let sc = dir.path().join("a.md.comments.json");
        // Two payloads with identical byte length but different open counts.
        // "open" vs "resolved" alone differ by 4 bytes; the longer "open"
        // variant pads to match using a `_p` key (overhead 6: `,"_p":""`)
        // plus a 7-char value = 13 bytes vs the 4-byte "open"/"resolved" delta
        // — actually we compute the difference and pad to match.
        // Construction:
        //   a = {"threads":[{"status":"open"      ,"_p":"AAAAAAA"}]}
        //   b = {"threads":[{"status":"resolved"                }]}
        // We do the byte arithmetic by string concatenation and assert.
        let a = r#"{"threads":[{"status":"open","_p":"XXXXXXXX"}]}"#.to_string();
        let b = r#"{"threads":[{"status":"resolved","_q":"YYYY"}]}"#.to_string();
        assert_eq!(a.len(), b.len(), "test payloads must be same length: a={} b={}", a.len(), b.len());

        fs::write(&sc, &a).unwrap();
        set_file_mtime(&sc, FileTime::from_unix_time(1_000_000, 0)).unwrap();

        let mut ws = build_workspace(&dir).await;
        assert_eq!(ws.snapshot().thread_counts.get("a.md"), Some(&1));

        // Sneaky rewrite: same size + restored mtime.
        fs::write(&sc, &b).unwrap();
        set_file_mtime(&sc, FileTime::from_unix_time(1_000_000, 0)).unwrap();

        // Cycle 1: fast-path skip (cycles_since_rehash bumped to 1).
        let delta1 = ws.refresh_counts().await.unwrap();
        // It's permitted for the implementation to either skip or rehash here;
        // we only require the forced rehash to land within FORCE_REHASH_AFTER_CYCLES
        // additional refresh calls.
        let _ = delta1;

        // Cycle 2: should now force a re-hash and detect the swap.
        let mut detected = false;
        for _ in 0..FORCE_REHASH_AFTER_CYCLES {
            let delta = ws.refresh_counts().await.unwrap();
            if delta.updated.get("a.md") == Some(&0) {
                detected = true;
                break;
            }
        }
        assert!(detected, "forced re-hash never updated the count");
    }

    #[tokio::test]
    async fn workspace_count_malformed_sidecar() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.md"), "alpha").unwrap();
        fs::write(dir.path().join("a.md.comments.json"), "{not json").unwrap();

        let ws = build_workspace(&dir).await;
        // Malformed JSON yields 0 and no thread_counts entry (we filter > 0).
        assert!(ws.snapshot().thread_counts.get("a.md").is_none());
    }

    #[tokio::test]
    async fn workspace_count_cache_backward_clock() {
        use filetime::{set_file_mtime, FileTime};

        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.md"), "alpha").unwrap();
        let sc = dir.path().join("a.md.comments.json");
        fs::write(&sc, sidecar_with_threads(1, 0)).unwrap();
        set_file_mtime(&sc, FileTime::from_unix_time(2_000_000, 0)).unwrap();

        let mut ws = build_workspace(&dir).await;
        assert_eq!(ws.snapshot().thread_counts.get("a.md"), Some(&1));

        // mtime moves backward + content changes.
        fs::write(&sc, sidecar_with_threads(4, 0)).unwrap();
        set_file_mtime(&sc, FileTime::from_unix_time(1_000_000, 0)).unwrap();

        let delta = ws.refresh_counts().await.unwrap();
        assert_eq!(delta.updated.get("a.md"), Some(&4));
    }

    #[tokio::test]
    async fn workspace_removed_files_appear_in_delta() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.md"), "alpha").unwrap();
        fs::write(dir.path().join("a.md.comments.json"), sidecar_with_threads(2, 0)).unwrap();
        fs::write(dir.path().join("b.md"), "bravo").unwrap();
        fs::write(dir.path().join("b.md.comments.json"), sidecar_with_threads(1, 0)).unwrap();

        let mut ws = build_workspace(&dir).await;
        assert!(ws.snapshot().thread_counts.contains_key("a.md"));

        // Delete b.md and its sidecar.
        fs::remove_file(dir.path().join("b.md")).unwrap();
        fs::remove_file(dir.path().join("b.md.comments.json")).unwrap();

        let delta = ws.refresh_counts().await.unwrap();
        assert!(delta.removed.contains(&"b.md".to_string()));
    }

    #[tokio::test]
    async fn workspace_emoji_threads_count() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.md"), "alpha").unwrap();
        let json = serde_json::json!({
            "schema_version": "0.1.0",
            "document": { "path": "a.md" },
            "threads": [
                { "thread_id": "t1", "status": "open", "messages": [{"body": "🎉 hi"}] }
            ]
        })
        .to_string();
        fs::write(dir.path().join("a.md.comments.json"), json).unwrap();
        let ws = build_workspace(&dir).await;
        assert_eq!(ws.snapshot().thread_counts.get("a.md"), Some(&1));
    }

    #[test]
    fn workspace_uri_local_serializes() {
        let uri = WorkspaceUri::from_local(PathBuf::from("/tmp/ws"));
        let json = serde_json::to_value(&uri).unwrap();
        assert_eq!(json["type"], "local");
        assert_eq!(json["path"], "/tmp/ws");
    }

}
