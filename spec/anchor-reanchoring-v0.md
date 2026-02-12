# Anchor & Re-anchoring Spec (v0)

Project: md-collab  
Date: 2026-02-12  
Status: Draft

## 1) Purpose
Define how comment threads stay attached to intended text in `doc.md` as content changes over time.

## 2) Design goals
1. High anchor stability under normal edits.
2. Deterministic behavior across extension/agent implementations.
3. Clear confidence signaling when re-anchoring is uncertain.
4. Low false-positive reattachments.

## 3) Anchor model (hybrid)
Each thread stores both positional and content-based anchor signals.

### 3.1 Primary positional anchor
```json
{
  "start": {"line": 42, "column": 5, "offset_utf16": 1284},
  "end":   {"line": 42, "column": 27, "offset_utf16": 1306},
  "doc_revision": "optional-buffer-version-or-hash"
}
```

### 3.2 Fallback content anchor
```json
{
  "quote": "exact selected text",
  "prefix": "up to N chars before",
  "suffix": "up to N chars after",
  "quote_hash": "sha256:<normalized-quote>",
  "context_hash": "sha256:<normalized-prefix+quote+suffix>"
}
```

Recommended defaults:
- `N=80` chars for prefix/suffix.
- Normalization for hashes: lowercase + collapse whitespace.

## 4) Re-anchoring algorithm (v0)

### Step 0 — Fast path
If positional range is still valid and text exactly matches stored quote, keep anchor with `confidence=high`.

### Step 1 — Nearby positional search
Search within ±`W` chars from previous start offset (default `W=600`) for exact quote match.
- If one match: attach there, `confidence=high`.
- If multiple matches: continue to disambiguation.

### Step 2 — Context disambiguation
Score candidate matches by context similarity against stored prefix/suffix.
- Similarity inputs: prefix overlap, suffix overlap, normalized edit distance.
- If top score exceeds threshold `T_high`, attach with `confidence=medium/high`.
- If tie or below threshold, continue.

### Step 3 — Fuzzy quote search
If exact quote not found, perform fuzzy match on quote+context window.
- Require stricter threshold to avoid false positives.
- If matched: attach with `confidence=low` and mark `reanchored=true`.

### Step 4 — Broken state
If no reliable match found:
- Keep thread but mark `anchor_confidence=broken`.
- UI state: “Needs re-anchor.”
- Allow manual re-link by selecting new text.

## 5) Confidence states
- `high`: exact quote match with strong positional/context agreement.
- `medium`: exact quote match with weaker positional confidence.
- `low`: fuzzy/contextual recovery; review recommended.
- `broken`: no safe match.

## 6) Extension behavior requirements
1. Recompute anchors on document open, save, and explicit refresh command.
2. Do not silently move anchors on very low confidence ties.
3. Always persist updated anchor metadata + confidence transitions.
4. Surface re-anchoring reason in UI/log (e.g., exact-nearby, context-resolved, fuzzy, broken).

## 7) Agent behavior requirements
1. Use same deterministic re-anchoring order.
2. Never auto-resolve `broken` without explicit user instruction.
3. When writing comments, always include both positional and fallback fields.

## 8) Edge cases
1. Duplicate paragraphs: require context score and nearest previous offset preference.
2. Large rewrites/moves: likely `broken`; manual re-link preferred.
3. Encoding/newline changes: normalize before hash/score.
4. Multi-cursor edits: process against latest saved text snapshot.

## 9) Tunable parameters (v0 defaults)
- Nearby search window `W=600`
- Prefix/suffix chars `N=80`
- High-confidence threshold `T_high=0.90`
- Low-confidence minimum `T_low=0.72`

## 10) Testing requirements
1. Fixture suite with deterministic expected anchor outcomes.
2. Cases: insertions before range, deletions in range, paragraph split/merge, moved block, duplicate text, heavy rewrite.
3. Validate no false-positive attachment in ambiguous duplicates.

## 11) Open questions
1. Should we prefer AST-aware block anchors for headings/lists in v1?
2. Should `offset_utf8` also be stored for cross-runtime parity?
3. Should low-confidence anchors be hidden inline by default?
