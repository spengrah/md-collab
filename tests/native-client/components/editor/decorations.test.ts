// @vitest-environment jsdom
//
// Decoration pipeline tests. We construct a CM6 EditorView in jsdom and
// dispatch the `setThreadsEffect` to verify the resulting DecorationSet
// classes, range positions, and broken/resolved filtering.

import { describe, expect, it } from 'vitest';
import { mountEditor } from '../../../../native-client/src/components/editor/cm6.js';
import type { ThreadDecorationInput } from '../../../../native-client/src/components/editor/decorations.js';

function makeParent(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function decoCount(parent: HTMLElement, cls: string): number {
  return parent.querySelectorAll(`.mdc-thread.${cls}`).length;
}

describe('decorations.threads-to-marks', () => {
  it('emits an inline mark with the high-confidence class', () => {
    const parent = makeParent();
    const editor = mountEditor({
      parent,
      docText: 'hello world',
      threads: [
        {
          thread_id: 't1',
          status: 'open',
          start_offset: 0,
          end_offset: 5,
          anchor_confidence: 'high',
        },
      ],
    });
    expect(decoCount(parent, 'mdc-confidence-high')).toBe(1);
    editor.destroy();
  });

  it('skips broken anchors inline', () => {
    const parent = makeParent();
    const editor = mountEditor({
      parent,
      docText: 'hello world',
      threads: [
        {
          thread_id: 't-broken',
          status: 'open',
          start_offset: 0,
          end_offset: 5,
          anchor_confidence: 'broken',
        },
      ],
    });
    expect(parent.querySelectorAll('.mdc-thread').length).toBe(0);
    editor.destroy();
  });

  it('skips resolved threads inline by default', () => {
    const parent = makeParent();
    const editor = mountEditor({
      parent,
      docText: 'hello world',
      threads: [
        {
          thread_id: 't-res',
          status: 'resolved',
          start_offset: 0,
          end_offset: 5,
          anchor_confidence: 'high',
        },
      ],
    });
    expect(parent.querySelectorAll('.mdc-thread').length).toBe(0);
    editor.destroy();
  });

  it('clamps out-of-bounds positions to doc length', () => {
    const parent = makeParent();
    const editor = mountEditor({
      parent,
      docText: 'short',
      threads: [
        {
          thread_id: 't-oob',
          status: 'open',
          start_offset: 0,
          end_offset: 999,
          anchor_confidence: 'low',
        },
      ],
    });
    expect(decoCount(parent, 'mdc-confidence-low')).toBe(1);
    editor.destroy();
  });

  it('renders all three confidence tiers', () => {
    const parent = makeParent();
    const editor = mountEditor({
      parent,
      docText: 'aaaa bbbb cccc dddd',
      threads: [
        {
          thread_id: 'h',
          status: 'open',
          start_offset: 0,
          end_offset: 4,
          anchor_confidence: 'high',
        },
        {
          thread_id: 'm',
          status: 'open',
          start_offset: 5,
          end_offset: 9,
          anchor_confidence: 'medium',
        },
        {
          thread_id: 'l',
          status: 'open',
          start_offset: 10,
          end_offset: 14,
          anchor_confidence: 'low',
        },
      ],
    });
    expect(decoCount(parent, 'mdc-confidence-high')).toBe(1);
    expect(decoCount(parent, 'mdc-confidence-medium')).toBe(1);
    expect(decoCount(parent, 'mdc-confidence-low')).toBe(1);
    editor.destroy();
  });

  it('skips zero-width ranges gracefully', () => {
    const parent = makeParent();
    const editor = mountEditor({
      parent,
      docText: 'hello world',
      threads: [
        {
          thread_id: 't-zero',
          status: 'open',
          start_offset: 5,
          end_offset: 5,
          anchor_confidence: 'high',
        },
      ],
    });
    expect(parent.querySelectorAll('.mdc-thread').length).toBe(0);
    editor.destroy();
  });

  it('handles a thread anchored across an emoji surrogate pair', () => {
    const parent = makeParent();
    const docText = 'A 🎉 B';
    // "🎉" is two UTF-16 code units (offsets 2..4). Anchor across the emoji.
    const editor = mountEditor({
      parent,
      docText,
      threads: [
        {
          thread_id: 't-emoji',
          status: 'open',
          start_offset: 2,
          end_offset: 4,
          anchor_confidence: 'high',
        },
      ],
    });
    expect(decoCount(parent, 'mdc-confidence-high')).toBe(1);
    editor.destroy();
  });

  it('updates decorations when setThreads is called', () => {
    const parent = makeParent();
    const editor = mountEditor({
      parent,
      docText: 'hello world',
      threads: [],
    });
    expect(parent.querySelectorAll('.mdc-thread').length).toBe(0);
    editor.setThreads([
      {
        thread_id: 't-late',
        status: 'open',
        start_offset: 0,
        end_offset: 5,
        anchor_confidence: 'medium',
      },
    ]);
    expect(decoCount(parent, 'mdc-confidence-medium')).toBe(1);
    editor.destroy();
  });
});
