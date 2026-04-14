# Tasks: m35-optimization-backlog

## T1 — Implement `bin/token-optimizer.js` + detection rules (Wave 4)
**File**: `bin/token-optimizer.js`, `test/token-optimizer.test.js`
**Acceptance**:
- Exports `detectRecommendations({projectDir, lookbackMilestones: 3})` → array of recommendation objects
- Detection rules (declarative):
  - Phases on opus with ≥90% success AND low fix-cycle count → demote candidate
  - Phases on sonnet with ≥30% fix-cycle count → escalate candidate
  - Runway estimator projected_end_pct - actual_end_pct > 15% → over-estimate tune candidate
  - Per-phase p95 consumption > 2x median → investigate candidate
- Exports `appendToBacklog(recommendations, projectDir)` that writes to `.gsd-t/optimization-backlog.md`
- Empty recommendations → still append "no recommendations" marker line
- ~10 unit tests with fixture data

## T2 — `/user:gsd-t-optimization-apply` + `/user:gsd-t-optimization-reject` commands (Wave 4)
**Files**: `commands/gsd-t-optimization-apply.md`, `commands/gsd-t-optimization-reject.md`
**Acceptance**:
- `gsd-t-optimization-apply {ID}` reads the entry, creates a quick milestone OR promotes via `gsd-t-backlog-promote`, marks entry `status: promoted`
- `gsd-t-optimization-reject {ID} [--reason "..."]` marks entry `status: rejected`, captures reason, sets `rejection_cooldown: 5` (milestones)
- Both commands idempotent and safe to re-run
- Help text clear

## T3 — Wire into complete-milestone + extend backlog-list + status (Wave 4)
**Files**:
- `commands/gsd-t-complete-milestone.md`
- `commands/gsd-t-backlog-list.md`
- `commands/gsd-t-status.md`
- `commands/gsd-t-help.md`
**Acceptance**:
- `complete-milestone` invokes `node bin/token-optimizer.js` at end of its run
- `backlog-list --file optimization-backlog.md` lists optimization entries with status filtering
- `status` output includes a one-liner: "N pending optimization recommendations" when N > 0
- `help` references the new commands

## T4 — Integration test: fixture → optimizer → apply (Wave 4)
**File**: `test/token-optimizer.test.js` (integration section)
**Acceptance**:
- Synthetic fixture: 10 token-metrics records, one phase on opus with 100% success
- Run optimizer: confirm demotion recommendation surfaces
- Run apply: confirm backlog entry marked promoted
- Run reject on a different recommendation: confirm 5-milestone cooldown set
- All assertions pass
