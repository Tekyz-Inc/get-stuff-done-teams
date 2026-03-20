# Code Quality Analysis — 2026-03-19 (Scan #11, Post-M20/M21 patch series)

**Date:** 2026-03-19
**Version:** v2.39.12
**Previous scan:** Scan #10 at v2.38.10 (2026-03-19)
**Test baseline:** 294/294 passing (confirmed by running `node --test` from project root)
**Focus:** Patch series v2.39.x — CGC sync retry, error reporting, Windows encoding workaround, graph auto-sync, scan-data-collector regex, Neo4j setup guide. No new source files added since M21.
**Graph-enhanced:** Yes — graph engine active for this project

---

## Dead Code

### DC-CARRIED-01 (carried from Scan #7): tryKroki() in scan-renderer.js is dormant
- `bin/scan-renderer.js` lines 53-77
- Zero callers from main execution tree. Comment at line 85 documents this intentionally: "tryKroki is async; skip in sync rendering path — Kroki available via async wrapper if needed"
- Impact: LOW. Still unresolved. Document as intentional or remove.

### DC-NEW-03: findCgcCommand() flagged as duplicate by graph (carried)
- `bin/graph-cgc.js` line 18
- False positive from name-based duplicate detection. Discovery function, not dead code.
- Impact: NONE — no action needed.

### DC-NEW-04: Graph indexes worktree copies as separate entities (carried)
- CGC indexes `.claude/worktrees/` files alongside main project files
- `findDeadCode` returns worktree copies of functions as dead code
- Impact: LOW — noise in graph results, not actual dead code
- Suggestion: graph-query should filter `.claude/worktrees/` from output

---

## Duplication

### DUP-CARRIED-01: findProjectRoot() duplicated in gsd-t-tools.js and gsd-t-statusline.js
- `scripts/gsd-t-tools.js` line 10, `scripts/gsd-t-statusline.js` line 29
- Still unresolved. Acceptable given zero-dependency constraint.

### DUP-CARRIED-02: execFileSync shell-out pattern in 4 bin/ files (updated)
- `bin/scan-renderer.js`, `bin/scan-export.js`, `scripts/gsd-t-update-check.js`, `bin/graph-query.js`
- All four use `const { execFileSync } = require('child_process')` with inline try/catch
- Note: previous scan tracked this as "execSync + string interpolation" — now confirmed as `execFileSync` (safer, no shell). Pattern is safe but repeated.
- Impact: LOW — acceptable for a zero-dep package. Pattern is consistent.

### DUP-NEW-03: isNewer() / isNewerVersion() version comparison duplicated (carried)
- `scripts/gsd-t-update-check.js` line 17: `isNewer(a, b)`
- `bin/gsd-t.js` line 1492: `isNewerVersion(a, b)`
- Same semver split-map-compare logic, different names
- Impact: LOW — acceptable duplication for zero-dep scripts.

---

## Reusability Analysis

### Consumer Surfaces Detected
| Surface             | Type | Operations Used                                  |
|---------------------|------|--------------------------------------------------|
| CLI (bin/gsd-t.js)  | cli  | install, update, init, status, doctor, graph     |
| Commands (49 .md)   | ai   | state read/write, graph query, scan, test        |
| Dashboard HTML      | web  | SSE event stream, JSONL read                     |
| Hook scripts (9)    | hook | event write, state get/set, version check        |

### Shared Service Candidates
No new shared service candidates identified. The graph engine continues to follow the abstraction layer pattern: `graph-query.js` is the shared entry point for all 21 graph-aware commands. `execFileSync` wrapper consolidation remains a low-priority option if a future build step is ever added.

---

## Complexity Hotspots

### CMPLX-NEW-01: bin/gsd-t.js remains the largest file at 1,798 lines (carried)
- Well above the 200-line soft limit in code standards
- Contains 9+ subcommand handlers. Subcommands added in M20/M21 (graph, register, changelog) increased dispatch surface.
- All functions ≤ 30 lines individually (M6 refactoring holds)
- Suggestion: Extract graph and register subcommands to separate module. Still a carried recommendation.

### CMPLX-NEW-02: bin/graph-cgc.js at 510 lines (carried)
- Second-largest file
- Contains CGC process management, MCP protocol, result normalization, provider interface
- All functions individually well-structured and within 30-line limit
- Impact: LOW — cohesive single responsibility (CGC communication)

### CMPLX-NEW-03: bin/graph-query.js at 452 lines (updated — was 400)
- Grew by 52 lines in v2.39.x (CGC sync retry + error reporting)
- grepQuery switch/case handles: getCallers, getImporters, getProvider, getIndexStatus
- Impact: LOW — acceptable for a routing/dispatch module, still within reason

### CMPLX-NEW-04: bin/graph-parsers.js at 327 lines
- Parser for JS and Python function/class/import extraction via regex
- No new growth since M21
- Impact: LOW — file is narrowly scoped (parsing only)

---

## Error Handling Gaps

### EH-CARRIED-03: scan-renderer.js tryMmdc/tryD2 swallow all exceptions silently
- Intentional for graceful degradation. Assessment: acceptable.

### EH-NEW-06: graph-query.js grepQuery catch blocks return empty array silently (carried)
- `bin/graph-query.js` lines ~315, ~329: `catch { return []; }`
- Grep failures (timeout, permission) silently return empty results with no warning
- Impact: LOW — grep is fallback of last resort. Silent failure is acceptable here.

### EH-NEW-07: graph-store.js readFile catch returns null silently (carried)
- `bin/graph-store.js` line 32: `catch { return null; }`
- Missing or corrupt JSON files return null with no error
- Impact: LOW — callers handle null correctly (e.g., `readIndex(root) || { entities: [] }`)

---

## Test Coverage

### Test File Inventory
| File                           | it() calls | Status      |
|--------------------------------|------------|-------------|
| test/cli-quality.test.js       | 27         | PASSING     |
| test/dashboard-server.test.js  | 23         | PASSING     |
| test/event-stream.test.js      | 29         | PASSING     |
| test/filesystem.test.js        | 40         | PASSING     |
| test/graph-indexer.test.js     | 28         | PASSING     |
| test/graph-query.test.js       | 29         | PASSING     |
| test/graph-store.test.js       | 27         | PASSING     |
| test/helpers.test.js           | 27         | PASSING     |
| test/scan.test.js              | 31         | PASSING     |
| test/security.test.js          | 33         | PASSING     |
| test/verify-gates.js           | (gates)    | PASSING     |
| **Total**                      | **294**    | **All pass** |

Note: graph-parsers and graph-overlay are tested within graph-indexer.test.js (lines 8-10, 311+), not in dedicated files.

### Test Coverage Gaps

#### TCG-CARRIED-01 (TD-066, carried): gsd-t-tools.js and gsd-t-statusline.js — still zero test coverage
- Primary finding from Scan #6 HIGH item. Unresolved after 8+ milestones.
- Impact: MEDIUM — these scripts run at every command boundary (hook execution).

#### TCG-CARRIED-03: scan-renderer.js tryKroki() — zero test coverage
- Dormant async path. Impact: LOW.

#### TCG-CARRIED-04: gsd-t-update-check.js — untestable (no module.exports)
- Impact: MEDIUM — same pattern as TD-066.

#### TCG-CARRIED-05: gsd-t-auto-route.js — untestable (no module.exports)
- Impact: LOW — simple logic.

#### TCG-CARRIED-06: gsd-t-dashboard.html — no E2E or UI tests
- Impact: LOW-MEDIUM.

#### TCG-NEW-07: graph-cgc.js — no test for actual CGC communication (carried)
- Tests mock the CGC process. No integration test that verifies real CGC MCP protocol over stdio.
- Impact: LOW — CGC is optional and tested end-to-end during manual verification.

#### TCG-NEW-08: graph-overlay.js — no dedicated test file (carried)
- Overlay functions tested indirectly through graph-indexer.test.js (describe block at line 311)
- Impact: MEDIUM — overlay logic is critical for enrichment accuracy.

---

## Naming and Convention Issues

### CONV-CARRIED-03: RESOLVED in v2.39.x
- CLAUDE.md now correctly states "49 slash commands (45 GSD-T workflow + 4 utility)"
- `ls commands/*.md` = 49 files; CLAUDE.md count = 49. Mismatch resolved.
- Note: architecture.md still lists "49 (45 GSD-T workflow + 4 utility: gsd, branch, checkin, Claude-md, global-change)" which counts 5 utility — minor inconsistency. 4 utility + gsd.md (router) = 5 if gsd.md is counted as utility.

### CONV-CARRIED-04: RendererName enum in scan-diagrams-contract.md lists 'mcp' but no MCP code exists
- Still unresolved.

### CONV-NEW-06: Graph engine absolute paths — contract violation (carried)
- graph-query-contract.md Rule 6: "All file paths in results MUST be relative to project root"
- Actual: CGC provider returns absolute paths; native provider uses absolute `id` format
- Impact: MEDIUM — consumers expecting relative paths get absolute. Contract violated.

---

## Unresolved Developer Notes
No TODO, FIXME, HACK, or XXX comments found in any JS or script files. Clean.

---

## Performance Issues

### PERF-CARRIED-01: RESOLVED in v2.39.x
- Dashboard server now handles UTC midnight rollover
- `scripts/gsd-t-dashboard-server.js` lines 95-108: `fs.watch(eventsDir)` detects new JSONL files and switches the active watcher when a new daily file appears
- Status: CLOSED

### PERF-NEW-02: Graph reindex triggered on every query when no meta.json exists (carried)
- `bin/graph-query.js` line ~372: If `readMeta(projectRoot)` returns null, `indexProject(projectRoot)` is called on every query
- Impact: LOW for established projects (meta.json exists), but poor UX on first use in a large project
- Suggestion: After indexing, always write meta.json so subsequent queries skip reindex.

---

## Living Docs Staleness (Post-M21 patch series)

| Doc                    | Status  | Missing or Stale Content                                                         |
|------------------------|---------|----------------------------------------------------------------------------------|
| docs/architecture.md   | STALE   | Test count shows "125 tests" (line 241) — actual is 294. Should be updated.     |
| docs/architecture.md   | CURRENT | Graph engine files, component counts, CLI subcommands all correctly documented.  |
| docs/workflows.md      | UNKNOWN | Not checked this scan — carry from Scan #10 (graph flows may still be missing)   |
| docs/infrastructure.md | UNKNOWN | Not checked this scan — carry from Scan #10                                       |
| docs/requirements.md   | UNKNOWN | Not checked this scan — carry from Scan #10                                       |

Primary staleness finding: `docs/architecture.md` line 241 still reads "Total: 125 tests, all passing (post-M9)" — this is 169 tests out of date.

---

## Stale Dependencies
No npm dependencies — nothing to update. Zero supply chain attack surface on the Node.js side.

---

## Security

### SEC-CARRIED-01: graph-query.js grepQuery uses function name directly in execFileSync args
- `bin/graph-query.js` lines 309, 325: function name from graph entity is passed as grep argument
- Uses `execFileSync('grep', [...])` not shell interpolation — no shell injection risk
- However, a crafted entity name with special regex characters could cause grep failures or unexpected matches
- Impact: LOW — grep receives name as a literal argument, not via shell. execFileSync is safe.

---

## Graph-Enhanced Findings Summary

What the graph engine found that grep-only scanning missed (carried from Scan #10):
1. **Worktree contamination** (DC-NEW-04): CGC indexes worktree copies, creating false positives in dead code analysis. Only visible with graph data.
2. **isNewer() duplication** (DUP-NEW-03): `findDuplicates` detected name-based similarity between `isNewer` (update-check) and `isNewerVersion` (gsd-t.js). Grep would need manual pattern matching.
3. **Absolute path contract violation** (CONV-NEW-06): Inspecting actual graph query results revealed paths are absolute, not relative as contracted. This can only be found by running queries, not by reading source.
4. **Complexity data gap** (CMPLX-NEW-01 note): `findComplexFunctions` returns complexity=1 for all functions — the native regex parser does not compute real cyclomatic complexity.
5. **Zero circular dependencies**: `findCircularDeps` confirmed no import cycles exist.
6. **Zero domain boundary violations**: `getDomainBoundaryViolations` returned empty — all graph engine modules respect domain boundaries.

## Changes Since Scan #10

| Item                         | Change                                                          |
|------------------------------|-----------------------------------------------------------------|
| PERF-CARRIED-01              | RESOLVED — dashboard handles midnight JSONL rollover            |
| CONV-CARRIED-03              | RESOLVED — CLAUDE.md command count now matches actual 49 files  |
| Test count                   | 294/294 (unchanged from Scan #10 — no new tests in patch series)|
| bin/*.js total lines         | 4,750 (was 4,888 — minor corrections and refactors in patch series) |
| DUP-CARRIED-02               | Updated: confirmed execFileSync (not execSync), 4 files, no shell risk |
| CMPLX-NEW-03 (graph-query)   | Grew from 400 → 452 lines in v2.39.x CGC retry/error reporting |
| architecture.md test count   | Still stale: shows "125 tests", actual is 294                   |
