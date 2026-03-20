# Business Rules Analysis — Scan #11 (2026-03-19)

## Project: GSD-T Framework (@tekyzinc/gsd-t) — v2.39.12

**Total rules identified**: 64 (58 from Scan #10 + 6 new for graph auto-sync + freshness)
**Undocumented rules** (not in contracts or CLAUDE.md): 10 (8 carried + 2 new)

---

## New Rules (v2.39.11-2.39.12 — Graph Auto-Sync & Scan Freshness)

### BR-059: Command-Boundary Freshness Check (Documented in graph-query-contract.md — NEW)
Before every non-diagnostic query (all types except 'reindex', 'getIndexStatus', 'getProvider'), query() performs a staleness check IF 500ms+ has elapsed since the last check. If no index exists, it auto-indexes. If index exists, indexProject() re-parses only changed files (hash-based). If any files changed, CGC is synced automatically via `cgc index` CLI.

### BR-060: CGC Sync Retry + Error Reporting (Documented in graph-query.js — NEW)
CGC sync (_syncCgc) attempts normal sync first; if it fails, retries with `--force` flag. If both fail, stderr is written with a clear diagnostic message (not thrown) so command execution continues. Failed CGC doesn't block GSD-T — native or grep fall back. Sync timeout: 30 seconds (vs grep 5 sec, execFile default 15 sec).

### BR-061: Windows Encoding Workaround for CGC (Documented in graph-query.js — NEW)
CGC CLI calls set PYTHONIOENCODING='utf-8' env var to handle Windows console encoding issues (CGC 0.3.1 on Windows sometimes receives directory params as None without this). Applies to both `cgc index` normal and force syncs.

### BR-062: TTL-Based Freshness Caching (Documented in graph-query.js — NEW)
Session-level variable _lastFreshnessCheck tracks the timestamp of the last staleness check. New checks only run if 500ms+ has elapsed. This prevents thrashing the indexer on rapid queries within the same command execution. Resets per session (not per command).

### BR-063: Incremental Scan Data Refresh (UNDOCUMENTED — NEW)
When `.gsd-t/scan/business-rules.md` (and other scan files) are updated, it is a targeted micro-update to the specific dimension file only. The full scan is NOT re-run. Scan #N numbering is incremented only on full codebase team scans. Targeted updates preserve existing scan context (other dimensions, architecture, etc.) while refreshing a single dimension's findings.

### BR-064: Milestone Checkpoint for Scan Freshness (Undocumented — NEW)
At milestone completion (gsd-t-complete-milestone), the scan files are archived as part of milestone closure. This creates a "checkpoint" — future scans reference the previous milestone's scan for context. Allows Scan #N to carry forward tech debt items and avoid re-discovering the same issues. Used in Scan #10 (carried 47 from Scan #8) and Scan #11 (carried 58 from Scan #10).

---

## Carried Rules from Scan #10 (all still valid)

### BR-048: Graph Provider Fallback Chain (Documented in graph-query-contract.md)
Providers are tried in priority order: CGC (1) -> Native (2) -> Grep (3). First provider that returns non-null wins. If all return null, query returns null.

### BR-049: CGC Health Cache (Documented in graph-cgc-contract.md)
CGC health check result is cached for the session lifetime. Once marked available/unavailable, no re-check until new session.

### BR-050: Auto-Reindex on Stale (Documented in graph-query-contract.md)
If meta.json shows stale index (files changed since last index), `query()` auto-triggers `indexProject()` before executing the query. Exception: `reindex`, `getIndexStatus`, `getProvider` queries skip this check.

### BR-051: Provider Selection Caching (Documented in graph-query-contract.md)
Provider selection is cached per session, not per query. Once a provider is selected, all subsequent queries go to that provider.

### BR-052: Graph-Aware Command Guard (Documented in commands)
All 21 graph-aware commands use "if graph available" guards — they remain fully functional without the graph. Graph queries enhance but never gate command execution.

### BR-053: Overlay Enrichment Pipeline (Documented in graph-query-contract.md)
After indexing, entities are enriched via overlay: domain ownership (from .gsd-t/domains/), contract mapping, requirement traceability, test mapping, debt mapping, surface detection. All enrichment is from file content analysis.

### BR-054: CGC MCP Protocol (Documented in graph-cgc-contract.md)
CGC communicates via JSON-RPC over stdio (MCP protocol). 8 CGC tools supported: analyze_code_relationships, find_dead_code, find_code, find_most_complex_functions, calculate_cyclomatic_complexity, execute_cypher_query, add_code_to_graph, get_repository_stats.

### BR-055: Incremental Indexing (Documented in graph-indexer-contract.md)
Indexer checks file hashes in meta.json. Only re-parses files whose content hash changed. Force flag bypasses hash check.

### BR-056: Graph CLI Subcommands (Documented in bin/gsd-t.js)
Three CLI subcommands added: `gsd-t graph index` (run indexer), `gsd-t graph status` (show index stats), `gsd-t graph query <type> [params]` (run ad-hoc query).

### BR-057: CGC Auto-Install in Installer (PARTIALLY documented)
`gsd-t install` now checks for Python, installs CGC via pip if available, checks Docker for Neo4j, and configures CGC. This flow is in the install code but not documented in any contract or infrastructure doc.

### BR-058: Default Exclude Directories (Documented in graph-indexer-contract.md)
Indexer excludes: node_modules, .git, dist, build, coverage, .gsd-t, .claude, __pycache__. Also skips dotfiles.

---

## Carried Rules (from Scan #10 — all still valid)

All 58 rules from Scan #10 remain current (BR-001 through BR-058). Key updates:

- **BR-008** (Between-Phase Spot-Check): Still documented in architecture.md but NOT in wave-phase-sequence.md contract (TD-093 carried).
- **BR-010** (QA Phase Assignment): qa-agent-contract.md still incorrectly lists partition and plan (TD-067 carried).
- **BR-019** (Version String Validation): Still not applied in gsd-t-update-check.js (TD-082 carried).

---

## Undocumented Rules (10 total)

1. **BR-021**: Registered Projects Filtering — partially documented (carried)
2. **BR-023**: Heartbeat Event Ordering within a session — undocumented (carried)
3. **BR-025**: Auto-Route .gsd-t/progress.md detection — undocumented (carried)
4. **BR-030**: Event JSONL file rotation (one file per day) — undocumented (carried)
5. **BR-031**: Dashboard SSE reconnection behavior — undocumented (carried)
6. **BR-035**: Wave deferred-items.md lifecycle — undocumented (carried)
7. **BR-042**: Scan data collector markdown parsing — undocumented (carried)
8. **BR-045**: Dashboard midnight rollover not handled — undocumented (carried, PERF-NEW-01)
9. **BR-057**: CGC auto-install flow — partially documented (carried)
10. **BR-063**: Incremental Scan Data Refresh (targeted micro-updates vs full re-scan) — undocumented (NEW)
