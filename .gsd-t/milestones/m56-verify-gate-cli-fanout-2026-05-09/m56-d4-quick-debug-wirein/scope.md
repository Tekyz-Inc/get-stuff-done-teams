# Domain: m56-d4-quick-debug-wirein

## Responsibility
Wire `gsd-t preflight` + `gsd-t brief --kind {quick|debug}` + `gsd-t verify-gate` (when code changes occur) into `commands/gsd-t-quick.md` and `commands/gsd-t-debug.md`. Closes the "every command runs preflight" invariant added in M55.

## Files Owned
- `commands/gsd-t-quick.md` — additive Step 1 wire-in (`<!-- M56-D4: preflight + brief + verify-gate wire-in -->` marker)
- `commands/gsd-t-debug.md` — additive Step 1 wire-in (same marker pattern)
- `test/m56-d4-wire-in.test.js` — new marker-comment + canonical-invocation assertion tests (2 commands × 3 assertions = ~6 tests)

## NOT Owned (do not modify)
- The 5 upper-stage commands — D3 owns
- `commands/gsd-t-execute.md`, `commands/gsd-t-verify.md` — already wired in M55 D5
- `bin/gsd-t-context-brief.cjs` — D2 owns; `quick` and `debug` kinds already in M55 D4 KIND_REGISTRY (verified)
- `bin/cli-preflight.cjs`, `bin/gsd-t-verify-gate.cjs` — read-only USE
- All other `commands/*.md`

## Files Touched (audit trail)
- `commands/gsd-t-quick.md` (additive Step 1 block)
- `commands/gsd-t-debug.md` (additive Step 1 block)
- `test/m56-d4-wire-in.test.js` (new)
