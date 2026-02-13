# spec-for-version-aware-outdatedness-v0

Status: superseded (merged into `../../spec-for-review-state-and-versioning.md`)  
Scope: deterministic outdated/orphaned detection against Git history and working tree

## 1. Goal
Explain thread relevance in version terms ("relevant to version A", "outdated after commit X").

## 2. Inputs
1. Current working tree file content/path.
2. Thread anchor-at-create snapshot.
3. Stored commit/blob metadata (if present).
4. Git history context for file path rename/deletion where available.

## 3. Evaluation pipeline (normative order)
1. **Direct anchor match** in current file.
2. **Reanchor attempt** using existing engine.
3. **Git path continuity check** (rename/deletion signals).
4. **Version delta check** between stored context and current HEAD.
5. Assign relevance state + reason code.

## 4. Deterministic rules
1. If anchor matches with high confidence and no material quote divergence -> `active`.
2. If anchor reanchored but quote/content materially changed -> `outdated` (`CONTENT_CHANGED` or `ANCHOR_RELOCATED`).
3. If file removed or unrecoverable path -> `orphaned` (`FILE_DELETED` or `ANCHOR_NOT_FOUND`).
4. If Git metadata unavailable -> conservative state using content checks + `COMMIT_CONTEXT_UNAVAILABLE` reason.

## 5. User-visible outputs
1. Badge state per thread.
2. Human-readable rationale string derived from reason code.
3. Link/action for "View referenced version" when commit context exists.

## 6. Caching and recompute
1. Cache relevance evaluation per document+HEAD commit.
2. Invalidate on:
   - file save
   - sidecar change
   - HEAD change
   - manual reload command

## 7. Acceptance criteria
1. Same input state yields same relevance result across runs.
2. Outdated/orphaned transitions are explainable to user via reason code.
3. False-positive outdated rate remains low in fixture-based tests.
