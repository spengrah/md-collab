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
  preflightApplyThreadSuggestion,
  applyThreadSuggestion,
  rejectThreadSuggestion,
  getSuggestionBaseVersion,
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
    void vscode.window
      .showWarningMessage(
        'md-collab: Sidecar conflict detected. This is expected only when another process/editor changed the .comments.json file after you loaded it.',
        'Reload Sidecar',
        'Conflict Help',
      )
      .then((choice) => {
        if (choice === 'Reload Sidecar') {
          void vscode.commands.executeCommand('mdCollab.reloadSidecar');
        }
        if (choice === 'Conflict Help') {
          void vscode.commands.executeCommand('mdCollab.showConflictHelp');
        }
      });
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

const normalizeThreadIdArg = (arg: unknown): string | undefined => {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && 'threadId' in arg && typeof (arg as { threadId?: unknown }).threadId === 'string') {
    return (arg as { threadId: string }).threadId;
  }
  return undefined;
};

const normalizeSuggestionIdArg = (arg: unknown): string | undefined => {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && 'suggestionId' in arg && typeof (arg as { suggestionId?: unknown }).suggestionId === 'string') {
    return (arg as { suggestionId: string }).suggestionId;
  }
  return undefined;
};

const threadIdFromArgOrPick = async (
  state: DocumentThreadState,
  status: 'open' | 'resolved' | 'any',
  arg?: unknown,
): Promise<string | undefined> => {
  const normalizedArg = normalizeThreadIdArg(arg);
  if (normalizedArg) return normalizedArg;

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
  markerDecorationMap: Map<string, vscode.TextEditorDecorationType>,
  rangeDecorationMap: Map<string, vscode.TextEditorDecorationType>,
) => {
  if (!editor || editor.document.languageId !== 'markdown') {
    threadTree.setState(undefined);
    return;
  }
  const state = loadForEditor(editor);
  threadTree.setState(state);
  if (!state) return;

  const config = getConfig();
  for (const decorationType of [...markerDecorationMap.values(), ...rangeDecorationMap.values()]) {
    editor.setDecorations(decorationType, []);
  }

  const markerBuckets: Record<string, vscode.DecorationOptions[]> = {
    high: [],
    medium: [],
    low: [],
    broken: [],
  };

  const rangeBuckets: Record<string, vscode.DecorationOptions[]> = {
    high: [],
    medium: [],
    low: [],
    broken: [],
  };

  for (const thread of visibleInlineThreads(state, config.showResolvedInline)) {
    if (thread.anchor.anchor_confidence === 'broken' || !thread.anchor.primary.start || !thread.anchor.primary.end) {
      markerBuckets.broken.push({
        range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
        hoverMessage: `$(warning) Broken anchor for thread ${thread.thread_id}. Use reanchor command.`,
      });
      continue;
    }

    const start = thread.anchor.primary.start;
    const markerRange = new vscode.Range(
      new vscode.Position(Math.max(0, start.line - 1), Math.max(0, start.column - 1)),
      new vscode.Position(Math.max(0, start.line - 1), Math.max(0, start.column - 1)),
    );
    const end = thread.anchor.primary.end;
    const highlightRange = new vscode.Range(
      new vscode.Position(Math.max(0, start.line - 1), Math.max(0, start.column - 1)),
      new vscode.Position(Math.max(0, end.line - 1), Math.max(0, end.column - 1)),
    );
    const relevance = thread.relevance_state ?? 'active';
    const timeline = timelineBadge(thread.thread_version_context?.kind);
    const quoteSnippet = thread.anchor.fallback.quote.replace(/\s+/g, ' ').slice(0, 60);
    markerBuckets[thread.anchor.anchor_confidence].push({
      range: markerRange,
      hoverMessage: `md-collab thread ${thread.thread_id} (${thread.anchor.anchor_confidence})\nrelevance: ${relevance}\ntimeline: ${timeline}\nquote: “${quoteSnippet}”`,
    });
    if (thread.anchor.anchor_confidence === 'high' || thread.anchor.anchor_confidence === 'medium') {
      rangeBuckets[thread.anchor.anchor_confidence].push({ range: highlightRange });
    }
  }

  for (const key of ['high', 'medium', 'low', 'broken']) {
    editor.setDecorations(markerDecorationMap.get(key)!, markerBuckets[key]);
    editor.setDecorations(rangeDecorationMap.get(key)!, rangeBuckets[key]);
  }
};

export function activate(context: vscode.ExtensionContext) {
  const threadTree = new ThreadTreeProvider();
  vscode.window.registerTreeDataProvider('mdCollab.threads', threadTree);

  const transientNavigateDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    border: '1px solid',
    borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
  });

  const markerDecorationMap = new Map<string, vscode.TextEditorDecorationType>([
    [
      'high',
      vscode.window.createTextEditorDecorationType({
        overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
        gutterIconPath: vscode.Uri.joinPath(context.extensionUri, 'resources', 'comment.svg'),
        gutterIconSize: 'contain',
      }),
    ],
    [
      'medium',
      vscode.window.createTextEditorDecorationType({
        overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
        gutterIconPath: vscode.Uri.joinPath(context.extensionUri, 'resources', 'comment.svg'),
        gutterIconSize: 'contain',
      }),
    ],
    [
      'low',
      vscode.window.createTextEditorDecorationType({
        overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
        gutterIconPath: vscode.Uri.joinPath(context.extensionUri, 'resources', 'comment.svg'),
        gutterIconSize: 'contain',
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

  const rangeDecorationMap = new Map<string, vscode.TextEditorDecorationType>([
    ['high', vscode.window.createTextEditorDecorationType({ backgroundColor: new vscode.ThemeColor('editor.wordHighlightStrongBackground') })],
    ['medium', vscode.window.createTextEditorDecorationType({ backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground') })],
    ['low', vscode.window.createTextEditorDecorationType({ backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground') })],
    ['broken', vscode.window.createTextEditorDecorationType({})],
  ]);

  context.subscriptions.push(transientNavigateDecoration, ...markerDecorationMap.values(), ...rangeDecorationMap.values());

  const refresh = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId === 'markdown') {
      lastActiveMarkdownDocumentKey = editor.document.uri.toString();
    }
    applyDecorations(editor, threadTree, markerDecorationMap, rangeDecorationMap);
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

    vscode.commands.registerCommand('mdCollab.replyToThread', async (argThreadId?: unknown) => {
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

    vscode.commands.registerCommand('mdCollab.showConflictHelp', async () => {
      const doc = await vscode.workspace.openTextDocument({
        content: [
          '# md-collab conflict behavior',
          '',
          '- A sidecar conflict occurs only when the `.comments.json` changed on disk after this editor state loaded it.',
          '- Typical causes: two VS Code windows, a git checkout/reset touching sidecars, or manual sidecar edits.',
          '- If you are the only writer in one window, conflicts are *not* expected.',
          '',
          '## Deterministic repro',
          '',
          '1. Open the same markdown file in two VS Code windows.',
          '2. In window A, add a comment and keep window B untouched.',
          '3. In window B, add/reply/resolve without reloading sidecar first.',
          '4. md-collab should show a sidecar conflict warning.',
          '',
          '## Recovery',
          '',
          'Run **md-collab: Reload Sidecar** and retry the action.',
        ].join('\n'),
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
    }),

    vscode.commands.registerCommand('mdCollab.showBaseVersionHelp', async () => {
      const doc = await vscode.workspace.openTextDocument({
        content: [
          '# Suggestion base version availability',
          '',
          'Base-version content is available only when a thread has git metadata (`timelineKind = git|hybrid`) and the referenced commit/path still exists.',
          '',
          'If base version is unavailable:',
          '- In Settings, set **mdCollab.timelineKind** to `git` or `hybrid` for new threads.',
          '- Ensure this file is inside a git repo and commits referenced by threads still exist locally.',
          '- Existing workspace-only threads will continue to report unavailable base versions.',
        ].join('\n'),
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
    }),

    vscode.commands.registerCommand('mdCollab.proposeSuggestion', async (argThreadId?: unknown) => {
      const editor = vscode.window.activeTextEditor;
      const state = loadForEditor(editor);
      if (!editor || !state || state.readOnly) return;
      const config = getConfig();
      if (!requireAuthor(config)) return;
      if (editor.selection.isEmpty) {
        void vscode.window.showInformationMessage(
          'md-collab: Select target text first, then run Propose Suggestion. A thread will be created automatically when needed.',
        );
        return;
      }

      const beforeText = editor.document.getText(editor.selection);
      const replacement = await vscode.window.showInputBox({ prompt: 'Suggested replacement text' });
      if (replacement === undefined) return;

      const explicitThreadId = normalizeThreadIdArg(argThreadId);

      try {
        let workingState = state;
        let threadId = explicitThreadId;

        if (!threadId) {
          const startOffset = editor.document.offsetAt(editor.selection.start);
          const endOffset = editor.document.offsetAt(editor.selection.end);
          const created = addComment(workingState, editor.document.getText(), startOffset, endOffset, 'Suggestion proposed.', config);
          workingState = created;
          threadId = created.sidecar.threads[created.sidecar.threads.length - 1]?.thread_id;
          if (!threadId) {
            void vscode.window.showWarningMessage('md-collab: Failed to create thread for suggestion.');
            return;
          }
        }

        const thread = workingState.sidecar.threads.find((t) => t.thread_id === threadId);
        if (!thread) {
          void vscode.window.showWarningMessage('md-collab: Could not find target thread for suggestion.');
          return;
        }

        const next = proposeThreadSuggestion(workingState, threadId, thread.anchor, beforeText, replacement, config);
        stateByDocument.set(editor.document.uri.toString(), next);
        refresh();
      } catch (err) {
        explainMutationError(err);
      }
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
      if (!thread || suggestions.length === 0) {
        void vscode.window.showInformationMessage('md-collab: No proposed suggestions available for this thread.');
        return;
      }
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

      const start = suggestion.proposed_edit.anchor.primary.start;
      const end = suggestion.proposed_edit.anchor.primary.end;
      const range = new vscode.Range(
        new vscode.Position(Math.max(0, start.line - 1), Math.max(0, start.column - 1)),
        new vscode.Position(Math.max(0, end.line - 1), Math.max(0, end.column - 1)),
      );
      const beforeText = editor.document.getText(range);

      try {
        const preflight = preflightApplyThreadSuggestion(state, threadId, suggestionId, beforeText, config);
        if (!preflight.ok) {
          if (preflight.reason === 'HASH_MISMATCH') {
            stateByDocument.set(editor.document.uri.toString(), preflight.state);
            refresh();
            void vscode.window.showWarningMessage('md-collab: Suggestion became obsolete (hash mismatch). No document edits were made.');
          }
          return;
        }

        const didEdit = await editor.edit((editBuilder) => {
          editBuilder.replace(range, preflight.replacementText);
        });
        if (!didEdit) {
          void vscode.window.showWarningMessage('md-collab: Apply suggestion canceled before document mutation.');
          return;
        }
        const next = applyThreadSuggestion(preflight.state, threadId, suggestionId, beforeText, config);
        stateByDocument.set(editor.document.uri.toString(), next);
        refresh();
      } catch (err) {
        explainMutationError(err);
      }
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
      if (!thread || suggestions.length === 0) {
        void vscode.window.showInformationMessage('md-collab: No proposed suggestions available for this thread.');
        return;
      }
      const suggestionId =
        argSuggestionId ?? (await vscode.window.showQuickPick(suggestions.map((s) => ({ label: s.suggestion_id }))))?.label;
      if (!suggestionId) return;
      try {
        const next = rejectThreadSuggestion(state, threadId, suggestionId, config);
        stateByDocument.set(editor.document.uri.toString(), next);
        refresh();
      } catch (err) {
        explainMutationError(err);
      }
    }),

    vscode.commands.registerCommand('mdCollab.viewSuggestionBaseVersion', async (argThreadId?: string, argSuggestionId?: string) => {
      const editor = vscode.window.activeTextEditor;
      const state = loadForEditor(editor);
      if (!editor || !state) return;
      const threadId = await threadIdFromArgOrPick(state, 'any', argThreadId);
      if (!threadId) return;
      const thread = state.sidecar.threads.find((t) => t.thread_id === threadId);
      const suggestions = thread?.suggestions ?? [];
      if (!thread || suggestions.length === 0) {
        void vscode.window.showInformationMessage('md-collab: This thread has no suggestions yet. Use “Suggest edit…” first.');
        return;
      }
      const suggestionId =
        argSuggestionId ?? (await vscode.window.showQuickPick(suggestions.map((s) => ({ label: s.suggestion_id }))))?.label;
      if (!suggestionId) return;

      const base = getSuggestionBaseVersion(state, threadId, suggestionId);
      if (!base.content) {
        void vscode.window
          .showInformationMessage(
            `md-collab: ${base.reason ?? 'base version unavailable'}`,
            'Open md-collab settings',
            'Why unavailable?'
          )
          .then((choice) => {
            if (choice === 'Open md-collab settings') {
              void vscode.commands.executeCommand('workbench.action.openSettings', 'mdCollab.timelineKind');
            }
            if (choice === 'Why unavailable?') {
              void vscode.commands.executeCommand('mdCollab.showBaseVersionHelp');
            }
          });
        return;
      }

      const doc = await vscode.workspace.openTextDocument({
        content: base.content,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
      void vscode.window.showInformationMessage(`md-collab: opened ${base.title}`);
    }),
  );

  setActiveSidecarWatcher(vscode.window.activeTextEditor);
  refresh();
}

export function deactivate() {}
