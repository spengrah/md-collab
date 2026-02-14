import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  SidecarConflictError,
  addComment,
  addReply,
  loadStateForDocument,
  reanchorAll,
  reloadState,
  reopen,
  resolve,
  visibleInlineThreads,
  timelineBadge,
  proposeThreadSuggestion,
  applyThreadSuggestion,
  rejectThreadSuggestion,
  type Config,
  type DocumentThreadState,
} from './model.js';
import { ThreadTreeProvider } from './threadTree.js';
import { MdCollabError } from '../vendor/core/index.js';

const stateByDocument = new Map<string, DocumentThreadState>();
let activeSidecarWatcher: vscode.FileSystemWatcher | undefined;
let lastActiveMarkdownDocumentKey: string | undefined;

const getConfig = (): Config => {
  const config = vscode.workspace.getConfiguration('mdCollab');
  return {
    authorId: config.get<string>('authorId', '').trim(),
    authorLabel: config.get<string>('authorLabel', '').trim(),
    showResolvedInline: config.get<boolean>('showResolvedInline', false),
    reanchorOnSave: config.get<boolean>('reanchorOnSave', true),
    workspaceSnapshotId: config.get<string>('workspaceSnapshotId', '').trim() || undefined,
    timelineKind: config.get<'workspace' | 'git' | 'hybrid'>('timelineKind', 'workspace'),
  };
};

const requireAuthor = (config: Config): boolean => {
  if (!config.authorId || !config.authorLabel) {
    vscode.window.showErrorMessage('md-collab: Set mdCollab.authorId and mdCollab.authorLabel before writing comments.');
    return false;
  }
  return true;
};

const explainMutationError = (err: unknown) => {
  if (err instanceof SidecarConflictError) {
    void vscode.window.showWarningMessage('md-collab: Sidecar changed externally. Run “md-collab: Reload Sidecar” and retry.');
    return;
  }

  if (err instanceof MdCollabError) {
    if (err.code === 'AUTHOR_INVALID') {
      void vscode.window.showErrorMessage(
        'md-collab: Your author identity is invalid for this action. Update mdCollab.authorId/authorLabel and try again.',
      );
      return;
    }

    if (err.code === 'ID_CONFLICT') {
      void vscode.window.showErrorMessage(
        'md-collab: Comment ID conflict detected. Re-run the action; if this persists, reanchor and retry.',
      );
      return;
    }

    void vscode.window.showErrorMessage(`md-collab: ${err.message}`);
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  void vscode.window.showErrorMessage(`md-collab: ${message}`);
};

const loadForEditor = (editor: vscode.TextEditor | undefined): DocumentThreadState | undefined => {
  if (!editor || editor.document.languageId !== 'markdown') return undefined;

  const key = editor.document.uri.toString();
  const existing = stateByDocument.get(key);
  if (existing) return existing;

  const loaded = loadStateForDocument(editor.document.uri.fsPath);
  stateByDocument.set(key, loaded);

  if (loaded.readOnly) {
    vscode.window
      .showWarningMessage(
        'md-collab: Sidecar is malformed; file is in read-only comment mode.',
        'Open sidecar to repair manually',
      )
      .then((choice) => {
        if (choice) {
          void vscode.commands.executeCommand('mdCollab.openSidecarForRepair');
        }
      });
  }

  return loaded;
};

const threadIdFromArgOrPick = async (
  state: DocumentThreadState,
  status: 'open' | 'resolved' | 'any',
  arg?: string,
): Promise<string | undefined> => {
  if (arg) return arg;

  const threads = state.sidecar.threads.filter((t) => status === 'any' || t.status === status);
  const pick = await vscode.window.showQuickPick(
    threads.map((thread) => {
      const latest = thread.messages[thread.messages.length - 1];
      return {
        label: latest?.body?.slice(0, 60).replace(/\s+/g, ' ') || thread.thread_id,
        description: thread.thread_id,
      };
    }),
    { placeHolder: 'Select a thread' },
  );

  return pick?.description;
};

const toRange = (thread: DocumentThreadState['sidecar']['threads'][number]): vscode.Range | undefined => {
  const start = thread.anchor.primary.start;
  if (!start) return undefined;

  const end = thread.anchor.primary.end ?? start;
  return new vscode.Range(
    new vscode.Position(Math.max(0, start.line - 1), Math.max(0, start.column - 1)),
    new vscode.Position(Math.max(0, end.line - 1), Math.max(0, end.column - 1)),
  );
};

const applyDecorations = (
  editor: vscode.TextEditor | undefined,
  threadTree: ThreadTreeProvider,
  decorationMap: Map<string, vscode.TextEditorDecorationType>,
) => {
  if (!editor || editor.document.languageId !== 'markdown') {
    threadTree.setState(undefined);
    return;
  }
  const state = loadForEditor(editor);
  threadTree.setState(state);
  if (!state) return;

  const config = getConfig();
  for (const decorationType of decorationMap.values()) {
    editor.setDecorations(decorationType, []);
  }

  const buckets: Record<string, vscode.DecorationOptions[]> = {
    high: [],
    medium: [],
    low: [],
    broken: [],
  };

  for (const thread of visibleInlineThreads(state, config.showResolvedInline)) {
    if (thread.anchor.anchor_confidence === 'broken' || !thread.anchor.primary.start || !thread.anchor.primary.end) {
      buckets.broken.push({
        range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
        hoverMessage: `$(warning) Broken anchor for thread ${thread.thread_id}. Use reanchor command.`,
      });
      continue;
    }

    const start = thread.anchor.primary.start;
    const range = new vscode.Range(
      new vscode.Position(Math.max(0, start.line - 1), Math.max(0, start.column - 1)),
      new vscode.Position(Math.max(0, start.line - 1), Math.max(0, start.column - 1)),
    );
    const relevance = thread.relevance_state ?? 'active';
    const timeline = timelineBadge(thread.thread_version_context?.kind);
    buckets[thread.anchor.anchor_confidence].push({
      range,
      hoverMessage: `md-collab thread ${thread.thread_id} (${thread.anchor.anchor_confidence})\nrelevance: ${relevance}\ntimeline: ${timeline}`,
      renderOptions: {
        after: {
          contentText: ` 💬 ${relevance} · ${timeline}`,
        },
      },
    });
  }

  editor.setDecorations(decorationMap.get('high')!, buckets.high);
  editor.setDecorations(decorationMap.get('medium')!, buckets.medium);
  editor.setDecorations(decorationMap.get('low')!, buckets.low);
  editor.setDecorations(decorationMap.get('broken')!, buckets.broken);
};

export function activate(context: vscode.ExtensionContext) {
  const threadTree = new ThreadTreeProvider();
  vscode.window.registerTreeDataProvider('mdCollab.threads', threadTree);

  const transientNavigateDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    border: '1px solid',
    borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
  });

  const decorationMap = new Map<string, vscode.TextEditorDecorationType>([
    [
      'high',
      vscode.window.createTextEditorDecorationType({
        overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
      }),
    ],
    [
      'medium',
      vscode.window.createTextEditorDecorationType({
        overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
      }),
    ],
    [
      'low',
      vscode.window.createTextEditorDecorationType({
        overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
        opacity: '0.75',
      }),
    ],
    [
      'broken',
      vscode.window.createTextEditorDecorationType({
        overviewRulerColor: new vscode.ThemeColor('editorError.foreground'),
      }),
    ],
  ]);

  context.subscriptions.push(transientNavigateDecoration, ...decorationMap.values());

  const refresh = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId === 'markdown') {
      lastActiveMarkdownDocumentKey = editor.document.uri.toString();
    }
    applyDecorations(editor, threadTree, decorationMap);
  };

  const setActiveSidecarWatcher = (editor: vscode.TextEditor | undefined) => {
    activeSidecarWatcher?.dispose();
    activeSidecarWatcher = undefined;

    if (!editor || editor.document.languageId !== 'markdown') return;

    const sidecarPath = editor.document.uri.fsPath.replace(/\.md$/i, '.comments.json');
    const pattern = new vscode.RelativePattern(path.dirname(sidecarPath), path.basename(sidecarPath));
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const reloadFromDisk = () => {
      const key = editor.document.uri.toString();
      const current = stateByDocument.get(key);
      const next = current ? reloadState(current, getConfig()) : loadStateForDocument(editor.document.uri.fsPath);
      stateByDocument.set(key, next);
      refresh();
    };

    watcher.onDidChange(reloadFromDisk);
    watcher.onDidCreate(reloadFromDisk);
    watcher.onDidDelete(reloadFromDisk);

    context.subscriptions.push(watcher);
    activeSidecarWatcher = watcher;
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId !== 'markdown') return;
      const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === doc.uri.toString());
      if (!editor) return;
      const state = loadForEditor(editor);
      if (state && !state.readOnly) {
        const reanchored = reanchorAll(state, doc.getText(), getConfig());
        stateByDocument.set(doc.uri.toString(), reanchored);
      }
      refresh();
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId !== 'markdown') return;
      const config = getConfig();
      if (!config.reanchorOnSave) return;
      const key = doc.uri.toString();
      const prior = stateByDocument.get(key) ?? loadStateForDocument(doc.uri.fsPath);
      if (prior.readOnly) return;
      const reanchored = reanchorAll(prior, doc.getText(), config);
      stateByDocument.set(key, reanchored);
      refresh();
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      setActiveSidecarWatcher(editor);
      refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdCollab.addComment', async () => {
      const editor = vscode.window.activeTextEditor;
      const state = loadForEditor(editor);
      if (!editor || !state) return;
      if (state.readOnly) {
        vscode.window.showWarningMessage('md-collab: comment writes disabled due to malformed sidecar.');
        return;
      }
      const config = getConfig();
      if (!requireAuthor(config)) return;
      if (editor.selection.isEmpty) {
        vscode.window.showInformationMessage('md-collab: select text before adding a comment.');
        return;
      }
      const body = await vscode.window.showInputBox({ prompt: 'Comment text' });
      if (!body) return;

      try {
        const startOffset = editor.document.offsetAt(editor.selection.start);
        const endOffset = editor.document.offsetAt(editor.selection.end);
        const next = addComment(state, editor.document.getText(), startOffset, endOffset, body, config);
        stateByDocument.set(editor.document.uri.toString(), next);
        refresh();
      } catch (err) {
        explainMutationError(err);
      }
    }),

    vscode.commands.registerCommand('mdCollab.replyToThread', async (argThreadId?: string) => {
      const editor = vscode.window.activeTextEditor;
      const state = loadForEditor(editor);
      if (!editor || !state) return;
      if (state.readOnly) return;
      const config = getConfig();
      if (!requireAuthor(config)) return;

      const threadId = await threadIdFromArgOrPick(state, 'any', argThreadId);
      if (!threadId) return;
      const body = await vscode.window.showInputBox({ prompt: 'Reply text' });
      if (!body) return;

      try {
        const next = addReply(state, threadId, body, config);
        stateByDocument.set(editor.document.uri.toString(), next);
        refresh();
      } catch (err) {
        explainMutationError(err);
      }
    }),

    vscode.commands.registerCommand('mdCollab.navigateToThread', async (argThreadId?: string) => {
      if (!argThreadId) return;

      const activeEditor = vscode.window.activeTextEditor;
      const key =
        activeEditor?.document.languageId === 'markdown' ? activeEditor.document.uri.toString() : lastActiveMarkdownDocumentKey;
      if (!key) return;

      let state = stateByDocument.get(key);
      const targetUri = vscode.Uri.parse(key);
      if (!state) {
        state = loadStateForDocument(targetUri.fsPath);
        stateByDocument.set(key, state);
      }

      const thread = state.sidecar.threads.find((candidate) => candidate.thread_id === argThreadId);
      if (!thread) {
        void vscode.window.showWarningMessage('md-collab: Thread no longer exists in sidecar. Reload and try again.');
        return;
      }

      const range = toRange(thread);
      if (!range) {
        void vscode.window.showWarningMessage(
          'md-collab: Cannot navigate this thread because no anchor location is available. Reanchor and retry.',
        );
        return;
      }

      const doc = await vscode.workspace.openTextDocument(targetUri);
      const shown = await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
      shown.selection = new vscode.Selection(range.start, range.start);
      shown.revealRange(range, vscode.TextEditorRevealType.InCenter);
      shown.setDecorations(transientNavigateDecoration, [range]);
      setTimeout(() => shown.setDecorations(transientNavigateDecoration, []), 1200);

      if (thread.anchor.anchor_confidence === 'broken') {
        void vscode.window.showWarningMessage(
          'md-collab: Anchor is broken. Jumped to the last known location; reanchor may be needed.',
        );
      }
    }),

    vscode.commands.registerCommand('mdCollab.resolveThread', async (argThreadId?: string) => {
      const editor = vscode.window.activeTextEditor;
      const state = loadForEditor(editor);
      if (!editor || !state || state.readOnly) return;
      const config = getConfig();
      if (!requireAuthor(config)) return;
      const threadId = await threadIdFromArgOrPick(state, 'open', argThreadId);
      if (!threadId) return;
      try {
        const next = resolve(state, threadId, config);
        stateByDocument.set(editor.document.uri.toString(), next);
        refresh();
      } catch (err) {
        explainMutationError(err);
      }
    }),

    vscode.commands.registerCommand('mdCollab.reopenThread', async (argThreadId?: string) => {
      const editor = vscode.window.activeTextEditor;
      const state = loadForEditor(editor);
      if (!editor || !state || state.readOnly) return;
      const config = getConfig();
      if (!requireAuthor(config)) return;
      const threadId = await threadIdFromArgOrPick(state, 'resolved', argThreadId);
      if (!threadId) return;
      try {
        const next = reopen(state, threadId, config);
        stateByDocument.set(editor.document.uri.toString(), next);
        refresh();
      } catch (err) {
        explainMutationError(err);
      }
    }),

    vscode.commands.registerCommand('mdCollab.reanchorCurrentFile', async () => {
      const editor = vscode.window.activeTextEditor;
      const state = loadForEditor(editor);
      if (!editor || !state || state.readOnly) return;
      const next = reanchorAll(state, editor.document.getText(), getConfig());
      stateByDocument.set(editor.document.uri.toString(), next);
      refresh();
    }),

    vscode.commands.registerCommand('mdCollab.reloadSidecar', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') return;
      const key = editor.document.uri.toString();
      const prior = stateByDocument.get(key);
      const next = prior ? reloadState(prior, getConfig()) : loadStateForDocument(editor.document.uri.fsPath);
      stateByDocument.set(key, next);
      refresh();
      void vscode.window.showInformationMessage('md-collab: Sidecar reloaded from disk.');
    }),

    vscode.commands.registerCommand('mdCollab.openThreadPanel', async () => {
      await vscode.commands.executeCommand('mdCollab.threads.focus');
    }),

    vscode.commands.registerCommand('mdCollab.openSidecarForRepair', async () => {
      const editor = vscode.window.activeTextEditor;
      const state = loadForEditor(editor);
      if (!state) return;
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(state.sidecarPath));
      await vscode.window.showTextDocument(doc, { preview: false });
    }),

    vscode.commands.registerCommand('mdCollab.proposeSuggestion', async (argThreadId?: string) => {
      const editor = vscode.window.activeTextEditor;
      const state = loadForEditor(editor);
      if (!editor || !state || state.readOnly) return;
      const config = getConfig();
      if (!requireAuthor(config)) return;
      const threadId = await threadIdFromArgOrPick(state, 'any', argThreadId);
      if (!threadId || editor.selection.isEmpty) return;
      const replacement = await vscode.window.showInputBox({ prompt: 'Suggested replacement text' });
      if (replacement === undefined) return;
      const thread = state.sidecar.threads.find((t) => t.thread_id === threadId);
      if (!thread) return;
      const beforeText = editor.document.getText(editor.selection);
      const next = proposeThreadSuggestion(state, threadId, thread.anchor, beforeText, replacement, config);
      stateByDocument.set(editor.document.uri.toString(), next);
      refresh();
    }),

    vscode.commands.registerCommand('mdCollab.applySuggestion', async (argThreadId?: string, argSuggestionId?: string) => {
      const editor = vscode.window.activeTextEditor;
      const state = loadForEditor(editor);
      if (!editor || !state || state.readOnly) return;
      const config = getConfig();
      if (!requireAuthor(config)) return;
      const threadId = await threadIdFromArgOrPick(state, 'any', argThreadId);
      if (!threadId) return;
      const thread = state.sidecar.threads.find((t) => t.thread_id === threadId);
      const suggestions = (thread?.suggestions ?? []).filter((s) => s.status === 'proposed');
      if (!thread || suggestions.length === 0) return;
      const suggestionId =
        argSuggestionId ??
        (
          await vscode.window.showQuickPick(
            suggestions.map((s) => ({ label: s.suggestion_id, description: s.proposed_edit.replacement_text.slice(0, 60) })),
          )
        )?.label;
      if (!suggestionId) return;
      const suggestion = suggestions.find((s) => s.suggestion_id === suggestionId);
      if (!suggestion) return;
      const beforeText = editor.document.getText(editor.selection);
      const next = applyThreadSuggestion(state, threadId, suggestionId, beforeText, config);
      stateByDocument.set(editor.document.uri.toString(), next);
      refresh();
    }),

    vscode.commands.registerCommand('mdCollab.rejectSuggestion', async (argThreadId?: string, argSuggestionId?: string) => {
      const editor = vscode.window.activeTextEditor;
      const state = loadForEditor(editor);
      if (!editor || !state || state.readOnly) return;
      const config = getConfig();
      if (!requireAuthor(config)) return;
      const threadId = await threadIdFromArgOrPick(state, 'any', argThreadId);
      if (!threadId) return;
      const thread = state.sidecar.threads.find((t) => t.thread_id === threadId);
      const suggestions = (thread?.suggestions ?? []).filter((s) => s.status === 'proposed');
      if (!thread || suggestions.length === 0) return;
      const suggestionId =
        argSuggestionId ?? (await vscode.window.showQuickPick(suggestions.map((s) => ({ label: s.suggestion_id }))))?.label;
      if (!suggestionId) return;
      const next = rejectThreadSuggestion(state, threadId, suggestionId, config);
      stateByDocument.set(editor.document.uri.toString(), next);
      refresh();
    }),

    vscode.commands.registerCommand('mdCollab.viewSuggestionBaseVersion', async () => {
      void vscode.window.showInformationMessage('md-collab: view base version is not yet available in this build.');
    }),
  );

  setActiveSidecarWatcher(vscode.window.activeTextEditor);
  refresh();
}

export function deactivate() {}
