# guidance-for-diff-based-anchor-remapping

Status: v0.1 draft
Project: md-collab

## Intent
Use structural diffs to remap anchors precisely and cheaply, reserving expensive fuzzy search for cases where the anchor text itself has changed.

## Guidance
1. Treat diff remapping as a fast path, not a replacement. The existing fuzzy pipeline remains the fallback.
2. Only accept a remapped position when the quote verifies exactly. Never return a "probably right" position from a diff.
3. Line-level diff is sufficient. Character-level diff is more precise but slower and unnecessary when combined with quote verification.
4. Keep the diff utility pure and stateless. It takes two strings and returns a mapping. No side effects, no caching internally.

## Base text sourcing
1. The primary source is the **editor buffer** at the time of a document change event. Both VS Code and Obsidian provide the previous buffer state when a file changes (via file watcher for agent edits, or document change events for human edits). This covers the primary use case without git or caching.
2. Git blobs (`git show <commit>:<path>`) serve as a fallback for cross-session recovery when no buffer state is available (e.g., editor was closed when the file changed).
3. When base text is unavailable, the pipeline falls through gracefully. Never block on base text retrieval.

## Performance notes
1. The diff computation dominates cost. For a 17KB document with small edits, expect <5ms total.
2. Cache the diff result when evaluating multiple anchors against the same document pair. Compute the diff once, map all anchors through it.
3. In the VS Code frontend, base text retrieval via `git show` adds ~10-50ms. This is acceptable for file-open and explicit reanchor, but avoid it on every keystroke.

## Frontend integration
1. On file watcher events (`reloadFromDisk`), capture the current editor buffer as `oldText` before reading the new file from disk. Compute the diff map once and pass it through to `reanchor` for all threads.
2. On editor buffer changes (human typing), capture the pre-edit buffer state and compute the diff map on save or debounced refresh.
3. Both VS Code and Obsidian frontends vendor the core diff utility — no editor-specific logic in the algorithm itself.

## Anti-patterns
1. Running character-level diff when line-level + quote verification is sufficient.
2. Accepting a diff-remapped position without verifying the quote.
3. Falling back to fuzzy search before trying diff remapping.
4. Computing a fresh diff per anchor instead of sharing one diff across all anchors in a file.
