# guidance-for-comments-sidecar

Status: v0.1 draft  
Project: md-collab

## Intent
Keep comment metadata robust for humans and agents while minimizing complexity in MVP single-workspace mode.

## Practical guidance
1. Prefer additive updates over structural rewrites.
2. Keep thread/message IDs immutable forever.
3. Keep attribution minimal for v0.1 (`author_id`, `author_label`, `verified`).
4. Treat `verified` as advisory, not security proof, in MVP.

## Write strategy
1. Read latest sidecar from disk.
2. Apply minimal in-memory patch.
3. Validate schema before write.
4. Atomic write via temp file + rename.
5. Re-read and sanity-check immediately after write.

## Common pitfalls
1. Reformatting entire file on every operation (causes noisy diffs and fragility).
2. Replacing message arrays wholesale instead of appending/updating one node.
3. Generating non-UTC timestamps.
4. Forgetting to update `updated_at` on thread-changing operations.

## MVP mode note
Since sidecars are gitignored in v0.1 MVP, optimize for local consistency and recovery, not merge complexity.

## Logging recommendations
- Log operation type, thread/message IDs, outcome, and error class.
- Never log full comment text by default in operational logs.

## Migration posture
Design now so Git-tracked mode can be enabled later without schema breakage.
