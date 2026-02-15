import { describe, expect, it } from 'vitest';
import { chatIntentToCommand } from '../../vscode-extension/src/threadChatPanel.js';

describe('chat intent command routing', () => {
  it('maps webview intents to canonical extension commands', () => {
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
});
