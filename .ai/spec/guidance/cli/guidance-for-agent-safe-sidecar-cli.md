# guidance-for-agent-safe-sidecar-cli

Status: implementation guidance  
Audience: backend/extension/agent integration engineers

## Core guidance
1. Treat sidecar JSON as **internal storage**, not a user-editable API.
2. Route all mutations through one command pipeline:
   - load -> validate -> mutate via core op -> validate -> write atomically -> emit audit.
3. Keep command handlers thin; do not duplicate business rules already in `src/operations.ts`.

## Recommended command pipeline (mutation)
1. Resolve sidecar path from doc when needed.
2. Read sidecar from disk and parse schema.
3. Compute current revision token.
4. If `--expect-rev` provided, compare and fail fast on mismatch.
5. Execute core operation function.
6. Validate resulting sidecar (schema + optional strict invariants).
7. If dry-run: return predicted output and stop.
8. Write using deterministic serializer + atomic write.
9. Re-read and return new revision token.
10. Emit audit event.

## Preflight guidance for `suggestion apply`
- Never apply directly from command args.
- First construct preflight result object:
  - current target text hash
  - expected `before_text_hash`
  - anchor range viability
  - action decision (`apply|obsolete|block`)
- Only proceed when decision is safe.

## Output contract guidance
- Default human output should be concise and grep-friendly.
- `--json` output should be versioned/stable enough for agent parsing.
- Include `code` in both success and error responses.

## Idempotency guidance
- Implement no-op success for state toggles.
- Avoid implicit retries on conflict; return explicit conflict and let caller decide.
- Reserve operation-id dedupe for a later phase.

## Test guidance
Minimum CLI acceptance tests:
1. Invalid JSON sidecar => schema error exit code.
2. Rev mismatch => conflict exit code, no write.
3. Dry-run mutation => no file change + expected JSON output.
4. Suggestion apply hash mismatch => obsolete/preflight-block behavior.
5. Deterministic output => repeated no-op command byte-stable.

## Practical defaults
- `--json` should be enabled by default in non-TTY contexts.
- Audit mode default: stdout (agents can redirect).
- Keep file audit optional for MVP to avoid accidental sensitive disk logs.

## Anti-patterns to avoid
- Parsing and rewriting sidecar with ad-hoc JSON tools.
- Embedding markdown document mutation into sidecar mutation command implicitly.
- Returning untyped/freeform errors that agents cannot classify.
