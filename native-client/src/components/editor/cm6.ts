// CodeMirror 6 host. PR1 is strictly read-only:
//   - `EditorState.readOnly.of(true)` ensures no transactions mutate the doc.
//   - `EditorView.editable.of(false)` disables the editing affordance.
//
// PR2 unlocks editing for `.md` documents.

import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';

import { threadDecorationsExtension, setThreadsEffect, type ThreadDecorationInput } from './decorations.js';

export interface EditorHandle {
  view: EditorView;
  setThreads(threads: readonly ThreadDecorationInput[]): void;
  /** Scroll the editor so `offset` is visible. */
  scrollTo(offset: number): void;
  destroy(): void;
}

export interface EditorMountOptions {
  parent: HTMLElement;
  docText: string;
  threads: readonly ThreadDecorationInput[];
}

export function mountEditor(options: EditorMountOptions): EditorHandle {
  const state = EditorState.create({
    doc: options.docText,
    extensions: [
      lineNumbers(),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      threadDecorationsExtension,
    ],
  });

  const view = new EditorView({
    state,
    parent: options.parent,
  });

  // Dispatch the initial thread set via the effect (the extension reads it
  // from the state field).
  view.dispatch({
    effects: setThreadsEffect.of([...options.threads]),
  });

  return {
    view,
    setThreads(threads) {
      view.dispatch({
        effects: setThreadsEffect.of([...threads]),
      });
    },
    scrollTo(offset) {
      const clamped = Math.max(0, Math.min(offset, view.state.doc.length));
      view.dispatch({
        effects: EditorView.scrollIntoView(clamped, { y: 'center' }),
      });
    },
    destroy() {
      view.destroy();
    },
  };
}
