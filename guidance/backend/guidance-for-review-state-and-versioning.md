# guidance-for-review-state-and-versioning

## Intent
Unify review version-context storage and outdatedness evaluation so behavior is deterministic and explainable.

## Guidance
1. Keep v0.2 fields additive; never require migration before use.
2. Reuse existing reanchor engine before assigning orphaned.
3. Keep reason-code mapping centralized and testable.
4. Preserve anchor-at-create as immutable origin context.
5. Cache by doc+HEAD and log invalidation triggers for debugging.

## Anti-patterns
1. Marking outdated based only on line drift.
2. Mixing resolve/reopen semantics with relevance-state transitions.
3. Free-text reason strings without stable codes.
