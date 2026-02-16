import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { normalizeSelection } from './selection.js';
import { IntentRouter } from './intent-router.js';
import { loadState } from './service.js';
import { ThreadPanelView, THREADS_VIEW_TYPE } from './thread-view.js';
import type { CommandAuthorConfig } from './intents.js';

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
    const state = loadState(active.file.path);
    this.router.handle({ kind: 'reload' }, { state, author: this.author() });
    new Notice('md-collab sidecar reloaded');
  }

  private async addCommentFromSelection(file: TFile, fullText: string, from: { line: number; ch: number }, to: { line: number; ch: number }): Promise<void> {
    const body = 'New comment';
    const offsets = normalizeSelection(fullText, from, to);
    const state = loadState(file.path);
    this.router.handle(
      { kind: 'add-comment-from-selection', body, startOffsetUtf16: offsets.startOffsetUtf16, endOffsetUtf16: offsets.endOffsetUtf16 },
      { state, author: this.author() },
    );
    new Notice('md-collab comment added');
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
}
