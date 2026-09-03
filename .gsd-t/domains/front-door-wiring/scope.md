# Domain: front-door-wiring

**Milestone:** M115 — Test-Plan-First Requirements Interrogation
**Wave:** 3 — concurrent with `deterministic-gates`
**Acceptance carried:** A8 (the front-door test) + A4 (one-round question batching)

## Purpose

Quarantines EVERY shared-file write in the milestone into a single owner. That is the
structural move that makes the other four domains disjoint: rather than negotiating who
edits `bin/gsd-t.js`, exactly one domain does, and the collision is designed out.

It owns the command file itself, the smart-router case, both bin-tool registries plus the
dispatch case in the CLI entry point, the verify workflow's FAIL-blocking gate wiring, and
all four reference docs the project Pre-Commit Gate requires on a command change.

**A8 is its headline** — the front-door test of the literal `/gsd-t-test-plan` command.
Verified as a real risk this session: the router currently has no test-plan case and the CLI
has no test-plan reference. That is exactly the shape of a feature that ships DEAD — present
on disk, unreachable in practice.

**A4** is one-round batching: every open row goes out in a single round of questions rather
than a drip (`[RULE] one-question-round`).

Runs last because it wires up components that already exist and have already passed their
own tests.

## Files Owned

| File | New/Edit | What |
|---|---|---|
| `commands/gsd-t-test-plan.md` | new | The command — before-mode and `--after` mode; carries A4 |
| `commands/gsd.md` | edit | The smart-router case |
| `bin/gsd-t.js` | edit | Dispatch case + `GLOBAL_BIN_TOOLS` + `PROJECT_BIN_TOOLS` |
| `templates/workflows/gsd-t-verify.workflow.js` | edit | FAIL-blocking gate wiring |
| `commands/gsd-t-help.md` | edit | Doc ripple |
| `GSD-T-README.md` | edit | Doc ripple |
| `README.md` | edit | Doc ripple — commands table |
| `templates/CLAUDE-global.md` | edit | Doc ripple |
| `test/m115-a8-front-door-test-plan.test.js` | new | A8 proof + registry assertions |
| `.gsd-t/domains/front-door-wiring/{scope,constraints,tasks}.md` | new | This domain's own files |

**No other domain writes any file in this list.** That is the quarantine.

## Not Owned — read only, never write

- `bin/gsd-t-testplan-lint.cjs` (`deterministic-gates`), `bin/gsd-t-testplan-halt.cjs`
  (`halt-convergence`), `bin/gsd-t-traceability-gate.cjs` (`deterministic-gates`) — register
  and invoke them by their contract §5 verb names; never edit their bodies.
- `templates/TestPlan-spec.md`, `templates/prompts/test-plan-evidence-classifier.md`
  (`plan-visibility`), `templates/prompts/test-plan-enumerator-subagent.md`
  (`enumerator-core`) — the command POINTS at these; it does not author them.
- `.gsd-t/contracts/test-plan-first-contract.md` — read §5 for the verb names.
- `test/m83-traceability-gate.test.js`, `test/m87-*.test.js` — never edit.

## Deliverables

1. **`commands/gsd-t-test-plan.md`** — a thin invoker in this repo's command-file
   convention. Before-mode (enumerate from the rules, no code yet) and `--after` mode
   (enumerate the same way against built code, classify failures by evidence).
2. **A4 one-round batching** — every open row goes out in ONE round. Never a drip.
3. **Reachability** — the router case, the CLI dispatch, and BOTH bin-tool registries.
4. **Verify wiring** — `testplan-lint` as a FAIL-blocking gate, following the existing
   guard-map gate's wiring pattern.
5. **The four-file doc ripple** the project Pre-Commit Gate mandates for a new command.
6. **`test/m115-a8-front-door-test-plan.test.js`** — the literal command is reachable, and
   every new bin tool appears in BOTH registries.

## Definition of Done

- The literal `/gsd-t-test-plan` resolves through the router and reaches its workflow.
- `gsd-t testplan-lint` and `gsd-t testplan-halt` dispatch from the CLI.
- Both new tools appear in `GLOBAL_BIN_TOOLS` AND `PROJECT_BIN_TOOLS` — asserted
  mechanically, because omission ships them dead in every project.
- The verify workflow fails on a malformed plan.
- All four reference docs updated in the same pass.
- Questions batch into one round; the test proves a drip is detectably wrong.
