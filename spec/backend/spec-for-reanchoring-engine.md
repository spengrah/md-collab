# spec-for-reanchoring-engine

Status: v0.1 draft

## 1. Scope
Defines deterministic algorithm for relocating anchors after document edits.

## 1.1 Requirement IDs covered
- MDC-BE-008
- MDC-BE-009
- MDC-BE-010

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
   - If no exact quote match, fuzzy-match quote+context using **normalized Levenshtein similarity** on the string: `prefix + quote + suffix`.
   - Normalization: lowercase + collapse whitespace + trim.
   - Similarity = `1 - (levenshtein_distance / max(len(a), len(b)))`.
   - Score >= T_low => `low`.
5. **Broken**
   - Otherwise return `broken`.

## 5. Candidate scoring
For disambiguation, candidate score is:

`score = 0.4 * prefix_overlap + 0.4 * suffix_overlap + 0.2 * levenshtein_similarity`

Where each term is normalized to `[0,1]`.

Tie-break rules:
1. Higher score wins.
2. If scores differ by < 0.03, choose nearest previous start offset.
3. If still tied, return `broken` (do not auto-attach).

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
