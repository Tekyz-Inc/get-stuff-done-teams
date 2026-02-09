# GSD-T: Feature — Add a Major Feature to an Existing Project

You are the lead agent planning a significant new feature for an existing codebase. Unlike `/user:gsd-t-project` (greenfield), this command respects and builds on what already exists — existing patterns, schema, auth, conventions, and contracts.

## Step 1: Understand What Exists

Read everything:
1. `CLAUDE.md` — project conventions, stack, patterns
2. `.gsd-t/progress.md` — completed milestones, decision history
3. `.gsd-t/roadmap.md` (if exists) — original project plan
4. `.gsd-t/contracts/` — existing contracts (these are constraints now)
5. `.gsd-t/domains/` — existing domain boundaries
6. `.gsd-t/techdebt.md` (if exists) — known issues that might interact
7. `docs/` — requirements, architecture, schema
8. Source code — scan the actual implementation:
   - Directory structure and organization patterns
   - Existing API endpoint patterns
   - Database schema (current state)
   - UI component patterns and state management approach
   - Auth/middleware patterns
   - Test patterns and coverage

Build a mental model of: "How does this codebase work today?"

## Step 2: Understand the Feature

From $ARGUMENTS and conversation:
- What does this feature do?
- Who uses it?
- How does it interact with existing functionality?
- What's the priority / timeline pressure?

If context is thin, ask targeted questions:
- How should this integrate with existing auth/permissions?
- Does this need new database tables or extend existing ones?
- Are there new third-party integrations?
- Does this affect existing UI flows or is it a new section?
- Any existing features this replaces or modifies?

## Step 3: Impact Analysis

Before planning milestones, analyze how this feature touches the existing system.

### Team Mode (recommended for large codebases)
If agent teams are enabled, parallelize the analysis by layer:

```
Create an agent team to analyze the impact of this feature:

ALL TEAMMATES read first:
- CLAUDE.md
- .gsd-t/contracts/ (all existing contracts)
- docs/ (requirements, architecture, schema)
Feature description: {feature summary from Step 2}

- Teammate "data-layer": Analyze impact on database schema, 
  migrations, models, data access patterns. What tables/columns 
  are new? What existing queries break? Write to .gsd-t/scan/feature-impact-data.md

- Teammate "backend": Analyze impact on API endpoints, services,
  middleware, business logic. What's new? What existing endpoints 
  change? What contracts are affected? Write to .gsd-t/scan/feature-impact-backend.md

- Teammate "frontend": Analyze impact on UI components, pages, 
  navigation, state management. What's new? What existing flows 
  change? Write to .gsd-t/scan/feature-impact-frontend.md

- Teammate "security": Analyze impact on auth flows, permissions,
  input validation, data exposure. Any new attack surface? 
  Write to .gsd-t/scan/feature-impact-security.md

Lead: Synthesize all impact findings into the combined analysis below.
```

### Solo Mode (small codebases or teams not enabled)
Work through each layer sequentially:

Produce a combined analysis:

```markdown
## Impact Analysis: {feature name}

### New Components (doesn't exist yet)
- {new API endpoints}
- {new database tables/columns}
- {new UI pages/components}
- {new services/integrations}

### Modified Components (exists, needs changes)
- {file/module}: {what changes and why}
- {file/module}: {what changes and why}

### Affected Contracts (existing contracts impacted)
- {contract}: {what needs to change}
  - Breaking change? {yes/no}
  - Consumers affected: {list}

### Untouched (confirmed no impact)
- {areas explicitly not affected}

### Risk Areas
- {where this feature could break existing functionality}
- {complex integration points}
- {performance concerns}
```

## Step 4: Decompose into Milestones

The feature may be a single milestone or multiple, depending on scope:

### Single Milestone (if feature is focused):
- 2-4 domains, < 15 tasks total
- Minimal impact on existing contracts
- Skip roadmap, go straight to: "Run `/user:gsd-t-partition` to begin"

### Multiple Milestones (if feature is complex):
Apply these sequencing rules:

1. **Schema/data changes first**: New tables, migrations, model updates
2. **Backend before frontend**: API endpoints before UI that consumes them  
3. **Existing contract updates early**: If existing contracts change, update and verify them before building new code against them
4. **New functionality before integration**: Build the new thing, then wire it into existing flows
5. **Migration/backfill as its own milestone**: If existing data needs transformation, isolate that work

### Write the Feature Roadmap

Append to `.gsd-t/roadmap.md` (or create if doesn't exist):

```markdown
---

## Feature: {feature name}
**Added**: {date}
**Context**: {why this feature is being added}

### Milestone {N}: {name} — Data Layer Extension
**Goal**: {what "done" looks like}
**Scope**:
- {new tables/columns}
- {schema migrations}
- {data model updates}
**Impact on existing**:
- Extends schema-contract.md with {new tables}
- No breaking changes to existing queries
**Success criteria**:
- [ ] {testable outcome}

### Milestone {N+1}: {name} — Feature Backend
**Goal**: {what "done" looks like}
**Scope**:
- {new API endpoints}
- {business logic}
- {integration with existing auth}
**Impact on existing**:
- Adds to api-contract.md: {new endpoints}
- Modifies: {existing middleware/routes}
**Success criteria**:
- [ ] {testable outcome}

### Milestone {N+2}: {name} — Feature UI + Integration
**Goal**: {what "done" looks like}
**Scope**:
- {new pages/components}
- {wire into existing navigation}
- {update existing UI where needed}
**Impact on existing**:
- Modifies: {existing components}
- Extends component-contract.md with {new components}
**Success criteria**:
- [ ] {testable outcome}
```

## Step 5: Reconcile with Existing State

Critical step — make sure the new milestones fit with what's already built:

1. **Check for conflicts**: Do new milestones conflict with in-progress work?
2. **Check for dependencies**: Do any existing incomplete milestones need to finish first?
3. **Check techdebt.md**: Are there known issues that should be fixed before or during this feature?
4. **Update domain boundaries**: Will existing domains need scope changes? Will new domains be created?

If conflicts exist, present them to the user with options:
- "Milestone 3 (existing) modifies the same auth middleware this feature needs. Should we complete M3 first, or merge the work?"

## Step 6: Update Project State

Update `.gsd-t/progress.md`:
- Add new milestones to the table
- Log the feature addition in Decision Log
- Note any contract changes that will be needed

## Step 7: Document Ripple

After creating the feature roadmap and milestones, update all affected documentation:

### Always update:
1. **`.gsd-t/progress.md`** — Already done in Step 6, but verify Decision Log includes the feature addition with rationale

### Check if affected:
2. **`docs/requirements.md`** — Add new functional/technical requirements identified during feature analysis
3. **`docs/architecture.md`** — If the feature introduces new components, data flows, or architectural patterns, document them
4. **`docs/workflows.md`** — If the feature introduces new user journeys or modifies existing flows, update them
5. **`CLAUDE.md`** — If the feature establishes new conventions or patterns that future work should follow, add them
6. **`.gsd-t/contracts/`** — If impact analysis identified contract changes needed, note them (actual updates happen during partition)
7. **`.gsd-t/techdebt.md`** — If analysis revealed existing debt that interacts with this feature, add or update items

### Skip what's not affected.

## Step 7.5: Test Verification

Before finalizing the feature plan:

1. **Run existing tests**: Execute the full test suite to confirm the codebase is in a clean state before feature work begins
2. **Verify passing**: If any tests fail, flag them — they must be fixed before or during the first milestone
3. **Note test gaps**: From the impact analysis, identify which existing tests will need updates and which new tests will be needed — include these in milestone scope

## Step 8: Report to User

Present:
1. Impact analysis summary (what's new vs. what's modified)
2. Milestone breakdown for the feature
3. Risk areas and how the milestones mitigate them
4. Any conflicts with existing work
5. Recommended starting point

Ask: "Ready to start? Run `/user:gsd-t-partition` for Milestone {N}."

$ARGUMENTS
