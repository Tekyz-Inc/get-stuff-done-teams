# Tasks: m56-d3-upper-stage-command-wirein

## Summary
Thread `$BRIEF_PATH` into 5 upper-stage command files (`partition`, `plan`, `discuss`, `impact`, `milestone`) via the M55 D5 wire-in pattern. TDD via marker-presence tests.

## Tasks

### M56-D3-T1 — Wire-in marker test (TDD red)
- **Touches**: `test/m56-d3-wire-in.test.js` (new)
- **Contract refs**: existing M55-D5 marker pattern in `commands/gsd-t-execute.md` Step 1
- **Deps**: BLOCKED by D2 T2 (D2's 5 new brief kinds must be live in `KIND_REGISTRY` before D3 wires invocations that call them)
- **Acceptance criteria**:
  - 10 unit tests written first, all RED:
    - 5 marker-presence tests (one per command): `commands/gsd-t-{partition,plan,discuss,impact,milestone}.md` contains `<!-- M56-D3: brief wire-in -->` and matching close marker.
    - 5 canonical-invocation tests: each command's marker block contains `gsd-t brief --kind {kind}` matching its kind name.

### M56-D3-T2 — Add wire-in blocks to 5 commands (TDD green)
- **Touches**: `commands/gsd-t-partition.md`, `commands/gsd-t-plan.md`, `commands/gsd-t-discuss.md`, `commands/gsd-t-impact.md`, `commands/gsd-t-milestone.md` (additive Step 1 blocks each)
- **Contract refs**: `~/.claude/CLAUDE.md` Brief-First Worker Rule
- **Deps**: Requires T1 (test exists)
- **Acceptance criteria**:
  - Each command file gains an additive block in Step 1:
    ```
    <!-- M56-D3: brief wire-in -->
    SPAWN_ID="{command-slug}-${MILESTONE_OR_DOMAIN:-default}-$(date -u +%Y%m%dT%H%M%SZ)"
    gsd-t brief --kind {kind} --out ".gsd-t/briefs/${SPAWN_ID}.json" || true
    export BRIEF_PATH=".gsd-t/briefs/${SPAWN_ID}.json"
    <!-- /M56-D3: brief wire-in -->
    ```
  - `{command-slug}` and `{kind}` substituted per file (e.g. `partition` → kind=partition, `plan` → kind=plan, etc.).
  - All 10 T1 tests now GREEN.
  - Existing Step 1 content of each file is preserved verbatim — block is additive only.

## Execution Estimate
- Total tasks: 2
- Independent tasks: 0 (both blocked by D2 T2 cross-domain dep)
- Blocked tasks: 2
- Estimated context per task: T1 small (~10%), T2 medium (~25% — 5 files to edit, each surgical)

## REQ Coverage
- REQ-M56-D3-01 → T2 (5 wire-ins) verified by T1 (marker tests)
