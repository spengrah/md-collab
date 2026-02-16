import { describe, expect, it } from 'vitest';
import { buildAnchor, hashContext, hashQuote, MdCollabError, normalizeForHash, offsetToPoint, pointToOffset, validateAnchor } from '../../src/index.js';
import type { Anchor } from '../../src/index.js';

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

describe('validateAnchor', () => {
  const text = 'Alpha\nTarget sentence here.\nOmega';

  const makeAnchor = (): Anchor => {
    const start = text.indexOf('Target');
    const end = start + 'Target sentence here.'.length;
    return buildAnchor(text, start, end);
  };

  it('passes for a valid anchor (happy path)', () => {
    const anchor = makeAnchor();
    expect(() => validateAnchor(text, anchor)).not.toThrow();
  });

  it('throws on quote_hash mismatch', () => {
    const anchor = makeAnchor();
    anchor.fallback.quote_hash = 'sha256:bad';
    expect(() => validateAnchor(text, anchor)).toThrow(MdCollabError);
    expect(() => validateAnchor(text, anchor)).toThrow('quote_hash mismatch');
  });

  it('throws on context_hash mismatch', () => {
    const anchor = makeAnchor();
    anchor.fallback.context_hash = 'sha256:bad';
    expect(() => validateAnchor(text, anchor)).toThrow(MdCollabError);
    expect(() => validateAnchor(text, anchor)).toThrow('context_hash mismatch');
  });

  it('throws when start offset is negative', () => {
    const anchor = makeAnchor();
    anchor.primary.start.offset_utf16 = -1;
    expect(() => validateAnchor(text, anchor)).toThrow('offsets out of bounds');
  });

  it('throws when end offset exceeds text length', () => {
    const anchor = makeAnchor();
    anchor.primary.end.offset_utf16 = text.length + 1;
    expect(() => validateAnchor(text, anchor)).toThrow('offsets out of bounds');
  });
});
