import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../obsidian-plugin/src/vendor.js', async () => {
  const core = await import('../../dist/index.js');
  return {
  revisionTokenForPath: core.revisionTokenForPath,
  sameRevision: core.sameRevision,
  emptySidecar: core.emptySidecar,
  hashText: core.hashText,
  SidecarConflictError: core.SidecarConflictError,
  sidecarPathForDocument: (docPath: string) => docPath.replace(/\.md$/i, '.comments.json'),
  readSidecarFile: () => ({
    schema_version: '0.1.0',
    document: { path: 'note.md' },
    threads: [
      {
        thread_id: 'thread-1',
        status: 'open',
        anchor: {
          primary: {
            start: { line: 1, column: 1, offset_utf16: 0 },
            end: { line: 1, column: 5, offset_utf16: 4 },
          },
          fallback: { quote: 'hello', prefix: '', suffix: ' world', quote_hash: 'q', context_hash: 'c' },
          anchor_confidence: 'high',
        },
        author: { author_id: 'u1', author_label: 'User', verified: null },
        messages: [
          {
            message_id: 'm1',
            author: { author_id: 'u1', author_label: 'User', verified: null },
            body: 'first',
            created_at: '2026-01-01T00:00:00.000Z',
            edited_at: null,
          },
        ],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  }),
  writeSidecarFileAtomic: vi.fn(),
  reply: ({ sidecar }: { sidecar: { threads: unknown[] } }) => sidecar,
  createThread: vi.fn(),
  applySuggestion: vi.fn(),
  applyReanchor: vi.fn(),
  proposeSuggestion: vi.fn(),
  reanchor: vi.fn(),
  rejectSuggestion: vi.fn(),
  reopenThread: vi.fn(),
  resolveThread: vi.fn(),
};
});

import { SidecarConflictError, addReply, loadState } from '../../obsidian-plugin/src/service.js';

describe('obsidian-plugin service conflict recovery', () => {
  it('throws SidecarConflictError when sidecar revision changed before mutation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-obsidian-'));
    try {
      const doc = join(dir, 'note.md');
      const sidecar = join(dir, 'note.comments.json');
      writeFileSync(doc, 'hello world\n', 'utf8');
      writeFileSync(sidecar, '{"schema_version":"0.1.0"}\n', 'utf8');

      const state = loadState(doc);
      writeFileSync(sidecar, '{"schema_version":"0.1.0","changed":true}\n', 'utf8');

      expect(() => addReply(state, 'thread-1', 'new reply', 'u2', 'User 2')).toThrow(SidecarConflictError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
