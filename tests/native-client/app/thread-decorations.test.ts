// Tests for the pure decoration-prep function (`prepareThreads`).
//
// Codex round 2 flagged that the reanchor-on-open on/off branch and the
// inclusive→exclusive end conversion had no unit coverage. This file
// exercises both branches deterministically against a small synthetic
// thread + doc text.

import { describe, expect, it } from 'vitest';
import { prepareThreads } from '../../../native-client/src/app/thread-decorations.js';
import type { Thread } from '../../../native-client/src/app/core.js';

const fixtureThread: Thread = {
  thread_id: 't1',
  status: 'open',
  anchor: {
    primary: {
      start: { line: 1, column: 1, offset_utf16: 0 },
      end: { line: 1, column: 6, offset_utf16: 5 }, // exclusive in stored form
    },
    fallback: {
      quote: 'hello',
      prefix: '',
      suffix: ' world',
      quote_hash: 'sha256:q',
      context_hash: 'sha256:c',
    },
    anchor_confidence: 'high',
  },
  author: { author_id: 'u', author_label: 'U', verified: null },
  messages: [
    {
      message_id: 'm1',
      author: { author_id: 'u', author_label: 'U', verified: null },
      body: 'a comment about hello',
      created_at: '2026-02-12T20:00:00Z',
      edited_at: null,
    },
  ],
  created_at: '2026-02-12T20:00:00Z',
  updated_at: '2026-02-12T20:00:00Z',
};

const docText = 'hello world';

describe('prepareThreads', () => {
  it('with reanchorOnOpen=false uses stored exclusive end verbatim', () => {
    const out = prepareThreads(docText, [fixtureThread], { reanchorOnOpen: false });
    expect(out.decorations).toHaveLength(1);
    expect(out.decorations[0].start_offset).toBe(0);
    // The stored primary.end.offset_utf16 is exclusive; no +1 should be added.
    expect(out.decorations[0].end_offset).toBe(5);
    expect(out.decorations[0].anchor_confidence).toBe('high');
  });

  it('with reanchorOnOpen=true converts inclusive engine result to exclusive', () => {
    const out = prepareThreads(docText, [fixtureThread], { reanchorOnOpen: true });
    expect(out.decorations).toHaveLength(1);
    // reanchor on "hello" in "hello world" produces the same range; the engine
    // returns inclusive end (offset 4 = position of the second 'l'/'o'),
    // prepareThreads adds +1 to make it exclusive => 5.
    expect(out.decorations[0].start_offset).toBe(0);
    expect(out.decorations[0].end_offset).toBe(5);
  });

  it('broken threads keep panel position but anchor_confidence=broken', () => {
    const brokenThread: Thread = {
      ...fixtureThread,
      thread_id: 't-broken',
      anchor: {
        ...fixtureThread.anchor,
        primary: {
          start: { line: 1, column: 1, offset_utf16: 0 },
          end: { line: 1, column: 6, offset_utf16: 5 },
        },
        fallback: {
          ...fixtureThread.anchor.fallback,
          quote: 'this-string-is-nowhere-in-the-doc-text-deadbeef',
          quote_hash: 'sha256:deadbeef',
        },
        anchor_confidence: 'broken',
      },
    };
    // Use a doc text that won't contain the quote so reanchor returns broken.
    const out = prepareThreads('totally different text', [brokenThread], {
      reanchorOnOpen: true,
    });
    expect(out.decorations[0].anchor_confidence).toBe('broken');
    expect(out.panel[0].start_offset).toBeNull();
  });

  it('panel excerpt truncates long message bodies', () => {
    const longBody = 'x'.repeat(200);
    const longMsgThread: Thread = {
      ...fixtureThread,
      messages: [{ ...fixtureThread.messages[0], body: longBody }],
    };
    const out = prepareThreads(docText, [longMsgThread], { reanchorOnOpen: false });
    expect(out.panel[0].excerpt.length).toBeLessThanOrEqual(81); // 80 + ellipsis
    expect(out.panel[0].excerpt.endsWith('…')).toBe(true);
  });

  it('panel excerpt is "(no message)" when messages array is empty', () => {
    const emptyMsgThread: Thread = { ...fixtureThread, messages: [] };
    const out = prepareThreads(docText, [emptyMsgThread], { reanchorOnOpen: false });
    expect(out.panel[0].excerpt).toBe('(no message)');
  });

  it('resolved threads carry through with resolved status', () => {
    const resolved: Thread = { ...fixtureThread, status: 'resolved' };
    const out = prepareThreads(docText, [resolved], { reanchorOnOpen: false });
    expect(out.decorations[0].status).toBe('resolved');
    expect(out.panel[0].status).toBe('resolved');
  });
});
