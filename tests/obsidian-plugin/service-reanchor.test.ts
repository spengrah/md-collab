import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('../../obsidian-plugin/src/vendor.js', async () => {
  const core = await import('../../dist/index.js');
  return { ...core };
});

import {
  addComment,
  loadState,
  reanchorAll,
  __testOnlyLastDocumentText,
} from '../../obsidian-plugin/src/service.js';

describe('obsidian-plugin service reanchorAll with diffMap', () => {
  beforeEach(() => {
    __testOnlyLastDocumentText.clear();
  });

  it('uses diff-based remapping when document text changes between calls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-obsidian-'));
    try {
      const docPath = join(dir, 'note.md');
      const oldText = 'Line one.\nLine two has anchor text here.\nLine three.\n';
      writeFileSync(docPath, oldText, 'utf8');

      // Create thread anchored to "anchor text" (offset 23..34)
      const state = loadState(docPath);
      const withThread = addComment(state, 'comment on anchor text', 23, 34, 'u1', 'User 1');
      const thread = withThread.sidecar.threads[0];
      expect(thread.anchor.fallback.quote).toBe('anchor text');
      expect(thread.anchor.primary.start.offset_utf16).toBe(23);

      // Seed the lastDocumentText cache
      reanchorAll(withThread);

      // Insert a line before the anchor, shifting it by 15 chars
      const newText = 'Line one.\nInserted line.\nLine two has anchor text here.\nLine three.\n';
      writeFileSync(docPath, newText, 'utf8');

      const reanchored = reanchorAll(withThread);
      const updated = reanchored.sidecar.threads[0];

      expect(updated.anchor.primary.start.offset_utf16).toBe(23 + 15);
      expect(updated.anchor.primary.end.offset_utf16).toBe(34 + 15);
      expect(updated.anchor.anchor_confidence).toBe('high');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to standard reanchor when no previous text is cached', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-obsidian-'));
    try {
      const docPath = join(dir, 'note.md');
      const text = 'hello world\n';
      writeFileSync(docPath, text, 'utf8');

      const state = loadState(docPath);
      const withThread = addComment(state, 'comment', 0, 5, 'u1', 'User 1');

      // No prior call to reanchorAll, so no cached text — should still work
      const result = reanchorAll(withThread);
      expect(result.sidecar.threads[0].anchor.anchor_confidence).toMatch(/high|medium|low|broken/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
