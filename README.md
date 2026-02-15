# md-collab

Local-first Markdown collaboration for `.md` documents with sidecar comment threads.

## Current status
- VS Code extension remains the primary frontend.
- Workspace-first collaboration (pre-commit) is first-class; Git context is optional enrichment (`workspace|git|hybrid`).
- Suggestion lifecycle, relevance/timeline semantics, and quality automation are implemented and covered by tests.

## Direction (active)
1. Canonical content stays in `.md`.
2. Comment/review metadata lives in `*.comments.json` sidecars.
3. Single shared SSH workspace is the default operating mode.
4. Sidecar writes are guarded (atomic writes + conflict detection).
5. Review UX targets PR-style ergonomics while preserving local-first workflows.

## Key docs
- `PRD.md` — product requirements baseline
- `spec/review-system-composition-map.md` — cross-layer contract map
- `spec/frontend/README.md` — active frontend spec index
- `spec/frontend/spec-for-review-interaction-model.md` — unified interaction/suggestion UX spec
- `guidance/frontend/guidance-for-review-interaction-model.md` — frontend implementation guidance
- `spec/backend/README.md` — active backend spec index
- `spec/quality/README.md` — acceptance + traceability requirements
- `docs/post-testing-fixes-notes.md` — latest manual-test-driven UX clarifications

## Implementation + verification commands
- `npm test`
- `npm run accept`
- `npm run accept:smoke`
- `npm run traceability:check`
- `npm --prefix vscode-extension run compile`
