import type { Anchor, Point } from './types.js';
import { offsetToPoint } from './anchor.js';

interface LineInfo {
  text: string;
  startOffset: number;
  endOffset: number; // exclusive (includes trailing newline if present)
}

const splitLines = (text: string): LineInfo[] => {
  const lines: LineInfo[] = [];
  let offset = 0;
  const raw = text.split('\n');
  for (let i = 0; i < raw.length; i++) {
    const end = offset + raw[i].length + (i < raw.length - 1 ? 1 : 0);
    lines.push({ text: raw[i], startOffset: offset, endOffset: end });
    offset = end;
  }
  return lines;
};

/** Standard LCS on line content. Returns matched (oldIndex, newIndex) pairs. */
const lcsLines = (oldLines: LineInfo[], newLines: LineInfo[]): [number, number][] => {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i].text === newLines[j].text) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldLines[i].text === newLines[j].text) {
      result.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return result;
};

export interface DiffMap {
  /** Map an old-text character offset to a new-text offset, or null if deleted. */
  mapOffset(oldOffset: number): number | null;
}

export const computeDiffMap = (oldText: string, newText: string): DiffMap => {
  if (oldText.length === 0) {
    return { mapOffset: () => null };
  }

  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const matches = lcsLines(oldLines, newLines);

  // Build a set of matched old line indices for fast lookup
  const matchedOldLines = new Map<number, number>();
  for (const [oi, ni] of matches) {
    matchedOldLines.set(oi, ni);
  }

  return {
    mapOffset(oldOffset: number): number | null {
      // Find which old line contains this offset
      let oldLineIdx = -1;
      for (let i = 0; i < oldLines.length; i++) {
        if (oldOffset >= oldLines[i].startOffset && oldOffset < oldLines[i].endOffset) {
          oldLineIdx = i;
          break;
        }
      }

      // Handle offset at very end of text (past last line's endOffset)
      if (oldLineIdx === -1 && oldOffset === oldText.length && oldLines.length > 0) {
        oldLineIdx = oldLines.length - 1;
      }

      if (oldLineIdx === -1) return null;

      const newLineIdx = matchedOldLines.get(oldLineIdx);
      if (newLineIdx === undefined) return null; // Line was deleted

      const posInLine = oldOffset - oldLines[oldLineIdx].startOffset;
      const mapped = newLines[newLineIdx].startOffset + Math.min(posInLine, newLines[newLineIdx].text.length);
      return Math.min(mapped, newText.length);
    },
  };
};

export interface DiffRemapResult {
  start: Point;
  end: Point;
  anchor_confidence: 'high';
  reason_code: 'diff_remapped';
  reanchored: true;
}

/**
 * Attempt to remap an anchor through a structural diff.
 * Returns the remapped result if the quote verifies at the new position, or null to fall through.
 */
export const remapAnchorViaDiff = (
  newText: string,
  anchor: Anchor,
  diffMap: DiffMap,
): DiffRemapResult | null => {
  const oldStart = anchor.primary.start.offset_utf16;
  const mappedStart = diffMap.mapOffset(oldStart);
  if (mappedStart === null) return null;

  const quote = anchor.fallback.quote;

  // Verify quote at mapped position
  if (mappedStart + quote.length > newText.length) return null;
  if (newText.slice(mappedStart, mappedStart + quote.length) !== quote) return null;

  const mappedEnd = mappedStart + quote.length;

  return {
    start: offsetToPoint(newText, mappedStart),
    end: offsetToPoint(newText, mappedEnd),
    anchor_confidence: 'high',
    reason_code: 'diff_remapped',
    reanchored: true,
  };
};
