import type { CommandAuthorConfig, ThreadIntent } from './intents.js';
import {
  addComment,
  addReply,
  applyThreadSuggestion,
  loadState,
  proposeThreadSuggestion,
  reanchorAll,
  rejectThreadSuggestion,
  reopen,
  resolve,
  type DocumentThreadState,
} from './service.js';

export interface IntentContext {
  state: DocumentThreadState;
  author: CommandAuthorConfig;
}

export class IntentRouter {
  handle(intent: ThreadIntent, context: IntentContext): DocumentThreadState {
    const { state, author } = context;
    switch (intent.kind) {
      case 'reload':
        return loadState(state.documentPath);
      case 'add-comment-from-selection':
        return addComment(state, intent.body, intent.startOffsetUtf16, intent.endOffsetUtf16, author.authorId, author.authorLabel);
      case 'reply':
        return addReply(state, intent.threadId, intent.body, author.authorId, author.authorLabel);
      case 'resolve':
        return resolve(state, intent.threadId, author.authorId, author.authorLabel);
      case 'reopen':
        return reopen(state, intent.threadId, author.authorId, author.authorLabel);
      case 'propose-suggestion':
        return proposeThreadSuggestion(
          state,
          intent.threadId,
          intent.beforeText,
          intent.replacementText,
          author.authorId,
          author.authorLabel,
        );
      case 'apply-suggestion':
        return applyThreadSuggestion(
          state,
          intent.threadId,
          intent.suggestionId,
          intent.beforeText,
          author.authorId,
          author.authorLabel,
        );
      case 'reject-suggestion':
        return rejectThreadSuggestion(state, intent.threadId, intent.suggestionId, author.authorId, author.authorLabel);
      case 'reanchor':
        return reanchorAll(state);
      default: {
        const exhaustive: never = intent;
        return exhaustive;
      }
    }
  }
}
