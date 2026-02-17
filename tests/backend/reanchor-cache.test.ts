import { describe, expect, it, beforeEach } from 'vitest';
import { evaluateThreadRelevance, invalidateReanchorCache, reanchor } from '../../src/index.js';
import type { Thread, RelevanceContext, Anchor } from '../../src/index.js';

const makeAnchor = (quote: string, offset: number): Anchor => ({
  primary: {
    start: { line: 1, column: offset + 1, offset_utf16: offset },
    end: { line: 1, column: offset + quote.length + 1, offset_utf16: offset + quote.length },
  },
  fallback: {
    quote,
    prefix: '',
    suffix: '',
    quote_hash: `sha256:q-${quote}`,
    context_hash: `sha256:c-${quote}`,
  },
  anchor_confidence: 'high',
});

const makeThread = (quote: string, offset: number, confidence: Thread['anchor']['anchor_confidence'] = 'high'): Thread => ({
  thread_id: 'test-thread',
  status: 'open',
  anchor: { ...makeAnchor(quote, offset), anchor_confidence: confidence },
  author: { author_id: 'a', author_label: 'A', verified: null },
  messages: [],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  relevance_state: 'active',
  relevance_checked_at: '2025-01-01T00:00:00Z',
});

const baseContext = (documentText: string): RelevanceContext => ({
  documentText,
  fileExists: true,
  timelineKind: 'workspace',
  workspaceSnapshotId: 'snap-1',
  workspaceFileHash: 'sha256:wfh',
  workspaceFileMtime: '2025-01-01T00:00:00Z',
});

describe('reanchor result cache', () => {
  beforeEach(() => {
    invalidateReanchorCache();
  });

  it('cache hit returns same result without re-running reanchor', () => {
    // Text where quote has moved, forcing reanchor (stale offset 100, actual at 7)
    const text = 'prefix hello world suffix';
    const thread = makeThread('hello world', 100);

    const result1 = evaluateThreadRelevance(thread, baseContext(text));
    const result2 = evaluateThreadRelevance(thread, baseContext(text));

    // Both should produce the same anchor result
    expect(result1.anchor.anchor_confidence).toBe(result2.anchor.anchor_confidence);
    expect(result1.anchor.primary.start).toEqual(result2.anchor.primary.start);
    expect(result1.anchor.primary.end).toEqual(result2.anchor.primary.end);
  });

  it('broken anchor recovers when document text changes to restore original quote', () => {
    const originalText = 'The quick brown fox jumps';
    // Use reanchor directly to verify broken vs recovered behavior
    const brokenAnchor = makeAnchor('quick brown fox', 4);

    // Against completely different text — reanchor should return broken
    const brokenResult = reanchor('Completely different content here now', brokenAnchor);
    expect(brokenResult.anchor_confidence).toBe('broken');

    // Against original text — should recover
    const recoveredResult = reanchor(originalText, brokenAnchor);
    expect(recoveredResult.anchor_confidence).toBe('high');
    expect(recoveredResult.reason_code).toBe('exact_positional');
  });

  it('invalidateReanchorCache clears the cache', () => {
    const text = 'prefix hello world suffix';
    const thread = makeThread('hello world', 100);

    evaluateThreadRelevance(thread, baseContext(text));
    invalidateReanchorCache();

    // After invalidation, should still work (just re-compute)
    const result = evaluateThreadRelevance(thread, baseContext(text));
    expect(result.anchor.primary.start).not.toBeNull();
  });

  it('broken anchors are re-evaluated via reanchor (no short-circuit)', () => {
    // Thread marked broken but text actually has the quote at a different offset
    // offset 100 is stale, actual quote is at offset 7
    const text = 'prefix hello world suffix';
    const thread = makeThread('hello world', 100, 'broken');

    const result = evaluateThreadRelevance(thread, baseContext(text));
    // Reanchor should find the quote via exact nearby search and recover
    expect(result.anchor.anchor_confidence).not.toBe('broken');
  });
});
