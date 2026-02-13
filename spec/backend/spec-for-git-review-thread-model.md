# spec-for-git-review-thread-model-v0

Status: draft v0.2  
Scope: version-aware thread/message data model for PR-review-style UX in VS Code

## 1. Goal
Represent every thread as a review artifact tied to Git version context, while preserving sidecar-first local workflow.

## 2. Normative model additions
Add the following optional-but-preferred fields in v0.2 sidecar thread/message payloads.

### 2.1 Thread-level version envelope
1. `thread_version_context.base_commit` (string, full or short SHA)
2. `thread_version_context.head_commit` (string SHA at thread creation/update context)
3. `thread_version_context.file_path_at_create` (string)
4. `thread_version_context.base_blob_sha` (string, optional)
5. `thread_version_context.head_blob_sha` (string, optional)
6. `thread_version_context.anchor_at_create` (anchor snapshot object)

### 2.2 Thread relevance state
1. `relevance_state` enum:
   - `active`
   - `outdated`
   - `orphaned`
2. `relevance_reason` (string enum/code; see §4)
3. `relevance_checked_at` (ISO-8601)
4. `relevance_checked_against_commit` (string SHA)

### 2.3 Message-level version marker (for replies)
1. `message_version_context.seen_head_commit` (string SHA when message authored)
2. `message_version_context.seen_blob_sha` (optional)

## 3. Backward compatibility
1. v0.1 sidecars (without these fields) remain readable.
2. Extension may populate v0.2 fields lazily on first relevant operation.
3. Absence of version fields must not block create/reply/resolve operations.

## 4. Relevance reason codes (minimum)
1. `CONTENT_CHANGED`
2. `ANCHOR_RELOCATED`
3. `ANCHOR_NOT_FOUND`
4. `FILE_RENAMED`
5. `FILE_DELETED`
6. `COMMIT_CONTEXT_UNAVAILABLE`

## 5. Behavioral contract
1. Relevance evaluation must be deterministic for same file+commit inputs.
2. State transitions allowed:
   - `active -> outdated`
   - `active -> orphaned`
   - `outdated -> active` (if relinked/revalidated)
   - `orphaned -> outdated|active` (if file/path restored)
3. Resolve/reopen lifecycle remains orthogonal to relevance state.

## 6. Acceptance criteria
1. Threads can be rendered with explicit version relevance badges.
2. Reply messages capture commit context at authoring time.
3. Existing v0.1 sidecars load and operate without migration breakage.
