import { randomUUID } from 'node:crypto';
import { buildAnchor } from './anchor.js';
import { error } from './errors.js';
const clone = (value) => structuredClone(value);
const nowUtc = () => new Date().toISOString();
const isValidAuthor = (author) => !!author &&
    typeof author.author_id === 'string' &&
    author.author_id.trim().length > 0 &&
    typeof author.author_label === 'string' &&
    author.author_label.trim().length > 0 &&
    (typeof author.verified === 'boolean' || author.verified === null);
const assertAuthor = (author) => {
    if (!isValidAuthor(author)) {
        error('AUTHOR_INVALID', 'author payload is required and must include author_id, author_label, verified');
    }
};
const collectIds = (sidecar) => {
    const threadIds = new Set();
    const messageIds = new Set();
    for (const thread of sidecar.threads) {
        threadIds.add(thread.thread_id);
        for (const message of thread.messages) {
            messageIds.add(message.message_id);
        }
    }
    return { threadIds, messageIds };
};
const assertUniqueId = (id, existing, kind) => {
    if (existing.has(id)) {
        error('ID_CONFLICT', `${kind} already exists: ${id}`);
    }
};
const resolveUniqueId = (requestedId, existing, kind) => {
    if (requestedId) {
        assertUniqueId(requestedId, existing, kind);
        return requestedId;
    }
    let next = randomUUID();
    while (existing.has(next)) {
        next = randomUUID();
    }
    return next;
};
const findThread = (threads, threadId) => {
    const thread = threads.find((t) => t.thread_id === threadId);
    if (!thread)
        error('THREAD_NOT_FOUND', `thread not found: ${threadId}`);
    return thread;
};
export const createThread = (input) => {
    assertAuthor(input.author);
    const next = clone(input.sidecar);
    const ts = input.now ?? nowUtc();
    const { threadIds, messageIds } = collectIds(next);
    const thread_id = resolveUniqueId(input.threadId, threadIds, 'thread_id');
    const message_id = resolveUniqueId(input.messageId, messageIds, 'message_id');
    const thread = {
        thread_id,
        status: 'open',
        anchor: buildAnchor(input.text, input.startOffsetUtf16, input.endOffsetUtf16),
        author: input.author,
        messages: [
            {
                message_id,
                author: input.author,
                body: input.body,
                created_at: ts,
                edited_at: null,
            },
        ],
        created_at: ts,
        updated_at: ts,
    };
    next.threads.push(thread);
    return next;
};
export const reply = (input) => {
    assertAuthor(input.author);
    const next = clone(input.sidecar);
    const thread = findThread(next.threads, input.threadId);
    const ts = input.now ?? nowUtc();
    const { messageIds } = collectIds(next);
    const message_id = resolveUniqueId(input.messageId, messageIds, 'message_id');
    thread.messages.push({
        message_id,
        author: input.author,
        body: input.body,
        created_at: ts,
        edited_at: null,
    });
    thread.updated_at = ts;
    return next;
};
export const editMessage = (input) => {
    assertAuthor(input.editor);
    const next = clone(input.sidecar);
    const thread = findThread(next.threads, input.threadId);
    const message = thread.messages.find((m) => m.message_id === input.messageId);
    if (!message)
        error('MESSAGE_NOT_FOUND', `message not found: ${input.messageId}`);
    const ts = input.now ?? nowUtc();
    message.body = input.newBody;
    message.edited_at = ts;
    thread.updated_at = ts;
    return next;
};
export const resolveThread = (input) => {
    assertAuthor(input.actor);
    const next = clone(input.sidecar);
    const thread = findThread(next.threads, input.threadId);
    thread.status = 'resolved';
    thread.updated_at = input.now ?? nowUtc();
    return next;
};
export const reopenThread = (input) => {
    assertAuthor(input.actor);
    const next = clone(input.sidecar);
    const thread = findThread(next.threads, input.threadId);
    thread.status = 'open';
    thread.updated_at = input.now ?? nowUtc();
    return next;
};
export const applyReanchor = (sidecar, threadId, result, now = nowUtc()) => {
    const next = clone(sidecar);
    const thread = findThread(next.threads, threadId);
    thread.anchor.anchor_confidence = result.anchor_confidence;
    if (result.start && result.end) {
        thread.anchor.primary.start = result.start;
        thread.anchor.primary.end = result.end;
    }
    thread.updated_at = now;
    return next;
};
//# sourceMappingURL=operations.js.map