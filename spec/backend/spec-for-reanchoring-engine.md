# spec-for-reanchoring-engine

Status: v0.1 draft

## 1. Scope
Defines deterministic algorithm for relocating anchors after document edits.

## 2. Inputs
1. Current document text
2. Stored thread anchor payload
3. Tuning params (`W`, `T_high`, `T_low`)

## 3. Defaults
- Nearby window `W=600` chars
- `T_high=0.90`
- `T_low=0.72`

## 4. Algorithm (normative order)
1. **Fast exact positional check**
   - If positional range exists and extracted text == `quote`, return `high`.
2. **Nearby exact quote search**
   - Search within ±W chars around prior start offset.
   - Unique match => `high`.
3. **Context disambiguation**
   - If multiple exact matches, score candidates by prefix/suffix similarity.
   - Top score >= T_high and clear winner => `medium` or `high`.
4. **Fuzzy recovery**
   - If no exact quote match, fuzzy-match quote+context.
   - Score >= T_low => `low`.
5. **Broken**
   - Otherwise return `broken`.

## 5. Candidate scoring
Minimum required features:
1. Prefix overlap score
2. Suffix overlap score
3. Normalized edit distance term

Implementations may weight terms differently, but must keep deterministic weights within a release.

## 6. Output payload
- updated range offsets/line-columns
- `anchor_confidence`
- `reanchored` boolean
- `reason_code`: `exact_positional | exact_nearby | context_disambiguated | fuzzy_recovery | broken`

## 7. Safety constraints
1. Never auto-attach when top two candidates are near-tied under disambiguation threshold.
2. Prefer `broken` over uncertain attachment.
3. No silent confidence downgrade without updating persisted state.

## 8. Acceptance criteria
1. Same input + params => same output.
2. Duplicate-quote fixtures do not produce false-positive jumps.
3. Heavy rewrite fixtures return `broken` unless high-signal context exists.
