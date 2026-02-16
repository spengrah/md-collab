# spec-for-acceptance-harness-and-smoke-tests

Status: draft active  
Scope: deterministic acceptance harness for md-collab v0.2 behaviors

## 1. Goal
Create a repeatable, scriptable acceptance harness that validates critical md-collab behaviors without requiring manual UI exploration.

## 2. Required harness capabilities
1. Run in local workspace and CI-compatible non-interactive mode.
2. Validate core v0.2 behavior groups:
   - timeline modes (`workspace|git|hybrid`)
   - relevance transitions and reason codes
   - suggestion lifecycle (proposed/applied/rejected/obsolete)
   - hash-mismatch safety (no unintended text mutation)
   - sidecar conflict guard behavior
3. Produce machine-readable output (`json`) and human summary (`markdown` or plain text).

## 3. Test suite classes (normative)
1. **Data-model acceptance suite**
   - sidecar schema validity
   - additive v0.2 compatibility with v0.1 sidecars
2. **Behavioral acceptance suite**
   - deterministic relevance evaluations
   - conservative missing-context handling
3. **Suggestion safety suite**
   - preflight ordering guarantees
   - mismatch -> obsolete semantics
4. **Sync/conflict suite**
   - conflict-before-write paths
   - no silent overwrite semantics
5. **Remote-ready smoke suite**
   - scriptable checks that approximate Remote-SSH conditions where feasible.

## 4. Command contract
Provide project-level commands:
1. `npm run accept` — full acceptance harness
2. `npm run accept:smoke` — fast critical subset
3. `npm run accept:report` — generates latest report artifact

## 5. Output contract
Each run must emit:
1. timestamp
2. git commit SHA
3. pass/fail per requirement group
4. failing case IDs and message
5. overall verdict (`PASS|FAIL`)

Default artifact location:
- `artifacts/acceptance/latest.json`
- `artifacts/acceptance/latest-summary.md`

## 6. Acceptance criteria
1. Harness can be run by one command from repo root.
2. Failures are diagnosable from output artifact without rerunning interactively.
3. Critical v0.2 safety regressions are caught by smoke suite.
