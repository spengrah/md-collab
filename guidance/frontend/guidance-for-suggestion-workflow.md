# guidance-for-suggestion-workflow-v0

## Intent
Provide Docs-like “suggesting” ergonomics with PR-style explicit state and safety checks.

## Guidance
1. Keep suggestion apply path guarded by before-text hash verification.
2. Record all decisions as explicit state transitions, never implicit deletion.
3. Reuse thread metadata/version context to explain obsolete suggestions.
4. Prefer a small explicit status machine over ad-hoc booleans.

## Anti-patterns
1. Auto-applying suggestions after unrelated file edits.
2. Silent downgrade of failed applies without user-visible state.
3. Losing decision provenance (who/when/why).
