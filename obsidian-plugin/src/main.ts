import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { normalizeSelection } from './selection.js';
import { IntentRouter } from './intent-router.js';
import { SidecarConflictError, loadState, type DocumentThreadState } from './service.js';
import { ThreadPanelView, THREADS_VIEW_TYPE } from './thread-view.js';
import type { CommandAuthorConfig, ThreadIntent } from './intents.js';

interface MdCollabObsidianSettings {
  authorId: string;
  authorLabel: string;
}

const DEFAULT_SETTINGS: MdCollabObsidianSettings = {
  authorId: '',
  authorLabel: '',
};

export default class MdCollabObsidianPlugin extends Plugin {
  settings: MdCollabObsidianSettings = DEFAULT_SETTINGS;
  private readonly router = new IntentRouter();

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(THREADS_VIEW_TYPE, (leaf) => new ThreadPanelView(leaf, this));

    this.addCommand({
      id: 'open-threads-panel',
      name: 'md-collab: Open Threads Panel',
      checkCallback: (checking) => {
        if (!checking) void this.openThreadPanel();
        return true;
      },
    });

    this.addCommand({
      id: 'add-comment-from-selection',
      name: 'md-collab: Add Comment from Selection',
      editorCheckCallback: (checking, editor, view) => {
        if (!view?.file) return false;
        const hasSelection = editor.somethingSelected();
        if (!checking && hasSelection) {
          void this.addCommentFromSelection(view.file, editor.getValue(), editor.getCursor('from'), editor.getCursor('to'));
        }
        return hasSelection;
      },
    });

    this.addCommand({
      id: 'reload-sidecar',
      name: 'md-collab: Reload Sidecar',
      checkCallback: (checking) => {
        if (!checking) void this.reloadCurrent();
        return true;
      },
    });

    this.addCommand({
      id: 'reply-to-thread',
      name: 'md-collab: Reply to First Open Thread',
      checkCallback: (checking) => this.withFirstThread(checking, 'open', async (state, threadId) => {
        await this.runIntent(state.documentPath, { kind: 'reply', threadId, body: 'Reply from Obsidian' }, 'md-collab reply added');
      }),
    });

    this.addCommand({
      id: 'resolve-thread',
      name: 'md-collab: Resolve First Open Thread',
      checkCallback: (checking) => this.withFirstThread(checking, 'open', async (state, threadId) => {
        await this.runIntent(state.documentPath, { kind: 'resolve', threadId }, 'md-collab thread resolved');
      }),
    });

    this.addCommand({
      id: 'reopen-thread',
      name: 'md-collab: Reopen First Resolved Thread',
      checkCallback: (checking) => this.withFirstThread(checking, 'resolved', async (state, threadId) => {
        await this.runIntent(state.documentPath, { kind: 'reopen', threadId }, 'md-collab thread reopened');
      }),
    });

    this.addCommand({
      id: 'suggest-from-selection',
      name: 'md-collab: Suggest from Selection on First Open Thread',
      editorCheckCallback: (checking, editor, view) => {
        if (!view?.file || !editor.somethingSelected()) return false;
        if (!checking) {
          const state = loadState(view.file.path);
          const thread = state.sidecar.threads.find((t) => t.status === 'open');
          if (!thread) {
            new Notice('md-collab: no open thread available');
            return true;
          }
          const offsets = normalizeSelection(editor.getValue(), editor.getCursor('from'), editor.getCursor('to'));
          const selected = editor.getValue().slice(offsets.startOffsetUtf16, offsets.endOffsetUtf16);
          void this.runIntent(
            view.file.path,
            { kind: 'propose-suggestion', threadId: thread.thread_id, beforeText: selected, replacementText: selected },
            'md-collab suggestion proposed',
          );
        }
        return true;
      },
    });

    this.addCommand({
      id: 'apply-first-proposed-suggestion',
      name: 'md-collab: Apply First Proposed Suggestion',
      checkCallback: (checking) => {
        const resolved = this.resolveFirstProposedSuggestion();
        if (!resolved) return false;
        if (!checking) {
          void this.runIntent(
            resolved.state.documentPath,
            { kind: 'apply-suggestion', threadId: resolved.threadId, suggestionId: resolved.suggestionId, beforeText: resolved.beforeText },
            'md-collab suggestion applied',
          );
        }
        return true;
      },
    });

    this.addCommand({
      id: 'reject-first-proposed-suggestion',
      name: 'md-collab: Reject First Proposed Suggestion',
      checkCallback: (checking) => {
        const resolved = this.resolveFirstProposedSuggestion();
        if (!resolved) return false;
        if (!checking) {
          void this.runIntent(
            resolved.state.documentPath,
            { kind: 'reject-suggestion', threadId: resolved.threadId, suggestionId: resolved.suggestionId },
            'md-collab suggestion rejected',
          );
        }
        return true;
      },
    });

    this.addCommand({
      id: 'reanchor-all-threads',
      name: 'md-collab: Reanchor Threads',
      checkCallback: (checking) => {
        const active = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!active?.file) return false;
        if (!checking) {
          void this.runIntent(active.file.path, { kind: 'reanchor' }, 'md-collab threads reanchored');
        }
        return true;
      },
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(THREADS_VIEW_TYPE);
  }

  private author(): CommandAuthorConfig {
    return {
      authorId: this.settings.authorId || 'obsidian-user',
      authorLabel: this.settings.authorLabel || 'Obsidian User',
    };
  }

  private async openThreadPanel(): Promise<void> {
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: THREADS_VIEW_TYPE, active: true });
    const view = leaf.view;
    if (view instanceof ThreadPanelView) {
      view.setAuthor(this.author());
      const active = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (active?.file) view.setDocument(active.file.path);
    }
  }

  private async reloadCurrent(): Promise<void> {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!active?.file) return;
    await this.runIntent(active.file.path, { kind: 'reload' }, 'md-collab sidecar reloaded');
  }

  private async addCommentFromSelection(file: TFile, fullText: string, from: { line: number; ch: number }, to: { line: number; ch: number }): Promise<void> {
    const body = 'New comment';
    const offsets = normalizeSelection(fullText, from, to);
    await this.runIntent(
      file.path,
      { kind: 'add-comment-from-selection', body, startOffsetUtf16: offsets.startOffsetUtf16, endOffsetUtf16: offsets.endOffsetUtf16 },
      'md-collab comment added',
    );
  }

  private async runIntent(documentPath: string, intent: ThreadIntent, successNotice: string): Promise<void> {
    const state = loadState(documentPath);
    try {
      this.router.handle(intent, { state, author: this.author() });
      new Notice(successNotice);
    } catch (error) {
      if (error instanceof SidecarConflictError) {
        new Notice('md-collab: sidecar conflict detected. Run “md-collab: Reload Sidecar” and retry.');
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown mutation error';
      new Notice(`md-collab mutation failed: ${message}. Run “md-collab: Reload Sidecar” and retry.`);
    }
  }

  private withFirstThread(
    checking: boolean,
    status: 'open' | 'resolved',
    execute: (state: DocumentThreadState, threadId: string) => Promise<void>,
  ): boolean {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!active?.file) return false;
    const state = loadState(active.file.path);
    const thread = state.sidecar.threads.find((t) => t.status === status);
    if (!thread) return false;
    if (!checking) void execute(state, thread.thread_id);
    return true;
  }

  private resolveFirstProposedSuggestion(): { state: DocumentThreadState; threadId: string; suggestionId: string; beforeText: string } | null {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!active?.file) return null;
    const state = loadState(active.file.path);
    for (const thread of state.sidecar.threads) {
      const suggestion = (thread.suggestions ?? []).find((s) => s.status === 'proposed');
      if (!suggestion) continue;
      const beforeText = thread.anchor.fallback.quote || '';
      return { state, threadId: thread.thread_id, suggestionId: suggestion.suggestion_id, beforeText };
    }
    return null;
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
}
