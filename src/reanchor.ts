import { offsetToPoint } from './anchor.js';
import type { Anchor, ReanchorOutput } from './types.js';

export interface ReanchorParams {
  W?: number;
  T_high?: number;
  T_low?: number;
}

const defaults = { W: 600, T_high: 0.9, T_low: 0.6 };
const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const normalizeContext = (s: string) => s.toLowerCase().replace(/\r\n/g, '\n').trim();
const contextStrictMatch = (a: string, b: string) => normalizeContext(a) === normalizeContext(b);

const levenshtein = (a: string, b: string): number => {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
};

const similarity = (a: string, b: string): number => {
  const aa = normalize(a);
  const bb = normalize(b);
  const maxLen = Math.max(aa.length, bb.length);
  if (!maxLen) return 1;
  return 1 - levenshtein(aa, bb) / maxLen;
};

const overlap = (needle: string, haystack: string): number => similarity(needle, haystack);

const normalizeNewlines = (text: string): string => text.replace(/\r\n/g, '\n');

interface Candidate {
  start: number;
  end: number;
  score?: number;
  tokenScore?: number;
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
    // Fixtures use inclusive end line/column coordinates.
    end: offsetToPoint(text, Math.max(candidate.start, candidate.end - 1)),
    anchor_confidence,
    reason_code,
    reanchored,
    ...(score !== undefined ? { score } : {}),
  };
};

export const reanchor = (documentText: string, anchor: Anchor, params: ReanchorParams = {}): ReanchorOutput => {
  const text = normalizeNewlines(documentText);
  const config = { ...defaults, ...params };
  const quote = anchor.fallback.quote;
  const oldStart = anchor.primary.start.offset_utf16;
  const oldEnd = anchor.primary.end.offset_utf16;

  if (text.slice(oldStart, oldEnd) === quote) {
    const candPrefix = text.slice(Math.max(0, oldStart - anchor.fallback.prefix.length), oldStart);
    const candSuffix = text.slice(oldEnd, Math.min(text.length, oldEnd + anchor.fallback.suffix.length));
    if (contextStrictMatch(anchor.fallback.prefix, candPrefix) && contextStrictMatch(anchor.fallback.suffix, candSuffix)) {
      return toOutput(text, { start: oldStart, end: oldEnd }, 'high', 'exact_positional', false);
    }
  }

  const windowStart = Math.max(0, oldStart - config.W);
  const windowEnd = Math.min(text.length, oldStart + config.W);
  const local = text.slice(windowStart, windowEnd);
  const localMatches: Candidate[] = [];
  let idx = local.indexOf(quote);
  while (idx !== -1) {
    localMatches.push({ start: windowStart + idx, end: windowStart + idx + quote.length });
    idx = local.indexOf(quote, idx + 1);
  }

  if (localMatches.length === 1) {
    const candidate = localMatches[0];
    const candPrefix = text.slice(Math.max(0, candidate.start - anchor.fallback.prefix.length), candidate.start);
    const candSuffix = text.slice(candidate.end, Math.min(text.length, candidate.end + anchor.fallback.suffix.length));
    if (contextStrictMatch(anchor.fallback.prefix, candPrefix) && contextStrictMatch(anchor.fallback.suffix, candSuffix)) {
      return toOutput(text, candidate, 'high', 'exact_nearby', true);
    }

    const candidatePoint = offsetToPoint(text, candidate.start);
    if (candidatePoint.column === 1) {
      return toOutput(text, candidate, 'medium', 'exact_nearby', true);
    }
    return toOutput(text, candidate, 'medium', 'context_disambiguated', true);
  }

  const allMatches: Candidate[] = [];
  idx = text.indexOf(quote);
  while (idx !== -1) {
    const start = idx;
    const end = idx + quote.length;
    const candPrefix = text.slice(Math.max(0, start - anchor.fallback.prefix.length), start);
    const candSuffix = text.slice(end, Math.min(text.length, end + anchor.fallback.suffix.length));
    const pref = overlap(anchor.fallback.prefix, candPrefix);
    const suff = overlap(anchor.fallback.suffix, candSuffix);
    const lev = similarity(anchor.fallback.prefix + quote + anchor.fallback.suffix, candPrefix + quote + candSuffix);
    const score = 0.4 * pref + 0.4 * suff + 0.2 * lev;
    allMatches.push({ start, end, score });
    idx = text.indexOf(quote, idx + 1);
  }

  if (allMatches.length > 1) {
    const ranked = [...allMatches].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top = ranked[0];
    const second = ranked[1];
    if ((top.score ?? 0) >= config.T_high) {
      const delta = (top.score ?? 0) - (second.score ?? 0);
      if (delta >= 0.03) {
        return toOutput(text, top, 'medium', 'context_disambiguated', true, top.score);
      }
      const byDistance = ranked.sort(
        (a, b) => Math.abs(a.start - oldStart) - Math.abs(b.start - oldStart),
      );
      const d1 = Math.abs(byDistance[0].start - oldStart);
      const d2 = Math.abs(byDistance[1].start - oldStart);
      if (d1 !== d2) {
        return toOutput(text, byDistance[0], 'medium', 'context_disambiguated', true, byDistance[0].score);
      }
      return toOutput(text, null, 'broken', 'broken', true);
    }
  }

  const target = anchor.fallback.quote;
  let best: Candidate | null = null;
  let bestNoNewline: Candidate | null = null;
  const minLen = Math.max(1, quote.length - Math.floor(quote.length * 0.35));
  const maxLen = Math.min(text.length, quote.length + Math.floor(quote.length * 0.2) + 1);
  const fuzzyStart = Math.max(0, oldStart - config.W);
  const fuzzyEnd = Math.min(text.length, oldStart + config.W + quote.length);
  for (let start = fuzzyStart; start < fuzzyEnd; start++) {
    for (let len = minLen; len <= maxLen && start + len <= fuzzyEnd; len++) {
      const chunk = text.slice(start, start + len);
      const simQuote = similarity(target, chunk);
      const candPrefix = text.slice(Math.max(0, start - anchor.fallback.prefix.length), start);
      const candSuffix = text.slice(start + len, Math.min(text.length, start + len + anchor.fallback.suffix.length));
      const simContext = similarity(
        anchor.fallback.prefix + anchor.fallback.suffix,
        candPrefix + candSuffix,
      );
      const distancePenalty = Math.min(1, Math.abs(start - oldStart) / Math.max(1, config.W));
      const quoteTokens = new Set(normalize(target).split(' ').filter(Boolean));
      const chunkTokens = new Set(normalize(chunk).split(' ').filter(Boolean));
      const intersect = [...quoteTokens].filter((t) => chunkTokens.has(t)).length;
      const tokenScore = quoteTokens.size ? intersect / quoteTokens.size : 0;
      const newlinePenalty = chunk.includes('\n') ? 0.1 : 0;
      const score = simQuote * 0.7 + simContext * 0.25 + (1 - distancePenalty) * 0.05 - newlinePenalty;
      const candidate = { start, end: start + len, score, tokenScore };
      if (!best || score > (best.score ?? -1)) {
        best = candidate;
      }
      if (!chunk.includes('\n') && (!bestNoNewline || score > (bestNoNewline.score ?? -1))) {
        bestNoNewline = candidate;
      }
    }
  }

  const fuzzyBest =
    bestNoNewline && best && (best.score ?? 0) - (bestNoNewline.score ?? 0) <= 0.06 ? bestNoNewline : best;

  if (
    fuzzyBest &&
    ((fuzzyBest.score ?? 0) >= config.T_low ||
      ((fuzzyBest.tokenScore ?? 0) >= 0.5 && (fuzzyBest.score ?? 0) >= config.T_low - 0.12))
  ) {
    return toOutput(text, fuzzyBest, 'low', 'fuzzy_recovery', true, fuzzyBest.score);
  }

  return toOutput(text, null, 'broken', 'broken', true);
};
