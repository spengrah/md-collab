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

describe('reanchor global unique exact match', () => {
  it('recovers when unique quote shifts beyond ±W window', () => {
    // Place quote far from the stale offset — beyond W=50
    const text = 'a'.repeat(200) + 'unique target phrase' + 'b'.repeat(200);
    const anchor = makeAnchor('unique target phrase', 0); // stale offset 0, actual at 200

    const out = reanchor(text, anchor, { W: 50 });
    expect(out.anchor_confidence).toBe('high');
    expect(out.reason_code).toBe('exact_global');
    expect(out.reanchored).toBe(true);
    expect(out.start?.offset_utf16).toBe(200);
  });

  it('does not trigger for duplicate quotes (falls through to disambiguation)', () => {
    const text = 'prefix1 target middle target suffix2';
    const anchor = makeAnchor('target', 0, 'prefix1 ', ' middle');

    const out = reanchor(text, anchor, { W: 5 });
    // Multiple matches → disambiguation, not global exact
    expect(out.reason_code).not.toBe('exact_global');
  });

  it('still returns exact_nearby when match is within ±W', () => {
    const text = 'hello unique phrase world';
    const anchor = makeAnchor('unique phrase', 0); // stale offset 0, actual at 6

    const out = reanchor(text, anchor, { W: 600 });
    expect(out.anchor_confidence).toBe('high');
    expect(out.reason_code).toBe('exact_nearby');
  });

  it('handles large document restructuring (simulates real orphaned thread case)', () => {
    // Simulate: 2000 chars of content was inserted before the quote
    const inserted = 'x'.repeat(2000);
    const original = '### C2 — Negotiation Engine (reference implementation)';
    const text = inserted + '\n\n' + original + '\n\nMore content here.';
    const anchor = makeAnchor(original, 100); // stale offset 100, actual at 2002

    const out = reanchor(text, anchor, { W: 600 });
    expect(out.anchor_confidence).toBe('high');
    expect(out.reason_code).toBe('exact_global');
    expect(out.reanchored).toBe(true);
    expect(out.start?.offset_utf16).toBe(2002);
  });

  it('falls through to broken when quote does not exist at all', () => {
    const text = 'completely different document content here';
    const anchor = makeAnchor('nonexistent quote text', 0);

    const out = reanchor(text, anchor, { W: 600 });
    expect(out.anchor_confidence).toBe('broken');
    expect(out.reason_code).toBe('broken');
  });
});
