import { createHash, randomUUID } from 'node:crypto';
import { buildAnchor } from './anchor.js';
import { error } from './errors.js';
const clone = (value) => structuredClone(value);
const nowUtc = () => new Date().toISOString();
const hashText = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
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
    const suggestionIds = new Set();
    for (const thread of sidecar.threads) {
        threadIds.add(thread.thread_id);
        for (const message of thread.messages) {
            messageIds.add(message.message_id);
        }
        for (const suggestion of thread.suggestions ?? []) {
            suggestionIds.add(suggestion.suggestion_id);
        }
    }
    return { threadIds, messageIds, suggestionIds };
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
const ensureTimelineKind = (kind) => kind ?? 'workspace';
const makeThreadVersionContext = (input, anchorAtCreate) => ({
    kind: ensureTimelineKind(input.timelineKind),
    workspace_snapshot_id: input.workspaceSnapshotId,
    workspace_file_hash: input.workspaceFileHash,
    workspace_file_mtime: input.workspaceFileMtime,
    workspace_actor_session_id: input.workspaceActorSessionId,
    base_commit: input.baseCommit,
    head_commit: input.headCommit,
    file_path_at_create: input.filePathAtCreate,
    base_blob_sha: input.baseBlobSha,
    head_blob_sha: input.headBlobSha,
    anchor_at_create: anchorAtCreate,
});
const makeMessageVersionContext = (input) => ({
    kind: ensureTimelineKind(input.timelineKind),
    seen_workspace_snapshot_id: input.workspaceSnapshotId,
    seen_head_commit: 'seenHeadCommit' in input ? input.seenHeadCommit : input.headCommit,
    seen_blob_sha: 'seenBlobSha' in input ? input.seenBlobSha : input.headBlobSha,
});
const appendAuditMessage = (thread, body, author, ts) => {
    thread.messages.push({
        message_id: randomUUID(),
        author,
        body,
        created_at: ts,
        edited_at: null,
        message_version_context: thread.thread_version_context
            ? {
                kind: thread.thread_version_context.kind,
                seen_workspace_snapshot_id: thread.thread_version_context.workspace_snapshot_id,
                seen_head_commit: thread.thread_version_context.head_commit,
                seen_blob_sha: thread.thread_version_context.head_blob_sha,
            }
            : undefined,
    });
};
export const createThread = (input) => {
    assertAuthor(input.author);
    const next = clone(input.sidecar);
    const ts = input.now ?? nowUtc();
    const { threadIds, messageIds } = collectIds(next);
    const thread_id = resolveUniqueId(input.threadId, threadIds, 'thread_id');
    const message_id = resolveUniqueId(input.messageId, messageIds, 'message_id');
    const anchor = buildAnchor(input.text, input.startOffsetUtf16, input.endOffsetUtf16);
    const thread = {
        thread_id,
        status: 'open',
        anchor,
        author: input.author,
        messages: [
            {
                message_id,
                author: input.author,
                body: input.body,
                created_at: ts,
                edited_at: null,
                message_version_context: makeMessageVersionContext(input),
            },
        ],
        created_at: ts,
        updated_at: ts,
        thread_version_context: makeThreadVersionContext(input, anchor),
        relevance_state: 'active',
        relevance_checked_at: ts,
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
        message_version_context: makeMessageVersionContext(input),
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
const setRelevance = (thread, state, reason, checkedAt, against) => {
    thread.relevance_state = state;
    thread.relevance_reason = reason;
    thread.relevance_checked_at = checkedAt;
    thread.relevance_checked_against_commit = against;
};
export const evaluateThreadRelevance = (thread, context, checkedAt = nowUtc()) => {
    const next = clone(thread);
    const timelineKind = context.timelineKind ?? next.thread_version_context?.kind ?? 'workspace';
    if (!next.anchor.primary.start || !next.anchor.primary.end || next.anchor.anchor_confidence === 'broken') {
        setRelevance(next, 'orphaned', 'ANCHOR_NOT_FOUND', checkedAt, context.headCommit);
        return next;
    }
    if ((timelineKind === 'workspace' || timelineKind === 'hybrid') && !context.workspaceSnapshotId) {
        setRelevance(next, 'outdated', 'WORKSPACE_CONTEXT_UNAVAILABLE', checkedAt, context.headCommit);
        return next;
    }
    if ((timelineKind === 'git' || timelineKind === 'hybrid') && context.gitAvailable === false) {
        setRelevance(next, 'outdated', 'COMMIT_CONTEXT_UNAVAILABLE', checkedAt, context.headCommit);
        return next;
    }
    if (next.thread_version_context?.file_path_at_create && context.currentPath && next.thread_version_context.file_path_at_create !== context.currentPath) {
        setRelevance(next, 'outdated', 'FILE_RENAMED', checkedAt, context.headCommit);
        return next;
    }
    if (next.thread_version_context?.workspace_file_hash && context.workspaceFileHash && next.thread_version_context.workspace_file_hash !== context.workspaceFileHash) {
        setRelevance(next, 'outdated', 'CONTENT_CHANGED', checkedAt, context.headCommit);
        return next;
    }
    if (next.thread_version_context?.head_blob_sha && context.headBlobSha && next.thread_version_context.head_blob_sha !== context.headBlobSha) {
        setRelevance(next, 'outdated', 'CONTENT_CHANGED', checkedAt, context.headCommit);
        return next;
    }
    setRelevance(next, 'active', undefined, checkedAt, context.headCommit);
    return next;
};
export const evaluateSidecarRelevance = (sidecar, context, checkedAt = nowUtc()) => {
    const next = clone(sidecar);
    next.threads = next.threads.map((thread) => evaluateThreadRelevance(thread, context, checkedAt));
    return next;
};
export const proposeSuggestion = (input) => {
    assertAuthor(input.author);
    const next = clone(input.sidecar);
    const thread = findThread(next.threads, input.threadId);
    const ts = input.now ?? nowUtc();
    const { suggestionIds } = collectIds(next);
    const suggestion_id = resolveUniqueId(input.suggestionId, suggestionIds, 'suggestion_id');
    thread.suggestions = thread.suggestions ?? [];
    thread.suggestions.push({
        suggestion_id,
        thread_id: thread.thread_id,
        status: 'proposed',
        proposed_edit: {
            anchor: input.anchor,
            before_text_hash: input.beforeTextHash,
            replacement_text: input.replacementText,
        },
        proposed_by: input.author,
        proposed_at: ts,
    });
    thread.updated_at = ts;
    return next;
};
const updateSuggestionDecision = (input, nextStatus, beforeText) => {
    assertAuthor(input.actor);
    const next = clone(input.sidecar);
    const thread = findThread(next.threads, input.threadId);
    const suggestion = (thread.suggestions ?? []).find((s) => s.suggestion_id === input.suggestionId);
    if (!suggestion)
        error('SUGGESTION_NOT_FOUND', `suggestion not found: ${input.suggestionId}`);
    const ts = input.now ?? nowUtc();
    if (beforeText && hashText(beforeText) !== suggestion.proposed_edit.before_text_hash) {
        suggestion.status = 'obsolete';
        suggestion.decision = {
            decided_by: input.actor,
            decided_at: ts,
            decision_reason: 'Hash mismatch: marked obsolete',
        };
        appendAuditMessage(thread, `Suggestion ${suggestion.suggestion_id} became obsolete due to hash mismatch.`, input.actor, ts);
        thread.updated_at = ts;
        return next;
    }
    suggestion.status = nextStatus;
    suggestion.decision = {
        decided_by: input.actor,
        decided_at: ts,
        decision_reason: input.decisionReason,
    };
    appendAuditMessage(thread, `Suggestion ${suggestion.suggestion_id} ${nextStatus}.`, input.actor, ts);
    thread.updated_at = ts;
    return next;
};
export const applySuggestion = (input) => updateSuggestionDecision(input, 'applied', input.beforeText);
export const rejectSuggestion = (input) => updateSuggestionDecision(input, 'rejected');
//# sourceMappingURL=operations.js.map
//# sourceMappingURL=operations.js.map
