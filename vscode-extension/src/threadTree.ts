import * as vscode from 'vscode';
import { timelineBadge, type DocumentThreadState } from './model.js';

type GroupKind = 'open' | 'resolved';

class GroupItem extends vscode.TreeItem {
  constructor(public readonly group: GroupKind, count: number) {
    super(group === 'open' ? `Open (${count})` : `Resolved (${count})`, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `mdCollab.group.${group}`;
  }
}

class NoticeItem extends vscode.TreeItem {
  constructor() {
    super('Note: md-collab sidecar writes are outside Markdown undo/redo.', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
    this.contextValue = 'mdCollab.notice.undoRedo';
  }
}

class BrokenAnchorRelinkItem extends vscode.TreeItem {
  constructor(count: number) {
    super(`Broken anchors detected (${count}) — Relink now`, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('warning');
    this.contextValue = 'mdCollab.notice.brokenAnchor';
    this.command = {
      command: 'mdCollab.reanchorCurrentFile',
      title: 'Relink broken anchors',
    };
    this.tooltip = 'Run reanchor on this file to relink broken thread anchors.';
  }
}

export class ThreadItem extends vscode.TreeItem {
  constructor(public readonly threadId: string, label: string, status: 'open' | 'resolved', timeline: string) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `mdCollab.thread.${status}`;
    this.description = `${status} · ${timeline}`;
    this.command = { command: 'mdCollab.navigateToThread', title: 'Jump to Thread', arguments: [threadId] };
    this.iconPath = new vscode.ThemeIcon(status === 'open' ? 'comment-discussion' : 'pass-filled');
  }
}

class MessageItem extends vscode.TreeItem {
  constructor(label: string, body: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = body.replace(/\s+/g, ' ').slice(0, 80);
    this.tooltip = body;
    this.contextValue = 'mdCollab.message';
    this.iconPath = new vscode.ThemeIcon('comment');
  }
}

class ReplyActionItem extends vscode.TreeItem {
  constructor(threadId: string) {
    super('Reply…', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'mdCollab.thread.replyAction';
    this.command = { command: 'mdCollab.replyToThread', title: 'Reply', arguments: [threadId] };
    this.iconPath = new vscode.ThemeIcon('reply');
  }
}

class ToggleStatusActionItem extends vscode.TreeItem {
  constructor(threadId: string, status: 'open' | 'resolved') {
    super(status === 'open' ? 'Resolve thread' : 'Reopen thread', vscode.TreeItemCollapsibleState.None);
    this.contextValue = `mdCollab.thread.${status}.toggleAction`;
    this.command = {
      command: status === 'open' ? 'mdCollab.resolveThread' : 'mdCollab.reopenThread',
      title: status === 'open' ? 'Resolve thread' : 'Reopen thread',
      arguments: [threadId],
    };
    this.iconPath = new vscode.ThemeIcon(status === 'open' ? 'pass' : 'history');
  }
}

class ProposeSuggestionActionItem extends vscode.TreeItem {
  constructor(threadId: string) {
    super('Suggest edit from current selection…', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'mdCollab.thread.suggestAction';
    this.command = { command: 'mdCollab.proposeSuggestion', title: 'Suggest edit', arguments: [threadId] };
    this.iconPath = new vscode.ThemeIcon('sparkle');
    this.tooltip = 'Select text in the editor, then run this action to propose replacement text for this thread.';
  }
}

class SuggestionItem extends vscode.TreeItem {
  constructor(public readonly threadId: string, public readonly suggestionId: string, status: string, replacement: string) {
    super(`Suggestion ${suggestionId.slice(0, 8)} (${status})`, vscode.TreeItemCollapsibleState.None);
    this.contextValue = `mdCollab.suggestion.${status}`;
    this.description = replacement.replace(/\s+/g, ' ').slice(0, 80);
    this.tooltip = replacement;
    this.iconPath = new vscode.ThemeIcon(status === 'proposed' ? 'lightbulb-autofix' : 'check');
  }
}

class SuggestionActionItem extends vscode.TreeItem {
  constructor(
    label: string,
    icon: string,
    command: string,
    threadId: string,
    suggestionId: string,
    contextValue: string,
    tooltip?: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = contextValue;
    this.command = { command, title: label, arguments: [threadId, suggestionId] };
    this.iconPath = new vscode.ThemeIcon(icon);
    this.tooltip = tooltip;
  }
}

export class ThreadTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly emitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private state?: DocumentThreadState;

  setState(state: DocumentThreadState | undefined) {
    this.state = state;
    this.emitter.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (!this.state) return [];

    if (!element) {
      const openCount = this.state.sidecar.threads.filter((t) => t.status === 'open').length;
      const resolvedCount = this.state.sidecar.threads.filter((t) => t.status === 'resolved').length;
      const brokenAnchors = this.state.sidecar.threads.filter((t) => t.anchor.anchor_confidence === 'broken').length;

      const roots: vscode.TreeItem[] = [new NoticeItem()];
      if (brokenAnchors > 0) {
        roots.push(new BrokenAnchorRelinkItem(brokenAnchors));
      }
      roots.push(new GroupItem('open', openCount), new GroupItem('resolved', resolvedCount));
      return roots;
    }

    if (element instanceof GroupItem) {
      const threads = this.state.sidecar.threads.filter((t) => t.status === element.group);
      return threads.map((thread) => {
        const latest = thread.messages[thread.messages.length - 1];
        const snippet = latest?.body?.slice(0, 60).replace(/\s+/g, ' ') || '(no messages)';
        return new ThreadItem(thread.thread_id, snippet, thread.status, timelineBadge(thread.thread_version_context?.kind));
      });
    }

    if (element instanceof ThreadItem) {
      const thread = this.state.sidecar.threads.find((candidate) => candidate.thread_id === element.threadId);
      if (!thread) return [];

      const orderedMessages = [...thread.messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const messageItems = orderedMessages.map((message) => {
        const timestamp = new Date(message.created_at).toLocaleString();
        return new MessageItem(`${message.author.author_label} · ${timestamp}`, message.body);
      });

      const actionItems: vscode.TreeItem[] = [
        new ReplyActionItem(thread.thread_id),
        new ToggleStatusActionItem(thread.thread_id, thread.status),
        new ProposeSuggestionActionItem(thread.thread_id),
      ];

      const suggestionItems = (thread.suggestions ?? []).map(
        (suggestion) =>
          new SuggestionItem(
            thread.thread_id,
            suggestion.suggestion_id,
            suggestion.status,
            suggestion.proposed_edit.replacement_text,
          ),
      );

      return [...messageItems, ...actionItems, ...suggestionItems];
    }

    if (element instanceof SuggestionItem) {
      const actions: vscode.TreeItem[] = [];
      if (element.contextValue === 'mdCollab.suggestion.proposed') {
        actions.push(
          new SuggestionActionItem(
            'Apply suggestion',
            'check',
            'mdCollab.applySuggestion',
            element.threadId,
            element.suggestionId,
            'mdCollab.suggestion.applyAction',
          ),
          new SuggestionActionItem(
            'Reject suggestion',
            'close',
            'mdCollab.rejectSuggestion',
            element.threadId,
            element.suggestionId,
            'mdCollab.suggestion.rejectAction',
          ),
        );
      }
      actions.push(
        new SuggestionActionItem(
          'View base version context',
          'versions',
          'mdCollab.viewSuggestionBaseVersion',
          element.threadId,
          element.suggestionId,
          'mdCollab.suggestion.baseAction',
          'Open the version context used when this suggestion was created (or guidance if unavailable).',
        ),
      );
      return actions;
    }

    return [];
  }
}
