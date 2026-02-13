# guidance-for-review-state-and-versioning

## Intent
Unify review version-context storage and outdatedness evaluation so behavior is deterministic and explainable.

## Guidance
1. Keep v0.2 fields additive; never require migration before use.
2. Design for workspace-first collaboration; Git context is enrichment, not prerequisite.
3. Reuse existing reanchor engine before assigning orphaned.
4. Keep reason-code mapping centralized and testable.
5. Preserve anchor-at-create as immutable origin context.
6. Cache by doc+timeline key (`workspace_snapshot_id` and/or HEAD) and log invalidation triggers.

## Anti-patterns
1. Marking outdated based only on line drift.
2. Requiring commit IDs for draft-stage collaboration.
3. Mixing resolve/reopen semantics with relevance-state transitions.
4. Free-text reason strings without stable codes.
