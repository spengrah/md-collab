import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSidecar, writeSidecarFileAtomic } from '../../src/index.js';

const sidecar = parseSidecar(`{
  "schema_version": "0.1.0",
  "document": {"path": "doc.md"},
  "threads": []
}`);

describe('sidecar atomic writes', () => {
  it('writes valid UTF-8 JSON atomically in target directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'md-collab-test-'));
    const path = join(dir, 'doc.comments.json');

    writeSidecarFileAtomic(path, sidecar);

    const content = readFileSync(path, 'utf8');
    expect(() => parseSidecar(content)).not.toThrow();
  });
});
