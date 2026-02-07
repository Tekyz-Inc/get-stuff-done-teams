# GSD-T: Discuss — Multi-Perspective Design Exploration

You are the lead agent exploring design decisions before committing to a plan. The goal of this phase is to produce or refine **contracts** — not just recommendations.

## Step 1: Load Context

Read in order:
1. `CLAUDE.md`
2. `.gsd-t/progress.md`
3. `.gsd-t/contracts/` — all existing contracts
4. `.gsd-t/domains/` — all domain scopes
5. `docs/` — requirements, architecture, schema, design docs

## Step 2: Identify Open Questions

Based on the milestone and current contracts, identify what's unresolved:
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

## Step 5: Document Ripple

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

## Step 6: Validate Contracts

After all updates:
- [ ] All contracts are internally consistent (no conflicting types/shapes)
- [ ] Cross-references between contracts are valid
- [ ] Every domain's constraints reflect the decisions made
- [ ] Integration points are updated with any new dependencies

## Step 7: Report

Present to the user:
1. Decisions made (with brief rationale)
2. Contracts created or updated
3. Any remaining open questions that need user input
4. Recommended next step (usually: plan phase)

Update `.gsd-t/progress.md` status to `DISCUSSED`.

$ARGUMENTS
