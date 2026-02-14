import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { execSync } from 'node:child_process';
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

export interface SuggestionBaseVersion {
  source: 'git' | 'workspace' | 'unavailable';
  title: string;
  content?: string;
  reason?: string;
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

const relevanceCache = new Map<string, Sidecar>();
const lastHeadByDocument = new Map<string, string>();

const currentHeadSignature = (state: DocumentThreadState, config?: Config): string => {
  const tk = config?.timelineKind ?? 'workspace';
  if (tk !== 'git' && tk !== 'hybrid') return 'no-git-timeline';
  try {
    return execSync('git rev-parse HEAD', { cwd: dirname(state.documentPath), encoding: 'utf8' }).trim();
  } catch {
    return 'git-unavailable';
  }
};

const invalidateRelevanceCacheForHeadChange = (state: DocumentThreadState, config?: Config): string => {
  const head = currentHeadSignature(state, config);
  const prev = lastHeadByDocument.get(state.documentPath);
  if (prev !== undefined && prev !== head) {
    invalidateRelevanceCache(state.documentPath);
  }
  lastHeadByDocument.set(state.documentPath, head);
  return head;
};

const timelineKey = (state: DocumentThreadState, config?: Config): string => {
  const snapshot = config?.workspaceSnapshotId ?? '';
  const tk = config?.timelineKind ?? 'workspace';
  const revision = state.revisionToken.hash ?? state.revisionToken.mtimeMs ?? 'none';
  const sidecarSig = createHash('sha256').update(JSON.stringify(state.sidecar)).digest('hex');
  const head = invalidateRelevanceCacheForHeadChange(state, config);
  return `${state.documentPath}::${revision}::${sidecarSig}::${tk}::${snapshot}::${head}`;
};

export const invalidateRelevanceCache = (documentPath?: string): void => {
  if (!documentPath) {
    relevanceCache.clear();
    lastHeadByDocument.clear();
    return;
  }
  for (const key of relevanceCache.keys()) {
    if (key.startsWith(`${documentPath}::`)) relevanceCache.delete(key);
  }
  lastHeadByDocument.delete(documentPath);
};

const hashText = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const collectContext = (state: DocumentThreadState, config?: Config) => {
  const fileExists = existsSync(state.documentPath);
  const documentText = fileExists ? readFileSync(state.documentPath, 'utf8') : undefined;
  const workspaceFileHash = documentText ? hashText(documentText) : undefined;
  const workspaceFileMtime = fileExists ? new Date(statSync(state.documentPath).mtimeMs).toISOString() : undefined;

  const kind = config?.timelineKind;
  let gitAvailable: boolean | undefined;
  let headCommit: string | undefined;
  let headBlobSha: string | undefined;
  let currentPath = state.documentPath;

  if (kind === 'git' || kind === 'hybrid') {
    try {
      const cwd = dirname(state.documentPath);
      headCommit = execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim();
      const relPath = relative(cwd, state.documentPath).replace(/\\/g, '/');
      currentPath = relPath;
      headBlobSha = execSync(`git rev-parse HEAD:${relPath}`, { cwd, encoding: 'utf8' }).trim();
      gitAvailable = true;
    } catch {
      gitAvailable = false;
    }
  }

  return {
    timelineKind: kind,
    documentText,
    fileExists,
    workspaceSnapshotId: config?.workspaceSnapshotId,
    workspaceFileHash,
    workspaceFileMtime,
    currentPath,
    headCommit,
    headBlobSha,
    gitAvailable,
  };
};

const evaluateRelevance = (state: DocumentThreadState, config?: Config): Sidecar => {
  const key = timelineKey(state, config);
  const cached = relevanceCache.get(key);
  if (cached) return structuredClone(cached);

  const evaluated = evaluateSidecarRelevance(state.sidecar, collectContext(state, config));
  relevanceCache.set(key, structuredClone(evaluated));
  return evaluated;
};

export const __testOnlyRelevanceCacheSize = (): number => relevanceCache.size;

export const reloadState = (state: DocumentThreadState, config?: Config): DocumentThreadState => {
  const loaded = loadStateForDocument(state.documentPath);
  invalidateRelevanceCache(state.documentPath);
  return { ...loaded, sidecar: evaluateRelevance(loaded, config) };
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
  invalidateRelevanceCache(state.documentPath);
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
    workspaceFileHash: hashText(documentText),
    workspaceFileMtime: existsSync(state.documentPath) ? new Date(statSync(state.documentPath).mtimeMs).toISOString() : undefined,
    filePathAtCreate: state.documentPath,
  });

  return persist({ ...state, sidecar: evaluateRelevance({ ...state, sidecar: nextSidecar }, config) });
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
  return persist({ ...state, sidecar: evaluateRelevance({ ...state, sidecar: nextSidecar }, config) });
};

export const resolve = (state: DocumentThreadState, threadId: string, config: Config): DocumentThreadState => {
  const nextSidecar = resolveThread({
    sidecar: state.sidecar,
    threadId,
    actor: authorFromConfig(config),
    now: now(),
  });
  return persist({ ...state, sidecar: evaluateRelevance({ ...state, sidecar: nextSidecar }, config) });
};

export const reopen = (state: DocumentThreadState, threadId: string, config: Config): DocumentThreadState => {
  const nextSidecar = reopenThread({
    sidecar: state.sidecar,
    threadId,
    actor: authorFromConfig(config),
    now: now(),
  });
  return persist({ ...state, sidecar: evaluateRelevance({ ...state, sidecar: nextSidecar }, config) });
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
  return persist({ ...state, sidecar: evaluateRelevance({ ...state, sidecar: next }, config) });
};

export const visibleInlineThreads = (state: DocumentThreadState, showResolvedInline: boolean) =>
  state.sidecar.threads.filter((thread) => thread.status === 'open' || showResolvedInline);

export const decorationStyleForConfidence = (confidence: AnchorConfidence): 'high' | 'medium' | 'low' | 'broken' => confidence;

export const timelineBadge = (kind: TimelineKind | undefined): 'local draft' | 'git' | 'hybrid' => {
  if (kind === 'git') return 'git';
  if (kind === 'hybrid') return 'hybrid';
  return 'local draft';
};

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

export type ApplySuggestionPreflightOutcome =
  | {
      ok: true;
      replacementText: string;
      state: DocumentThreadState;
    }
  | {
      ok: false;
      state: DocumentThreadState;
      reason: 'SUGGESTION_NOT_FOUND' | 'SUGGESTION_NOT_PROPOSED' | 'HASH_MISMATCH';
    };

export const preflightApplyThreadSuggestion = (
  state: DocumentThreadState,
  threadId: string,
  suggestionId: string,
  beforeText: string,
  config: Config,
): ApplySuggestionPreflightOutcome => {
  const currentRevision = revisionTokenForPath(state.sidecarPath);
  if (!sameRevision(currentRevision, state.revisionToken)) {
    throw new SidecarConflictError('sidecar changed on disk; reload sidecar then retry your action');
  }

  const thread = state.sidecar.threads.find((t) => t.thread_id === threadId);
  const suggestion = thread?.suggestions?.find((s) => s.suggestion_id === suggestionId);
  if (!suggestion) {
    return { ok: false, state, reason: 'SUGGESTION_NOT_FOUND' };
  }
  if (suggestion.status !== 'proposed') {
    return { ok: false, state, reason: 'SUGGESTION_NOT_PROPOSED' };
  }

  if (hashText(beforeText) !== suggestion.proposed_edit.before_text_hash) {
    const next = persist({
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
    return { ok: false, state: next, reason: 'HASH_MISMATCH' };
  }

  return { ok: true, state, replacementText: suggestion.proposed_edit.replacement_text };
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

export const getSuggestionBaseVersion = (
  state: DocumentThreadState,
  threadId: string,
  suggestionId: string,
): SuggestionBaseVersion => {
  const thread = state.sidecar.threads.find((t) => t.thread_id === threadId);
  const suggestion = thread?.suggestions?.find((s) => s.suggestion_id === suggestionId);
  if (!thread || !suggestion) {
    return { source: 'unavailable', title: 'Suggestion base version unavailable', reason: 'Thread or suggestion not found.' };
  }

  const tvc = thread.thread_version_context;
  if (tvc?.base_commit && tvc.file_path_at_create) {
    try {
      const cwd = dirname(state.documentPath);
      const content = execSync(`git show ${tvc.base_commit}:${tvc.file_path_at_create}`, { cwd, encoding: 'utf8' });
      return {
        source: 'git',
        title: `Base version (${tvc.base_commit.slice(0, 12)}:${tvc.file_path_at_create})`,
        content,
      };
    } catch {
      return {
        source: 'unavailable',
        title: 'Suggestion base version unavailable',
        reason: 'Git base commit/path lookup failed in current workspace.',
      };
    }
  }

  return {
    source: 'workspace',
    title: 'Suggestion base version unavailable',
    reason: 'No git base commit metadata available for this suggestion in workspace-first mode.',
  };
};
