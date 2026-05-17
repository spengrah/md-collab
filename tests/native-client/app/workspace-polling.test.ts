// Tests for the polling loop in `startCountPolling`. We mock the IPC module
// so the loop can be exercised without a Tauri runtime. Codex review round 2
// flagged that the file-list propagation path had no frontend coverage.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../native-client/src/app/ipc.js', () => {
  return {
    ipc: {
      workspaceRefreshCounts: vi.fn(),
    },
  };
});

import { ipc, type PersistedState, type ThreadCountsDelta, type WorkspaceState } from '../../../native-client/src/app/ipc.js';
import { createWorkspaceContext, startCountPolling } from '../../../native-client/src/app/workspace.js';

const baseSettings: PersistedState = {
  schema_version: 1,
  last_workspace: null,
  settings: {
    author_id: '',
    author_label: '',
    show_resolved_inline: false,
    reanchor_on_open: true,
    sidecar_poll_interval_ms: 3000,
    workspace_exclude_patterns: [],
    ui_theme: 'auto',
    ssh_default_control_master: true,
  },
};

const baseWorkspaceState: WorkspaceState = {
  uri: { type: 'local', path: '/tmp/ws' },
  files: ['a.md', 'b.md'],
  thread_counts: { 'a.md': 1 },
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('startCountPolling', () => {
  it('merges updated counts and removes entries from the signal', async () => {
    const mock = vi.mocked(ipc.workspaceRefreshCounts);
    const delta: ThreadCountsDelta = {
      updated: { 'a.md': 3 },
      removed: ['b.md'],
      files: ['a.md'],
    };
    mock.mockResolvedValueOnce(delta);

    const ctx = createWorkspaceContext(baseSettings);
    ctx.state.set(baseWorkspaceState);
    ctx.counts.set({ 'a.md': 1, 'b.md': 2 });

    const stop = startCountPolling(ctx, 1000, 100);

    // Trigger the scheduled timeout.
    await vi.advanceTimersByTimeAsync(1100);
    stop();

    expect(ctx.counts.get()).toEqual({ 'a.md': 3 });
  });

  it('updates ctx.state.files when the delta carries a different file list', async () => {
    const mock = vi.mocked(ipc.workspaceRefreshCounts);
    const delta: ThreadCountsDelta = {
      updated: {},
      removed: [],
      files: ['a.md', 'b.md', 'new.md'],
    };
    mock.mockResolvedValueOnce(delta);

    const ctx = createWorkspaceContext(baseSettings);
    ctx.state.set(baseWorkspaceState);

    const stop = startCountPolling(ctx, 1000, 100);
    await vi.advanceTimersByTimeAsync(1100);
    stop();

    expect(ctx.state.get()?.files).toEqual(['a.md', 'b.md', 'new.md']);
  });

  it('does not re-assign ctx.state.files when the list is unchanged (preserves identity)', async () => {
    const mock = vi.mocked(ipc.workspaceRefreshCounts);
    const delta: ThreadCountsDelta = {
      updated: { 'a.md': 4 },
      removed: [],
      files: ['a.md', 'b.md'], // same as baseWorkspaceState.files
    };
    mock.mockResolvedValueOnce(delta);

    const ctx = createWorkspaceContext(baseSettings);
    ctx.state.set(baseWorkspaceState);
    const before = ctx.state.get();

    const stop = startCountPolling(ctx, 1000, 100);
    await vi.advanceTimersByTimeAsync(1100);
    stop();

    // The state object reference should be unchanged since files were equal.
    expect(ctx.state.get()).toBe(before);
  });

  it('swallows IPC errors and continues polling', async () => {
    const mock = vi.mocked(ipc.workspaceRefreshCounts);
    mock.mockRejectedValueOnce(new Error('boom'));
    mock.mockResolvedValueOnce({ updated: {}, removed: [], files: [] });

    const ctx = createWorkspaceContext(baseSettings);
    ctx.state.set(baseWorkspaceState);

    const stop = startCountPolling(ctx, 1000, 100);
    await vi.advanceTimersByTimeAsync(2100);
    stop();

    expect(mock).toHaveBeenCalledTimes(2);
  });
});
