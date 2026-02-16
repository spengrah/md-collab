import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../obsidian-plugin/src/vendor.js', async () => {
  const core = await import('../../dist/index.js');
  return {
    applySuggestion: core.applySuggestion,
    sidecarPathForDocument: (docPath: string) => docPath.replace(/\.md$/i, '.comments.json'),
    readSidecarFile: (path: string) => JSON.parse(readFileSync(path, 'utf8')),
    writeSidecarFileAtomic: (path: string, sidecar: unknown) => writeFileSync(path, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8'),
    applyReanchor: core.applyReanchor,
    createThread: core.createThread,
    proposeSuggestion: core.proposeSuggestion,
    reanchor: core.reanchor,
    rejectSuggestion: core.rejectSuggestion,
    reopenThread: core.reopenThread,
    resolveThread: core.resolveThread,
    revisionTokenForPath: core.revisionTokenForPath,
    sameRevision: core.sameRevision,
    emptySidecar: core.emptySidecar,
    hashText: core.hashText,
    SidecarConflictError: core.SidecarConflictError,
  };
});

import { IntentRouter } from '../../obsidian-plugin/src/intent-router.js';
import { loadState } from '../../obsidian-plugin/src/service.js';

describe('obsidian-plugin apply-suggestion integration', () => {
  it('marks suggestion obsolete on hash mismatch through plugin intent routing and persists it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-obsidian-'));
    try {
      const docPath = join(dir, 'note.md');
      const sidecarPath = join(dir, 'note.comments.json');

      writeFileSync(docPath, 'hello world\n', 'utf8');
      writeFileSync(
        sidecarPath,
        JSON.stringify(
          {
            schema_version: '0.1.0',
            document: { path: docPath },
            threads: [
              {
                thread_id: 'thread-1',
                status: 'open',
                anchor: {
                  primary: {
                    start: { line: 1, column: 1, offset_utf16: 0 },
                    end: { line: 1, column: 5, offset_utf16: 4 },
                  },
                  fallback: { quote: 'hello', prefix: '', suffix: ' world', quote_hash: 'q1', context_hash: 'c1' },
                  anchor_confidence: 'high',
                },
                author: { author_id: 'u1', author_label: 'User', verified: null },
                messages: [
                  {
                    message_id: 'm1',
                    author: { author_id: 'u1', author_label: 'User', verified: null },
                    body: 'initial',
                    created_at: '2026-01-01T00:00:00.000Z',
                    edited_at: null,
                  },
                ],
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-01T00:00:00.000Z',
                suggestions: [
                  {
                    suggestion_id: 's1',
                    thread_id: 'thread-1',
                    status: 'proposed',
                    proposed_edit: {
                      anchor: {
                        primary: {
                          start: { line: 1, column: 1, offset_utf16: 0 },
                          end: { line: 1, column: 5, offset_utf16: 4 },
                        },
                        fallback: { quote: 'hello', prefix: '', suffix: ' world', quote_hash: 'q1', context_hash: 'c1' },
                        anchor_confidence: 'high',
                      },
                      before_text_hash: 'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
                      replacement_text: 'hola',
                    },
                    proposed_by: { author_id: 'u1', author_label: 'User', verified: null },
                    proposed_at: '2026-01-01T00:00:00.000Z',
                  },
                ],
              },
            ],
          },
          null,
          2,
        ),
      );

      const router = new IntentRouter();
      const state = loadState(docPath);

      const updated = router.handle(
        { kind: 'apply-suggestion', threadId: 'thread-1', suggestionId: 's1', beforeText: 'HELLO' },
        { state, author: { authorId: 'u2', authorLabel: 'Reviewer' } },
      );

      const suggestion = updated.sidecar.threads[0].suggestions?.[0];
      expect(suggestion?.status).toBe('obsolete');
      expect(suggestion?.decision?.decision_reason).toContain('Hash mismatch');
      expect(updated.sidecar.threads[0].messages.at(-1)?.body).toContain('obsolete');

      const persisted = loadState(docPath);
      const persistedSuggestion = persisted.sidecar.threads[0].suggestions?.[0];
      expect(persistedSuggestion?.status).toBe('obsolete');
      expect(persisted.sidecar.threads[0].messages.at(-1)?.body).toContain('obsolete');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
