import { closeSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseSidecar } from './schema.js';
import { serializeDeterministic } from './serializer.js';
import type { Sidecar } from './types.js';

export const readSidecarFile = (path: string): Sidecar => parseSidecar(readFileSync(path, 'utf8'));

const fsyncDirectory = (path: string): void => {
  let dirFd: number | null = null;
  try {
    dirFd = openSync(path, 'r');
    fsyncSync(dirFd);
  } catch {
    // Best-effort directory fsync (platform/filesystem dependent).
  } finally {
    if (dirFd !== null) closeSync(dirFd);
  }
};

export const writeSidecarFileAtomic = (path: string, sidecar: Sidecar): void => {
  const dir = dirname(path);
  const tmpPath = join(dir, `.${randomUUID()}.tmp.comments.json`);
  const payload = serializeDeterministic(sidecar);
  let fd: number | null = null;

  try {
    fd = openSync(tmpPath, 'wx', 0o600);
    writeSync(fd, payload, undefined, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = null;

    renameSync(tmpPath, path);
    fsyncDirectory(dir);

    // sanity re-read
    readSidecarFile(path);
  } finally {
    if (fd !== null) closeSync(fd);
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore cleanup failures
    }
  }
};

export const sidecarPathForDocument = (docPath: string): string => docPath.replace(/\.md$/i, '.comments.json');
