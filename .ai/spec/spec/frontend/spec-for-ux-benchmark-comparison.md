# spec-for-ux-benchmark-comparison-v0

Status: draft v0.1

## 1. Goal
Use mature benchmark products (Google Docs, HackMD) to drive concrete UX deltas for md-collab.

## 2. Comparison dimensions
1. Comment creation speed and discoverability.
2. Thread readability and reply flow.
3. Navigation between thread and text.
4. Resolution/reopen workflow visibility.
5. External-change robustness/refresh behavior.

## 3. Required output artifact
Create and maintain `docs/ux-benchmark-gap-analysis.md` containing:
1. baseline capability matrix (md-collab vs benchmark tools)
2. prioritized UX gaps (P0/P1/P2)
3. implementation mapping to spec-for/guidance-for docs
4. measurable acceptance criteria for each gap

## 4. Acceptance criteria
1. Every new UX feature links to at least one benchmark gap.
2. P0 UX items have explicit pass/fail test steps.
