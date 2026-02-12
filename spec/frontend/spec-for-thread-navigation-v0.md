# spec-for-thread-navigation-v0

Status: draft v0.1  
Scope: panel-to-document navigation

## 1. Goal
Allow user to click a thread in panel and jump cursor/reveal to anchored text.

## 2. Normative requirements
1. Clicking thread item in panel must reveal the related markdown document and anchor range.
2. If the document is closed, extension must open it before revealing range.
3. If anchor confidence is `broken`, jump to best known prior location (if available) and show warning.
4. If no usable location exists, show explicit message and keep panel selection.

## 3. Selection behavior
1. Set cursor to anchor start and reveal range in viewport.
2. Apply transient highlight to referenced range for discoverability.

## 4. Acceptance criteria
1. Panel click reliably navigates to target text for high/medium/low anchors.
2. Broken anchors provide clear fallback behavior and warning.
