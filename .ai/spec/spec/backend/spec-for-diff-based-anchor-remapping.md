# spec-for-diff-based-anchor-remapping

Status: v0.1 draft
Project: md-collab
Date: 2026-02-16

## 1. Scope
Defines the algorithm for remapping anchor offsets through a structural diff between a base document and the current document. This replaces brute-force fuzzy search for the common case where the anchor text survived editing but shifted position.

## 1.1 Requirement IDs covered
- MDC-BE-022
- MDC-BE-023
- MDC-BE-024

## 2. Motivation
The existing reanchor engine (v0.1) uses Levenshtein-based fuzzy recovery when exact positional and quote searches fail. This is O(W * length_range * target_length) and takes 4-12 seconds per broken anchor on real documents. Diff-based remapping is O(n*d) where d is the edit distance, handling the common case in milliseconds.

## 3. Inputs
1. `oldText` (string): document text at anchor creation time
2. `newText` (string): current document text
3. `anchor` (Anchor): thread anchor with offsets relative to `oldText`

## 4. Algorithm

### 4.1 Diff computation
Compute a line-level diff between `oldText` and `newText`. The diff produces an ordered list of operations:
- **equal**: lines present in both texts
- **delete**: lines present only in `oldText`
- **insert**: lines present only in `newText`

### 4.2 Offset mapping
Build a mapping function `mapOffset(oldOffset) -> newOffset | null`:
1. Walk the diff operations, tracking cumulative character positions in both old and new text.
2. For each **equal** region: `newOffset = oldOffset + cumulativeDelta`
3. For each **delete** region: offsets falling within this range map to `null` (anchor text was deleted)
4. For each **insert** region: increment `cumulativeDelta` by the inserted character count

### 4.3 Anchor remapping
1. Map `anchor.primary.start.offset_utf16` through the offset map to get `mappedStart`
2. Map `anchor.primary.end.offset_utf16` through the offset map to get `mappedEnd`
3. If either maps to `null`, return `null` (fall through to next pipeline step)

### 4.4 Quote verification
After remapping:
1. Extract `newText.slice(mappedStart, mappedEnd)`
2. Compare against `anchor.fallback.quote`
3. If exact match: return mapped position with `high` confidence, `reason_code: 'diff_remapped'`, `reanchored: true`
4. If no match: return `null` (fall through)

## 5. Integration with reanchor pipeline
This becomes step 1b in the reanchor algorithm defined in `spec-for-reanchoring-engine.md`:

1. Fast exact positional check
2. **Diff-based remapping** (when `oldText` is available)
3. Nearby exact quote search
4. Context disambiguation
5. Fuzzy recovery
6. Broken

When `oldText` is not provided, step 1b is skipped and the pipeline proceeds to step 2.

## 6. Base text sourcing
The `oldText` parameter is obtained by the caller. The diff algorithm is agnostic to the source.

The primary source is the **editor buffer** at the time of a document change event:
- When an agent edits the file on disk, the file watcher fires. The editor's current buffer is `oldText`; the new file content read from disk is `newText`.
- When the human edits in the editor, the buffer change event provides the previous buffer state as `oldText` and the new state as `newText`.

This covers the primary use case (human + agent co-editing a document) without requiring git or persistent caches. Additional sources may include:
- **Git**: `git show <commit>:<path>` for cross-session recovery when no buffer state is available
- **Workspace snapshot cache**: for scenarios where the editor was not open during the edit

## 7. New reason code
- `diff_remapped`: anchor was successfully remapped through a structural diff

This extends the existing set: `exact_positional | exact_nearby | context_disambiguated | fuzzy_recovery | broken | diff_remapped`

## 8. Safety constraints
1. Diff remapping only succeeds when the quote exactly matches at the mapped position.
2. Partial matches or near-matches fall through to subsequent pipeline steps.
3. Deleted anchor regions always fall through (never auto-attach to nearby text).

## 9. Performance characteristics
- Myers diff: O(n*d) where n is document length and d is edit distance
- Offset mapping: O(diff_ops) per anchor
- For typical small edits (d << n): effectively O(n)
- Compared to fuzzy recovery: orders of magnitude faster for documents with broken anchors

## 10. Acceptance criteria
1. Insertion before anchor: offsets shift forward by inserted length, quote verified.
2. Deletion before anchor: offsets shift backward by deleted length, quote verified.
3. Deletion of anchor text: returns `null`, falls through to next pipeline step.
4. Modification of anchor text: returns `null`, falls through.
5. Multiple edits: cumulative offset shifts are correct.
6. Identical documents: returns mapped position matching original offsets.
7. `oldText` not provided: step is skipped, pipeline proceeds normally.
8. Same inputs produce same outputs (deterministic).
