export type ThreadStatus = 'open' | 'resolved';
export type AnchorConfidence = 'high' | 'medium' | 'low' | 'broken';
export type ReanchorReasonCode =
  | 'exact_positional'
  | 'exact_nearby'
  | 'context_disambiguated'
  | 'fuzzy_recovery'
  | 'broken';

export type TimelineKind = 'workspace' | 'git' | 'hybrid';
export type RelevanceState = 'active' | 'outdated' | 'orphaned';
export type RelevanceReasonCode =
  | 'CONTENT_CHANGED'
  | 'ANCHOR_RELOCATED'
  | 'ANCHOR_NOT_FOUND'
  | 'FILE_RENAMED'
  | 'FILE_DELETED'
  | 'COMMIT_CONTEXT_UNAVAILABLE'
  | 'WORKSPACE_CONTEXT_UNAVAILABLE';

export type SuggestionStatus = 'proposed' | 'applied' | 'rejected' | 'obsolete';

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

export interface MessageVersionContext {
  kind: TimelineKind;
  seen_workspace_snapshot_id?: string;
  seen_head_commit?: string;
  seen_blob_sha?: string;
}

export interface Message {
  message_id: string;
  author: Author;
  body: string;
  created_at: string;
  edited_at: string | null;
  message_version_context?: MessageVersionContext;
}

export interface ThreadVersionContext {
  kind: TimelineKind;
  workspace_snapshot_id?: string;
  workspace_file_hash?: string;
  workspace_file_mtime?: string;
  workspace_actor_session_id?: string;
  base_commit?: string;
  head_commit?: string;
  file_path_at_create?: string;
  base_blob_sha?: string;
  head_blob_sha?: string;
  anchor_at_create?: Anchor;
}

export interface SuggestionProposedEdit {
  anchor: Anchor;
  before_text_hash: string;
  replacement_text: string;
}

export interface SuggestionDecision {
  decided_by: Author;
  decided_at: string;
  decision_reason?: string;
}

export interface Suggestion {
  suggestion_id: string;
  thread_id: string;
  status: SuggestionStatus;
  proposed_edit: SuggestionProposedEdit;
  proposed_by: Author;
  proposed_at: string;
  decision?: SuggestionDecision;
}

export interface Thread {
  thread_id: string;
  status: ThreadStatus;
  anchor: Anchor;
  author: Author;
  messages: Message[];
  created_at: string;
  updated_at: string;
  thread_version_context?: ThreadVersionContext;
  relevance_state?: RelevanceState;
  relevance_reason?: RelevanceReasonCode;
  relevance_checked_at?: string;
  relevance_checked_against_commit?: string;
  suggestions?: Suggestion[];
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
  timelineKind?: TimelineKind;
  workspaceSnapshotId?: string;
  workspaceFileHash?: string;
  workspaceFileMtime?: string;
  workspaceActorSessionId?: string;
  baseCommit?: string;
  headCommit?: string;
  filePathAtCreate?: string;
  baseBlobSha?: string;
  headBlobSha?: string;
}

export interface ReplyInput {
  sidecar: Sidecar;
  threadId: string;
  body: string;
  author: Author;
  now?: string;
  messageId?: string;
  timelineKind?: TimelineKind;
  workspaceSnapshotId?: string;
  seenHeadCommit?: string;
  seenBlobSha?: string;
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

export interface RelevanceContext {
  timelineKind?: TimelineKind;
  workspaceSnapshotId?: string;
  workspaceFileHash?: string;
  workspaceFileMtime?: string;
  currentPath?: string;
  headCommit?: string;
  headBlobSha?: string;
  gitAvailable?: boolean;
}

export interface SuggestionMutationInput {
  sidecar: Sidecar;
  threadId: string;
  suggestionId: string;
  actor: Author;
  now?: string;
  decisionReason?: string;
}

export interface ProposeSuggestionInput {
  sidecar: Sidecar;
  threadId: string;
  suggestionId?: string;
  author: Author;
  anchor: Anchor;
  beforeTextHash: string;
  replacementText: string;
  now?: string;
}
