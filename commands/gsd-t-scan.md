# GSD-T: Scan — Deep Codebase Analysis and Tech Debt Discovery

You are the lead agent performing a comprehensive analysis of an existing codebase. Your job is to understand the architecture, identify business rules, surface vulnerabilities, find inefficiencies, and produce an actionable tech debt register.

## Argument Parsing

Parse `$ARGUMENTS`. M43 D4 removed the `--watch` opt-out; `--in-session`/`--headless` were never shipped. Under `.gsd-t/contracts/headless-default-contract.md` **v2.0.0** every scan spawn goes headless unconditionally (Step 0 outer subagent, Step 2 dimension agents, Step 3 synthesis agent, Step 5 living-document updater, Step 8 HTML report generator). A legacy `--watch` token is accepted but ignored (stderr deprecation line).

## Spawn Primitive — Always Headless (M43 D4, v2.0.0)

Per `.gsd-t/contracts/headless-default-contract.md` v2.0.0. Spawn classifications used below (both always headless):

- `spawnType: 'primary'` — Step 0 outer fresh-dispatch subagent, Step 2 dimension agents, Step 3 synthesis agent
- `spawnType: 'validation'` — Step 5 living-document updater, Step 8 HTML report generator

Spawn path is `autoSpawnHeadless({command, spawnType, projectDir, sessionContext})`.

## Step 0: Launch via Subagent

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 0 --step-label "Launch via Subagent" 2>/dev/null || true
```

Scans are long-running and context-heavy. Always execute via a Task subagent for a fresh context window.

**If you are the orchestrating agent** (you received the slash command directly):
Spawn a fresh subagent using the Task tool — `spawnType: 'primary'` (always headless per headless-default-contract v2.0.0):
```
subagent_type: general-purpose
spawnType: primary
prompt: "You are running gsd-t-scan. Working directory: {current project root}
Read CLAUDE.md and .gsd-t/progress.md for project context, then execute gsd-t-scan starting at Step 1.
IMPORTANT: Step 2 requires team mode — spawn 5 teammates (architecture, business-rules, security, quality, contracts)
running in parallel. Do not skip team mode or run dimensions sequentially."
```
Wait for the subagent to complete. Relay its summary to the user. **Do not execute Steps 1+ yourself.**

**If you are the spawned subagent** (your prompt says "starting at Step 1"):
Continue to Step 1 below. At Step 2, use team mode — spawn the 5 teammates in parallel.

## Step 1: Load Existing Context

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 1 --step-label "Load Existing Context" 2>/dev/null || true
```

Read:
1. `CLAUDE.md` (if exists)
2. `.gsd-t/progress.md` (if exists)
3. `.gsd-t/contracts/` (if exists) — compare contracts to reality
4. `.gsd-t/techdebt.md` (if exists) — archive before replacing (see Step 2.9)
5. `docs/` — any existing documentation

## Step 1.5: Graph Index (if available)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 1 --step-label ".5: Graph Index (if available)" 2>/dev/null || true
```

Before scanning, check if `bin/graph-indexer.js` exists in the GSD-T installation or if `.gsd-t/graph/meta.json` exists in the project. If so:

```bash
# Run or refresh the graph index
node -e "const g = require('{gsd-t-path}/bin/graph-indexer'); console.log(JSON.stringify(g.indexProject('{project-root}')))"
```

If the graph is available, the scan teammates can use these queries for deeper analysis:
- `query('findDeadCode', {})` → unused functions the quality team should flag
- `query('findDuplicates', { threshold: 0.8 })` → semantic duplication (name-based or AST via CGC)
- `query('findCircularDeps', {})` → circular import cycles
- `query('getDomainBoundaryViolations', {})` → cross-domain access violations
- `query('getEntitiesByDomain', { domain })` → entities per domain for architecture analysis

Pass the graph query results to each teammate in their prompt context so they can reference concrete entity data instead of relying solely on grep patterns.

## Step 2: Full Codebase Scan

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 2 --step-label "Full Codebase Scan" 2>/dev/null || true
```

**Always use Team Mode** unless the codebase is trivially small (< 5 files) or agent teams are explicitly disabled. Each dimension is fully independent — parallel scanning is faster and produces better results.

```
Create an agent team to scan this codebase:

ALL TEAMMATES read first:
- CLAUDE.md (if exists)
- .gsd-t/contracts/ (if exists)
- .gsd-t/graph/index.json (if exists) — entity registry for graph-enhanced analysis

- Teammate "architecture" (model: haiku): Analyze project structure, tech stack,
  data flow, patterns. If graph available, use entity counts per file and import
  edges to map component relationships. Write findings to .gsd-t/scan/architecture.md
- Teammate "business-rules" (model: haiku): Extract all embedded business logic,
  validation, auth rules, workflows. Write to .gsd-t/scan/business-rules.md
- Teammate "security" (model: sonnet): Full security audit — auth, injection, exposure,
  dependencies. Write to .gsd-t/scan/security.md
- Teammate "quality" (model: sonnet): Dead code, duplication, complexity, test gaps,
  performance, stale deps. If graph available, use findDeadCode and findDuplicates
  results for precise dead code and duplication detection instead of grep heuristics.
  Also: identify reusability candidates — functions or modules that appear in multiple
  places doing similar work, and consumer surfaces (web/mobile/CLI/etc.) that call the
  same backend operations independently. Write to .gsd-t/scan/quality.md
- Teammate "contracts" (model: haiku): Compare .gsd-t/contracts/ to actual implementation,
  find drift and undocumented interfaces. If graph available, use contract mappings
  to verify every contract has implementing code. Write to .gsd-t/scan/contract-drift.md
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
- **Reusability / Shared Service Candidates**: Functions implementing the same operation in multiple modules; consumer surfaces (web, mobile, CLI) calling the same backend logic through separate implementations instead of a shared layer
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

## Reusability Analysis

### Consumer Surfaces Detected
| Surface | Type | Operations Used |
|---------|------|----------------|
| {module/app} | {web/mobile/cli/other} | {list of backend operations it calls} |

### Shared Service Candidates
Operations implemented independently in 2+ places — candidates for extraction to a shared module:

| Operation | Found In | Recommendation |
|-----------|----------|----------------|
| {operation} | {file-a}, {file-b} | Extract to shared-core |
| {operation} | {file-a}, {file-b}, {file-c} | Extract to shared-core (high priority — 3 copies) |

If none found: `✅ No shared service candidates detected.`

> **Note**: These candidates should seed Step 1.6 (Consumer Surface Identification) the next
> time `/gsd-t-partition` is run. Copy the "Consumer Surfaces Detected" table into
> partition's Step 1.6.1 to skip re-research.

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

## Step 2.5: Schema Extraction

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 2 --step-label ".5: Schema Extraction" 2>/dev/null || true
```

Run schema extraction on the scanned project to detect ORM/database schema files and parse entity definitions. This data feeds the database schema diagram in Step 3.5.

Using Bash tool:
```
node -e "const {extractSchema}=require('./bin/scan-schema.js'); const r=extractSchema(process.argv[1]); process.stdout.write(JSON.stringify(r))" "$SCANNED_PROJECT_ROOT"
```

Capture output as `schemaData`. Log:
- Detected ORM type: `schemaData.ormType`
- Entity count: `schemaData.entities.length`

If `schemaData.detected === false`, note: "No ORM/schema files detected — database diagram will use placeholder."

## Step 2.9: Archive Previous Tech Debt Register

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 2 --step-label ".9: Archive Previous Tech Debt Register" 2>/dev/null || true
```

Before building the new register, archive the existing one so the file stays small. Each scan is a complete snapshot — the archive preserves history.

If `.gsd-t/techdebt.md` exists:
1. Determine the archive date from the file's header (e.g., "Updated 2026-03-19" → `2026-03-19`). If no date found, use today's date.
2. Rename it to `.gsd-t/techdebt_YYYY-MM-DD.md` (using the extracted date)
3. If a file with that name already exists (same-day rescan), append a counter: `techdebt_YYYY-MM-DD_2.md`

The new `techdebt.md` created in Step 3 will contain only the current scan's findings. Between scans, mark items as `[RESOLVED]` inline as they are fixed. The next scan replaces the file again.

## Step 3: Build Tech Debt Register

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 3 --step-label "Build Tech Debt Register" 2>/dev/null || true
```

Synthesize ALL findings into a **fresh** `.gsd-t/techdebt.md` (the previous version was archived in Step 2.9). This file contains only the current scan's findings — no resolved items table, no scan history. Previous scans are preserved in `techdebt_YYYY-MM-DD.md` archives.

**Between scans:** when an item is fixed, change its `**Status**:` field to `[RESOLVED] — {brief reason/milestone}`. Do not delete the item — it stays visible until the next scan replaces the file.

**TD numbering:** continue from the highest TD number in the archived file. Check the archive to find the last TD-NNN used.

```markdown
# Tech Debt Register — {date} (Scan #{N})

## Summary
- Critical items: {N}
- High priority: {N}
- Medium priority: {N}
- Low priority: {N}
- Total estimated effort: {rough assessment}
- Previous scan archive: techdebt_{previous-date}.md

---

## Critical Priority
Items that pose active risk or block progress.

### TD-001: {title}
- **Category**: {security | performance | architecture | quality | dependency}
- **Severity**: CRITICAL
- **Status**: OPEN
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
- **Status**: OPEN
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
- Scan number: {N}
- Files analyzed: {count}
- Lines of code: {approximate}
- Languages: {list}
- Previous scan archive: techdebt_{previous-date}.md (or "first scan")
```

## Step 3.5: Diagram Generation

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 3 --step-label ".5: Diagram Generation" 2>/dev/null || true
```

Generate all 6 architectural diagrams using analysis data from Step 2 and schema data from Step 2.5.

Using Bash tool:
```
node -e "
const {generateDiagrams}=require('./bin/scan-diagrams.js');
const analysisData=JSON.parse(process.argv[1]);
const schemaData=JSON.parse(process.argv[2]);
const r=generateDiagrams(analysisData, schemaData, {projectRoot: process.argv[3]});
process.stdout.write(JSON.stringify(r.map(d=>({type:d.type,rendered:d.rendered,rendererUsed:d.rendererUsed}))));
" "$ANALYSIS_JSON" "$SCHEMA_JSON" "$SCANNED_PROJECT_ROOT"
```

Capture the full array as `diagrams`. Log:
- Diagrams rendered: count of `diagrams.filter(d => d.rendered).length` out of 6
- Renderer used per diagram: `diagrams.map(d => d.type + ': ' + d.rendererUsed).join(', ')`

## Step 4: Suggest Milestone Promotions

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 4 --step-label "Suggest Milestone Promotions" 2>/dev/null || true
```

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

### Suggested: Shared Service Extraction (if candidates found)
Combines: all "Shared Service Candidates" from quality.md Reusability Analysis
Estimated effort: {assessment}
Should be prioritized: BEFORE adding new consumer surfaces to the system
Note: Use `/gsd-t-partition` Step 1.6 to design the SharedCore domain
```

## Step 5: Update Living Documents

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 5 --step-label "Update Living Documents" 2>/dev/null || true
```

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

## Step 6: Test Verification

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 6 --step-label "Test Verification" 2>/dev/null || true
```

After updating living documents, verify nothing was broken:

1. **Run existing tests**: Execute the full test suite to establish a baseline — document what passes and what was already failing
2. **Verify passing**: If any tests fail that were passing before the scan began, investigate and fix
3. **Log test baseline**: Record the current test state in `.gsd-t/scan/test-baseline.md` — this gives future milestones a starting point

## Step 6.5: Generate Scan Freshness Cache

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 6 --step-label ".5: Generate Scan Freshness Cache" 2>/dev/null || true
```

After the scan completes and living docs are updated, generate a hash cache so downstream commands can detect staleness without re-scanning.

Create `.gsd-t/scan/.cache.json` with this structure:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.argv[1];
const scanDir = path.join(root, '.gsd-t', 'scan');

// Hash all source files that affect each scan dimension
const dimensions = {
  architecture: ['**/*.js', '**/*.ts', '**/*.py', '**/*.json', '**/package.json', '**/tsconfig.json'],
  quality: ['**/*.js', '**/*.ts', '**/*.py', '**/*.test.*', '**/*.spec.*'],
  security: ['**/*.js', '**/*.ts', '**/*.py', '**/*.env*', '**/package.json', '**/package-lock.json'],
  'business-rules': ['**/*.js', '**/*.ts', '**/*.py'],
  'contract-drift': ['.gsd-t/contracts/**']
};

// For each dimension, hash the scan doc itself to track its version
const cache = { generated: new Date().toISOString(), dimensions: {} };
for (const [dim, _patterns] of Object.entries(dimensions)) {
  const scanFile = path.join(scanDir, dim + '.md');
  if (fs.existsSync(scanFile)) {
    const content = fs.readFileSync(scanFile, 'utf8');
    cache.dimensions[dim] = {
      scanHash: crypto.createHash('md5').update(content).digest('hex'),
      scannedAt: new Date().toISOString()
    };
  }
}

fs.writeFileSync(path.join(scanDir, '.cache.json'), JSON.stringify(cache, null, 2));
console.log('Scan cache generated:', Object.keys(cache.dimensions).length, 'dimensions cached');
" "$PROJECT_ROOT"
```

This cache enables downstream commands (`partition`, `feature`, `gap-analysis`) to check scan freshness and auto-refresh stale dimensions before consuming scan data.

## Step 7: Update Project State

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 7 --step-label "Update Project State" 2>/dev/null || true
```

If `.gsd-t/progress.md` exists:
- Log scan in Decision Log
- Note critical findings

If `.gsd-t/roadmap.md` exists:
- Do NOT auto-add milestones — present suggestions to user
- User decides which to promote with `/gsd-t-promote-debt`

If `CLAUDE.md` exists:
- Suggest updates for any patterns or conventions discovered during scan

## Step 8: Report to User

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-scan --step 8 --step-label "Report to User" 2>/dev/null || true
```

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

### HTML Report Generation

After writing the text report to `.gsd-t/techdebt.md`, generate the self-contained HTML scan report:

Using Bash tool:
```
node -e "
const {collectScanData}=require('./bin/scan-data-collector.js');
const {extractSchema}=require('./bin/scan-schema.js');
const {generateDiagrams}=require('./bin/scan-diagrams.js');
const {generateReport}=require('./bin/scan-report.js');
const root=process.argv[1];
const analysisData=collectScanData(root);
const schemaData=extractSchema(root);
const diagrams=generateDiagrams(analysisData, schemaData, {projectRoot:root});
const r=generateReport(analysisData, schemaData, diagrams, {projectRoot:root});
if (r.outputPath) console.log('HTML report:', r.outputPath, '| Diagrams rendered:', r.diagramsRendered + '/6');
else console.error('Report generation failed:', r.error);
" "$SCANNED_PROJECT_ROOT"
```

Report the HTML output path and diagram render count to the user.

## Document Ripple

Scan produces analysis files and updates living documents (Step 5 already covers most updates). Verify:

### Always update:
1. **`.gsd-t/progress.md`** — Log scan completion with summary stats in Decision Log
2. **`docs/architecture.md`** — Merge scan findings (Step 5)
3. **`docs/workflows.md`** — Merge business rules findings (Step 5)
4. **`docs/infrastructure.md`** — Merge operational findings (Step 5)
5. **`docs/requirements.md`** — Merge discovered requirements (Step 5)
6. **`README.md`** — Update tech stack and setup if needed (Step 5)

### Check if affected:
7. **`.gsd-t/techdebt.md`** — Created/updated with all findings (Step 3)
8. **`CLAUDE.md`** — If new conventions or patterns were discovered, suggest additions

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
