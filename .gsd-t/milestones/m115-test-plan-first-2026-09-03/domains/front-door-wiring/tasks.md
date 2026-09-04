# Tasks: front-door-wiring

**Wave:** 3 — concurrent with `deterministic-gates`. Starts when Wave 2 is green.

---

### M115-D5-T1 — The command file

**Touches**: `commands/gsd-t-test-plan.md`
**Depends on**: M115-D2-T1 (mold), M115-D2-T4 (classifier), M115-D1-T1 (enumerator protocol)
**Files**: `commands/gsd-t-test-plan.md`
**Test**: `test/m115-a8-front-door-test-plan.test.js`

Write the command in this repo's convention: pure markdown, no frontmatter, accepts
`$ARGUMENTS`, step-numbered, a thin `Workflow({scriptPath, args})` invoker with `scriptPath`
resolved to an absolute path via `gsd-t workflow-path <name>` at invoke time.

**Before-mode** (default): read everything already held — requirements, architecture,
contracts, standing rules, any code that exists — enumerate the case space with the E1-E8
protocol, fill each row from named evidence, group self-answered rows, batch open rows into
one question round, fold answers into `docs/requirements.md`, re-enumerate to confirm
closure, gate the plan for shape, then present for sign-off. Only after sign-off are tests
generated from the rows.

**`--after` mode**: the same enumeration against already-built code, tests run against it,
each failure classified by cited evidence as code-bug or wrong-requirement, wider refactors
spilled to `.gsd-t/techdebt.md` rather than done now.

Point at the protocols and mold; never restate them. Include the Document Ripple section.

**Acceptance criteria**: Both modes described; `scriptPath` resolved absolutely at invoke
time; no protocol body inlined; Document Ripple section present; matches the shape of
neighbouring command files.

---

### M115-D5-T2 — A4: one-round question batching

**Touches**: `commands/gsd-t-test-plan.md`
**Depends on**: M115-D5-T1
**Files**: `commands/gsd-t-test-plan.md`
**Test**: `test/m115-a8-front-door-test-plan.test.js`

Specify that every open row goes out in ONE round — collected from `## Open gaps`, asked
once, answers folded in together, then re-enumerated. Never one question at a time as each
answer arrives.

State the interaction with the round cap: three rounds without closure HALTS
(`halt-convergence` owns the enforcement; the command describes the flow).

**Acceptance criteria**: One-round batching stated explicitly; the drip is named as banned;
the halt-at-three interaction is described and points at the halt tool.

---

### M115-D5-T3 — Reachability: router case, CLI dispatch, both registries

**Touches**: `commands/gsd.md`, `bin/gsd-t.js`
**Depends on**: M115-D5-T1, M115-D4-T5 (verb names confirmed)
**Files**: `commands/gsd.md`, `bin/gsd-t.js`
**Test**: `test/m115-a8-front-door-test-plan.test.js`

Verified today: neither file mentions test-plan. Three wirings:

1. **`commands/gsd.md`** — the smart-router case routing test-plan intent to the command.
2. **`bin/gsd-t.js`** — dispatch cases for `testplan-lint` and `testplan-halt`.
3. **`bin/gsd-t.js`** — both tools in `GLOBAL_BIN_TOOLS` **and** `PROJECT_BIN_TOOLS`.

The registries are where this repo has shipped a tool dead four times. Both lists, both
tools. Also update any command-counting logic and bump `package.json`.

**Acceptance criteria**: `grep test-plan commands/gsd.md` and `grep testplan bin/gsd-t.js`
both return real wiring; each tool appears in both registries; the command count matches
`ls commands/`.

---

### M115-D5-T4 — Verify-workflow gate wiring

**Touches**: `templates/workflows/gsd-t-verify.workflow.js`
**Depends on**: M115-D4-T1 (`testplan-lint` exists)
**Files**: `templates/workflows/gsd-t-verify.workflow.js`
**Test**: `test/m115-a8-front-door-test-plan.test.js`

Wire `testplan-lint` as a FAIL-blocking gate, following the existing guard-map gate's
pattern — discovery, then fire, then a named skip when there is nothing to check.

A malformed plan FAILS verify. Where no plan exists, SKIP with a named reason,
distinguishable from a clean run.

**Copy the guard-map gate's discovery/fire/named-skip SHAPE, but NOT its error handling.**
That gate's discovery agent ends in `.catch(... skips: [{ reason: "discovery-error" }] ...)`,
which turns a *broken discovery* into a *skip* — so a real malformed plan passes verify
whenever discovery hiccups. This repo has already been bitten by exactly this class once
(a deterministic gate routed through an LLM returned fenced JSON, and the consumer degraded
instead of halting). Here, **discovery failing is a HALT, not a skip**: an unreachable or
unparseable discovery result FAILS verify with a named reason. Three outcomes, kept
distinct and never collapsed:

- Plans found, all clean → PASS.
- Plans found, any malformed → FAIL.
- **No plan exists** → SKIP with the named reason `no-test-plan`.
- **Discovery itself failed** → FAIL with the named reason `testplan-discovery-error`.
  Never a skip. A gate that cannot check must halt, never pass.

Prefer deterministic discovery (a glob through `runCli`) over an LLM discovery agent; if an
agent is used, its failure still HALTS.

Sandbox rules: no `require`/`fs`/`path`/`child_process`/`process`; `args` is a JSON STRING;
CLI calls go through the inline `runCli` helper inside an `agent()`'s Bash. `node --check`
does not catch a violation — RUN the workflow to completion.

**Acceptance criteria**: Gate fires and FAILS on a malformed plan; skips with the named
reason `no-test-plan` when no plan exists; **a forced discovery failure FAILS verify with
`testplan-discovery-error` and is never reported as a skip or a pass**; the four outcomes
are mutually distinguishable from the returned status; the workflow runs to completion in
the real sandbox; no forbidden global reintroduced.

**Required test (pre-mortem finding PM-1)**: in
`test/m115-a8-front-door-test-plan.test.js`, force the discovery step to fail and assert the
workflow's returned status is a FAIL carrying `testplan-discovery-error` — the test must go
red if that arm is changed to a skip.

---

### M115-D5-T5 — A8: the front-door test

**Touches**: `test/m115-a8-front-door-test-plan.test.js`
**Depends on**: M115-D5-T3, M115-D5-T4
**Files**: `test/m115-a8-front-door-test-plan.test.js`
**Test**: `test/m115-a8-front-door-test-plan.test.js`

This domain's headline (the milestone's HEADLINE is `M115-D1-T3`, the A1 blind replay).
Prove the feature is REACHABLE, not merely present:

- The literal `/gsd-t-test-plan` resolves through the router to the command file.
- The command's `scriptPath` resolves to a real workflow file.
- `gsd-t testplan-lint --help` and `gsd-t testplan-halt --help` dispatch through the CLI
  entry point (not by running the `.cjs` directly — that path already works and proves
  nothing about the front door).
- Each new tool appears in `GLOBAL_BIN_TOOLS` **and** `PROJECT_BIN_TOOLS`, asserted by
  parsing the arrays structurally — never by substring.
- The whole file FAILS against today's state (no router case, no dispatch, no registry
  entries). Confirm that by running it before the wiring lands.

**Acceptance criteria**: Every assertion above; the registry check parses arrays as arrays;
the test is confirmed red against the pre-wiring state, which is what proves it tests the
front door rather than the disk.

---

### M115-D5-T6 — The four-file doc ripple

**Touches**: `commands/gsd-t-help.md`, `GSD-T-README.md`, `README.md`, `templates/CLAUDE-global.md`
**Depends on**: M115-D5-T5
**Files**: `commands/gsd-t-help.md`, `GSD-T-README.md`, `README.md`, `templates/CLAUDE-global.md`
**Test**: `test/m115-a8-front-door-test-plan.test.js`

The project Pre-Commit Gate mandates all four on a command change. Same pass, no batching:

- `commands/gsd-t-help.md` — the command list.
- `GSD-T-README.md` — the command reference.
- `README.md` — the commands table.
- `templates/CLAUDE-global.md` — the global template's command reference.

Add the successor mapping for the Next Command Hint: `test-plan` → `plan` (also available:
`execute` in `--after` mode).

Also log the milestone's Decision Log entry in `.gsd-t/progress.md` with a live-clock
timestamp, and record the two `⚠ Divergence` flags as resolved in
`.gsd-t/pseudocode/PseudoCode-TestPlanFirst.md` if the built behavior differs from what was
signed off.

**Acceptance criteria**: All four files updated in one pass; the command appears in each;
the successor mapping is added; `.gsd-t/progress.md` carries a live-clock Decision Log
entry. No "want me to also update X?" — just update X.
