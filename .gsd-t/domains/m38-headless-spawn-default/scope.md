# Domain: m38-headless-spawn-default

## Responsibility

Promote `bin/headless-auto-spawn.cjs` from "emergency pivot when meter says stop" to the **default subagent spawn primitive**. Every command file that spawns subagents calls `autoSpawnHeadless()` instead of in-context Task spawn. Implement the `--watch` flag (replaces `--in-context`) for opt-in streaming visibility.

This is the load-bearing M38 change. Every other domain that touches command files inherits this spawn pattern.

## Owned Files/Directories

- `bin/headless-auto-spawn.cjs` — promote to default; rename internal "emergency" framing
- `bin/orchestrator.js` — update spawn primitives if used (audit pending; orchestrator itself is M40-deferred but its current spawn callsites must conform)
- `commands/gsd-t-execute.md` — replace in-context Task spawn with `autoSpawnHeadless()`; add `--watch` flag
- `commands/gsd-t-wave.md` — same
- `commands/gsd-t-integrate.md` — same
- `commands/gsd-t-quick.md` — outer command interactive; inner subagent spawns headless; `--watch` opt-in
- `commands/gsd-t-debug.md` — outer command interactive; inner fix-loop subagents headless; `--watch` opt-in
- `commands/gsd-t-scan.md` — dimension subagents headless
- `commands/gsd-t-verify.md` — verification subagents headless
- `.gsd-t/contracts/headless-default-contract.md` — NEW; formalizes default spawn path, `--watch` flag semantics, propagation rules
- Test files: `test/headless-auto-spawn.test.js` (extend), new `test/headless-default.test.js` (watch flag, propagation rules)

## NOT Owned (do not modify)

- `bin/token-budget.cjs` (Domain 2)
- `bin/runway-estimator.cjs`, `bin/token-telemetry.cjs` (Domain 2 — deletes them)
- `scripts/gsd-t-context-meter.js`, `scripts/context-meter/threshold.js` (Domain 2)
- `bin/gsd-t-unattended.cjs` event emission (Domain 3)
- `commands/gsd.md` (Domain 4)
- `commands/gsd-t-prompt.md`, `gsd-t-brainstorm.md`, `gsd-t-discuss.md` (Domain 4 deletes them)
- `commands/gsd-t-optimization-apply.md`, `gsd-t-optimization-reject.md`, `gsd-t-reflect.md`, `gsd-t-audit.md` (Domain 5 deletes them)
- `bin/qa-calibrator.js` (Domain 5 deletes it)
- All `docs/`, `README.md`, `GSD-T-README.md`, `CHANGELOG.md`, `templates/CLAUDE-global.md` (Domain 5)
