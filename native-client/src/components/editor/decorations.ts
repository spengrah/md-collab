// CodeMirror 6 decorations driven by the sidecar thread set.
//
// Open + non-broken threads produce inline `mark` decorations with a class
// matching their anchor_confidence (high/medium/low). Resolved threads are
// hidden inline by default; the panel renders them in a collapsed section.
// When the user toggles `settings.show_resolved_inline = true`, resolved
// threads also receive inline marks. Broken threads are panel-only (never
// inline).
//
// In addition to inline marks, every non-broken thread produces a gutter
// `GutterMarker` so the user can locate threads at a glance even when the
// inline mark is off-screen (plan § 4.3 step 6 + spec § 6.1).

import { RangeSet, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  type DecorationSet,
} from '@codemirror/view';

import type { AnchorConfidence, ThreadStatus } from '../../app/core.js';

export interface ThreadDecorationInput {
  thread_id: string;
  status: ThreadStatus;
  /** UTF-16 offset within the document text (inclusive start). */
  start_offset: number;
  /** UTF-16 offset within the document text (exclusive end). */
  end_offset: number;
  anchor_confidence: AnchorConfidence;
}

export interface DecorationBuildOptions {
  showResolvedInline: boolean;
}

export interface DecorationEffectPayload {
  threads: readonly ThreadDecorationInput[];
  options: DecorationBuildOptions;
}

export const setThreadsEffect = StateEffect.define<DecorationEffectPayload>();

// ---------- Inline marks ----------

export const threadDecorationsExtension = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setThreadsEffect)) {
        next = buildInlineDecorations(
          tr.state.doc.length,
          effect.value.threads,
          effect.value.options
        );
      }
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildInlineDecorations(
  docLength: number,
  threads: readonly ThreadDecorationInput[],
  options: DecorationBuildOptions
): DecorationSet {
  const ranges = [];
  for (const t of threads) {
    if (t.anchor_confidence === 'broken') continue; // panel-only per spec §6.3
    if (t.status === 'resolved' && !options.showResolvedInline) continue;
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
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges);
}

// ---------- Gutter markers ----------

class ThreadGutterMarker extends GutterMarker {
  constructor(
    readonly confidence: AnchorConfidence,
    readonly threadId: string
  ) {
    super();
  }

  override eq(other: GutterMarker): boolean {
    return (
      other instanceof ThreadGutterMarker &&
      other.confidence === this.confidence &&
      other.threadId === this.threadId
    );
  }

  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = `mdc-gutter-dot mdc-confidence-${this.confidence}`;
    el.setAttribute('aria-label', `thread (${this.confidence})`);
    el.title = `Thread (${this.confidence})`;
    el.dataset.mdcThreadId = this.threadId;
    return el;
  }
}

const threadGutterMarkers = StateField.define<RangeSet<ThreadGutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(set, tr) {
    set = set.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setThreadsEffect)) {
        set = buildGutterMarkers(
          tr.state.doc.length,
          effect.value.threads,
          effect.value.options
        );
      }
    }
    return set;
  },
});

function buildGutterMarkers(
  docLength: number,
  threads: readonly ThreadDecorationInput[],
  options: DecorationBuildOptions
): RangeSet<ThreadGutterMarker> {
  const entries: { from: number; value: ThreadGutterMarker }[] = [];
  for (const t of threads) {
    if (t.anchor_confidence === 'broken') continue;
    if (t.status === 'resolved' && !options.showResolvedInline) continue;
    const start = clamp(t.start_offset, 0, docLength);
    entries.push({
      from: start,
      value: new ThreadGutterMarker(t.anchor_confidence, t.thread_id),
    });
  }
  entries.sort((a, b) => a.from - b.from);
  return RangeSet.of(
    entries.map((e) => e.value.range(e.from)),
    /* sort */ true
  );
}

// A spacer marker with no class — gives the gutter consistent width without
// rendering a visible dot. The initialSpacer is required so CM6 reserves
// horizontal room for our markers when no thread is at the visible line.
class GutterSpacer extends GutterMarker {
  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'mdc-gutter-spacer';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
}

export const threadGutterExtension = [
  threadGutterMarkers,
  gutter({
    class: 'mdc-thread-gutter',
    markers: (view) => view.state.field(threadGutterMarkers),
    initialSpacer: () => new GutterSpacer(),
  }),
];

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
