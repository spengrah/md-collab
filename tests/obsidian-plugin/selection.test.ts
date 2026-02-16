import { describe, expect, it } from 'vitest';
import { normalizeSelection, pointToUtf16Offset } from '../../obsidian-plugin/src/selection.js';

describe('obsidian-plugin selection conversion', () => {
  const text = 'hello\nworld';

  it('converts line/ch to utf16 offset', () => {
    expect(pointToUtf16Offset(text, { line: 1, ch: 2 })).toBe(8);
  });

  it('normalizes reverse selection order', () => {
    const result = normalizeSelection(text, { line: 1, ch: 2 }, { line: 0, ch: 1 });
    expect(result).toEqual({ startOffsetUtf16: 1, endOffsetUtf16: 8 });
  });
});
