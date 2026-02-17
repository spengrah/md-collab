# spec-for-reanchoring-engine

Status: v0.2 draft

## 1. Scope
Defines deterministic algorithm for relocating anchors after document edits.

## 1.1 Requirement IDs covered
- MDC-BE-008
- MDC-BE-009
- MDC-BE-010
- MDC-BE-022..024 (via `spec-for-diff-based-anchor-remapping.md`)

## 2. Inputs
1. Current document text
2. Stored thread anchor payload
3. Tuning params (`W`, `T_high`, `T_low`)

## 3. Defaults
- Nearby window `W=600` chars
- `T_high=0.90`
- `T_low=0.72`
- `fuzzyBudgetMs=200` (ms)

## 4. Algorithm (normative order)
1. **Fast exact positional check**
   - If positional range exists and extracted text == `quote`, return `high`.
1b. **Diff-based remapping** (v0.2, when `oldText` is available)
   - See `spec-for-diff-based-anchor-remapping.md` for full algorithm.
   - Map old offsets through structural diff, verify quote at mapped position.
   - Success => `high`, `reason_code: diff_remapped`.
   - Failure => fall through to step 2.
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
- `reason_code`: `exact_positional | diff_remapped | exact_nearby | context_disambiguated | fuzzy_recovery | broken`

## 7. Safety constraints
1. Never auto-attach when top two candidates are near-tied under disambiguation threshold.
2. Prefer `broken` over uncertain attachment.
3. No silent confidence downgrade without updating persisted state.

## 8. Performance characteristics

### 8.1 Fuzzy budget
The fuzzy recovery loop (step 4) accepts a `fuzzyBudgetMs` parameter (default 200ms). The loop checks `performance.now()` every 64 iterations and breaks when the budget is exceeded, returning the best candidate found so far. If the best-so-far meets `T_low`, it is returned as `low`/`fuzzy_recovery`; otherwise the anchor falls through to `broken`.

### 8.2 Reanchor result cache
`evaluateThreadRelevance` caches reanchor results in a module-level map keyed on `hash(documentText)::quote_hash::context_hash`. Cache hits bypass reanchor entirely (O(1)). The cache uses LRU eviction at 200 entries. Frontends call `invalidateReanchorCache()` when document text changes.

### 8.3 Broken-anchor recovery
Broken anchors are not short-circuited. When document text changes (cache miss), broken anchors are re-evaluated through reanchor with the budget cap, allowing recovery if the original text is restored.

## 9. Acceptance criteria
1. Same input + params => same output.
2. Duplicate-quote fixtures do not produce false-positive jumps.
3. Heavy rewrite fixtures return `broken` unless high-signal context exists.
