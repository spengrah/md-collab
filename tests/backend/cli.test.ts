import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli, serializeDeterministic } from '../../src/index.js';

const writeDocAndSidecar = (dir: string, sidecarJson: string, docText = 'hello world\n'): { docPath: string; sidecarPath: string } => {
  const docPath = join(dir, 'doc.md');
  const sidecarPath = join(dir, 'doc.comments.json');
  writeFileSync(docPath, docText, 'utf8');
  writeFileSync(sidecarPath, sidecarJson, 'utf8');
  return { docPath, sidecarPath };
};

describe('agent-safe CLI', () => {
  it('returns schema exit code for invalid sidecar json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-cli-'));
    const { sidecarPath } = writeDocAndSidecar(dir, '{ not valid json');

    const result = runCli(['validate', 'sidecar', '--sidecar', sidecarPath]);
    expect(result.exitCode).toBe(2);
    expect(result.payload.code).toBe('SCHEMA_INVALID');
  });

  it('returns conflict exit code and does not write when rev mismatch', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-cli-'));
    const { docPath, sidecarPath } = writeDocAndSidecar(
      dir,
      serializeDeterministic({ schema_version: '0.1.0', document: { path: 'doc.md' }, threads: [] }),
      'abc def\n',
    );
    const before = readFileSync(sidecarPath, 'utf8');

    const result = runCli([
      'comment',
      'add',
      '--doc',
      docPath,
      '--sidecar',
      sidecarPath,
      '--start',
      '0',
      '--end',
      '2',
      '--body',
      'note',
      '--author-id',
      'a1',
      '--author-label',
      'Agent',
      '--expect-rev',
      'sha256:deadbeef',
    ]);

    expect(result.exitCode).toBe(4);
    expect(result.payload.code).toBe('WRITE_CONFLICT');
    expect(readFileSync(sidecarPath, 'utf8')).toBe(before);
  });

  it('dry-run mutation computes output and does not write', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-cli-'));
    const { docPath, sidecarPath } = writeDocAndSidecar(
      dir,
      serializeDeterministic({ schema_version: '0.1.0', document: { path: 'doc.md' }, threads: [] }),
      'abc def\n',
    );
    const before = readFileSync(sidecarPath, 'utf8');

    const result = runCli([
      'comment',
      'add',
      '--doc',
      docPath,
      '--sidecar',
      sidecarPath,
      '--start',
      '0',
      '--end',
      '2',
      '--body',
      'note',
      '--author-id',
      'a1',
      '--author-label',
      'Agent',
      '--dry-run',
    ]);

    expect(result.exitCode).toBe(0);
    expect((result.payload.data as Record<string, unknown>).dry_run).toBe(true);
    expect(readFileSync(sidecarPath, 'utf8')).toBe(before);
  });

  it('blocks suggestion apply when preflight hash mismatches', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-cli-'));
    const sidecar = {
      schema_version: '0.1.0',
      document: { path: 'doc.md' },
      threads: [
        {
          thread_id: 't1',
          status: 'open',
          anchor: {
            primary: {
              start: { line: 1, column: 1, offset_utf16: 0 },
              end: { line: 1, column: 3, offset_utf16: 2 },
            },
            fallback: { quote: 'abc', prefix: '', suffix: '', quote_hash: 'sha256:q', context_hash: 'sha256:c' },
            anchor_confidence: 'high',
          },
          author: { author_id: 'a1', author_label: 'A', verified: true },
          messages: [
            {
              message_id: 'm1',
              author: { author_id: 'a1', author_label: 'A', verified: true },
              body: 'x',
              created_at: '2026-01-01T00:00:00.000Z',
              edited_at: null,
            },
          ],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          suggestions: [
            {
              suggestion_id: 's1',
              thread_id: 't1',
              status: 'proposed',
              proposed_edit: {
                anchor: {
                  primary: {
                    start: { line: 1, column: 1, offset_utf16: 0 },
                    end: { line: 1, column: 3, offset_utf16: 2 },
                  },
                  fallback: { quote: 'abc', prefix: '', suffix: '', quote_hash: 'sha256:q', context_hash: 'sha256:c' },
                  anchor_confidence: 'high',
                },
                before_text_hash: 'sha256:ffffffff',
                replacement_text: 'XYZ',
              },
              proposed_by: { author_id: 'a1', author_label: 'A', verified: true },
              proposed_at: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    };

    const { docPath, sidecarPath } = writeDocAndSidecar(dir, serializeDeterministic(sidecar), 'abc def\n');
    const result = runCli([
      'suggestion',
      'apply',
      '--doc',
      docPath,
      '--sidecar',
      sidecarPath,
      '--thread-id',
      't1',
      '--suggestion-id',
      's1',
      '--author-id',
      'a2',
      '--author-label',
      'Reviewer',
    ]);

    expect(result.exitCode).toBe(5);
    expect(result.payload.code).toBe('PRECHECK_BLOCKED');
  });

  it('no-op reopen is byte-stable across runs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-cli-'));
    const sidecar = {
      schema_version: '0.1.0',
      document: { path: 'doc.md' },
      threads: [
        {
          thread_id: 't1',
          status: 'open',
          anchor: {
            primary: {
              start: { line: 1, column: 1, offset_utf16: 0 },
              end: { line: 1, column: 3, offset_utf16: 2 },
            },
            fallback: { quote: 'abc', prefix: '', suffix: '', quote_hash: 'sha256:q', context_hash: 'sha256:c' },
            anchor_confidence: 'high',
          },
          author: { author_id: 'a1', author_label: 'A', verified: true },
          messages: [
            {
              message_id: 'm1',
              author: { author_id: 'a1', author_label: 'A', verified: true },
              body: 'x',
              created_at: '2026-01-01T00:00:00.000Z',
              edited_at: null,
            },
          ],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    const { docPath, sidecarPath } = writeDocAndSidecar(dir, serializeDeterministic(sidecar), 'abc def\n');
    const before = readFileSync(sidecarPath, 'utf8');
    const beforeMtime = statSync(sidecarPath).mtimeMs;

    const first = runCli([
      'thread',
      'reopen',
      '--doc',
      docPath,
      '--sidecar',
      sidecarPath,
      '--thread-id',
      't1',
      '--author-id',
      'a2',
      '--author-label',
      'Reviewer',
    ]);
    const second = runCli([
      'thread',
      'reopen',
      '--doc',
      docPath,
      '--sidecar',
      sidecarPath,
      '--thread-id',
      't1',
      '--author-id',
      'a2',
      '--author-label',
      'Reviewer',
    ]);

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(readFileSync(sidecarPath, 'utf8')).toBe(before);
    expect(statSync(sidecarPath).mtimeMs).toBe(beforeMtime);
  });
});
