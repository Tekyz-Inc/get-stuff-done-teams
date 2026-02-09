# GSD-T: Project — Decompose a Full Project into Milestones

You are the lead agent taking a complete project vision and breaking it into a logical sequence of milestones. Each milestone should be a shippable increment that builds on the last.

## Step 1: Gather Project Context

Read everything available:
1. `CLAUDE.md` (if exists)
2. `docs/` — any existing documentation
3. User's project description from $ARGUMENTS
4. Any uploaded files (requirements, designs, specs)

If context is thin, ask the user targeted questions:
- What problem does this solve?
- Who are the users?
- What's the tech stack (or preferences)?
- What's the MVP — the minimum that proves the concept?
- Are there hard constraints (timeline, budget, existing systems to integrate with)?
- Any third-party integrations required?
- Auth requirements (social login, SSO, email/password)?
- Deployment target (cloud provider, serverless, containers)?

Do NOT proceed until you have enough context to make informed milestone decisions. It's better to ask 3 good questions now than to repartition later.

## Step 2: Identify the Full Scope

List ALL major capabilities the project needs. Group them into functional areas:

```markdown
## Functional Areas

### Foundation
- Project scaffolding, tooling, CI/CD pipeline
- Database schema, migrations, seed data
- Authentication and authorization
- Core API structure and middleware

### Core Product
- {primary feature set — the main thing the product does}
- {secondary feature set}

### User Experience
- UI shell, navigation, responsive layout
- Key user flows
- Error handling, loading states, empty states

### Integrations
- Third-party APIs
- Webhooks, notifications
- Payment processing (if applicable)

### Operations
- Deployment pipeline
- Monitoring, logging, alerting
- Admin dashboard
- Analytics and reporting

### Polish
- Performance optimization
- Accessibility
- Security hardening
- Documentation
```

Adjust these categories based on the actual project. Not every project needs all of these.

## Step 3: Sequence into Milestones

Break functional areas into milestones following these principles:

### Sequencing Rules:
1. **Foundation first**: Infrastructure, schema, and auth before features
2. **Each milestone is shippable**: It works and can be demonstrated, even if incomplete
3. **Dependencies flow forward**: Milestone N never depends on Milestone N+1
4. **MVP is early**: The minimum viable product should land by milestone 2-3, not milestone 8
5. **Risk front-loaded**: Uncertain or complex work goes earlier so you learn faster
6. **Integration points are milestones**: Don't bury third-party integrations inside feature milestones
7. **Polish is last**: Performance, accessibility, hardening come after functionality works

### Milestone Size:
- Each milestone should be 2-5 domains when partitioned
- Each milestone should be completable in roughly 1-3 focused sessions
- If a milestone feels too big, split it. Too small, merge it.

## Step 4: Write the Milestone Roadmap

Create `.gsd-t/roadmap.md`:

```markdown
# Project Roadmap: {project name}

## Vision
{1-2 sentence project vision}

## Target Users
{who this is for}

## Tech Stack
{languages, frameworks, services, deployment}

---

## Milestone 1: {name} — Foundation
**Goal**: {what "done" looks like}
**Scope**:
- {capability 1}
- {capability 2}
- {capability 3}
**NOT included**: {explicit exclusions}
**Success criteria**:
- [ ] {testable outcome}
- [ ] {testable outcome}
- [ ] {testable outcome}
**Estimated domains**: {2-4 domain names}
**Dependencies**: None (first milestone)

---

## Milestone 2: {name} — Core Feature
**Goal**: {what "done" looks like}
**Scope**:
- {capability 1}
- {capability 2}
**NOT included**: {explicit exclusions}
**Success criteria**:
- [ ] {testable outcome}
- [ ] {testable outcome}
**Estimated domains**: {2-4 domain names}
**Dependencies**: Milestone 1 (foundation, auth, schema)

---

## Milestone 3: {name} — {next logical increment}
...

---

## Future / Out of Scope
- {things explicitly deferred}
- {nice-to-haves not in current plan}
```

## Step 5: Update Project State

Initialize or update `.gsd-t/progress.md`:

```markdown
# GSD-T Progress

## Project: {name}
## Status: ROADMAPPED
## Date: {today}

## Milestones
| # | Milestone | Status | Domains | Est. Sessions |
|---|-----------|--------|---------|---------------|
| 1 | {name} | not started | TBD | {1-3} |
| 2 | {name} | not started | TBD | {1-3} |
| 3 | {name} | not started | TBD | {1-3} |

## Decision Log
- {date}: Project roadmap created with {N} milestones
- {date}: Tech stack decision — {rationale}
- {date}: MVP scope decision — {rationale}
```

Ensure `CLAUDE.md` exists and references the roadmap and tech stack.

## Step 5.5: Document Ripple

After creating the roadmap and updating project state, verify all documentation is consistent:

### Always update:
1. **`.gsd-t/progress.md`** — Already updated in Step 5, verify Decision Log includes project creation rationale and tech stack decisions

### Check if affected:
2. **`docs/requirements.md`** — If the project scope implies specific functional or technical requirements, add them now
3. **`docs/architecture.md`** — If tech stack and architecture decisions were made, document them
4. **`docs/workflows.md`** — If key user workflows are known from the project vision, outline them
5. **`docs/infrastructure.md`** — If deployment targets and dev setup are known, document them
6. **`CLAUDE.md`** — Ensure it references the roadmap, tech stack, and any conventions decided during project planning
7. **`README.md`** — If created or exists, verify it reflects the project overview and tech stack

### Skip what's not affected — early project stage means many docs are still minimal.

## Step 5.6: Test Verification

Before reporting to the user:

1. **If existing code**: Run the full test suite to establish a baseline before milestone work begins
2. **If greenfield**: Note that test infrastructure should be established in Milestone 1
3. **Document baseline**: Record the test state so progress can be measured across milestones

## Step 6: Report to User

Present:
1. The full milestone roadmap (summary view)
2. Total milestone count and rough estimate
3. Which milestone is the MVP
4. Any scope decisions you made and why
5. Questions or trade-offs that need user input

Ask: "Ready to start Milestone 1? Run `/user:gsd-t-partition` to decompose it into domains."

Or if the user wants to review first: "Review the roadmap in `.gsd-t/roadmap.md` and let me know if you want to adjust scope or ordering."

$ARGUMENTS
