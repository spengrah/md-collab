import { describe, expect, it } from 'vitest';
import { createThread, editMessage, parseSidecar, reopenThread, reply, resolveThread, serializeDeterministic } from '../../src/index.js';

const base = parseSidecar(`{
  "schema_version": "0.1.0",
  "document": {"path": "doc.md"},
  "threads": []
}`);

const author = { author_id: 'spencer', author_label: 'Spencer', verified: null };

describe('core sidecar operations', () => {
  it('supports deterministic create/reply/edit/resolve/reopen flow', () => {
    const text = 'Alpha\nTarget sentence here.\nOmega';
    const start = text.indexOf('Target');
    const end = start + 'Target sentence here.'.length;

    const created = createThread({
      sidecar: base,
      text,
      startOffsetUtf16: start,
      endOffsetUtf16: end,
      body: 'Initial note',
      author,
      threadId: 't1',
      messageId: 'm1',
      now: '2026-02-12T20:00:00Z',
    });

    const replied = reply({
      sidecar: created,
      threadId: 't1',
      body: 'Reply',
      author,
      messageId: 'm2',
      now: '2026-02-12T20:01:00Z',
    });

    const edited = editMessage({
      sidecar: replied,
      threadId: 't1',
      messageId: 'm2',
      newBody: 'Reply edited',
      now: '2026-02-12T20:02:00Z',
    });

    const resolved = resolveThread({ sidecar: edited, threadId: 't1', now: '2026-02-12T20:03:00Z' });
    const reopened = reopenThread({ sidecar: resolved, threadId: 't1', now: '2026-02-12T20:04:00Z' });

    expect(reopened.threads[0].status).toBe('open');
    expect(reopened.threads[0].messages).toHaveLength(2);
    expect(reopened.threads[0].messages[1].body).toBe('Reply edited');
    expect(reopened.threads[0].messages[1].edited_at).toBe('2026-02-12T20:02:00Z');

    const s1 = serializeDeterministic(reopened);
    const s2 = serializeDeterministic(reopened);
    expect(s1).toBe(s2);
  });
});
