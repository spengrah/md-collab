# guidance-for-reanchoring-engine

Status: v0.2 draft

## Intent
Maintain trust in comments by prioritizing correctness over aggressive auto-relinking.

## Guidance
1. Bias toward `broken` when uncertain.
2. Keep reason codes visible for debugging and user trust.
3. Recompute on open/save/manual refresh; avoid expensive continuous recomputation unless needed.
4. Keep algorithm parameters explicit and configurable in one place.

## UX recommendations
1. Show a subtle badge for `medium`/`low` confidence.
2. Show action CTA for `broken`: “Re-anchor this thread”.
3. Default resolved threads panel-only; low-confidence inline markers may also be optionally hidden.

## Operational tips
1. Store last re-anchor outcome timestamp for observability.
2. Add a command to re-run re-anchoring for all threads in file.
3. Keep fixture corpus as the source of truth for behavior stability.

## Performance notes (v0.2)
1. Full-sweep re-anchoring on open/save/manual refresh is acceptable for v0.1 target sizes.
2. Skip resolved threads during inline rendering work, but keep panel metadata valid.
3. Diff-based remapping (see `guidance-for-diff-based-anchor-remapping.md`) replaces brute-force fuzzy search for the common case. Use it when base text is available.
4. Status-only mutations (resolve, reopen, reply) should not trigger relevance re-evaluation. The document hasn't changed, so anchors can't have moved.
5. Already-broken anchors should short-circuit in relevance evaluation. Re-running fuzzy search on the same document produces the same broken result.

## Anti-patterns
1. Re-anchoring with non-deterministic randomness.
2. Attaching to first fuzzy match without tie checks.
3. Changing thresholds silently between versions.
