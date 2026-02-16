# Core Rules

These rules apply to all AI agents working on this project.

## Code Quality
- Keep solutions simple and direct
- Prefer boring, readable code over clever abstractions
- Do not over-engineer or add unrequested features
- Run tests before committing

## TypeScript Conventions
- ESM modules (`import`/`export`, no CommonJS)
- NodeNext module resolution
- Strict mode enabled (`strict: true` in tsconfig)

## Git Practices
- Use conventional commits (feat:, fix:, docs:, refactor:, test:, chore:)
- First line under 72 characters
- Sign all commits with `-S` flag
- Commit logical units of work, not partial changes

## Build
- `npm run build` — builds the core library to `dist/`
- `npm run precompile` (in `vscode-extension/`) — syncs vendored core from `dist/`
- Frontends vendor the core via `dist/`; they never import from `src/` directly

## Architectural Rules
- Sidecar files (`*.comments.json`) never mutate the Markdown document
- All sidecar mutations go through `src/operations.ts`
- Frontends vendor the core library; changes to core exports require updating vendor copies

## Communication
- Surface errors, never hide them
- When uncertain, ask rather than assume
