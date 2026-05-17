# guidance-for-anchor-engine-patches-from-jot

Status: v0.2 draft
Date: 2026-05-16
Paired spec: `../../spec/backend/spec-for-anchor-engine-patches-from-jot.md`
Source analysis: `.ai/research/jot-anchor-model-analysis-2026-05-16.md`

## 1. Purpose

Implementation guidance for the four patches in the paired spec. Captures file-by-file change locations, test additions, frontend coordination plan, and rollout order.

## 2. Patch sequencing

Patches are independent in code but have natural ordering for review and rollout:

1. **Patch 2 (sanitization caps)** — purely additive, ships first. Lowest blast radius.
2. **Patch 1 (sort threads on serialize)** — purely additive, ships next. Will cause one-time diff on existing sidecars (re-sort), which is the desired end state.
3. **Patch 3 (unified context-window constant)** — requires coordinated VS Code + Obsidian releases. Constant value chosen (64) is a deliberate choice; if either frontend is currently using a different value, existing anchors are unaffected (new anchors only).
4. **Patch 4 (persist relocated primary)** — largest behavioral change. Ship after frontends are on the unified constant so all subsequent anchor mutations are coherent.

Patches 1, 2, 3 should be a single sprint; patch 4 can be its own follow-up.

## 3. File-by-file changes

### Patch 1: Sort threads on serialize

- `src/serializer.ts` — add a thread-sort step before `JSON.stringify`. Use `Array.prototype.sort` with comparator `(a, b) => a.anchor.primary.start.offset_utf16 - b.anchor.primary.start.offset_utf16 || a.thread_id.localeCompare(b.thread_id)`. Place the sort inside `sortValue` for arrays whose parent key is `threads`, or wrap with a dedicated `sortThreads(sidecar)` helper called once before the recursive key-sort.
- `tests/fixtures/sidecars/` — add a fixture with deliberately reverse-ordered threads; assert round-trip produces sorted output.
- No schema change.

### Patch 2: Sanitization caps

- `schemas/comments-sidecar.schema.json` — add `"maxLength": 1000` to `fallback.quote`, `"maxLength": 200` to `fallback.prefix` and `fallback.suffix`.
- `src/operations.ts` — wherever an anchor is constructed (likely in a helper used by `comment add` / `thread reanchor` paths), invoke a new `sanitizeAnchorFallback(fallback)` function that:
  - Trims `prefix` to its trailing 200 chars
  - Trims `suffix` to its leading 200 chars
  - Throws `SCHEMA_INVALID` with a clear message if `quote.length > 1000`
- `src/schema.ts` (or wherever validator lives) — make schema validation surface the cap in error messages (not just "string length > maxLength").
- `tests/` — add fixtures with oversized fallback fields; assert validator rejects.

### Patch 3: Unified context-window constant

- Add a new `src/constants.ts` (if not present) exporting `ANCHOR_CONTEXT_WINDOW_CHARS = 64`. Add a sibling `ANCHOR_QUOTE_MAX_CHARS = 1000`, `ANCHOR_CONTEXT_MAX_CHARS = 200` while we're here, so future anchor-related caps live in one place.
- `src/index.ts` — re-export the constant.
- `vscode-extension/` — audit all `prefix.slice` / `suffix.slice` / context-related slice calls. Replace numeric literals with `ANCHOR_CONTEXT_WINDOW_CHARS`. The constant must be available via the vendored TS core (the vendor sync script should pick it up automatically as long as it's re-exported from `src/index.ts`).
- `obsidian-plugin/` — same audit, same replacement.
- Lint rule: add a custom ESLint rule (or simpler: a grep-based CI check) that fails if numeric literal arguments to specific anchor-related functions appear in either frontend.

### Patch 4: Persist relocated primary

- `src/reanchor.ts` — confirm the engine returns the relocated `primary` (start + end) and `doc_revision` as part of its result envelope. If not currently exposed, add to the result type.
- `src/operations.ts` — wherever the re-anchor result is consumed (likely a `refreshRelevance` or post-load hook), update the in-memory thread's `anchor.primary` from the relocation result before the next sidecar write. CRITICAL: do not touch `anchor.fallback` in this path.
- `src/types.ts` — ensure `Anchor.primary` includes `doc_revision: string` (already in schema per `spec-for-comments-sidecar.md`; verify type matches).
- VS Code extension + Obsidian plugin — the relocate-then-save path needs to flow through `operations.ts` (which it should already, per the cross-frontend invariant that all mutations route through TS core). No frontend code change required if the integration is already correct; an audit is prudent.
- `tests/fixtures/anchors/` — add a multi-session fixture: open a sidecar, edit the doc (move anchored text 200 chars), save, close, open. Assert post-reopen `primary.start` matches the relocated position and `fallback` matches the original.

## 4. Test additions

| Fixture | Verifies | Patch |
|---|---|---|
| `tests/fixtures/sidecars/unsorted-threads.json` | Sort on serialize | 1 |
| `tests/fixtures/sidecars/oversized-fallback.json` | Schema rejection of caps | 2 |
| `tests/fixtures/anchors/oversized-quote-rejected.fixture.ts` | Operations layer rejects oversized quote | 2 |
| `tests/fixtures/anchors/oversized-context-trimmed.fixture.ts` | Operations layer trims oversized prefix/suffix | 2 |
| `tests/fixtures/anchors/context-window-constant.fixture.ts` | New anchors use 64-char context | 3 |
| `vscode-extension/test/` + `obsidian-plugin/test/` | Frontends use constant, not magic number | 3 |
| `tests/fixtures/anchors/persist-relocated-primary.fixture.ts` | Multi-session relocation persists primary, preserves fallback | 4 |
| `tests/fixtures/anchors/broken-leaves-primary-untouched.fixture.ts` | Broken re-anchor does not write primary | 4 |

All fixtures should follow existing `tests/fixtures/anchors/` conventions (input doc, input sidecar, expected sidecar, expected confidence).

## 5. Migration / backward compatibility

- **Patch 1**: existing sidecars will be re-sorted on next save. Acceptable; the re-sort is deterministic and the per-thread content is unchanged.
- **Patch 2**: existing sidecars with oversized fields become invalid. Surface as a warning on load (not a hard error) with a one-time "trim to cap" repair option. Implementation: extend the read path in `src/sidecar-file.ts` to detect oversize-but-otherwise-valid sidecars and surface a `WARN: SIDECAR_NEEDS_REPAIR` envelope; UI handles offering the repair. For headless `mdc` operations, add a `--repair` flag or surface as an exit-code that operators can script.
- **Patch 3**: no migration — existing anchors retain their (potentially varying) context window. New anchors use the constant. Drift gradually reduces as old threads are resolved.
- **Patch 4**: no migration — `primary` will start being updated on the first re-anchor after the patch lands.

## 6. Cross-frontend coordination

For patches 3 and 4, coordinate:
1. TS core PR merges first.
2. `bun run build` produces updated `dist/`.
3. VS Code extension PR: `npm --prefix vscode-extension run precompile` syncs vendor; PR adopts new constant; PR ships.
4. Obsidian plugin PR: `node obsidian-plugin/scripts/sync-core.mjs` syncs vendor; PR adopts new constant; PR ships.
5. Native client (when it exists) inherits via vendor sync — no separate PR needed.

The PRs can land in either order across frontends since the constant is backward-compatible (frontends can ignore it and keep their hardcoded value until ready).

## 7. Why these and not others

The jot analysis surfaced five patterns + two anti-patterns. Of those, two patterns and one anti-pattern were already implemented or out of scope:

| jot pattern | Status | Reason |
|---|---|---|
| #1 Exact-position fast path | Already implemented | `spec-for-reanchoring-engine.md` § 4 step 1 |
| #2 Symmetric distance-decay scoring | Not adopted | md-collab's scoring (`0.4 * prefix + 0.4 * suffix + 0.2 * levenshtein`) is more nuanced; jot's is simpler but no clear win |
| #3 Sort threads by start | **Patch 1** | Genuinely missing |
| #4 Sanitization caps | **Patch 2** | Genuinely missing |
| #5 Unify context window | **Patch 3** | Frontends may have silently diverged |
| Anti-pattern A: silent drop on broken | Already handled | md-collab surfaces `broken` state with relink CTA |
| Anti-pattern B: never rewrite primary | **Patch 4** | Engine produces relocation but persistence is implicit/unverified |

## 8. References

- Spec: `../../spec/backend/spec-for-anchor-engine-patches-from-jot.md`
- Source analysis: `.ai/research/jot-anchor-model-analysis-2026-05-16.md`
- Existing reanchoring engine: `../../spec/backend/spec-for-reanchoring-engine.md`
- Existing sidecar schema: `../../spec/backend/spec-for-comments-sidecar.md`
- Native client (consumer of these patches): `../../spec/frontend/spec-for-native-client-mvp.md`
