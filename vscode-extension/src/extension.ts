import * as vscode from 'vscode';
import {
  addComment,
  addReply,
  loadStateForDocument,
  reanchorAll,
  reopen,
  resolve,
  visibleInlineThreads,
  type Config,
  type DocumentThreadState,
} from './model.js';
import { ThreadTreeProvider } from './threadTree.js';
import { MdCollabError } from '../../dist/index.js';

const stateByDocument = new Map<string, DocumentThreadState>();

const getConfig = (): Config => {
  const config = vscode.workspace.getConfiguration('mdCollab');
  return {
    authorId: config.get<string>('authorId', '').trim(),
    authorLabel: config.get<string>('authorLabel', '').trim(),
    showResolvedInline: config.get<boolean>('showResolvedInline', false),
    reanchorOnSave: config.get<boolean>('reanchorOnSave', true),
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

const applyDecorations = (
  editor: vscode.TextEditor | undefined,
  threadTree: ThreadTreeProvider,
  decorationMap: Map<string, vscode.TextEditorDecorationType>,
) => {
  if (!editor || editor.document.languageId !== 'markdown') return;
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
    buckets[thread.anchor.anchor_confidence].push({
      range,
      hoverMessage: `md-collab thread ${thread.thread_id} (${thread.anchor.anchor_confidence})`,
      renderOptions: {
        after: {
          contentText: ' 💬',
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

  context.subscriptions.push(...decorationMap.values());

  const refresh = () => applyDecorations(vscode.window.activeTextEditor, threadTree, decorationMap);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId !== 'markdown') return;
      const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === doc.uri.toString());
      if (!editor) return;
      const state = loadForEditor(editor);
      if (state && !state.readOnly) {
        const reanchored = reanchorAll(state, doc.getText());
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
      const reanchored = reanchorAll(prior, doc.getText());
      stateByDocument.set(key, reanchored);
      refresh();
    }),
    vscode.window.onDidChangeActiveTextEditor(refresh),
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
      const next = reanchorAll(state, editor.document.getText());
      stateByDocument.set(editor.document.uri.toString(), next);
      refresh();
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
  );

  refresh();
}

export function deactivate() {}
