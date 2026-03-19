# Business Rules Analysis — Scan #10 (2026-03-19)

## Project: GSD-T Framework (@tekyzinc/gsd-t) — v2.38.10

**Total rules identified**: 58 (47 from Scan #8 + 11 new for M20/M21)
**Undocumented rules** (not in contracts or CLAUDE.md): 9 (8 carried + 1 new)

---

## New Rules (M20/M21 — Graph Engine)

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

## Carried Rules (from Scan #8 — all still valid)

All 47 rules from Scan #8 remain current. Key updates:

- **BR-008** (Between-Phase Spot-Check): Still documented in architecture.md but NOT in wave-phase-sequence.md contract (TD-093 carried).
- **BR-010** (QA Phase Assignment): qa-agent-contract.md still incorrectly lists partition and plan (TD-067 carried).
- **BR-019** (Version String Validation): Still not applied in gsd-t-update-check.js (TD-082 carried).

---

## Undocumented Rules (9 total)

1. **BR-021**: Registered Projects Filtering — partially documented (carried)
2. **BR-023**: Heartbeat Event Ordering within a session — undocumented (carried)
3. **BR-025**: Auto-Route .gsd-t/progress.md detection — undocumented (carried)
4. **BR-030**: Event JSONL file rotation (one file per day) — undocumented (carried)
5. **BR-031**: Dashboard SSE reconnection behavior — undocumented (carried)
6. **BR-035**: Wave deferred-items.md lifecycle — undocumented (carried)
7. **BR-042**: Scan data collector markdown parsing — undocumented (carried)
8. **BR-045**: Dashboard midnight rollover not handled — undocumented (carried, PERF-NEW-01)
9. **BR-057**: CGC auto-install flow — partially documented (NEW)
