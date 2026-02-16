# CLI Requirements Index (v0.1)

Purpose: stable requirement IDs for agent-safe CLI command contracts and safety gates.

## Requirement IDs

- **MDC-CLI-001**: All sidecar mutations route through validated operation functions (no raw JSON edits).
- **MDC-CLI-002**: CLI validates sidecar schema pre- and post-mutation.
- **MDC-CLI-003**: CLI enforces optimistic revision token conflict checks via `--expect-rev`.
- **MDC-CLI-004**: CLI uses deterministic serialization + atomic writes for all sidecar mutations.
- **MDC-CLI-005**: `suggestion apply` executes preflight checks: thread/suggestion existence, `before_text_hash` match, anchor applicability.
- **MDC-CLI-006**: `suggestion apply` refuses to proceed on hash/anchor mismatch unless explicit override (P2).
- **MDC-CLI-007**: All mutating commands emit audit trail output (op id, actor, timestamp, rev before/after, outcome).
- **MDC-CLI-008**: CLI returns stable JSON envelope (`ok`, `command`, `code`, `data`, `audit`) for all commands.
- **MDC-CLI-009**: CLI uses stable exit codes: 0=success, 2=validation, 3=not found, 4=conflict, 5=preflight blocked, 10=internal.
- **MDC-CLI-010**: `--dry-run` executes full mutation pipeline but never writes; emits predicted `rev_after` and diff summary.
- **MDC-CLI-011**: Thread resolve/reopen/suggestion reject are idempotent (no-op success with `changed=false` on repeat).

## Mapping

| Req ID | Primary spec | Verification mode |
|---|---|---|
| MDC-CLI-001 | `spec-for-agent-safe-sidecar-cli.md` | integration tests verifying no raw file mutation bypass |
| MDC-CLI-002 | `spec-for-agent-safe-sidecar-cli.md` | schema validation error path tests |
| MDC-CLI-003 | `spec-for-agent-safe-sidecar-cli.md` | revision token conflict scenario tests |
| MDC-CLI-004 | `spec-for-agent-safe-sidecar-cli.md` | deterministic write + atomic write tests |
| MDC-CLI-005,006 | `spec-for-agent-safe-sidecar-cli.md` | suggestion apply preflight scenario tests |
| MDC-CLI-007 | `spec-for-agent-safe-sidecar-cli.md` | audit output format + completeness checks |
| MDC-CLI-008 | `spec-for-agent-safe-sidecar-cli.md` | JSON envelope shape tests across all commands |
| MDC-CLI-009 | `spec-for-agent-safe-sidecar-cli.md` | exit code determinism tests |
| MDC-CLI-010 | `spec-for-agent-safe-sidecar-cli.md` | dry-run no-write + output prediction tests |
| MDC-CLI-011 | `spec-for-agent-safe-sidecar-cli.md` | idempotency repeat-operation tests |
