# Domain: m56-d3-upper-stage-command-wirein

## Responsibility
Thread `$BRIEF_PATH` into the upper-stage command files via the M55 D4 `gsd-t brief --kind … --out …` pattern. Each of the 5 commands gets an additive Step 1 block that generates a brief and exports `BRIEF_PATH` for downstream worker prompts.

## Files Owned
- `commands/gsd-t-partition.md` — additive Step 1 brief wire-in (`<!-- M56-D3: brief wire-in -->` marker)
- `commands/gsd-t-plan.md` — additive Step 1 brief wire-in
- `commands/gsd-t-discuss.md` — additive Step 1 brief wire-in
- `commands/gsd-t-impact.md` — additive Step 1 brief wire-in
- `commands/gsd-t-milestone.md` — additive Step 1 brief wire-in
- `test/m56-d3-wire-in.test.js` — new marker-comment + canonical-invocation assertion tests (5 commands × 2 assertions = ~10 tests)

## NOT Owned (do not modify)
- `commands/gsd-t-quick.md`, `commands/gsd-t-debug.md` — D4 owns
- `commands/gsd-t-execute.md`, `commands/gsd-t-verify.md` — already wired in M55 D5; D3 stays out
- `bin/gsd-t-context-brief.cjs` — D2 owns
- `bin/gsd-t-verify-gate.cjs` — D1 owns
- All other `commands/*.md` files

## Files Touched (audit trail)
- `commands/gsd-t-partition.md` (additive Step 1 block)
- `commands/gsd-t-plan.md` (additive Step 1 block)
- `commands/gsd-t-discuss.md` (additive Step 1 block)
- `commands/gsd-t-impact.md` (additive Step 1 block)
- `commands/gsd-t-milestone.md` (additive Step 1 block)
- `test/m56-d3-wire-in.test.js` (new)
