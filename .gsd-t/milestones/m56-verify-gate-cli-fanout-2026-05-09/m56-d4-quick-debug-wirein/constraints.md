# Constraints: m56-d4-quick-debug-wirein

## Must Read Before Using (no black-box treatment)
- `commands/gsd-t-execute.md` Step 1 `<!-- M55-D5: preflight + brief wire-in -->` block — D4 mirrors this for `quick` and `debug`
- `commands/gsd-t-verify.md` Step 2 `<!-- M55-D5: verify-gate wire-in -->` block — D4 mirrors the verify-gate invocation when code changes
- `bin/cli-preflight.cjs` CLI surface (`gsd-t preflight --json`) — exit 0 ok / 4 fail
- `bin/gsd-t-context-brief.cjs::KIND_REGISTRY` — verify `quick` and `debug` kinds already exist (M55 D4 ships them); D4 is wire-in only, not kind-creation
- `bin/gsd-t-verify-gate.cjs` CLI surface (`gsd-t verify-gate --json`) — only invoked from `quick`/`debug` if the operation actually produced code changes (use `git status --porcelain` check)

## Must Follow
- **Additive blocks only** — same marker convention as D3 (`<!-- M56-D4: preflight + brief + verify-gate wire-in -->` start + matching end marker).
- **Preflight is hard-fail** — `quick` and `debug` Step 1 MUST run `gsd-t preflight --json > /tmp/gsd-t-preflight.json || exit 4` before any work. Same as `execute`.
- **Brief uses existing kinds** — `quick` brief kind = `quick`, `debug` brief kind = `debug` (already in registry from M55 D4).
- **Verify-gate is conditional** — only invoke `gsd-t verify-gate --json` if `git status --porcelain` reports tracked file changes after the command body. `quick` for read-only operations skips the gate.
- **TDD marker tests** — write tests first, watch them fail, then add wire-in.

## Must Not
- Modify files outside owned scope (just `commands/gsd-t-quick.md` + `commands/gsd-t-debug.md` + new test file)
- Touch `commands/gsd-t-execute.md` or `commands/gsd-t-verify.md` (already wired)
- Touch the 5 upper-stage commands (D3)
- Add new brief kinds (D2 owns kind creation; D4 verifies `quick`/`debug` already exist)

## Dependencies
- Depends on: M55 D4 having shipped `quick` and `debug` kinds (verified — they're in current `KIND_REGISTRY`)
- Depended on by: nothing (D4 leaf)
- Concurrent with: D1, D2, D3, D5 (file-disjoint with all)
- **Wave ordering**: D4 can land in Wave 1 (parallel with D1, D2, D5)

## Test Baseline
- Pre-D4: 2487/2487 unit
- Post-D4 expected: 2487 + 6 new D4 tests, all green
