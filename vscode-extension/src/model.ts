import { readFileSync } from 'node:fs';
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
  type AnchorConfidence,
  type Author,
  type Sidecar,
} from '../vendor/core/index.js';

export interface DocumentThreadState {
  sidecarPath: string;
  sidecar: Sidecar;
  readOnly: boolean;
  malformedMessage?: string;
  sidecarExists: boolean;
}

export interface Config {
  authorId: string;
  authorLabel: string;
  showResolvedInline: boolean;
  reanchorOnSave: boolean;
}

const now = () => new Date().toISOString();

export const emptySidecarForDocument = (docPath: string): Sidecar => ({
  schema_version: '0.1.0',
  document: { path: docPath },
  threads: [],
});

export const loadStateForDocument = (docPath: string): DocumentThreadState => {
  const sidecarPath = sidecarPathForDocument(docPath);
  try {
    const sidecar = readSidecarFile(sidecarPath);
    return { sidecarPath, sidecar, readOnly: false, sidecarExists: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown sidecar error';
    if (message.includes('ENOENT')) {
      return {
        sidecarPath,
        sidecar: emptySidecarForDocument(docPath),
        readOnly: false,
        sidecarExists: false,
      };
    }

    try {
      const raw = readFileSync(sidecarPath, 'utf8');
      parseSidecar(raw);
    } catch (schemaErr) {
      const schemaMessage = schemaErr instanceof Error ? schemaErr.message : message;
      return {
        sidecarPath,
        sidecar: emptySidecarForDocument(docPath),
        readOnly: true,
        malformedMessage: schemaMessage,
        sidecarExists: true,
      };
    }

    throw err;
  }
};

const authorFromConfig = (config: Config): Author => ({
  author_id: config.authorId,
  author_label: config.authorLabel,
  verified: null,
});

const persist = (state: DocumentThreadState): DocumentThreadState => {
  writeSidecarFileAtomic(state.sidecarPath, state.sidecar);
  return { ...state, sidecarExists: true };
};

export const addComment = (
  state: DocumentThreadState,
  documentText: string,
  startOffsetUtf16: number,
  endOffsetUtf16: number,
  body: string,
  config: Config,
): DocumentThreadState => {
  const nextSidecar = createThread({
    sidecar: state.sidecar,
    text: documentText,
    startOffsetUtf16,
    endOffsetUtf16,
    body,
    author: authorFromConfig(config),
    now: now(),
  });

  return persist({ ...state, sidecar: nextSidecar });
};

export const addReply = (state: DocumentThreadState, threadId: string, body: string, config: Config): DocumentThreadState => {
  const nextSidecar = reply({
    sidecar: state.sidecar,
    threadId,
    body,
    author: authorFromConfig(config),
    now: now(),
  });
  return persist({ ...state, sidecar: nextSidecar });
};

export const resolve = (state: DocumentThreadState, threadId: string, config: Config): DocumentThreadState => {
  const nextSidecar = resolveThread({
    sidecar: state.sidecar,
    threadId,
    actor: authorFromConfig(config),
    now: now(),
  });
  return persist({ ...state, sidecar: nextSidecar });
};

export const reopen = (state: DocumentThreadState, threadId: string, config: Config): DocumentThreadState => {
  const nextSidecar = reopenThread({
    sidecar: state.sidecar,
    threadId,
    actor: authorFromConfig(config),
    now: now(),
  });
  return persist({ ...state, sidecar: nextSidecar });
};

export const reanchorAll = (state: DocumentThreadState, documentText: string): DocumentThreadState => {
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
  return persist({ ...state, sidecar: next });
};

export const visibleInlineThreads = (state: DocumentThreadState, showResolvedInline: boolean) =>
  state.sidecar.threads.filter((thread) => thread.status === 'open' || showResolvedInline);

export const decorationStyleForConfidence = (confidence: AnchorConfidence): 'high' | 'medium' | 'low' | 'broken' => confidence;
