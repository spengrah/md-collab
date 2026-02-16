import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { __testOnlyClientScript, __testOnlyComputeThreadPatch } from '../../vscode-extension/src/threadChatPanel.js';
import { defaultChatPanelUiState, toChatPanelViewModel } from '../../vscode-extension/src/chatPanelViewModel.js';
import type { ChatPanelViewModel } from '../../vscode-extension/src/chatPanelViewModel.js';
import type { DocumentThreadState } from '../../vscode-extension/src/model.js';

const state = (): DocumentThreadState => ({
  documentPath: '/tmp/doc.md',
  sidecarPath: '/tmp/doc.comments.json',
  readOnly: false,
  malformedMessage: undefined,
  sidecarExists: true,
  revisionToken: { exists: true, mtimeMs: 1, size: 1, hash: 'h' },
  sidecar: {
    schema_version: '0.1.0',
    document: { path: '/tmp/doc.md' },
    threads: [
      {
        thread_id: 't1',
        status: 'open',
        anchor: {
          anchor_confidence: 'high',
          primary: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } },
          fallback: { quote: 'a', prefix: '', suffix: '' },
        },
        relevance_state: 'active',
        messages: [
          {
            message_id: 'm1',
            author: { author_id: 'u1', author_label: 'User', verified: null },
            body: 'one',
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        suggestions: [],
      },
    ],
  },
});

type PostedMessage = Record<string, unknown>;

interface Harness {
  dom: JSDOM;
  posted: PostedMessage[];
  render: (vm: ChatPanelViewModel) => void;
}

const harnesses: Harness[] = [];

afterEach(() => {
  while (harnesses.length) {
    const h = harnesses.pop();
    h?.dom.window.close();
  }
});

const setupHarness = (): Harness => {
  const posted: PostedMessage[] = [];
  let persistedState: Record<string, unknown> = {};
  const dom = new JSDOM('<!doctype html><body><div id="banner"></div><div id="toolbar"></div><div id="root"></div></body>', {
    url: 'https://example.test',
    runScripts: 'outside-only',
  });

  (dom.window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
    getState: () => persistedState,
    setState: (next: Record<string, unknown>) => {
      persistedState = { ...next };
    },
    postMessage: (message: PostedMessage) => {
      posted.push(message);
    },
  });

  dom.window.eval(__testOnlyClientScript);

  const render = (vm: ChatPanelViewModel) => {
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'render', mode: 'full', vm } }));
  };

  const harness: Harness = { dom, posted, render };
  harnesses.push(harness);
  return harness;
};

const makeVm = (): ChatPanelViewModel => {
  const ui = defaultChatPanelUiState();
  ui.expandedThreadIds.add('t1');
  return toChatPanelViewModel(state(), ui)!;
};

const clickButtonByText = (container: ParentNode, text: string, win: Window): void => {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === text);
  expect(button, `expected button with text: ${text}`).toBeTruthy();
  button?.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
};

const dispatchIntentResult = (
  dom: JSDOM,
  payload: { requestId: string; ok: boolean; kind?: string; message?: string; threadId?: string },
): void => {
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'intentResult', ...payload } }));
};

describe('chat panel webview behavior', () => {
  it('prefers incremental thread patch when only one thread changes', () => {
    const ui = defaultChatPanelUiState();
    const prev = toChatPanelViewModel(state(), ui)!;
    const nextState = state();
    nextState.sidecar.threads[0].messages.push({
      message_id: 'm2',
      author: { author_id: 'u1', author_label: 'User', verified: null },
      body: 'two',
      created_at: '2026-01-01T00:00:01.000Z',
    });
    const next = toChatPanelViewModel(nextState, ui)!;

    const patch = __testOnlyComputeThreadPatch(prev, next);
    expect(patch).toMatchObject({ mode: 'patchThread', group: 'open', threadId: 't1' });
  });

  it('removes optimistic pending reply and restores draft on failure with thread-scoped error', () => {
    const { dom, posted, render } = setupHarness();
    render(makeVm());

    const thread = dom.window.document.querySelector('[data-thread-id="t1"]')!;
    const reply = thread.querySelector('textarea[aria-label="Reply to thread"]') as HTMLTextAreaElement;
    reply.value = 'Failed reply body';
    reply.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    clickButtonByText(thread, 'Reply', dom.window);

    const threadAfterSubmit = dom.window.document.querySelector('[data-thread-id="t1"]')!;
    expect(threadAfterSubmit.querySelector('.bubble.pending .bubbleBody')?.textContent).toBe('Failed reply body');
    const requestId = posted.find((entry) => entry.type === 'intent' && entry.intent === 'reply')?.requestId as string;
    expect(requestId).toBeTruthy();

    dispatchIntentResult(dom, { requestId, ok: false, kind: 'error', message: 'Reply failed at thread scope' });

    const threadAfterFailure = dom.window.document.querySelector('[data-thread-id="t1"]')!;
    expect(threadAfterFailure.querySelector('.bubble.pending')).toBeNull();
    const replyAfter = threadAfterFailure.querySelector('textarea[aria-label="Reply to thread"]') as HTMLTextAreaElement;
    expect(replyAfter.value).toBe('Failed reply body');
    expect(threadAfterFailure.querySelector('.inlineError')?.textContent).toContain('Reply failed at thread scope');
    expect(dom.window.document.querySelector('#toolbar .inlineError')).toBeNull();
  });

  it('restores add-comment draft and shows selection guidance at root scope only', () => {
    const { dom, posted, render } = setupHarness();
    render(makeVm());

    const toolbar = dom.window.document.getElementById('toolbar')!;
    const addComment = toolbar.querySelector('textarea[aria-label="Add comment from current selection text"]') as HTMLTextAreaElement;
    addComment.value = 'Root draft that fails';
    addComment.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    clickButtonByText(toolbar, 'Add comment from selection', dom.window);

    const requestId = posted.find((entry) => entry.type === 'intent' && entry.intent === 'addComment')?.requestId as string;
    expect(requestId).toBeTruthy();

    dispatchIntentResult(dom, { requestId, ok: false, kind: 'selection' });

    const addCommentAfter = toolbar.querySelector('textarea[aria-label="Add comment from current selection text"]') as HTMLTextAreaElement;
    expect(addCommentAfter.value).toBe('Root draft that fails');
    const rootError = toolbar.querySelector('.inlineError')?.textContent || '';
    expect(rootError).toContain('Could not add comment from selection. Select the target text in the editor, then retry.');
    expect(rootError).toContain('reload sidecar');

    const thread = dom.window.document.querySelector('[data-thread-id="t1"]')!;
    expect(thread.querySelector('.inlineError')).toBeNull();
  });

  it('conflict failure shows explicit retry-once guidance and reload affordance', () => {
    const { dom, posted, render } = setupHarness();
    render(makeVm());

    const thread = dom.window.document.querySelector('[data-thread-id="t1"]')!;
    const reply = thread.querySelector('textarea[aria-label="Reply to thread"]') as HTMLTextAreaElement;
    reply.value = 'Conflict body';
    reply.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    clickButtonByText(thread, 'Reply', dom.window);

    const requestId = posted.find((entry) => entry.type === 'intent' && entry.intent === 'reply')?.requestId as string;
    dispatchIntentResult(dom, { requestId, ok: false, kind: 'conflict' });

    const threadAfterConflict = dom.window.document.querySelector('[data-thread-id="t1"]')!;
    const inlineErrorText = threadAfterConflict.querySelector('.inlineError')?.textContent || '';
    expect(inlineErrorText).toContain('after one auto-retry');
    expect(inlineErrorText).toContain('Reload sidecar and retry.');

    clickButtonByText(threadAfterConflict.querySelector('.inlineError')!, 'Reload sidecar', dom.window);
    const reloadIntent = posted.find((entry) => entry.type === 'intent' && entry.intent === 'reloadSidecar');
    expect(reloadIntent).toBeTruthy();
  });
});
