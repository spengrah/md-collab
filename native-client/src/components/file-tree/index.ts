// Pierre Trees-based file tree.
//
// Vanilla (non-React) entry. Pierre Trees is the upstream component name; we
// pass `paths` from `workspace_list_markdown` and render `{open_count}` row
// badges via `renderRowDecoration`.
//
// Decoration DOM contract: Pierre Trees exposes a typed
// FileTreeRowDecoration shape (`{ text, title? }` | `{ icon, title? }`). The
// spike documented an HTML-level selector `[data-item-section="decoration"]`
// but the public API exposes the typed contract directly — no need to dip
// into raw DOM.

import {
  FileTree,
  themeToTreeStyles,
  type FileTreeOptions,
  type FileTreeRowDecoration,
  type TreeThemeInput,
} from '@pierre/trees';

import type { Signal } from '../../app/store.js';

export interface FileTreeMountOptions {
  container: HTMLElement;
  paths: readonly string[];
  counts: Signal<Record<string, number>>;
  /** Called when the user clicks a file row. */
  onSelect: (path: string) => void;
  /** Initial light/dark theme. Can be changed later via `setTheme`. */
  theme: TreeThemeInput;
}

export interface FileTreeHandle {
  setPaths(paths: readonly string[]): void;
  setTheme(theme: TreeThemeInput): void;
  setSelection(path: string): void;
  openSearch(initial?: string): void;
  destroy(): void;
}

export function mountFileTree(options: FileTreeMountOptions): FileTreeHandle {
  const { container, paths, counts, onSelect, theme } = options;

  // Apply theme variables once at mount; we'll reapply on theme changes.
  applyThemeVars(container, theme);

  const renderRowDecoration: FileTreeOptions['renderRowDecoration'] = (ctx) => {
    const path = ctx.item.path;
    const count = counts.get()[path] ?? 0;
    if (count <= 0) return null;
    return {
      text: String(count),
      title: `${count} unresolved thread${count === 1 ? '' : 's'}`,
    } satisfies FileTreeRowDecoration;
  };

  let currentPaths = [...paths];

  const tree = new FileTree({
    paths: currentPaths,
    renderRowDecoration,
    onSelectionChange: (selectedPaths) => {
      // Pierre Trees emits the selection-change event with the full selection
      // set. PR1 is single-select-on-click; take the first path.
      const next = selectedPaths[0];
      if (next) onSelect(next);
    },
    search: true,
  });

  tree.render({
    containerWrapper: container,
    fileTreeContainer: container,
  });

  // Counts can change behind us (polling loop); subscribe and trigger a
  // re-render so the decoration callback re-runs against the latest paths
  // (Codex round 1 finding #4 — must use currentPaths, not the initial set).
  const unsubscribe = counts.subscribe(() => {
    tree.resetPaths(currentPaths);
  });

  return {
    setPaths(next) {
      currentPaths = [...next];
      tree.resetPaths(currentPaths);
    },
    setTheme(next) {
      applyThemeVars(container, next);
    },
    setSelection(path) {
      try {
        tree.focusPath(path);
      } catch {
        // Path may be missing if the tree hasn't been resetPaths'd yet.
      }
    },
    openSearch(initial?: string) {
      tree.openSearch(initial ?? '');
    },
    destroy() {
      unsubscribe();
      tree.unmount();
    },
  };
}

function applyThemeVars(el: HTMLElement, theme: TreeThemeInput): void {
  const styles = themeToTreeStyles(theme);
  for (const [k, v] of Object.entries(styles)) {
    el.style.setProperty(k, String(v));
  }
}
