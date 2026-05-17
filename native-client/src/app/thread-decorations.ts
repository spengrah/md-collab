// Pure conversion: sidecar threads + docText → ({decoration inputs}, {panel rows}).
//
// Extracted from main.ts so the inclusive/exclusive end handling and the
// reanchor-on-open / reanchor-off branches can be unit-tested without a
// jsdom or DOM mount. Codex review round 2 flagged this branch as
// uncovered.
//
// Inclusive/exclusive contract:
//   - `thread.anchor.primary.end.offset_utf16` is EXCLUSIVE (see
//     src/anchor.ts line 76).
//   - `reanchor()`'s `result.end.offset_utf16` is INCLUSIVE.
//   - CM6 `Decoration.mark()` wants EXCLUSIVE end.
//   So: reanchor path adds +1; direct path uses stored value as-is.

import { reanchor, type Anchor, type Thread } from './core.js';
import type { ThreadDecorationInput } from '../components/editor/decorations.js';
import type { ThreadPanelRow } from '../components/thread-panel/index.js';

export interface PreparedThreads {
  decorations: ThreadDecorationInput[];
  panel: ThreadPanelRow[];
}

export interface PrepareOptions {
  reanchorOnOpen: boolean;
}

export function prepareThreads(
  docText: string,
  threads: readonly Thread[],
  options: PrepareOptions
): PreparedThreads {
  const decorations: ThreadDecorationInput[] = [];
  const panel: ThreadPanelRow[] = [];
  for (const thread of threads) {
    let start: number;
    let endExclusive: number;
    let confidence = thread.anchor.anchor_confidence;
    if (options.reanchorOnOpen) {
      const result = reanchor(docText, thread.anchor as Anchor);
      confidence = result.anchor_confidence;
      if (result.start && result.end) {
        start = result.start.offset_utf16;
        endExclusive = result.end.offset_utf16 + 1;
      } else {
        // Broken — keep stored offsets so the panel can still surface a
        // position even though inline rendering will skip the thread.
        start = thread.anchor.primary.start.offset_utf16;
        endExclusive = thread.anchor.primary.end.offset_utf16;
      }
    } else {
      // Trust the persisted state exactly; do NOT add +1 (the stored value is
      // already exclusive).
      start = thread.anchor.primary.start.offset_utf16;
      endExclusive = thread.anchor.primary.end.offset_utf16;
    }

    decorations.push({
      thread_id: thread.thread_id,
      status: thread.status,
      start_offset: start,
      end_offset: endExclusive,
      anchor_confidence: confidence,
    });

    const firstMessage = thread.messages?.[0]?.body ?? '';
    const excerpt = truncate(firstMessage, 80) || '(no message)';
    panel.push({
      thread_id: thread.thread_id,
      status: thread.status,
      anchor_confidence: confidence,
      excerpt,
      start_offset: confidence === 'broken' ? null : start,
    });
  }
  return { decorations, panel };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}
