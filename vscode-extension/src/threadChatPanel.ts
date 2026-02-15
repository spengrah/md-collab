import * as vscode from 'vscode';
import {
  defaultChatPanelUiState,
  toChatPanelViewModel,
  type ChatPanelUiState,
  type ChatPanelViewModel,
  type ChatPanelThread,
} from './chatPanelViewModel.js';
import type { DocumentThreadState } from './model.js';

export const THREAD_CHAT_VIEW_ID = 'mdCollab.threadChat';

export const chatIntentToCommand = {
  addComment: 'mdCollab.addComment',
  reply: 'mdCollab.replyToThread',
  resolve: 'mdCollab.resolveThread',
  reopen: 'mdCollab.reopenThread',
  suggest: 'mdCollab.proposeSuggestion',
  suggestFromSelection: 'mdCollab.proposeSuggestionFromSelection',
  applySuggestion: 'mdCollab.applySuggestion',
  rejectSuggestion: 'mdCollab.rejectSuggestion',
  viewBaseVersion: 'mdCollab.viewSuggestionBaseVersion',
  jumpToAnchor: 'mdCollab.navigateToThread',
  relinkAnchor: 'mdCollab.reanchorCurrentFile',
  reloadSidecar: 'mdCollab.reloadSidecar',
} as const;

export type ChatIntent = keyof typeof chatIntentToCommand;

interface CommandDispatcher {
  (command: string, ...args: unknown[]): Thenable<unknown>;
}

interface WebviewIntentMessage {
  type: 'intent';
  intent: ChatIntent;
  threadId?: string;
  suggestionId?: string;
  body?: string;
}

interface WebviewUiMessage {
  type: 'toggleThread' | 'setActiveThread';
  threadId: string;
}

interface WebviewSetFiltersMessage {
  type: 'setFilters';
  filters: ChatPanelUiState['filters'];
}

type WebviewInboundMessage = WebviewIntentMessage | WebviewUiMessage | WebviewSetFiltersMessage;

interface ChatPanelBanner {
  kind: 'warning' | 'info';
  message: string;
  actions: Array<{ label: string; intent: ChatIntent }>;
}

interface ThreadPatchPayload {
  mode: 'patchThread';
  group: 'open' | 'resolved';
  threadId: string;
  thread: ChatPanelThread;
}

interface FullPayload {
  mode: 'full';
  vm: ChatPanelViewModel | undefined;
}

const isIntent = (message: unknown): message is WebviewIntentMessage => {
  if (!message || typeof message !== 'object') return false;
  const candidate = message as Record<string, unknown>;
  return candidate.type === 'intent' && typeof candidate.intent === 'string' && candidate.intent in chatIntentToCommand;
};

const isUiMessage = (message: unknown): message is WebviewUiMessage => {
  if (!message || typeof message !== 'object') return false;
  const candidate = message as Record<string, unknown>;
  return (candidate.type === 'toggleThread' || candidate.type === 'setActiveThread') && typeof candidate.threadId === 'string';
};

const isSetFiltersMessage = (message: unknown): message is WebviewSetFiltersMessage => {
  if (!message || typeof message !== 'object') return false;
  const candidate = message as Record<string, unknown>;
  return (
    candidate.type === 'setFilters' &&
    !!candidate.filters &&
    typeof candidate.filters === 'object' &&
    ['all', 'open', 'resolved'].includes((candidate.filters as { status?: string }).status ?? '') &&
    ['all', 'mine'].includes((candidate.filters as { ownership?: string }).ownership ?? '') &&
    typeof (candidate.filters as { hasSuggestions?: unknown }).hasSuggestions === 'boolean'
  );
};

const serialize = (value: unknown) => JSON.stringify(value);

const buildIntentDispatchArgs = (message: WebviewIntentMessage): unknown[] => {
  if (message.intent === 'addComment') {
    return message.body ? [{ body: message.body }] : [];
  }
  if (message.intent === 'reply') {
    return [{ threadId: message.threadId, body: message.body }];
  }

  const args: unknown[] = [];
  if (message.threadId) args.push(message.threadId);
  if (message.suggestionId) args.push(message.suggestionId);
  return args;
};

const computeThreadPatch = (previous: ChatPanelViewModel | undefined, next: ChatPanelViewModel | undefined): ThreadPatchPayload | undefined => {
  if (!previous || !next) return undefined;
  if (serialize(previous.ui.filters) !== serialize(next.ui.filters)) return undefined;

  for (const group of ['open', 'resolved'] as const) {
    const prevThreads = previous.groups[group];
    const nextThreads = next.groups[group];
    if (prevThreads.length !== nextThreads.length) return undefined;
    if (serialize(prevThreads.map((thread) => thread.threadId)) !== serialize(nextThreads.map((thread) => thread.threadId))) {
      return undefined;
    }

    const changed = nextThreads.filter((thread, idx) => serialize(thread) !== serialize(prevThreads[idx]));
    if (changed.length === 1) {
      return { mode: 'patchThread', group, threadId: changed[0].threadId, thread: changed[0] };
    }
    if (changed.length > 1) return undefined;
  }

  return undefined;
};

const clientScript = `
const vscode = acquireVsCodeApi();
let vm;
const root = document.getElementById('root');
const toolbar = document.getElementById('toolbar');
const banner = document.getElementById('banner');

const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const replaceLoadingWithError = (message) => {
  if (!root) return;
  root.className = 'empty';
  root.textContent = message;
};

const guard = (fn, fallbackMessage) => {
  try {
    fn();
  } catch (error) {
    console.error('[md-collab.threadChat] webview error', error);
    replaceLoadingWithError(fallbackMessage);
  }
};

const postIntent = (intent, threadId, suggestionId, body) => vscode.postMessage({ type: 'intent', intent, threadId, suggestionId, body });
const postUi = (type, threadId) => vscode.postMessage({ type, threadId });

const makeButton = (label, intent, threadId, suggestionId, secondary, ariaLabel) => {
  const b = el('button', secondary ? 'secondary' : '', label);
  b.type = 'button';
  b.setAttribute('aria-label', ariaLabel || label);
  b.addEventListener('click', () => postIntent(intent, threadId, suggestionId));
  return b;
};

const renderBanner = (payload) => {
  clear(banner);
  if (!payload) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = 'flex';
  banner.className = payload.kind === 'warning' ? 'banner warning' : 'banner';
  banner.appendChild(el('span', '', payload.message));
  const actions = el('div', 'bannerActions');
  (payload.actions || []).forEach((action) => {
    actions.appendChild(makeButton(action.label, action.intent, undefined, undefined, true, action.label));
  });
  banner.appendChild(actions);
};

const renderToolbar = () => {
  clear(toolbar);
  if (!vm) return;
  const status = el('select');
  status.setAttribute('aria-label', 'Filter by status');
  ['all', 'open', 'resolved'].forEach((value) => {
    const option = el('option', '', value);
    option.value = value;
    if (vm.ui.filters.status === value) option.selected = true;
    status.appendChild(option);
  });
  const owner = el('select');
  owner.setAttribute('aria-label', 'Filter by ownership');
  ['all', 'mine'].forEach((value) => {
    const option = el('option', '', value);
    option.value = value;
    if (vm.ui.filters.ownership === value) option.selected = true;
    owner.appendChild(option);
  });
  const hasSuggestionsWrap = el('label', 'checkboxWrap');
  const hasSuggestions = el('input');
  hasSuggestions.type = 'checkbox';
  hasSuggestions.checked = vm.ui.filters.hasSuggestions;
  hasSuggestions.setAttribute('aria-label', 'Only show threads with suggestions');
  hasSuggestionsWrap.appendChild(hasSuggestions);
  hasSuggestionsWrap.appendChild(el('span', '', 'With suggestions'));

  const updateFilters = () => vscode.postMessage({
    type: 'setFilters',
    filters: {
      status: status.value,
      ownership: owner.value,
      hasSuggestions: hasSuggestions.checked,
    },
  });
  status.addEventListener('change', updateFilters);
  owner.addEventListener('change', updateFilters);
  hasSuggestions.addEventListener('change', updateFilters);

  const addComment = el('button', '', 'Add comment from selection');
  addComment.type = 'button';
  addComment.setAttribute('aria-label', 'Add comment from current selection');
  addComment.addEventListener('click', () => {
    const body = window.prompt('Comment text');
    if (body === null) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    postIntent('addComment', undefined, undefined, trimmed);
  });

  toolbar.appendChild(status);
  toolbar.appendChild(owner);
  toolbar.appendChild(hasSuggestionsWrap);
  toolbar.appendChild(addComment);
};

const renderThread = (thread) => {
  const expanded = vm.ui.expandedThreadIds.includes(thread.threadId);
  const card = el('section', 'thread');
  card.setAttribute('data-thread-id', thread.threadId);

  const header = el('header', 'threadHeader');
  header.tabIndex = 0;
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  header.setAttribute('aria-label', 'Toggle thread ' + thread.latestSnippet);
  header.addEventListener('click', () => postUi('toggleThread', thread.threadId));
  header.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      postUi('toggleThread', thread.threadId);
    }
  });

  const titleWrap = el('div');
  titleWrap.appendChild(el('div', '', thread.latestSnippet));
  const badges = el('div', 'badges');
  [thread.status, thread.relevanceState, thread.timelineKind, thread.anchorConfidence].forEach((text) => {
    badges.appendChild(el('span', 'badge', text));
  });
  titleWrap.appendChild(badges);
  header.appendChild(titleWrap);
  card.appendChild(header);

  if (expanded) {
    const body = el('div', 'threadBody');
    const actions = el('div', 'actions');
    const reply = el('button', '', 'Reply');
    reply.type = 'button';
    reply.setAttribute('aria-label', 'Reply to thread');
    reply.addEventListener('click', () => {
      const body = window.prompt('Reply text');
      if (body === null) return;
      const trimmed = body.trim();
      if (!trimmed) return;
      postIntent('reply', thread.threadId, undefined, trimmed);
    });
    actions.appendChild(reply);
    if (thread.canResolve) actions.appendChild(makeButton('Resolve', 'resolve', thread.threadId, undefined, true, 'Resolve thread'));
    if (thread.canReopen) actions.appendChild(makeButton('Reopen', 'reopen', thread.threadId, undefined, true, 'Reopen thread'));
    actions.appendChild(makeButton('Suggest from Selection', 'suggestFromSelection', thread.threadId, undefined, false, 'Suggest from selection'));
    actions.appendChild(makeButton('Jump to anchor', 'jumpToAnchor', thread.threadId, undefined, true, 'Jump to anchor'));
    if (thread.anchorConfidence === 'broken') {
      actions.appendChild(makeButton('Relink anchor', 'relinkAnchor', thread.threadId, undefined, true, 'Relink anchor'));
    }
    if (thread.suggestions.length > 0) {
      const latestSuggestionId = thread.suggestions[thread.suggestions.length - 1].suggestionId;
      actions.appendChild(makeButton('View base version', 'viewBaseVersion', thread.threadId, latestSuggestionId, true, 'View base version context'));
    }
    body.appendChild(actions);

    thread.messages.forEach((message) => {
      const bubble = el('article', 'bubble ' + (message.kind === 'system' ? 'system' : ''));
      bubble.setAttribute('role', 'article');
      bubble.appendChild(el('div', 'bubbleHead', message.authorLabel + ' · ' + new Date(message.createdAt).toLocaleString()));
      bubble.appendChild(el('div', 'bubbleBody', message.body));
      body.appendChild(bubble);
    });

    thread.suggestions.forEach((suggestion) => {
      const card = el('section', 'suggestion');
      card.setAttribute('aria-label', 'Suggestion status ' + suggestion.status);
      card.appendChild(el('div', 'suggestionHead', '💡 Suggestion · ' + suggestion.status));
      card.appendChild(el('div', '', suggestion.replacementPreview));
      const sa = el('div', 'actions');
      if (suggestion.status === 'proposed') {
        sa.appendChild(makeButton('Apply', 'applySuggestion', thread.threadId, suggestion.suggestionId, false, 'Apply suggestion'));
        sa.appendChild(makeButton('Reject', 'rejectSuggestion', thread.threadId, suggestion.suggestionId, true, 'Reject suggestion'));
      }
      sa.appendChild(makeButton('View base version', 'viewBaseVersion', thread.threadId, suggestion.suggestionId, true, 'View base version'));
      card.appendChild(sa);
      body.appendChild(card);
    });

    card.appendChild(body);
  }

  return card;
};

const render = () => {
  clear(root);
  renderToolbar();
  if (!vm) {
    root.className = 'empty';
    root.textContent = 'No thread data loaded.';
    return;
  }
  root.className = '';

  const mkGroup = (name, threads, groupName) => {
    const group = el('section', 'group');
    group.setAttribute('data-group', groupName);
    group.appendChild(el('h3', 'groupTitle', name + ' (' + threads.length + ')'));
    threads.forEach((thread) => group.appendChild(renderThread(thread)));
    return group;
  };

  root.appendChild(mkGroup('Open', vm.groups.open, 'open'));
  root.appendChild(mkGroup('Resolved', vm.groups.resolved, 'resolved'));
};

const patchThread = (groupName, threadId, thread) => {
  if (!vm) return;
  vm.groups[groupName] = vm.groups[groupName].map((candidate) => candidate.threadId === threadId ? thread : candidate);
  const group = root.querySelector('[data-group="' + groupName + '"]');
  if (!group) return render();
  const prior = group.querySelector('[data-thread-id="' + threadId + '"]');
  const next = renderThread(thread);
  if (prior) group.replaceChild(next, prior);
};

window.addEventListener('message', (event) => {
  guard(() => {
    if (!event.data || event.data.type !== 'render') return;
    renderBanner(event.data.banner);
    if (event.data.mode === 'patchThread' && vm) {
      patchThread(event.data.group, event.data.threadId, event.data.thread);
      return;
    }
    vm = event.data.vm;
    render();
  }, 'Thread panel failed to render. Try reloading the window.');
});

window.addEventListener('error', () => {
  replaceLoadingWithError('Thread panel failed to initialize. Try reloading the window.');
});

window.addEventListener('unhandledrejection', () => {
  replaceLoadingWithError('Thread panel failed to initialize. Try reloading the window.');
});
`;

const html = (webview: vscode.Webview): string => {
  const nonce = String(Date.now());
  const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 8px; }
.group { margin-bottom: 14px; }
.groupTitle { margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; opacity: 0.8; }
.thread { border: 1px solid var(--vscode-panel-border); border-radius: 10px; margin-bottom: 8px; }
.threadHeader { display: flex; justify-content: space-between; gap: 8px; padding: 8px; cursor: pointer; }
.badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.badge { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 1px 6px; font-size: 10px; }
.threadBody { padding: 0 8px 8px; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; position: sticky; bottom: 0; background: var(--vscode-sideBar-background); padding: 6px 0; }
button { border: 1px solid var(--vscode-button-border, transparent); border-radius: 6px; padding: 3px 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
button:focus, .threadHeader:focus, select:focus, input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
.bubble { margin: 8px 0; padding: 8px; border-radius: 10px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-editorWidget-background); }
.bubble.system { border-style: dashed; }
.bubbleHead { font-size: 11px; opacity: 0.85; margin-bottom: 5px; }
.bubbleBody { white-space: pre-wrap; word-break: break-word; line-height: 1.35; }
.suggestion { margin: 6px 0; border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 6px; }
.suggestionHead { font-weight: 600; margin-bottom: 4px; }
.banner { display: none; justify-content: space-between; gap: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 8px; margin-bottom: 8px; }
.banner.warning { border-color: var(--vscode-inputValidation-warningBorder); background: var(--vscode-inputValidation-warningBackground); }
.bannerActions { display: flex; flex-wrap: wrap; gap: 6px; }
.checkboxWrap { display: inline-flex; align-items: center; gap: 4px; }
.empty { opacity: 0.8; }
</style>
</head>
<body>
<div id="banner" class="banner" role="status" aria-live="polite"></div>
<div id="toolbar" class="toolbar"></div>
<div id="root" class="empty">Loading threads…</div>
<script nonce="${nonce}">${clientScript}</script>
</body>
</html>`;
};

export class ThreadChatPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private uiState: ChatPanelUiState = defaultChatPanelUiState();
  private pendingState?: DocumentThreadState;
  private debounce?: NodeJS.Timeout;
  private lastVm?: ChatPanelViewModel;
  private banner?: ChatPanelBanner;

  constructor(
    private readonly dispatch: CommandDispatcher,
    private readonly getCurrentAuthorId: () => string | undefined = () => undefined,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = html(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message: WebviewInboundMessage) => {
      if (isUiMessage(message)) {
        if (message.type === 'toggleThread') {
          if (this.uiState.expandedThreadIds.has(message.threadId)) this.uiState.expandedThreadIds.delete(message.threadId);
          else this.uiState.expandedThreadIds.add(message.threadId);
          this.uiState.activeThreadId = message.threadId;
        }
        if (message.type === 'setActiveThread') {
          this.uiState.activeThreadId = message.threadId;
        }
        this.renderNow();
        return;
      }

      if (isSetFiltersMessage(message)) {
        this.uiState.filters = message.filters;
        this.renderNow();
        return;
      }

      if (!isIntent(message)) return;
      this.banner = undefined;
      const command = chatIntentToCommand[message.intent];
      const args = buildIntentDispatchArgs(message);
      try {
        await this.dispatch(command, ...args);
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        if (text.toLowerCase().includes('sidecar') && text.toLowerCase().includes('conflict')) {
          this.banner = {
            kind: 'warning',
            message: 'Sidecar conflict detected. Reload sidecar and retry.',
            actions: [{ label: 'Reload Sidecar', intent: 'reloadSidecar' }],
          };
        }
        this.renderNow();
      }
    });

    this.renderNow();
  }

  updateState(state: DocumentThreadState | undefined) {
    this.pendingState = state;
    this.uiState.currentAuthorId = this.getCurrentAuthorId();
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.renderNow(), 80);
  }

  showConflictBanner() {
    this.banner = {
      kind: 'warning',
      message: 'Sidecar conflict detected. Reload sidecar and retry.',
      actions: [{ label: 'Reload Sidecar', intent: 'reloadSidecar' }],
    };
    this.renderNow();
  }

  private renderNow() {
    if (!this.view) return;
    const vm = toChatPanelViewModel(this.pendingState, this.uiState);
    const patch = computeThreadPatch(this.lastVm, vm);
    if (patch && this.banner === undefined) {
      this.lastVm = vm;
      void this.view.webview.postMessage({ type: 'render', ...patch });
      return;
    }
    this.lastVm = vm;
    void this.view.webview.postMessage({ type: 'render', mode: 'full', vm, banner: this.banner } satisfies FullPayload & { type: 'render'; banner?: ChatPanelBanner });
  }
}

export const buildThreadChatPanelViewModel = (
  state: DocumentThreadState | undefined,
  uiState: ChatPanelUiState,
): ChatPanelViewModel | undefined => toChatPanelViewModel(state, uiState);

export const __testOnlyComputeThreadPatch = computeThreadPatch;
export const __testOnlyClientScript = clientScript;
export const __testOnlyBuildIntentDispatchArgs = buildIntentDispatchArgs;
