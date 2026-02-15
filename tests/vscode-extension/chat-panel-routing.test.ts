import { describe, expect, it } from 'vitest';
import { __testOnlyBuildIntentDispatchArgs, chatIntentToCommand } from '../../vscode-extension/src/threadChatPanel.js';

describe('chat intent command routing', () => {
  it('maps webview intents to canonical extension commands', () => {
    expect(chatIntentToCommand.addComment).toBe('mdCollab.addComment');
    expect(chatIntentToCommand.reply).toBe('mdCollab.replyToThread');
    expect(chatIntentToCommand.resolve).toBe('mdCollab.resolveThread');
    expect(chatIntentToCommand.reopen).toBe('mdCollab.reopenThread');
    expect(chatIntentToCommand.suggest).toBe('mdCollab.proposeSuggestion');
    expect(chatIntentToCommand.suggestFromSelection).toBe('mdCollab.proposeSuggestionFromSelection');
    expect(chatIntentToCommand.applySuggestion).toBe('mdCollab.applySuggestion');
    expect(chatIntentToCommand.rejectSuggestion).toBe('mdCollab.rejectSuggestion');
    expect(chatIntentToCommand.viewBaseVersion).toBe('mdCollab.viewSuggestionBaseVersion');
    expect(chatIntentToCommand.jumpToAnchor).toBe('mdCollab.navigateToThread');
    expect(chatIntentToCommand.relinkAnchor).toBe('mdCollab.reanchorCurrentFile');
    expect(chatIntentToCommand.reloadSidecar).toBe('mdCollab.reloadSidecar');
  });

  it('builds dispatch args for intents without bypassing command routing', () => {
    expect(__testOnlyBuildIntentDispatchArgs({ type: 'intent', intent: 'addComment', body: 'x' })).toEqual([{ body: 'x' }]);
    expect(__testOnlyBuildIntentDispatchArgs({ type: 'intent', intent: 'reply', threadId: 't1', body: 'x' })).toEqual([
      { threadId: 't1', body: 'x' },
    ]);
    expect(__testOnlyBuildIntentDispatchArgs({ type: 'intent', intent: 'applySuggestion', threadId: 't1', suggestionId: 's1' })).toEqual([
      't1',
      's1',
    ]);
    expect(__testOnlyBuildIntentDispatchArgs({ type: 'intent', intent: 'reloadSidecar' })).toEqual([]);
  });
});
