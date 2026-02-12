# spec-for-comments-sidecar

Status: v0.1 draft (backend-first)  
Project: md-collab  
Date: 2026-02-12

## 1. Scope
Defines the canonical sidecar format (`*.comments.json`) for storing comment threads associated with a single Markdown file.

## 1.1 Requirement IDs covered
- MDC-BE-001
- MDC-BE-002
- MDC-BE-003
- MDC-BE-004
- MDC-BE-005
- MDC-BE-006
- MDC-BE-013

## 2. Invariants
1. One sidecar maps to one markdown doc.
2. Sidecar writes must be deterministic and atomic.
3. IDs are stable, unique, and never reused.
4. Sidecar operations must not mutate `doc.md`.

## 3. File pairing
- Doc: `path/to/doc.md`
- Sidecar: `path/to/doc.comments.json`

## 4. Schema (normative)
```json
{
  "schema_version": "0.1.0",
  "document": {
    "path": "doc.md"
  },
  "threads": [
    {
      "thread_id": "uuid",
      "status": "open",
      "anchor": {
        "primary": {
          "start": { "line": 1, "column": 1, "offset_utf16": 0 },
          "end": { "line": 1, "column": 4, "offset_utf16": 3 },
          "doc_revision": "optional"
        },
        "fallback": {
          "quote": "text",
          "prefix": "context before",
          "suffix": "context after",
          "quote_hash": "sha256:...",
          "context_hash": "sha256:..."
        },
        "anchor_confidence": "high"
      },
      "author": {
        "author_id": "spencer",
        "author_label": "Spencer",
        "verified": null
      },
      "messages": [
        {
          "message_id": "uuid",
          "author": { "author_id": "spencer", "author_label": "Spencer", "verified": null },
          "body": "Comment text",
          "created_at": "2026-02-12T18:00:00Z",
          "edited_at": null
        }
      ],
      "created_at": "2026-02-12T18:00:00Z",
      "updated_at": "2026-02-12T18:00:00Z"
    }
  ]
}
```

## 5. Allowed enums
- `status`: `open | resolved`
- `anchor_confidence`: `high | medium | low | broken`

## 5.1 Author identity contract
Author field semantics are defined in:
- `spec-for-author-identity-v0.md`

## 6. Core operations (normative)
1. `create_thread(range, initial_message, author)`
2. `reply(thread_id, message, author)`
3. `edit_message(thread_id, message_id, new_body, editor)`
4. `resolve_thread(thread_id, actor)`
5. `reopen_thread(thread_id, actor)`
6. `reanchor_thread(thread_id, updated_anchor, confidence, reason)`

## 7. Operation constraints
1. `create_thread` must create both thread and first message.
2. `reply` appends one new message object.
3. `edit_message` updates `edited_at`; preserve `message_id`.
4. resolve/reopen toggles only `status` + `updated_at`.
5. `reanchor_thread` must update anchor and preserve prior values in runtime logs (or `anchor_history` if enabled later).

## 8. Deterministic serialization rules
1. UTF-8, newline `\n`.
2. Stable key ordering.
3. ISO-8601 UTC timestamps.
4. Preserve unknown fields.

### 8.1 Unknown-field compatibility policy (v0.1)
1. Unknown fields are schema-valid for forward compatibility.
2. Parser + serializer must round-trip unknown fields without dropping them.
3. Core operations should avoid destructive structural rewrites so unknown fields survive updates.

## 9. Error classes
- `SCHEMA_INVALID`
- `THREAD_NOT_FOUND`
- `MESSAGE_NOT_FOUND`
- `WRITE_CONFLICT`
- `ANCHOR_INVALID`

## 10. Versioning
- `schema_version` is required.
- Minor additions must be backward compatible.
- Breaking changes require migration doc and bumped major/minor accordingly.

## 11. Acceptance criteria
1. Extension and agent can round-trip parse/write without data loss.
2. Repeated no-op writes produce byte-stable output.
3. Core operations are reproducible from fixtures.
4. Concurrent write collision path is documented as a known v0.1 limitation.
