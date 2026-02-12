# Host Platform Evaluation Rubric (v0)

Project: md-collab  
Date: 2026-02-12

## Purpose
Use this rubric to evaluate editor/platform candidates for md-collab extension/plugin development.

## Scope assumptions
- Required API capability groups: **A–F**
- Optional for later: **G/H/I**
- Out of scope for host decision: **J** (agent API; agents can operate directly on `.md` + sidecar `.json`)

## Required API groups (pass/fail gate)
A. Document + editor state APIs  
B. Decoration + interaction APIs  
C. Event APIs  
D. Extension UI container APIs  
E. Filesystem + persistence APIs  
F. Anchor + text model APIs

A candidate that fails critical A–F needs should be marked **No** for native inline-comments MVP.

## Scored dimensions (1–5 each)
1. **A–F API support completeness**  
   - 1 = major blockers, 5 = strong native support

2. **Extension/plugin ecosystem maturity**  
   - 1 = immature/unstable, 5 = mature docs/tooling/community

3. **Remote/SSH workflow fit**  
   - 1 = weak/no practical remote workflow
   - 3 = workable with friction or partial parity
   - 5 = strong, first-class SSH/remote development flow

4. **Maintenance risk** (reverse; lower risk scores higher)  
   - 1 = high likely long-term maintenance burden
   - 5 = low maintenance burden / sustainable path

5. **Time-to-MVP** (reverse; faster scores higher)  
   - 1 = slow/high uncertainty
   - 5 = fast/clear implementation path

## Output format for each candidate
- Candidate name
- Recommendation tier: **Now / Maybe / No**
- A–F support summary (with confidence)
- SSH fit notes
- Key risks
- Rough time-to-MVP estimate
- Sources/links

## Decision rule (initial)
- **Now**: passes A–F gate, SSH fit >=4, and weighted score in top tier
- **Maybe**: partial gaps or strategic upside with manageable risk
- **No**: fails key A–F requirements or unacceptable maintenance/time profile

## Notes
- SSH fit is mandatory in this project because Spencer requested IDE-like remote workflow compatibility.
- Keep canonical docs as Markdown and comment state in sidecar JSON.
