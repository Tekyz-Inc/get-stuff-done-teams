# Graph vs Grep Scan Comparison — 2026-03-19

## Purpose

Compare findings from Scan #10 (graph-enhanced with CGC + native indexer) against Scan #9 (grep-only, backup at `.gsd-t/scan-backup-pre-graph/`). This documents what the graph engine found that the previous grep-only approach missed.

---

## Scan Environment

| Aspect       | Scan #9 (grep-only)                | Scan #10 (graph-enhanced)                        |
|--------------|--------------------------------------|--------------------------------------------------|
| Date         | 2026-03-09                           | 2026-03-19                                       |
| Version      | v2.34.10                             | v2.38.10                                         |
| JS files     | 19                                   | 27 (+8 graph engine files)                       |
| JS lines     | ~4,208                               | 4,888 (+680)                                     |
| Tests        | 205                                  | 294 (+89)                                        |
| Scan method  | Agent reads files + grep patterns    | CGC (1,439 functions) + Native (275 entities) + grep |
| Provider     | N/A                                  | CGC primary, native fallback                     |

---

## New Findings Only Possible With Graph

### 1. SEC-C01: Command Injection in grepQuery() (CRITICAL)
- **How graph helped**: Running `findDeadCode` and `findComplexFunctions` queries through the graph abstraction layer surfaced the `grepQuery()` function and its parameter flow. Manual code reading in previous scans did not examine the grep fallback provider in depth because it was always the lowest-priority path.
- **Grep-only missed this because**: Previous scans scanned for `execSync` patterns (found 3 instances in scan-renderer, scan-export, update-check). The graph-query.js `grepQuery` function was NEW in M20 and the grep-based scan at Scan #9 predated the file's existence. However, even if Scan #9 had occurred after M20, the grep pattern `execSync` would have found it — the graph advantage here is that it identifies the *flow* of user-controlled data into the vulnerable call, not just the call itself.
- **Graph advantage**: Moderate — grep would have found the `execSync` call, but graph analysis confirmed the data flow from `params.entity` (user-controlled) through to the shell command.

### 2. Absolute Path Contract Violation (CONV-NEW-06 / TD-098)
- **How graph helped**: By actually running `query('findDeadCode', {})` and examining the returned entities, we observed that all entity IDs and file paths were absolute (e.g., `C:\Users\david\GSD-T\bin\graph-cgc.js:48:startCgcServer`). This violates graph-query-contract.md Rule 6 ("All file paths in results MUST be relative").
- **Grep-only missed this because**: Static code analysis can see that entity IDs are constructed from absolute paths, but without running queries and examining actual output, the contract violation is not obvious. The code constructs IDs from `path.join()` results which are always absolute.
- **Graph advantage**: HIGH — only discoverable by running queries and comparing output to contract spec.

### 3. Zero Circular Dependencies (confirmed)
- **How graph helped**: `findCircularDeps` query returned empty array, confirming no import cycles exist in the codebase.
- **Grep-only approach**: Previous scans stated "no circular dependencies detected" based on manual inspection of `require()` calls. This was an educated guess, not a verified fact.
- **Graph advantage**: MEDIUM — provides definitive proof rather than manual assessment.

### 4. Zero Domain Boundary Violations (confirmed)
- **How graph helped**: `getDomainBoundaryViolations` returned empty, confirming all graph engine modules respect their domain boundaries (graph-storage, native-indexer, graph-abstraction, cgc-provider, cli-graph).
- **Grep-only approach**: Not possible — domain boundary checking requires knowing which entities belong to which domain and which cross-domain calls exist. This is a graph-native operation.
- **Graph advantage**: HIGH — impossible to verify without entity-domain mapping.

### 5. Worktree Contamination in CGC Indexing (DC-NEW-04)
- **How graph helped**: `findDeadCode` returned functions from `.claude/worktrees/busy-taussig/` as dead code. This revealed that CGC indexes worktree copies alongside main project files, creating false positives.
- **Grep-only approach**: Would never discover this — you'd need to be running graph queries against CGC to see worktree contamination in results.
- **Graph advantage**: HIGH — only visible through graph query results.

### 6. Duplicate Detection: isNewer() vs isNewerVersion() (DUP-NEW-03)
- **How graph helped**: `findDuplicates` identified name-based similarity between `isNewer` (gsd-t-update-check.js) and `isNewerVersion` (gsd-t.js). Both implement the same semver comparison logic.
- **Grep-only approach**: Could theoretically find this by searching for version comparison patterns, but would require searching for the specific algorithmic pattern (split + map + compare) across files.
- **Graph advantage**: LOW — name-based detection is a heuristic. Grep could have found this with targeted pattern search.

### 7. Complexity Data Gap (quality insight)
- **How graph helped**: `findComplexFunctions` returned all functions with complexity=1, revealing that the native regex parser doesn't compute actual cyclomatic complexity. CGC has this data but the normalization layer doesn't preserve it.
- **Grep-only approach**: No visibility into complexity at all — previous scans manually assessed "all functions under 30 lines" without complexity scores.
- **Graph advantage**: MEDIUM — reveals a gap in the graph engine itself (complexity data is available in CGC but not surfaced).

---

## Findings That Both Approaches Would Have Found

| Finding                                  | Grep | Graph | Notes                                          |
|------------------------------------------|------|-------|-------------------------------------------------|
| Carried security items (SEC-H01-H03)     | Yes  | Yes   | Both find `execSync` pattern                    |
| Carried quality items (TD-066-080)       | Yes  | Yes   | File-level analysis                             |
| Carried contract drift items             | Yes  | Yes   | Contract vs code comparison                     |
| New file counts (27 JS, 49 commands)     | Yes  | Yes   | Directory listing                               |
| No TODO/FIXME comments                   | Yes  | Yes   | Text search                                     |
| graph-store.js missing symlink check     | Yes  | Yes   | Code pattern comparison (though graph makes cross-module comparison easier) |

---

## Summary

| Category                          | Only Graph | Both | Only Grep |
|-----------------------------------|------------|------|-----------|
| Security findings                 | 1 (data flow) | 8 | 0       |
| Contract drift                    | 2 (runtime verification) | 6 | 0 |
| Quality (dead code, duplicates)   | 3 | All carried | 0        |
| Architecture verification         | 2 (circular deps, domain boundaries) | N/A | 0 |
| **Total new unique findings**     | **5**      | **0** | **0**    |

**Conclusion**: The graph engine found 5 issues that grep-only scanning could not have discovered or would not have had confidence to assert. The highest-value contributions are:
1. **Runtime contract verification** (absolute paths) — only possible by running queries
2. **Domain boundary checking** — requires entity-to-domain mapping
3. **Worktree contamination** — only visible in query results
4. **Circular dependency proof** — definitive vs. manual guessing
5. **Complexity gap identification** — reveals what the graph itself is missing

The graph does NOT replace grep-based scanning — most findings come from reading code and comparing to contracts. The graph adds a verification layer and enables analyses that are structurally impossible with text search alone.
