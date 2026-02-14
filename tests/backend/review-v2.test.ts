import { describe, expect, it } from 'vitest';
import {
  createThread,
  evaluateSidecarRelevance,
  parseSidecar,
  proposeSuggestion,
  applySuggestion,
  rejectSuggestion,
  serializeDeterministic,
} from '../../src/index.js';

const author = { author_id: 'u1', author_label: 'User 1', verified: null };

describe('review v0.2 additive model', () => {
  it('creates workspace-first timeline context and message context additively', () => {
    const base = parseSidecar('{"schema_version":"0.1.0","document":{"path":"doc.md"},"threads":[]}');
    const text = 'hello world';
    const sidecar = createThread({
      sidecar: base,
      text,
      startOffsetUtf16: 0,
      endOffsetUtf16: 5,
      body: 'note',
      author,
      threadId: 't1',
      messageId: 'm1',
      timelineKind: 'workspace',
      workspaceSnapshotId: 'ws-1',
      filePathAtCreate: 'doc.md',
      now: '2026-02-14T17:00:00Z',
    });

    expect(sidecar.threads[0].thread_version_context?.kind).toBe('workspace');
    expect(sidecar.threads[0].messages[0].message_version_context?.seen_workspace_snapshot_id).toBe('ws-1');
  });

  it('evaluates relevance deterministically for workspace unavailable and content change', () => {
    const base = parseSidecar('{"schema_version":"0.1.0","document":{"path":"doc.md"},"threads":[]}');
    const text = 'hello world';
    const created = createThread({
      sidecar: base,
      text,
      startOffsetUtf16: 0,
      endOffsetUtf16: 5,
      body: 'note',
      author,
      threadId: 't1',
      messageId: 'm1',
      timelineKind: 'workspace',
      workspaceSnapshotId: 'ws-1',
      workspaceFileHash: 'sha256:a',
      filePathAtCreate: 'doc.md',
    });

    const noWorkspace = evaluateSidecarRelevance(created, { timelineKind: 'workspace' }, '2026-02-14T17:05:00Z');
    expect(noWorkspace.threads[0].relevance_state).toBe('outdated');
    expect(noWorkspace.threads[0].relevance_reason).toBe('WORKSPACE_CONTEXT_UNAVAILABLE');

    const changed = evaluateSidecarRelevance(
      created,
      { timelineKind: 'workspace', workspaceSnapshotId: 'ws-2', workspaceFileHash: 'sha256:b', currentPath: 'doc.md' },
      '2026-02-14T17:05:01Z',
    );
    expect(changed.threads[0].relevance_state).toBe('outdated');
    expect(changed.threads[0].relevance_reason).toBe('CONTENT_CHANGED');
  });

  it('sets ANCHOR_RELOCATED and FILE_DELETED reasons through deterministic pipeline ordering', () => {
    const base = parseSidecar('{"schema_version":"0.1.0","document":{"path":"doc.md"},"threads":[]}');
    const text = 'hello world';
    const created = createThread({
      sidecar: base,
      text,
      startOffsetUtf16: 0,
      endOffsetUtf16: 5,
      body: 'note',
      author,
      threadId: 't1',
      messageId: 'm1',
      timelineKind: 'git',
      baseCommit: 'a',
      headCommit: 'a',
      filePathAtCreate: 'doc.md',
      now: '2026-02-14T17:00:00Z',
    });

    const relocated = evaluateSidecarRelevance(
      created,
      { timelineKind: 'workspace', workspaceSnapshotId: 'ws-1', documentText: 'x hello world' },
      '2026-02-14T17:05:00Z',
    );
    expect(relocated.threads[0].relevance_reason).toBe('ANCHOR_RELOCATED');

    const deleted = evaluateSidecarRelevance(
      created,
      { timelineKind: 'git', gitAvailable: true, fileExists: false, headCommit: 'a' },
      '2026-02-14T17:05:01Z',
    );
    expect(deleted.threads[0].relevance_state).toBe('orphaned');
    expect(deleted.threads[0].relevance_reason).toBe('FILE_DELETED');
  });

  it('suggestion lifecycle preserves hash mismatch safety and appends audit', () => {
    const base = parseSidecar('{"schema_version":"0.1.0","document":{"path":"doc.md"},"threads":[]}');
    const text = 'hello world';
    const created = createThread({
      sidecar: base,
      text,
      startOffsetUtf16: 0,
      endOffsetUtf16: 5,
      body: 'note',
      author,
      threadId: 't1',
      messageId: 'm1',
    });

    const proposed = proposeSuggestion({
      sidecar: created,
      threadId: 't1',
      suggestionId: 's1',
      author,
      anchor: created.threads[0].anchor,
      beforeTextHash: 'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      replacementText: 'HELLO',
      now: '2026-02-14T17:10:00Z',
    });

    const mismatched = applySuggestion({
      sidecar: proposed,
      threadId: 't1',
      suggestionId: 's1',
      actor: author,
      beforeText: 'goodbye',
      now: '2026-02-14T17:11:00Z',
    });

    expect(mismatched.threads[0].suggestions?.[0].status).toBe('obsolete');
    expect(mismatched.threads[0].messages.at(-1)?.body).toContain('obsolete');

    const rejected = rejectSuggestion({
      sidecar: proposed,
      threadId: 't1',
      suggestionId: 's1',
      actor: author,
      now: '2026-02-14T17:12:00Z',
    });
    expect(rejected.threads[0].suggestions?.[0].status).toBe('rejected');
  });

  it('round-trips unknown fields (v0.1 compatibility)', () => {
    const sidecar = parseSidecar(
      JSON.stringify({
        schema_version: '0.1.0',
        document: { path: 'doc.md', custom_document_field: true },
        threads: [],
        unknown_root: { x: 1 },
      }),
    ) as any;

    const out = JSON.parse(serializeDeterministic(sidecar));
    expect(out.unknown_root).toEqual({ x: 1 });
    expect(out.document.custom_document_field).toBe(true);
  });
});
