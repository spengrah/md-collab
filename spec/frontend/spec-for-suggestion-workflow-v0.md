# spec-for-suggestion-workflow-v0

Status: draft v0.2  
Scope: PR-review-style suggestion proposals and apply/reject flow (markdown sidecar-first)

## 1. Goal
Support suggestion-style review interactions that are version-aware and auditable.

## 2. Suggestion object (normative)
Each suggestion entry must include:
1. `suggestion_id` (stable UUID)
2. `thread_id` (owning thread)
3. `status` enum: `proposed | applied | rejected | obsolete`
4. `proposed_edit`:
   - anchor reference
   - before_text_hash
   - replacement_text
5. `proposed_by` (author object)
6. `proposed_at` (ISO-8601)
7. `decision` object (optional until decided):
   - `decided_by`
   - `decided_at`
   - `decision_reason`

## 3. Command contract
1. `mdCollab.proposeSuggestion`
2. `mdCollab.applySuggestion`
3. `mdCollab.rejectSuggestion`
4. `mdCollab.viewSuggestionBaseVersion`

## 4. Apply/reject behavior
1. Apply must verify preconditions:
   - anchor resolvable
   - before_text_hash match or controlled mismatch policy
2. On mismatch, mark `obsolete` unless explicit user override applies.
3. Apply/reject must append an audit message to thread history.

## 5. UI behavior
1. Suggestions visible in thread UI and overlay chips.
2. Status is always explicit.
3. Obsolete suggestions clearly distinguished from active proposals.

## 6. Acceptance criteria
1. Suggestion lifecycle is deterministic and traceable in sidecar history.
2. Applying suggestion never silently mutates wrong text span.
3. Suggestion states remain coherent after file/version changes.
