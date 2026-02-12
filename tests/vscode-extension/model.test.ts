import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  addComment,
  emptySidecarForDocument,
  loadStateForDocument,
  reanchorAll,
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
});
