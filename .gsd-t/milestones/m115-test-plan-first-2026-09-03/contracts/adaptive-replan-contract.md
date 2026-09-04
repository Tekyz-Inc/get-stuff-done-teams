# Contract: Adaptive Replanning

## Version: 1.0.0
## Status: DRAFT
## Owner: adaptive-replan domain
## Consumers: execute, wave commands

---

## Purpose

Defines the protocol for post-domain constraint checking and plan revision during execute. When a domain's execution reveals new constraints, remaining domains' plans are revised before dispatch.

## Replan Check Flow

```
After each domain completes:
1. Read domain's completion summary (from fresh-dispatch-contract summary format)
2. Extract "Constraints discovered" section
3. If constraints exist:
   a. Read remaining domains' tasks.md files
   b. Check each remaining task against new constraints
   c. If any task depends on an invalidated assumption → revise
4. Write revised tasks.md to disk
5. Log replan decision to progress.md Decision Log
6. Increment replan cycle counter
7. If counter > 2 → STOP, pause for user input
```

## Constraint Categories

| Category | Example | Impact |
|----------|---------|--------|
| API change | "Stripe Charges API deprecated → use PaymentIntents" | Remaining domains using old API must be revised |
| Schema mismatch | "Column is organization_id, not org_id" | Remaining domains referencing wrong name must be revised |
| Dependency unavailable | "Socket.io incompatible with HTTP/2 → using ws" | Remaining domains importing wrong library must be revised |
| Rate limit | "SendGrid: 100 emails/sec max" | Remaining domains assuming unlimited throughput must add queuing |
| Missing prerequisite | "Auth middleware doesn't support bearer tokens" | Remaining domains assuming bearer auth must be revised |

## Plan Revision Format

When revising a domain's tasks.md, the revision is appended as a note:

```markdown
## Revision (Replan Cycle {N})
- **Trigger**: {which domain's constraint}
- **Constraint**: {what was discovered}
- **Changes**: {what was revised in this domain's tasks}
- **Rationale**: {why this revision is needed}
```

## Rules

1. Replan check runs ONLY between domain completions (not between tasks within a domain)
2. Maximum 2 replan cycles per execute run — after that, pause for user
3. Orchestrator reads summaries only (~500 tokens each) — never full domain context
4. Plan revisions are written to disk — next domain reads revised tasks.md in fresh context
5. All replan decisions logged in progress.md Decision Log
6. If no constraints discovered, skip replan check (fast path)
7. Graph used to assess which remaining domains are affected by new constraints

## Breaking Changes

Changes to the replan cycle limit or constraint categories are breaking. Bump version.
