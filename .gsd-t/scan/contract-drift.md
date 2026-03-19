# Contract Drift Analysis — 2026-03-19 (Scan #10, Post-M20/M21)

**Scan Date:** 2026-03-19
**Package Version:** v2.38.10
**Previous scan:** Scan #9 at v2.34.10 (2026-03-09)
**Contracts checked:** 16 files in .gsd-t/contracts/ (4 new graph contracts added in M20)
**Graph-enhanced:** Yes — used getEntitiesByDomain, getDomainBoundaryViolations

---

## NEW Contracts (M20) — Drift Check

### graph-query-contract.md — Status: DRIFTED (MEDIUM)
**Contract Rule 6**: "All file paths in results MUST be relative to project root"
**Reality**: CGC provider returns absolute paths (e.g., `C:\Users\david\GSD-T\bin\graph-cgc.js:48:startCgcServer`). Native provider also uses absolute paths in entity `id` field. Only the native provider's `file` field is relative.

**Contract Rule 3**: "query() MUST try providers in order: CGC -> native -> grep"
**Reality**: Matches. Verified via `query('getProvider', {})` returning 'cgc'.

**Contract Rule 4**: "Provider selection is cached per session"
**Reality**: Matches. `sessionProvider` variable caches the selection.

**Contract Rule 7**: "Entity IDs MUST be deterministic"
**Reality**: IDs use `file:line:name` format. Deterministic on same system but path-dependent (absolute paths mean different IDs on different machines).

**Drift items**:
1. Rule 6 violated — absolute paths in results
2. Rule 7 — determinism is system-dependent due to absolute paths

**Remediation**: Normalize paths to relative in all providers before returning results.
**Effort**: small

### graph-storage-contract.md — Status: CURRENT
All 8 JSON files match the contracted format. Entity shape matches. Edge formats match.

### graph-indexer-contract.md — Status: CURRENT
`indexProject()` returns the contracted `IndexResult` shape. Provider interface matches (name, priority, available, query). Parsing rules match regex patterns in graph-parsers.js.

### graph-cgc-contract.md — Status: MINOR DRIFT
**Contract MCP Communication section** lists these CGC query translations:
```
cgcQuery('search_codebase', { query: 'callers of functionName' })
cgcQuery('get_dependencies', { file: 'path/to/file.js' })
cgcQuery('find_similar', { function: 'functionName', threshold: 0.8 })
```

**Reality** (graph-cgc.js): Uses different tool names:
```
sendToolCallSync('analyze_code_relationships', ...)
sendToolCallSync('find_dead_code', ...)
sendToolCallSync('find_code', ...)
sendToolCallSync('find_most_complex_functions', ...)
sendToolCallSync('calculate_cyclomatic_complexity', ...)
sendToolCallSync('execute_cypher_query', ...)
```

The contract's example tool names don't match the actual CGC tool names used in implementation. The contract lists conceptual tool names; the code uses actual CGC API names.

**Remediation**: Update contract MCP Communication section to show actual tool names.
**Effort**: small

---

## Carried DRIFTED Contracts

### event-schema-contract.md — Status: DRIFTED (HIGH, carried 3+ scans)
Contract lists `session_start` and `session_end` as valid event types. Implementation (gsd-t-event-writer.js VALID_EVENT_TYPES) does NOT include them.

**Remediation:** Either add session_start/session_end to VALID_EVENT_TYPES, or remove from contract.
**Effort:** small

### scan-diagrams-contract.md — Status: DRIFTED (HIGH, carried 3+ scans)
Contract specifies 'mcp' renderer and Rule 7 "MCP is checked before CLI chain". Implementation has no MCP rendering code path.

**Remediation:** Remove 'mcp' from RendererName enum and delete Rule 7.
**Effort:** small

### qa-agent-contract.md — Status: DRIFTED (TD-067, carried 7+ milestones)
Still lists "partition" and "plan" as QA phases. Reality: no QA spawned for those phases since M10.

### wave-phase-sequence.md — Status: PARTIAL (TD-069, unresolved)
Missing: M11 spot-check, M11 per-task commits, M12 CONTEXT.md handoff.

### progress-file-format.md — Status: PARTIAL (TD-070, unresolved)
Missing: deferred-items.md (M11), CONTEXT.md (M12), continue-here-{timestamp}.md (M13).

### integration-points.md — Status: UNDERDOCUMENTED (carried)
Wave Execution Groups format still not contracted.

---

## Mostly Current Contracts (minor gaps)

### dashboard-server-contract.md — Status: MOSTLY CURRENT
- `parent_agent_id` type mismatch between contracts (`string|null` vs `""`) — carried
- No specification on external CDN resource loading — carried

---

## Contracts Currently CURRENT

| Contract                      | Status  | Notes                               |
|-------------------------------|---------|--------------------------------------|
| graph-storage-contract.md     | CURRENT | New for M20 — matches implementation |
| graph-indexer-contract.md     | CURRENT | New for M20 — matches implementation |
| scan-schema-contract.md       | CURRENT | No changes since M17                 |
| pre-commit-gate.md            | CURRENT | No changes                           |
| backlog-file-formats.md       | CURRENT | No changes since M10                 |
| backlog-command-interface.md   | CURRENT | No changes since M10                 |
| domain-structure.md           | CURRENT | No changes                           |

---

## Undocumented (exists in code, no contract)

| Item                                       | Description                                                    | Risk                   |
|--------------------------------------------|----------------------------------------------------------------|------------------------|
| `.gsd-t/events/YYYY-MM-DD.jsonl`           | Event lifecycle (max retention, archiving, cleanup) uncontracted | Files grow unboundedly |
| `.gsd-t/graph/` directory                  | Contracted in graph-storage-contract.md (CURRENT)              | None                   |
| CGC auto-install flow                      | Python/Docker checks during `gsd-t install` — no contract      | Inconsistent behavior  |
| Graph CLI subcommands                      | `gsd-t graph index/status/query` — no dedicated contract       | Low risk               |

---

## Graph-Enhanced Findings

1. `getEntitiesByDomain` confirmed domain entity counts: graph-storage (24), native-indexer (15), graph-abstraction (9), cgc-provider (13). All domains have entities mapped correctly.
2. `getDomainBoundaryViolations` returned empty — no cross-domain access violations in graph engine code.
3. Contract-vs-reality comparison for the 4 new graph contracts was straightforward: 2 CURRENT, 1 MINOR DRIFT, 1 MEDIUM DRIFT.
