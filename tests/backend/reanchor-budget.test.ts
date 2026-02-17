import { describe, expect, it } from 'vitest';
import { reanchor } from '../../src/index.js';
import type { Anchor } from '../../src/index.js';

const makeAnchor = (quote: string, offset: number, prefix = '', suffix = ''): Anchor => ({
  primary: {
    start: { line: 1, column: offset + 1, offset_utf16: offset },
    end: { line: 1, column: offset + quote.length + 1, offset_utf16: offset + quote.length },
  },
  fallback: {
    quote,
    prefix,
    suffix,
    quote_hash: 'sha256:q',
    context_hash: 'sha256:c',
  },
  anchor_confidence: 'high',
});

describe('reanchor fuzzy budget', () => {
  it('returns best candidate found within budget even if loop is incomplete', () => {
    // Create a large text that forces many fuzzy iterations
    const largeText = 'x'.repeat(2000) + 'hello world' + 'y'.repeat(2000);
    const anchor = makeAnchor('hello world', 2000);
    // Modify text so exact match fails, forcing fuzzy
    const modified = largeText.replace('hello world', 'hullo wurld');

    const result = reanchor(modified, anchor, { fuzzyBudgetMs: 200, W: 2000 });
    // Should still find a fuzzy match (or break out gracefully)
    expect(['low', 'broken']).toContain(result.anchor_confidence);
  });

  it('with a very tight budget (1ms), still returns a result without hanging', () => {
    const text = 'a'.repeat(500) + 'target phrase here' + 'b'.repeat(500);
    const anchor = makeAnchor('target phrase here', 500);
    const modified = text.replace('target phrase here', 'target phraze hear');

    const start = performance.now();
    const result = reanchor(modified, anchor, { fuzzyBudgetMs: 1, W: 600 });
    const elapsed = performance.now() - start;

    // Should complete quickly — well under 1 second
    expect(elapsed).toBeLessThan(1000);
    expect(['low', 'broken']).toContain(result.anchor_confidence);
  });

  it('returns fuzzy_recovery when best-so-far meets T_low before budget expires', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const anchor = makeAnchor('quick brown fox', 4, 'The ', ' jumps');
    // Small edit that fuzzy should catch easily
    const modified = 'The quikk brown fox jumps over the lazy dog';

    const result = reanchor(modified, anchor, { fuzzyBudgetMs: 200, W: 600 });
    expect(result.anchor_confidence).toBe('low');
    expect(result.reason_code).toBe('fuzzy_recovery');
    expect(result.start).not.toBeNull();
  });

  it('falls through to broken when best-so-far does not meet T_low', () => {
    const text = 'ABCDEFGHIJKLMNOP';
    const anchor = makeAnchor('ABCDEFGHIJKLMNOP', 0);
    // Completely different text — no reasonable fuzzy match
    const modified = '1234567890!@#$%^';

    const result = reanchor(modified, anchor, { fuzzyBudgetMs: 200, W: 600 });
    expect(result.anchor_confidence).toBe('broken');
    expect(result.reason_code).toBe('broken');
  });

  it('exact match bypasses budget entirely', () => {
    const text = 'hello world';
    const anchor = makeAnchor('hello world', 0);

    const result = reanchor(text, anchor, { fuzzyBudgetMs: 0 });
    expect(result.anchor_confidence).toBe('high');
    expect(result.reason_code).toBe('exact_positional');
  });
});
