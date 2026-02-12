import * as vscode from 'vscode';
import type { DocumentThreadState } from './model.js';

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
  constructor(public readonly threadId: string, label: string, status: 'open' | 'resolved') {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `mdCollab.thread.${status}`;
    this.description = status;
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
        return new ThreadItem(thread.thread_id, snippet, thread.status);
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

      return [...messageItems, new ReplyActionItem(thread.thread_id)];
    }

    return [];
  }
}
