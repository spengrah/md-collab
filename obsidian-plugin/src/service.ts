import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  applySuggestion,
  applyReanchor,
  createThread,
  proposeSuggestion,
  readSidecarFile,
  reanchor,
  rejectSuggestion,
  reopenThread,
  reply,
  resolveThread,
  sidecarPathForDocument,
  writeSidecarFileAtomic,
  revisionTokenForPath,
  sameRevision,
  emptySidecar,
  hashText,
  SidecarConflictError,
  type SidecarRevisionToken,
  type Anchor,
  type Author,
  type Sidecar,
} from './vendor.js';

export { SidecarConflictError, type SidecarRevisionToken };

export interface DocumentThreadState {
  documentPath: string;
  sidecarPath: string;
  sidecar: Sidecar;
  revisionToken: SidecarRevisionToken;
}

const asAuthor = (authorId: string, authorLabel: string): Author => ({ author_id: authorId, author_label: authorLabel, verified: null });
const now = (): string => new Date().toISOString();

export const loadState = (documentPath: string): DocumentThreadState => {
  const sidecarPath = sidecarPathForDocument(documentPath);
  let sidecar: Sidecar;
  try {
    sidecar = readSidecarFile(sidecarPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ENOENT')) {
      sidecar = emptySidecar(documentPath);
    } else {
      throw err;
    }
  }
  return { documentPath, sidecarPath, sidecar, revisionToken: revisionTokenForPath(sidecarPath) };
};

const persist = (state: DocumentThreadState): DocumentThreadState => {
  const current = revisionTokenForPath(state.sidecarPath);
  if (!sameRevision(current, state.revisionToken)) {
    throw new SidecarConflictError('sidecar changed on disk; reload then retry');
  }
  writeSidecarFileAtomic(state.sidecarPath, state.sidecar, state.documentPath);
  return { ...state, revisionToken: revisionTokenForPath(state.sidecarPath) };
};

export const addComment = (
  state: DocumentThreadState,
  body: string,
  startOffsetUtf16: number,
  endOffsetUtf16: number,
  authorId: string,
  authorLabel: string,
): DocumentThreadState => {
  const text = readFileSync(state.documentPath, 'utf8');
  const next = createThread({
    sidecar: state.sidecar,
    text,
    startOffsetUtf16,
    endOffsetUtf16,
    body,
    author: asAuthor(authorId, authorLabel),
    now: now(),
    timelineKind: 'workspace',
    workspaceSnapshotId: now(),
    workspaceFileHash: hashText(text),
    workspaceFileMtime: existsSync(state.documentPath) ? new Date(statSync(state.documentPath).mtimeMs).toISOString() : undefined,
    filePathAtCreate: state.documentPath,
  });
  return persist({ ...state, sidecar: next });
};

export const addReply = (
  state: DocumentThreadState,
  threadId: string,
  body: string,
  authorId: string,
  authorLabel: string,
): DocumentThreadState =>
  persist({
    ...state,
    sidecar: reply({
      sidecar: state.sidecar,
      threadId,
      body,
      author: asAuthor(authorId, authorLabel),
      now: now(),
      timelineKind: 'workspace',
    }),
  });

export const resolve = (state: DocumentThreadState, threadId: string, authorId: string, authorLabel: string): DocumentThreadState =>
  persist({
    ...state,
    sidecar: resolveThread({ sidecar: state.sidecar, threadId, actor: asAuthor(authorId, authorLabel), now: now() }),
  });

export const reopen = (state: DocumentThreadState, threadId: string, authorId: string, authorLabel: string): DocumentThreadState =>
  persist({
    ...state,
    sidecar: reopenThread({ sidecar: state.sidecar, threadId, actor: asAuthor(authorId, authorLabel), now: now() }),
  });

export const reanchorAll = (state: DocumentThreadState): DocumentThreadState => {
  const text = readFileSync(state.documentPath, 'utf8');
  let next = state.sidecar;
  let changed = false;
  for (const thread of next.threads) {
    const result = reanchor(text, thread.anchor);
    if (result.reanchored || result.anchor_confidence !== thread.anchor.anchor_confidence) {
      next = applyReanchor(next, thread.thread_id, result, now());
      changed = true;
    }
  }
  if (!changed) return state;
  return persist({ ...state, sidecar: next });
};

export const proposeThreadSuggestion = (
  state: DocumentThreadState,
  threadId: string,
  beforeText: string,
  replacementText: string,
  authorId: string,
  authorLabel: string,
): DocumentThreadState => {
  const thread = state.sidecar.threads.find((t) => t.thread_id === threadId);
  if (!thread) throw new Error(`thread not found: ${threadId}`);
  const anchor: Anchor = thread.anchor;
  const next = proposeSuggestion({
    sidecar: state.sidecar,
    threadId,
    anchor,
    beforeTextHash: hashText(beforeText),
    replacementText,
    author: asAuthor(authorId, authorLabel),
    now: now(),
  });
  return persist({ ...state, sidecar: next });
};

export const applyThreadSuggestion = (
  state: DocumentThreadState,
  threadId: string,
  suggestionId: string,
  beforeText: string,
  authorId: string,
  authorLabel: string,
): DocumentThreadState =>
  persist({
    ...state,
    sidecar: applySuggestion({
      sidecar: state.sidecar,
      threadId,
      suggestionId,
      beforeText,
      actor: asAuthor(authorId, authorLabel),
      now: now(),
    }),
  });

export const rejectThreadSuggestion = (
  state: DocumentThreadState,
  threadId: string,
  suggestionId: string,
  authorId: string,
  authorLabel: string,
): DocumentThreadState =>
  persist({
    ...state,
    sidecar: rejectSuggestion({
      sidecar: state.sidecar,
      threadId,
      suggestionId,
      actor: asAuthor(authorId, authorLabel),
      now: now(),
    }),
  });
