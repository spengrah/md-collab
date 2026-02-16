# Coupling Map: spec-for-* ↔ guidance-for-* (v0.1)

This file mirrors the spec/guidance pairing style from the assurances pattern.

| Spec (normative) | Guidance (implementation) | Coupling intent |
|---|---|---|
| `spec-for-review-interaction-model.md` | `../../guidance/frontend/guidance-for-review-interaction-model.md` | PR-style interaction patterns + safe command routing |
| `spec-for-thread-panel-chat-webview.md` | `../../guidance/frontend/guidance-for-thread-panel-chat-webview.md` | webview layout + intent-to-command routing discipline |
| `spec-for-obsidian-plugin.md` | `../../guidance/frontend/guidance-for-obsidian-plugin.md` | Obsidian-specific panel patterns + sidecar command parity |
| `spec-for-ux-benchmark-comparison.md` | (no paired guidance) | benchmark artifact maintenance only |

## Coupling rule
A spec change should either:
1. require no implementation-behavior guidance change (explicitly noted), or
2. include a paired guidance update in the same commit.

## No-change rationale references
- 2026-02-16: `spec-for-ux-benchmark-comparison.md` remains guidance-free as it defines gap documentation only, not behavior.
