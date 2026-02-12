# spec-for-author-identity-v0

Status: v0.1 draft

## 1. Scope
Defines how `author_id`, `author_label`, and `verified` are produced in MVP.

## 1.1 Requirement IDs covered
- MDC-BE-014

## 2. Author fields (normative)
Required per thread and message author object:
1. `author_id` (stable string key)
2. `author_label` (human-readable display name)
3. `verified` (`true | false | null`)

## 3. Resolution order (extension)
1. Explicit VS Code setting: `mdCollab.authorId` and `mdCollab.authorLabel`.
2. Repo config file (if present): `.md-collab-authors.json`.
3. Git config fallback (`user.name`, `user.email`) transformed to `author_id`.

If no source resolves, extension must refuse write and prompt for explicit author configuration.

## 4. Resolution rules (agent)
1. Agent must set `author_id` and `author_label` explicitly in operation context.
2. Agent may set `verified=null` by default in v0.1.

## 5. `verified` semantics (v0.1)
- `true`: value matched a trusted mapping in repo config.
- `false`: value mismatched configured trusted mapping.
- `null`: no trust decision available.

## 6. Acceptance criteria
1. Extension always emits deterministic author payload from same config state.
2. Agent-generated comments include explicit author fields.
3. `verified` meaning is consistently interpreted across UI and backend.
