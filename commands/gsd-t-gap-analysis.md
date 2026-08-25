# GSD-T: Gap Analysis — Requirements vs. Existing Code

You are performing a gap analysis between a provided specification and the existing codebase. The user pastes requirements or a spec, and you systematically identify what's done, what's partial, what's wrong, and what's missing.

## Two modes — chosen by whether a sheet URL was given

| Invocation | Mode | Output |
|---|---|---|
| `/gsd-t-gap-analysis <spec>` | **Report** (default) | `.gsd-t/gap-analysis.md` — Steps 0.5-9 below, unchanged |
| `/gsd-t-gap-analysis <spec> --sheet <url>` | **Client deliverable** | The estimating sheet's columns A-D and M-P, red-teamed — Steps 3a-6c |

**Report mode is the default and is unchanged.** Every existing caller — `/gsd-t-scan`'s next-step offer, `gsd-t-phase.workflow.js` routing — invokes it without `--sheet` and behaves exactly as before.

**Client-deliverable mode** is the procedure proven on the HILO AI Scheduling sheet: 141 raw requirements reduced to 33 feature rows carrying 595 checkable claims, judged against the code, then attacked by a red team that found a 70% defect rate in a column a friendly sample had already approved. It writes only the *what and whether* columns; `/gsd-t-estimate` sizes and prices them afterward. Behaviour map: `.gsd-t/pseudocode/PseudoCode-GapAnalysis.md`.

In client-deliverable mode, run Step 0.5 and Step 1, then branch to **Step 3a (Harvest)** — do NOT run Step 2 (Parse Requirements). Step 2 assumes a finished specification was handed to you; in this mode **there usually is no such document**, and expecting one is how a run stalls asking for a spec that was never going to exist.

## Step 0.5: Scan Freshness Auto-Refresh

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-gap-analysis --step 0 --step-label ".5: Scan Freshness Auto-Refresh" 2>/dev/null || true
```

Before reading scan data for gap classification, check if scan docs are stale and auto-refresh if needed. This ensures gap analysis is based on current code — no warnings, no user involvement.

If `.gsd-t/scan/.cache.json` exists:
1. Read the cache and check `scannedAt` for each dimension
2. Count commits since the scan: `git rev-list --count --after="{scannedAt}" HEAD`
3. If **>10 commits since scan** OR **scan is older than 14 days**:
   - Log: "Auto-refreshing the tech-debt register (stale by {N} commits / {N} days)..."
   - Re-run the scan by invoking the volume-scaled scan Workflow (`templates/workflows/gsd-t-scan.workflow.js`, same as `/gsd-t-scan`) — the probe re-slices the codebase and the finders refresh the register. This replaces the retired fixed-dimension teammate refresh.
4. If fresh → proceed silently

If no prior `.gsd-t/techdebt.md` exists at all → skip (no scan data to refresh).

## Step 1: Load Context

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-gap-analysis --step 1 --step-label "Load Context" 2>/dev/null || true
```

Read (if they exist):
1. `CLAUDE.md` — project context
2. `.gsd-t/progress.md` — current state
3. `docs/requirements.md` — existing requirements
4. `docs/architecture.md` — system structure

## Step 1.5: Graph Structural Slice — who-imports + dead-code (M94-D10)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-gap-analysis --step 1 --step-label ".5: Graph Structural Slice" 2>/dev/null || true
```

**[RULE] plan-feature-gapanalysis-use-graph-not-grep** — the gap-analysis agent MUST use the
graph CLI for dead-code and who-imports questions (requirements-vs-code coverage gaps), NOT
grep/raw-read to reconstruct the dependency or dead-code picture.

The phase Workflow (`gsd-t-phase.workflow.js`) automatically queries `gsd-t graph dead-code`
for the gap-analysis phase and injects the pre-computed dead-code slice into the agent context.
Use this slice to:
1. Identify implemented-but-disconnected code (dead-code entries that may indicate a gap — a
   feature was implemented but never wired into a consumer).
2. Identify which requirements map to code entities via real import/call edges (`who-imports`).

**On `graph-unavailable`:** the phase Workflow surfaces a LOUD message and the gap-analysis
agent FAILS LOUD — it does NOT silently skip this step or fall back to grep for the structural
dead-code / who-imports question. Run `gsd-t graph status` to diagnose.

Graph consumer manifest row: `commands/gsd-t-gap-analysis.md | templates/workflows/gsd-t-phase.workflow.js | reader | who-imports,dead-code | grep-reconstructed dead-code/dependency discovery`

## Step 2: Parse Requirements

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-gap-analysis --step 2 --step-label "Parse Requirements" 2>/dev/null || true
```

Break the provided spec into numbered discrete requirements. Each requirement should be:
- **Atomic** — one testable behavior or capability per item
- **Clear** — unambiguous language
- **Categorized** — group related items under section headers

Present the breakdown:

```
## Parsed Requirements

### {Section 1}
R1. {Discrete requirement}
R2. {Discrete requirement}

### {Section 2}
R3. {Discrete requirement}
...
```

For large specs, show progress: "Analyzing section {N} of {total}: {section name}..."

## Step 3: Clarification Check

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-gap-analysis --step 3 --step-label "Clarification Check" 2>/dev/null || true
```

Review each requirement for ambiguity. If any are unclear:

- At **Level 3 (Full Auto)**: Proceed with reasonable assumptions. Flag each assumption in the gap analysis with `[ASSUMED: {assumption}]`
- At **Level 1 or 2**: Present the ambiguous items and ask for clarification before proceeding

```
⚠ {N} requirements need clarification:
  R{X}: "{requirement}" — {what's unclear}
  R{Y}: "{requirement}" — {what's unclear}

Discuss now or proceed with assumptions?
```

## Step 4: System Scan + Gap Classification (Team Mode)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-gap-analysis --step 4 --step-label "System Scan + Gap Classification (Team Mode)" 2>/dev/null || true
```

Automatically use agent teams to scan and classify requirements in parallel.

### Team Distribution Strategy

**One teammate per requirement, cap at 10.** Maximize parallelism:

- **1–2 requirements**: Solo mode (team overhead not worth it)
- **3–10 requirements**: One teammate per requirement (e.g., 4 requirements → 4 teammates)
- **11+ requirements**: Cap at 10 teammates, divide requirements evenly (e.g., 30 requirements → 10 teammates with 3 each)

### Classification Reference

| Status | Meaning | Action Needed |
|--------|---------|---------------|
| **Implemented** | Code exists and fully matches the requirement | None — verify with tests |
| **Partial** | Some code exists but incomplete | Finish implementation |
| **Incorrect** | Code exists but doesn't match the requirement | Fix implementation |
| **Not Implemented** | No code exists for this requirement | Build from scratch |

| Severity | Criteria |
|----------|----------|
| **Critical** | Incorrect implementation — existing code actively contradicts the requirement |
| **High** | Partial implementation — core functionality exists but key pieces are missing |
| **Medium** | Not implemented — required but no code exists yet |
| **Low** | Not implemented — nice-to-have or can be deferred |

### Team Execution

```
Create an agent team for gap analysis:

ALL TEAMMATES must read before starting:
  1. CLAUDE.md — project conventions
  2. docs/architecture.md — system structure
  3. docs/requirements.md — existing requirements
  4. .gsd-t/contracts/ — domain interfaces

Classification rules:
  - For each requirement, search the codebase for relevant code
  - Cite specific files and line numbers as evidence
  - Classify as: Implemented / Partial / Incorrect / Not Implemented
  - Assign severity: Critical / High / Medium / Low
  - Flag assumptions with [ASSUMED: {reason}]

Output format per requirement:
  | ID | Requirement | Status | Severity | Evidence |

Teammate assignments (one per requirement, cap at 10):
  For 3–10 requirements — one teammate each:
    - Teammate "analyst-1": Scan and classify R1
    - Teammate "analyst-2": Scan and classify R2
    - ...
    - Teammate "analyst-{N}": Scan and classify R{N}
  For 11+ requirements — divide evenly across 10 teammates:
    - Teammate "analyst-1": Scan and classify R1–R{batch}
    - Teammate "analyst-2": Scan and classify R{batch+1}–R{2*batch}
    - ...
    - Teammate "analyst-10": Scan and classify R{...}–R{end}

Lead responsibilities:
- Distribute requirement sections to teammates
- Collect classification results from each teammate
- Resolve conflicts (two teammates found different evidence for the same code)
- Merge all results into the unified gap analysis document
- Update .gsd-t/progress.md after completion
```

### Fallback: Solo Mode

If agent teams are not available or there are fewer than 3 requirements, run sequentially:
- Scan the codebase for each requirement
- Read source files, test files, config, schema, contracts, and docs
- Classify each requirement with evidence

---

# Client-deliverable mode (Steps 3a-6c) — only when `--sheet <url>` was given

Report mode skips this whole block and continues at Step 6.

## Step 3a: HARVEST the sources — the requirements do not exist yet, you are deriving them

**Do not ask the user for a requirements document. In this mode there usually isn't one.** The job is to harvest everything a tracker project holds and synthesize requirements from it. A run that stops to request a spec has misread the task — this exact stall happened on the FRC Predictive run.

Harvest, in this order, and report a count for each:

1. **The project's attachments** — NOT its description. On the proven run the description was empty and all three requirement documents were attached files. Pull `attachments?parent=<project_gid>`, then each attachment's `download_url`, and read them. A Statement of Work PDF was the single richest source: **1,431 lines, whose Exhibit B (~1,000 lines) was the real specification.**
2. **Every task** — name, notes, and status.
3. **Every subtask.** Parent tasks are usually coarse rollups; the real detail and the file citations live one level down. The proven run pulled **192 subtasks** because *"the rollups are too coarse."* One rollup alone carried 46 findings.
4. **Task comments.** One Bugs section — a ticket plus three pull-request comments — drove several rows by itself.
5. **Any spec documents in the repo**, if the user named one.

**An empty section list or a zero-task view is not an empty project.** Check attachments before concluding anything is missing.

**If a genuinely required source cannot be reached** — no credentials, a 403, an attachment that will not download — say exactly which one and stop. That is a blocked run. "The project has no tasks" is not, until attachments have been checked too.

**Tracker status is unreliable — never carry it through as truth.** On the proven run *"3 of the 6 tasks still show open, but their comments say implemented in PR #4386 with named commits."* Every status is re-decided against the code in Step 5a; a tracker status only ever becomes a flag that the tracker disagrees with reality.

## Step 3b: REPAIR the graph before you rely on it

The judgment in Step 5a is only as good as the index it queries.

1. `gsd-t graph status`.
2. **Missing → build it**: `gsd-t graph index` (allow up to 900s on a large repo). An absent index is repairable, never a reason to stop.
3. **Stale → re-index** the touched set.
4. **Broken → repair, then re-verify anything already judged against it.** The proven run found its own index producing *"unresolved call edges"* and had to re-check the Partial/Implemented calls that hinge on whether code is actually wired in.
5. **Cannot build it → HALT.** Do not answer structural questions by grep; grep matches text, and the question is about relationships.

Report which of these happened. A silent "the graph was fine" claim is not acceptable — say whether it was built, re-indexed, repaired, or already current.

## Step 4a: Strip everything that isn't buildable — HUMAN-CONFIRMED

**This step removes most of the input, and getting it wrong poisons every step after it.**

Sort every parsed requirement by one question: **would building it add or change code, or something stored?**

- **Yes → keep.** A setting the system reads, a rule it applies, a screen, an endpoint, a table.
- **No → drop.** Rollout policy, planning steps, trial design, training plans, decisions about how to run the project.

Worked examples from the proven run:

| Item | Verdict | Why |
|---|---|---|
| "Run in shadow beside real schedules" | **DROP** | An operational policy. Nobody writes code for it. |
| "Resolve each student's required events-per-week" | **KEEP** | A computation the system performs. |
| "Agree the scheduling priorities with stakeholders" | **DROP** | A planning step. Its *output* may become a rule; the step itself is not one. |
| "Store per-location override for duty limits" | **KEEP** | Stored data plus the code that reads it. |

A planning step whose *result* is a rule: drop the step, keep the rule if the rule is stated somewhere. If it isn't, the rule doesn't exist yet — say so under open questions rather than inventing it.

**Keep the dropped list with a one-line reason each**, and show the user the count kept vs dropped plus the full dropped list. **Wait for confirmation before continuing** — this is the one blocking pause in the flow, because a wrongly-dropped requirement is invisible in every later artifact.

## Step 4b: Roll up to features

Group the survivors into features a person would name (`Availability, Operating Hours and Blackouts`, not `SCH-046`).

- One feature = one row. Its individual requirements become **bullets inside that row's cell**, never rows of their own.
- Target shape, measured on the proven sheet: **33 rows carrying 241 bullets** — roughly 3-10 bullets per row.
- Assign each row a **domain** (column A) and the **user types** it serves (column B).

## Step 4c: Describe each feature

- **Column C** — the feature name in bold, then ONE sentence of purpose beneath it.
- **Column D** — the requirements as bullets, written as **instructions**: "Work out each student's required events-per-week." **Never** as statements of current fact: "Resolves each student's required events-per-week."

Present tense reads as a description of working code. On a row that turns out to be unbuilt, the row contradicts itself — this exact defect appeared in the proven run and had to be rewritten across all 32 rows.

Plain words in column D. No jargon a client would have to decode.

## Step 5a: Judge each feature against the code

Query the code graph for each feature's surface (`gsd-t graph`), read what it names, and decide:

- **Implemented** — every bullet is built.
- **Not Implemented** — none of it is.
- **Partial** — some is. **MUST be followed by `Not implemented:` and the specific bullets that are missing.** A bare "Partial" is not an answer anyone can act on.

Write the verdict to **column M**, and to **column N** what works today versus what does not.

## Step 5b: References and impacting debt

- **Column O** — where each claim came from: `Requirements doc (6 reqs) · Asana task · PR #4386`. Short clickable names, each token its own link. Never a wall of file paths.
- **Column P** — open Extreme/Critical findings that would hit this feature. **Judge by the code each finding cites, not by keyword match.**

**Where the findings come from, and why the tracker alone is not enough:** pull the hardening project's open items at **subtask level** — the parent tasks are rollups. Then **match each subtask back to `.gsd-t/techdebt.md`** for its real file citations. On the proven run the tracker notes were too thin to judge from, and 152 of 154 subtasks had to be resolved against the local register to get the file paths that make the mapping decidable. Of 154 open subtasks, 28 genuinely touched the feature set.

A feature with no findings is a real answer, not a miss — usually an unbuilt feature with no shipped code for a defect to land on. Say so rather than leaving the cell ambiguous.

## Step 6a: RED TEAM the sheet — NOT a review

Spawn adversarial checkers via the `Agent` tool, **blocking, no `name`** (see the blocking-subagent guard in `gsd-t-quick.md`). Each gets a fresh context and this framing:

> **This sheet contains false claims. Your job is to find them.** Report what is wrong and where. If you searched exhaustively and found nothing, say so plainly — a clean verdict must be earned.

Verdict per checker: `FAIL` (defects listed) or `GRUDGING-PASS` (searched, found none).

**Coverage is split by what one check costs:**

| Column | Claims (proven sheet) | Coverage | Why |
|---|---|---|---|
| C — purpose sentences | 33 | **Every one** | Reading a sentence is free. A 7-row sample here missed a 70% defect rate. |
| D — requirement bullets | 241 | **Every one** | Text against source text; no code read needed. |
| N — status notes | 32 | **Every one** | Cheap. |
| O — references | 76 | **Every one** | A link resolves or it doesn't. |
| Dropped list (Step 4a) | all | **Every one** | A wrongly-dropped requirement is invisible downstream — nothing else can catch it. |
| M — gap bullets | 108 | **Batch of 20** | Each asserts code is absent; disproving it costs a search. |
| P — debt mappings | 104 | **Batch of 20** | Each needs the finding read AND the feature's code read. |

**Widening rule:** if **3 or more** of a batch of 20 are wrong, that column goes to every-claim. The batch proved the column is unreliable; sampling further only hides the rest.

**A red-team finding can overturn the analysis, not just its wording.** On the proven run a checker reversed a substantive verdict: *"My reconciliation claimed aircraft ranking didn't exist. The code does build a real ordered list."* When a checker contradicts a status call, the checker's evidence wins unless you can cite code that refutes it — the checker read the code fresh, the original judgment did not.

**One checker does nothing but hunt cross-column contradictions** — a row whose column C asserts a capability in present tense while column M lists that same capability as the row's defining gap. No single-column checker can see this; it is the defect class that reached the client sheet in the proven run.

**All checkers returning clean is a FAILED check, not a clean sheet.** The proven run had one clean column out of six. An all-clean result means the framing was too gentle: re-run with sharper prompts. Do NOT report a clean sheet on the first all-pass.

## Step 6b: Fix, then RE-RED-TEAM the fixes

1. Correct the cells the red team named.
2. Hand the corrected cells to a **fresh** red team — a correction is an unverified claim, exactly like the original.
3. Clean → done. Still failing → correct once more, check once more.
4. **Still failing after the second cycle → HALT.** Report to the user what will not settle. Two rounds that cannot converge signals a wrong premise, not a third round.

## Step 6c: Write the sheet — leave the money alone

Write columns **A-D and M-P** using the service-account path documented in `commands/gsd-t-estimate.md` Step 5 (permanent SA `gsd-t-sheets-writer@ai-estimator-415612.iam.gserviceaccount.com`, self-signed JWT, Sheets v4 REST). A `403` on the read-probe means the sheet isn't shared — prompt the user to share it as Editor and re-probe.

**NEVER write columns E-L** (Phase, Web Portal, Backend/API, Days, MFactor Days, Total Days, LOW $, HIGH $). Those are `/gsd-t-estimate`'s to fill, and the sheet's own formulas compute the money from them.

Then end with:

```
## ▶ Next Up

**Estimate** — size the gaps and price them

`/gsd-t-estimate --sheet {url}`
```

---

## Step 6: Generate Gap Analysis Document

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-gap-analysis --step 6 --step-label "Generate Gap Analysis Document" 2>/dev/null || true
```

Create `.gsd-t/gap-analysis.md`:

```markdown
# Gap Analysis

## Project: {project name}
## Date: {date}
## Spec Source: {brief description of the provided spec}

## Requirements Breakdown

### {Section 1}
| ID | Requirement | Status | Severity | Evidence |
|----|-------------|--------|----------|----------|
| R1 | {requirement} | Implemented | — | `src/auth/login.ts:45` handles email login |
| R2 | {requirement} | Partial | High | `src/auth/login.ts` has login but no password reset flow |
| R3 | {requirement} | Incorrect | Critical | `src/auth/session.ts:20` uses localStorage instead of httpOnly cookies |
| R4 | {requirement} | Not Implemented | Medium | No code found for this feature |

### {Section 2}
| ID | Requirement | Status | Severity | Evidence |
|----|-------------|--------|----------|----------|
...

## Summary

| Status | Count | % |
|--------|-------|---|
| Implemented | {n} | {%} |
| Partial | {n} | {%} |
| Incorrect | {n} | {%} |
| Not Implemented | {n} | {%} |
| **Total** | **{n}** | **100%** |

## Assumptions Made
- R{X}: {assumption made during analysis}
- R{Y}: {assumption made during analysis}

## Recommended Actions

### Milestone: {recommended name}
- R{X}: {brief description} (Severity: {level})
- R{Y}: {brief description} (Severity: {level})

### Feature: {recommended name}
- R{X}: {brief description} (Severity: {level})

### Quick Fixes
- R{X}: {brief description} (Severity: {level})
```

## Step 7: Merge to Requirements (Optional)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-gap-analysis --step 7 --step-label "Merge to Requirements (Optional)" 2>/dev/null || true
```

After generating the gap analysis, offer:

```
Gap analysis complete: {implemented}/{total} requirements met ({%}%).
{critical} critical, {high} high, {medium} medium, {low} low severity gaps.

Merge parsed requirements into docs/requirements.md? (Y/N)
```

If yes, merge the discrete requirements into `docs/requirements.md`, marking each with its current status.

## Step 8: Present Promotion Options

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-gap-analysis --step 8 --step-label "Present Promotion Options" 2>/dev/null || true
```

Show the recommended groupings and offer promotion paths:

```
## Recommended Next Steps

1. {Milestone name} — {N} gaps ({critical} critical, {high} high)
   → /gsd-t-milestone "{name}"

2. {Feature name} — {N} gaps
   → /gsd-t-feature "{name}"

3. Quick fixes — {N} items
   → /gsd-t-quick "{description}"

Promote any of these now, or review the gap analysis first?
```

At **Level 3**: Present the recommendations and wait for user direction. Do NOT auto-promote — the user decides which gaps to act on.

## Step 9: Re-run Support

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-gap-analysis --step 9 --step-label "Re-run Support" 2>/dev/null || true
```

If `.gsd-t/gap-analysis.md` already exists from a previous run:

1. Read the previous gap analysis
2. After generating the new one, produce a diff summary:

```
## Changes Since Last Analysis ({previous date})

### Resolved (were gaps, now implemented)
- R{X}: {requirement}

### New Gaps (not in previous analysis)
- R{X}: {requirement} — {status}

### Changed Status
- R{X}: {status before} → {status now}

### Unchanged Gaps
- {N} gaps remain from previous analysis
```

## Document Ripple

After generating the gap analysis, update affected documentation:

### Always update:
1. **`.gsd-t/progress.md`** — Log the gap analysis in the Decision Log with date and summary stats

### Check if affected:
2. **`docs/requirements.md`** — If user approved merge in Step 7
3. **`.gsd-t/techdebt.md`** — If incorrect implementations were found, add them as tech debt items

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
