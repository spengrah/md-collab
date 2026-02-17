import { offsetToPoint } from './anchor.js';
import type { DiffMap } from './diff-remap.js';
import { remapAnchorViaDiff } from './diff-remap.js';
import type { Anchor, ReanchorOutput } from './types.js';

export interface ReanchorParams {
  W?: number;
  T_high?: number;
  T_low?: number;
  diffMap?: DiffMap;
}

const defaults = { W: 600, T_high: 0.9, T_low: 0.72 };
const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

const levenshtein = (a: string, b: string): number => {
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  // Use two rows instead of full 2D array
  let prevRow = new Array<number>(b.length + 1);
  let currRow = new Array<number>(b.length + 1);

  // Initialize first row
  for (let j = 0; j <= b.length; j++) prevRow[j] = j;

  for (let i = 1; i <= a.length; i++) {
    currRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(prevRow[j] + 1, currRow[j - 1] + 1, prevRow[j - 1] + cost);
    }
    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[b.length];
};

const similarity = (a: string, b: string): number => {
  const aa = normalize(a);
  const bb = normalize(b);
  const maxLen = Math.max(aa.length, bb.length);
  if (!maxLen) return 1;
  return 1 - levenshtein(aa, bb) / maxLen;
};

interface Candidate {
  start: number;
  end: number;
  score?: number;
}

const toOutput = (
  text: string,
  candidate: Candidate | null,
  anchor_confidence: ReanchorOutput['anchor_confidence'],
  reason_code: ReanchorOutput['reason_code'],
  reanchored: boolean,
  score?: number,
): ReanchorOutput => {
  if (!candidate) {
    return {
      start: null,
      end: null,
      anchor_confidence,
      reason_code,
      reanchored,
      ...(score !== undefined ? { score } : {}),
    };
  }
  return {
    start: offsetToPoint(text, candidate.start),
    end: offsetToPoint(text, Math.max(candidate.start, candidate.end - 1)),
    anchor_confidence,
    reason_code,
    reanchored,
    ...(score !== undefined ? { score } : {}),
  };
};

const exactMatches = (text: string, quote: string, from = 0, to = text.length): Candidate[] => {
  const matches: Candidate[] = [];
  const hay = text.slice(from, to);
  let idx = hay.indexOf(quote);
  while (idx !== -1) {
    matches.push({ start: from + idx, end: from + idx + quote.length });
    idx = hay.indexOf(quote, idx + 1);
  }
  return matches;
};

export const reanchor = (documentText: string, anchor: Anchor, params: ReanchorParams = {}): ReanchorOutput => {
  const text = documentText.replace(/\r\n/g, '\n');
  const config = { ...defaults, ...params };
  const quote = anchor.fallback.quote;
  const oldStart = anchor.primary.start.offset_utf16;
  const oldEnd = anchor.primary.end.offset_utf16;

  // 1) fast exact positional
  if (oldStart >= 0 && oldEnd <= text.length && text.slice(oldStart, oldEnd) === quote) {
    return toOutput(text, { start: oldStart, end: oldEnd }, 'high', 'exact_positional', false);
  }

  // 1b) diff-based remapping (when base text diff is available)
  if (config.diffMap) {
    const diffResult = remapAnchorViaDiff(text, anchor, config.diffMap);
    if (diffResult) return diffResult;
  }

  // 2) nearby exact quote search
  const windowStart = Math.max(0, oldStart - config.W);
  const windowEnd = Math.min(text.length, oldStart + config.W);
  const nearbyMatches = exactMatches(text, quote, windowStart, windowEnd);
  if (nearbyMatches.length === 1) {
    return toOutput(text, nearbyMatches[0], 'high', 'exact_nearby', true);
  }

  // 3) context disambiguation for multiple exact matches
  const allExact = exactMatches(text, quote);
  if (allExact.length > 1) {
    const scored = allExact.map((candidate) => {
      const candPrefix = text.slice(Math.max(0, candidate.start - anchor.fallback.prefix.length), candidate.start);
      const candSuffix = text.slice(candidate.end, Math.min(text.length, candidate.end + anchor.fallback.suffix.length));
      const prefixOverlap = similarity(anchor.fallback.prefix, candPrefix);
      const suffixOverlap = similarity(anchor.fallback.suffix, candSuffix);
      const lev = similarity(
        anchor.fallback.prefix + anchor.fallback.quote + anchor.fallback.suffix,
        candPrefix + quote + candSuffix,
      );
      const score = 0.4 * prefixOverlap + 0.4 * suffixOverlap + 0.2 * lev;
      return { ...candidate, score };
    });

    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top = scored[0];
    const second = scored[1];
    const topScore = top.score ?? 0;
    const secondScore = second.score ?? 0;

    if (topScore < config.T_high) {
      return toOutput(text, null, 'broken', 'broken', true);
    }

    const delta = topScore - secondScore;
    if (delta >= 0.03) {
      return toOutput(text, top, 'medium', 'context_disambiguated', true, topScore);
    }

    const dTop = Math.abs(top.start - oldStart);
    const dSecond = Math.abs(second.start - oldStart);
    if (dTop < dSecond) {
      return toOutput(text, top, 'medium', 'context_disambiguated', true, topScore);
    }
    if (dSecond < dTop) {
      return toOutput(text, second, 'medium', 'context_disambiguated', true, secondScore);
    }

    // Spec safety: ambiguity resolves to broken and does not proceed to fuzzy.
    return toOutput(text, null, 'broken', 'broken', true);
  }

  // 4) fuzzy recovery only when there are no exact quote matches
  if (allExact.length === 0) {
    const target = anchor.fallback.prefix + anchor.fallback.quote + anchor.fallback.suffix;
    const minLen = Math.max(1, quote.length - Math.floor(quote.length * 0.35));
    const maxLen = Math.min(text.length, quote.length + Math.floor(quote.length * 0.8));
    const fuzzyStart = Math.max(0, oldStart - config.W);
    const fuzzyEnd = Math.min(text.length, oldStart + config.W + Math.max(quote.length, 1));

    let best: Candidate | null = null;
    for (let start = fuzzyStart; start < fuzzyEnd; start++) {
      for (let len = minLen; len <= maxLen && start + len <= fuzzyEnd; len++) {
        const chunk = text.slice(start, start + len);
        const score = similarity(target, chunk);
        if (!best || score > (best.score ?? -1)) {
          best = { start, end: start + len, score };
        }
      }
    }

    if (best && (best.score ?? 0) >= config.T_low) {
      return toOutput(text, best, 'low', 'fuzzy_recovery', true, best.score);
    }
  }

  // 5) broken
  return toOutput(text, null, 'broken', 'broken', true);
};
