import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  SidecarConflictError,
  __testOnlyRelevanceCacheSize,
  addComment,
  emptySidecarForDocument,
  loadStateForDocument,
  preflightApplyThreadSuggestion,
  proposeThreadSuggestion,
  reanchorAll,
  reloadState,
  invalidateRelevanceCache,
  type Config,
} from '../../vscode-extension/src/model.js';

const config: Config = {
  authorId: 'u1',
  authorLabel: 'User 1',
  showResolvedInline: false,
  reanchorOnSave: true,
};

describe('vscode-extension model sidecar lifecycle', () => {
  it('loads missing sidecar as empty in-memory state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-ext-'));
    const docPath = join(dir, 'doc.md');
    writeFileSync(docPath, '# title\nhello\n', 'utf8');

    const state = loadStateForDocument(docPath);
    expect(state.sidecarExists).toBe(false);
    expect(state.readOnly).toBe(false);
    expect(state.sidecar).toEqual(emptySidecarForDocument(docPath));
    expect(state.revisionToken.exists).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it('marks malformed sidecar as read-only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-ext-'));
    const docPath = join(dir, 'doc.md');
    const sidecarPath = join(dir, 'doc.comments.json');
    writeFileSync(docPath, '# title\nhello\n', 'utf8');
    writeFileSync(sidecarPath, '{"schema_version": "0.1.0", bad', 'utf8');

    const state = loadStateForDocument(docPath);
    expect(state.readOnly).toBe(true);
    expect(state.sidecarExists).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });

  it('creates sidecar on first write action', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-ext-'));
    const docPath = join(dir, 'doc.md');
    writeFileSync(docPath, '# title\nhello\n', 'utf8');

    const state = loadStateForDocument(docPath);
    const next = addComment(state, '# title\nhello\n', 8, 13, 'comment', config);

    expect(next.sidecarExists).toBe(true);
    expect(next.sidecar.threads).toHaveLength(1);
    expect(next.revisionToken.exists).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });

  it('supports adding a second comment in the same in-memory session', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-ext-'));
    const docPath = join(dir, 'doc.md');
    const text = '# title\nhello world\n';
    writeFileSync(docPath, text, 'utf8');

    const first = addComment(loadStateForDocument(docPath), text, 8, 13, 'comment 1', config);
    const second = addComment(first, text, 14, 19, 'comment 2', config);

    expect(second.sidecar.threads).toHaveLength(2);
    expect(second.sidecar.threads[0].messages[0].body).toBe('comment 1');
    expect(second.sidecar.threads[1].messages[0].body).toBe('comment 2');

    rmSync(dir, { recursive: true, force: true });
  });

  it('reanchors and persists confidence updates', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-ext-'));
    const docPath = join(dir, 'doc.md');
    writeFileSync(docPath, '# title\nhello\n', 'utf8');

    const withThread = addComment(loadStateForDocument(docPath), '# title\nhello\n', 8, 13, 'comment', config);
    const moved = '# title\nhello world\n';
    const reanchored = reanchorAll(withThread, moved);

    expect(reanchored.sidecar.threads[0].anchor.anchor_confidence).toMatch(/high|medium|low|broken/);

    rmSync(dir, { recursive: true, force: true });
  });

  it('uses diff-based remapping when document text changes between reanchorAll calls', () => {
    invalidateRelevanceCache();

    const dir = mkdtempSync(join(tmpdir(), 'md-collab-ext-'));
    const docPath = join(dir, 'doc.md');
    const oldText = 'Line one.\nLine two has anchor text here.\nLine three.\n';
    writeFileSync(docPath, oldText, 'utf8');

    // Create thread anchored to "anchor text" (offset 23..34 on line 2)
    const withThread = addComment(loadStateForDocument(docPath), oldText, 23, 34, 'comment on anchor text', config);
    const thread = withThread.sidecar.threads[0];
    expect(thread.anchor.fallback.quote).toBe('anchor text');
    expect(thread.anchor.primary.start.offset_utf16).toBe(23);

    // Seed the lastDocumentText cache with oldText by calling reanchorAll once
    writeFileSync(docPath, oldText, 'utf8');
    reanchorAll(withThread, oldText);

    // Now shift anchor text by inserting a new line before it
    const newText = 'Line one.\nInserted line.\nLine two has anchor text here.\nLine three.\n';
    writeFileSync(docPath, newText, 'utf8');

    const reanchored = reanchorAll(withThread, newText);
    const updated = reanchored.sidecar.threads[0];

    // Anchor should have remapped to the new offset (shifted by "Inserted line.\n" = 15 chars)
    expect(updated.anchor.primary.start.offset_utf16).toBe(23 + 15);
    expect(updated.anchor.primary.end.offset_utf16).toBe(34 + 15);
    expect(updated.anchor.anchor_confidence).toBe('high');

    rmSync(dir, { recursive: true, force: true });
  });

  it('detects stale sidecar checkpoint and aborts write without overwriting external changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-ext-'));
    const docPath = join(dir, 'doc.md');
    const sidecarPath = join(dir, 'doc.comments.json');
    writeFileSync(docPath, '# title\nhello\n', 'utf8');

    const seeded = addComment(loadStateForDocument(docPath), '# title\nhello\n', 8, 13, 'seed', config);
    const state = reloadState(seeded);

    const externallyMutated = addComment(reloadState(seeded), '# title\nhello\n', 8, 13, 'external-update', config);
    const beforeAttempt = readFileSync(sidecarPath, 'utf8');
    expect(externallyMutated.sidecar.threads).toHaveLength(2);

    expect(() => addComment(state, '# title\nhello\n', 8, 13, 'stale-write', config)).toThrow(SidecarConflictError);

    const afterAttempt = readFileSync(sidecarPath, 'utf8');
    expect(afterAttempt).toBe(beforeAttempt);
    expect(afterAttempt).toContain('external-update');
    expect(afterAttempt).not.toContain('stale-write');

    rmSync(dir, { recursive: true, force: true });
  });

  it('reloads sidecar state from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-ext-'));
    const docPath = join(dir, 'doc.md');
    writeFileSync(docPath, '# title\nhello\n', 'utf8');

    const first = addComment(loadStateForDocument(docPath), '# title\nhello\n', 8, 13, 'comment 1', config);
    const second = addComment(reloadState(first), '# title\nhello\n', 8, 13, 'comment 2', config);

    const reloaded = reloadState(second);
    expect(reloaded.sidecar.threads).toHaveLength(2);

    rmSync(dir, { recursive: true, force: true });
  });

  it('preflight apply marks suggestion obsolete on hash mismatch before document mutation step', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-ext-'));
    const docPath = join(dir, 'doc.md');
    writeFileSync(docPath, '# title\nhello\n', 'utf8');

    const withThread = addComment(loadStateForDocument(docPath), '# title\nhello\n', 8, 13, 'comment', config);
    const thread = withThread.sidecar.threads[0];
    const withSuggestion = proposeThreadSuggestion(withThread, thread.thread_id, thread.anchor, 'hello', 'HELLO', config);
    const suggestionId = withSuggestion.sidecar.threads[0].suggestions?.[0].suggestion_id;
    expect(suggestionId).toBeTruthy();

    const preflight = preflightApplyThreadSuggestion(withSuggestion, thread.thread_id, suggestionId!, 'goodbye', config);
    expect(preflight.ok).toBe(false);
    if (!preflight.ok) {
      expect(preflight.reason).toBe('HASH_MISMATCH');
      expect(preflight.state.sidecar.threads[0].suggestions?.[0].status).toBe('obsolete');
      expect(preflight.state.sidecar.threads[0].messages.at(-1)?.body).toContain('obsolete');
    }

    rmSync(dir, { recursive: true, force: true });
  });

  it('explicitly invalidates relevance cache on HEAD changes in git timeline', () => {
    invalidateRelevanceCache();

    const dir = mkdtempSync(join(tmpdir(), 'md-collab-ext-'));
    const docPath = join(dir, 'doc.md');
    writeFileSync(docPath, '# title\nhello\n', 'utf8');

    execSync('git init', { cwd: dir });
    execSync('git config user.email "test@example.com"', { cwd: dir });
    execSync('git config user.name "Test User"', { cwd: dir });
    execSync('git add doc.md', { cwd: dir });
    execSync('git commit -m "initial"', { cwd: dir });

    const gitConfig: Config = { ...config, timelineKind: 'git' };
    const first = addComment(loadStateForDocument(docPath), '# title\nhello\n', 8, 13, 'comment', config);
    const reloaded1 = reloadState(first, gitConfig);
    const cacheAfterFirstEval = __testOnlyRelevanceCacheSize();

    writeFileSync(docPath, '# title\nhello world\n', 'utf8');
    execSync('git add doc.md', { cwd: dir });
    execSync('git commit -m "head-change"', { cwd: dir });

    const reloaded2 = reloadState(reloaded1, gitConfig);
    expect(reloaded2.sidecar.threads.length).toBe(1);
    expect(__testOnlyRelevanceCacheSize()).toBe(cacheAfterFirstEval);

    rmSync(dir, { recursive: true, force: true });
  });
});
