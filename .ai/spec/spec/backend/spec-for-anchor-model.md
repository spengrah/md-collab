# spec-for-anchor-model

Status: v0.1 draft  
Project: md-collab

## 1. Scope
Defines anchor payload fields stored per thread.

## 1.1 Requirement IDs covered
- MDC-BE-007

## 2. Anchor structure (normative)
- `primary`: positional coordinates
- `fallback`: quote/context/hashes
- `anchor_confidence`: state label

## 3. Primary positional anchor
Required fields:
1. `start.line` (1-indexed)
2. `start.column` (1-indexed)
3. `start.offset_utf16` (0-indexed)
4. `end.line` (1-indexed)
5. `end.column` (1-indexed)
6. `end.offset_utf16` (0-indexed)

## 3.1 Coordinate conventions (normative)
1. Sidecar wire format uses 1-indexed `line`/`column`.
2. VS Code APIs are 0-indexed; conversion (`+1` on write, `-1` on read) must occur at the extension boundary.
3. `offset_utf16` is code-unit based and remains 0-indexed.

Optional:
- `doc_revision`

## 4. Fallback content anchor
Required fields:
1. `quote`
2. `prefix`
3. `suffix`
4. `quote_hash`
5. `context_hash`

Normalization for hashes:
- lowercase
- collapse whitespace runs to single space
- trim leading/trailing whitespace

## 5. Parameter defaults
1. Prefix length `N=80`
2. Suffix length `N=80`
3. Maximum quote length stored untruncated unless implementation cap is documented.

## 6. Confidence semantics
- `high`: exact content + consistent location
- `medium`: exact content, weaker location agreement
- `low`: fuzzy recovery, human review suggested
- `broken`: no safe match

## 7. Anchor validity checks
1. Range must satisfy start <= end.
2. Offsets must map to text bounds.
3. Quote must be non-empty.
4. Hashes must match normalized fields on creation.

## 8. Acceptance criteria
1. Same selected text yields same hash values across extension/agent implementations.
2. Invalid anchor payloads are rejected with `ANCHOR_INVALID`.
