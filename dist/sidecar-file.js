import { closeSync, chmodSync, chownSync, fsyncSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseSidecar } from './schema.js';
import { serializeDeterministic } from './serializer.js';
const defaultParityFs = {
    statSync,
    chmodSync,
    chownSync,
};
const defaultParityLogger = {
    warn: (message) => console.warn(message),
};
const chmodMask = 0o777;
const normalizeModeBits = (mode) => mode & chmodMask;
const warnParity = (warnings, logger, operation, sidecarPath, reason) => {
    const message = `[md-collab][permissions] sidecar parity warning op=${operation} path=${sidecarPath} reason=${reason}`;
    warnings.push(message);
    logger.warn(message);
};
export const ensureSidecarPermissionParity = (docPath, sidecarPath, context = {}, fsOps = defaultParityFs, logger = defaultParityLogger) => {
    const operation = context.operation ?? 'unknown';
    const warnings = [];
    const docStat = fsOps.statSync(docPath);
    const targetMode = normalizeModeBits(docStat.mode);
    fsOps.chmodSync(sidecarPath, targetMode);
    try {
        const sidecarStatAfterMode = fsOps.statSync(sidecarPath);
        fsOps.chownSync(sidecarPath, sidecarStatAfterMode.uid, docStat.gid);
    }
    catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : 'UNKNOWN';
        warnParity(warnings, logger, operation, sidecarPath, `group-parity-failed errno=${code}`);
    }
    try {
        fsOps.chownSync(sidecarPath, docStat.uid, docStat.gid);
    }
    catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : 'UNKNOWN';
        if (code === 'EPERM') {
            warnParity(warnings, logger, operation, sidecarPath, 'owner-parity-blocked errno=EPERM');
        }
        else {
            warnParity(warnings, logger, operation, sidecarPath, `owner-parity-failed errno=${code}`);
        }
    }
    const sidecarStat = fsOps.statSync(sidecarPath);
    const sidecarMode = normalizeModeBits(sidecarStat.mode);
    if (sidecarMode !== targetMode) {
        return { ok: false, warnings: [...warnings, `mode-mismatch expected=${targetMode.toString(8)} actual=${sidecarMode.toString(8)}`] };
    }
    return { ok: true, warnings };
};
export const readSidecarFile = (path) => parseSidecar(readFileSync(path, 'utf8'));
const fsyncDirectory = (path) => {
    let dirFd = null;
    try {
        dirFd = openSync(path, 'r');
        fsyncSync(dirFd);
    }
    catch {
        // Best-effort directory fsync (platform/filesystem dependent).
    }
    finally {
        if (dirFd !== null)
            closeSync(dirFd);
    }
};
export const writeSidecarFileAtomic = (path, sidecar, docPath = path.replace(/\.comments\.json$/i, '.md')) => {
    const dir = dirname(path);
    let operation = 'rewrite';
    try {
        statSync(path);
    }
    catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : 'UNKNOWN';
        if (code === 'ENOENT') {
            operation = 'create';
        }
        else {
            throw err;
        }
    }
    const tmpPath = join(dir, `.${randomUUID()}.tmp.comments.json`);
    const payload = serializeDeterministic(sidecar);
    let fd = null;
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
    }
    finally {
        if (fd !== null)
            closeSync(fd);
        try {
            unlinkSync(tmpPath);
        }
        catch {
            // ignore cleanup failures
        }
    }
};
export const sidecarPathForDocument = (docPath) => docPath.replace(/\.md$/i, '.comments.json');
//# sourceMappingURL=sidecar-file.js.map
//# sourceMappingURL=sidecar-file.js.map
