import { describe, expect, it } from 'vitest';
import { defaultChatPanelUiState, toChatPanelViewModel } from '../../vscode-extension/src/chatPanelViewModel.js';
import type { DocumentThreadState } from '../../vscode-extension/src/model.js';

const sampleState = (): DocumentThreadState => ({
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
        thread_id: 't-open',
        status: 'open',
        anchor: {
          anchor_confidence: 'high',
          primary: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } },
          fallback: { quote: 'hello', prefix: '', suffix: '' },
        },
        relevance_state: 'active',
        messages: [
          {
            message_id: 'm1',
            author: { author_id: 'u1', author_label: 'User 1', verified: null },
            body: 'First message',
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        thread_version_context: { kind: 'workspace' },
        suggestions: [],
      },
      {
        thread_id: 't-resolved',
        status: 'resolved',
        anchor: {
          anchor_confidence: 'low',
          primary: { start: { line: 2, column: 1 }, end: { line: 2, column: 5 } },
          fallback: { quote: 'bye', prefix: '', suffix: '' },
        },
        relevance_state: 'stale',
        messages: [
          {
            message_id: 'm2',
            author: { author_id: 'system', author_label: 'System', verified: null },
            body: 'Resolved',
            created_at: '2026-01-01T01:00:00.000Z',
          },
        ],
        thread_version_context: { kind: 'git', base_commit: 'abc' },
        suggestions: [
          {
            suggestion_id: 's1',
            status: 'proposed',
            created_at: '2026-01-01T02:00:00.000Z',
            updated_at: '2026-01-01T03:00:00.000Z',
            proposed_edit: {
              anchor: {
                anchor_confidence: 'high',
                primary: { start: { line: 2, column: 1 }, end: { line: 2, column: 5 } },
                fallback: { quote: 'bye', prefix: '', suffix: '' },
              },
              before_text_hash: 'sha256:x',
              replacement_text: 'replacement',
            },
          },
        ],
      },
    ],
  },
});

describe('chat panel view-model', () => {
  it('maps grouped thread data and action visibility flags', () => {
    const ui = defaultChatPanelUiState();
    ui.expandedThreadIds.add('t-open');
    const vm = toChatPanelViewModel(sampleState(), ui)!;

    expect(vm.groups.open).toHaveLength(1);
    expect(vm.groups.resolved).toHaveLength(1);

    expect(vm.groups.open[0].canResolve).toBe(true);
    expect(vm.groups.open[0].canReopen).toBe(false);
    expect(vm.groups.resolved[0].canResolve).toBe(false);
    expect(vm.groups.resolved[0].canReopen).toBe(true);
    expect(vm.groups.resolved[0].suggestions[0].status).toBe('proposed');

    expect(vm.ui.expandedThreadIds).toContain('t-open');
  });
});
