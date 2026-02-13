# guidance-for-version-aware-outdatedness-v0

## Intent
Make outdated-state assignment explicit, deterministic, and user-explainable.

## Guidance
1. Reuse backend reanchor engine before marking orphaned.
2. Separate machine reason codes from user-facing copy; map codes in one place.
3. Prefer conservative outdated labeling over silent false-active state when uncertainty is high.
4. Add fixture cases for rename/deletion/quote-change scenarios.
5. Keep cache invalidation triggers tight and observable.

## Anti-patterns
1. Marking threads outdated solely from any commit movement.
2. Non-deterministic tie-breakers in relevance evaluation.
3. Hiding reason code context from diagnostics/logging.
