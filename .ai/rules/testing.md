# Testing Rules

Testing requirements for AI agents working on this codebase.

## Framework

- **Vitest** for all tests
- `npm test` — runs `vitest run`
- `npm run test:coverage` — runs with coverage

## Test Location

Tests live in `tests/` mirroring the source structure:
- `src/operations.ts` -> `tests/operations.test.ts`
- `src/reanchor.ts` -> `tests/reanchor.test.ts`

## Fixture-Driven Reanchor Tests

Reanchor tests use fixtures in `tests/fixtures/anchors/`. Each fixture directory contains before/after Markdown and expected anchor positions. Add new fixture directories for new reanchor edge cases.

## Frontend Testing Notes

- **Obsidian plugin** tests use a shim for the `obsidian` module (configured as an alias in `vitest.config.ts`)
- **VS Code extension** tests mock `vendor.js` — when core exports change, update the mocks to match

## Integration vs Unit Tests

Integration tests can substitute for unit tests when unit tests would require heavy mock infrastructure. If the codebase doesn't have mock interfaces for a dependency, write integration tests that exercise the real code path rather than creating elaborate mocks.

## Writing Good Tests

1. Test edge cases, not just the happy path
2. Use descriptive test names
3. Keep tests fast
4. Fix root causes, not symptoms

## Before Pushing

Run `npm test` and verify all tests pass before pushing.
