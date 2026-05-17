// CodeMirror 6 decorations driven by the sidecar thread set.
//
// Open + non-broken threads produce inline `mark` decorations with a class
// matching their anchor_confidence (high/medium/low). Resolved threads are
// hidden by default; broken threads are panel-only (never inline). The state
// field is driven by a single `setThreadsEffect`, which lets us recompute the
// decoration set whenever the thread set or settings change.

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

import type { AnchorConfidence, ThreadStatus } from '../../app/core.js';

export interface ThreadDecorationInput {
  thread_id: string;
  status: ThreadStatus;
  /** UTF-16 offset within the document text. */
  start_offset: number;
  /** UTF-16 offset within the document text (exclusive). */
  end_offset: number;
  anchor_confidence: AnchorConfidence;
}

export const setThreadsEffect = StateEffect.define<readonly ThreadDecorationInput[]>();

export const threadDecorationsExtension = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setThreadsEffect)) {
        next = buildDecorations(tr.state.doc.length, effect.value);
      }
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildDecorations(
  docLength: number,
  threads: readonly ThreadDecorationInput[]
): DecorationSet {
  const ranges = [];
  for (const t of threads) {
    if (t.anchor_confidence === 'broken') continue; // panel-only per spec §6.3
    if (t.status === 'resolved') continue; // panel-only by default per spec §6.2
    const start = clamp(t.start_offset, 0, docLength);
    const end = clamp(t.end_offset, start, docLength);
    if (start === end) {
      // Zero-width decorations are illegal in CM6; skip gracefully and warn.
      console.warn(`thread ${t.thread_id} has zero-width range; skipping inline mark`);
      continue;
    }
    if (start < 0 || end > docLength) {
      console.warn(`thread ${t.thread_id} clamped to doc bounds (${start}..${end})`);
    }
    ranges.push(
      Decoration.mark({
        class: `mdc-thread mdc-confidence-${t.anchor_confidence}`,
        attributes: {
          'data-mdc-thread-id': t.thread_id,
        },
      }).range(start, end)
    );
  }
  // CM6 requires ranges to be sorted by `from`.
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges);
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
