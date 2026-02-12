# guidance-for-author-identity-v0

Status: v0.1 draft

## Intent
Make authorship explicit and predictable without overengineering identity in MVP.

## Guidance
1. Start with explicit extension settings for Spencer/Lyle in local workspace.
2. Add `.md-collab-authors.json` only when multi-person mapping is needed.
3. Prefer `verified=null` over false claims of verification.
4. Keep `author_id` stable over time; changing IDs fragments history.

## Suggested repo config shape
```json
{
  "trustedAuthors": [
    {"author_id": "spencer", "label": "Spencer", "gitEmails": ["spencer@spengrah.xyz"]},
    {"author_id": "lyle", "label": "Lyle", "gitEmails": []}
  ]
}
```

## Anti-patterns
1. Deriving `author_id` from ephemeral session IDs.
2. Auto-setting `verified=true` without trust mapping evidence.
3. Allowing writes with missing author identity.
