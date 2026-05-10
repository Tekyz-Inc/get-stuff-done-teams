# Tasks: m56-d4-quick-debug-wirein

## Summary
Wire `gsd-t preflight` + `gsd-t brief --kind {quick|debug}` + conditional `gsd-t verify-gate` into `commands/gsd-t-quick.md` and `commands/gsd-t-debug.md` Step 1.

## Tasks

### M56-D4-T1 — Verify quick + debug brief kinds already in KIND_REGISTRY
- **Touches**: read-only (`bin/gsd-t-context-brief.cjs`)
- **Contract refs**: `.gsd-t/contracts/context-brief-contract.md` v1.0.0
- **Deps**: NONE
- **Acceptance criteria**:
  - Confirm `quick` and `debug` kinds are present in `KIND_REGISTRY` (M55 D4 shipped them). If absent, escalate — D4 plan assumes they exist.

### M56-D4-T2 — Wire-in marker test (TDD red)
- **Touches**: `test/m56-d4-wire-in.test.js` (new)
- **Contract refs**: existing M55-D5 marker pattern, M56-D3 marker pattern
- **Deps**: Requires T1
- **Acceptance criteria**:
  - 6 unit tests written first, all RED:
    - 2 marker-presence tests (one per command): `<!-- M56-D4: preflight + brief + verify-gate wire-in -->` + matching close marker.
    - 2 preflight-invocation tests: marker block contains `gsd-t preflight --json` exit 4 hard-fail pattern.
    - 2 brief-invocation tests: marker block contains `gsd-t brief --kind quick` (in quick.md) or `gsd-t brief --kind debug` (in debug.md).

### M56-D4-T3 — Add wire-in blocks to 2 commands (TDD green)
- **Touches**: `commands/gsd-t-quick.md`, `commands/gsd-t-debug.md` (additive Step 1 blocks)
- **Contract refs**: `~/.claude/CLAUDE.md` Mandatory Preflight + Brief-First Worker Rule
- **Deps**: Requires T2
- **Acceptance criteria**:
  - Each command's Step 1 gains:
    ```
    <!-- M56-D4: preflight + brief + verify-gate wire-in -->
    gsd-t preflight --json > /tmp/gsd-t-preflight.json || exit 4
    SPAWN_ID="{quick|debug}-${ARG_OR_DEFAULT}-$(date -u +%Y%m%dT%H%M%SZ)"
    gsd-t brief --kind {quick|debug} --out ".gsd-t/briefs/${SPAWN_ID}.json" || true
    export BRIEF_PATH=".gsd-t/briefs/${SPAWN_ID}.json"
    <!-- /M56-D4: preflight + brief + verify-gate wire-in -->
    ```
  - Verify-gate is mentioned in the marker comment but invoked LATE (after the command body completes and produces code changes). Pattern in step-end:
    ```
    if git status --porcelain | grep -q .; then
      gsd-t verify-gate --json > /tmp/gsd-t-verify-gate.json || exit 4
    fi
    ```
  - All 6 T2 tests now GREEN.
  - Existing Step 1 content preserved verbatim.

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 1 (T1)
- Blocked tasks: 2 (T2 needs T1; T3 needs T2)
- Estimated context per task: T1 small (~5%), T2 small (~10%), T3 small (~15%)

## REQ Coverage
- REQ-M56-D4-01 → T3 (2 wire-ins) verified by T2 (marker + invocation tests)
