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

## Performance notes (v0.3)
1. Full-sweep re-anchoring on open/save/manual refresh is acceptable for v0.1 target sizes.
2. Skip resolved threads during inline rendering work, but keep panel metadata valid.
3. Diff-based remapping (see `guidance-for-diff-based-anchor-remapping.md`) replaces brute-force fuzzy search for the common case. Use it when base text is available.
4. Status-only mutations (resolve, reopen, reply) should not trigger relevance re-evaluation. The document hasn't changed, so anchors can't have moved.
5. **Fuzzy budget**: The fuzzy loop checks `performance.now()` every 64 iterations and breaks at `fuzzyBudgetMs` (default 200ms). This caps worst-case per anchor to ~200ms. Checking every iteration would add overhead from `performance.now()` calls.
6. **Reanchor result cache**: A module-level `Map<string, ReanchorOutput>` in `operations.ts` caches results keyed on `hash(documentText)::quote_hash::context_hash`. Same document + same anchor = instant cache hit. LRU eviction at 200 entries. Call `invalidateReanchorCache()` from frontends when document content changes.
7. **Broken-anchor recovery**: Broken anchors are no longer short-circuited. When the document text changes (cache miss on new hash), broken anchors re-run reanchor with the budget cap. If the original text is restored, the anchor recovers. When text is unchanged, the cache returns `broken` instantly — same perf as the old short-circuit.
8. **Global unique exact match**: When a quote exists exactly once in the document but outside the ±W nearby window, the algorithm returns `high`/`exact_global` instead of falling through to fuzzy or broken. This handles large offset shifts from document restructuring (e.g. table changes, section reordering) without increasing W or fuzzy search cost.

## Anti-patterns
1. Re-anchoring with non-deterministic randomness.
2. Attaching to first fuzzy match without tie checks.
3. Changing thresholds silently between versions.
