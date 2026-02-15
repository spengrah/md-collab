# guidance-for-thread-panel-chat-webview

## Intent
Implement a genuinely chat-like thread panel UX (bubble-first) without compromising existing sidecar safety guarantees.

## Implementation guidance

1. Build a thin view-model adapter
- Keep core model and command handlers unchanged.
- Add a pure transform layer from `DocumentThreadState` -> `ChatPanelViewModel`.
- Keep transform deterministic and testable with snapshot fixtures.

2. Keep writes in extension host
- Webview posts intent messages only.
- Extension host validates payload and dispatches canonical commands.
- Never import sidecar write code into webview bundle.

3. Make action affordances obvious
- Render explicit buttons in each expanded thread (`Reply`, `Resolve/Reopen`, `Suggest`).
- Do not rely on right-click or hidden kebab menus for primary actions.
- Keep button labels task-oriented and short.

4. Prefer message readability over metadata density
- Put author/time in a light header row.
- Give body enough width/height to read naturally.
- Move relevance/timeline/confidence to secondary badges/tooltip.

5. Support selection-first suggestion workflow
- Primary suggestion button should trigger `proposeSuggestionFromSelection` path.
- If no valid selection, show immediate actionable instruction.
- Preserve thread-scoped suggestion path when invoked within a specific thread.

6. Design for Remote-SSH resilience
- Keep webview assets small and local.
- Avoid heavy client-side frameworks if plain TS + template render is enough.
- Use incremental updates to reduce message-passing overhead.

7. Test strategy
- Unit tests:
  - view-model mapping
  - intent->command routing table
  - status/action visibility by thread state
- Integration tests:
  - resolve/reopen via webview buttons
  - suggestion propose/apply/reject path
  - conflict warning recovery action
- Manual acceptance:
  - keyboard-only operations
  - long-thread readability
  - high-thread-count responsiveness

## Suggested phased plan

1. Phase A — scaffolding
- Add webview container + static mock bubbles.
- Wire extension->webview data push.

2. Phase B — command intents
- Wire reply/resolve/reopen/suggest intents to existing commands.
- Keep TreeView as fallback.

3. Phase C — suggestion cards
- Render suggestion states and action buttons.
- Integrate base-version action/help messaging.

4. Phase D — polish + default switch
- Accessibility and performance pass.
- Make webview default panel.
- Leave TreeView behind a debug/legacy toggle.

## Anti-patterns to avoid
1. Re-implementing mutation logic in webview.
2. Rendering thread rows as metadata-dense single lines.
3. Coupling panel rendering to git-only assumptions.
4. Hiding resolve/suggest actions behind discoverability traps.
