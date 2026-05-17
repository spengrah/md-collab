# spec-for-anchor-engine-patches-from-jot

Status: v0.2 draft
Date: 2026-05-16
Paired guidance: `../../guidance/backend/guidance-for-anchor-engine-patches-from-jot.md`
Source analysis: `.ai/research/jot-anchor-model-analysis-2026-05-16.md`

## 1. Scope

Normative TS core patches incorporating patterns extracted from the source of `badlogic/jot`. These are small, discrete improvements to md-collab's anchor handling that benefit all frontends (VS Code extension, Obsidian plugin, future native client) and should ship before or alongside the native-client v0.

## 1.1 Requirement IDs covered

(To be assigned by `requirements-index.md` maintainer; placeholder: `MDC-BE-AE-{01..04}`)

## 2. Out of scope (with rationale)

1. **Adopting jot's exact-position fast path** — md-collab's `spec-for-reanchoring-engine.md` § 4 step 1 ("Fast exact positional check") already implements this. No patch needed.
2. **Switching to jot's `+12/+12/-Δ/8` distance-decay scoring** — md-collab's existing candidate scoring (`0.4 * prefix_overlap + 0.4 * suffix_overlap + 0.2 * levenshtein_similarity`) is more nuanced. Switching is not clearly beneficial; documented as alternative but not adopted.
3. **Adopting silent-drop on broken anchor** — explicitly rejected; md-collab's `broken` confidence state with explicit relink CTA is the better behavior. Reinforced as cross-frontend invariant.
4. **Adopting jot's anchor data model (`quote/prefix/suffix/start/end` flat)** — md-collab's hybrid model is structurally more defensive. Not changing.

## 3. Patches

### Patch 1: Sort threads by anchor start on serialization

**Currently**: `src/serializer.ts` sorts object keys for byte-identical writes but does not enforce thread ordering.

**Patch**: serializer must sort `threads[]` by `anchor.primary.start.offset_utf16` ascending before write. Ties broken by `thread_id` lexicographic ascending.

**Rationale**: deterministic, reading-order traversal of threads makes panel/rail UIs trivially consistent across frontends; eliminates "threads appear in different order in different editors" surprises; produces stable diffs in git-tracked sidecar mode.

### Patch 2: Anchor sanitization caps in schema + operations

**Currently**: schema declares `quote: { type: string, minLength: 1 }` and `prefix/suffix: { type: string }` with no upper bounds. `operations.ts` has no defensive trimming.

**Patch**:
1. Update `schemas/comments-sidecar.schema.json`:
   - `fallback.quote`: add `"maxLength": 1000`
   - `fallback.prefix`: add `"maxLength": 200`
   - `fallback.suffix`: add `"maxLength": 200`
2. Update `src/operations.ts` to defensively trim `quote`, `prefix`, `suffix` to the documented caps on any mutation that constructs or modifies an anchor, before persistence. Trimming behavior: take the trailing `maxLength` characters for `prefix` (closest context to the quote), leading `maxLength` characters for `suffix`, and reject (`SCHEMA_INVALID`) for `quote > maxLength` rather than truncating (preserves anchor semantics).
3. Update schema validator error messages to mention the cap when triggered.

**Rationale**: prevents pathological anchors (whole-document quote, gigabyte context windows) from polluting sidecars; bounds memory and parse cost; aligns with industry prior art (jot enforces same caps in `src/server.ts:1681-1698`).

### Patch 3: Unified context-window constant across frontends

**Currently**: each frontend (VS Code extension, Obsidian plugin) sets its own context-window size when constructing fallback anchors from selections. Sizes may diverge silently (jot demonstrates the latent bug: 32 server-side vs 40 client-side).

**Patch**:
1. Define a single canonical constant in TS core, e.g. `src/types.ts` or a new `src/constants.ts`:
   ```ts
   export const ANCHOR_CONTEXT_WINDOW_CHARS = 64;
   ```
2. Both `vscode-extension/` and `obsidian-plugin/` must import this constant when constructing fallback anchors; no hardcoded magic numbers permitted.
3. Add a lint rule or test that fails CI if `vscode-extension/` or `obsidian-plugin/` source files contain `prefix.slice` or `suffix.slice` with numeric literal arguments not sourced from the canonical constant.

**Rationale**: prevents silent drift between frontends; single source of truth; the value (64) is a deliberate choice — larger than jot's 32-40 because md-collab also stores `context_hash` and benefits from denser context.

### Patch 4: Persist relocated `primary` anchor after successful re-anchor

**Currently**: `src/reanchor.ts` reads `anchor.primary.start.offset_utf16` and produces a relocated position with updated confidence. It is unclear whether the relocated `primary` is then persisted back to the sidecar; the spec does not require it.

**Patch**:
1. On a successful re-anchor that produces confidence `high`, `medium`, or `low` (i.e. not `broken`), the engine must produce an updated `primary.start` and `primary.end` reflecting the relocated position.
2. The frontend (or `operations.ts`, depending on integration point) must then persist the updated `primary` to the sidecar on the next sidecar write.
3. The `fallback` block (`quote`, `prefix`, `suffix`, `quote_hash`, `context_hash`) must NOT be rewritten by the engine — it remains as originally captured by the user, so subsequent re-anchoring sessions always have the same "ground truth" to work from.
4. If `primary` was updated, append a new field `anchor.primary.doc_revision` reflecting the revision against which the relocation succeeded (already in schema; just must be populated).
5. If `primary` was NOT updated (re-anchor returned `broken`), no write to `primary` occurs; `relevance_state` and `relevance_reason` track the broken status separately.

**Rationale**: without persisted relocation, every session re-pays the full re-anchoring scan; after a sequence of relocations the original `primary` drifts arbitrarily far from reality, degrading scoring fidelity. Jot has this exact anti-pattern documented in `jot-anchor-model-analysis-2026-05-16.md` § "Anti-patterns to avoid" item B. Persisting the relocated `primary` while preserving the captured `fallback` keeps the engine self-improving across sessions without losing recoverability.

## 4. Cross-cutting concerns

1. **Schema versioning**: patch 2 (maxLength) is technically a schema tightening — existing sidecars with quote > 1000 chars or prefix/suffix > 200 chars become invalid. Add a migration step in the schema validator: on first load of a sidecar that exceeds caps, surface a warning and offer a one-time "trim to cap" repair via UI. Bump `schema_version` only if breaking validation; otherwise patch in `0.1.0` as a tightening. Read-only frontends MAY satisfy this migration requirement by surfacing the cap-violation parse error and offering external-editor repair (per amended `../frontend/spec-for-native-client-mvp.md` §11.2). Editing-capable frontends MUST provide an in-app trim-to-cap repair action.
2. **Test fixtures**: add fixtures to `tests/fixtures/anchors/` covering:
   - Sidecar with threads in non-sorted order: serializer must produce sorted output (Patch 1).
   - Sidecar with oversized quote/prefix/suffix: validator must reject (Patch 2).
   - Frontend code that uses raw numeric literal for context window: lint rule must fail (Patch 3).
   - Document edits that relocate an anchor: subsequent sidecar must show updated `primary` while preserving original `fallback` (Patch 4).
3. **Frontend coordination**: patches 3 and 4 require coordinated changes in `vscode-extension/` and `obsidian-plugin/`. Patches 1 and 2 are TS core-only.
4. **Acceptance must not regress** existing `tests/fixtures/anchors/` reanchor cases.

## 5. Acceptance criteria

1. Sidecars serialized by patched `src/serializer.ts` have `threads[]` ordered by `anchor.primary.start.offset_utf16` ascending, then `thread_id` ascending; verified by a round-trip test on a sidecar with deliberately unsorted threads.
2. Schema validator rejects (`SCHEMA_INVALID`) any sidecar with `fallback.quote` length > 1000, `fallback.prefix` length > 200, or `fallback.suffix` length > 200.
3. `operations.ts` mutations that construct anchors produce `prefix` and `suffix` no longer than 200 chars; oversized `quote` causes an explicit error rather than silent truncation.
4. Grep for numeric literal arguments to `prefix.slice` / `suffix.slice` / context-window-related slicing in `vscode-extension/` and `obsidian-plugin/` source returns zero hits; all such slicing references `ANCHOR_CONTEXT_WINDOW_CHARS` from TS core.
5. On successful re-anchor (non-`broken`) followed by sidecar save, the persisted sidecar contains an updated `anchor.primary.start` and `anchor.primary.end` matching the relocated position, with `anchor.primary.doc_revision` populated; the persisted `anchor.fallback` is byte-identical to the pre-reanchor value.
6. On `broken` re-anchor, the persisted sidecar's `anchor.primary` is unchanged from the prior session; `relevance_state: "orphaned"` and `relevance_reason: "ANCHOR_NOT_FOUND"` (or similar appropriate code) are set.
7. All existing `tests/fixtures/anchors/` cases continue to pass.

## 6. Dependencies and downstream impact

- `spec-for-reanchoring-engine.md` — patch 4 reinforces existing engine output (no change to algorithm; clarifies persistence obligation).
- `spec-for-comments-sidecar.md` — patch 2 tightens schema (additive `maxLength`).
- `spec-for-native-client-mvp.md` — depends on these patches being merged; the native client inherits the improvements transparently.
- VS Code extension and Obsidian plugin — must adopt patches 3 and the persistence-side of patch 4 in coordinated releases.
