# Code Quality Analysis — 2026-03-19 (Scan #10, Post-M20/M21)

**Date:** 2026-03-19
**Version:** v2.38.10
**Previous scan:** Scan #9 at v2.34.10 (2026-03-09)
**Test baseline:** 294/294 passing (confirmed by running npm test)
**Focus:** 6 new graph engine files (graph-store, graph-parsers, graph-overlay, graph-indexer, graph-cgc, graph-query) + 3 new test files + 21 graph-enhanced command files. Carried items from Scans #7-#9.
**Graph-enhanced:** Yes — used findDeadCode, findDuplicates, findComplexFunctions, findCircularDeps

---

## Dead Code

### DC-CARRIED-01 (carried from Scan #7): tryKroki() in scan-renderer.js is dormant
- `bin/scan-renderer.js` lines 53-77
- Graph `findDeadCode` confirms: zero callers from main tree.
- Impact: LOW. Suggestion: Remove or document as future async enhancement.

### DC-NEW-03: findCgcCommand() flagged as duplicate by graph
- `bin/graph-cgc.js` line 18
- Graph `findDuplicates` flagged this function. It checks 3 different command names for CGC binary availability. Not truly dead or duplicated — it's a discovery function. False positive from name-based duplicate detection.
- Impact: NONE — false positive. No action needed.

### DC-NEW-04: Graph indexes worktree copies as separate entities
- CGC indexes `.claude/worktrees/busy-taussig/` files alongside main project files
- `findDeadCode` returns worktree copies of functions (e.g., `validateProjectPath` from worktree's gsd-t.js) as dead code
- Impact: LOW — noise in graph results, not actual dead code
- Suggestion: CGC indexing should exclude `.claude/worktrees/` path, or graph-query should filter worktree results from output

---

## Duplication

### DUP-CARRIED-01: findProjectRoot() duplicated in gsd-t-tools.js and gsd-t-statusline.js
Still unresolved. Acceptable given zero-dependency constraint.

### DUP-CARRIED-02: execSync + string interpolation pattern used 3 times across 3 bin/ files
- `bin/scan-renderer.js`, `bin/scan-export.js`, `scripts/gsd-t-update-check.js`
- Now also present in `bin/graph-query.js` grepQuery() (4th instance, and the most dangerous — SEC-C01)

### DUP-NEW-03: isNewer() version comparison duplicated
- `scripts/gsd-t-update-check.js` line 15: `isNewer(a, b)` — semver comparison
- `bin/gsd-t.js`: `isNewerVersion(a, b)` — same logic
- Graph `findDuplicates` surfaced this. Both compare semver strings with the same split-map-compare pattern.
- Impact: LOW — acceptable duplication for zero-dep scripts.

---

## Reusability Analysis

### Consumer Surfaces Detected
| Surface             | Type | Operations Used                                 |
|---------------------|------|--------------------------------------------------|
| CLI (bin/gsd-t.js)  | cli  | install, update, init, status, doctor, graph     |
| Commands (49 .md)   | ai   | state read/write, graph query, scan, test        |
| Dashboard HTML      | web  | SSE event stream, JSONL read                     |
| Hook scripts (9)    | hook | event write, state get/set, version check        |

### Shared Service Candidates
No new shared service candidates identified. The graph engine already follows the abstraction layer pattern (graph-query.js is the shared entry point for all 21 graph-aware commands).

---

## Complexity Hotspots

Graph `findComplexFunctions` returned 10 functions from graph-cgc.js, all with complexity=1. This indicates the CGC provider's complexity data from the native indexer is not capturing actual cyclomatic complexity — the regex parser marks all functions as complexity=1 by default.

### CMPLX-NEW-01: bin/gsd-t.js remains the largest file at 1,798 lines
- Well above the 200-line soft limit in code standards
- Contains 9+ subcommand handlers. Graph shows high entity count.
- Suggestion: Extract graph subcommands to separate module (carried recommendation)

### CMPLX-NEW-02: bin/graph-cgc.js at 510 lines
- Second-largest new file after gsd-t.js
- Contains CGC process management, MCP protocol, result normalization, and provider interface
- All functions are well-structured and within 30-line limit individually
- Impact: LOW — file is cohesive (single responsibility: CGC communication)

### CMPLX-NEW-03: bin/graph-query.js at 400 lines
- Third-largest new file
- Contains provider management, native query routing (large switch), and grep fallback
- The grepQuery switch/case is growing (handles getCallers, getImporters, getProvider, getIndexStatus)
- Impact: LOW — acceptable for a routing/dispatch module

---

## Error Handling Gaps

### EH-CARRIED-03: scan-renderer.js tryMmdc/tryD2 swallow all exceptions silently
- Intentional for graceful degradation. Assessment: acceptable.

### EH-NEW-06: graph-query.js grepQuery catch blocks return empty array silently
- `bin/graph-query.js` lines 315, 329: `catch { return []; }`
- Grep failures (timeout, permission) silently return empty results with no warning
- Impact: LOW — grep is fallback of last resort. Silent failure is acceptable here.

### EH-NEW-07: graph-store.js readFile catch returns null silently
- `bin/graph-store.js` line 32: `catch { return null; }`
- Missing or corrupt JSON files return null with no error
- Impact: LOW — callers handle null correctly (e.g., `readIndex(root) || { entities: [] }`)

---

## Test Coverage

### New Test Files (M20)
| File                        | Tests | Status  |
|-----------------------------|-------|---------|
| test/graph-store.test.js    | 27    | PASSING |
| test/graph-indexer.test.js  | 28    | PASSING |
| test/graph-query.test.js    | 15    | PASSING |
| **Total new tests**         | **70**| **All pass** |

### Test Coverage Gaps

#### TCG-CARRIED-01 (TD-066, carried): gsd-t-tools.js and gsd-t-statusline.js — still zero test coverage
- Primary finding from Scan #6 HIGH item. Unresolved after 7+ milestones.

#### TCG-CARRIED-03: scan-renderer.js tryKroki() — zero test coverage
- Dormant async path. Impact: LOW.

#### TCG-CARRIED-04: gsd-t-update-check.js — untestable (no module.exports)
- Impact: MEDIUM — same pattern as TD-066.

#### TCG-CARRIED-05: gsd-t-auto-route.js — untestable (no module.exports)
- Impact: LOW — simple logic.

#### TCG-CARRIED-06: gsd-t-dashboard.html — no E2E or UI tests
- Impact: LOW-MEDIUM.

#### TCG-NEW-07: graph-cgc.js — no test for actual CGC communication
- Tests mock the CGC process. No integration test that verifies real CGC MCP protocol over stdio.
- Impact: LOW — CGC is optional and tested end-to-end during manual verification.

#### TCG-NEW-08: graph-overlay.js — no dedicated test file
- Overlay functions (buildDomainMap, mapContracts, mapRequirements, etc.) are tested indirectly through graph-indexer.test.js but have no dedicated unit tests.
- Impact: MEDIUM — overlay logic is critical for enrichment accuracy.

---

## Naming and Convention Issues

### CONV-CARRIED-03: Command count mismatch — 49 files in commands/, docs say 46
- `ls commands/*.md` = 49 files; CLAUDE.md says "46 slash commands (42 GSD-T workflow + 4 utility)"
- Discrepancy is now 3 commands. Likely includes global-change.md and other additions.
- Remediation: Audit and update CLAUDE.md, README.md, GSD-T-README.md, gsd-t-help.md counts.

### CONV-CARRIED-04: RendererName enum in scan-diagrams-contract.md lists 'mcp' but no MCP code exists
- Still unresolved.

### CONV-NEW-06: Graph engine uses absolute paths internally despite contract requiring relative
- graph-query-contract.md Rule 6: "All file paths in results MUST be relative to project root"
- Actual: CGC provider returns absolute paths, native provider uses absolute `id` format (`C:\Users\david\GSD-T\bin\graph-cgc.js:48:startCgcServer`)
- Impact: MEDIUM — consumers expecting relative paths will get absolute. Contract is violated.

---

## Unresolved Developer Notes
No TODO, FIXME, HACK, or XXX comments found in any JS files (including new graph engine files). Clean.

---

## Performance Issues

### PERF-CARRIED-01: Dashboard server watches only the newest JSONL file at server-start
- UTC midnight rollover not handled. Still unresolved.

### PERF-NEW-02: Graph reindex triggered on every query when no meta.json exists
- `bin/graph-query.js` line 372: If `readMeta(projectRoot)` returns null, `indexProject(projectRoot)` is called.
- In projects without a graph index, every `query()` call triggers a full reindex (file walking + parsing).
- Impact: LOW for this project (meta.json exists), but could cause performance issues in large projects using GSD-T for the first time with graph-aware commands.
- Suggestion: After indexing, always write meta.json so subsequent queries skip reindex.

---

## Living Docs Staleness (Post-M20/M21)

All four living docs remain stale for M20/M21 content.

| Doc                    | Missing Content                                                          |
|------------------------|--------------------------------------------------------------------------|
| docs/architecture.md   | 6 new graph engine files, graph CLI subcommands, CGC integration, updated component counts (19->27 JS files, 2934->4888 lines), updated test count (205->294) |
| docs/workflows.md      | Graph indexing workflow, CGC health check flow, provider fallback chain, graph CLI usage |
| docs/infrastructure.md | Graph engine files in component table, CGC install requirements, Neo4j Docker setup, graph CLI commands |
| docs/requirements.md   | Graph engine requirements not reflected as implemented                    |

---

## Stale Dependencies
No npm dependencies — nothing to update. Zero supply chain attack surface on the Node.js side.

---

## Graph-Enhanced Findings Summary

What the graph engine found that grep-only scanning missed:
1. **Worktree contamination** (DC-NEW-04): CGC indexes worktree copies, creating false positives in dead code analysis. Only visible with graph data.
2. **isNewer() duplication** (DUP-NEW-03): `findDuplicates` detected name-based similarity between `isNewer` (update-check) and `isNewerVersion` (gsd-t.js). Grep would need manual pattern matching.
3. **Absolute path contract violation** (CONV-NEW-06): Inspecting actual graph query results revealed paths are absolute, not relative as contracted. This can only be found by running queries, not by reading source.
4. **Complexity data gap** (CMPLX-NEW-01 note): `findComplexFunctions` returns complexity=1 for all functions — the native regex parser doesn't compute real cyclomatic complexity. CGC could provide this but the normalization doesn't preserve it.
5. **Zero circular dependencies**: `findCircularDeps` confirmed no import cycles exist. Previous scans couldn't verify this without the graph.
6. **Zero domain boundary violations**: `getDomainBoundaryViolations` returned empty — all graph engine modules respect domain boundaries.
