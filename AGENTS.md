# Agent Instructions

Read and follow: `.ai/rules/core.md`

## About This Repo

Local-first Markdown collaboration tool. Inline comment threads are stored in JSON sidecar files (`*.comments.json`) alongside their Markdown documents. The core library handles sidecar CRUD and anchor reattachment; frontends (VS Code, Obsidian, CLI) vendor the core via `dist/`.

Structure:
```
src/                    # Core library (TypeScript, ESM)
  operations.ts         # All sidecar mutations go through here
  anchor.ts / reanchor.ts  # Text-anchor placement and reattachment
  sidecar-file.ts       # Sidecar read/write
  schema.ts / types.ts  # Sidecar JSON schema and TS types
  cli.ts                # CLI entry point

vscode-extension/       # VS Code frontend
  vendor/               # Vendored core (synced via precompile)

obsidian-plugin/        # Obsidian frontend
  vendor/               # Vendored core

tests/                  # Vitest tests mirroring source structure
  fixtures/anchors/     # Fixture-driven reanchor test cases

.ai/
  rules/                # Project rules (core.md auto-imported)
  spec/
    spec/               # Normative specifications (by domain)
    guidance/           # Implementation guidance (1:1 paired with specs)
  patterns/             # Reusable approaches
  guides/               # Domain playbooks
  research/             # Platform evaluations and analysis
  skills/               # Agent-invocable skills
  log/learnings/        # Session learnings (YAML)
  pre-push.json         # Pre-push test config
```

Specs in `.ai/spec/spec/` and guidance in `.ai/spec/guidance/` are organized by domain (backend, frontend, cli, quality) and are 1:1 paired — every spec has a matching guidance doc.

## Context Discovery

Load context as needed, not upfront:
- **Project rules**: `.ai/rules/`
- **Specifications**: `.ai/spec/spec/` and `.ai/spec/guidance/`
- **Architecture patterns**: `.ai/patterns/` (when present)
- **Domain guides**: `.ai/guides/` (when present)

## Session Hints

- Keep the directory tree above in sync with the actual structure — agents rely on it as their roadmap
- After changing core exports: rebuild (`npm run build`), then sync vendors (`npm run precompile` in vscode-extension/, `node obsidian-plugin/scripts/sync-core.mjs`)
