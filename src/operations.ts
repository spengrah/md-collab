import { randomUUID } from 'node:crypto';
import { buildAnchor } from './anchor.js';
import { error } from './errors.js';
import type {
  Author,
  CreateThreadInput,
  EditMessageInput,
  ReanchorOutput,
  ReplyInput,
  Sidecar,
  Thread,
  ToggleThreadInput,
} from './types.js';

const clone = <T>(value: T): T => structuredClone(value);
const nowUtc = () => new Date().toISOString();

const isValidAuthor = (author: Author | undefined): author is Author =>
  !!author &&
  typeof author.author_id === 'string' &&
  author.author_id.trim().length > 0 &&
  typeof author.author_label === 'string' &&
  author.author_label.trim().length > 0 &&
  (typeof author.verified === 'boolean' || author.verified === null);

const assertAuthor = (author: Author | undefined): asserts author is Author => {
  if (!isValidAuthor(author)) {
    error('AUTHOR_INVALID', 'author payload is required and must include author_id, author_label, verified');
  }
};

const collectIds = (sidecar: Sidecar): { threadIds: Set<string>; messageIds: Set<string> } => {
  const threadIds = new Set<string>();
  const messageIds = new Set<string>();

  for (const thread of sidecar.threads) {
    threadIds.add(thread.thread_id);
    for (const message of thread.messages) {
      messageIds.add(message.message_id);
    }
  }

  return { threadIds, messageIds };
};

const assertUniqueId = (id: string, existing: Set<string>, kind: 'thread_id' | 'message_id') => {
  if (existing.has(id)) {
    error('ID_CONFLICT', `${kind} already exists: ${id}`);
  }
};

const resolveUniqueId = (requestedId: string | undefined, existing: Set<string>, kind: 'thread_id' | 'message_id'): string => {
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

const findThread = (threads: Thread[], threadId: string): Thread => {
  const thread = threads.find((t) => t.thread_id === threadId);
  if (!thread) error('THREAD_NOT_FOUND', `thread not found: ${threadId}`);
  return thread;
};

export const createThread = (input: CreateThreadInput): Sidecar => {
  assertAuthor(input.author);

  const next = clone(input.sidecar);
  const ts = input.now ?? nowUtc();
  const { threadIds, messageIds } = collectIds(next);
  const thread_id = resolveUniqueId(input.threadId, threadIds, 'thread_id');
  const message_id = resolveUniqueId(input.messageId, messageIds, 'message_id');

  const thread: Thread = {
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

export const reply = (input: ReplyInput): Sidecar => {
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

export const editMessage = (input: EditMessageInput): Sidecar => {
  const next = clone(input.sidecar);
  const thread = findThread(next.threads, input.threadId);
  const message = thread.messages.find((m) => m.message_id === input.messageId);
  if (!message) error('MESSAGE_NOT_FOUND', `message not found: ${input.messageId}`);
  const ts = input.now ?? nowUtc();
  message.body = input.newBody;
  message.edited_at = ts;
  thread.updated_at = ts;
  return next;
};

export const resolveThread = (input: ToggleThreadInput): Sidecar => {
  const next = clone(input.sidecar);
  const thread = findThread(next.threads, input.threadId);
  thread.status = 'resolved';
  thread.updated_at = input.now ?? nowUtc();
  return next;
};

export const reopenThread = (input: ToggleThreadInput): Sidecar => {
  const next = clone(input.sidecar);
  const thread = findThread(next.threads, input.threadId);
  thread.status = 'open';
  thread.updated_at = input.now ?? nowUtc();
  return next;
};

export const applyReanchor = (
  sidecar: Sidecar,
  threadId: string,
  result: ReanchorOutput,
  now = nowUtc(),
): Sidecar => {
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
