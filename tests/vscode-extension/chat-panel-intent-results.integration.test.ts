import { describe, expect, it, vi } from 'vitest';
import { ThreadChatPanelProvider } from '../../vscode-extension/src/threadChatPanel.js';

type Inbound = (message: unknown) => Promise<void> | void;

const setup = (dispatchImpl: (...args: unknown[]) => Promise<unknown>) => {
  let inbound: Inbound | undefined;
  const posted: unknown[] = [];
  const dispatch = vi.fn(dispatchImpl);
  const provider = new ThreadChatPanelProvider(dispatch as any);
  const view = {
    webview: {
      options: {},
      html: '',
      onDidReceiveMessage: (handler: Inbound) => {
        inbound = handler;
        return { dispose: () => undefined };
      },
      postMessage: (message: unknown) => {
        posted.push(message);
        return Promise.resolve(true);
      },
    },
  } as any;

  provider.resolveWebviewView(view);

  return {
    dispatch,
    posted,
    send: async (message: unknown) => {
      if (!inbound) throw new Error('inbound handler not initialized');
      await inbound(message);
    },
  };
};

describe('chat panel intent result integration', () => {
  it('returns intentResult for non-composer action failures (thread scoped)', async () => {
    const { send, posted } = setup(async () => {
      throw new Error('cannot resolve thread');
    });

    await send({ type: 'intent', intent: 'resolve', threadId: 't1', requestId: 'req-1' });

    expect(posted).toContainEqual({
      type: 'intentResult',
      requestId: 'req-1',
      threadId: 't1',
      ok: false,
      kind: 'error',
      message: 'cannot resolve thread',
    });
  });

  it('classifies add-comment selection failures for root toolbar guidance', async () => {
    const { send, posted } = setup(async () => {
      throw new Error('Selection is empty; choose text first');
    });

    await send({ type: 'intent', intent: 'addComment', body: 'hello', requestId: 'req-2' });

    expect(posted).toContainEqual({
      type: 'intentResult',
      requestId: 'req-2',
      threadId: undefined,
      ok: false,
      kind: 'selection',
      message: 'Selection is empty; choose text first',
    });
  });

  it('retries once on sidecar conflict then emits explicit conflict result', async () => {
    const { send, posted, dispatch } = setup(async (command: unknown) => {
      if (command === 'mdCollab.reloadSidecar') return;
      throw new Error('sidecar conflict: changed on disk');
    });

    await send({ type: 'intent', intent: 'reply', threadId: 't1', body: 'draft', requestId: 'req-3' });

    expect(dispatch).toHaveBeenNthCalledWith(1, 'mdCollab.replyToThread', { threadId: 't1', body: 'draft' });
    expect(dispatch).toHaveBeenNthCalledWith(2, 'mdCollab.reloadSidecar');
    expect(dispatch).toHaveBeenNthCalledWith(3, 'mdCollab.replyToThread', { threadId: 't1', body: 'draft' });
    expect(posted).toContainEqual({
      type: 'intentResult',
      requestId: 'req-3',
      threadId: 't1',
      ok: false,
      kind: 'conflict',
    });
  });
});
