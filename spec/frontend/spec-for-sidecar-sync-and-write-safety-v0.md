# spec-for-sidecar-sync-and-write-safety-v0

Status: partially superseded (v0.1 baseline retained)  
Extended by: `spec-for-git-review-thread-model-v0.md` and `spec-for-version-aware-outdatedness-v0.md`.

Scope: external sidecar changes, refresh, and lost-update mitigation

## 1. Goal
Prevent extension writes from clobbering externally-updated sidecar state.

## 2. Normative requirements
1. Extension must watch sidecar file changes while relevant markdown doc is active.
2. On external sidecar change, extension must reload in-memory state before next mutation.
3. Before write, extension must verify sidecar has not changed since load (mtime/hash/checkpoint).
4. On detected write conflict, extension must abort write and show explicit conflict message.
5. Provide manual refresh command to force reload (`mdCollab.reloadSidecar` or equivalent).

## 3. Conflict behavior
1. No silent overwrite on conflict.
2. User-visible guidance to retry after reload.

## 4. Acceptance criteria
1. External edit (agent/manual) is reflected in panel after reload/watch event.
2. Extension does not drop externally-added messages on subsequent writes.
3. Conflict path is testable and user-visible.
