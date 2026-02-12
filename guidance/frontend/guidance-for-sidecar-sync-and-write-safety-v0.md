# guidance-for-sidecar-sync-and-write-safety-v0

## Intent
Treat sidecar as shared mutable state and avoid accidental data loss.

## Guidance
1. Maintain per-document revision token (mtime/hash) in extension state.
2. Revalidate token before every mutation write.
3. On mismatch, prompt user to reload sidecar and retry operation.
4. Keep write path single-source (all commands through same guarded write helper).

## Suggested implementation pattern
- `loadState()` -> capture token
- `mutateInMemory()`
- `preWriteCheck(token)`
- `writeOrConflict()`

## Anti-patterns
1. Long-lived stale in-memory state with blind write-back.
2. Background watch events that mutate state without UI refresh.
3. Conflict auto-merge in v0 without explicit policy.
