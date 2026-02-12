export type ThreadStatus = 'open' | 'resolved';
export type AnchorConfidence = 'high' | 'medium' | 'low' | 'broken';

export interface Author {
  author_id: string;
  author_label: string;
  verified: boolean | null;
}

export interface Point {
  line: number;
  column: number;
  offset_utf16: number;
}

export interface PrimaryAnchor {
  start: Point;
  end: Point;
  doc_revision?: string;
}

export interface FallbackAnchor {
  quote: string;
  prefix: string;
  suffix: string;
  quote_hash: string;
  context_hash: string;
}

export interface Anchor {
  primary: PrimaryAnchor;
  fallback: FallbackAnchor;
  anchor_confidence: AnchorConfidence;
}

export interface Message {
  message_id: string;
  author: Author;
  body: string;
  created_at: string;
  edited_at: string | null;
}

export interface Thread {
  thread_id: string;
  status: ThreadStatus;
  anchor: Anchor;
  author: Author;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

export interface Sidecar {
  schema_version: '0.1.0';
  document: { path: string };
  threads: Thread[];
}

export interface ReanchorOutput {
  start: Point | null;
  end: Point | null;
  anchor_confidence: AnchorConfidence;
  reason_code: string;
  reanchored: boolean;
  score?: number;
}

export class MdCollabError extends Error {
  code: string;
  constructor(code: string, message: string);
}

export function parseSidecar(raw: string): Sidecar;
export function readSidecarFile(path: string): Sidecar;
export function writeSidecarFileAtomic(path: string, sidecar: Sidecar): void;
export function sidecarPathForDocument(documentPath: string): string;

export function createThread(input: {
  sidecar: Sidecar;
  text: string;
  startOffsetUtf16: number;
  endOffsetUtf16: number;
  body: string;
  author: Author;
  now?: string;
  threadId?: string;
  messageId?: string;
}): Sidecar;

export function reply(input: {
  sidecar: Sidecar;
  threadId: string;
  body: string;
  author: Author;
  now?: string;
  messageId?: string;
}): Sidecar;

export function resolveThread(input: {
  sidecar: Sidecar;
  threadId: string;
  actor: Author;
  now?: string;
}): Sidecar;

export function reopenThread(input: {
  sidecar: Sidecar;
  threadId: string;
  actor: Author;
  now?: string;
}): Sidecar;

export function reanchor(text: string, anchor: Anchor): ReanchorOutput;
export function applyReanchor(sidecar: Sidecar, threadId: string, result: ReanchorOutput, now?: string): Sidecar;
