export type ThreadStatus = 'open' | 'resolved';
export type AnchorConfidence = 'high' | 'medium' | 'low' | 'broken';
export type ReanchorReasonCode =
  | 'exact_positional'
  | 'exact_nearby'
  | 'context_disambiguated'
  | 'fuzzy_recovery'
  | 'broken';

export interface Author {
  author_id: string;
  author_label: string;
  verified: boolean | null;
}

export interface Point {
  line: number; // 1-indexed
  column: number; // 1-indexed
  offset_utf16: number; // 0-indexed code units
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

export interface AnchorBuildOptions {
  prefixLength?: number;
  suffixLength?: number;
  docRevision?: string;
}

export interface CreateThreadInput {
  sidecar: Sidecar;
  text: string;
  startOffsetUtf16: number;
  endOffsetUtf16: number;
  body: string;
  author: Author;
  now?: string;
  threadId?: string;
  messageId?: string;
}

export interface ReplyInput {
  sidecar: Sidecar;
  threadId: string;
  body: string;
  author: Author;
  now?: string;
  messageId?: string;
}

export interface EditMessageInput {
  sidecar: Sidecar;
  threadId: string;
  messageId: string;
  newBody: string;
  editor: Author;
  now?: string;
}

export interface ToggleThreadInput {
  sidecar: Sidecar;
  threadId: string;
  actor: Author;
  now?: string;
}

export interface ReanchorOutput {
  start: Point | null;
  end: Point | null;
  anchor_confidence: AnchorConfidence;
  reason_code: ReanchorReasonCode;
  reanchored: boolean;
  score?: number;
}
