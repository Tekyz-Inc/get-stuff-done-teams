# Tasks: m35-degradation-rip-out

## T1 — Rewrite `getDegradationActions()` and retune thresholds (Wave 1)
**File**: `bin/token-budget.js`
**Acceptance**:
- `getDegradationActions()` returns `{band: 'normal'|'warn'|'stop', pct: number, message: string}` only
- `downgrade` and `conserve` branches deleted
- `applyModelOverride()` helper deleted if exists
- `skipPhases` constants deleted
- Thresholds retuned: warn@70%, stop@85% (constants `WARN_THRESHOLD_PCT = 70`, `STOP_THRESHOLD_PCT = 85`)
- `getSessionStatus()` return shape's `threshold` field narrowed to `'normal'|'warn'|'stop'`
- `test/token-budget.test.js` updated — delete downgrade/conserve tests, add three-band tests with new thresholds
- Full test suite green

## T2 — Rewrite `token-budget-contract.md` to v3.0.0 (Wave 1)
**File**: `.gsd-t/contracts/token-budget-contract.md`
**Acceptance**:
- Version bumped to 3.0.0, Status: ACTIVE, Previous: 2.0.0 REPLACED
- Three-band model documented (`normal`, `warn`, `stop`)
- Explicit "Non-Goals" section: never returns model overrides, phase-skip lists, or anything weakening quality gates
- Migration notes section: what v2.0.0 callers must change (collapse `downgrade`→`warn`, `conserve`→`stop`)
- API surface: `getSessionStatus()` return shape documented with narrowed threshold union
- Consumers list updated to reference M35 consumers
- Clean break (Option X) explicitly called out

## T3 — Sweep command files: replace Token Budget Check blocks (Wave 2)
**Files**:
- `commands/gsd-t-execute.md`
- `commands/gsd-t-wave.md`
- `commands/gsd-t-quick.md`
- `commands/gsd-t-integrate.md`
- `commands/gsd-t-debug.md`
- `commands/gsd-t-doc-ripple.md`
**Acceptance**:
- Every "Token Budget Check" block replaced with three-band handler
- No references to `downgrade`, `conserve`, `modelOverride`, `skipPhases` in any command file
- `grep -r "downgrade\|conserve\|modelOverride\|skipPhases" commands/` returns zero hits (outside historical prose — M31 references in comments are not allowed; M31 references in narrative docs are allowed)
- All 6 files still valid markdown and spawn subagents correctly

## T4 — PRD §3.7 rewrite + template sweep (Wave 2)
**Files**:
- `docs/prd-harness-evolution.md` §3.7
- `templates/CLAUDE-global.md`
- `templates/CLAUDE-project.md`
**Acceptance**:
- PRD §3.7 title changed to "Pre-Flight Runway + Pause-Resume (replaces Token-Aware Orchestration)"
- PRD narrative explicitly calls out that the M31 framing was wrong and M35 eliminates silent degradation
- Both templates' "Token-Aware Orchestration" section renamed and rewritten; no `downgrade`/`conserve` band references
- `grep -r "downgrade\|conserve\|modelOverride\|skipPhases" docs/ templates/` returns zero hits outside historical prose (CHANGELOG entries for v2.31–v2.75 and M31 archive are allowed)
