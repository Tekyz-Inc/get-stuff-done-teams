# Constraints: front-door-wiring

## Both registries, or the tool ships DEAD

A new `bin/*.cjs` wired into a caller but missing from `PROJECT_BIN_TOOLS` /
`GLOBAL_BIN_TOOLS` is dead in every project. This has happened **four times** in this repo's
history, and the "copied N tool(s)" report hides it — it reports success for the tools it
did copy.

So for each of `gsd-t-testplan-lint.cjs` and `gsd-t-testplan-halt.cjs`:

- Add to `GLOBAL_BIN_TOOLS`.
- Add to `PROJECT_BIN_TOOLS`.
- Add the CLI dispatch case.
- **Assert all of it mechanically** in `test/m115-a8-front-door-test-plan.test.js`. A
  checklist item is what failed four times; a test is what does not.

Do not trust the copy report. Verify the file arrives in a real project.

## Test the front door, not the internals

A8 exercises the LITERAL `/gsd-t-test-plan` command through the router, exactly as a user
types it. Verified this session: `grep test-plan commands/gsd.md` and
`grep test-plan bin/gsd-t.js` both return nothing today. A command file present on disk with
no router case is unreachable — the feature ships dead while every unit test passes.

The test asserts reachability, not merely presence. A file-exists assertion would pass on
exactly the broken state that exists right now.

## The command is a thin invoker

Follow this repo's convention: pure markdown, no frontmatter, accepts `$ARGUMENTS`,
step-numbered, calls `Workflow({scriptPath, args})` with `scriptPath` resolved to an
ABSOLUTE path at invoke time via `gsd-t workflow-path <name>`. A bare relative path silently
breaks `Workflow()` outside the source repo.

Include a Document Ripple section listing the files the workflow expects to be updated.

The command POINTS at the protocols and mold other domains own; it does not restate them.
A second copy of a rule is a second definition that drifts.

## Never inline a protocol body

The enumerator protocol, the evidence classifier and the mold are read via Read at spawn
time. The sandboxed workflow orchestrator has no `fs`, so it passes a Read directive, not the
protocol text. Inlining a protocol body into a workflow script is explicitly banned in this
repo.

## The verify gate is FAIL-blocking

Wire `testplan-lint` following the existing guard-map gate's pattern in
`templates/workflows/gsd-t-verify.workflow.js`. A malformed plan FAILS verify. It does not
warn and proceed.

Where no test plan exists, the gate SKIPS with a named reason — a skip that says why is
honest; a silent pass is not. A skip must be distinguishable from a check that ran clean.

## Workflow sandbox rules

If any workflow file is edited: NEVER reintroduce `require`, `fs`, `path`, `child_process`
or `process` — the sandbox forbids them, and `args` arrives as a JSON STRING that must be
`JSON.parse`d. CLI calls go through the inline `runCli` helper wrapped in an `agent()`'s
Bash. Violating this throws `ReferenceError` on first eval and silently breaks the workflow.
`node --check` will NOT catch it — the workflow must be RUN.

## A4: one round, never a drip

Every open row goes out in a SINGLE round of questions. Not one question, then another as
each answer arrives. The drip is what makes an interrogation feel endless and is what
`[RULE] one-question-round` bans. The test proves a drip is detectably wrong, not just that
batching is possible.

## The full four-file doc ripple, in the same pass

The project Pre-Commit Gate requires, for a command added: `GSD-T-README.md`, the `README.md`
commands table, `templates/CLAUDE-global.md`, and `commands/gsd-t-help.md`. All four in this
commit — never batched for later. Do not present partial work and ask whether to also update
the rest.

Also bump `package.json` and update any command-counting logic in `bin/gsd-t.js`.

## Register, do not implement

Do not edit the bodies of the tools other domains own. If a tool's shipped verb name differs
from contract §5, that is a message to the owning domain — not a local rename here.
Registering a name that does not exist ships the same dead tool by a different route.

## No fallback

Nothing here continues past a failure. A missing tool, an unresolvable workflow path, or a
malformed plan HALTS loudly. A router case that silently does nothing when its workflow is
missing is the exact dead-feature shape A8 exists to catch.
