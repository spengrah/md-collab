# md-collab UX benchmark gap analysis (v0)

## Capability matrix (baseline)

| Dimension | md-collab (before) | md-collab (after this pass) | Google Docs | HackMD |
|---|---|---|---|---|
| Comment creation discoverability | Command palette only | Command palette + editor context menu + keybinding | Inline + context + shortcut | Inline + toolbar + context |
| Thread readability | Thread summary row only | Full per-thread conversation, author + timestamp, inline reply action | Full thread UI | Full thread UI |
| Thread-to-text navigation | None from panel row | Click thread to jump/reveal + transient highlight | Click thread jumps | Click thread jumps |
| Broken-anchor behavior | Not actionable | Fallback to prior known location + warning, explicit no-location message | N/A (live model) | Varies by anchor model |
| External sidecar change safety | Stale in-memory risk | Watch/reload + pre-write checkpoint/hash + explicit conflict abort + manual reload command | Server authoritative | Server authoritative |

## Prioritized UX gaps

### P0 gaps
1. **Fast add-comment affordances**
   - Spec mapping: `spec/frontend/spec-for-comment-authoring-ux-v0.md`
   - Guidance mapping: `guidance/frontend/guidance-for-comment-authoring-ux-v0.md`
2. **Panel-to-document navigation**
   - Spec mapping: `spec/frontend/spec-for-thread-navigation-v0.md`
   - Guidance mapping: `guidance/frontend/guidance-for-thread-navigation-v0.md`
3. **Lost-update protection for sidecar writes**
   - Spec mapping: `spec/frontend/spec-for-sidecar-sync-and-write-safety-v0.md`
   - Guidance mapping: `guidance/frontend/guidance-for-sidecar-sync-and-write-safety-v0.md`

### P1 gaps
1. **Conversation-style panel rendering**
   - Spec mapping: `spec/frontend/spec-for-threaded-panel-v0.md`
   - Guidance mapping: `guidance/frontend/guidance-for-threaded-panel-v0.md`

### P2 gaps
1. **Further polish parity with mature products**
   - Examples: richer inline compose UI, avatar rendering, per-message action menus, keyboard-only thread navigation.

## Acceptance criteria by gap

### P0.1 Add-comment ergonomics
- [ ] Right-click in markdown selection shows `md-collab: Add Comment`.
- [ ] Keybinding triggers same command path only when selection exists.
- [ ] No-selection invocation shows clear message and does not write sidecar.

### P0.2 Thread navigation
- [ ] Clicking a thread in panel reveals and focuses anchor range.
- [ ] Closed document is opened before reveal.
- [ ] Broken anchor jumps to best known location and warns user.
- [ ] Missing location shows explicit message and does not move cursor unexpectedly.
- [ ] Jump applies transient highlight.

### P0.3 Sidecar write safety
- [ ] External sidecar edits are reloaded via watch or manual reload command.
- [ ] Every mutation validates checkpoint (mtime/hash/exists token) before write.
- [ ] Conflict path aborts write with explicit user guidance.
- [ ] No silent overwrite of externally changed sidecar.

### P1.1 Threaded panel readability
- [ ] Open/resolved grouping retained.
- [ ] Each thread expands to chronological messages.
- [ ] Each message shows author + timestamp.
- [ ] Inline reply affordance is available per-thread in panel.

## Pass/fail test steps for P0

1. **Create comment from context menu**
   - Select markdown text.
   - Right click → `md-collab: Add Comment`.
   - Enter comment body.
   - **Pass:** new thread appears; sidecar updates once.

2. **Selection guard**
   - Clear selection.
   - Run add-comment command/keybinding.
   - **Pass:** user message shown; sidecar unchanged.

3. **Navigation happy path**
   - Click open thread in panel.
   - **Pass:** editor opens/reveals anchor and highlights range briefly.

4. **Broken anchor fallback**
   - Force broken confidence with retained primary location.
   - Click thread.
   - **Pass:** jump occurs near prior location and warning appears.

5. **Conflict guard**
   - Load state in extension.
   - Modify sidecar externally.
   - Attempt reply/resolve from stale state.
   - **Pass:** write aborted and conflict message asks reload/retry.
