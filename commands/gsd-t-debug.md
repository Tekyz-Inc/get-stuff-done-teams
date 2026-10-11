# GSD-T: Debug — Systematic Debugging with Contract Awareness

> **⛔ Invoke the Workflow tool — do not hand-drive.** Your only job is to resolve the workflow path (`gsd-t workflow-path debug`) and call the `Workflow` tool as the steps below instruct. Do NOT reconstruct the workflow stages in your own reasoning, spawn finder/worker subagents yourself, or fall back to a hand-driven run — that skips the deterministic stages and produces an incomplete result. The prose below describes what the Workflow does internally; it is background, not a to-do list for you.


You are the lead agent. Debug a failing test or runtime error by invoking the canonical Workflow script at `templates/workflows/gsd-t-debug.workflow.js`.

## What this command does

Replaces the M40-era debug-orchestrator scaffolding with a deterministic 2-cycle Workflow per CLAUDE.md Prime Rule ("up to 2 fix attempts before delegating"):

```
graph localize → Cycle 1 (diagnose → hypothesis → fix → test → report)
                 → Cycle 2 (only if Cycle 1 didn't resolve; sees Cycle 1's failed hypothesis)
                 → exit "needs-human" if both cycles exhausted
```

## Step 1: Read the current milestone state

Read `.gsd-t/progress.md`. Note any failing tests or runtime errors in the Decision Log.

## Step 2: Invoke the debug Workflow

Call the `Workflow` tool with:

```js
{
  // Resolve the ABSOLUTE path FIRST via Bash: `gsd-t workflow-path debug` (the
  // workflow ships in the installed @tekyzinc/gsd-t package, not this project — a
  // bare relative path only resolves from the GSD-T source repo). Use its stdout here:
  scriptPath: "<absolute path printed by `gsd-t workflow-path debug`>",
  args: {
    symptom: "describe the failing test or runtime error in one sentence",
    projectDir: ".",
  }
}
```

The Workflow runs up to 2 cycles. Cycle 2 receives Cycle 1's failed hypothesis to prevent re-trying the same approach.

## Step 3: Interpret the result

```js
{
  status: "complete" | "needs-human" | "blocked-needs-human",
  cyclesUsed: 1 | 2,
  finalResult: {
    resolved: boolean,
    rootCause: string,
    filesEdited: [...],
    testRunResult: { pass, fail },
    nextStepsIfNotResolved: string
  }
}
```

- `complete` → report the root cause, the files edited, and the test result.
- `blocked-needs-human` → the graph is broken; show the halt message (fix with `gsd-t graph status`).
- `needs-human` → present root-cause hypothesis + nextStepsIfNotResolved to the user. Do NOT spawn a third cycle; that's the Prime Rule.

## Graph-Enhanced Debugging — READER + WRITER Pattern (M94-D11)

Debug applies the **WRITER pattern** from `graph-consumer-wiring-contract.md`:

**READER half (localization):** Before the fix agent reasons over code, the debug workflow queries `blast-radius` and `who-calls` to localize the bug's call chain — which callers reach the failing function, what is downstream of the changed symbol. This replaces grep-reconstructed call-chain discovery. The structural slice is injected into the debug agent's context.

**WRITER half (re-index after fix):** After the fix lands, the workflow triggers a re-index of the edited files so downstream graph queries see fresh edges (`graph-freshness-contract.md` D4 surface — `freshness_check_on_query` over the touched set). `[RULE] debug-reader-and-writer-both`.

**BUILD-THEN-QUERY on graph-absent:** On `{ok:false, reason:"graph-unavailable"}` the debug workflow **builds the index right then** (`gsd-t graph index`) and re-runs the localization query. It does NOT fall back to grep for the structural question, and it does NOT skip the query. Only a **failed build** halts the graph-query step, with the build's own stderr surfaced. The existing debug-loop logic (2-cycle cap) is NOT disrupted — the graph query is additive, injected before the fix agent receives context. `[RULE] graph-absent-builds-not-degrades`.

## Document Ripple

- `.gsd-t/progress.md` — Decision Log entry per cycle with hypothesis + resolution

## Next Up

Re-run the failing test on resolution, OR human review on `needs-human`.
