# md-collab

Local-first Markdown collaboration with inline comment threads, designed for Spencer + Lyle.

## Current status
- Product direction is locked in **PRD v0.1**.
- Initial specs for sidecar schema, re-anchoring, and VS Code implementation plan are drafted.
- Backend-first `spec-for-*` and `guidance-for-*` docs are now added for sidecar + anchoring + fixture-driven TDD.

## Direction (locked)
1. Canonical docs remain `.md`.
2. Comments are stored in sidecar JSON (`*.comments.json`).
3. Host frontend starts with a **VS Code extension**.
4. MVP runs in **single-workspace SSH mode** with sidecars gitignored by default.
5. Git merge conventions are documented for future multi-environment rollout.

## Repository layout
- `PRD.md` — locked product requirements (v0.1)
- `spec/comments-sidecar-v0.md` — superseded redirect
- `spec/anchor-reanchoring-v0.md` — superseded redirect
- `spec/vscode-extension-plan-v0.md` — implementation plan (non-normative)
- `spec/spec-for-vscode-extension-mvp.md` — frontend normative MVP spec
- `spec/backend/spec-for-*.md` — backend normative specs (sidecar, anchors, re-anchoring, fixtures, TDD plan, identity)
- `guidance/backend/guidance-for-*.md` — backend implementation guidance
- `spec/git-merge-conventions-v0.md` — future-mode policy (not MVP core)
- `research/host-platform-rubric-v0.md` — platform evaluation rubric
- `research/host-platform-candidates-v0.md` — initial platform scoring

## Next implementation step
Build the VS Code MVP against the existing specs, then tighten schema/fixtures from real usage.
