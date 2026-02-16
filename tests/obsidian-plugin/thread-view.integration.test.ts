import { beforeEach, describe, expect, it, vi } from 'vitest';

class MockEl {
  public readonly children: MockEl[] = [];
  public readonly attrs = new Map<string, string>();
  public readonly classes = new Set<string>();
  public onclick: (() => void) | null = null;

  constructor(public readonly tag: string, public text = '', cls = '') {
    if (cls) {
      for (const token of cls.split(/\s+/).filter(Boolean)) this.classes.add(token);
    }
  }

  empty(): void {
    this.children.length = 0;
  }

  createEl(tag: string, options?: { text?: string; cls?: string }): MockEl {
    const child = new MockEl(tag, options?.text ?? '', options?.cls ?? '');
    this.children.push(child);
    return child;
  }

  createDiv(options?: { text?: string; cls?: string }): MockEl {
    return this.createEl('div', options);
  }

  setAttr(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  addClass(cls: string): void {
    this.classes.add(cls);
  }
}

const notices: string[] = [];
const handleMock = vi.hoisted(() => vi.fn((intent: unknown, context: { state: unknown }) => context.state));

const sampleState = {
  documentPath: 'note.md',
  sidecarPath: 'note.comments.json',
  revisionToken: { exists: true, mtimeMs: 1, size: 1, hash: 'h' },
  sidecar: {
    schema_version: '0.1.0',
    document: { path: 'note.md' },
    threads: [
      {
        thread_id: 't-open',
        status: 'open',
        anchor: {
          primary: { start: { line: 3, column: 2, offset_utf16: 22 }, end: { line: 3, column: 4, offset_utf16: 24 } },
          fallback: { quote: 'open text', prefix: '', suffix: '', quote_hash: 'q1', context_hash: 'c1' },
          anchor_confidence: 'high',
        },
        author: { author_id: 'u1', author_label: 'User', verified: null },
        messages: [{ message_id: 'm1', author: { author_id: 'u1', author_label: 'User', verified: null }, body: 'open body', created_at: '2026-01-01T00:00:00.000Z', edited_at: null }],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        suggestions: [
          {
            suggestion_id: 's-open',
            thread_id: 't-open',
            status: 'proposed',
            proposed_edit: {
              anchor: {
                primary: { start: { line: 3, column: 2, offset_utf16: 22 }, end: { line: 3, column: 4, offset_utf16: 24 } },
                fallback: { quote: 'open text', prefix: '', suffix: '', quote_hash: 'q1', context_hash: 'c1' },
                anchor_confidence: 'high',
              },
              before_text_hash: 'sha256:abc',
              replacement_text: 'replacement',
            },
            proposed_by: { author_id: 'u1', author_label: 'User', verified: null },
            proposed_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      {
        thread_id: 't-resolved',
        status: 'resolved',
        anchor: {
          primary: { start: { line: 8, column: 1, offset_utf16: 44 }, end: { line: 8, column: 4, offset_utf16: 47 } },
          fallback: { quote: 'done text', prefix: '', suffix: '', quote_hash: 'q2', context_hash: 'c2' },
          anchor_confidence: 'high',
        },
        author: { author_id: 'u1', author_label: 'User', verified: null },
        messages: [{ message_id: 'm2', author: { author_id: 'u1', author_label: 'User', verified: null }, body: 'resolved body', created_at: '2026-01-01T00:00:00.000Z', edited_at: null }],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  },
};

vi.mock('obsidian', () => {
  class ItemView {
    public readonly app: unknown;
    public readonly containerEl: MockEl;

    constructor(leaf: { app: unknown; containerEl: MockEl }) {
      this.app = leaf.app;
      this.containerEl = leaf.containerEl;
    }
  }

  class MarkdownView {}

  class Notice {
    constructor(message: string) {
      notices.push(message);
    }
  }

  return { ItemView, MarkdownView, Notice, WorkspaceLeaf: class {}, Plugin: class {} };
});

vi.mock('../../obsidian-plugin/src/intent-router.js', () => ({
  IntentRouter: class {
    handle = handleMock;
  },
}));

vi.mock('../../obsidian-plugin/src/selection.js', () => ({
  normalizeSelection: vi.fn(() => ({ startOffsetUtf16: 0, endOffsetUtf16: 4 })),
}));

vi.mock('../../obsidian-plugin/src/service.js', () => {
  class SidecarConflictError extends Error {}
  return {
    SidecarConflictError,
    loadState: vi.fn(() => structuredClone(sampleState)),
  };
});

import { ThreadPanelView } from '../../obsidian-plugin/src/thread-view.js';
import { SidecarConflictError } from '../../obsidian-plugin/src/service.js';

const findByAriaLabel = (root: MockEl, ariaLabel: string): MockEl | null => {
  if (root.attrs.get('aria-label') === ariaLabel) return root;
  for (const child of root.children) {
    const match = findByAriaLabel(child, ariaLabel);
    if (match) return match;
  }
  return null;
};

const findByText = (root: MockEl, tag: string, text: string): MockEl | null => {
  if (root.tag === tag && root.text === text) return root;
  for (const child of root.children) {
    const match = findByText(child, tag, text);
    if (match) return match;
  }
  return null;
};

const createView = (): { view: ThreadPanelView; root: MockEl; editor: { focus: ReturnType<typeof vi.fn>; setCursor: ReturnType<typeof vi.fn> } } => {
  const root = new MockEl('div');
  const container = new MockEl('div');
  container.children.push(new MockEl('div'), root);

  const editor = {
    somethingSelected: () => true,
    getValue: () => 'open replacement text',
    getCursor: () => ({ line: 0, ch: 0 }),
    focus: vi.fn(),
    setCursor: vi.fn(),
  };

  const markdownView = { file: { path: 'note.md' }, editor };

  const leaf = {
    containerEl: container,
    app: { workspace: { getActiveViewOfType: vi.fn(() => markdownView) } },
  };

  return { view: new ThreadPanelView(leaf as never, {} as never), root, editor };
};

describe('thread panel view integration', () => {
  beforeEach(() => {
    notices.length = 0;
    handleMock.mockReset();
    handleMock.mockImplementation((intent: unknown, context: { state: unknown }) => context.state);
  });

  it('supports expand/collapse interaction', () => {
    const { view, root } = createView();
    view.setDocument('note.md');

    const toggle = findByAriaLabel(root, 'Toggle thread t-open');
    expect(toggle?.attrs.get('aria-expanded')).toBe('false');

    toggle?.onclick?.();
    const expandedToggle = findByAriaLabel(root, 'Toggle thread t-open');
    expect(expandedToggle?.attrs.get('aria-expanded')).toBe('true');
    expect(findByAriaLabel(root, 'Reply to thread t-open')).not.toBeNull();

    expandedToggle?.onclick?.();
    const collapsedToggle = findByAriaLabel(root, 'Toggle thread t-open');
    expect(collapsedToggle?.attrs.get('aria-expanded')).toBe('false');
    expect(findByAriaLabel(root, 'Reply to thread t-open')).toBeNull();
  });

  it('dispatches per-thread actions (reply/resolve/reopen/suggest/jump)', () => {
    const { view, root, editor } = createView();
    view.setDocument('note.md');

    findByAriaLabel(root, 'Toggle thread t-open')?.onclick?.();
    findByAriaLabel(root, 'Toggle thread t-resolved')?.onclick?.();

    findByAriaLabel(root, 'Reply to thread t-open')?.onclick?.();
    findByAriaLabel(root, 'Resolve thread t-open')?.onclick?.();
    findByAriaLabel(root, 'Reopen thread t-resolved')?.onclick?.();
    findByAriaLabel(root, 'Suggest from selected text for thread t-open')?.onclick?.();
    findByAriaLabel(root, 'Jump to anchor for thread t-open')?.onclick?.();

    expect(handleMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reply', threadId: 't-open' }), expect.anything());
    expect(handleMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'resolve', threadId: 't-open' }), expect.anything());
    expect(handleMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reopen', threadId: 't-resolved' }), expect.anything());
    expect(handleMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'propose-suggestion', threadId: 't-open' }), expect.anything());
    expect(editor.focus).toHaveBeenCalled();
    expect(editor.setCursor).toHaveBeenCalledWith({ line: 2, ch: 1 });
  });

  it('dispatches per-suggestion actions (apply/reject/base-context)', () => {
    const { view, root } = createView();
    view.setDocument('note.md');

    findByAriaLabel(root, 'Toggle thread t-open')?.onclick?.();

    findByAriaLabel(root, 'Apply suggestion s-open')?.onclick?.();
    findByAriaLabel(root, 'Reject suggestion s-open')?.onclick?.();
    findByAriaLabel(root, 'View base context for suggestion s-open')?.onclick?.();

    expect(handleMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'apply-suggestion', threadId: 't-open', suggestionId: 's-open' }), expect.anything());
    expect(handleMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reject-suggestion', threadId: 't-open', suggestionId: 's-open' }), expect.anything());
    expect(notices.some((notice) => notice.includes('Base context hash: sha256:abc'))).toBe(true);
  });

  it('shows conflict recovery banner and wires Reload button', () => {
    const { view, root } = createView();
    handleMock.mockImplementation((intent: { kind: string }, context: { state: unknown }) => {
      if (intent.kind === 'resolve') throw new SidecarConflictError('stale sidecar');
      return context.state;
    });

    view.setDocument('note.md');
    findByAriaLabel(root, 'Toggle thread t-open')?.onclick?.();
    findByAriaLabel(root, 'Resolve thread t-open')?.onclick?.();

    expect(findByText(root, 'p', 'Sidecar conflict detected. Reload to recover before retrying.')).not.toBeNull();

    findByAriaLabel(root, 'Reload sidecar after failure')?.onclick?.();
    expect(handleMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reload' }), expect.anything());
    expect(findByText(root, 'p', 'Sidecar conflict detected. Reload to recover before retrying.')).toBeNull();
  });
});
