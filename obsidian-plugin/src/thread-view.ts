import { ItemView, WorkspaceLeaf, type Plugin } from 'obsidian';
import type { CommandAuthorConfig } from './intents.js';
import { IntentRouter } from './intent-router.js';
import { loadState, type DocumentThreadState } from './service.js';

export const THREADS_VIEW_TYPE = 'md-collab-threads';

export class ThreadPanelView extends ItemView {
  private readonly router = new IntentRouter();
  private state: DocumentThreadState | null = null;
  private author: CommandAuthorConfig = { authorId: 'unknown', authorLabel: 'Unknown' };

  constructor(leaf: WorkspaceLeaf, private readonly pluginRef: Plugin) {
    super(leaf);
  }

  getViewType(): string {
    return THREADS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Threads';
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  setAuthor(author: CommandAuthorConfig): void {
    this.author = author;
  }

  setDocument(path: string): void {
    this.state = loadState(path);
    this.render();
  }

  applyReload(): void {
    if (!this.state) return;
    this.state = this.router.handle({ kind: 'reload' }, { state: this.state, author: this.author });
    this.render();
  }

  private render(): void {
    const root = this.containerEl.children[1];
    root.empty();

    const title = root.createEl('h3', { text: 'md-collab Threads' });
    title.setAttr('aria-label', 'Thread panel title');

    if (!this.state) {
      root.createEl('p', { text: 'Open a markdown note and run “md-collab: Open Threads Panel”.' });
      return;
    }

    const open = this.state.sidecar.threads.filter((t) => t.status === 'open');
    const resolved = this.state.sidecar.threads.filter((t) => t.status === 'resolved');
    root.createEl('p', { text: `Open (${open.length})` });
    for (const thread of open) {
      const row = root.createDiv({ cls: 'md-collab-thread-row' });
      row.createEl('strong', { text: thread.messages[0]?.body.slice(0, 120) ?? '(no message)' });
      row.createEl('small', { text: ` · ${thread.messages.length} message(s)` });
    }

    root.createEl('p', { text: `Resolved (${resolved.length})` });
    for (const thread of resolved) {
      const row = root.createDiv({ cls: 'md-collab-thread-row' });
      row.createEl('strong', { text: thread.messages[0]?.body.slice(0, 120) ?? '(no message)' });
      row.createEl('small', { text: ' · resolved' });
    }
  }
}
