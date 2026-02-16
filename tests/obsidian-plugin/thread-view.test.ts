import { describe, expect, it } from 'vitest';
import { buildThreadPanelSnapshot } from '../../obsidian-plugin/src/thread-view-model.js';
import type { DocumentThreadState } from '../../obsidian-plugin/src/service.js';

const sampleState: DocumentThreadState = {
  documentPath: 'note.md',
  sidecarPath: 'note.comments.json',
  revisionToken: { exists: true, mtimeMs: 1, size: 1, hash: 'h' },
  sidecar: {
    schema_version: '0.1.0',
    document: { path: 'note.md' },
    threads: [
      {
        thread_id: 't-open',
        status: 'open',
        anchor: {
          primary: { start: { line: 1, column: 1, offset_utf16: 0 }, end: { line: 1, column: 4, offset_utf16: 3 } },
          fallback: { quote: 'text', prefix: '', suffix: '', quote_hash: 'q', context_hash: 'c' },
          anchor_confidence: 'high',
        },
        author: { author_id: 'u1', author_label: 'User', verified: null },
        messages: [
          { message_id: 'm1', author: { author_id: 'u1', author_label: 'User', verified: null }, body: 'first', created_at: '2026-01-01T00:00:00.000Z', edited_at: null },
        ],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        suggestions: [
          {
            suggestion_id: 's1',
            thread_id: 't-open',
            status: 'proposed',
            proposed_edit: {
              anchor: {
                primary: { start: { line: 1, column: 1, offset_utf16: 0 }, end: { line: 1, column: 4, offset_utf16: 3 } },
                fallback: { quote: 'text', prefix: '', suffix: '', quote_hash: 'q', context_hash: 'c' },
                anchor_confidence: 'high',
              },
              before_text_hash: 'sha256:abc',
              replacement_text: 'new text',
            },
            proposed_by: { author_id: 'u1', author_label: 'User', verified: null },
            proposed_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      {
        thread_id: 't-resolved',
        status: 'resolved',
        anchor: {
          primary: { start: { line: 2, column: 1, offset_utf16: 10 }, end: { line: 2, column: 4, offset_utf16: 13 } },
          fallback: { quote: 'done', prefix: '', suffix: '', quote_hash: 'q2', context_hash: 'c2' },
          anchor_confidence: 'high',
        },
        author: { author_id: 'u1', author_label: 'User', verified: null },
        messages: [
          { message_id: 'm2', author: { author_id: 'u1', author_label: 'User', verified: null }, body: 'resolved body', created_at: '2026-01-01T00:00:00.000Z', edited_at: null },
        ],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  },
};

describe('thread panel snapshot', () => {
  it('includes counts, expansion state, and action labels', () => {
    const snapshot = buildThreadPanelSnapshot(sampleState, new Set(['t-open']), null);

    expect(snapshot.openCount).toBe(1);
    expect(snapshot.resolvedCount).toBe(1);

    const openThread = snapshot.threads.find((t) => t.threadId === 't-open');
    expect(openThread?.expanded).toBe(true);
    expect(openThread?.actions).toEqual(['Reply', 'Resolve', 'Suggest from selection', 'Jump to anchor']);
    expect(openThread?.suggestions[0]?.actions).toEqual(['Apply', 'Reject', 'View base context']);

    const resolvedThread = snapshot.threads.find((t) => t.threadId === 't-resolved');
    expect(resolvedThread?.actions).toEqual(['Reply', 'Reopen', 'Suggest from selection', 'Jump to anchor']);
  });

  it('surfaces recovery state in snapshot', () => {
    const snapshot = buildThreadPanelSnapshot(sampleState, new Set(), 'Sidecar conflict detected. Reload to recover before retrying.');
    expect(snapshot.hasRecovery).toBe(true);
    expect(snapshot.recoveryMessage).toContain('Reload');
  });
});
