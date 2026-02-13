# spec-for-review-interaction-model

Status: draft v0.2  
Scope: unified PR-review-style interaction model in native VS Code editor

## 1. Goal
Define a single interaction contract for on-document overlays, thread actions, and suggestion lifecycle so UI behavior is composable and non-duplicative.

## 2. Overlay stack (required)
1. **Range highlight layer**: highlight anchor ranges for open threads by relevance/status.
2. **Inline signal layer**: end-of-line/inlay/CodeLens chips showing:
   - thread count
   - relevance badge (`active/outdated/orphaned`)
   - timeline badge (`local draft|git|hybrid`)
   - quick actions (`Reply`, `Resolve/Reopen`, `Jump`, `View referenced version`, `Propose suggestion`)
3. **Gutter marker layer**: markers for lines with threads.

## 3. Canonical command contract
All UI affordances must route to canonical commands.

### 3.1 Thread commands
1. `mdCollab.addComment`
2. `mdCollab.replyToThread`
3. `mdCollab.resolveThread`
4. `mdCollab.reopenThread`
5. `mdCollab.navigateToThread`
6. `mdCollab.reloadSidecar`

### 3.2 Suggestion commands
1. `mdCollab.proposeSuggestion`
2. `mdCollab.applySuggestion`
3. `mdCollab.rejectSuggestion`
4. `mdCollab.viewSuggestionBaseVersion`

## 4. Suggestion object (normative)
Each suggestion must include:
1. `suggestion_id` (stable UUID)
2. `thread_id` (owner)
3. `status`: `proposed | applied | rejected | obsolete`
4. `proposed_edit`:
   - anchor reference
   - `before_text_hash`
   - `replacement_text`
5. `proposed_by`
6. `proposed_at`
7. `decision` object (optional until decided):
   - `decided_by`
   - `decided_at`
   - `decision_reason`

## 5. Interaction behavior
1. Clicking overlay signal focuses/selects associated anchor range.
2. Hover shows concise thread summary (author, last message, relevance, timeline, suggestion status if present).
3. Thread/suggestion actions must not bypass sidecar conflict guards.
4. When Git metadata is absent, UI must still provide full local-draft interaction flow with workspace timeline labels.

## 6. Apply/reject semantics
1. Apply must verify:
   - anchor resolvable
   - `before_text_hash` matches, or explicit controlled mismatch policy
2. Hash mismatch default: mark suggestion `obsolete` and do not mutate target text.
3. Apply/reject appends audit message to thread history.

## 7. Visual semantics
1. Open+active: strongest emphasis.
2. Open+outdated: warning style.
3. Orphaned: degraded style + explicit recovery action.
4. Resolved overlays hidden by default; reveal toggle allowed.
5. Suggestion status visible in both panel and overlay chips.
6. Timeline badge styles:
   - `local draft` for workspace-only context,
   - `git` for commit-scoped context,
   - `hybrid` when both are present.

## 8. Accessibility + performance
1. Color-only encoding prohibited; icon/text/tooltip equivalents required.
2. Keyboard-only navigation to next/previous thread anchor required.
3. Overlay refresh should be incremental where feasible.
4. Avoid full-doc recompute on cursor movement.
5. Must remain responsive for >=2k-line markdown files with >=100 threads.

## 9. Acceptance criteria
1. User can discover and act on thread/suggestion state without opening panel.
2. Suggestion lifecycle is deterministic and auditable.
3. Apply flow never silently mutates wrong span.
4. Local pre-commit collaboration works fully without Git metadata.
5. UX is materially tighter than panel-only mode in Remote-SSH tests.
