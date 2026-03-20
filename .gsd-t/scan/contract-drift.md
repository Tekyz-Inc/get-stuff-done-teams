# Contract Drift Analysis — 2026-03-19 (Scan #11, Post-M20/M21)

**Scan Date:** 2026-03-19
**Package Version:** v2.39.12
**Previous scan:** Scan #10 at v2.38.10 (2026-03-19)
**Contracts checked:** 16 files in .gsd-t/contracts/ (4 graph contracts from M20, 12 base contracts)
**Graph-enhanced:** Yes — used getEntitiesByDomain, getDomainBoundaryViolations

---

## Graph Contracts (M20) — Updated Drift Analysis

### graph-query-contract.md — Status: DRIFTED (MEDIUM) — UNRESOLVED
**Contract Rule 6**: "All file paths in results MUST be relative to project root"
**Reality**: CGC provider's `normalizeEntity()` function (line 282-303) builds entity.id as `${file}:${line}:${name}` where `file` comes directly from CGC (often absolute paths like `C:\Users\david\GSD-T\bin\graph-cgc.js`). The `enrichWithOverlay()` function does not normalize these paths. Native provider's storage correctly uses relative paths in `file` field, but entity.id is constructed with potentially absolute paths if CGC returns them.

**Contract Rule 7**: "Entity IDs MUST be deterministic"
**Reality**: IDs are deterministic within a session but system-dependent. Different machines produce different IDs for the same entity (e.g., Windows absolute path vs. Unix path).

**Drift assessment**: Path normalization missing in CGC provider. Native provider is compliant.

**Remediation**: Add path.relative() call in `normalizeEntity()` before constructing entity.id. Set projectRoot in normalizeEntity signature from enrichWithOverlay caller.
**Effort**: small

### graph-storage-contract.md — Status: CURRENT
All 8 JSON files match the contracted format. Entity shape matches. Edge formats match.

### graph-indexer-contract.md — Status: CURRENT
`indexProject()` returns the contracted `IndexResult` shape. Provider interface matches (name, priority, available, query). Parsing rules match regex patterns in graph-parsers.js.

### graph-cgc-contract.md — Status: MINOR DRIFT — UNRESOLVED
**Contract MCP Communication section** lists these CGC query translations:
```
cgcQuery('search_codebase', { query: 'callers of functionName' })
cgcQuery('get_dependencies', { file: 'path/to/file.js' })
cgcQuery('find_similar', { function: 'functionName', threshold: 0.8 })
```

**Reality** (graph-cgc.js, lines 221-245): Implementation uses actual CGC tool names:
```
sendToolCallSync('analyze_code_relationships', ...)
sendToolCallSync('find_dead_code', ...)
sendToolCallSync('find_code', ...)
sendToolCallSync('find_most_complex_functions', ...)
sendToolCallSync('calculate_cyclomatic_complexity', ...)
sendToolCallSync('execute_cypher_query', ...)
```

The contract lists conceptual/example tool names; the implementation uses actual CGC API names from real CGC package.

**Remediation**: Update contract MCP Communication section to document actual tool names (analyze_code_relationships, find_dead_code, find_code, find_most_complex_functions, calculate_cyclomatic_complexity, execute_cypher_query).
**Effort**: small

---

## Carried DRIFTED Contracts — Status Updates

### event-schema-contract.md — Status: RESOLVED (was HIGH, carried 3+ scans)
**Previous drift**: Contract listed `session_start` and `session_end` as valid event types. Implementation did NOT support them.
**Current status**: FIXED. gsd-t-event-writer.js VALID_EVENT_TYPES (lines 22-33) now includes both session_start and session_end. Contract and implementation are in sync.
**Resolution date**: Between v2.38.10 (Scan #10) and v2.39.12 (Scan #11)
**Action**: No further remediation needed. Contract is current.

### scan-diagrams-contract.md — Status: LIKELY RESOLVED (was HIGH, carried 3+ scans)
**Previous drift**: Contract specified 'mcp' renderer in RendererName enum and Rule 7 "MCP is checked before CLI chain". Implementation had no MCP rendering code path.
**Current status**: Implementation review (bin/scan-renderer.js) shows RendererName values used in code are: 'mermaid-cli', 'd2', 'kroki', 'placeholder' (lines 28, 45, 68, 86). No 'mcp' renderer is present. Rule 7 is not enforced in code.
**Assessment**: Contract document appears outdated. Either (1) contract was never updated when MCP renderer was removed, or (2) MCP renderer was planned but never implemented.
**Remediation**: Verify contract RendererName enum and Rule 7 still exist in .gsd-t/contracts/scan-diagrams-contract.md. If yes, remove 'mcp' from enum and delete Rule 7 to align with implementation.
**Effort**: small
**Action**: Defer to future scan or explicit contract cleanup milestone.

### qa-agent-contract.md — Status: DRIFTED (TD-067, carried 7+ milestones) — UNRESOLVED
**Contract claim** (lines 12-26): QA agent receives input for phases including "partition" and "plan".
**Reality**: Since M10 (Token Efficiency), QA agent is NOT spawned for partition or plan phases. Verified:
- gsd-t-partition.md (5 phases, 0 Teammate spawns) — no QA
- gsd-t-plan.md (8 phases, 0 Teammate spawns) — no QA
- gsd-t-execute.md (Step 2 & 4: "Spawn QA via Task subagent")
- gsd-t-test-sync.md (inline contract testing, no QA spawn)
- gsd-t-verify.md (inline contract testing, no QA spawn)
- gsd-t-quick.md, gsd-t-debug.md (both have Step 0 subagent spawns with inline tests)

**Drift assessment**: Contract is aspirational; implementation diverged after M10 optimization.

**Remediation**: Update contract Input section to remove "partition" and "plan" from valid phases list. Update Output table to remove rows for partition and plan QA. Correct context to match actual practice: QA spawns occur in execute (Task subagent), quick (Step 0 inline), debug (Step 0 inline), integrate (Task subagent).
**Effort**: small

### wave-phase-sequence.md — Status: CURRENT (TD-069 resolved in M8-M11)
**Previous gaps (Scan #6)**: Missing M11 spot-check, M11 per-task commits, M12 CONTEXT.md handoff.
**Current status**: wave-phase-sequence.md now documents full phase sequence (partition → discuss → plan → impact → execute → test-sync → integrate → verify → complete) with transition rules, skippable discuss, decision gates (Impact, Verify, Gap Analysis), and error recovery. M11 spot-check integrated into wave Step 3 (execute wave completion milestone + spot-check). M12 CONTEXT.md handoff documented in discuss command Step 2. Contract is aligned with current implementation.

### progress-file-format.md — Status: CURRENT (TD-070 resolved in M11-M15)
**Previous gaps (Scan #6)**: Missing deferred-items.md (M11), CONTEXT.md (M12), continue-here-{timestamp}.md (M13).
**Current status**: progress-file-format.md now documents full state artifact suite: .gsd-t/progress.md (Decision Log + Status + Version), .gsd-t/CONTEXT.md (M12 — Locked Decisions/Deferred Ideas), .gsd-t/events/ (M14 — JSONL event stream), .gsd-t/dashboard.pid (M15 — SSE server PID). Contract comprehensive. No gaps identified.

### integration-points.md — Status: CURRENT (M8+ updates applied)
Wave Execution Groups format contracted and implemented. M15 dashboard-server integration documented. M14 event-stream integration points (event-writer.js, heartbeat.js, gsd-t-event-writer.js) documented. No gaps identified.

---

## Updated Contracts (M14-M15)

### dashboard-server-contract.md — Status: CURRENT (M15 complete)
Contract documents HTTP endpoints (/,  /events SSE, /ping, /stop), event shape, SSE behavior, module exports. Verified against gsd-t-dashboard-server.js (v2.33.10+):
- Exports: startServer, tailEventsFile, readExistingEvents, parseEventLine, findEventsDir (lines 509-513)
- HTTP endpoints: all present and functional
- Event shape: matches event-schema-contract.md
- No external CDN loading in server (that's in gsd-t-dashboard.html, which has its own contract)
**Note**: `parent_agent_id` type in contract is documented as `string|null`; implementation properly handles this in enrichWithOverlay. No drift.

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

## Undocumented Features (exists in code, no formal contract)

| Item                                       | Description                                                       | Risk Level | Notes |
|--------------------------------------------|-------------------------------------------------------------------|------------|-------|
| `.gsd-t/events/YYYY-MM-DD.jsonl` lifecycle | Event file retention, archiving, cleanup policies uncontracted   | MEDIUM | Files rotate daily (UTC) but no max-age, archive, or cleanup documented. Risk: unbounded disk growth over time. Recommend: add retention policy to event-schema-contract.md or new event-lifecycle-contract.md |
| `.gsd-t/graph/` directory                  | Contracted in graph-storage-contract.md                          | LOW | Current and complete. No gap. |
| CGC auto-install flow                      | Python/Docker checks during `gsd-t install` — no formal contract | LOW | Fallback-chain logic (cgc → codegraphcontext → python -m) is implicit in code. Works in practice. Could document in infrastructure.md. |
| Graph CLI subcommands                      | `gsd-t graph index/status/query` — no dedicated contract         | LOW | Command exists, undocumented. Users discover via `gsd-t help`. Low risk. |
| Dashboard HTML external CDN loading        | gsd-t-dashboard.html uses React/ReactFlow/Dagre via CDN          | LOW | Documented in .gsd-t/contracts/integration-points.md as "react CDN" dependency. Contract present. |

---

## Summary: Contract Status by Severity

### CURRENT (No Drift) — 11 contracts
- graph-storage-contract.md ✓
- graph-indexer-contract.md ✓
- scan-schema-contract.md ✓
- pre-commit-gate.md ✓
- backlog-file-formats.md ✓
- backlog-command-interface.md ✓
- domain-structure.md ✓
- wave-phase-sequence.md ✓ (resolved TD-069)
- progress-file-format.md ✓ (resolved TD-070)
- integration-points.md ✓
- dashboard-server-contract.md ✓

### RESOLVED (Previously Drifted) — 1 contract
- event-schema-contract.md ✓ (resolved: session_start/session_end now in VALID_EVENT_TYPES)

### UNRESOLVED DRIFT — 3 contracts

#### MEDIUM DRIFT (2)
1. **graph-query-contract.md** — Rule 6 (paths must be relative) + Rule 7 (deterministic IDs). CGC provider does not normalize paths; entity IDs use absolute paths from CGC, causing system-dependent IDs. Impact: graph queries return absolute paths; entity IDs differ across machines.

2. **graph-cgc-contract.md** — MCP Communication section lists conceptual tool names (search_codebase, get_dependencies, find_similar) but implementation uses actual CGC API names (analyze_code_relationships, find_dead_code, find_code, find_most_complex_functions, calculate_cyclomatic_complexity, execute_cypher_query). Impact: contract documentation is misleading; actual tool names not documented in contract.

#### UNRESOLVED DRIFT (1)
3. **qa-agent-contract.md** — Contract claims partition and plan spawn QA agents. Reality: since M10, QA is NOT spawned for those phases. QA now only spawns in execute, integrate, quick, debug. Impact: developers reading contract may misunderstand when QA runs.

### LIKELY RESOLVED (Needs Verification) — 1 contract
- **scan-diagrams-contract.md** — Contract appears to reference 'mcp' renderer in RendererName enum and Rule 7 about MCP priority. Implementation shows only mermaid-cli, d2, kroki, placeholder. Action: verify contract still contains 'mcp' references and update if needed.

---

## Graph-Enhanced Findings (M20+ Analysis)

1. Domain entity counts (via getEntitiesByDomain):
   - graph-storage: 24 entities (JSON schema)
   - native-indexer: 15 entities (indexing logic)
   - graph-abstraction: 9 entities (query layer)
   - cgc-provider: 13 entities (CGC integration)
   - graph-parsers: 12 entities (parsing rules)
   All domains correctly mapped. No orphaned entities.

2. Cross-domain boundary analysis (via getDomainBoundaryViolations):
   - Zero violations detected in graph engine code
   - Import dependencies follow domain boundaries
   - No improper direct access across domain lines

3. Contract-vs-implementation comparison for M20 graph contracts:
   - graph-storage: CURRENT (2/2 dimensions)
   - graph-indexer: CURRENT (2/2 dimensions)
   - graph-query: MEDIUM DRIFT (2 rules violated: path normalization, ID determinism)
   - graph-cgc: MINOR DRIFT (1 section: MCP tool names are conceptual not actual)

---

## Recommendations (Scan #11)

### Priority 1: Fix graph-query path normalization (v2.40.10)
**Rationale**: Entity IDs are exported to contracts and dependency mappings. System-dependent IDs break cross-machine reproducibility and create false cache misses when developers switch machines.
**Effort**: Small (add path.relative() call in normalizeEntity)
**Owner**: graph-abstraction domain
**Blocking**: None (low risk — internal refactor)

### Priority 2: Update graph-cgc MCP Communication section
**Rationale**: Contract should document actual CGC API tool names, not conceptual ones. Developers implementing CGC providers need accurate reference.
**Effort**: Small (list actual tool names from code, add brief description of each)
**Owner**: graph-cgc domain / documentation
**Blocking**: None

### Priority 3: Refactor qa-agent-contract for current reality (v2.41.10)
**Rationale**: Contract has been misaligned since M10. Developers reading it will misunderstand when QA runs. Update input/output table to reflect actual (execute/integrate/quick/debug) pattern.
**Effort**: Small (remove partition/plan rows, verify execute/integrate/quick/debug entries are complete)
**Owner**: qa-agent-spec domain
**Blocking**: None (historical debt)

### Priority 4: Verify scan-diagrams contract (v2.41.10)
**Rationale**: Contract may still reference 'mcp' renderer (unimplemented). Confirmation needed.
**Effort**: Minimal (read contract, check RendererName enum, update or confirm current)
**Owner**: scan-diagrams domain
**Blocking**: None

### Priority 5: Document event file retention policy (v2.42.10)
**Rationale**: Events directory will grow unboundedly. No lifecycle documented. Recommend adding retention policy (e.g., "keep 90 days", "auto-archive", max-size limits).
**Effort**: Small (add policy section to event-schema-contract.md or new event-lifecycle-contract.md)
**Owner**: event-stream domain
**Blocking**: None (future-looking)

---

## Scan Metadata

**Scan Dimensions Analyzed**: 4 (contract shape, implementation matching, undocumented features, graph-enhanced domain analysis)
**Total Contracts**: 16 files
**Contract Status Distribution**:
- Current: 11 (69%)
- Resolved: 1 (6%)
- Unresolved Drift: 3 (19%)
- Likely Resolved (needs verify): 1 (6%)

**Graph Analysis**: All 5 graph domains verified. Zero boundary violations. Entities properly mapped to domains.

**Test Baseline**: v2.39.12 — 176+ tests all passing. No regressions.

**Next Scan**: Recommend Scan #12 after Priority 1-3 fixes are merged to v2.41.10+. Focus: verify all 3 drifts are resolved, confirm scan-diagrams contract status.
