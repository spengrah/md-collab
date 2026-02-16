import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main, runCli, serializeDeterministic } from '../../src/index.js';

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

  it('applies suggestion when preflight hash matches and reports apply decision', () => {
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
                before_text_hash: 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
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

    expect(result.exitCode).toBe(0);
    const data = result.payload.data as {
      preflight: { decision: string; anchor_viable: boolean; current_text_hash: string | null; expected_before_text_hash: string };
    };
    expect(data.preflight.decision).toBe('apply');
    expect(data.preflight.anchor_viable).toBe(true);
    expect(data.preflight.current_text_hash).toBe(data.preflight.expected_before_text_hash);

    const saved = JSON.parse(readFileSync(sidecarPath, 'utf8'));
    expect(saved.threads[0].suggestions[0].status).toBe('applied');
  });

  it('marks suggestion obsolete when preflight hash mismatches but anchor is viable', () => {
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

    expect(result.exitCode).toBe(0);
    const data = result.payload.data as {
      preflight: { decision: string; anchor_viable: boolean; current_text_hash: string | null; expected_before_text_hash: string };
    };
    expect(data.preflight.decision).toBe('obsolete');
    expect(data.preflight.anchor_viable).toBe(true);
    expect(data.preflight.current_text_hash).not.toBe(data.preflight.expected_before_text_hash);

    const saved = JSON.parse(readFileSync(sidecarPath, 'utf8'));
    expect(saved.threads[0].suggestions[0].status).toBe('obsolete');
  });

  it('emits a single output envelope by default for mutating commands', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-cli-'));
    const { docPath, sidecarPath } = writeDocAndSidecar(
      dir,
      serializeDeterministic({ schema_version: '0.1.0', document: { path: 'doc.md' }, threads: [] }),
      'abc def\n',
    );

    const out: string[] = [];
    const err: string[] = [];
    const exitCode = main(
      [
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
      ],
      {
        stdout: (line) => out.push(line),
        stderr: (line) => err.push(line),
      },
    );

    expect(exitCode).toBe(0);
    expect(err).toEqual([]);
    expect(out).toHaveLength(1);
    expect(() => JSON.parse(out[0])).not.toThrow();
  });

  it('returns structured validation payload for strict invariant failures', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-cli-'));
    const invalidStrict = {
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
              decision: {
                decided_by: { author_id: 'a1', author_label: 'A', verified: true },
                decided_at: '2026-01-01T00:00:00.000Z',
              },
            },
          ],
        },
      ],
    };
    const { sidecarPath } = writeDocAndSidecar(dir, serializeDeterministic(invalidStrict));

    const result = runCli(['validate', 'sidecar', '--sidecar', sidecarPath, '--strict']);
    expect(result.exitCode).toBe(2);
    expect(result.payload.code).toBe('SCHEMA_INVALID');
    const data = result.payload.data as { valid: boolean; errors: string[]; strict: boolean };
    expect(data.valid).toBe(false);
    expect(data.strict).toBe(true);
    expect(data.errors.some((entry) => entry.includes('proposed suggestions must not include decision'))).toBe(true);
  });

  it('maps PRECHECK_BLOCKED to deterministic exit code for non-viable suggestions', () => {
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
                    start: { line: 1, column: 50, offset_utf16: 49 },
                    end: { line: 1, column: 60, offset_utf16: 59 },
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
