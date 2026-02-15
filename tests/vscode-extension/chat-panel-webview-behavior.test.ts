import { describe, expect, it } from 'vitest';
import { __testOnlyClientScript, __testOnlyComputeThreadPatch } from '../../vscode-extension/src/threadChatPanel.js';
import { defaultChatPanelUiState, toChatPanelViewModel } from '../../vscode-extension/src/chatPanelViewModel.js';
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

  it('exposes filter controls, conflict banner action, and aria labels in client script', () => {
    expect(__testOnlyClientScript).toContain("type: 'setFilters'");
    expect(__testOnlyClientScript).toContain('bannerActions');
    expect(__testOnlyClientScript).toContain('aria-label');
    expect(__testOnlyClientScript).toContain('Suggestion status');
    expect(__testOnlyClientScript).toContain('Add comment from selection');
    expect(__testOnlyClientScript).toContain("window.prompt('Reply text')");
  });
});
