# guidance-for-anchor-model

Status: v0.1 draft

## Intent
Use hybrid anchors to maximize resilience while avoiding false-positive reattachment.

## Guidance
1. Always write both positional and fallback anchors at thread creation.
2. Do not rely on offsets alone; edits can invalidate positions quickly.
3. Keep context windows modest (default 80 chars) to limit accidental collisions.
4. Prefer deterministic normalization rules shared by extension and agent.

## Practical implementation notes
1. Compute offsets from the in-memory editor buffer snapshot at comment creation.
2. Compute hashes immediately and persist with anchor.
3. If quote is very short/common, context quality matters more than position.
4. Avoid hidden heuristics that differ across runtimes.
5. For non-JS tooling (e.g., Python), compute UTF-16 code-unit offsets explicitly (e.g., `len(text.encode("utf-16-le")) // 2`).

## Anti-patterns
1. Storing only line numbers.
2. Storing only quote text without surrounding context.
3. Switching normalization rules over time without schema bump.
