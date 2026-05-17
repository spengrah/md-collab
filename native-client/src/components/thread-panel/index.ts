// Minimal read-only thread panel for PR1.
//
// Renders three sections — Open / Broken / Resolved — per spec §6.1-6.3 and
// the amended §11.5 (read-only frontends surface broken anchors but cannot
// relink in-app).
//
// Clicking an Open or Resolved row scrolls the editor to the anchor offset
// (via the `onScrollTo` callback). Broken rows show a non-interactive
// "Relink in next slice" badge.

import type { AnchorConfidence, ThreadStatus } from '../../app/core.js';

export interface ThreadPanelRow {
  thread_id: string;
  status: ThreadStatus;
  anchor_confidence: AnchorConfidence;
  /** First message excerpt (~80 chars), used as the row label. */
  excerpt: string;
  /** UTF-16 offset within the document. Null for broken anchors. */
  start_offset: number | null;
}

export interface ThreadPanelOptions {
  parent: HTMLElement;
  rows: readonly ThreadPanelRow[];
  onScrollTo: (offset: number) => void;
  /** When `settings.show_resolved_inline` is true, this is `true` and the
   *  Resolved section starts expanded. */
  resolvedInitiallyExpanded?: boolean;
}

export interface ThreadPanelHandle {
  setRows(rows: readonly ThreadPanelRow[]): void;
  destroy(): void;
}

export function mountThreadPanel(options: ThreadPanelOptions): ThreadPanelHandle {
  const { parent, onScrollTo } = options;
  let rows = [...options.rows];
  let resolvedExpanded = options.resolvedInitiallyExpanded ?? false;

  const root = document.createElement('section');
  root.className = 'mdc-thread-panel';

  const openSection = document.createElement('div');
  openSection.className = 'mdc-thread-panel-section mdc-thread-panel-section-open';
  root.appendChild(openSection);

  const brokenSection = document.createElement('div');
  brokenSection.className = 'mdc-thread-panel-section mdc-thread-panel-section-broken';
  root.appendChild(brokenSection);

  const resolvedSection = document.createElement('div');
  resolvedSection.className = 'mdc-thread-panel-section mdc-thread-panel-section-resolved';
  root.appendChild(resolvedSection);

  parent.appendChild(root);

  const render = () => {
    renderSection(openSection, 'Open', rows.filter((r) => r.status === 'open' && r.anchor_confidence !== 'broken'), {
      onScrollTo,
    });
    renderBrokenSection(brokenSection, rows.filter((r) => r.anchor_confidence === 'broken'));
    renderResolvedSection(
      resolvedSection,
      rows.filter((r) => r.status === 'resolved' && r.anchor_confidence !== 'broken'),
      {
        expanded: resolvedExpanded,
        onToggle: () => {
          resolvedExpanded = !resolvedExpanded;
          render();
        },
        onScrollTo,
      }
    );
  };

  render();

  return {
    setRows(next) {
      rows = [...next];
      render();
    },
    destroy() {
      root.remove();
    },
  };
}

function renderSection(
  container: HTMLElement,
  label: string,
  rows: readonly ThreadPanelRow[],
  opts: { onScrollTo: (offset: number) => void }
): void {
  container.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'mdc-thread-panel-heading';
  heading.textContent = `${label} (${rows.length})`;
  container.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'mdc-thread-panel-list';
  for (const row of rows) {
    const li = renderRow(row, opts.onScrollTo, { withRelinkBadge: false });
    list.appendChild(li);
  }
  container.appendChild(list);
}

function renderBrokenSection(container: HTMLElement, rows: readonly ThreadPanelRow[]): void {
  container.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'mdc-thread-panel-heading';
  heading.textContent = `Broken anchors (${rows.length})`;
  container.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'mdc-thread-panel-list';
  for (const row of rows) {
    const li = renderRow(row, () => {}, { withRelinkBadge: true });
    list.appendChild(li);
  }
  container.appendChild(list);
}

function renderResolvedSection(
  container: HTMLElement,
  rows: readonly ThreadPanelRow[],
  opts: {
    expanded: boolean;
    onToggle: () => void;
    onScrollTo: (offset: number) => void;
  }
): void {
  container.innerHTML = '';
  const heading = document.createElement('button');
  heading.type = 'button';
  heading.className = 'mdc-thread-panel-heading mdc-thread-panel-heading-toggle';
  heading.setAttribute('aria-expanded', String(opts.expanded));
  heading.textContent = `${opts.expanded ? '▾' : '▸'} Resolved (${rows.length})`;
  heading.addEventListener('click', opts.onToggle);
  container.appendChild(heading);

  if (!opts.expanded) return;

  const list = document.createElement('ul');
  list.className = 'mdc-thread-panel-list';
  for (const row of rows) {
    const li = renderRow(row, opts.onScrollTo, { withRelinkBadge: false });
    list.appendChild(li);
  }
  container.appendChild(list);
}

function renderRow(
  row: ThreadPanelRow,
  onScrollTo: (offset: number) => void,
  opts: { withRelinkBadge: boolean }
): HTMLElement {
  const li = document.createElement('li');
  li.className = 'mdc-thread-panel-row';
  li.dataset.threadId = row.thread_id;

  const dot = document.createElement('span');
  dot.className = `mdc-thread-panel-dot mdc-confidence-${row.anchor_confidence}`;
  li.appendChild(dot);

  const text = document.createElement('span');
  text.className = 'mdc-thread-panel-excerpt';
  text.textContent = row.excerpt;
  li.appendChild(text);

  if (opts.withRelinkBadge) {
    const badge = document.createElement('span');
    badge.className = 'mdc-thread-panel-badge mdc-thread-panel-badge-relink-deferred';
    badge.textContent = 'Relink in next slice';
    badge.title =
      'PR1 is read-only. Open in VS Code or wait for the next native-client release to relink this thread.';
    li.appendChild(badge);
  } else if (row.start_offset !== null) {
    const offset = row.start_offset;
    li.classList.add('mdc-thread-panel-row-clickable');
    li.tabIndex = 0;
    li.addEventListener('click', () => onScrollTo(offset));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onScrollTo(offset);
      }
    });
  }

  return li;
}
