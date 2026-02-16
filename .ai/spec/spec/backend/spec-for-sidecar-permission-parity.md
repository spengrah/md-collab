# spec-for-sidecar-permission-parity

Status: draft v0.1  
Scope: backend sidecar file creation/update behavior for POSIX permissions.

## 1. Goal
Ensure newly created and rewritten `*.comments.json` sidecars inherit practical filesystem access parity from their paired Markdown file so normal collaborators can read/write both files in the same workspace.

## 2. Normative requirements

1. **Permission-parity baseline (MDC-BE-016)**
   - On sidecar create and atomic rewrite finalization, md-collab MUST attempt to align sidecar mode bits with the paired markdown file mode bits.

2. **Group parity (MDC-BE-017)**
   - md-collab MUST attempt to align sidecar group ownership (`gid`) with the markdown file `gid`.

3. **Ownership parity best-effort (MDC-BE-018)**
   - md-collab SHOULD attempt to align sidecar owner (`uid`) with markdown file owner when permitted by runtime privileges.
   - If owner alignment is not permitted by OS/runtime policy, operation MAY continue as long as sidecar remains writable/readable for expected collaborators via mode/group parity.

4. **Atomic write compatibility (MDC-BE-019)**
   - If write path uses temp-file + rename, parity normalization MUST occur on the final sidecar path after rename.

5. **No permission broadening beyond source (MDC-BE-020)**
   - Normalization MUST NOT add permissions not present on the source markdown mode bits.

6. **Error handling + observability (MDC-BE-021)**
   - Permission-parity failures MUST be logged with operation type and errno/category.
   - Mutation should fail only when parity failure implies unusable sidecar access for normal operation; otherwise continue with warning.

## 3. Non-goals
1. Managing ACL policy for entire workspace.
2. Cross-platform ACL normalization beyond standard POSIX owner/group/mode behavior.
3. Escalating privileges (no sudo/setuid behaviors).

## 4. Acceptance criteria
1. Creating sidecar beside `doc.md` results in sidecar mode/group matching `doc.md` in normal runtime conditions.
2. Atomic rewrites preserve parity after every write.
3. Permission errors produce explicit diagnostics (not silent drift).
4. Existing comment mutation semantics remain unchanged.
