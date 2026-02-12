# guidance-for-threaded-panel-v0

## Intent
Make comment review feel like document conversation, not metadata inspection.

## Guidance
1. Keep message rows compact and scannable (author, time, body preview/full text toggle if needed).
2. Prefer explicit thread action affordances (reply, resolve/reopen, jump-to-text).
3. Ensure message ordering is deterministic and timestamp-based.
4. Avoid expensive recompute for every tree render; memoize mapped view model.

## Anti-patterns
1. Hiding message content behind multiple clicks.
2. Rendering only newest message and forcing JSON inspection for context.
