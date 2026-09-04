# Contract: Goal-Backward Verification

## Version: 1.0.0
## Status: DRAFT
## Owner: goal-backward domain
## Consumers: verify, complete-milestone, wave commands

---

## Purpose

Defines the interface for post-gate behavior verification — checking that milestone goals are actually achieved, not just structurally present.

## Verification Flow

```
1. All 8 quality gates PASS (existing verify flow)
2. Goal-backward verification begins (this contract)
3. Read milestone goals from progress.md
4. Read requirements from docs/requirements.md
5. For each critical requirement:
   a. Trace requirement → code path → behavior (using graph)
   b. Check for placeholder patterns
   c. Verify end-to-end behavior exists
6. Report findings
```

## Placeholder Patterns (Detection List)

The verifier scans for these patterns in files that claim to implement requirements:

| Pattern | Example | Severity |
|---------|---------|----------|
| console.log placeholder | `console.log("TODO: implement")` | CRITICAL |
| TODO/FIXME in implementation | `// TODO: add real logic` | CRITICAL |
| Hardcoded return | `return "success"` (always same) | HIGH |
| Static UI text | `<span>Synced</span>` (never updates) | HIGH |
| Empty function body | `function handle() {}` | CRITICAL |
| Throw not-implemented | `throw new Error("not implemented")` | CRITICAL |
| Pass-through stub | `return input` (no transformation) | MEDIUM |

## Findings Report Format

```markdown
## Goal-Backward Verification Report

### Status: PASS | FAIL

### Findings
| # | Requirement | File:Line | Pattern | Severity | Description |
|---|-------------|-----------|---------|----------|-------------|
| 1 | {req-id}    | {path}:{line} | {pattern} | {severity} | {what's wrong} |

### Summary
- Requirements checked: {N}
- Findings: {N} ({critical}, {high}, {medium})
- Verdict: {PASS if 0 critical/high, FAIL otherwise}
```

## Rules

1. Goal-backward runs AFTER all structural gates pass — it is additive, not a replacement
2. Only critical requirements are checked (skip trivial/low-priority)
3. CRITICAL and HIGH findings block milestone completion
4. MEDIUM findings are warnings — logged but don't block
5. User can override and force completion with explicit acknowledgment
6. Graph is used to trace requirement → code path — if graph unavailable, fall back to grep

## Breaking Changes

Changes to severity levels or blocking behavior are breaking. Bump version.
