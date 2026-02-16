import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import type { Sidecar } from './types.js';

export interface SidecarRevisionToken {
  exists: boolean;
  mtimeMs: number | null;
  size: number | null;
  hash: string | null;
}

export class SidecarConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SidecarConflictError';
  }
}

export const revisionTokenForPath = (path: string): SidecarRevisionToken => {
  try {
    const stat = statSync(path);
    const payload = readFileSync(path, 'utf8');
    const hash = createHash('sha256').update(payload).digest('hex');
    return { exists: true, mtimeMs: stat.mtimeMs, size: stat.size, hash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ENOENT')) {
      return { exists: false, mtimeMs: null, size: null, hash: null };
    }
    throw err;
  }
};

export const sameRevision = (a: SidecarRevisionToken, b: SidecarRevisionToken): boolean =>
  a.exists === b.exists && a.mtimeMs === b.mtimeMs && a.size === b.size && a.hash === b.hash;

export const emptySidecar = (docPath: string): Sidecar => ({
  schema_version: '0.1.0',
  document: { path: docPath },
  threads: [],
});

export const hashText = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;
