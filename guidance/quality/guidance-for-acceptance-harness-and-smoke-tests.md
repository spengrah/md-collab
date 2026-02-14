# guidance-for-acceptance-harness-and-smoke-tests

## Intent
Make high-risk behavior regressions visible quickly, before manual user testing.

## Guidance
1. Keep smoke suite under ~2 minutes where possible.
2. Use deterministic fixtures; avoid network dependence.
3. Assign stable case IDs (e.g., `ACPT-SUG-001`) for triage continuity.
4. Separate "known limitations" from true failures in reporting.
5. Store reports as artifacts, not in tracked source paths by default.

## Anti-patterns
1. Single monolithic test that obscures root cause.
2. Non-deterministic timestamps/content comparisons without normalization.
3. Silent skips in smoke runs.
