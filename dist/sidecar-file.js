import { closeSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseSidecar } from './schema.js';
import { serializeDeterministic } from './serializer.js';
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
export const writeSidecarFileAtomic = (path, sidecar) => {
    const dir = dirname(path);
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
