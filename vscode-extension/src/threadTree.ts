import * as vscode from 'vscode';
import type { DocumentThreadState } from './model.js';

type GroupKind = 'open' | 'resolved';

class GroupItem extends vscode.TreeItem {
  constructor(public readonly group: GroupKind, count: number) {
    super(group === 'open' ? `Open (${count})` : `Resolved (${count})`, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `mdCollab.group.${group}`;
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
      return [new GroupItem('open', openCount), new GroupItem('resolved', resolvedCount)];
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
