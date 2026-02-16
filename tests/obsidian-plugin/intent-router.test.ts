import { describe, expect, it, vi } from 'vitest';

vi.mock('../../obsidian-plugin/src/service.js', () => ({
  addComment: vi.fn((s) => ({ ...s, marker: 'addComment' })),
  addReply: vi.fn((s) => ({ ...s, marker: 'reply' })),
  applyThreadSuggestion: vi.fn((s) => ({ ...s, marker: 'apply' })),
  loadState: vi.fn((path) => ({ documentPath: path, sidecarPath: `${path}.comments.json`, sidecar: { threads: [] }, revisionToken: { exists: false, mtimeMs: null, size: null, hash: null } })),
  proposeThreadSuggestion: vi.fn((s) => ({ ...s, marker: 'propose' })),
  reanchorAll: vi.fn((s) => ({ ...s, marker: 'reanchor' })),
  rejectThreadSuggestion: vi.fn((s) => ({ ...s, marker: 'reject' })),
  reopen: vi.fn((s) => ({ ...s, marker: 'reopen' })),
  resolve: vi.fn((s) => ({ ...s, marker: 'resolve' })),
}));

import { IntentRouter } from '../../obsidian-plugin/src/intent-router.js';

describe('obsidian-plugin intent router', () => {
  it('routes add comment intent to canonical command handler', () => {
    const router = new IntentRouter();
    const result = router.handle(
      { kind: 'add-comment-from-selection', body: 'x', startOffsetUtf16: 0, endOffsetUtf16: 1 },
      {
        state: { documentPath: 'note.md', sidecarPath: 'note.comments.json', sidecar: { threads: [] }, revisionToken: { exists: false, mtimeMs: null, size: null, hash: null } },
        author: { authorId: 'u1', authorLabel: 'User' },
      },
    ) as { marker?: string };

    expect(result.marker).toBe('addComment');
  });
});
