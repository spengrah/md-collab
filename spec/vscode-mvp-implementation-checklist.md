# VS Code MVP Implementation Checklist (v0.1)

Status: ready to execute  
Depends on: backend v0.1 (narrowed identity scope)

## P0 — Extension scaffold + wiring
- [ ] Initialize VS Code extension project structure (`src/extension.ts`, `package.json` contribution points).
- [ ] Add command registrations per `spec/spec-for-vscode-extension-mvp.md`.
- [ ] Add settings schema:
  - `mdCollab.authorId`
  - `mdCollab.authorLabel`
  - `mdCollab.showResolvedInline`
  - `mdCollab.reanchorOnSave`
- [ ] Add backend-core import wiring and smoke test.

## P0 — Sidecar lifecycle
- [ ] On markdown open: compute sidecar path, load if exists.
- [ ] If missing sidecar: initialize empty in-memory state (no write yet).
- [ ] On first write action: create sidecar via backend serializer + atomic write.
- [ ] Handle schema parse errors with read-only warning mode.
- [ ] Add command/action: “Open sidecar to repair manually”.

## P0 — Thread operations
- [ ] Implement `addComment` from selection.
- [ ] Implement `replyToThread`.
- [ ] Implement `resolveThread`.
- [ ] Implement `reopenThread`.
- [ ] Ensure all mutation calls pass required author payload.

## P0 — Reanchoring integration
- [ ] Run reanchor on file open.
- [ ] Run reanchor on save when `mdCollab.reanchorOnSave=true`.
- [ ] Implement `reanchorCurrentFile` command.
- [ ] Persist updated confidence/reason-code state to sidecar.

## P1 — UI behaviors
- [ ] Build thread panel view (open/resolved groups).
- [ ] Render inline markers for open threads.
- [ ] Resolved inline markers hidden by default.
- [ ] Optional toggle for resolved inline visibility.
- [ ] Distinct marker styling for `medium/low/broken` confidence.

## P1 — UX and error semantics
- [ ] Explicitly document undo/redo behavior (sidecar ops outside markdown undo stack).
- [ ] Ensure malformed sidecar never auto-overwritten.
- [ ] Add user-facing messages for `SCHEMA_INVALID`, `AUTHOR_INVALID`, `ID_CONFLICT`.

## P1 — Remote/SSH validation
- [ ] Validate local workflow end-to-end.
- [ ] Validate Remote-SSH workflow end-to-end.
- [ ] Confirm sidecar path + file I/O behavior is identical across local/remote sessions.

## Acceptance test checklist
- [ ] Create/reply/resolve/reopen works and persists.
- [ ] Broken anchors appear with relink CTA.
- [ ] Reanchor reason/confidence updates are visible and persisted.
- [ ] Corrupt sidecar enters safe read-only mode.
- [ ] Commands/settings function in local + Remote-SSH sessions.

## Suggested implementation order
1. Scaffold + commands/settings
2. Sidecar load/save/error handling
3. Mutation operations
4. Reanchor integration
5. Panel + marker rendering
6. Remote/SSH validation + polish
