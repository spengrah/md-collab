# spec-for-anchor-test-fixtures

Status: v0.1 draft

## 1. Scope
Defines fixture format and required test scenarios for test-driven backend development.

## 2. Fixture file structure
Each fixture bundle contains:
1. `before.md`
2. `after.md`
3. `threads.json` (initial sidecar fragment)
4. `expected.json` (expected re-anchor outcomes)

## 3. Required scenario classes
1. Insert text before anchored range.
2. Delete part of anchored range.
3. Paragraph split/merge near anchor.
4. Duplicate quote appears elsewhere.
5. Move anchored paragraph block.
6. Heavy rewrite around anchor.
7. Encoding/newline normalization change.

## 4. Expected fields per thread result
- `thread_id`
- `expected_confidence`
- `expected_reason_code`
- `expected_start`
- `expected_end`
- `requires_manual_relink` (bool)

## 5. Pass criteria
1. 100% deterministic outputs for fixture corpus.
2. Zero false-positive attachments in designated ambiguity fixtures.
3. No schema-invalid outputs.

## 6. Regression policy
Any algorithm or threshold change requires:
1. fixture diff review
2. changelog note
3. approval before baseline update
