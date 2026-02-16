# Backend Requirements Index (v0.1)

Purpose: assign stable requirement IDs and map each requirement to a normative spec + verification approach.

## Requirement IDs

- **MDC-BE-001**: Sidecar file maps 1:1 to markdown doc.
- **MDC-BE-002**: Sidecar schema includes versioned top-level contract.
- **MDC-BE-003**: Thread/message IDs are stable and never reused.
- **MDC-BE-004**: Sidecar writes are deterministic (key order, timestamps, UTF-8).
- **MDC-BE-005**: Sidecar writes are atomic.
- **MDC-BE-006**: Comment operations must not mutate canonical `doc.md`.
- **MDC-BE-007**: Thread anchor stores positional + fallback content signals.
- **MDC-BE-008**: Re-anchoring executes deterministic ordered algorithm.
- **MDC-BE-009**: Re-anchoring emits confidence + reason code.
- **MDC-BE-010**: Ambiguous re-anchors prefer `broken` over unsafe auto-attach.
- **MDC-BE-011**: Fixture corpus covers required anchor-drift scenarios.
- **MDC-BE-012**: Backend behavior is test-driven and regression-guarded.
- **MDC-BE-013**: v0.1 known limitation on concurrent logical write conflicts is explicitly documented.
- **MDC-BE-014**: v0.1 enforces runtime author payload validation on all mutation operations (`author_id`, `author_label`, `verified` present/valid). Full identity resolution-order behavior is deferred.
- **MDC-BE-015**: Review-state/version-context fields remain backward compatible and relevance-state transitions stay deterministic.
- **MDC-BE-016**: Sidecar create/rewrite normalizes POSIX permission parity to paired markdown file mode/group on final path.
- **MDC-BE-017**: Group parity alignment of sidecar `gid` with markdown file `gid`.
- **MDC-BE-018**: Owner parity alignment of sidecar `uid` with markdown file owner attempted best-effort when permitted by runtime privileges.
- **MDC-BE-019**: Atomic write parity normalization occurs on final sidecar path after temp-file rename.
- **MDC-BE-020**: Permission normalization must not add permissions not present on source markdown mode bits.
- **MDC-BE-021**: Permission-parity failures logged with operation type and errno; mutation fails only when parity failure implies unusable sidecar access.

## Mapping

| Req ID | Primary spec | Verification mode |
|---|---|---|
| MDC-BE-001..006,013 | `spec-for-comments-sidecar.md` | schema + IO + operation tests + guidance check |
| MDC-BE-007 | `spec-for-anchor-model.md` | anchor payload validation tests |
| MDC-BE-008..010 | `spec-for-reanchoring-engine.md` | deterministic fixture replay |
| MDC-BE-011 | `spec-for-anchor-test-fixtures.md` | fixture completeness checks |
| MDC-BE-012 | `spec-for-backend-implementation-plan-tdd.md` | CI test plan + changelog gate |
| MDC-BE-014 | `spec-for-author-identity.md` | runtime author validation tests across all mutation ops |
| MDC-BE-015 | `spec-for-review-state-and-versioning.md` | version-context field compatibility + relevance-state determinism tests |
| MDC-BE-016..021 | `spec-for-sidecar-permission-parity.md` | permission parity create/rewrite tests + EPERM warning-path tests |
