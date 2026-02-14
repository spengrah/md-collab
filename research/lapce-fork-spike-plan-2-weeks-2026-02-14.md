# Lapce fork spike plan (2 weeks) — md-collab

Date: 2026-02-14  
Owner: Lyle (proposed)  
Goal: Determine whether a Lapce fork can realistically support md-collab’s required UX: **inline thread widgets + dedicated thread navigation panel**.

## 1) Spike objective (binary)
By end of week 2, decide one of:
1. **Proceed** to fork roadmap (with scoped milestone + staffing), or
2. **Stop** and keep Lapce as non-primary target (VS Code remains primary).

## 2) Scope boundaries
In-scope (must test):
1. Editor inline thread widget rendering (anchored to range, not just LSP text hints).
2. Dedicated thread navigation panel/tree contribution.
3. Click-through synchronization (panel item -> editor range; editor interaction -> panel focus).
4. Sidecar watch + refresh path integrated into forked runtime.

Out-of-scope (for this spike):
1. Full suggestion lifecycle parity.
2. Production-grade polish/accessibility completeness.
3. General plugin ecosystem strategy.
4. Broad refactors unrelated to collaboration UI primitives.

## 3) Proposed touchpoints (fork-level)
Expected code zones to probe/patch:
1. Editor rendering path (inline overlay/widget anchoring).
2. Panel/workbench shell (new collaboration panel model + state wiring).
3. Proxy/event bridge (sidecar watch events routed to UI state updates).
4. Command/action dispatch (reply/resolve/jump hooks).

Deliver only minimal vertical slice code; avoid architecture-wide rewrites.

## 4) Deliverables by end of week 2
1. **Demo artifact** (video or reproducible script) showing:
   - one inline thread widget anchored to markdown range,
   - one thread panel listing threads,
   - bidirectional navigation sync,
   - sidecar edit external change reflected in UI.
2. **Patch map**:
   - files/modules touched,
   - rough maintenance surface estimate.
3. **Risk memo**:
   - upstream drift risk,
   - expected ongoing maintenance burden,
   - staffing assumptions.
4. **Decision memo**:
   - Proceed / Stop,
   - confidence and rationale.

## 5) Success gates (must all pass)
1. **Inline widget gate:** real inline UI element (not only CodeLens/inlay text) displayed and interactive.
2. **Panel gate:** dedicated thread panel exists and updates from sidecar source.
3. **Sync gate:** panel<->editor focus sync works reliably for at least 10 thread interactions.
4. **Watch gate:** external sidecar file change updates UI within a practical latency threshold (<2s target).
5. **Complexity gate:** patch touches remain bounded (no broad invasive rewrite across unrelated subsystems).

If any gate fails by end of week 2, default decision is **Stop**.

## 6) Kill criteria (early stop)
Stop immediately if any of the following are observed:
1. Inline widget support requires near-total editor rendering redesign.
2. Panel contribution requires brittle hacks with high break risk per upstream release.
3. Sidecar watch/update path cannot be made deterministic without global event architecture changes.
4. Estimated maintenance exceeds agreed budget (e.g., >1 day/week ongoing upkeep for baseline function).
5. No reproducible vertical-slice demo by day 8.

## 7) Effort + risk bands
1. **Best case (low):** 4-6 focused engineering days; clean extension points discovered.
2. **Expected (medium-high):** 8-12 days; several core touchpoints + technical debt accepted.
3. **Worst (very high):** 2+ weeks with no reliable inline+panel slice; indicates fork path is strategically expensive.

## 8) Week-by-week plan
### Week 1 — feasibility skeleton
1. Stand up fork branch and minimal build/dev loop.
2. Add hardcoded inline widget prototype on markdown range.
3. Add basic thread panel with static/demo state.
4. Wire panel -> editor navigation.

Exit checkpoint (end week 1):
- If inline widget or panel cannot be achieved cleanly, trigger early stop.

### Week 2 — integration slice
1. Connect sidecar parsing + thread state feed.
2. Wire sidecar watch and UI refresh.
3. Add editor -> panel focus sync.
4. Produce demo + patch map + risk memo + decision memo.

## 9) Decision output format
At completion, produce:
1. **Verdict:** Proceed / Stop
2. **Confidence:** high/med/low
3. **Why:** top 3 decisive facts
4. **If Proceed:** first milestone scope and timeline
5. **If Stop:** fallback plan (VS Code primary, Lapce parked)

## 10) Recommended default if ambiguous
If results are mixed/ambiguous, choose **Stop** and continue VS Code path. Re-open Lapce only if strategic priorities change or additional contributors can own fork maintenance.

---

## Execution updates
- 2026-02-14 initial execution pass report: `research/lapce-fork-spike/spike-report-initial-pass-2026-02-14.md`
- 2026-02-14 final execution report: `research/lapce-fork-spike/spike-report-final-2026-02-14.md`
- 2026-02-14 fork patch artifact: `research/lapce-fork-spike/lapce-fork-thread-prototype.patch`
