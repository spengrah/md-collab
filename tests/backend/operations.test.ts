import { describe, expect, it } from 'vitest';
import {
  MdCollabError,
  createThread,
  editMessage,
  parseSidecar,
  reopenThread,
  reply,
  resolveThread,
  serializeDeterministic,
} from '../../src/index.js';

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
      editor: author,
      now: '2026-02-12T20:02:00Z',
    });

    const resolved = resolveThread({ sidecar: edited, threadId: 't1', actor: author, now: '2026-02-12T20:03:00Z' });
    const reopened = reopenThread({ sidecar: resolved, threadId: 't1', actor: author, now: '2026-02-12T20:04:00Z' });

    expect(reopened.threads[0].status).toBe('open');
    expect(reopened.threads[0].messages).toHaveLength(2);
    expect(reopened.threads[0].messages[1].body).toBe('Reply edited');
    expect(reopened.threads[0].messages[1].edited_at).toBe('2026-02-12T20:02:00Z');

    const s1 = serializeDeterministic(reopened);
    const s2 = serializeDeterministic(reopened);
    expect(s1).toBe(s2);
  });

  it('rejects ID collisions for thread_id/message_id with typed error', () => {
    const text = 'Alpha\nTarget sentence here.\nOmega';
    const start = text.indexOf('Target');
    const end = start + 'Target sentence here.'.length;

    const first = createThread({
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

    try {
      createThread({
        sidecar: first,
        text,
        startOffsetUtf16: start,
        endOffsetUtf16: end,
        body: 'Second',
        author,
        threadId: 't1',
        messageId: 'm2',
      });
      throw new Error('expected collision');
    } catch (e) {
      expect(e).toBeInstanceOf(MdCollabError);
      expect((e as MdCollabError).code).toBe('ID_CONFLICT');
    }

    try {
      reply({
        sidecar: first,
        threadId: 't1',
        body: 'dup message id',
        author,
        messageId: 'm1',
      });
      throw new Error('expected collision');
    } catch (e) {
      expect(e).toBeInstanceOf(MdCollabError);
      expect((e as MdCollabError).code).toBe('ID_CONFLICT');
    }
  });

  it('enforces runtime author validation on every mutation path', () => {
    const text = 'Alpha\nTarget sentence here.\nOmega';
    const start = text.indexOf('Target');
    const end = start + 'Target sentence here.'.length;

    try {
      createThread({
        sidecar: base,
        text,
        startOffsetUtf16: start,
        endOffsetUtf16: end,
        body: 'Initial note',
        author: { author_id: '', author_label: 'Spencer', verified: null },
      });
      throw new Error('expected author error');
    } catch (e) {
      expect(e).toBeInstanceOf(MdCollabError);
      expect((e as MdCollabError).code).toBe('AUTHOR_INVALID');
    }

    const created = createThread({
      sidecar: base,
      text,
      startOffsetUtf16: start,
      endOffsetUtf16: end,
      body: 'Initial note',
      author,
      threadId: 't1',
      messageId: 'm1',
    });

    try {
      reply({
        sidecar: created,
        threadId: 't1',
        body: 'Reply',
        author: { author_id: 'x', author_label: '', verified: null },
      });
      throw new Error('expected author error');
    } catch (e) {
      expect(e).toBeInstanceOf(MdCollabError);
      expect((e as MdCollabError).code).toBe('AUTHOR_INVALID');
    }

    try {
      editMessage({
        sidecar: created,
        threadId: 't1',
        messageId: 'm1',
        newBody: 'Edited',
        editor: { author_id: 'x', author_label: 'X', verified: undefined } as any,
      });
      throw new Error('expected author error');
    } catch (e) {
      expect(e).toBeInstanceOf(MdCollabError);
      expect((e as MdCollabError).code).toBe('AUTHOR_INVALID');
    }

    try {
      resolveThread({
        sidecar: created,
        threadId: 't1',
        actor: { author_id: 'x', author_label: '', verified: null },
      });
      throw new Error('expected author error');
    } catch (e) {
      expect(e).toBeInstanceOf(MdCollabError);
      expect((e as MdCollabError).code).toBe('AUTHOR_INVALID');
    }

    try {
      reopenThread({
        sidecar: created,
        threadId: 't1',
        actor: undefined as any,
      });
      throw new Error('expected author error');
    } catch (e) {
      expect(e).toBeInstanceOf(MdCollabError);
      expect((e as MdCollabError).code).toBe('AUTHOR_INVALID');
    }
  });
});
