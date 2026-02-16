# guidance-for-thread-navigation-v0

## Intent
Thread list should be actionable, not just informational.

## Guidance
1. Keep panel items carrying enough data to resolve navigation without full recompute.
2. Use VS Code reveal APIs consistently (`showTextDocument` + `revealRange`).
3. Add a short-lived decoration/highlight after jump.
4. For broken anchors, show non-blocking warning and land user near prior known location.

## Anti-patterns
1. Failing silently on navigation errors.
2. Jumping to file top for every broken anchor without explanation.
