export type ThreadIntent =
  | { kind: 'reload' }
  | { kind: 'add-comment-from-selection'; body: string; startOffsetUtf16: number; endOffsetUtf16: number }
  | { kind: 'reply'; threadId: string; body: string }
  | { kind: 'resolve'; threadId: string }
  | { kind: 'reopen'; threadId: string }
  | { kind: 'propose-suggestion'; threadId: string; beforeText: string; replacementText: string }
  | { kind: 'apply-suggestion'; threadId: string; suggestionId: string; beforeText: string }
  | { kind: 'reject-suggestion'; threadId: string; suggestionId: string }
  | { kind: 'reanchor' };

export interface CommandAuthorConfig {
  authorId: string;
  authorLabel: string;
}
