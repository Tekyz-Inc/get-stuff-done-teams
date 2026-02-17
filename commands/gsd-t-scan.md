# GSD-T: Scan — Deep Codebase Analysis and Tech Debt Discovery

You are the lead agent performing a comprehensive analysis of an existing codebase. Your job is to understand the architecture, identify business rules, surface vulnerabilities, find inefficiencies, and produce an actionable tech debt register.

## Step 1: Load Existing Context

Read:
1. `CLAUDE.md` (if exists)
2. `.gsd-t/progress.md` (if exists)
3. `.gsd-t/contracts/` (if exists) — compare contracts to reality
4. `.gsd-t/techdebt.md` (if exists) — append, don't overwrite
5. `docs/` — any existing documentation

## Step 2: Full Codebase Scan

**Always use Team Mode** unless the codebase is trivially small (< 5 files) or agent teams are explicitly disabled. Each dimension is fully independent — parallel scanning is faster and produces better results.

```
Create an agent team to scan this codebase:

ALL TEAMMATES read first:
- CLAUDE.md (if exists)
- .gsd-t/contracts/ (if exists)

- Teammate "architecture": Analyze project structure, tech stack,
  data flow, patterns. Write findings to .gsd-t/scan/architecture.md
- Teammate "business-rules": Extract all embedded business logic,
  validation, auth rules, workflows. Write to .gsd-t/scan/business-rules.md
- Teammate "security": Full security audit — auth, injection, exposure,
  dependencies. Write to .gsd-t/scan/security.md
- Teammate "quality": Dead code, duplication, complexity, test gaps,
  performance, stale deps. Write to .gsd-t/scan/quality.md
- Teammate "contracts": Compare .gsd-t/contracts/ to actual implementation,
  find drift and undocumented interfaces. Write to .gsd-t/scan/contract-drift.md
  (skip if no contracts exist)

Each teammate: write your findings to your assigned file.
Lead: synthesize all findings into .gsd-t/techdebt.md when complete.
```

### Solo Mode (fallback — only if < 5 files or teams disabled)
Work through each dimension sequentially:

Systematically analyze the entire codebase across these dimensions:

### A) Architecture Analysis
Scan and document:
- **Project structure**: Directory organization, module boundaries
- **Tech stack**: Languages, frameworks, versions (check package.json, requirements.txt, go.mod, etc.)
- **Architecture pattern**: Monolith, microservices, serverless, hybrid
- **Data flow**: How data moves through the system (request → handler → service → data layer → response)
- **State management**: Where state lives (DB, cache, session, client)
- **Configuration**: How env vars, secrets, and config are managed

Produce: `.gsd-t/scan/architecture.md`

```markdown
# Architecture Analysis — {date}

## Stack
- Language: {lang} {version}
- Framework: {framework} {version}
- Database: {db} {version}
- Cache: {if any}
- Deployment: {platform/method}

## Structure
{directory tree with annotations}

## Data Flow
{description of primary request/response paths}

## Patterns Observed
- {pattern}: used in {where}, {assessment}
- {pattern}: used in {where}, {assessment}

## Architecture Concerns
- {concern with explanation}
```

### B) Business Rules Extraction
Find and document embedded business logic:
- **Validation rules**: Input constraints, field requirements
- **Authorization rules**: Who can do what, role-based access
- **Workflow rules**: State machines, approval flows, conditional logic
- **Calculation rules**: Pricing, scoring, rate limiting, quotas
- **Integration rules**: Retry policies, fallback behavior, timeout handling

Produce: `.gsd-t/scan/business-rules.md`

```markdown
# Business Rules — {date}

## Authentication & Authorization
- {rule}: {where implemented} — {assessment}

## Data Validation
- {rule}: {where implemented} — {assessment}

## Business Logic
- {rule}: {where implemented} — {assessment}

## Undocumented Rules (logic with no comments or docs)
- {file}:{line} — {what it does} — {risk if changed unknowingly}
```

### C) Security Audit
Check for:
- **Auth vulnerabilities**: Token handling, session management, password storage
- **Input validation**: SQL injection, XSS, path traversal, command injection
- **Data exposure**: Sensitive data in logs, API responses, error messages
- **Dependency vulnerabilities**: Run `npm audit`, `pip audit`, or equivalent
- **Secret management**: Hardcoded credentials, exposed API keys, .env in repo
- **CORS/CSP**: Cross-origin policies, content security headers
- **Rate limiting**: API abuse protection
- **File upload**: Unrestricted types, size limits, storage location

Produce: `.gsd-t/scan/security.md`

```markdown
# Security Audit — {date}

## Critical (fix immediately)
- [{severity}] {finding} — {file}:{line} — {remediation}

## High (fix soon)
- [{severity}] {finding} — {file}:{line} — {remediation}

## Medium (plan to fix)
- [{severity}] {finding} — {file}:{line} — {remediation}

## Low (nice to have)
- [{severity}] {finding} — {file}:{line} — {remediation}

## Dependency Audit
{output of npm audit / pip audit / etc.}
```

### D) Code Quality & Inefficiency Analysis
Check for:
- **Dead code**: Unused functions, unreachable branches, commented-out blocks
- **Duplication**: Copy-pasted logic that should be abstracted
- **Complexity**: Functions with high cyclomatic complexity, deep nesting
- **Error handling**: Missing try/catch, swallowed errors, inconsistent patterns
- **Performance**: N+1 queries, missing indexes, unnecessary re-renders, large bundles
- **Naming**: Inconsistent conventions, misleading names
- **TODOs/FIXMEs**: Grep for unresolved developer notes
- **Test gaps**: Critical paths without test coverage
- **Stale dependencies**: Outdated packages with available updates

Produce: `.gsd-t/scan/quality.md`

```markdown
# Code Quality Analysis — {date}

## Dead Code
- {file}: {description}

## Duplication
- {file-a} ↔ {file-b}: {description of duplicated logic}

## Complexity Hotspots
- {file}:{function} — complexity: {score/assessment} — {suggestion}

## Error Handling Gaps
- {file}: {description}

## Performance Issues
- {description} — impact: {high/medium/low} — {fix}

## Unresolved Developer Notes
- {file}:{line}: {TODO/FIXME text}

## Test Coverage Gaps
- {critical path}: {not tested / partially tested}

## Stale Dependencies
- {package}: current {version}, latest {version} — {breaking changes?}
```

### E) Contract Reality Check (if contracts exist)
Compare existing `.gsd-t/contracts/` to the actual implementation:
- Do API endpoints match the api-contract?
- Does the schema match the schema-contract?
- Are there undocumented endpoints or tables?
- Have contracts drifted from reality?

Produce: `.gsd-t/scan/contract-drift.md`

```markdown
# Contract Drift Analysis — {date}

## API Contract vs Reality
- {endpoint}: {matches | drifted | undocumented}
  - Contract says: {X}
  - Reality: {Y}

## Schema Contract vs Reality
- {table}: {matches | drifted | undocumented}

## Undocumented (exists in code, no contract)
- {endpoint/table/component}: {description}
```

## Step 3: Build Tech Debt Register

Synthesize ALL findings into `.gsd-t/techdebt.md`:

```markdown
# Tech Debt Register — {date}

## Summary
- Critical items: {N}
- High priority: {N}
- Medium priority: {N}
- Low priority: {N}
- Total estimated effort: {rough assessment}

---

## Critical Priority
Items that pose active risk or block progress.

### TD-001: {title}
- **Category**: {security | performance | architecture | quality | dependency}
- **Severity**: CRITICAL
- **Location**: {file(s)}
- **Description**: {what's wrong}
- **Impact**: {what happens if not fixed}
- **Remediation**: {how to fix}
- **Effort**: {small | medium | large}
- **Milestone candidate**: YES — recommended as standalone milestone
- **Promoted**: [ ] — (check when added to roadmap)

### TD-002: {title}
...

---

## High Priority
Items that should be addressed in the next 1-2 milestones.

### TD-010: {title}
- **Category**: {category}
- **Severity**: HIGH
- **Location**: {file(s)}
- **Description**: {what's wrong}
- **Impact**: {what happens if not fixed}
- **Remediation**: {how to fix}
- **Effort**: {small | medium | large}
- **Milestone candidate**: {YES | NO — fold into existing milestone}
- **Promoted**: [ ]

---

## Medium Priority
Items to plan for but not urgent.

### TD-020: {title}
...

---

## Low Priority
Nice-to-haves and cleanup.

### TD-030: {title}
...

---

## Dependency Updates
| Package | Current | Latest | Breaking? | Priority |
|---------|---------|--------|-----------|----------|
| {name} | {ver} | {ver} | {yes/no} | {priority} |

---

## Scan Metadata
- Scan date: {date}
- Files analyzed: {count}
- Lines of code: {approximate}
- Languages: {list}
- Last scan: {previous date or "first scan"}
```

## Step 4: Suggest Milestone Promotions

Review all items marked `Milestone candidate: YES` and group them into logical milestones:

```markdown
## Suggested Tech Debt Milestones

### Suggested: Security Hardening (Critical)
Combines: TD-001, TD-003, TD-005
Estimated effort: {assessment}
Should be prioritized: BEFORE next feature milestone

### Suggested: Performance Optimization (High)
Combines: TD-010, TD-012, TD-015
Estimated effort: {assessment}
Can be scheduled: AFTER current feature work

### Suggested: Dependency Update Sprint (Medium)
Combines: TD-020, dependency table items with breaking=yes
Estimated effort: {assessment}
Can be scheduled: During next maintenance window
```

## Step 5: Update Living Documents

The scan produces deep analysis in `.gsd-t/scan/`. Now cross-populate findings into the living docs so knowledge persists across milestones.

### docs/architecture.md
Using findings from `.gsd-t/scan/architecture.md`, update or create `docs/architecture.md`:
- System overview (stack, structure, patterns)
- Component descriptions with locations and dependencies
- Data flow (request → handler → service → data layer → response)
- Data models from schema files or ORM definitions
- API structure from route definitions
- External integrations
- Design decisions found in code comments or configs

If the file exists, merge new findings — don't overwrite existing content.

### docs/workflows.md
Using findings from `.gsd-t/scan/business-rules.md`, update or create `docs/workflows.md`:
- User workflows traced from routes/handlers (registration, login, core features)
- Technical workflows from cron jobs, queue workers, scheduled tasks
- API workflows for multi-step operations
- Integration workflows for external system syncing
- State machines and approval flows discovered in code

### docs/infrastructure.md
Scan the codebase for operational knowledge and update or create `docs/infrastructure.md`:
- **Quick Reference commands** from package.json scripts, Makefile, README, CI/CD configs
- **Local development setup** from README, docker-compose, .env.example
- **Database commands** from migrations, seeds, ORM config, backup scripts
- **Cloud provisioning** from Terraform, CloudFormation, Pulumi, or deployment scripts
- **Credentials and secrets** from .env.example (names only, not values) and secret manager configs
- **Deployment** from CI/CD configs, Dockerfiles, cloud platform configs
- **Logging and monitoring** from any logging setup or dashboard configs

This is critical — infrastructure knowledge is the most commonly lost between sessions.

### docs/requirements.md
Using all scan findings, update or create `docs/requirements.md`:
- Functional requirements discovered from routes, handlers, UI components
- Technical requirements from configs, package.json, runtime settings
- Non-functional requirements from performance configs, rate limits, caching

### README.md
Update or create `README.md` with scan findings:
- Project name and description
- Tech stack and versions discovered
- Getting started / setup instructions (from infrastructure findings)
- Brief architecture overview
- Link to `docs/` for detailed documentation

If `README.md` exists, merge — update tech stack and setup sections but preserve the user's existing structure and custom content.

### For all docs:
- If the file exists and has real content, **merge** — don't overwrite
- If the file exists with only placeholder text, **replace** with real findings
- If the file doesn't exist, **create** it
- Replace `{Project Name}` and `{Date}` tokens with actual values

## Step 5.5: Test Verification

After updating living documents, verify nothing was broken:

1. **Run existing tests**: Execute the full test suite to establish a baseline — document what passes and what was already failing
2. **Verify passing**: If any tests fail that were passing before the scan began, investigate and fix
3. **Log test baseline**: Record the current test state in `.gsd-t/scan/test-baseline.md` — this gives future milestones a starting point

## Step 6: Update Project State

If `.gsd-t/progress.md` exists:
- Log scan in Decision Log
- Note critical findings

If `.gsd-t/roadmap.md` exists:
- Do NOT auto-add milestones — present suggestions to user
- User decides which to promote with `/user:gsd-t-promote-debt`

If `CLAUDE.md` exists:
- Suggest updates for any patterns or conventions discovered during scan

## Step 7: Report to User

Present a summary:
1. Architecture overview (brief)
2. Business rules found (count + any undocumented ones)
3. Security findings by severity
4. Top 5 quality issues
5. Contract drift (if applicable)
6. Tech debt summary with milestone suggestions
7. Recommended immediate actions

All detailed findings are in `.gsd-t/scan/` for review.

Ask: "Want to promote any tech debt items to milestones? Or address the critical items first?"

$ARGUMENTS
