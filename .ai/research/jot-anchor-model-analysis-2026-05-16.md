# jot anchor model — analysis and lessons for md-collab

Project: md-collab
Date: 2026-05-16
Status: Concluded
Parent: `host-platform-reevaluation-2026-05-16.md` § Anchor model alternatives
Subject: `badlogic/jot` — self-hosted collaborative markdown editor with comment threads

## Purpose

`jot` was identified in the May 2026 host platform re-evaluation as a kindred-spirit competing product ("built for humans and agents") and was suspected of using a fundamentally different anchor model — CRDT-style stable IDs via `articulated`. This document records the actual jot anchor model after source inspection and extracts concrete patterns md-collab can borrow without giving up its design constraints.

**Key surprise**: jot does **not** use articulated for thread anchors. Articulated powers jot's realtime text CRDT (the document character stream), but comment anchors live in **plain markdown offsets, completely decoupled from CRDT state**. Jot's anchor model is structurally similar to md-collab's `fallback` anchor — simpler, less defensive, no confidence tier.

## Jot's anchor data shape (verbatim)

`src/server.ts:33-39`:
```ts
type CommentAnchor = {
  quote: string;
  prefix: string;
  suffix: string;
  start: number;   // markdown offset
  end: number;
};
```

That is the entire model. No confidence enum, no hashes, no line/column, no primary/fallback split.

Sanitization in `src/server.ts:1681-1698`:
- `quote` capped at 1000 chars
- `prefix`/`suffix` capped at 200 chars
- Rejects when `quote` empty, `start<0`, or `end<start`

## Create flow

**Server-side path** (`src/server.ts:407-460`):
```ts
const start = note.markdown.indexOf(quote);
if (start === -1) { res.status(400)... "Quoted text not found"; return; }
const prefix = note.markdown.slice(Math.max(0, start - 32), start);
const end = start + quote.length;
const suffix = note.markdown.slice(end, end + 32);
const anchor: CommentAnchor = { quote, prefix, suffix, start, end };
```

Server snaps **32-char** context windows. No dedupe — first occurrence wins.

**Browser path** (`public/app.js:1726-1744`):
```js
return {
  quote,
  prefix: mapping.fullText.slice(Math.max(0, start - 40), start),
  suffix: mapping.fullText.slice(end, Math.min(mapping.fullText.length, end + 40)),
  start, end,
};
```

Browser uses **40-char** context (vs server's 32 — latent bug). `mapping.fullText` is built from a `TreeWalker` over rendered HTML (`collectTextNodes`, `public/app.js:1801+`), so offsets are over the visible preview text, not raw markdown. Server stores raw-markdown offsets. **Two different coordinate systems coexist** because the same anchor object survives both and resolution is done over each side's own text.

## Resolve flow

Every render of the comment rail re-resolves all anchors from scratch (`public/app.js:1108-1138` calls `locateAnchor` per thread).

`locateAnchor` (`public/app.js:1746-1799`):
1. **Fast path**: `fullText.slice(anchor.start, anchor.end) === anchor.quote` — return immediately if unchanged
2. **Candidate collection**: all `indexOf(quote)` matches
3. **Scoring**: each candidate gets
   - `+12` if preceding text equals `prefix`
   - `+12` if following text equals `suffix`
   - `-|candidate - anchor.start| / 8` (distance penalty)
4. **Best score wins**; build a DOM `Range` from it
5. **No match → return null** → thread is silently filtered out of the visible rail

## Drift handling

- **No re-write of persisted anchor after relocation.** Even when an anchor relocates successfully, `anchor.start/end/prefix/suffix` are never updated on disk. Every load re-pays the full scan.
- **No broken/orphan state surfaced to user.** A missing `quote` just disappears from the rail. Thread still exists server-side; just isn't visible. No confidence tier, no "broken" indicator.
- **Edits within an anchored span destroy it.** The quote no longer exists verbatim → `indexOf` fails → thread vanishes. No split / expand / partial-match recovery.

## What articulated actually is (and why it's not used here)

`mweidner037/articulated`: a persistent immutable B+Tree keyed by `ElementId = {bunchId: string, counter: number}`. Each leaf compresses sequential runs of counters sharing one bunchId. `delete` is a tombstone (ID stays "known") for stable cursors. **Not a CRDT** (concurrent `insertAfter`-with-same-`before` doesn't commute) but designed as the substrate for one via server reconciliation total-ordering.

Jot uses articulated for the **realtime text CRDT** in `src/collab.ts:322-350` — i.e. the character stream that lets multiple cursors edit without conflict. Comment anchors do **not** ride this CRDT — they're plain markdown offsets validated/relocated at render time.

This is an interesting design choice: jot has CRDT infrastructure in-hand and chose **not** to anchor comments on top of it. Likely reasons: simpler mental model, decoupled from realtime concerns, doesn't require comment-aware CRDT replication.

## Side-by-side with md-collab

### Data model

| Field | jot | md-collab |
|---|---|---|
| Stable ID | — | — |
| Positional | `start`, `end` (number) | `primary.{start,end}.{line, column, offset_utf16}` |
| Quote | `quote` (≤1000 chars) | `fallback.quote` |
| Context | `prefix` / `suffix` (32 srv / 40 cli chars) | `fallback.prefix` / `suffix` |
| Hashes | — | `quote_hash`, `context_hash` (sha256:...) |
| Confidence tier | — | `anchor_confidence: high\|medium\|low\|broken` |

### Lifecycle

| Stage | jot | md-collab |
|---|---|---|
| Create | `indexOf(quote)`, snap context window | Rich primary + fallback + hashes |
| Persist | Raw markdown offsets, never rewritten | Sidecar JSON, canonical fields, updated on save |
| Resolve | Scored candidate scan every render | Re-anchoring engine on open + on demand |
| Drift handling | Silently filtered if `quote` not found | Confidence tier surfaced; broken state explicit |
| Edit within span | Breaks anchor → thread vanishes | Engine attempts re-anchor with confidence demotion |

## Verdict: md-collab is the more defensive model. Keep it.

md-collab's hybrid positional + quote/context model, with explicit confidence tier and re-anchoring engine, is structurally **superior to jot's** for the design goals in `PRD.md` § 3.1 (deterministic re-anchoring, confidence-labeled fallback, no false-positive reattachment). Jot's "first `indexOf` wins, silently drop on failure" behavior is operationally simpler but operationally worse — users lose threads with no signal.

That said, jot has some surface-level wins md-collab should adopt.

## Patterns to borrow

### 1. Exact-position fast path before scanning
**Where**: `public/app.js:1753-1756`
**What**: `if (fullText.slice(anchor.start, anchor.end) === anchor.quote) return immediately`
**Why for md-collab**: cheap O(1) check; skips entire re-anchoring engine when nothing drifted. Should be step 0 of the engine, before tier 1 (positional match). Most opens of an undriffed document hit this path.
**Effort**: trivial, a few lines in `src/reanchor.ts`.

### 2. Symmetric distance-decay scoring for ambiguous quote matches
**Where**: `public/app.js:1770-1790`
**What**: `+12 prefix-match / +12 suffix-match / -|Δstart| / 8`
**Why for md-collab**: concrete starting weights for a scenario the current engine already handles (multiple quote matches → use context). Replaces any binary "passes/fails" logic with continuous scoring. Worth comparing to current re-anchor tier 3 (context disambiguation) and adopting if the engine's current scoring is less principled.
**Effort**: small change in `src/reanchor.ts`; add tests to `tests/fixtures/anchors/`.

### 3. Sort threads by `anchor.start` at serialization
**Where**: `src/server.ts:1573-1580`
**What**: threads are returned in reading order without UI sort work
**Why for md-collab**: ensures consistent rail/panel order across frontends (VS Code, Obsidian, future Tauri/native). Removes a category of "why are my threads in different orders in different editors" surprises.
**Effort**: small change in `src/sidecar-file.ts` write path; add deterministic-serialization test.

### 4. Anchor sanitization with explicit caps in the schema validator
**Where**: `src/server.ts:1681-1698` (`sanitizeAnchor`)
**What**: 1000-char `quote` cap, 200-char `prefix`/`suffix` cap, numeric validity checks
**Why for md-collab**: prevents pathological anchors (entire-document quote, gigabyte context) from polluting sidecars. Bounds should be enforced in `schemas/comments-sidecar.schema.json` (JSON Schema `maxLength`) AND in `src/operations.ts` (defensive trim before write).
**Effort**: small schema + operations change; add validation test.

### 5. Unify client + server context-window size
**Where**: jot bug — 32 chars server-side vs 40 chars browser-side
**What**: pick one constant for context window, import it on both sides
**Why for md-collab**: md-collab vendors core into both VS Code extension and Obsidian plugin; ensure both use the same constant from `src/types.ts` or a dedicated config module. Audit current frontends to verify they're not silently diverging.
**Effort**: grep for any hardcoded `prefix.slice`/`suffix.slice` magic numbers in `vscode-extension/` and `obsidian-plugin/`; consolidate.

## Anti-patterns to avoid

### A. Silently dropping broken threads
Jot returns `null` from `locateAnchor` when no match found, and the thread vanishes from the rail with no surfaced indicator. md-collab's `relevance_state: orphaned` + UI surfacing is the right behavior. Do **not** regress to silent drops in any future frontend.

### B. Never rewriting persisted anchors after successful relocation
Jot's "never write" choice means every page-load re-pays the full scan. After ~2 successful relocations, the original `start/end` is so far from reality that the distance-decay scoring may misbehave. **md-collab should write back the relocated positional anchor** (while preserving the original `fallback` for next-session recovery — those should never be rewritten unless the user explicitly re-anchors). This is implicit in md-collab's design but worth making explicit in `spec/backend/spec-for-reanchoring-engine.md`.

## Open questions

1. Does md-collab's current re-anchoring engine already use a distance-decay scoring function? If not, adopting jot's `+12/+12/-Δ/8` weights as a starting point may be worth A/B-testing against the current implementation. (Check `src/reanchor.ts` for current scoring approach.)
2. Should md-collab document the "write back relocated anchor positions on save" behavior explicitly in `spec/backend/spec-for-reanchoring-engine.md`? Currently implicit.
3. Is there any value in adopting jot's `{oldText, newText}` JSON edit primitive for the `mdc suggestion propose` CLI shape? It's a cleaner agent-facing API than passing full proposed-edit objects.

## Sources

- [`badlogic/jot`](https://github.com/badlogic/jot) — full source @ main, May 2026
  - `src/server.ts` lines 33-39 (anchor type), 407-460 (create), 1573-1580 (sort), 1681-1698 (sanitize)
  - `src/collab.ts` lines 322-350 (articulated wiring, unrelated to thread anchors)
  - `public/collab-shared.js` (SimpleIdList — char-level CRDT plumbing)
  - `public/app.js` lines 1108-1138 (render-time resolve), 1726-1744 (build from selection), 1746-1799 (`locateAnchor`), 1801+ (`collectTextNodes`)
- [`mweidner037/articulated`](https://github.com/mweidner037/articulated) — README, May 2026
- md-collab schema: `schemas/comments-sidecar.schema.json`
- md-collab core: `src/anchor.ts`, `src/reanchor.ts`, `src/operations.ts`, `src/sidecar-file.ts`
