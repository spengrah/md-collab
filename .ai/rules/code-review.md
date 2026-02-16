# Code Review Standards

**Philosophy:** "If an AI coding agent can fix it, request changes."

Since implementation cost is low with modern coding agents, maintain a HIGH bar for approval. Request changes for anything that could be improved.

---

## Approval Criteria (ALL must be true)

AUTO-APPROVE only if the code meets ALL of these criteria:

- **No security concerns** (injection, XSS, auth issues, secrets in code, etc.)
- **No bugs or unhandled edge cases**
- **Comprehensive test coverage** for new/changed code
- **Clear, well-documented code** (comments where needed)
- **Follows repository conventions** (check `.ai/rules/core.md`)
- **Proper error handling and validation**
- **Good performance** (no obvious inefficiencies)
- **No TODOs or technical debt introduced**
- **No code style inconsistencies**

---

## Request Changes (DEFAULT)

REQUEST CHANGES if ANY of these apply:

**Security:**
- Security concerns (even potential or minor ones)
- Secrets or sensitive data in code
- Missing authentication or authorization checks
- Vulnerable dependencies

**Code Quality:**
- Bugs, race conditions, or edge cases not handled
- Unclear code needing comments or documentation
- Opportunities for refactoring or simplification
- Code style inconsistencies
- Doesn't follow repository best practices

**Testing:**
- Missing or insufficient test coverage
- Tests don't cover edge cases
- No integration tests for cross-component changes
- **Exception:** Integration tests are acceptable in place of unit tests when unit tests would require creating heavy mock infrastructure

**Performance:**
- Performance concerns or inefficiencies

**Architecture:**
- Poor error handling or validation
- Missing logging for critical operations
- Sidecar mutations bypass `src/operations.ts`
- Frontends import from `src/` instead of vendored core

**Completeness:**
- TODOs or unfinished work
- Missing documentation for new features
- Incomplete migrations or rollback paths

---

## Review Process

1. **Read conventions:** Review `.ai/rules/core.md` for project-specific patterns
2. **Check ALL criteria:** Go through each approval criterion
3. **Default to request changes:** When in doubt, request improvements
4. **Be specific:** Point to exact files and line numbers
5. **Explain why:** Help developers understand the reasoning

---

## Review Output Format

**All AI reviewers MUST include this at the end of their review:**

```
## Final Recommendation
RESULT=PASS
```

Or if issues are found:

```
## Final Recommendation
RESULT=FAIL
```

**Requirements:**
- The `RESULT=` line must appear exactly as shown (no spaces around `=`)
- Use `PASS` if code meets ALL approval criteria
- Use `FAIL` if ANY issue warrants changes
- This enables automated status check integration

---

## Convention Reference

For detailed development conventions, see:
- **`.ai/rules/`** - Project rules and conventions
- **`.ai/spec/spec/`** - Normative specifications
- **`.ai/spec/guidance/`** - Implementation guidance
