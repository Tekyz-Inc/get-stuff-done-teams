# Constraints: m56-d3-upper-stage-command-wirein

## Must Read Before Using (no black-box treatment)
- `commands/gsd-t-execute.md` Step 1 `<!-- M55-D5: preflight + brief wire-in -->` block — D3 mirrors this pattern for the 5 upper-stage commands
- `commands/gsd-t-verify.md` Step 2 `<!-- M55-D5: verify-gate wire-in -->` block — same pattern reference
- `bin/gsd-t-context-brief.cjs` public CLI surface (`gsd-t brief --kind … --out …`) — to write correct invocations
- The "Brief-First Worker Rule" section in `~/.claude/CLAUDE.md` and project `CLAUDE.md` — canonical SPAWN_ID + BRIEF_PATH pattern

## Must Follow
- **Additive blocks only** — DO NOT delete or restructure existing Step 1 content. Wrap new content in `<!-- M56-D3: brief wire-in -->` markers (start + end).
- **Same canonical pattern as M55 D5** — `SPAWN_ID="{command-slug}-${MILESTONE_OR_DOMAIN}-$(date -u +%Y%m%dT%H%M%SZ)"`, `gsd-t brief --kind {kind} --out ".gsd-t/briefs/${SPAWN_ID}.json"`, `export BRIEF_PATH=".gsd-t/briefs/${SPAWN_ID}.json"`. Adapt only the `{kind}` and `${MILESTONE_OR_DOMAIN}` parts.
- **Marker tests are TDD** — write the test asserting marker presence FIRST, watch it fail, then add the wire-in block, watch it pass. Same pattern as M55 D5 wire-in tests.
- **One marker per command** — `<!-- M56-D3: brief wire-in -->` appears exactly once per file (start) and `<!-- /M56-D3: brief wire-in -->` exactly once per file (end), so blocks are deterministically locatable.

## Must Not
- Modify files outside owned scope
- Touch `commands/gsd-t-execute.md` or `commands/gsd-t-verify.md` (already wired)
- Touch `commands/gsd-t-quick.md` or `commands/gsd-t-debug.md` (D4)
- Restructure or shrink existing Step 1 content of the 5 upper-stage commands
- Land D3 before D2 publishes the 5 new kinds — wire-ins must reference resolvable kinds

## Dependencies
- Depends on: D2 (must complete first — wire-ins call `gsd-t brief --kind {partition|plan|discuss|impact|milestone}` and these kinds must exist)
- Depended on by: nothing (D3 leaf)
- Concurrent with: D1, D4, D5 (file-disjoint with all)
- **Wave ordering**: D3 lands AFTER D2 in the plan phase (Wave 2 if D2 in Wave 1)

## Test Baseline
- Pre-D3: 2487/2487 unit
- Post-D3 expected: 2487 + 10 new D3 tests (5 marker-presence + 5 canonical-invocation), all green
