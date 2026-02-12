import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseSidecar } from './schema.js';
import { serializeDeterministic } from './serializer.js';
import type { Sidecar } from './types.js';

export const readSidecarFile = (path: string): Sidecar => parseSidecar(readFileSync(path, 'utf8'));

export const writeSidecarFileAtomic = (path: string, sidecar: Sidecar): void => {
  const dir = dirname(path);
  const tmpDir = mkdtempSync(join(tmpdir(), 'md-collab-'));
  const tmpPath = join(tmpDir, 'tmp.comments.json');
  try {
    writeFileSync(tmpPath, serializeDeterministic(sidecar), 'utf8');
    renameSync(tmpPath, path);
    // sanity re-read
    readSidecarFile(path);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
};

export const sidecarPathForDocument = (docPath: string): string => docPath.replace(/\.md$/i, '.comments.json');
