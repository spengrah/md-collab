# guidance-for-sidecar-permission-parity

Status: v0.1 draft

## Intent
Prevent sidecar permission drift by inheriting file mode/group from the paired markdown file during sidecar creation and rewrite.

## Recommended implementation pattern
1. `stat(doc.md)` first and capture `{ uid, gid, mode }`.
2. Perform normal sidecar write (including temp-file + rename if used).
3. Normalize final sidecar path:
   - `chmod(sidecar, doc.mode & 0o777)`
   - `chown(sidecar, doc.uid, doc.gid)` as best-effort
4. If `chown` fails with `EPERM`, continue with warning when mode/group parity is still sufficient.
5. If parity failure leaves sidecar effectively unusable, raise explicit error.

## Practical notes
1. Run normalization after rename, not just on temp file.
2. Avoid widening permissions; copy only source mode bits.
3. Keep behavior deterministic and centralized in one helper used by create + update codepaths.
4. Include operation context in logs (create/update/rewrite, file path, errno class).

## Suggested helper contract
- `ensureSidecarPermissionParity(docPath, sidecarPath): { ok: boolean; warnings: string[] }`

Behavior:
1. Returns `ok=true` for full parity success.
2. Returns `ok=true` + warning when owner parity is blocked but usable parity is retained.
3. Returns `ok=false` when sidecar access is expected to break normal workflows.

## Tests to add
1. Create flow: sidecar mode/group equals markdown mode/group.
2. Rewrite flow (atomic): parity still holds after rename.
3. `EPERM` on owner change: warning path exercised, operation outcome asserted.
4. Regression: comment/reply/resolve flows unchanged except permission normalization side effects.
