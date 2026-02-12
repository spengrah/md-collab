import { createHash } from 'node:crypto';
import { error } from './errors.js';
export const normalizeForHash = (value) => value.toLowerCase().replace(/\s+/g, ' ').trim();
export const sha256 = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
export const hashQuote = (quote) => sha256(normalizeForHash(quote));
export const hashContext = (prefix, suffix) => sha256(normalizeForHash(`${prefix} ${suffix}`));
export const getLineStarts = (text) => {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n')
            starts.push(i + 1);
    }
    return starts;
};
export const offsetToPoint = (text, offsetUtf16) => {
    if (offsetUtf16 < 0 || offsetUtf16 > text.length) {
        error('ANCHOR_INVALID', `offset out of bounds: ${offsetUtf16}`);
    }
    const starts = getLineStarts(text);
    let lineIndex = 0;
    for (let i = 0; i < starts.length; i++) {
        if (starts[i] <= offsetUtf16)
            lineIndex = i;
        else
            break;
    }
    const lineStart = starts[lineIndex];
    return {
        line: lineIndex + 1,
        column: offsetUtf16 - lineStart + 1,
        offset_utf16: offsetUtf16,
    };
};
export const pointToOffset = (text, point) => {
    const starts = getLineStarts(text);
    const lineIndex = point.line - 1;
    if (lineIndex < 0 || lineIndex >= starts.length) {
        error('ANCHOR_INVALID', `line out of bounds: ${point.line}`);
    }
    const offset = starts[lineIndex] + (point.column - 1);
    if (offset < 0 || offset > text.length) {
        error('ANCHOR_INVALID', `column out of bounds: ${point.column}`);
    }
    return offset;
};
export const primaryFromOffsets = (text, startOffsetUtf16, endOffsetUtf16, docRevision) => {
    if (startOffsetUtf16 > endOffsetUtf16) {
        error('ANCHOR_INVALID', 'start offset must be <= end offset');
    }
    const start = offsetToPoint(text, startOffsetUtf16);
    const end = offsetToPoint(text, endOffsetUtf16);
    return { start, end, ...(docRevision ? { doc_revision: docRevision } : {}) };
};
export const buildAnchor = (text, startOffsetUtf16, endOffsetUtf16, options = {}) => {
    if (startOffsetUtf16 === endOffsetUtf16) {
        error('ANCHOR_INVALID', 'quote must be non-empty');
    }
    const prefixLength = options.prefixLength ?? 80;
    const suffixLength = options.suffixLength ?? 80;
    const quote = text.slice(startOffsetUtf16, endOffsetUtf16);
    if (!quote.trim()) {
        error('ANCHOR_INVALID', 'quote must be non-empty');
    }
    const prefix = text.slice(Math.max(0, startOffsetUtf16 - prefixLength), startOffsetUtf16);
    const suffix = text.slice(endOffsetUtf16, Math.min(text.length, endOffsetUtf16 + suffixLength));
    return {
        primary: primaryFromOffsets(text, startOffsetUtf16, endOffsetUtf16, options.docRevision),
        fallback: {
            quote,
            prefix,
            suffix,
            quote_hash: hashQuote(quote),
            context_hash: hashContext(prefix, suffix),
        },
        anchor_confidence: 'high',
    };
};
export const validateAnchor = (text, anchor) => {
    const start = anchor.primary.start.offset_utf16;
    const end = anchor.primary.end.offset_utf16;
    if (start > end)
        error('ANCHOR_INVALID', 'start must be <= end');
    if (start < 0 || end > text.length)
        error('ANCHOR_INVALID', 'offsets out of bounds');
    if (!anchor.fallback.quote)
        error('ANCHOR_INVALID', 'quote must be non-empty');
    const quote = text.slice(start, end);
    if (quote === anchor.fallback.quote) {
        if (hashQuote(anchor.fallback.quote) !== anchor.fallback.quote_hash) {
            error('ANCHOR_INVALID', 'quote_hash mismatch');
        }
        if (hashContext(anchor.fallback.prefix, anchor.fallback.suffix) !== anchor.fallback.context_hash) {
            error('ANCHOR_INVALID', 'context_hash mismatch');
        }
    }
};
//# sourceMappingURL=anchor.js.map