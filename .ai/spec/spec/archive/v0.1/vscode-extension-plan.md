# VS Code Extension Plan (v0)

Project: md-collab  
Date: 2026-02-12

## Decision
Start with a VS Code extension as the host frontend for md-collab.

## Why
- Fastest path to a native inline-comments MVP with strong extension APIs.
- First-class remote/SSH workflows.
- Lets us de-risk UX while keeping `.md` + sidecar JSON as backend truth.

## Parallel tracks

### Track A — Data model first (backend contract)
1. Finalize `comments-sidecar-v0` schema.
2. Define anchor model and re-anchoring algorithm.
3. Define identity/trust fields (minimal markers for v0).
4. Define merge/conflict conventions for Git.
5. Publish fixtures (valid/invalid) and migration/versioning policy.

### Track B — VS Code extension MVP
1. Read sidecar for open markdown document.
2. Render inline markers + thread panel.
3. Create/reply/resolve/reopen thread.
4. Persist sidecar updates atomically.
5. Re-anchor on edit/save events with confidence states.

## MVP acceptance criteria
1. Two collaborators can comment/reply/resolve on one Markdown file.
2. Canonical markdown remains clean and usable in Obsidian.
3. Sidecar works in single-workspace mode (gitignored by default for MVP).
4. Works in local and Remote-SSH workflows.

## MVP storage mode
- Default MVP mode: keep `*.comments.json` out of Git tracking (`.gitignore`) while humans collaborate directly in the agent workspace over SSH.
- Future mode: enable Git-tracked sidecars with merge conventions when cross-environment sync becomes necessary.

## Immediate next deliverables
1. `spec/archive/v0.1/comments-sidecar.md`
2. `spec/archive/v0.1/anchor-reanchoring.md`
3. `spec/archive/v0.1/git-merge-conventions.md`
4. `spec/vscode-mvp-scope.md` (historical reference; file not present in current tree)
