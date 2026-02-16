# guidance-for-anchor-test-fixtures

Status: v0.1 draft

## Intent
Use fixtures to lock behavior before implementation drift happens.

## Guidance
1. Start with small, legible markdown inputs.
2. Name fixtures by behavior intent, not by ticket number.
3. Include at least one adversarial ambiguous-case fixture early.
4. Keep expected outputs explicit; avoid inferred assertions.

## Suggested naming
- `anchor-insert-before-range`
- `anchor-duplicate-quote-disambiguation`
- `anchor-heavy-rewrite-broken`

## TDD workflow
1. Add/adjust fixture.
2. Run parser + re-anchor tests.
3. Implement minimum change to pass.
4. Refactor without changing outcomes.

## Quality bar
If a fixture fails because of uncertainty, prefer adjusting algorithm to produce `broken` instead of forcing an unsafe reattachment.
