//! SSH adapter stub. Real implementation lands in PR4.
//! Every method returns `IpcError::NotImplemented` so the variant compiles but
//! cannot be exercised at runtime.

use std::path::{Path, PathBuf};

use globset::GlobSet;

use crate::errors::IpcError;

use super::{RelPath, SidecarRead, StatInfo};

#[allow(dead_code)]
pub struct SshFs {
    root: PathBuf,
    host: String,
}

#[allow(dead_code)]
impl SshFs {
    pub fn new(host: impl Into<String>, root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            host: host.into(),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub async fn list_markdown(&self, _: &GlobSet) -> Result<Vec<RelPath>, IpcError> {
        Err(IpcError::not_implemented("ssh list_markdown (PR4)"))
    }

    pub async fn read_file(&self, _: &RelPath) -> Result<String, IpcError> {
        Err(IpcError::not_implemented("ssh read_file (PR4)"))
    }

    pub async fn read_sidecar(&self, _: &RelPath) -> Result<Option<SidecarRead>, IpcError> {
        Err(IpcError::not_implemented("ssh read_sidecar (PR4)"))
    }

    pub async fn stat(&self, _: &RelPath) -> Result<StatInfo, IpcError> {
        Err(IpcError::not_implemented("ssh stat (PR4)"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use globset::GlobSetBuilder;

    fn empty_globset() -> GlobSet {
        GlobSetBuilder::new().build().unwrap()
    }

    #[tokio::test]
    async fn ssh_stub_list_not_implemented() {
        let fs = SshFs::new("example.com", "/remote/root");
        let err = fs.list_markdown(&empty_globset()).await.unwrap_err();
        assert!(matches!(err, IpcError::NotImplemented { .. }));
    }

    #[tokio::test]
    async fn ssh_stub_read_file_not_implemented() {
        let fs = SshFs::new("example.com", "/remote/root");
        let rel = RelPath::new("a.md").unwrap();
        let err = fs.read_file(&rel).await.unwrap_err();
        assert!(matches!(err, IpcError::NotImplemented { .. }));
    }

    #[tokio::test]
    async fn ssh_stub_read_sidecar_not_implemented() {
        let fs = SshFs::new("example.com", "/remote/root");
        let rel = RelPath::new("a.md").unwrap();
        let err = fs.read_sidecar(&rel).await.unwrap_err();
        assert!(matches!(err, IpcError::NotImplemented { .. }));
    }

    #[tokio::test]
    async fn ssh_stub_stat_not_implemented() {
        let fs = SshFs::new("example.com", "/remote/root");
        let rel = RelPath::new("a.md").unwrap();
        let err = fs.stat(&rel).await.unwrap_err();
        assert!(matches!(err, IpcError::NotImplemented { .. }));
    }
}
