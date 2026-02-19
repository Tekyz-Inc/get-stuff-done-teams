# Code Quality Analysis — 2026-02-18 (Scan #6, Post-M10-M13)

**Date:** 2026-02-18
**Version:** v2.28.10
**Previous scan:** Scan #5 at v2.24.4 (post-M9). Zero open items post-M9.
**Focus:** New code from M10-M13 milestones.

---

## Dead Code
None found in new M10-M13 code.

---

## Duplication

### DUP-NEW-01: findProjectRoot() duplicated across 2 new scripts
- `scripts/gsd-t-tools.js` line 10-17 and `scripts/gsd-t-statusline.js` line 29-36
- Identical logic: walk up from process.cwd() checking for .gsd-t/
- Difference: tools.js returns cwd on failure; statusline.js returns null
- Both could import from a shared helper, but zero-dependency constraint means no module sharing without restructuring
- Impact: LOW — if the walk-up logic needs changing, must be changed in two places
- Assessment: Acceptable duplication given zero-dependency constraint and different return semantics

---

## Complexity Hotspots

All functions in new scripts are well within the 30-line limit:
- gsd-t-tools.js: 12 functions, all ≤21 lines (largest: preCommitCheck at 21 lines)
- gsd-t-statusline.js: 4 functions, all ≤12 lines

No complexity hotspots in new code.

---

## Error Handling Gaps

### EH-NEW-01: gsd-t-tools.js stateSet() has no error handling around writeFileSync
- `scripts/gsd-t-tools.js` line 43: `fs.writeFileSync(p, content.replace(re, '$1${value}'))`
- No try/catch. If writeFileSync fails (permissions, disk full), exception propagates uncaught, crashing the process with a Node.js stack trace instead of a clean JSON error response
- Inconsistent with stateGet/validate which return `{ error: '...' }` objects
- Remediation: Wrap in try/catch, return `{ error: e.message }` on failure

### EH-NEW-02: gsd-t-statusline.js has no error handling for parseInt of env vars
- `parseInt(process.env.CLAUDE_CONTEXT_TOKENS_USED || '0', 10)` — if env var is non-numeric, parseInt returns NaN
- Subsequent math (NaN / tokensMax * 100 → NaN → Math.min(100, NaN) → NaN) → contextBar not rendered
- Fails silently, which is acceptable for a statusline script. Informational note only.

---

## Test Coverage Gaps

### TCG-NEW-01: gsd-t-tools.js has zero test coverage
- **File**: `scripts/gsd-t-tools.js`
- **Functions**: findProjectRoot, readProgress, stateGet, stateSet, validate, parseSection, listDomains, listContracts, preCommitCheck, templateScope, templateTasks, escapeRe — all untested
- **Root cause**: No module.exports, so the file cannot be required in test files. The entire script executes at require time.
- **Impact**: HIGH for a state-mutation utility. stateSet modifies progress.md — if it misbehaves, it corrupts the project's primary state file. No regression safety net.
- **Remediation**: Add module.exports + require.main guard (same pattern as bin/gsd-t.js), then add tests. Estimated: 15-20 new tests.

### TCG-NEW-02: gsd-t-statusline.js has zero test coverage
- **File**: `scripts/gsd-t-statusline.js`
- **Functions**: findProjectRoot, readProgress, extract, contextBar — all untested
- **Root cause**: No module.exports; script executes at require time
- **Impact**: MEDIUM — statusline is display-only, not state-mutating. contextBar color logic and extract regex are untested.
- **Remediation**: Add module.exports + require.main guard, then test contextBar color thresholds and extract regex. Estimated: 8-12 new tests.

---

## Naming and Convention Issues

### CONV-NEW-01: gsd-t-health.md and gsd-t-pause.md are new commands not listed in docs/GSD-T-README.md command counts
- docs/GSD-T-README.md does not mention the count "45" anywhere except in the commands table (which does list health and pause)
- CLAUDE.md (project) correctly states 45 commands
- README.md correctly states 45 commands
- docs/infrastructure.md still shows "ls commands/*.md | wc -l  # Should be 43" — stale
- Impact: LOW — infrastructure.md is for developers, but stale count is misleading

### CONV-NEW-02: docs/architecture.md shows stale command count
- docs/architecture.md line 27: "Count: 43 (39 GSD-T workflow + 4 utility: gsd, branch, checkin, Claude-md)"
- Actual: 45 (41 GSD-T + 4 utility)
- Also: bin/gsd-t.js count 49 exports shown, but current export count not reverified
- Impact: LOW — documentation stale

---

## Unresolved Developer Notes
None found in new M10-M13 code (gsd-t-tools.js, gsd-t-statusline.js, gsd-t-health.md, gsd-t-pause.md).

---

## Performance Issues
None. New scripts are simple filesystem operations, no performance concerns.

---

## Living Docs Staleness (Major Finding)

All four living docs show stale Last Updated dates:
| Doc | Last Updated | Missing Content |
|-----|-------------|-----------------|
| docs/architecture.md | Post-M9 (Scan #5) | M10-M13 components, new scripts, CONTEXT.md flow, continue-here flow, wave groupings |
| docs/workflows.md | Scan #5 | CONTEXT.md workflow, continue-here workflow, wave grouping workflow, deferred-items workflow |
| docs/infrastructure.md | Scan #5 | gsd-t-tools.js, gsd-t-statusline.js in Scripts table; stale test count (116→125); stale command count (43→45) |
| docs/requirements.md | Scan #5 | M10-M13 features not reflected as requirements |

This is the largest quality gap from M10-M13. Four milestones of work with no living doc updates.
