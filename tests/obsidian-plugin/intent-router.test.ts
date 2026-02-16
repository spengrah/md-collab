import { describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
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

vi.mock('../../obsidian-plugin/src/service.js', () => serviceMocks);

import { IntentRouter } from '../../obsidian-plugin/src/intent-router.js';

describe('obsidian-plugin intent router', () => {
  const context = {
    state: { documentPath: 'note.md', sidecarPath: 'note.comments.json', sidecar: { threads: [] }, revisionToken: { exists: false, mtimeMs: null, size: null, hash: null } },
    author: { authorId: 'u1', authorLabel: 'User' },
  };

  it('routes add comment intent to canonical command handler', () => {
    const router = new IntentRouter();
    const result = router.handle({ kind: 'add-comment-from-selection', body: 'x', startOffsetUtf16: 0, endOffsetUtf16: 1 }, context) as {
      marker?: string;
    };
    expect(result.marker).toBe('addComment');
    expect(serviceMocks.addComment).toHaveBeenCalled();
  });

  it('routes reply/resolve/reopen intents', () => {
    const router = new IntentRouter();
    expect((router.handle({ kind: 'reply', threadId: 't1', body: 'reply' }, context) as { marker?: string }).marker).toBe('reply');
    expect((router.handle({ kind: 'resolve', threadId: 't1' }, context) as { marker?: string }).marker).toBe('resolve');
    expect((router.handle({ kind: 'reopen', threadId: 't1' }, context) as { marker?: string }).marker).toBe('reopen');
  });

  it('routes suggestion and reanchor intents', () => {
    const router = new IntentRouter();
    expect((router.handle({ kind: 'propose-suggestion', threadId: 't1', beforeText: 'a', replacementText: 'b' }, context) as { marker?: string }).marker).toBe('propose');
    expect((router.handle({ kind: 'apply-suggestion', threadId: 't1', suggestionId: 's1', beforeText: 'a' }, context) as { marker?: string }).marker).toBe('apply');
    expect((router.handle({ kind: 'reject-suggestion', threadId: 't1', suggestionId: 's1' }, context) as { marker?: string }).marker).toBe('reject');
    expect((router.handle({ kind: 'reanchor' }, context) as { marker?: string }).marker).toBe('reanchor');
  });
});
