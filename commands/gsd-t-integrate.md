# GSD-T: Integrate — Wire Domains Together

> **⛔ Invoke the Workflow tool — do not hand-drive.** Your only job is to resolve the workflow path (`gsd-t workflow-path integrate`) and call the `Workflow` tool as the steps below instruct. Do NOT reconstruct the workflow stages in your own reasoning, spawn finder/worker subagents yourself, or fall back to a hand-driven run — that skips the deterministic stages and produces an incomplete result. The prose below describes what the Workflow does internally; it is background, not a to-do list for you.


You are the lead agent. Integrate cross-domain work by invoking the canonical Workflow script at `templates/workflows/gsd-t-integrate.workflow.js`.

## What this command does

Replaces the M40-era single-session integrate scaffolding with a deterministic Workflow that runs cross-domain wire-up between completed parallel domain workers:

```
preflight → brief → integrate agent (sees all domain results) → light verify-gate
```

Integrate runs AFTER parallel domain workers commit their work and BEFORE the full verify Workflow. It handles:

- Shared-file edits sequenced at integrate (per `.gsd-t/contracts/m{NN}-integration-points.md` "Cross-Domain File Contention Matrix")
- Cross-domain contract updates (e.g. integration-points.md status flips)
- Interleaved-touch resolution where two domains both modified the same file's separate regions

It does NOT re-do work that domain workers already did, and does NOT run the full orthogonal validation triad (that's `/gsd-t-verify`).

## Step 1: Read the current milestone state

Read `.gsd-t/progress.md` and verify all required domain workers have completed (status `complete` in their tasks.md). Read `.gsd-t/contracts/m{NN}-integration-points.md` for the shared-file matrix.

## Step 1.5: Graph Structural Slice — who-imports + blast-radius (M94-D10, ADDITIVE)

**[RULE] integrate-uses-graph-for-wiring-verification** — the integrate Workflow MUST use
the graph CLI `who-imports` and `blast-radius` verbs to verify cross-domain wiring (real
import/call edges across the seam), NOT LLM-reconstructed wiring by reading files.

**[RULE] verify-integrate-graph-additive-announced-not-hard-fail** — integrate's graph query
degrades ANNOUNCED on graph-unavailable, NOT as a hard-fail of the entire integrate run.

The integrate Workflow (`gsd-t-integrate.workflow.js`) queries `gsd-t graph who-imports` and
`gsd-t graph blast-radius` to verify that domains are actually wired (real edges exist across
the cross-domain seam). The integrate agent receives this slice and uses it to confirm
wiring — rather than reading files and inferring the connection.

**On `graph-unavailable`:** the integrate Workflow records a WARNING and CONTINUES its
cross-domain wire-up work:
```
⚠ graph unavailable — structural wiring-check skipped, fix it (gsd-t graph status)
```
It does NOT hard-fail integrate solely due to graph unavailability — integrate must always be
able to run. This is the bootstrap carve-out (PRE-MORTEM Finding 3). Integrate does NOT
silently grep for the structural wiring question.

Graph consumer manifest row (lint-exempt per verify+integrate carve-out): `commands/gsd-t-integrate.md | templates/workflows/gsd-t-integrate.workflow.js | reader | who-imports,blast-radius | LLM-read-reconstructed cross-domain wiring verification`

## Step 2: Invoke the integrate Workflow

Call the `Workflow` tool with:

```js
{
  // Resolve the ABSOLUTE path FIRST via Bash: `gsd-t workflow-path integrate` (the
  // workflow ships in the installed @tekyzinc/gsd-t package, not this project — a
  // bare relative path only resolves from the GSD-T source repo). Use its stdout here:
  scriptPath: "<absolute path printed by `gsd-t workflow-path integrate`>",
  args: {
    milestone: "M{NN}",
    domains: ["m{NN}-d1-...", "m{NN}-d2-..."],  // domains that just completed
    projectDir: "."
  }
}
```

## Step 3: Interpret the result

```js
{
  status: "complete" | "verify-failed" | "failed",
  integrate: {
    status: "green" | "warnings" | "failed",
    crossDomainEdits: [...],
    notes: string
  },
  verifyGate: { ... }
}
```

- `complete` (integrate green + verify-gate green) → auto-advance to `/gsd-t-verify` for the full triad.
- `verify-failed` (integrate green but verify-gate red) → invoke `gsd-t-debug`.
- `failed` (integrate failed) → cross-domain wire-up could not complete; read `integrate.notes` for the blocker.

## Document Ripple

The integrate agent updates:
- Cross-domain contracts in `.gsd-t/contracts/` (status flips, API surface changes)
- `.gsd-t/contracts/m{NN}-integration-points.md` — checkpoint flag (C1 done → C2 ready)
- `.gsd-t/progress.md` — integrate verdict + cross-domain edit summary

Each domain's own doc-ripple was handled by the domain worker (per execute Workflow's worker prompt).

## Next Up

`/gsd-t-verify` (full orthogonal triad on the integrated milestone state).
