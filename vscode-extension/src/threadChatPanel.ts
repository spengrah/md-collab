import * as vscode from 'vscode';
import {
  defaultChatPanelUiState,
  toChatPanelViewModel,
  type ChatPanelUiState,
  type ChatPanelViewModel,
} from './chatPanelViewModel.js';
import type { DocumentThreadState } from './model.js';

export const THREAD_CHAT_VIEW_ID = 'mdCollab.threadChat';

export const chatIntentToCommand = {
  reply: 'mdCollab.replyToThread',
  resolve: 'mdCollab.resolveThread',
  reopen: 'mdCollab.reopenThread',
  suggest: 'mdCollab.proposeSuggestion',
  suggestFromSelection: 'mdCollab.proposeSuggestionFromSelection',
  applySuggestion: 'mdCollab.applySuggestion',
  rejectSuggestion: 'mdCollab.rejectSuggestion',
  viewBaseVersion: 'mdCollab.viewSuggestionBaseVersion',
  jumpToAnchor: 'mdCollab.navigateToThread',
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
}

interface WebviewUiMessage {
  type: 'toggleThread' | 'setActiveThread';
  threadId: string;
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

const clientScript = `
const vscode = acquireVsCodeApi();
let vm;
const root = document.getElementById('root');

const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const postIntent = (intent, threadId, suggestionId) => vscode.postMessage({ type: 'intent', intent, threadId, suggestionId });
const postUi = (type, threadId) => vscode.postMessage({ type, threadId });

const makeButton = (label, intent, threadId, suggestionId, secondary, ariaLabel) => {
  const b = el('button', secondary ? 'secondary' : '', label);
  b.type = 'button';
  b.setAttribute('aria-label', ariaLabel || label);
  b.addEventListener('click', () => postIntent(intent, threadId, suggestionId));
  return b;
};

const renderThread = (thread) => {
  const expanded = vm.ui.expandedThreadIds.includes(thread.threadId);
  const card = el('section', 'thread');

  const header = el('header', 'threadHeader');
  header.tabIndex = 0;
  header.setAttribute('role', 'button');
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
    actions.appendChild(makeButton('Reply', 'reply', thread.threadId, undefined, false, 'Reply to thread'));
    if (thread.canResolve) actions.appendChild(makeButton('Resolve', 'resolve', thread.threadId, undefined, true, 'Resolve thread'));
    if (thread.canReopen) actions.appendChild(makeButton('Reopen', 'reopen', thread.threadId, undefined, true, 'Reopen thread'));
    actions.appendChild(makeButton('Suggest from Selection', 'suggestFromSelection', thread.threadId, undefined, false, 'Suggest from selection'));
    actions.appendChild(makeButton('Jump to anchor', 'jumpToAnchor', thread.threadId, undefined, true, 'Jump to anchor'));
    body.appendChild(actions);

    thread.messages.forEach((message) => {
      const bubble = el('article', 'bubble ' + (message.kind === 'system' ? 'system' : ''));
      bubble.appendChild(el('div', 'bubbleHead', message.authorLabel + ' · ' + new Date(message.createdAt).toLocaleString()));
      bubble.appendChild(el('div', 'bubbleBody', message.body));
      body.appendChild(bubble);
    });

    thread.suggestions.forEach((suggestion) => {
      const card = el('section', 'suggestion');
      card.appendChild(el('div', '', 'Suggestion ' + suggestion.suggestionId.slice(0, 8) + ' · ' + suggestion.status));
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
  if (!vm) {
    root.className = 'empty';
    root.textContent = 'No thread data loaded.';
    return;
  }
  root.className = '';

  const mkGroup = (name, threads) => {
    const group = el('section', 'group');
    group.appendChild(el('h3', '', name + ' (' + threads.length + ')'));
    threads.forEach((thread) => group.appendChild(renderThread(thread)));
    return group;
  };

  root.appendChild(mkGroup('Open', vm.groups.open));
  root.appendChild(mkGroup('Resolved', vm.groups.resolved));
};

window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'render') {
    vm = event.data.vm;
    render();
  }
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
.group { margin-bottom: 14px; }
.group h3 { margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; opacity: 0.8; }
.thread { border: 1px solid var(--vscode-panel-border); border-radius: 10px; margin-bottom: 8px; }
.threadHeader { display: flex; justify-content: space-between; gap: 8px; padding: 8px; cursor: pointer; }
.badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.badge { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 1px 6px; font-size: 10px; }
.threadBody { padding: 0 8px 8px; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; position: sticky; bottom: 0; background: var(--vscode-sideBar-background); padding: 6px 0; }
button { border: 1px solid var(--vscode-button-border, transparent); border-radius: 6px; padding: 3px 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
button:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
.bubble { margin: 8px 0; padding: 8px; border-radius: 10px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-editorWidget-background); }
.bubble.system { border-style: dashed; }
.bubbleHead { font-size: 11px; opacity: 0.85; margin-bottom: 5px; }
.bubbleBody { white-space: pre-wrap; word-break: break-word; line-height: 1.35; }
.suggestion { margin: 6px 0; border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 6px; }
.empty { opacity: 0.8; }
</style>
</head>
<body>
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

  constructor(private readonly dispatch: CommandDispatcher) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = html(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
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

      if (!isIntent(message)) return;
      const command = chatIntentToCommand[message.intent];
      const args: unknown[] = [];
      if (message.threadId) args.push(message.threadId);
      if (message.suggestionId) args.push(message.suggestionId);
      await this.dispatch(command, ...args);
    });

    this.renderNow();
  }

  updateState(state: DocumentThreadState | undefined) {
    this.pendingState = state;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.renderNow(), 80);
  }

  private renderNow() {
    if (!this.view) return;
    const vm = toChatPanelViewModel(this.pendingState, this.uiState);
    void this.view.webview.postMessage({ type: 'render', vm });
  }
}

export const buildThreadChatPanelViewModel = (
  state: DocumentThreadState | undefined,
  uiState: ChatPanelUiState,
): ChatPanelViewModel | undefined => toChatPanelViewModel(state, uiState);
