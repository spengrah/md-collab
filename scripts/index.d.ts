export type ThreadStatus = 'open' | 'resolved';
export type AnchorConfidence = 'high' | 'medium' | 'low' | 'broken';
export type TimelineKind = 'workspace' | 'git' | 'hybrid';

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

export interface PrimaryAnchor { start: Point; end: Point; doc_revision?: string; }
export interface FallbackAnchor { quote: string; prefix: string; suffix: string; quote_hash: string; context_hash: string; }
export interface Anchor { primary: PrimaryAnchor; fallback: FallbackAnchor; anchor_confidence: AnchorConfidence; }

export interface Message {
  message_id: string;
  author: Author;
  body: string;
  created_at: string;
  edited_at: string | null;
  message_version_context?: { kind: TimelineKind; seen_workspace_snapshot_id?: string; seen_head_commit?: string; seen_blob_sha?: string };
}

export interface Thread {
  thread_id: string;
  status: ThreadStatus;
  anchor: Anchor;
  author: Author;
  messages: Message[];
  created_at: string;
  updated_at: string;
  thread_version_context?: {
    kind: TimelineKind;
    workspace_snapshot_id?: string;
    file_path_at_create?: string;
    workspace_file_hash?: string;
    head_blob_sha?: string;
    base_commit?: string;
    head_commit?: string;
  };
  relevance_state?: 'active' | 'outdated' | 'orphaned';
  relevance_reason?: string;
  suggestions?: Array<{
    suggestion_id: string;
    status: 'proposed' | 'applied' | 'rejected' | 'obsolete';
    proposed_edit: { replacement_text: string; anchor: Anchor; before_text_hash?: string };
  }>;
}

export interface Sidecar { schema_version: '0.1.0'; document: { path: string }; threads: Thread[]; }

export interface ReanchorOutput {
  start: Point | null;
  end: Point | null;
  anchor_confidence: AnchorConfidence;
  reason_code: string;
  reanchored: boolean;
  score?: number;
}

export class MdCollabError extends Error { code: string; constructor(code: string, message: string); }

export interface SidecarPermissionParityResult { ok: boolean; warnings: string[]; }

export function parseSidecar(raw: string): Sidecar;
export function readSidecarFile(path: string): Sidecar;
export function ensureSidecarPermissionParity(docPath: string, sidecarPath: string): SidecarPermissionParityResult;
export function writeSidecarFileAtomic(path: string, sidecar: Sidecar, docPath?: string): void;
export function sidecarPathForDocument(documentPath: string): string;

export function createThread(input: any): Sidecar;
export function reply(input: any): Sidecar;
export function resolveThread(input: any): Sidecar;
export function reopenThread(input: any): Sidecar;
export function editMessage(input: any): Sidecar;

export function reanchor(text: string, anchor: Anchor): ReanchorOutput;
export function applyReanchor(sidecar: Sidecar, threadId: string, result: ReanchorOutput, now?: string): Sidecar;

export function evaluateSidecarRelevance(sidecar: Sidecar, context: any, checkedAt?: string): Sidecar;
export function proposeSuggestion(input: any): Sidecar;
export function applySuggestion(input: any): Sidecar;
export function rejectSuggestion(input: any): Sidecar;

export function serializeDeterministic(value: unknown): string;
