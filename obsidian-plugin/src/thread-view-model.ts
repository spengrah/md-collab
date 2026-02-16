import type { DocumentThreadState } from './service.js';

export interface ThreadPanelSnapshot {
  openCount: number;
  resolvedCount: number;
  hasRecovery: boolean;
  recoveryMessage: string | null;
  threads: Array<{
    threadId: string;
    statusLabel: string;
    expanded: boolean;
    messageCountLabel: string;
    actions: string[];
    suggestions: Array<{ suggestionId: string; actions: string[] }>;
  }>;
}

export const buildThreadPanelSnapshot = (
  state: DocumentThreadState | null,
  expandedThreadIds: ReadonlySet<string>,
  recoveryMessage: string | null,
): ThreadPanelSnapshot => {
  if (!state) {
    return { openCount: 0, resolvedCount: 0, hasRecovery: !!recoveryMessage, recoveryMessage, threads: [] };
  }

  const openCount = state.sidecar.threads.filter((t) => t.status === 'open').length;
  const resolvedCount = state.sidecar.threads.filter((t) => t.status === 'resolved').length;

  return {
    openCount,
    resolvedCount,
    hasRecovery: !!recoveryMessage,
    recoveryMessage,
    threads: state.sidecar.threads.map((thread) => ({
      threadId: thread.thread_id,
      statusLabel: thread.status === 'open' ? 'Open' : 'Resolved',
      expanded: expandedThreadIds.has(thread.thread_id),
      messageCountLabel: `${thread.messages.length} message(s)`,
      actions: ['Reply', thread.status === 'open' ? 'Resolve' : 'Reopen', 'Suggest from selection', 'Jump to anchor'],
      suggestions: (thread.suggestions ?? []).map((suggestion) => ({
        suggestionId: suggestion.suggestion_id,
        actions: ['Apply', 'Reject', 'View base context'],
      })),
    })),
  };
};
