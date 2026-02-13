# guidance-for-review-interaction-model

## Intent
Treat overlay UX and suggestion flow as one coherent review interaction surface.

## Guidance
1. Keep all UI actions command-routed (single mutation/write guard path).
2. Introduce overlay layers incrementally to control clutter.
3. Keep suggestion states explicit and append-only in audit history.
4. Prefer safe default on hash mismatch (`obsolete`, no write).
5. Show timeline provenance chips (`local draft|git|hybrid`) consistently.
6. Keep status chips compact but always explainable via tooltip/detail.

## Anti-patterns
1. Duplicate write logic in overlay click handlers.
2. Interactive overlays that obscure source text.
3. Requiring Git-only semantics in local draft workflows.
4. Silent apply/reject outcomes without thread audit message.
