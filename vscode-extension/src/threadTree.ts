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
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = `mdCollab.thread.${status}`;
    this.description = threadId.slice(0, 8);
    this.command = { command: 'mdCollab.replyToThread', title: 'Reply', arguments: [threadId] };
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

    return [];
  }
}
