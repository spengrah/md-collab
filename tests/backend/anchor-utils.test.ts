import { describe, expect, it } from 'vitest';
import { buildAnchor, hashContext, hashQuote, normalizeForHash, offsetToPoint, pointToOffset } from '../../src/index.js';

describe('anchor utilities', () => {
  it('round-trips UTF-16 offsets and points', () => {
    const text = 'A🙂B\nNext';
    const point = offsetToPoint(text, 3);
    expect(point).toEqual({ line: 1, column: 4, offset_utf16: 3 });
    expect(pointToOffset(text, point)).toBe(3);
  });

  it('normalizes and hashes deterministically', () => {
    expect(normalizeForHash('  Hello\nWORLD  ')).toBe('hello world');
    expect(hashQuote('Hello\nworld')).toBe(hashQuote(' hello   WORLD '));
    expect(hashContext(' A ', ' B\nC ')).toBe(hashContext('a', 'b c'));
  });

  it('builds anchor with prefix/suffix defaults and hashes', () => {
    const text = 'Alpha\nTarget sentence here.\nOmega';
    const start = text.indexOf('Target');
    const end = start + 'Target sentence here.'.length;
    const anchor = buildAnchor(text, start, end);
    expect(anchor.fallback.quote).toBe('Target sentence here.');
    expect(anchor.fallback.quote_hash.startsWith('sha256:')).toBe(true);
    expect(anchor.fallback.context_hash.startsWith('sha256:')).toBe(true);
  });
});
