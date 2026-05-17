// Typed wrappers around `@tauri-apps/api`'s `invoke()`. One function per Rust
// command in `src-tauri/src/commands.rs`. Errors are mapped through
// `IpcError.from()` so callers always see a typed envelope.

import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { IpcError } from './errors.js';

export interface RelPath {
  // String-newtype; the Rust side uses #[serde(transparent)] so this round-trips
  // as a JSON string. We keep a brand here purely for clarity at call sites.
}
export type RelPathStr = string & { readonly __brand?: 'RelPath' };

export interface SidecarRead {
  contents: string;
  mtime_ms: number;
}

export interface StatInfo {
  mtime_ms: number;
  size: number;
  is_file: boolean;
}

export type WorkspaceUri = { type: 'local'; path: string };

export interface WorkspaceState {
  uri: WorkspaceUri;
  files: RelPathStr[];
  thread_counts: Record<string, number>;
}

export interface ThreadCountsDelta {
  updated: Record<string, number>;
  removed: string[];
  /** Full file list as of this refresh; lets the tree pick up additions and
   *  removals without a workspace reopen. */
  files: RelPathStr[];
}

export type ThemeChoice = 'auto' | 'light' | 'dark';

export interface Settings {
  author_id: string;
  author_label: string;
  show_resolved_inline: boolean;
  reanchor_on_open: boolean;
  sidecar_poll_interval_ms: number;
  workspace_exclude_patterns: string[];
  ui_theme: ThemeChoice;
  ssh_default_control_master: boolean;
  [extra: string]: unknown;
}

export interface PersistedState {
  schema_version: number;
  last_workspace: string | null;
  settings: Settings;
  [extra: string]: unknown;
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return (await tauriInvoke(cmd, args ?? {})) as T;
  } catch (err) {
    throw IpcError.from(err);
  }
}

export const ipc = {
  workspaceOpen: (root: string) => call<WorkspaceState>('workspace_open', { root }),
  workspaceCurrent: () => call<WorkspaceState | null>('workspace_current'),
  workspaceListMarkdown: () => call<RelPathStr[]>('workspace_list_markdown'),
  workspaceRefreshCounts: () => call<ThreadCountsDelta>('workspace_refresh_counts'),
  fsReadFile: (rel: string) => call<string>('fs_read_file', { rel }),
  fsReadSidecar: (docRel: string) => call<SidecarRead | null>('fs_read_sidecar', { docRel }),
  fsOpenSidecarExternally: (sidecarRel: string) =>
    call<void>('fs_open_sidecar_externally', { sidecarRel }),
  fsStat: (rel: string) => call<StatInfo>('fs_stat', { rel }),
  settingsLoad: () => call<PersistedState>('settings_load'),
  // PR1 intentionally does not expose a settings save IPC; last_workspace is
  // persisted internally by `workspace_open`. A general settings UI + save
  // surface lands with PR6 (Codex round 1 finding #8).
};

export type Ipc = typeof ipc;
