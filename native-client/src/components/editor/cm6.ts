// CodeMirror 6 host. PR1 is strictly read-only:
//   - `EditorState.readOnly.of(true)` ensures no transactions mutate the doc.
//   - `EditorView.editable.of(false)` disables the editing affordance.
//
// PR2 unlocks editing for `.md` documents.

import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';

import {
  setThreadsEffect,
  threadDecorationsExtension,
  threadGutterExtension,
  type DecorationBuildOptions,
  type ThreadDecorationInput,
} from './decorations.js';

export interface EditorHandle {
  view: EditorView;
  setThreads(threads: readonly ThreadDecorationInput[], options?: DecorationBuildOptions): void;
  /** Scroll the editor so `offset` is visible. */
  scrollTo(offset: number): void;
  destroy(): void;
}

export interface EditorMountOptions {
  parent: HTMLElement;
  docText: string;
  threads: readonly ThreadDecorationInput[];
  decorationOptions?: DecorationBuildOptions;
}

const DEFAULT_DECO_OPTIONS: DecorationBuildOptions = { showResolvedInline: false };

export function mountEditor(options: EditorMountOptions): EditorHandle {
  const state = EditorState.create({
    doc: options.docText,
    extensions: [
      lineNumbers(),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      threadDecorationsExtension,
      threadGutterExtension,
    ],
  });

  const view = new EditorView({
    state,
    parent: options.parent,
  });

  // Dispatch the initial thread set + decoration options via the effect.
  view.dispatch({
    effects: setThreadsEffect.of({
      threads: [...options.threads],
      options: options.decorationOptions ?? DEFAULT_DECO_OPTIONS,
    }),
  });

  let lastOptions = options.decorationOptions ?? DEFAULT_DECO_OPTIONS;

  return {
    view,
    setThreads(threads, decoOptions) {
      if (decoOptions) lastOptions = decoOptions;
      view.dispatch({
        effects: setThreadsEffect.of({ threads: [...threads], options: lastOptions }),
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
