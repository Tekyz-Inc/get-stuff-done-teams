# Domain: halt-convergence

**Milestone:** M115 — Test-Plan-First Requirements Interrogation
**Wave:** 2 — concurrent with `plan-visibility`
**Acceptance carried:** A5 (the non-convergence halt)

## Purpose

The third silent-corruption surface: the work must STOP when it stops converging, rather
than filling the open rows with anything plausible.

Two loop caps, both named in the pseudocode:

- **Three question rounds without closure stops the work** (`[RULE] enumeration-loop-cap-three`).
  Hand back `blocked-needs-human` naming what never settled.
- **The same failure signature twice running stops the work** (`[RULE] same-symptom-twice-halts`).
  A repeated symptom means the belief behind the fix is wrong, not that the fix was
  insufficient — so re-examine the belief instead of trying a third fix.

This is a halt, never a fallback. On non-convergence it refuses to continue. The tempting
alternative — carry on and fill what is still open — is precisely how a missing requirement
ships as a passing test.

It shares no file with `plan-visibility`, which is what lets both run in the same wave.

## Files Owned

| File | New/Edit | What |
|---|---|---|
| `bin/gsd-t-testplan-halt.cjs` | new | The two loop caps, and the round→cycle mapping |
| `test/m115-a5-non-convergence-halt.test.js` | new | A5 proof |
| `.gsd-t/domains/halt-convergence/{scope,constraints,tasks}.md` | new | This domain's own files |

## Not Owned — read only, never write

- **`bin/gsd-t-loop-ledger.cjs` — READ-ONLY, strictly.** Consumed through its existing
  frozen exports (`appendCycle`, `readExitState`, `computeSignature`). Reused, never
  patched, never forked. Keeping it outside every owned file set is what makes it shared
  infrastructure rather than a copy that drifts.
- `.gsd-t/contracts/test-plan-first-contract.md` — read §4 (exit codes, envelope, module
  shape) and §6 (the read-only reuse rule). Owned by `enumerator-core`.
- `bin/gsd-t.js` and `templates/workflows/gsd-t-verify.workflow.js` — registration and gate
  wiring belong to `front-door-wiring`. This domain ships a tool runnable as
  `node bin/gsd-t-testplan-halt.cjs`; it does not register itself.
- `bin/gsd-t-testplan-lint.cjs` — owned by `deterministic-gates`.
- `templates/TestPlan-spec.md` — owned by `plan-visibility`.

## Deliverables

1. **`bin/gsd-t-testplan-halt.cjs`** — the round cap and the repeated-symptom cap, exiting
   per contract §4 (0 clean / 4 violations / 64 bad input), JSON envelope, never throws.
2. **The mapping layer** — turns an enumeration round into a ledger cycle so the existing
   ledger does the signature work unmodified.
3. **A halt message that names what never settled** — a bare "blocked" is not actionable.
   The open rows are named.
4. **`test/m115-a5-non-convergence-halt.test.js`** — proving both caps fire, and that a
   converging run is NOT halted.

## Interfaces Published

The verb `testplan-halt`, fixed in contract §5, which `front-door-wiring` registers in both
bin-tool registries and the CLI dispatch. The module exports plus a `require.main` CLI
entry, so it is testable before that registration exists.

## Definition of Done

- Three rounds without closure → HALT, naming every row that never settled.
- The same failure signature twice running → HALT, saying the belief behind the fix is what
  needs re-examining.
- A run that converges on round 2 → NOT halted. The caps must not fire early.
- The ledger file is byte-identical (`git diff bin/gsd-t-loop-ledger.cjs` empty).
- Exit codes and envelope match contract §4; the tool never throws.
