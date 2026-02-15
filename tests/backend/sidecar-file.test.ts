import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ensureSidecarPermissionParity, parseSidecar, writeSidecarFileAtomic } from '../../src/index.js';

const sidecar = parseSidecar(`{
  "schema_version": "0.1.0",
  "document": {"path": "doc.md"},
  "threads": []
}`);

const modeBits = (path: string) => statSync(path).mode & 0o777;

describe('sidecar atomic writes', () => {
  it('writes valid UTF-8 JSON atomically in target directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-test-'));
    const path = join(dir, 'doc.comments.json');
    writeFileSync(join(dir, 'doc.md'), '# doc\n', 'utf8');

    writeSidecarFileAtomic(path, sidecar);

    const content = readFileSync(path, 'utf8');
    expect(() => parseSidecar(content)).not.toThrow();
  });

  it('normalizes create flow mode/group parity from paired markdown file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-test-'));
    const docPath = join(dir, 'doc.md');
    const sidecarPath = join(dir, 'doc.comments.json');

    writeFileSync(docPath, '# doc\n', 'utf8');
    chmodSync(docPath, 0o640);

    writeSidecarFileAtomic(sidecarPath, sidecar, docPath);

    expect(modeBits(sidecarPath)).toBe(modeBits(docPath));
    expect(statSync(sidecarPath).gid).toBe(statSync(docPath).gid);
  });

  it('normalizes rewrite flow parity on final sidecar path after rename', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-test-'));
    const docPath = join(dir, 'doc.md');
    const sidecarPath = join(dir, 'doc.comments.json');

    writeFileSync(docPath, '# doc\n', 'utf8');
    chmodSync(docPath, 0o640);

    writeSidecarFileAtomic(sidecarPath, sidecar, docPath);
    chmodSync(sidecarPath, 0o600);

    writeSidecarFileAtomic(sidecarPath, sidecar, docPath);

    expect(modeBits(sidecarPath)).toBe(modeBits(docPath));
    expect(statSync(sidecarPath).gid).toBe(statSync(docPath).gid);
  });

  it('surfaces EPERM owner parity as warning path while returning ok', () => {
    const warnings: string[] = [];
    const logger = { warn: (message: string) => warnings.push(message) };

    const fsOps = {
      statSync: vi.fn()
        .mockReturnValueOnce({ uid: 123, gid: 456, mode: 0o100640 })
        .mockReturnValueOnce({ uid: 999, gid: 111, mode: 0o100640 })
        .mockReturnValueOnce({ uid: 999, gid: 456, mode: 0o100640 }),
      chmodSync: vi.fn(),
      chownSync: vi.fn()
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => {
          const err = new Error('operation not permitted') as Error & { code: string };
          err.code = 'EPERM';
          throw err;
        }),
    };

    const result = ensureSidecarPermissionParity('/tmp/doc.md', '/tmp/doc.comments.json', { operation: 'rewrite' }, fsOps, logger);

    expect(result.ok).toBe(true);
    expect(warnings.some((w) => w.includes('owner-parity-blocked errno=EPERM'))).toBe(true);
  });
});
