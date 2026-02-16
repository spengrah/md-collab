# spec-for-requirements-traceability-automation

Status: draft active  
Scope: automate mapping from requirement IDs to implementation tests and outcomes

## 1. Goal
Provide deterministic evidence that each requirement ID has explicit test coverage and current pass/fail status.

## 2. Requirement sources in scope
1. `spec/backend/requirements-index.md`
2. `spec/frontend/requirements-index.md`
3. future requirement indexes following same table format

## 3. Traceability output
Generate `artifacts/traceability/latest.json` and `artifacts/traceability/latest-summary.md` containing:
1. requirement ID
2. owning spec file
3. mapped test identifiers/files
4. last execution status
5. coverage status: `covered|partial|missing`

## 4. Mapping rules (normative)
1. Requirement IDs must be parsed from requirement indexes.
2. Test mapping can come from one or more of:
   - inline test annotations (recommended)
   - maintained mapping file (`spec/quality/traceability-map.json`)
3. Unknown requirement IDs in mapping are errors.
4. Requirements with zero mapped tests are `missing`.

## 5. Command contract
1. `npm run traceability:build` — produce mapping report
2. `npm run traceability:check` — fail if any requirement is `missing`
3. `npm run traceability:report` — human summary

## 6. CI/readiness policy
1. CI or pre-release gate should fail on `missing` for P0/P1 requirements.
2. `partial` is allowed only with explicit waiver notes in output.

## 7. Acceptance criteria
1. A maintainer can identify uncovered requirements in <2 minutes.
2. Output is stable across repeated runs on same commit.
3. Mapping errors are treated as failures, not warnings.
