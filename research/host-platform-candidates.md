# Host Platform Candidates — Initial Scoring (v0)

Project: md-collab  
Date: 2026-02-12

Scoring basis:
- Required API groups A–F are the viability gate for native inline-comments MVP.
- Additional rubric dimensions: plugin maturity, remote/SSH fit, maintenance risk, time-to-MVP.
- Scale: 1 (poor) to 5 (strong).

## Candidate scoring (initial pass)

| Candidate | A–F API fit | Plugin maturity | SSH/remote fit | Maintenance risk (5=low risk) | Time-to-MVP (5=fast) | Initial tier |
|---|---:|---:|---:|---:|---:|---|
| VS Code | 5 | 5 | 5 | 4 | 5 | Now |
| VSCodium | 4 | 4 | 4 | 3 | 4 | Now |
| Obsidian | 4 | 4 | 2 | 3 | 5 | Now |
| Neovim | 4 | 5 | 5 | 3 | 3 | Maybe |
| Emacs | 4 | 5 | 5 | 2 | 2 | Maybe |
| Zed | 2 | 3 | 4 | 3 | 3 | Maybe |
| Kate | 3 | 3 | 2 | 3 | 2 | Maybe |
| JetBrains Fleet | 2 | 2 | 4 | 2 | 2 | No (for now) |
| Pulsar (Atom successor) | 3 | 2 | 2 | 1 | 2 | Maybe/No |
| Lapce | 2 | 2 | 4 | 1 | 2 | No (for now) |
| Helix | 1 | 1 | 5 | 1 | 1 | No |

## Notes
- This is an initial directional scoring pass, not a final decision matrix.
- Obsidian scores highly on Markdown workflow and speed, but lower on SSH-first remote workflow fit.
- VS Code is currently the strongest default for A–F completeness + remote workflow + delivery speed.

## Related files
- Rubric definition: `projects/md-collab/research/host-platform-rubric.md`
