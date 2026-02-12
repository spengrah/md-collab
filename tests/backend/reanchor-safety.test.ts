import { describe, expect, it } from 'vitest';
import { reanchor } from '../../src/index.js';

describe('reanchor ambiguity safety', () => {
  it('returns broken for near-tied exact-match ambiguity and does not fuzzy-attach afterward', () => {
    const text = 'aaaaaatargetbbtargetcccc';
    const anchor = {
      primary: {
        // In-between stale offset: equidistant from both exact candidates and not an exact positional match.
        start: { line: 1, column: 11, offset_utf16: 10 },
        end: { line: 1, column: 17, offset_utf16: 16 },
      },
      fallback: {
        quote: 'target',
        prefix: '',
        suffix: '',
        quote_hash: 'sha256:q',
        context_hash: 'sha256:c',
      },
      anchor_confidence: 'high' as const,
    };

    const out = reanchor(text, anchor, { T_high: 0.9, T_low: 0.72, W: 600 });
    expect(out.anchor_confidence).toBe('broken');
    expect(out.reason_code).toBe('broken');
    expect(out.start).toBeNull();
  });
});
