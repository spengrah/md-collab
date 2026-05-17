// Workspace open / restore flow. Reads PersistedState on app start and either
// auto-opens the last workspace or surfaces the picker.

import { ipc, type PersistedState, type WorkspaceState } from './ipc.js';
import { signal, type Signal } from './store.js';

export interface WorkspaceContext {
  state: Signal<WorkspaceState | null>;
  settings: Signal<PersistedState>;
  /** Counts keyed by relpath; rebuilt from `WorkspaceState.thread_counts`. */
  counts: Signal<Record<string, number>>;
  /** Currently-open relative file path within the workspace; null on first launch. */
  currentFile: Signal<string | null>;
}

export function createWorkspaceContext(initialSettings: PersistedState): WorkspaceContext {
  return {
    state: signal<WorkspaceState | null>(null),
    settings: signal<PersistedState>(initialSettings),
    counts: signal<Record<string, number>>({}),
    currentFile: signal<string | null>(null),
  };
}

export async function bootstrapWorkspace(
  ctx: WorkspaceContext,
  options: { pickIfMissing?: () => Promise<string | null> }
): Promise<void> {
  const last = ctx.settings.get().last_workspace;
  if (last) {
    try {
      const state = await ipc.workspaceOpen(last);
      ctx.state.set(state);
      ctx.counts.set(state.thread_counts);
      return;
    } catch (err) {
      console.warn('failed to reopen last workspace; falling back to picker', err);
    }
  }
  if (options.pickIfMissing) {
    const picked = await options.pickIfMissing();
    if (picked) {
      const state = await ipc.workspaceOpen(picked);
      ctx.state.set(state);
      ctx.counts.set(state.thread_counts);
    }
  }
}

/**
 * Schedule a polling loop that calls `workspace_refresh_counts` every
 * `pollInterval` ms (debounced). The returned function cancels the loop.
 */
export function startCountPolling(
  ctx: WorkspaceContext,
  pollInterval: number = 3000,
  debounceMs: number = 500
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  let lastRun = 0;

  const run = async () => {
    if (cancelled) return;
    const now = Date.now();
    if (now - lastRun < debounceMs) {
      schedule(debounceMs - (now - lastRun));
      return;
    }
    lastRun = now;
    try {
      const delta = await ipc.workspaceRefreshCounts();
      if (cancelled) return;
      ctx.counts.update((prev) => {
        const next = { ...prev, ...delta.updated };
        for (const k of delta.removed) delete next[k];
        return next;
      });
    } catch (err) {
      console.warn('workspace_refresh_counts failed', err);
    }
    schedule(pollInterval);
  };

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, ms);
  };

  schedule(pollInterval);

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}
