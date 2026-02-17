import { describe, expect, it } from 'vitest';
import { computeDiffMap, remapAnchorViaDiff } from '../../src/diff-remap.js';
import { buildAnchor } from '../../src/anchor.js';
import { reanchor } from '../../src/reanchor.js';

describe('computeDiffMap', () => {
  it('maps offsets through identical texts', () => {
    const text = 'line one\nline two\nline three\n';
    const dm = computeDiffMap(text, text);
    expect(dm.mapOffset(0)).toBe(0);
    expect(dm.mapOffset(5)).toBe(5);
    expect(dm.mapOffset(text.length - 1)).toBe(text.length - 1);
  });

  it('maps offsets after insertion before anchor', () => {
    const old = 'aaa\nbbb\nccc\n';
    const nw = 'aaa\nINSERTED\nbbb\nccc\n';
    const dm = computeDiffMap(old, nw);
    // 'aaa\n' is at [0,4) in both — still matched
    expect(dm.mapOffset(0)).toBe(0); // start of 'aaa'
    // 'bbb\n' was at [4,8) in old, now at [13,17) in new
    expect(dm.mapOffset(4)).toBe(13); // start of 'bbb'
    expect(dm.mapOffset(5)).toBe(14); // second char of 'bbb'
    // 'ccc\n' was at [8,12) in old, now at [17,21) in new
    expect(dm.mapOffset(8)).toBe(17);
  });

  it('maps offsets after deletion before anchor', () => {
    const old = 'aaa\nDELETED\nbbb\nccc\n';
    const nw = 'aaa\nbbb\nccc\n';
    const dm = computeDiffMap(old, nw);
    // 'aaa\n' matched
    expect(dm.mapOffset(0)).toBe(0);
    // 'DELETED\n' at [4,12) in old — deleted
    expect(dm.mapOffset(4)).toBeNull();
    expect(dm.mapOffset(8)).toBeNull();
    // 'bbb\n' was at [12,16) in old, now at [4,8) in new
    expect(dm.mapOffset(12)).toBe(4);
  });

  it('returns null for offsets in deleted lines', () => {
    const old = 'keep\nremove me\nkeep too\n';
    const nw = 'keep\nkeep too\n';
    const dm = computeDiffMap(old, nw);
    // 'remove me\n' at [5,15) in old
    expect(dm.mapOffset(5)).toBeNull();
    expect(dm.mapOffset(10)).toBeNull();
  });

  it('handles multiple insertions and deletions', () => {
    const old = 'a\nb\nc\nd\ne\n';
    const nw = 'a\nX\nc\nY\ne\n';
    const dm = computeDiffMap(old, nw);
    // 'a\n' matched at [0,2)
    expect(dm.mapOffset(0)).toBe(0);
    // 'b\n' deleted
    expect(dm.mapOffset(2)).toBeNull();
    // 'c\n' was at [4,6), now at [4,6)
    expect(dm.mapOffset(4)).toBe(4);
    // 'd\n' deleted
    expect(dm.mapOffset(6)).toBeNull();
    // 'e\n' was at [8,10), now at [8,10)
    expect(dm.mapOffset(8)).toBe(8);
  });

  it('handles empty old text', () => {
    const dm = computeDiffMap('', 'new content\n');
    expect(dm.mapOffset(0)).toBeNull();
  });

  it('handles empty new text', () => {
    const dm = computeDiffMap('old content\n', '');
    expect(dm.mapOffset(0)).toBeNull();
  });
});

describe('remapAnchorViaDiff', () => {
  const makeAnchor = (text: string, start: number, end: number) =>
    buildAnchor(text, start, end);

  it('remaps anchor shifted by insertion before it', () => {
    const old = 'Hello world, this is a test document.\n';
    const nw = 'PREPENDED LINE\nHello world, this is a test document.\n';
    const anchor = makeAnchor(old, 13, 17); // "this"
    const dm = computeDiffMap(old, nw);
    const result = remapAnchorViaDiff(nw, anchor, dm);

    expect(result).not.toBeNull();
    expect(result!.anchor_confidence).toBe('high');
    expect(result!.reason_code).toBe('diff_remapped');
    expect(result!.reanchored).toBe(true);
    expect(result!.start.offset_utf16).toBe(28); // 15 + 13
    expect(nw.slice(result!.start.offset_utf16, result!.end.offset_utf16)).toBe('this');
  });

  it('remaps anchor shifted by deletion before it', () => {
    const old = 'DELETE THIS LINE\nHello world.\n';
    const nw = 'Hello world.\n';
    const anchor = makeAnchor(old, 23, 28); // "world"
    const dm = computeDiffMap(old, nw);
    const result = remapAnchorViaDiff(nw, anchor, dm);

    expect(result).not.toBeNull();
    expect(result!.start.offset_utf16).toBe(6);
    expect(nw.slice(result!.start.offset_utf16, result!.end.offset_utf16)).toBe('world');
  });

  it('returns null when anchor text is deleted', () => {
    const old = 'keep\ndelete this line\nkeep\n';
    const nw = 'keep\nkeep\n';
    const anchor = makeAnchor(old, 5, 21); // "delete this line\n" spans the deleted line
    const dm = computeDiffMap(old, nw);
    const result = remapAnchorViaDiff(nw, anchor, dm);

    expect(result).toBeNull();
  });

  it('returns null when anchor text was modified', () => {
    const old = 'The quick brown fox.\n';
    const nw = 'The slow brown fox.\n';
    const anchor = makeAnchor(old, 4, 9); // "quick"
    const dm = computeDiffMap(old, nw);
    const result = remapAnchorViaDiff(nw, anchor, dm);

    // "quick" line was replaced with "slow" line — line deleted from LCS
    expect(result).toBeNull();
  });

  it('returns null when mapped position has different text', () => {
    // Same line structure but content changed within a matched line
    // This tests the quote verification step
    const old = 'unchanged\nsame line with word\nunchanged\n';
    const nw = 'unchanged\nsame line with word\nunchanged\n';

    // Modify anchor to have wrong quote (simulates a corrupted anchor)
    const anchor = makeAnchor(old, 10, 14); // "same"
    anchor.fallback.quote = 'NOPE'; // force mismatch

    const dm = computeDiffMap(old, nw);
    const result = remapAnchorViaDiff(nw, anchor, dm);

    expect(result).toBeNull();
  });

  it('handles anchor at start of document', () => {
    const old = 'Hello world.\nMore text.\n';
    const nw = 'Hello world.\nInserted.\nMore text.\n';
    const anchor = makeAnchor(old, 0, 5); // "Hello"
    const dm = computeDiffMap(old, nw);
    const result = remapAnchorViaDiff(nw, anchor, dm);

    expect(result).not.toBeNull();
    expect(result!.start.offset_utf16).toBe(0);
    expect(nw.slice(result!.start.offset_utf16, result!.end.offset_utf16)).toBe('Hello');
  });
});

describe('reanchor with diffMap integration', () => {
  it('uses diff remapping when diffMap is provided', () => {
    const old = 'Line one.\nLine two has anchor text here.\nLine three.\n';
    const nw = 'Line one.\nNew line inserted.\nLine two has anchor text here.\nLine three.\n';
    const anchor = buildAnchor(old, 23, 34); // "anchor text"

    const dm = computeDiffMap(old, nw);
    const result = reanchor(nw, anchor, { diffMap: dm });

    expect(result.anchor_confidence).toBe('high');
    expect(result.reason_code).toBe('diff_remapped');
    expect(result.reanchored).toBe(true);
    expect(nw.slice(result.start!.offset_utf16, result.end!.offset_utf16)).toBe('anchor text');
  });

  it('falls through to existing pipeline when diff remapping fails', () => {
    const old = 'Line one.\nLine with quote.\nLine three.\n';
    const nw = 'Line one.\nLine with CHANGED.\nLine with quote.\nLine three.\n';
    const anchor = buildAnchor(old, 15, 20); // "quote"
    // The old line "Line with quote." is still present in new text,
    // but offset shifted. Diff remap of the deleted line returns null,
    // falling through to nearby exact search.
    // Actually the line is present so let's test a real fallthrough case.

    // Force a case where diff can't help: anchor line was replaced
    const old2 = 'AAA\nBBB\nCCC\n';
    const nw2 = 'AAA\nXXX\nBBB somewhere nearby\nCCC\n';
    const anchor2 = buildAnchor(old2, 4, 7); // "BBB"
    // "BBB\n" deleted (replaced by "XXX\n"), diff returns null
    // But "BBB" appears in "BBB somewhere nearby" — nearby exact should find it

    const dm = computeDiffMap(old2, nw2);
    const result = reanchor(nw2, anchor2, { diffMap: dm });

    // Should fall through to step 2 (nearby exact) or step 3
    expect(result.anchor_confidence).not.toBe('broken');
    expect(result.reason_code).not.toBe('diff_remapped');
  });

  it('prefers exact positional over diff remapping', () => {
    const text = 'The text is unchanged.\n';
    const anchor = buildAnchor(text, 4, 8); // "text"
    const dm = computeDiffMap(text, text);
    const result = reanchor(text, anchor, { diffMap: dm });

    expect(result.reason_code).toBe('exact_positional');
    expect(result.reanchored).toBe(false);
  });

  it('works without diffMap (backward compatible)', () => {
    const old = 'Hello world.\n';
    const nw = 'Hello world.\n';
    const anchor = buildAnchor(old, 6, 11); // "world"
    const result = reanchor(nw, anchor);

    expect(result.anchor_confidence).toBe('high');
    expect(result.reason_code).toBe('exact_positional');
  });
});
