# Remote/SSH Validation Checklist & Results (MVP green pass)

Date: 2026-02-12

## Scope
Validate that the VS Code extension compile pipeline and behavior remain parity-safe for:
- Local workspace execution
- VS Code Remote-SSH workspace execution assumptions

## Parity assumptions
1. Extension host runtime remains Node.js-compatible in both local and Remote-SSH contexts.
2. Sidecar IO is path-based and uses filesystem APIs relative to the opened markdown file path.
3. Backend package boundary (`dist/`) is built before extension compile via `precompile`.
4. No extension code imports backend TypeScript sources directly (`../../src/*.ts`) at compile time.

## Concrete checks
- [x] **No cross-rootDir backend TS import from extension**
  - `vscode-extension/src/model.ts` imports from `../../dist/index.js`.
- [x] **Backend artifact boundary exists**
  - `npm run build` creates `dist/` with runtime JS + type declaration entrypoint (`dist/index.d.ts`).
- [x] **Extension compile invokes backend build first**
  - `vscode-extension/package.json` has `precompile: npm --prefix .. run build`.
- [x] **Extension compile succeeds**
  - Ran: `cd vscode-extension && npm run compile` ✅
- [x] **Repo tests pass after boundary change**
  - Ran: `npm test` ✅ (35 tests)

## Remote-SSH-specific verification steps (manual in VS Code)
These cannot be fully executed from CLI-only environment but are ready to run:

1. Connect to host using VS Code Remote-SSH and open the same repo path.
2. In remote terminal, run:
   - `cd /home/lyle/.openclaw/workspace/projects/md-collab/vscode-extension`
   - `npm run compile`
3. In Extension Development Host (remote), open a markdown file and verify:
   - Thread panel loads.
   - Broken-anchor CTA item appears when applicable and triggers reanchor command.
   - Undo/redo sidecar note is visible in panel.
   - AUTHOR_INVALID and ID_CONFLICT errors show explicit user-facing messages.

## Current result summary
- CLI-feasible checks passed locally.
- Remote-SSH parity is expected given artifact boundary + identical Node-based extension host model; manual UI validation steps listed above remain to be run in VS Code remote session.
