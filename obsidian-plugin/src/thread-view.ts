import { ItemView, MarkdownView, Notice, WorkspaceLeaf, type Plugin } from 'obsidian';
import { normalizeSelection } from './selection.js';
import type { CommandAuthorConfig } from './intents.js';
import { IntentRouter } from './intent-router.js';
import { SidecarConflictError, loadState, type DocumentThreadState } from './service.js';
import { buildThreadPanelSnapshot } from './thread-view-model.js';

export const THREADS_VIEW_TYPE = 'md-collab-threads';

export class ThreadPanelView extends ItemView {
  private readonly router = new IntentRouter();
  private state: DocumentThreadState | null = null;
  private author: CommandAuthorConfig = { authorId: 'unknown', authorLabel: 'Unknown' };
  private readonly expandedThreadIds = new Set<string>();
  private recoveryMessage: string | null = null;

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
    this.recoveryMessage = null;
    this.render();
  }

  applyReload(): void {
    if (!this.state) return;
    this.safeMutate({ kind: 'reload' }, 'Reloaded sidecar');
  }

  private safeMutate(intent: Parameters<IntentRouter['handle']>[0], successNotice?: string): void {
    if (!this.state) return;
    try {
      this.state = this.router.handle(intent, { state: this.state, author: this.author });
      this.recoveryMessage = null;
      if (successNotice) new Notice(`md-collab: ${successNotice}`);
      this.render();
    } catch (error) {
      if (error instanceof SidecarConflictError) {
        this.recoveryMessage = 'Sidecar conflict detected. Reload to recover before retrying.';
      } else {
        const message = error instanceof Error ? error.message : 'Unknown mutation error';
        this.recoveryMessage = `Mutation failed: ${message}`;
      }
      this.render();
    }
  }

  private toggleExpanded(threadId: string): void {
    if (this.expandedThreadIds.has(threadId)) {
      this.expandedThreadIds.delete(threadId);
    } else {
      this.expandedThreadIds.add(threadId);
    }
    this.render();
  }

  private jumpToAnchor(threadId: string): void {
    if (!this.state) return;
    const thread = this.state.sidecar.threads.find((t) => t.thread_id === threadId);
    if (!thread) return;

    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView?.file || markdownView.file.path !== this.state.documentPath) {
      new Notice(`md-collab anchor: line ${thread.anchor.primary.start.line}, column ${thread.anchor.primary.start.column}`);
      return;
    }

    const editor = markdownView.editor;
    editor.focus();
    editor.setCursor({ line: Math.max(thread.anchor.primary.start.line - 1, 0), ch: Math.max(thread.anchor.primary.start.column - 1, 0) });
  }

  private suggestFromSelection(threadId: string): void {
    if (!this.state) return;
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView?.file || markdownView.file.path !== this.state.documentPath) {
      this.recoveryMessage = 'Select text in the active note, then retry Suggest from selection.';
      this.render();
      return;
    }

    const editor = markdownView.editor;
    if (!editor.somethingSelected()) {
      this.recoveryMessage = 'No selection found. Select text first, then retry Suggest from selection.';
      this.render();
      return;
    }

    const offsets = normalizeSelection(editor.getValue(), editor.getCursor('from'), editor.getCursor('to'));
    const selected = editor.getValue().slice(offsets.startOffsetUtf16, offsets.endOffsetUtf16);
    this.safeMutate({ kind: 'propose-suggestion', threadId, beforeText: selected, replacementText: selected }, 'Suggestion proposed');
  }

  private render(): void {
    const root = this.containerEl.children[1];
    root.empty();

    const snapshot = buildThreadPanelSnapshot(this.state, this.expandedThreadIds, this.recoveryMessage);

    const title = root.createEl('h3', { text: 'md-collab Threads' });
    title.setAttr('aria-label', 'Thread panel title');

    if (snapshot.hasRecovery && snapshot.recoveryMessage) {
      const recovery = root.createDiv({ cls: 'md-collab-recovery' });
      recovery.setAttr('role', 'alert');
      recovery.createEl('p', { text: snapshot.recoveryMessage, cls: 'md-collab-state-label' });
      const reloadButton = recovery.createEl('button', { text: 'Reload', cls: 'md-collab-button md-collab-focus-visible' });
      reloadButton.setAttr('aria-label', 'Reload sidecar after failure');
      reloadButton.onclick = () => this.applyReload();
    }

    if (!this.state) {
      root.createEl('p', { text: 'Open a markdown note and run “md-collab: Open Threads Panel”.' });
      return;
    }

    const renderThreadGroup = (label: 'Open' | 'Resolved', status: 'open' | 'resolved'): void => {
      const section = root.createDiv({ cls: 'md-collab-thread-group' });
      section.setAttr('aria-label', `${label} threads`);
      section.createEl('p', {
        text: `${label} (${status === 'open' ? snapshot.openCount : snapshot.resolvedCount})`,
        cls: 'md-collab-state-label',
      });

      for (const thread of this.state!.sidecar.threads.filter((candidate) => candidate.status === status)) {
        const isExpanded = this.expandedThreadIds.has(thread.thread_id);
        const card = section.createDiv({ cls: 'md-collab-thread-card' });
        card.setAttr('aria-label', `Thread ${thread.thread_id} ${thread.status}`);

        const heading = card.createDiv({ cls: 'md-collab-thread-heading' });
        const toggle = heading.createEl('button', {
          text: `${isExpanded ? '▾' : '▸'} ${thread.messages[0]?.body.slice(0, 100) ?? '(no message)'}`,
          cls: 'md-collab-thread-toggle md-collab-focus-visible',
        });
        toggle.setAttr('aria-expanded', isExpanded ? 'true' : 'false');
        toggle.setAttr('aria-label', `Toggle thread ${thread.thread_id}`);
        toggle.onclick = () => this.toggleExpanded(thread.thread_id);

        heading.createEl('small', { text: ` ${thread.status.toUpperCase()} · ${thread.messages.length} message(s)` });

        if (!isExpanded) continue;

        const actions = card.createDiv({ cls: 'md-collab-thread-actions' });
        const mkButton = (labelText: string, onClick: () => void, ariaLabel: string): void => {
          const button = actions.createEl('button', { text: labelText, cls: 'md-collab-button md-collab-focus-visible' });
          button.setAttr('aria-label', ariaLabel);
          button.onclick = onClick;
        };

        mkButton('Reply', () => this.safeMutate({ kind: 'reply', threadId: thread.thread_id, body: 'Reply from thread panel' }, 'Reply added'), `Reply to thread ${thread.thread_id}`);
        mkButton(thread.status === 'open' ? 'Resolve' : 'Reopen', () => this.safeMutate({ kind: thread.status === 'open' ? 'resolve' : 'reopen', threadId: thread.thread_id }, 'Thread updated'), `${thread.status === 'open' ? 'Resolve' : 'Reopen'} thread ${thread.thread_id}`);
        mkButton('Suggest from selection', () => this.suggestFromSelection(thread.thread_id), `Suggest from selected text for thread ${thread.thread_id}`);
        mkButton('Jump to anchor', () => this.jumpToAnchor(thread.thread_id), `Jump to anchor for thread ${thread.thread_id}`);

        const messages = card.createDiv({ cls: 'md-collab-thread-messages' });
        for (const message of thread.messages) {
          const bubble = messages.createDiv({ cls: 'md-collab-message-bubble' });
          bubble.setAttr('tabindex', '0');
          bubble.addClass('md-collab-focus-visible');
          bubble.createEl('strong', { text: message.author.author_label || message.author.author_id });
          bubble.createEl('small', { text: ` · ${new Date(message.created_at).toLocaleString()}` });
          bubble.createEl('p', { text: message.body });
        }

        const suggestions = card.createDiv({ cls: 'md-collab-thread-suggestions' });
        suggestions.createEl('p', { text: 'Suggestions', cls: 'md-collab-state-label' });
        for (const suggestion of thread.suggestions ?? []) {
          const suggestionCard = suggestions.createDiv({ cls: 'md-collab-suggestion-card' });
          suggestionCard.setAttr('tabindex', '0');
          suggestionCard.addClass('md-collab-focus-visible');
          suggestionCard.createEl('p', { text: `Status: ${suggestion.status}` });
          suggestionCard.createEl('code', { text: suggestion.proposed_edit.replacement_text });

          const suggestionActions = suggestionCard.createDiv({ cls: 'md-collab-suggestion-actions' });
          const applyBtn = suggestionActions.createEl('button', { text: 'Apply', cls: 'md-collab-button md-collab-focus-visible' });
          applyBtn.setAttr('aria-label', `Apply suggestion ${suggestion.suggestion_id}`);
          applyBtn.onclick = () =>
            this.safeMutate(
              { kind: 'apply-suggestion', threadId: thread.thread_id, suggestionId: suggestion.suggestion_id, beforeText: thread.anchor.fallback.quote || '' },
              'Suggestion apply attempted',
            );

          const rejectBtn = suggestionActions.createEl('button', { text: 'Reject', cls: 'md-collab-button md-collab-focus-visible' });
          rejectBtn.setAttr('aria-label', `Reject suggestion ${suggestion.suggestion_id}`);
          rejectBtn.onclick = () => this.safeMutate({ kind: 'reject-suggestion', threadId: thread.thread_id, suggestionId: suggestion.suggestion_id }, 'Suggestion rejected');

          const baseContextBtn = suggestionActions.createEl('button', { text: 'View base context', cls: 'md-collab-button md-collab-focus-visible' });
          baseContextBtn.setAttr('aria-label', `View base context for suggestion ${suggestion.suggestion_id}`);
          baseContextBtn.onclick = () => new Notice(`Base context hash: ${suggestion.proposed_edit.before_text_hash}`);
        }
      }
    };

    renderThreadGroup('Open', 'open');
    renderThreadGroup('Resolved', 'resolved');
  }
}
