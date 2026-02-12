# Comments Sidecar Schema (v0 draft)

Project: md-collab  
Date: 2026-02-12  
Status: Draft for review

## Goals
- Keep canonical document as `doc.md`.
- Store all collaboration thread state in `doc.comments.json`.
- Support deterministic agent and extension read/write.
- Remain Git-friendly and portable.

## File pairing
- Document: `path/to/doc.md`
- Sidecar: `path/to/doc.comments.json`

## Top-level shape
```json
{
  "schema_version": "0.1.0",
  "document": {
    "path": "doc.md",
    "fingerprint": "sha256:<optional>"
  },
  "threads": []
}
```

## Thread schema (conceptual)
- `thread_id`: UUID
- `status`: `open | resolved`
- `anchor`:
  - `primary`: `{start,end}` using line/column + offset metadata
  - `fallback`: quote + context windows + hash
  - `anchor_confidence`: `high | medium | low | broken`
- `author`: minimal v0 markers
  - `author_id` (string)
  - `author_label` (string)
  - `verified` (boolean|null)
- `messages[]`:
  - `message_id` UUID
  - `author`
  - `body` (markdown/plain)
  - `created_at`
  - optional `edited_at`
- `created_at`, `updated_at`

## v0 constraints
1. Stable IDs, never reuse.
2. Deterministic key order and timestamp format (ISO-8601).
3. Atomic writes only.
4. No side effects to `doc.md` unless explicitly requested by user action.

## Open items to finalize next
1. Exact coordinate model (UTF-16 vs UTF-8 offsets).
2. Canonical re-anchoring precedence (position vs quote/context).
3. Conflict merge policy by thread/message granularity.
4. Validation schema (JSON Schema) and fixture set.
