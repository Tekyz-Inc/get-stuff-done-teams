# GSD-T: Partition Work into Domains

You are the lead agent in a contract-driven development workflow. Your job is to decompose the current milestone into independent domains with explicit boundaries and contracts.

## Model Assignment

Per `.gsd-t/contracts/model-selection-contract.md` v1.0.0.

- **Default**: `opus` (`selectModel({phase: "partition"})`) — domain decomposition is architectural reasoning. High stakes.
- **Escalation**: already at opus; there is no stronger tier. Partition decisions are always made at full quality.

## Step 0.5: Scan Freshness Auto-Refresh

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-partition --step 0 --step-label ".5: Scan Freshness Auto-Refresh" 2>/dev/null || true
```

Before reading scan data, check if scan docs are stale and auto-refresh if needed. This ensures partition decisions are based on current code — no warnings, no user involvement.

If `.gsd-t/scan/.cache.json` exists:
1. Read the cache and check `dimensions.quality.scannedAt` and `dimensions.architecture.scannedAt`
2. Count commits since the scan: `git rev-list --count --after="{scannedAt}" HEAD`
3. If **>10 commits since scan** OR **scan is older than 14 days**:
   - Log: "Auto-refreshing scan docs (stale by {N} commits / {N} days)..."
   - Re-run only the stale dimensions by spawning the relevant scan teammates:
     - If `quality.md` stale → spawn quality teammate (model: sonnet)
     - If `architecture.md` stale → spawn architecture teammate (model: haiku)
   - Update `.gsd-t/scan/.cache.json` after refresh
4. If fresh → proceed silently

If `.gsd-t/scan/` doesn't exist at all → skip (no scan data to refresh).

## Step 1: Understand the Project

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-partition --step 1 --step-label "Understand the Project" 2>/dev/null || true
```

Read these files in order:
1. `CLAUDE.md` — project conventions and context
2. `.gsd-t/progress.md` — current state (if exists)
3. `docs/` — all available documentation (requirements, architecture, schema, design)
4. `.gsd-t/scan/quality.md` (if exists) — extract the "Consumer Surfaces Detected" and "Shared Service Candidates" tables. These pre-populate Step 1.6 with scan-discovered data and eliminate re-research.
5. `.gsd-t/contracts/shared-services-contract.md` (if exists) — a SharedCore domain was previously identified. Its listed operations are pre-confirmed shared and carry forward automatically to Step 1.6.2.

If `.gsd-t/` doesn't exist, create the full directory structure:
```
.gsd-t/
├── contracts/
├── domains/
└── progress.md
```

<!-- M56-D3: brief wire-in -->
**M56 Context-Brief (replaces 30–60k context re-read with ≤2,500-token JSON snapshot):**

```bash
SPAWN_ID="partition-${MILESTONE:-default}-$(date -u +%Y%m%dT%H%M%SZ)"
gsd-t brief --kind partition --spawn-id "${SPAWN_ID}" --out ".gsd-t/briefs/${SPAWN_ID}.json" || true
export BRIEF_PATH=".gsd-t/briefs/${SPAWN_ID}.json"
```

Pass `$BRIEF_PATH` into any worker prompts spawned downstream so they grep the brief instead of re-walking the repo.
<!-- /M56-D3: brief wire-in -->

## Step 1.5: Assumption Audit (MANDATORY — complete before domain work begins)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-partition --step 1 --step-label ".5: Assumption Audit (MANDATORY — complete before domain work begins)" 2>/dev/null || true
```

Before partitioning, surface and lock down all assumptions baked into the requirements. Unexamined assumptions become architectural decisions no one approved.

Work through each category below. For every match found, write the explicit disposition into the affected domain's `constraints.md` and into the Decision Log in `.gsd-t/progress.md`.

---

### Category 1: External Reference Assumptions

Scan requirements for any external project, file, component, library, or URL mentioned by name or path. For each one found, explicitly confirm which disposition applies — and lock it in the contract before any domain touches it:

| Disposition | Meaning |
|-------------|---------|
| `USE`       |  Import and depend on it — treat as a dependency |
| `INSPECT`   |  Read source for patterns only — do not import or copy code |
| `BUILD`     |  Build equivalent functionality from scratch — do not read or use it |

**No external reference survives partition without a locked disposition.**

Trigger phrases to watch for: "reference X", "like X", "similar to Y", "see W for how it handles Z", any file path or project name, any URL.

> If Level 3 (Full Auto): state the inferred disposition and reason; lock it unless it's ambiguous.
> If ambiguous (e.g., "reference X" could mean USE or INSPECT): pause and ask the user before proceeding.

---

### Category 3: Black Box Assumptions

Any component, module, or library **not written in this milestone** that a domain will call, import, or depend on → the agent that executes that domain must read its source before treating it as correct. This includes internal project modules written in a previous milestone.

For each such component identified:
1. Name it explicitly in the domain's `constraints.md` under a `## Must Read Before Using` section
2. List the specific functions or behaviors the domain depends on
3. The execute agent is prohibited from treating it as a black box — it must read the listed items before implementing

---

### Category 4: User Intent Assumptions

Scan requirements for ambiguous language. Flag every instance where intent could be interpreted more than one way. Common patterns:

- "like X" / "similar to Y" — does this mean the same UX, the same architecture, or just the same concept?
- "the way X handles it" — inspiration, direct port, or behavioral equivalent?
- "reference Z" — does this mean read it, use it, or replicate it?
- "build something that does W" — from scratch, or using an existing library?
- Any requirement where a reasonable developer could make two different implementation choices

For each ambiguous item:
1. State the two (or more) possible interpretations explicitly
2. State which interpretation you are locking in and why
3. If genuinely unclear: pause and ask the user — do not infer and proceed

> **Rule**: Ambiguous intent that reaches execute unresolved becomes a wrong assumption. Resolve it here or pay for it in debug sessions.

---

## Step 1.55: Graph-Enhanced Boundary Detection (if available)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-partition --step 1 --step-label ".55: Graph-Enhanced Boundary Detection (if available)" 2>/dev/null || true
```

If `.gsd-t/graph/meta.json` exists, query the graph to inform domain decomposition:

1. **Entity-to-file mapping**: `query('getEntities', { file })` for each source file — understand what functions/classes exist where
2. **Import graph**: `query('getImports', { file })` — see the dependency structure between files
3. **Surface consumers**: `query('getSurfaceConsumers', { entity })` — which surfaces already consume each function (auto-populates Step 1.6)
4. **Domain boundary violations**: `query('getDomainBoundaryViolations', {})` — existing cross-domain access patterns to inform boundaries
5. **Shared operation detection**: If multiple surfaces consume the same entity, it's a SharedCore candidate

Use graph results to **propose initial domain boundaries** based on actual code structure, not just file paths. The graph reveals natural boundaries that directory structure may not show (e.g., two files in the same folder that never import each other belong to different domains).

## Step 1.6: Consumer Surface Identification (MANDATORY — complete before domain work)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-partition --step 1 --step-label ".6: Consumer Surface Identification (MANDATORY — complete before domain work)" 2>/dev/null || true
```

Before decomposing into domains, identify **every surface that will consume this system**. A surface is any client, app, or integration that calls your backend — web app, mobile app, CLI, external API, admin panel, background job, etc.

Skipping this step leads to duplicated backend logic when a second consumer is added later.

---

### 1.6.1 — Enumerate Surfaces

For each surface that will consume this system, capture:

```markdown
## Consumer Surfaces

| Surface | Type | Operations Needed |
|---------|------|------------------|
| {Web App}    | web     | login, list-items, get-item, update-progress, search |
| {Mobile App} | mobile  | login, list-items, get-item, update-progress, offline-sync |
| {CLI}        | cli     | import-data, export-data, list-items |
```

**Surface types**: `web`, `mobile`, `cli`, `external-api`, `admin`, `background-worker`, `other`

**Existing System Check**: This milestone may be adding a NEW surface to a system that already has existing consumer surfaces. Before concluding surface enumeration, scan `.gsd-t/progress.md` completed milestones and look for directories or route files indicating prior client surfaces (`web/`, `mobile/`, `app/`, `cli/`, `client/`, `routes/web.js`, `routes/mobile.js`). Add any discovered existing surfaces to the table above.

> ⚠️ **New-client signal**: If this milestone adds a consumer surface to a system that already has one or more other consumer surfaces, SharedCore evaluation is MANDATORY regardless of shared operation count.

If only one surface exists and no prior surfaces were found → mark "Single consumer — SharedCore not needed" and proceed to Step 2.

---

### 1.6.2 — Identify Shared Operations

Compare the "Operations Needed" column across all surfaces. Flag every operation that appears in 2 or more surfaces:

```markdown
## Shared Operations (candidates for SharedCore)

| Operation        | Surfaces That Need It | Shared? |
|------------------|-----------------------|---------|
| login            | web, mobile           | ✅  |
| list-items       | web, mobile, cli      | ✅  |
| get-item         | web, mobile           | ✅  |
| update-progress  | web, mobile           | ✅  |
| offline-sync     | mobile only           | ❌  |
| export-data      | cli only              | ❌  |
```

---

### 1.6.3 — Auto-Suggest SharedCore Domain

**If 2 or more shared operations exist, OR if this milestone adds a new consumer surface to a system that already has other surfaces (detected in the Existing System Check above):**

> ⚠️ **SharedCore recommended** — {N} operations are needed by {M} consumer surfaces.
> A `shared-core` domain will be added to own these functions.
> Surfaces get thin adapter layers that call SharedCore — not duplicate implementations.

Add `shared-core` to the domain list before running Step 2. The `shared-core` domain:
- Owns: the shared operation implementations
- Consumed by: all surface-specific adapter domains
- Contract: `shared-services-contract.md` (use the template from `templates/shared-services-contract.md`)

**If only 1 shared operation exists AND this is not a new-client-to-existing-system scenario:**

> ℹ️ {N} shared operations found. Inline sharing is sufficient — no separate SharedCore domain needed. Document shared functions in the relevant domain's constraints.md.

---

### 1.6.4 — Write the Shared Services Contract

If SharedCore was created, populate `.gsd-t/contracts/shared-services-contract.md` using the template from `templates/shared-services-contract.md`.

---

## Step 2: Identify Domains

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-partition --step 2 --step-label "Identify Domains" 2>/dev/null || true
```

Decompose the milestone into 2-5 independent domains. Each domain should:
- Own a distinct area of functionality
- Have minimal overlap with other domains
- Map to a clear set of files/directories it will own
- Be executable by a single agent without needing another domain's internals

For each domain, create `.gsd-t/domains/{domain-name}/`:
```
.gsd-t/domains/{domain-name}/
├── scope.md        — what this domain owns (files, directories, responsibilities)
├── tasks.md        — (empty for now, filled during plan phase)
└── constraints.md  — patterns to follow, files NOT to touch, conventions
```

### scope.md format:
```markdown
# Domain: {name}

## Responsibility
{What this domain is responsible for}

## Owned Files/Directories
- src/{path}/ — {description}
- src/{path}/ — {description}

## NOT Owned (do not modify)
- {files owned by other domains}
```

### constraints.md format:
```markdown
# Constraints: {domain-name}

## Must Follow
- {pattern or convention from CLAUDE.md}
- {specific technical constraint}

## Must Not
- Modify files outside owned scope
- Create new database tables (data-layer domain owns schema)
- {other boundaries}

## Dependencies
- Depends on: {other domain} for {what}
- Depended on by: {other domain} for {what}
```

## Step 3: Write Contracts

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-partition --step 3 --step-label "Write Contracts" 2>/dev/null || true
```

Contracts define HOW domains interact. Create files in `.gsd-t/contracts/`:

For each boundary between domains, write a contract:

### API contracts (`api-contract.md`):
```markdown
# API Contract

## POST /api/auth/login
Request: { email: string, password: string }
Response: { token: string, user: { id: string, email: string, role: string } }
Errors: 401 { error: "invalid_credentials" }
Owner: auth domain
Consumers: ui domain

## GET /api/users/:id
...
```

### Schema contracts (`schema-contract.md`):
```markdown
# Schema Contract

## Users Table
| Column | Type | Constraints |
|--------|------|------------|
| id | uuid | PK, auto |
| email | varchar(255) | unique, not null |
...

Owner: data-layer domain
Consumers: auth domain, ui domain
```

### Component contracts (`component-contract.md`):
```markdown
# Component Contract

## LoginForm
Props: { onSuccess: (user: User) => void, onError: (msg: string) => void }
Events: Calls POST /api/auth/login per api-contract
Owner: ui domain
```

### Integration points (`integration-points.md`):
```markdown
# Integration Points

## Auth → Data Layer
- Auth domain reads Users table (schema-contract.md)
- Auth domain calls data-layer's user lookup function
- Checkpoint: data-layer must complete Task 2 before auth starts Task 3

## UI → Auth
- UI calls auth endpoints per api-contract.md
- Checkpoint: auth must complete Task 2 before UI starts Task 4
```

## Step 3.5: Design Brief Detection (UI Projects Only)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-partition --step 3 --step-label ".5: Design Brief Detection (UI Projects Only)" 2>/dev/null || true
```

After writing contracts, check for UI/frontend signals. If found, generate `.gsd-t/contracts/design-brief.md` to give all subagents a consistent visual language reference.

**Skip this step entirely if no UI signals are detected.**

### Detection — check for ANY of the following

| Signal | How to check |
|--------|-------------|
| React in stack | `"react"` in `package.json` `dependencies` or `devDependencies` |
| Vue in stack | `"vue"` in `package.json` dependencies |
| Svelte in stack | `"svelte"` in `package.json` dependencies |
| Next.js in stack | `"next"` in `package.json` dependencies |
| Flutter project | `pubspec.yaml` exists |
| CSS/SCSS files in scope | `.css`, `.scss`, or `.sass` files present in the codebase |
| Component files in scope | `.jsx`, `.tsx`, `.svelte`, or `.vue` files present |
| Tailwind config exists | `tailwind.config.js` or `tailwind.config.ts` exists |

If NONE of the above match → skip this step entirely. Log: "Design brief: skipped — no UI signals detected."

**If `.gsd-t/contracts/design-brief.md` already exists → do NOT overwrite. Log: "Design brief: skipped — existing brief preserved." and continue.**

### Generate `.gsd-t/contracts/design-brief.md`

Source priority (use first source that provides a value):
1. **Tailwind config** (`tailwind.config.js/ts`) — extract `theme.colors`, `theme.fontFamily`, `theme.spacing`
2. **Design token files** (`theme.ts`, `tokens.css`, `design-tokens.json`) — extract token values
3. **Quality North Star** (read `## Quality North Star` from `CLAUDE.md`) — use for Tone & Voice section (skip gracefully if absent)
4. **Defaults** — sensible web defaults if no signals found (Tailwind defaults, system fonts, 4px spacing)

Generate the file using this format:

```markdown
# Design Brief

## Project
{project name}

## Color Palette
| Role       | Value   | Usage                  |
|------------|---------|------------------------|
| Primary    | #000000 | CTA buttons, links     |
| Secondary  | #000000 | Secondary actions      |
| Background | #ffffff | Page background        |
| Surface    | #f5f5f5 | Cards, panels          |
| Error      | #ef4444 | Error states           |
| Success    | #22c55e | Success states         |

## Typography
| Role      | Family    | Size     | Weight |
|-----------|-----------|----------|--------|
| Heading 1 | {font}    | 2rem     | 700    |
| Heading 2 | {font}    | 1.5rem   | 600    |
| Body      | {font}    | 1rem     | 400    |
| Caption   | {font}    | 0.875rem | 400    |
| Code      | monospace | 0.875rem | 400    |

## Spacing System
- Base unit: 4px
- Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96

## Component Patterns
- {e.g., "Use shadcn/ui primitives for all interactive elements"}
- {e.g., "Card pattern: rounded-lg border shadow-sm p-4"}
- {e.g., "Form pattern: label above input, error below"}

## Layout Principles
- {e.g., "Max content width: 1280px, centered"}
- {e.g., "Mobile-first: stack to horizontal at md breakpoint"}

## Interaction Patterns
- {e.g., "Loading: skeleton screens, not spinners"}
- {e.g., "Transitions: 150ms ease for state changes"}

## Tone & Voice
{Derived from Quality North Star or brand voice — e.g., "Professional but approachable. Error messages are friendly and actionable."}
```

Log in `.gsd-t/progress.md` Decision Log: `- {date}: Design brief generated at .gsd-t/contracts/design-brief.md — UI signals detected: {list of signals}`

## Step 3.6: Design Contract Bootstrap (Figma/Design Reference Detection)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-partition --step 3 --step-label ".6: Design Contract Bootstrap (Figma/Design Reference Detection)" 2>/dev/null || true
```

After the design brief, check whether this project has a design reference (Figma, images, prototypes). If found, create `.gsd-t/contracts/design-contract.md` to activate the design-to-code stack rule during execute.

**Skip this step if `.gsd-t/contracts/design-contract.md` already exists.**

### Detection — check for ANY of the following

| Signal | How to check |
|--------|-------------|
| Figma URL in requirements | `docs/requirements.md` contains `figma.com/design/` or `figma.com/file/` |
| Figma URL in CLAUDE.md | `CLAUDE.md` contains `figma.com/design/` or `figma.com/file/` |
| Figma MCP configured | `~/.claude/settings.json` has `mcpServers.figma` |
| Figma config files | `.figmarc` or `figma.config.json` exists |
| Design token files | `design-tokens.json` or `design-tokens/` directory exists |
| Design images in docs | `docs/designs/`, `designs/`, or `mockups/` directory exists with image files |
| Design references in requirements | `docs/requirements.md` contains "design", "mockup", "pixel-perfect", or "Figma" |

If NONE of the above match → skip this step. Log: "Design contract: skipped — no design references detected."

### Generate `.gsd-t/contracts/design-contract.md`

1. Copy the design contract template from the GSD-T package:
   ```bash
   GSD_T_DIR=$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t
   TEMPLATE="$GSD_T_DIR/templates/design-contract.md"
   if [ -f "$TEMPLATE" ]; then cp "$TEMPLATE" .gsd-t/contracts/design-contract.md; fi
   ```

2. If a Figma URL was found, populate the Source section:
   - Set `Source Type` to `Figma MCP` (if MCP configured) or `Screenshot` (if not)
   - Set `Source Reference` to the Figma URL
   - Set `Precision Level` to `Exact (MCP)` or `Estimated (visual analysis)`

3. If Figma MCP is available, use `get_design_context` or `get_metadata` to pre-populate:
   - Color palette from design variables/styles
   - Typography from text styles
   - Spacing from auto-layout values

**This file activates the design-to-code stack rule during execute**, ensuring:
- Design tokens are extracted before coding
- Every CSS value traces to the contract
- Visual verification loop runs after implementation
- Stack capability is evaluated before implementation begins

Log in `.gsd-t/progress.md` Decision Log: `- {date}: Design contract created at .gsd-t/contracts/design-contract.md — design reference detected: {source type + URL or signal}`

## Step 4: Initialize Progress

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-partition --step 4 --step-label "Initialize Progress" 2>/dev/null || true
```

Write `.gsd-t/progress.md`:
```markdown
# GSD-T Progress

## Milestone: {name}
## Status: PARTITIONED
## Date: {today}

## Domains
| Domain | Status | Tasks | Completed |
|--------|--------|-------|-----------|
| {name} | partitioned | 0 | 0 |

## Contracts
- [ ] api-contract.md
- [ ] schema-contract.md
- [x] {any completed ones}

## Integration Checkpoints
- [ ] {checkpoint description} — blocks {domain} task {N}

## Decision Log
- {date}: {decision and rationale}
```

## Step 5: Document Ripple

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-partition --step 5 --step-label "Document Ripple" 2>/dev/null || true
```

After creating domains and contracts, update affected documentation:

### Always update:
1. **`.gsd-t/progress.md`** — Already updated in Step 4, but verify Decision Log includes partition rationale

### Check if affected:
2. **`docs/architecture.md`** — If the partition defines new component boundaries or clarifies the system structure, update it
3. **`docs/requirements.md`** — If partitioning revealed that requirements need clarification or splitting by domain, update them
4. **`CLAUDE.md`** — If the partition establishes new file ownership conventions or domain-specific patterns, add them

### Skip what's not affected.

## Step 6: Test Verification

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-partition --step 6 --step-label "Test Verification" 2>/dev/null || true
```

Before finalizing the partition:

1. **Run existing tests**: Execute the full test suite to confirm codebase is clean before domain work begins
2. **Verify passing**: If any tests fail, assign them to the appropriate domain as pre-existing issues
3. **Map tests to domains**: Note which test files belong to which domain — this informs task planning

## Step 7: Validate

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-partition --step 7 --step-label "Validate" 2>/dev/null || true
```

Before finishing, verify:
- [ ] Every file in `src/` is owned by exactly one domain
- [ ] No domain scope overlaps with another
- [ ] Every dependency between domains has a contract
- [ ] Every contract has an owner and at least one consumer
- [ ] Integration checkpoints are identified for all cross-domain dependencies

### Autonomy Behavior

**Level 3 (Full Auto)**: Log a brief status line (e.g., "✅ Partition complete — {N} domains defined, {N} contracts written") and auto-advance to the next phase. Do NOT wait for user input.

**Level 1–2**: Report the partition to the user with a summary of domains, contracts, and any decisions that need input. Wait for confirmation before proceeding.

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
