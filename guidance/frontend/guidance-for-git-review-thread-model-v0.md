# guidance-for-git-review-thread-model-v0

## Intent
Treat comments as review artifacts over evolving versions, not static offsets in mutable text.

## Guidance
1. Keep version fields additive and optional to preserve sidecar compatibility.
2. Prefer explicit reason codes over free-text explanations for UI/state logic.
3. Store both commit SHA and blob SHA when available (blob is stronger file-content evidence).
4. Keep relevance evaluation independent from resolve/reopen state.
5. Record checks with `relevance_checked_at` + `relevance_checked_against_commit` for auditability.

## Anti-patterns
1. Overwriting original anchor-at-create when relinking; retain origin snapshot.
2. Inferring relevance solely from line numbers.
3. Coupling relevance-state transitions to panel UI state.
