# spec-for-author-identity-v0

Status: v0.1 draft

## 1. Scope
Defines v0.1 runtime author payload requirements for backend mutation operations.

v0.1 explicitly narrows scope to payload validation. Extension identity resolution-order behavior (settings/repo/git fallback) is deferred to a later milestone.

## 1.1 Requirement IDs covered
- MDC-BE-014

## 2. Author fields (normative)
Required per thread and message author object:
1. `author_id` (stable string key)
2. `author_label` (human-readable display name)
3. `verified` (`true | false | null`)

## 3. Runtime validation rules (normative for v0.1)
1. Every mutation operation must receive a valid author payload.
2. Required fields:
   - `author_id` non-empty string
   - `author_label` non-empty string
   - `verified` in `true|false|null`
3. Missing/invalid payload must fail with `AUTHOR_INVALID`.

## 4. Mutation operations covered
- `createThread`
- `reply`
- `editMessage` (via `editor`)
- `resolveThread` (via `actor`)
- `reopenThread` (via `actor`)

## 5. Deferred (post-v0.1)
1. Extension resolution order (`settings -> repo config -> git fallback`).
2. Trusted mapping evaluation semantics for assigning `verified=true/false`.

## 6. Acceptance criteria
1. Backend rejects missing/invalid author payload on all mutation ops.
2. Backend tests explicitly cover rejection paths for each mutation op.
3. Valid payloads pass and preserve author fields in output structures.
