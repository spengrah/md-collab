import type { DocumentThreadState } from './model.js';

const LONG_DIFF_LINE_THRESHOLD = 8;

export interface ChatPanelDiffToken {
  text: string;
  changed: boolean;
}

export interface ChatPanelSuggestionLine {
  kind: 'before' | 'after';
  label: string;
  tokens: ChatPanelDiffToken[];
}

export interface ChatPanelSuggestionSummary {
  suggestionId: string;
  status: string;
  replacementPreview: string;
  latest?: string;
  lines: ChatPanelSuggestionLine[];
  isLongDiff: boolean;
  collapsedByDefault: boolean;
}

export interface ChatPanelMessage {
  messageId: string;
  authorLabel: string;
  createdAt: string;
  body: string;
  kind: 'user' | 'system';
}

export interface ChatPanelThread {
  threadId: string;
  status: 'open' | 'resolved';
  relevanceState: string;
  timelineKind: string;
  anchorConfidence: string;
  latestSnippet: string;
  canResolve: boolean;
  canReopen: boolean;
  canReply: boolean;
  canSuggest: boolean;
  messages: ChatPanelMessage[];
  suggestions: ChatPanelSuggestionSummary[];
}

export interface ChatPanelViewModel {
  document: {
    path: string;
    label: string;
  };
  groups: {
    open: ChatPanelThread[];
    resolved: ChatPanelThread[];
  };
  ui: {
    expandedThreadIds: string[];
    activeThreadId?: string;
    filters: {
      status: 'all' | 'open' | 'resolved';
      ownership: 'all' | 'mine';
      hasSuggestions: boolean;
      suggestionState: 'proposedOnly' | 'all';
    };
  };
}

export interface ChatPanelUiState {
  expandedThreadIds: Set<string>;
  activeThreadId?: string;
  currentAuthorId?: string;
  filters: ChatPanelViewModel['ui']['filters'];
}

const defaultFilters: ChatPanelViewModel['ui']['filters'] = {
  status: 'all',
  ownership: 'all',
  hasSuggestions: false,
  suggestionState: 'proposedOnly',
};

export const defaultChatPanelUiState = (): ChatPanelUiState => ({
  expandedThreadIds: new Set<string>(),
  activeThreadId: undefined,
  currentAuthorId: undefined,
  filters: { ...defaultFilters },
});

const tokenizeWords = (value: string): string[] => value.split(/(\s+)/).filter((token) => token.length > 0);

const diffTokens = (before: string, after: string) => {
  const beforeTokens = tokenizeWords(before);
  const afterTokens = tokenizeWords(after);
  const beforeSet = new Set(beforeTokens.filter((token) => token.trim().length > 0));
  const afterSet = new Set(afterTokens.filter((token) => token.trim().length > 0));

  return {
    before: beforeTokens.map((text) => ({ text, changed: text.trim().length > 0 && !afterSet.has(text) })),
    after: afterTokens.map((text) => ({ text, changed: text.trim().length > 0 && !beforeSet.has(text) })),
  };
};

type SidecarSuggestion = NonNullable<DocumentThreadState['sidecar']['threads'][number]['suggestions']>[number];

const suggestionToVm = (suggestion: SidecarSuggestion, fallbackBefore: string): ChatPanelSuggestionSummary => {
  const before = fallbackBefore || '(Original text unavailable)';
  const after = suggestion.proposed_edit.replacement_text || '(No replacement text)';
  const { before: beforeTokens, after: afterTokens } = diffTokens(before, after);
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const isLongDiff = beforeLines.length + afterLines.length > LONG_DIFF_LINE_THRESHOLD;

  return {
    suggestionId: suggestion.suggestion_id,
    status: suggestion.status,
    replacementPreview: after.replace(/\s+/g, ' ').slice(0, 120),
    latest: undefined,
    lines: [
      { kind: 'before', label: 'Original', tokens: beforeTokens },
      { kind: 'after', label: 'Suggested', tokens: afterTokens },
    ],
    isLongDiff,
    collapsedByDefault: isLongDiff,
  };
};

const threadToVm = (
  thread: DocumentThreadState['sidecar']['threads'][number],
  suggestionState: ChatPanelViewModel['ui']['filters']['suggestionState'],
): ChatPanelThread => {
  const latest = thread.messages[thread.messages.length - 1];
  return {
    threadId: thread.thread_id,
    status: thread.status,
    relevanceState: thread.relevance_state ?? 'active',
    timelineKind: thread.thread_version_context?.kind ?? 'workspace',
    anchorConfidence: thread.anchor.anchor_confidence,
    latestSnippet: (latest?.body ?? '(no messages)').replace(/\s+/g, ' ').slice(0, 120),
    canResolve: thread.status === 'open',
    canReopen: thread.status === 'resolved',
    canReply: true,
    canSuggest: true,
    messages: [...thread.messages]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((message) => ({
        messageId: message.message_id,
        authorLabel: message.author.author_label,
        createdAt: message.created_at,
        body: message.body,
        kind: message.author.author_id === 'system' ? 'system' : 'user',
      })),
    suggestions: (thread.suggestions ?? [])
      .filter((suggestion) => suggestionState === 'all' || suggestion.status === 'proposed')
      .map((suggestion) => suggestionToVm(suggestion, thread.anchor.fallback.quote)),
  };
};

const threadOwnedBy = (source: DocumentThreadState['sidecar']['threads'][number], currentAuthorId?: string): boolean => {
  if (!currentAuthorId) return true;
  return source.messages.some((message) => message.author.author_id === currentAuthorId);
};

export const toChatPanelViewModel = (state: DocumentThreadState | undefined, ui: ChatPanelUiState): ChatPanelViewModel | undefined => {
  if (!state) return undefined;

  const mapped = state.sidecar.threads.map((source) => ({ source, vm: threadToVm(source, ui.filters.suggestionState) }));
  const visible = mapped
    .filter(({ source, vm }) => {
      if (ui.filters.status !== 'all' && vm.status !== ui.filters.status) return false;
      if (ui.filters.hasSuggestions && vm.suggestions.length === 0) return false;
      if (ui.filters.ownership === 'mine' && !threadOwnedBy(source, ui.currentAuthorId)) return false;
      return true;
    })
    .map((entry) => entry.vm);

  const open = visible.filter((thread) => thread.status === 'open');
  const resolved = visible.filter((thread) => thread.status === 'resolved');

  return {
    document: {
      path: state.documentPath,
      label: state.sidecar.document.path,
    },
    groups: { open, resolved },
    ui: {
      expandedThreadIds: [...ui.expandedThreadIds],
      activeThreadId: ui.activeThreadId,
      filters: ui.filters,
    },
  };
};
