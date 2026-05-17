// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  mountThreadPanel,
  type ThreadPanelRow,
} from '../../../../native-client/src/components/thread-panel/index.js';

function makeParent(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

const baseRow = (overrides: Partial<ThreadPanelRow>): ThreadPanelRow => ({
  thread_id: 't',
  status: 'open',
  anchor_confidence: 'high',
  excerpt: 'hello',
  start_offset: 0,
  ...overrides,
});

describe('thread-panel', () => {
  it('renders Open / Broken / Resolved sections with correct counts', () => {
    const parent = makeParent();
    const onScrollTo = vi.fn();
    mountThreadPanel({
      parent,
      rows: [
        baseRow({ thread_id: 'o1', status: 'open' }),
        baseRow({ thread_id: 'o2', status: 'open', anchor_confidence: 'low' }),
        baseRow({ thread_id: 'b1', anchor_confidence: 'broken', start_offset: null }),
        baseRow({ thread_id: 'r1', status: 'resolved' }),
      ],
      onScrollTo,
    });

    const headings = parent.querySelectorAll('.mdc-thread-panel-heading');
    expect(headings[0].textContent).toContain('Open (2)');
    expect(headings[1].textContent).toContain('Broken anchors (1)');
    expect(headings[2].textContent).toMatch(/Resolved \(1\)/);
  });

  it('clicking an open row triggers onScrollTo with the anchor offset', () => {
    const parent = makeParent();
    const onScrollTo = vi.fn();
    mountThreadPanel({
      parent,
      rows: [baseRow({ thread_id: 'o1', status: 'open', start_offset: 42 })],
      onScrollTo,
    });
    const row = parent.querySelector('.mdc-thread-panel-section-open .mdc-thread-panel-row') as HTMLElement;
    row.click();
    expect(onScrollTo).toHaveBeenCalledWith(42);
  });

  it('clicking a broken row never calls onScrollTo and shows the deferred-relink badge', () => {
    const parent = makeParent();
    const onScrollTo = vi.fn();
    mountThreadPanel({
      parent,
      rows: [
        baseRow({ thread_id: 'b1', anchor_confidence: 'broken', start_offset: null }),
      ],
      onScrollTo,
    });
    const row = parent.querySelector('.mdc-thread-panel-section-broken .mdc-thread-panel-row') as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.querySelector('.mdc-thread-panel-badge-relink-deferred')).toBeTruthy();
    row.click();
    expect(onScrollTo).not.toHaveBeenCalled();
  });

  it('Resolved section is collapsed by default', () => {
    const parent = makeParent();
    mountThreadPanel({
      parent,
      rows: [baseRow({ thread_id: 'r1', status: 'resolved', start_offset: 7 })],
      onScrollTo: vi.fn(),
    });
    const list = parent.querySelector('.mdc-thread-panel-section-resolved .mdc-thread-panel-list');
    expect(list).toBeNull();
  });

  it('Resolved section expands on click and scroll works', () => {
    const parent = makeParent();
    const onScrollTo = vi.fn();
    mountThreadPanel({
      parent,
      rows: [baseRow({ thread_id: 'r1', status: 'resolved', start_offset: 7 })],
      onScrollTo,
    });
    const toggle = parent.querySelector(
      '.mdc-thread-panel-section-resolved .mdc-thread-panel-heading-toggle'
    ) as HTMLElement;
    toggle.click();
    const row = parent.querySelector(
      '.mdc-thread-panel-section-resolved .mdc-thread-panel-row'
    ) as HTMLElement;
    expect(row).toBeTruthy();
    row.click();
    expect(onScrollTo).toHaveBeenCalledWith(7);
  });

  it('respects resolvedInitiallyExpanded option', () => {
    const parent = makeParent();
    mountThreadPanel({
      parent,
      rows: [baseRow({ thread_id: 'r1', status: 'resolved' })],
      onScrollTo: vi.fn(),
      resolvedInitiallyExpanded: true,
    });
    const list = parent.querySelector('.mdc-thread-panel-section-resolved .mdc-thread-panel-list');
    expect(list).toBeTruthy();
  });

  it('setRows replaces the rendered set', () => {
    const parent = makeParent();
    const handle = mountThreadPanel({
      parent,
      rows: [baseRow({ thread_id: 'o1' })],
      onScrollTo: vi.fn(),
    });
    handle.setRows([
      baseRow({ thread_id: 'o2' }),
      baseRow({ thread_id: 'o3' }),
      baseRow({ thread_id: 'o4' }),
    ]);
    const heading = parent.querySelector(
      '.mdc-thread-panel-section-open .mdc-thread-panel-heading'
    );
    expect(heading?.textContent).toContain('Open (3)');
  });
});
