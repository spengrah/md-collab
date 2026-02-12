# spec-for-threaded-panel-v0

Status: draft v0.1  
Scope: conversation-style panel rendering

## 1. Goal
Render full thread conversations (messages) in panel, not just summary rows.

## 2. Normative requirements
1. Panel must show per-thread message list in chronological order.
2. Each message row shows author label and timestamp.
3. Panel supports inline reply action from selected thread.
4. Thread status (`open` / `resolved`) is visible in panel.

## 3. State behavior
1. Panel refreshes when in-memory sidecar state changes.
2. Expanded/collapsed UI state is ephemeral (not persisted).

## 4. Acceptance criteria
1. User can inspect full thread conversation without opening JSON sidecar.
2. New reply appears in panel immediately after write.
3. Open/resolved grouping remains intact with threaded rendering.
