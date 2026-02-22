# GSD-T: Discuss — Multi-Perspective Design Exploration

You are the lead agent exploring design decisions before committing to a plan. The goal of this phase is to produce or refine **contracts** — not just recommendations.

## IMPORTANT: Manual vs Auto-Invoked Behavior

**When manually invoked** (user typed `/user:gsd-t-discuss`):
- Focus on the user's specific topic from `$ARGUMENTS`
- Present analysis, options, and recommendations — do NOT auto-implement anything
- At the end, **STOP and wait for user input** — even in bypass/yolo mode
- The user wants to review and decide before proceeding
- Do NOT continue to the plan or execute phase

**When auto-invoked** (called by `gsd-t-wave` or another workflow command):
- Work through all open questions automatically
- Make recommendations and log decisions
- Continue to the next phase without stopping

**How to tell:** If `$ARGUMENTS` contains a specific topic or question, the user invoked this manually. If `$ARGUMENTS` is empty or contains only a milestone reference, it was auto-invoked by the workflow.

## Step 1: Load Context

Read in order:
1. `CLAUDE.md`
2. `.gsd-t/progress.md`
3. `.gsd-t/contracts/` — all existing contracts
4. `.gsd-t/domains/` — all domain scopes
5. `docs/` — requirements, architecture, schema, design docs

## Step 2: Identify Open Questions

**If manually invoked with a topic:** Focus on THAT topic. The user's question/topic is the priority. You may surface related questions, but the user's topic comes first.

**If auto-invoked:** Based on the milestone and current contracts, identify what's unresolved:
- Architecture decisions not yet made
- Contract details that are vague or missing
- Technical approaches with multiple viable options
- Risk areas that need exploration

List these as numbered questions.

## Step 3: Explore (Solo or Team)

### Solo Mode (default, no teams):
Work through each open question systematically:
- For each question, consider at least 2 approaches
- Evaluate each against: project requirements, existing patterns in CLAUDE.md, complexity, risk
- Make a recommendation with rationale
- Document the decision in `.gsd-t/progress.md` Decision Log

### Team Mode (when agent teams are enabled):
If the user requests team exploration or there are 3+ complex open questions:

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning the team — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

```
Create an agent team:

ALL TEAMMATES read first:
- CLAUDE.md
- .gsd-t/contracts/ (all files)
- docs/ (relevant docs)

Assign each teammate a distinct perspective:
- Teammate 1: Advocate for approach A — build strongest case
- Teammate 2: Advocate for approach B — build strongest case
- Teammate 3: Critic — find weaknesses in both, identify risks

Lead: Synthesize into decisions and update contracts.
```

After team completes — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`
Compute tokens and compaction:
- No compaction (TOK_END >= TOK_START): `TOKENS=$((TOK_END-TOK_START))`, COMPACTED=null
- Compaction detected (TOK_END < TOK_START): `TOKENS=$(((TOK_MAX-TOK_START)+TOK_END))`, COMPACTED=$DT_END
Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted |` if missing):
`| {DT_START} | {DT_END} | gsd-t-discuss | Step 3 | sonnet | {DURATION}s | team discuss: {topic summary} | {TOKENS} | {COMPACTED} |`

Assign teammates based on the nature of the questions:
- **Technical choice** (e.g., which database): one advocate per option + critic
- **Architecture pattern** (e.g., monolith vs microservice): one advocate per pattern + someone evaluating migration path
- **Risk assessment**: one optimist, one pessimist, one pragmatist

## Step 4: Update Contracts

Every decision MUST result in a contract update. This is the output that matters.

For each decision:
1. Update or create the relevant contract file in `.gsd-t/contracts/`
2. Update domain `scope.md` and `constraints.md` if the decision affects boundaries
3. Add to `.gsd-t/progress.md` Decision Log with date and rationale

## Step 5: Create CONTEXT.md

After finalizing decisions, create or update `.gsd-t/CONTEXT.md`:

```markdown
# Discuss CONTEXT — {Milestone Name}
Generated: {date}

## Locked Decisions
Decisions made in this session. The plan phase MUST implement each of these exactly.
- {Decision 1 — specific and implementable}
- {Decision 2}

## Deferred Ideas
Good ideas surfaced but NOT in scope for this milestone. Plan must NOT implement these.
- {Idea 1 — brief description of what was deferred and why}

## Claude's Discretion
Implementation details not specified — Claude can choose freely when executing.
- {Detail 1 — e.g., "Use either X or Y approach for the logging layer"}
```

The plan phase planner must read this file and map every Locked Decision to at least one task. If a Locked Decision has no corresponding task, the plan is incomplete.

## Step 6: Document Ripple

Decisions don't just affect contracts — they can change the broader documentation:

### Always update:
1. **`.gsd-t/progress.md`** — Decision Log with date, decision, and rationale

### Check if affected:
2. **`docs/architecture.md`** — Did a decision change the architecture pattern, tech stack, data flow, or component relationships? Update it
3. **`docs/requirements.md`** — Did a decision add, remove, or change a requirement? Update it
4. **`docs/schema.md`** — Did a decision affect the data model? Update it
5. **`CLAUDE.md`** — Did a decision establish a new convention or pattern? Add it so all future work follows it
6. **Domain `constraints.md`** — Already updated in Step 4, but double-check all domains are consistent with the decisions

### Skip what's not affected.

## Step 7: Test Verification

If decisions resulted in contract or code changes:

1. **Run affected tests**: Execute tests related to any files modified by contract updates
2. **Verify passing**: All tests must pass. If any fail from contract changes, fix before proceeding (up to 2 attempts)
3. **Flag test gaps**: If decisions created new requirements with no test coverage, note them for the plan phase

## Step 8: Validate Contracts

After all updates:
- [ ] All contracts are internally consistent (no conflicting types/shapes)
- [ ] Cross-references between contracts are valid
- [ ] Every domain's constraints reflect the decisions made
- [ ] Integration points are updated with any new dependencies

## Step 9: Report and Stop

Present to the user:
1. Decisions made (with brief rationale)
2. Contracts created or updated
3. Any remaining open questions that need user input
4. Recommended next step (usually: plan phase)

Update `.gsd-t/progress.md` status to `DISCUSSED`.

### Autonomy Behavior

**When manually invoked** (any autonomy level): **STOP HERE.** Do NOT proceed to the plan phase or any other phase. Present your findings and ask the user: "Discussion complete. Here's what I found and recommend. Want to proceed with these decisions, revise anything, or explore further?" This is mandatory — even at Level 3 / bypass permissions. The user invoked discuss to THINK, not to auto-pilot.

**Level 3 (Full Auto) — when auto-invoked by wave**: Work through all open questions automatically, make recommendations, log decisions, and return control to the calling command. Do NOT wait for user input.

**Level 1–2 — when auto-invoked**: Present decisions and open questions. Wait for user confirmation before returning control to the calling command.

$ARGUMENTS
