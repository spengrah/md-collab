import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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
  requestId?: string;
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

interface WebviewReadyMessage {
  type: 'ready';
}

type WebviewInboundMessage = WebviewIntentMessage | WebviewUiMessage | WebviewSetFiltersMessage | WebviewReadyMessage;

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
    typeof (candidate.filters as { hasSuggestions?: unknown }).hasSuggestions === 'boolean' &&
    ['proposedOnly', 'all'].includes((candidate.filters as { suggestionState?: string }).suggestionState ?? '')
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const loadClientScript = (): string => {
  const scriptPath = join(__dirname, 'webview-client.js');
  return readFileSync(scriptPath, 'utf-8');
};

const clientScript = loadClientScript();

const html = (webview: vscode.Webview): string => {
  const nonce = randomUUID();
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
.composerWrap { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.composer { min-height: 56px; resize: vertical; border: 1px solid var(--vscode-input-border); border-radius: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); padding: 6px; }
.inlineError { border: 1px solid var(--vscode-inputValidation-errorBorder); background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); padding: 8px; border-radius: 6px; display: flex; gap: 8px; align-items: center; }
.bubble.pending { opacity: 0.85; border-style: dashed; }
.diffWrap { display: flex; flex-direction: column; gap: 6px; }
.diffLine { display: flex; gap: 6px; border-radius: 6px; padding: 4px 6px; }
.diffLine.before { background: color-mix(in srgb, var(--vscode-editorError-foreground) 12%, transparent); }
.diffLine.after { background: color-mix(in srgb, var(--vscode-editorInfo-foreground) 12%, transparent); }
.diffLabel { width: 12px; font-weight: 700; }
.diffBody { white-space: pre-wrap; word-break: break-word; }
.token.changed { text-decoration: underline; text-decoration-thickness: 2px; }
.diffCollapsed { opacity: 0.85; font-style: italic; }
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

    webviewView.webview.onDidReceiveMessage((message: WebviewInboundMessage) => {
      if (message.type === 'ready') {
        this.renderNow();
        return;
      }

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
      // Detached: UI messages above return synchronously; intent handling is async
      // but must not block subsequent message processing.
      return this.handleIntent(webviewView, message);
    });
  }

  private async handleIntent(webviewView: vscode.WebviewView, message: WebviewIntentMessage) {
    this.banner = undefined;
    const command = chatIntentToCommand[message.intent];
    const args = buildIntentDispatchArgs(message);
    const requestId = message.requestId ?? randomUUID();
    try {
      await this.dispatch(command, ...args);
      void webviewView.webview.postMessage({ type: 'intentResult', requestId, threadId: message.threadId, ok: true });
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      const lowered = text.toLowerCase();
      if (lowered.includes('sidecar') && lowered.includes('conflict')) {
        try {
          await this.dispatch(chatIntentToCommand.reloadSidecar);
          await this.dispatch(command, ...args);
          void webviewView.webview.postMessage({ type: 'intentResult', requestId, threadId: message.threadId, ok: true, retried: true });
          return;
        } catch {
          this.banner = {
            kind: 'warning',
            message: 'Sidecar conflict detected. Reload sidecar and retry.',
            actions: [{ label: 'Reload Sidecar', intent: 'reloadSidecar' }],
          };
          void webviewView.webview.postMessage({
            type: 'intentResult',
            requestId,
            threadId: message.threadId,
            ok: false,
            kind: 'conflict',
          });
          this.renderNow();
          return;
        }
      }

      const looksLikeSelectionError =
        message.intent === 'addComment' &&
        (lowered.includes('selection') || lowered.includes('anchor') || lowered.includes('cursor'));
      void webviewView.webview.postMessage({
        type: 'intentResult',
        requestId,
        threadId: message.threadId,
        ok: false,
        kind: looksLikeSelectionError ? 'selection' : 'error',
        message: text,
      });
      this.renderNow();
    }
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
