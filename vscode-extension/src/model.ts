import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import {
  applyReanchor,
  createThread,
  parseSidecar,
  reanchor,
  readSidecarFile,
  reopenThread,
  reply,
  resolveThread,
  sidecarPathForDocument,
  writeSidecarFileAtomic,
  evaluateSidecarRelevance,
  proposeSuggestion,
  applySuggestion,
  rejectSuggestion,
  type AnchorConfidence,
  type Anchor,
  type Author,
  type Sidecar,
  type TimelineKind,
} from '../vendor/core/index.js';

export interface SidecarRevisionToken {
  exists: boolean;
  mtimeMs: number | null;
  size: number | null;
  hash: string | null;
}

export interface DocumentThreadState {
  documentPath: string;
  sidecarPath: string;
  sidecar: Sidecar;
  readOnly: boolean;
  malformedMessage?: string;
  sidecarExists: boolean;
  revisionToken: SidecarRevisionToken;
}

export interface Config {
  authorId: string;
  authorLabel: string;
  showResolvedInline: boolean;
  reanchorOnSave: boolean;
  workspaceSnapshotId?: string;
  timelineKind?: TimelineKind;
}

export class SidecarConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SidecarConflictError';
  }
}

const now = () => new Date().toISOString();

export const emptySidecarForDocument = (docPath: string): Sidecar => ({
  schema_version: '0.1.0',
  document: { path: docPath },
  threads: [],
});

const revisionTokenForPath = (path: string): SidecarRevisionToken => {
  try {
    const stat = statSync(path);
    const payload = readFileSync(path, 'utf8');
    const hash = createHash('sha256').update(payload).digest('hex');
    return {
      exists: true,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      hash,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ENOENT')) {
      return {
        exists: false,
        mtimeMs: null,
        size: null,
        hash: null,
      };
    }
    throw err;
  }
};

const sameRevision = (a: SidecarRevisionToken, b: SidecarRevisionToken): boolean =>
  a.exists === b.exists && a.mtimeMs === b.mtimeMs && a.size === b.size && a.hash === b.hash;

export const loadStateForDocument = (docPath: string): DocumentThreadState => {
  const sidecarPath = sidecarPathForDocument(docPath);
  const revisionToken = revisionTokenForPath(sidecarPath);
  try {
    const sidecar = readSidecarFile(sidecarPath);
    return { documentPath: docPath, sidecarPath, sidecar, readOnly: false, sidecarExists: true, revisionToken };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown sidecar error';
    if (message.includes('ENOENT')) {
      return {
        documentPath: docPath,
        sidecarPath,
        sidecar: emptySidecarForDocument(docPath),
        readOnly: false,
        sidecarExists: false,
        revisionToken,
      };
    }

    try {
      const raw = readFileSync(sidecarPath, 'utf8');
      parseSidecar(raw);
    } catch (schemaErr) {
      const schemaMessage = schemaErr instanceof Error ? schemaErr.message : message;
      return {
        documentPath: docPath,
        sidecarPath,
        sidecar: emptySidecarForDocument(docPath),
        readOnly: true,
        malformedMessage: schemaMessage,
        sidecarExists: true,
        revisionToken,
      };
    }

    throw err;
  }
};

const evaluateRelevance = (sidecar: Sidecar, config?: Config): Sidecar =>
  evaluateSidecarRelevance(sidecar, {
    timelineKind: config?.timelineKind,
    workspaceSnapshotId: config?.workspaceSnapshotId,
    currentPath: sidecar.document.path,
  });

export const reloadState = (state: DocumentThreadState, config?: Config): DocumentThreadState => {
  const loaded = loadStateForDocument(state.documentPath);
  return { ...loaded, sidecar: evaluateRelevance(loaded.sidecar, config) };
};

const authorFromConfig = (config: Config): Author => ({
  author_id: config.authorId,
  author_label: config.authorLabel,
  verified: null,
});

const persist = (state: DocumentThreadState): DocumentThreadState => {
  const currentRevision = revisionTokenForPath(state.sidecarPath);
  if (!sameRevision(currentRevision, state.revisionToken)) {
    throw new SidecarConflictError('sidecar changed on disk; reload sidecar then retry your action');
  }

  writeSidecarFileAtomic(state.sidecarPath, state.sidecar);
  return {
    ...state,
    sidecarExists: true,
    revisionToken: revisionTokenForPath(state.sidecarPath),
  };
};

export const addComment = (
  state: DocumentThreadState,
  documentText: string,
  startOffsetUtf16: number,
  endOffsetUtf16: number,
  body: string,
  config: Config,
): DocumentThreadState => {
  const ts = now();
  const nextSidecar = createThread({
    sidecar: state.sidecar,
    text: documentText,
    startOffsetUtf16,
    endOffsetUtf16,
    body,
    author: authorFromConfig(config),
    now: ts,
    timelineKind: config.timelineKind ?? 'workspace',
    workspaceSnapshotId: config.workspaceSnapshotId ?? ts,
    filePathAtCreate: state.documentPath,
  });

  return persist({ ...state, sidecar: evaluateRelevance(nextSidecar, config) });
};

export const addReply = (state: DocumentThreadState, threadId: string, body: string, config: Config): DocumentThreadState => {
  const ts = now();
  const nextSidecar = reply({
    sidecar: state.sidecar,
    threadId,
    body,
    author: authorFromConfig(config),
    now: ts,
    timelineKind: config.timelineKind ?? 'workspace',
    workspaceSnapshotId: config.workspaceSnapshotId ?? ts,
  });
  return persist({ ...state, sidecar: evaluateRelevance(nextSidecar, config) });
};

export const resolve = (state: DocumentThreadState, threadId: string, config: Config): DocumentThreadState => {
  const nextSidecar = resolveThread({
    sidecar: state.sidecar,
    threadId,
    actor: authorFromConfig(config),
    now: now(),
  });
  return persist({ ...state, sidecar: evaluateRelevance(nextSidecar, config) });
};

export const reopen = (state: DocumentThreadState, threadId: string, config: Config): DocumentThreadState => {
  const nextSidecar = reopenThread({
    sidecar: state.sidecar,
    threadId,
    actor: authorFromConfig(config),
    now: now(),
  });
  return persist({ ...state, sidecar: evaluateRelevance(nextSidecar, config) });
};

export const reanchorAll = (state: DocumentThreadState, documentText: string, config?: Config): DocumentThreadState => {
  let next = state.sidecar;
  let changed = false;

  for (const thread of next.threads) {
    const result = reanchor(documentText, thread.anchor);
    if (result.reanchored || result.anchor_confidence !== thread.anchor.anchor_confidence) {
      next = applyReanchor(next, thread.thread_id, result, now());
      changed = true;
    }
  }

  if (!changed) return state;
  return persist({ ...state, sidecar: evaluateRelevance(next, config) });
};

export const visibleInlineThreads = (state: DocumentThreadState, showResolvedInline: boolean) =>
  state.sidecar.threads.filter((thread) => thread.status === 'open' || showResolvedInline);

export const decorationStyleForConfidence = (confidence: AnchorConfidence): 'high' | 'medium' | 'low' | 'broken' => confidence;

export const timelineBadge = (kind: TimelineKind | undefined): 'local draft' | 'git' | 'hybrid' => {
  if (kind === 'git') return 'git';
  if (kind === 'hybrid') return 'hybrid';
  return 'local draft';
};

const hashText = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

export const proposeThreadSuggestion = (
  state: DocumentThreadState,
  threadId: string,
  anchor: Anchor,
  beforeText: string,
  replacementText: string,
  config: Config,
): DocumentThreadState => {
  const next = proposeSuggestion({
    sidecar: state.sidecar,
    threadId,
    author: authorFromConfig(config),
    anchor,
    beforeTextHash: hashText(beforeText),
    replacementText,
    now: now(),
  });
  return persist({ ...state, sidecar: next });
};

export const applyThreadSuggestion = (
  state: DocumentThreadState,
  threadId: string,
  suggestionId: string,
  beforeText: string,
  config: Config,
): DocumentThreadState =>
  persist({
    ...state,
    sidecar: applySuggestion({
      sidecar: state.sidecar,
      threadId,
      suggestionId,
      actor: authorFromConfig(config),
      beforeText,
      now: now(),
    }),
  });

export const rejectThreadSuggestion = (
  state: DocumentThreadState,
  threadId: string,
  suggestionId: string,
  config: Config,
): DocumentThreadState =>
  persist({
    ...state,
    sidecar: rejectSuggestion({
      sidecar: state.sidecar,
      threadId,
      suggestionId,
      actor: authorFromConfig(config),
      now: now(),
    }),
  });
