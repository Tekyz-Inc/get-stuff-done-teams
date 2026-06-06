# GSD-T: Partition Work into Domains

You are the lead agent. Decompose the current milestone into independent domains by invoking the generic upper-stage Workflow at `templates/workflows/gsd-t-phase.workflow.js` with `phase: "partition"`.

## What this command does

Runs the partition phase as a deterministic Workflow:

```
preflight → brief (kind=partition) → partition agent (opus, with phase protocol)
```

The agent decomposes the milestone into 2–5 file-disjoint domains, writes `.gsd-t/domains/{domain}/{scope,constraints,tasks}.md`, and records cross-domain contracts under `.gsd-t/contracts/`. The brief (M55-D2) is generated once so the agent doesn't re-walk the repo.

## Step 1: Read the current milestone state

Read `.gsd-t/progress.md` to determine the active milestone and its defined scope. If a scan exists and is stale (>10 commits or >14 days), the agent refreshes the relevant dimensions before partitioning.

## Step 2: Invoke the phase Workflow

Call the `Workflow` tool with:

```js
{
  // Resolve the ABSOLUTE path FIRST via Bash: `gsd-t workflow-path phase` (the
  // workflow ships in the installed @tekyzinc/gsd-t package, not this project — a
  // bare relative path only resolves from the GSD-T source repo). Use its stdout here:
  scriptPath: "<absolute path printed by `gsd-t workflow-path phase`>",
  args: {
    phase: "partition",
    milestone: "M{NN}",
    projectDir: ".",
    userInput: "$ARGUMENTS",
    // M82 Competition Mode (opt-in): if the user passed `--competition N` in
    // $ARGUMENTS (N in 2..5), set competition: N. N parallel Self-MoA producers
    // propose partitions; the OBJECTIVE oracle judge (file-disjointness scoring)
    // picks the most-parallelizable valid decomposition. Omit / set 1 = off.
    competition: 1
  }
}
```

**Competition Mode (`--competition N`).** Partition is the v1 beachhead for generate-and-judge: its judge is the file-disjointness oracle, so it is a calculator, not a biased critic. If the user invokes `/gsd-t-partition --competition 3`, parse N (clamped 2..5) and pass `competition: N`. The workflow fans out N candidate partitions, scores each on measured parallelism / wave-depth / boundary-cleanliness, and finalizes the winner. See `.gsd-t/contracts/competition-mode-contract.md`. Default off (single producer).

## Step 3: Interpret the result

The Workflow returns `{ status, artifacts, summary, decisions }` (plus `competition: { n, winner, ranked }` when Competition Mode ran).

- `status === "complete"`: domains scoped, contracts drafted. Auto-advance to `/gsd-t-plan`.
- `status === "partial" | "blocked"`: read `summary` for what's missing (e.g. ambiguous scope needing discussion).
- `status === "failed"`: preflight blocked or the agent could not decompose. Read `summary`.

## Document Ripple

The partition agent writes domain scope/constraints/tasks and a Decision Log entry. Verify `.gsd-t/contracts/m{NN}-integration-points.md` reflects the wave sequencing.

## Next Up

`/gsd-t-plan` — write per-domain `tasks.md` with file-disjointness validation. (`/gsd-t-discuss` first if the milestone is architecturally complex.)
