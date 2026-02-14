import { createHash, randomUUID } from 'node:crypto';
import { reanchor } from './reanchor.js';
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
const makeThreadVersionContext = (input, anchorAtCreate, fallbackWorkspaceSnapshotId) => ({
    kind: ensureTimelineKind(input.timelineKind),
    workspace_snapshot_id: ensureTimelineKind(input.timelineKind) === 'workspace' || ensureTimelineKind(input.timelineKind) === 'hybrid'
        ? input.workspaceSnapshotId ?? fallbackWorkspaceSnapshotId
        : input.workspaceSnapshotId,
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
const makeMessageVersionContext = (input, fallbackWorkspaceSnapshotId) => ({
    kind: ensureTimelineKind(input.timelineKind),
    seen_workspace_snapshot_id: ensureTimelineKind(input.timelineKind) === 'workspace' || ensureTimelineKind(input.timelineKind) === 'hybrid'
        ? input.workspaceSnapshotId ?? fallbackWorkspaceSnapshotId
        : input.workspaceSnapshotId,
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
                message_version_context: makeMessageVersionContext(input, ts),
            },
        ],
        created_at: ts,
        updated_at: ts,
        thread_version_context: makeThreadVersionContext(input, anchor, ts),
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
        message_version_context: makeMessageVersionContext(input, ts),
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
const hasDirectAnchorMatch = (thread, documentText) => {
    if (!documentText || !thread.anchor.primary.start || !thread.anchor.primary.end)
        return false;
    const start = thread.anchor.primary.start.offset_utf16;
    const endExclusive = thread.anchor.primary.end.offset_utf16 + 1;
    if (start < 0 || endExclusive < start || endExclusive > documentText.length)
        return false;
    return documentText.slice(start, endExclusive) === thread.anchor.fallback.quote;
};
export const evaluateThreadRelevance = (thread, context, checkedAt = nowUtc()) => {
    const next = clone(thread);
    const timelineKind = context.timelineKind ?? next.thread_version_context?.kind ?? 'workspace';
    // 1) direct anchor match in current file
    const directMatch = hasDirectAnchorMatch(next, context.documentText);
    // 2) explicit reanchor stage
    let wasReanchored = false;
    if (!directMatch && context.documentText && context.fileExists !== false) {
        const reanchorResult = reanchor(context.documentText, next.anchor);
        if (reanchorResult.start && reanchorResult.end) {
            next.anchor.primary.start = reanchorResult.start;
            next.anchor.primary.end = reanchorResult.end;
            next.anchor.anchor_confidence = reanchorResult.anchor_confidence;
        }
        if (reanchorResult.anchor_confidence === 'broken' || !reanchorResult.start || !reanchorResult.end) {
            setRelevance(next, 'orphaned', 'ANCHOR_NOT_FOUND', checkedAt, context.headCommit);
            return next;
        }
        wasReanchored = reanchorResult.reanchored;
    }
    // 3) workspace-first delta checks
    if (timelineKind === 'workspace' || timelineKind === 'hybrid') {
        const hasWorkspaceContext = !!context.workspaceSnapshotId || !!context.workspaceFileHash || !!context.workspaceFileMtime || !!context.workspaceActorSessionId;
        if (!hasWorkspaceContext) {
            setRelevance(next, 'outdated', 'WORKSPACE_CONTEXT_UNAVAILABLE', checkedAt, context.headCommit);
            return next;
        }
        const tvc = next.thread_version_context;
        if (tvc?.workspace_snapshot_id && context.workspaceSnapshotId && tvc.workspace_snapshot_id !== context.workspaceSnapshotId) {
            setRelevance(next, 'outdated', 'CONTENT_CHANGED', checkedAt, context.headCommit);
            return next;
        }
        if (tvc?.workspace_file_hash && context.workspaceFileHash && tvc.workspace_file_hash !== context.workspaceFileHash) {
            setRelevance(next, 'outdated', 'CONTENT_CHANGED', checkedAt, context.headCommit);
            return next;
        }
        if (tvc?.workspace_file_mtime && context.workspaceFileMtime && tvc.workspace_file_mtime !== context.workspaceFileMtime) {
            setRelevance(next, 'outdated', 'CONTENT_CHANGED', checkedAt, context.headCommit);
            return next;
        }
        if (tvc?.workspace_actor_session_id &&
            context.workspaceActorSessionId &&
            tvc.workspace_actor_session_id !== context.workspaceActorSessionId) {
            setRelevance(next, 'outdated', 'CONTENT_CHANGED', checkedAt, context.headCommit);
            return next;
        }
    }
    // 4) git path continuity checks (when git context exists)
    if (timelineKind === 'git' || timelineKind === 'hybrid') {
        if (context.gitAvailable === false) {
            setRelevance(next, 'outdated', 'COMMIT_CONTEXT_UNAVAILABLE', checkedAt, context.headCommit);
            return next;
        }
        const tvc = next.thread_version_context;
        const missingRequiredGitContext = !context.currentPath ||
            !context.headCommit ||
            (!!tvc?.base_commit && !context.baseCommit) ||
            (!!tvc?.head_blob_sha && !context.headBlobSha) ||
            (!!tvc?.base_blob_sha && !context.baseBlobSha);
        if (missingRequiredGitContext) {
            setRelevance(next, 'outdated', 'COMMIT_CONTEXT_UNAVAILABLE', checkedAt, context.headCommit);
            return next;
        }
        if (context.fileExists === false) {
            setRelevance(next, 'orphaned', 'FILE_DELETED', checkedAt, context.headCommit);
            return next;
        }
        if (tvc?.file_path_at_create && tvc.file_path_at_create !== context.currentPath) {
            setRelevance(next, 'outdated', 'FILE_RENAMED', checkedAt, context.headCommit);
            return next;
        }
        // 5) git version delta checks when git context exists
        if (tvc?.head_commit && tvc.head_commit !== context.headCommit) {
            setRelevance(next, 'outdated', 'CONTENT_CHANGED', checkedAt, context.headCommit);
            return next;
        }
        if (tvc?.base_commit && tvc.base_commit !== context.baseCommit) {
            setRelevance(next, 'outdated', 'CONTENT_CHANGED', checkedAt, context.headCommit);
            return next;
        }
        if (tvc?.head_blob_sha && tvc.head_blob_sha !== context.headBlobSha) {
            setRelevance(next, 'outdated', 'CONTENT_CHANGED', checkedAt, context.headCommit);
            return next;
        }
        if (tvc?.base_blob_sha && tvc.base_blob_sha !== context.baseBlobSha) {
            setRelevance(next, 'outdated', 'CONTENT_CHANGED', checkedAt, context.headCommit);
            return next;
        }
    }
    if (wasReanchored) {
        setRelevance(next, 'outdated', 'ANCHOR_RELOCATED', checkedAt, context.headCommit);
        return next;
    }
    if (!next.anchor.primary.start || !next.anchor.primary.end || next.anchor.anchor_confidence === 'broken') {
        setRelevance(next, 'orphaned', 'ANCHOR_NOT_FOUND', checkedAt, context.headCommit);
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
