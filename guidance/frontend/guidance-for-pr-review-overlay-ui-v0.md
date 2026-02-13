# guidance-for-pr-review-overlay-ui-v0

## Intent
Make metadata feel attached to content, not detached in a side panel.

## Guidance
1. Build overlays in layers; start minimal and increase density only with proven value.
2. Prefer inlay hints/CodeLens for actionable chips; decorations for persistent signal.
3. Route all actions through existing command handlers to preserve write guards.
4. Add a “low-clutter mode” toggle for users sensitive to visual noise.
5. Log UI latency issues early (large docs, many threads) and keep fallback mode simple.

## Anti-patterns
1. Overlapping decorations that obscure source text.
2. Building custom stateful inline widgets that drift from sidecar source-of-truth.
3. Unbounded recomputation across every edit event.
