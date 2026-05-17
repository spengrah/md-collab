// App entry point. Wires picker → workspace open → tree + editor + panel.
// PR1 is strictly read-only: no file save, no thread CRUD, no relink.

import { ipc, type PersistedState } from './app/ipc.js';
import { IpcError } from './app/errors.js';
import { bootstrapWorkspace, createWorkspaceContext, startCountPolling } from './app/workspace.js';
import { pickWorkspaceDirectory } from './app/views/picker.js';
import { mountFileTree, type FileTreeHandle } from './components/file-tree/index.js';
import { mountEditor, type EditorHandle } from './components/editor/cm6.js';
import {
  mountSidecarErrorBanner,
  type SidecarErrorBannerHandle,
} from './components/editor/sidecar-error-banner.js';
import { mountThreadPanel, type ThreadPanelHandle, type ThreadPanelRow } from './components/thread-panel/index.js';
import type { ThreadDecorationInput } from './components/editor/decorations.js';
import { parseSidecar, reanchor, type Anchor, type Thread } from './app/core.js';

async function main() {
  const settings: PersistedState = await ipc.settingsLoad();

  // Apply the persisted theme choice to <html>. Default `auto`.
  document.documentElement.dataset.theme = settings.settings.ui_theme ?? 'auto';

  const ctx = createWorkspaceContext(settings);

  // Build the static shell.
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('#app root missing');

  const header = document.createElement('header');
  header.className = 'mdc-header';
  const banner = document.createElement('span');
  banner.className = 'mdc-header-banner';
  banner.textContent = 'Read-only preview. Editing and relink land in the next slice.';
  header.appendChild(banner);

  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'mdc-pick-button';
  pickBtn.textContent = 'Open workspace…';
  pickBtn.addEventListener('click', async () => {
    const picked = await pickWorkspaceDirectory();
    if (!picked) return;
    try {
      const state = await ipc.workspaceOpen(picked);
      ctx.state.set(state);
      ctx.counts.set(state.thread_counts);
      rerenderTree();
    } catch (err) {
      console.error('failed to open workspace', err);
      alert(err instanceof IpcError ? err.message : String(err));
    }
  });
  header.appendChild(pickBtn);
  app.appendChild(header);

  const treePane = document.createElement('div');
  treePane.className = 'mdc-tree-pane';
  app.appendChild(treePane);

  const editorPane = document.createElement('div');
  editorPane.className = 'mdc-editor-pane';
  const editorEmpty = document.createElement('div');
  editorEmpty.className = 'mdc-empty';
  editorEmpty.textContent = 'Pick a workspace, then select a Markdown file.';
  editorPane.appendChild(editorEmpty);
  app.appendChild(editorPane);

  const panelPane = document.createElement('div');
  panelPane.className = 'mdc-panel-pane';
  app.appendChild(panelPane);

  let treeHandle: FileTreeHandle | null = null;
  let editorHandle: EditorHandle | null = null;
  let bannerHandle: SidecarErrorBannerHandle | null = null;
  let panelHandle: ThreadPanelHandle | null = null;

  const teardownEditorPane = () => {
    editorHandle?.destroy();
    editorHandle = null;
    bannerHandle?.destroy();
    bannerHandle = null;
    editorPane.innerHTML = '';
  };

  const teardownPanelPane = () => {
    panelHandle?.destroy();
    panelHandle = null;
    panelPane.innerHTML = '';
  };

  const rerenderTree = () => {
    treeHandle?.destroy();
    treeHandle = null;
    treePane.innerHTML = '';

    const state = ctx.state.get();
    if (!state) {
      const empty = document.createElement('div');
      empty.className = 'mdc-empty';
      empty.textContent = 'No workspace open.';
      treePane.appendChild(empty);
      return;
    }

    treeHandle = mountFileTree({
      container: treePane,
      paths: state.files,
      counts: ctx.counts,
      onSelect: (path) => openFile(path),
      theme: resolveTheme(settings),
    });
  };

  const openFile = async (relPath: string) => {
    teardownEditorPane();
    teardownPanelPane();
    ctx.currentFile.set(relPath);

    let docText: string;
    try {
      docText = await ipc.fsReadFile(relPath);
    } catch (err) {
      editorPane.innerHTML = '';
      const fail = document.createElement('div');
      fail.className = 'mdc-empty';
      fail.textContent = `Failed to read ${relPath}: ${(err as Error).message}`;
      editorPane.appendChild(fail);
      return;
    }

    let sidecarThreads: Thread[] = [];
    let sidecarError: string | null = null;
    let sidecarRelPath: string | null = null;

    try {
      const sidecarRead = await ipc.fsReadSidecar(relPath);
      if (sidecarRead) {
        sidecarRelPath = `${relPath}.comments.json`;
        try {
          const sidecar = parseSidecar(sidecarRead.contents);
          sidecarThreads = sidecar.threads;
        } catch (err) {
          sidecarError = err instanceof Error ? err.message : String(err);
        }
      }
    } catch (err) {
      console.warn('sidecar read failed', err);
    }

    // Compute decoration inputs by reanchoring each thread.
    const decoInputs: ThreadDecorationInput[] = [];
    const panelRows: ThreadPanelRow[] = [];
    for (const thread of sidecarThreads) {
      const reanchorOnOpen = settings.settings.reanchor_on_open ?? true;
      let start: number;
      let end: number;
      let confidence = thread.anchor.anchor_confidence;
      if (reanchorOnOpen) {
        const result = reanchor(docText, thread.anchor as Anchor);
        confidence = result.anchor_confidence;
        start = result.start?.offset_utf16 ?? thread.anchor.primary.start.offset_utf16;
        end = result.end?.offset_utf16 ?? thread.anchor.primary.end.offset_utf16;
      } else {
        start = thread.anchor.primary.start.offset_utf16;
        end = thread.anchor.primary.end.offset_utf16;
      }

      decoInputs.push({
        thread_id: thread.thread_id,
        status: thread.status,
        start_offset: start,
        end_offset: end + 1, // engine returns inclusive end; CM6 mark wants exclusive
        anchor_confidence: confidence,
      });

      const firstMessage = thread.messages?.[0]?.body ?? '';
      const excerpt = truncate(firstMessage, 80) || '(no message)';
      panelRows.push({
        thread_id: thread.thread_id,
        status: thread.status,
        anchor_confidence: confidence,
        excerpt,
        start_offset: confidence === 'broken' ? null : start,
      });
    }

    editorPane.innerHTML = '';
    if (sidecarError && sidecarRelPath) {
      bannerHandle = mountSidecarErrorBanner({
        parent: editorPane,
        sidecarRelPath,
        errorMessage: sidecarError,
        onReload: () => openFile(relPath),
      });
    }

    editorHandle = mountEditor({
      parent: editorPane,
      docText,
      threads: decoInputs,
    });

    panelHandle = mountThreadPanel({
      parent: panelPane,
      rows: panelRows,
      onScrollTo: (offset) => editorHandle?.scrollTo(offset),
      resolvedInitiallyExpanded: settings.settings.show_resolved_inline ?? false,
    });
  };

  // Cmd+P → tree search. Pierre Trees handles ↑/↓/Enter once open.
  window.addEventListener('keydown', (e) => {
    if (e.metaKey && e.key === 'p') {
      e.preventDefault();
      treeHandle?.openSearch();
    }
  });

  // Light/dark detection: if ui_theme === 'auto', follow system preference.
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const reapplyTheme = () => {
    const choice = settings.settings.ui_theme ?? 'auto';
    document.documentElement.dataset.theme = choice;
    if (treeHandle) treeHandle.setTheme(resolveTheme(settings));
  };
  mql.addEventListener('change', reapplyTheme);

  rerenderTree();

  await bootstrapWorkspace(ctx, {
    pickIfMissing: pickWorkspaceDirectory,
  });
  rerenderTree();

  // Start the polling loop for badge counts.
  startCountPolling(
    ctx,
    settings.settings.sidecar_poll_interval_ms ?? 3000,
    500
  );
}

function resolveTheme(settings: PersistedState) {
  const choice = settings.settings.ui_theme ?? 'auto';
  const dark = choice === 'dark' || (choice === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  // Pierre Trees `TreeThemeInput` accepts a partial theme object — we let it
  // pull the rest from defaults. The exact shape isn't load-bearing for PR1.
  return (dark ? { kind: 'dark' as const } : { kind: 'light' as const }) as unknown as Parameters<typeof import('@pierre/trees').themeToTreeStyles>[0];
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}

main().catch((err) => {
  console.error('app boot failure', err);
});
