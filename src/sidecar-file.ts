import { closeSync, chmodSync, chownSync, fsyncSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseSidecar } from './schema.js';
import { serializeDeterministic } from './serializer.js';
import type { Sidecar } from './types.js';

export interface SidecarPermissionParityResult {
  ok: boolean;
  warnings: string[];
}

interface SidecarPermissionParityContext {
  operation: 'create' | 'rewrite' | 'unknown';
}

interface SidecarPermissionParityFs {
  statSync: typeof statSync;
  chmodSync: typeof chmodSync;
  chownSync: typeof chownSync;
}

interface SidecarPermissionParityLogger {
  warn: (message: string) => void;
}

const defaultParityFs: SidecarPermissionParityFs = {
  statSync,
  chmodSync,
  chownSync,
};

const defaultParityLogger: SidecarPermissionParityLogger = {
  warn: (message: string) => console.warn(message),
};

const chmodMask = 0o777;

const normalizeModeBits = (mode: number): number => mode & chmodMask;

const errnoOf = (err: unknown): string => (
  err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : 'UNKNOWN'
);

const warnParity = (
  warnings: string[],
  logger: SidecarPermissionParityLogger,
  operation: SidecarPermissionParityContext['operation'],
  sidecarPath: string,
  reason: string,
): void => {
  const message = `[md-collab][permissions] sidecar parity warning op=${operation} path=${sidecarPath} reason=${reason}`;
  warnings.push(message);
  logger.warn(message);
};

const expectedCollaboratorUsable = (
  targetMode: number,
  finalMode: number,
  groupParity: boolean,
): boolean => {
  const requiredGroupBits = targetMode & 0o070;
  const requiredOtherBits = targetMode & 0o007;
  const groupUsable = requiredGroupBits === 0 || (groupParity && (finalMode & requiredGroupBits) === requiredGroupBits);
  const otherUsable = (finalMode & requiredOtherBits) === requiredOtherBits;
  return groupUsable && otherUsable;
};

export const ensureSidecarPermissionParity = (
  docPath: string,
  sidecarPath: string,
  context: Partial<SidecarPermissionParityContext> = {},
  fsOps: SidecarPermissionParityFs = defaultParityFs,
  logger: SidecarPermissionParityLogger = defaultParityLogger,
): SidecarPermissionParityResult => {
  const operation = context.operation ?? 'unknown';
  const warnings: string[] = [];

  const docStat = fsOps.statSync(docPath);
  const targetMode = normalizeModeBits(docStat.mode);

  try {
    fsOps.chmodSync(sidecarPath, targetMode);
  } catch (err) {
    warnParity(warnings, logger, operation, sidecarPath, `mode-normalization-failed errno=${errnoOf(err)}`);
  }

  try {
    const sidecarStatAfterMode = fsOps.statSync(sidecarPath);
    fsOps.chownSync(sidecarPath, sidecarStatAfterMode.uid, docStat.gid);
  } catch (err) {
    warnParity(warnings, logger, operation, sidecarPath, `group-parity-failed errno=${errnoOf(err)}`);
  }

  try {
    fsOps.chownSync(sidecarPath, docStat.uid, docStat.gid);
  } catch (err) {
    const code = errnoOf(err);
    if (code === 'EPERM') {
      warnParity(warnings, logger, operation, sidecarPath, 'owner-parity-blocked errno=EPERM');
    } else {
      warnParity(warnings, logger, operation, sidecarPath, `owner-parity-failed errno=${code}`);
    }
  }

  const sidecarStat = fsOps.statSync(sidecarPath);
  const sidecarMode = normalizeModeBits(sidecarStat.mode);
  const groupParity = sidecarStat.gid === docStat.gid;

  if (sidecarMode !== targetMode) {
    warnParity(warnings, logger, operation, sidecarPath, `mode-mismatch expected=${targetMode.toString(8)} actual=${sidecarMode.toString(8)}`);
  }
  if (!groupParity) {
    warnParity(warnings, logger, operation, sidecarPath, `group-mismatch expected=${docStat.gid} actual=${sidecarStat.gid}`);
  }

  const usable = expectedCollaboratorUsable(targetMode, sidecarMode, groupParity);
  if (!usable) {
    warnParity(warnings, logger, operation, sidecarPath, 'sidecar-unusable-for-expected-collaborators');
    return { ok: false, warnings };
  }

  return { ok: true, warnings };
};

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

export const writeSidecarFileAtomic = (path: string, sidecar: Sidecar, docPath = path.replace(/\.comments\.json$/i, '.md')): void => {
  const dir = dirname(path);
  let operation: SidecarPermissionParityContext['operation'] = 'rewrite';
  try {
    statSync(path);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : 'UNKNOWN';
    if (code === 'ENOENT') {
      operation = 'create';
    } else {
      throw err;
    }
  }
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

    const parity = ensureSidecarPermissionParity(docPath, path, { operation });
    if (!parity.ok) {
      throw new Error(`failed to normalize sidecar permissions for ${path}`);
    }

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
