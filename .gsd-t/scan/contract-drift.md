# Contract Drift Analysis — 2026-03-09 (Scan #9, Post-M17)

**Scan Date:** 2026-03-09
**Package Version:** v2.34.10
**Previous scan:** Scan #8 at v2.34.10 (2026-03-09)
**Contracts checked:** 13 files in .gsd-t/contracts/
**Note:** No code changes since Scan #8. All drift items carried forward unchanged.

---

## Drift Changes Since Scan #8

No new drift introduced. The tooltip fix+revert only modified `scripts/gsd-t-dashboard.html` (HTML/CSS — no contract governs dashboard UI content). No contracts were updated. All drift from Scan #8 remains open.

---

## DRIFTED Contracts (all carried from Scan #8 — unchanged)

### event-schema-contract.md — Status: DRIFTED (HIGH, carried 2+ scans)
Contract lists `session_start` and `session_end` as valid event types. The implementation (gsd-t-event-writer.js VALID_EVENT_TYPES set) does NOT include these types. Any attempt to write a session_start/session_end event through the event-writer CLI returns exit code 1.

**Drift details:**
- Contract (event-schema-contract.md, Event Types table): lists `session_start` and `session_end`
- Reality (scripts/gsd-t-event-writer.js, VALID_EVENT_TYPES): only 8 types — session_start/end absent
- Contract also states `parent_agent_id` is `string|null` — but dashboard-server-contract.md example shows `""` (empty string). Minor cross-contract inconsistency.

**Remediation:** Either add session_start/session_end to VALID_EVENT_TYPES, or remove them from event-schema-contract.md.
**Effort:** small

### scan-diagrams-contract.md — Status: DRIFTED (HIGH, carried 2+ scans)
Contract specifies a 'mcp' renderer as the first option (rule 7: "MCP is checked before CLI chain"). The implementation (scan-renderer.js) has no MCP code path.

**Drift details:**
- Contract RendererName enum: lists 'mcp' as valid renderer
- Contract Rule 7: "MCP is checked before CLI chain"
- Reality (scan-renderer.js renderDiagram()): tries tryMmdc() → tryD2() → placeholder. No MCP invocation.

**Remediation:** Either implement MCP rendering or remove 'mcp' from RendererName enum and delete Rule 7.
**Effort:** medium (implementing MCP), small (removing from contract)

### qa-agent-contract.md — Status: STILL DRIFTED (TD-067, carried 5+ milestones)
Contract still lists "partition" and "plan" as QA phases. Reality (post-M10): no QA spawned for those phases.

### wave-phase-sequence.md — Status: STILL PARTIAL (TD-069, unresolved)
Missing: M11 spot-check, M11 per-task commits, M12 CONTEXT.md handoff. No remediation applied.

### progress-file-format.md — Status: STILL PARTIAL (TD-070, unresolved)
Missing: deferred-items.md (M11), CONTEXT.md (M12), continue-here-{timestamp}.md (M13). No remediation applied.

### integration-points.md — Status: UNDERDOCUMENTED (carried from Scan #6)
Wave Execution Groups format still not contracted. No separate contract file added for it.

---

## Mostly Current Contracts (one carried gap)

### dashboard-server-contract.md — Status: MOSTLY CURRENT (one carried gap)
The contract's Event Stream Format example shows `parent_agent_id` as `""` (empty string), but event-schema-contract.md says `string|null`. The actual gsd-t-event-writer.js writes `null`. Dashboard contract example is misleading.

**Note:** The contract does not specify whether served HTML may load external CDN resources. gsd-t-dashboard.html loads 5 CDN resources (React, dagre, ReactFlow) — this is undocumented in the contract and inconsistent with scan-report.html's no-external-resources requirement.

---

## Contracts Currently CURRENT

| Contract | Status | Notes |
|----------|--------|-------|
| scan-schema-contract.md    | CURRENT | New for M17 — matches implementation |
| pre-commit-gate.md         | CURRENT | No changes |
| backlog-file-formats.md    | CURRENT | No changes since M10 |
| backlog-command-interface.md | CURRENT | No changes since M10 |
| domain-structure.md        | CURRENT | No changes |

---

## Undocumented (exists in code/commands, no contract)

| Item | Description | Risk |
|------|-------------|------|
| `.gsd-t/events/YYYY-MM-DD.jsonl` | Event stream format contracted in event-schema-contract.md, but lifecycle (max retention, archiving, cleanup) has no contract | Files grow unboundedly |
| `.gsd-t/dashboard.pid` | PID file written by dashboard-server.js on --detach. No format contract, no health check, no cleanup rule | Stale PID file if server crashes |
| `gsd-t-update-check.js` output format | SessionStart hook — no contract for output strings (`[GSD-T AUTO-UPDATE]`, `[GSD-T UPDATE]`, `[GSD-T]`) | If strings change, CLAUDE.md routing instructions break |
| `gsd-t-auto-route.js` output format | Emits `[GSD-T AUTO-ROUTE]` signal text. No contract for signal format | If signal text changes, routing instructions break |
| scan-report.html output location | Written to `opts.projectRoot`. Undocumented — callers might assume .gsd-t/scan/ | Could conflict with project files |
| `.gsd-t/CONTEXT.md` | Still no contract for format or lifecycle (TD-070 — carried) | Inconsistent CONTEXT.md across milestones |
| `.gsd-t/continue-here-{timestamp}.md` | Still no contract (TD-070 carried) | Resume edge cases |
| `.gsd-t/deferred-items.md` | Still no contract (TD-070 carried) | No tooling can parse it |
| `gsd-t-dashboard.html` CDN deps | Dashboard loads React/dagre/ReactFlow from unpkg.com — no SRI hashes, no contract spec for browser deps | CDN compromise runs arbitrary JS in dashboard |

---

## Summary of Contract Drift

| Contract | Status | Priority |
|----------|--------|----------|
| event-schema-contract.md     | DRIFTED — session_start/end in contract but not in code | HIGH — code and contract conflict |
| scan-diagrams-contract.md    | DRIFTED — MCP renderer in contract, not in code | HIGH — contract promises nonexistent behavior |
| qa-agent-contract.md         | DRIFTED (carried 5+ milestones) — partition/plan still listed | HIGH — carried unresolved |
| wave-phase-sequence.md       | PARTIAL (carried) — missing M11/M12 additions | MEDIUM |
| progress-file-format.md      | PARTIAL (carried) — missing M11-M13 artifacts | MEDIUM |
| integration-points.md        | UNDERDOCUMENTED (carried) | MEDIUM |
| dashboard-server-contract.md | MOSTLY CURRENT — null vs "" + CDN deps undocumented | LOW |
| scan-schema-contract.md      | CURRENT | None |
| pre-commit-gate.md           | CURRENT | None |
| backlog-file-formats.md      | CURRENT | None |
| backlog-command-interface.md | CURRENT | None |
| domain-structure.md          | CURRENT | None |

## NEW Contracts Added for M14-M17

### event-schema-contract.md — Status: DRIFTED
Contract lists `session_start` and `session_end` as valid event types. The implementation (gsd-t-event-writer.js VALID_EVENT_TYPES set) does NOT include these types. They were never added to the code. Any attempt to write a session_start/session_end event through the event-writer CLI returns exit code 1.

**Drift details:**
- Contract (event-schema-contract.md, Event Types table): lists `session_start` and `session_end`
- Reality (scripts/gsd-t-event-writer.js, VALID_EVENT_TYPES): only 8 types — session_start/end are absent
- Contract also states `parent_agent_id` is `string|null` — but the dashboard-server-contract.md notes it is "empty string (not null) for root-level agents." Minor inconsistency between the two contracts.

**Remediation:** Either add session_start/session_end to VALID_EVENT_TYPES, or remove them from the event-schema-contract.md Event Types table.
**Effort:** small

### scan-diagrams-contract.md — Status: DRIFTED
Contract specifies a 'mcp' renderer as the first option (rule 7: "MCP is checked before CLI chain — if MCP renders successfully, CLI is not attempted"). The implementation (scan-renderer.js) has no MCP code path. Only mmdc, d2, and placeholder are attempted.

**Drift details:**
- Contract (scan-diagrams-contract.md, RendererName enum): lists 'mcp' as a valid renderer
- Contract Rule 7: "MCP is checked before CLI chain"
- Reality (scan-renderer.js, renderDiagram()): tries tryMmdc() → tryD2() → placeholder. No MCP invocation.

**Remediation:** Either implement MCP rendering path or remove 'mcp' from RendererName enum and delete Rule 7. Update contract to reflect reality.
**Effort:** medium (if implementing MCP), small (if removing from contract)

### scan-schema-contract.md — Status: CURRENT
Contract matches implementation. extractSchema() signature, SchemaData shape, Entity/Field/Relation shapes all match. Contract rules (never throws, detected=false shape, single ormType) all verified in code.

### dashboard-server-contract.md — Status: MOSTLY CURRENT — one minor gap
The contract says SSE events are loaded "newest file first." The implementation reads files in reverse sort order (`.sort().reverse()`), which is correct for YYYY-MM-DD filenames. One inconsistency: the contract's Event Stream Format example shows `parent_agent_id` as `""` (empty string), but event-schema-contract.md says `string|null`. The actual gsd-t-event-writer.js writes `null` (from the nullify() function). The dashboard contract's example is misleading.

---

## Carried Drift from Scan #6 — Status Assessment

### qa-agent-contract.md — Status: STILL DRIFTED (TD-067, unresolved after 4+ milestones)
Contract still lists "partition" and "plan" as QA phases. Reality (post-M10): no QA spawned for those phases. Same finding as Scan #6. No remediation applied.

### wave-phase-sequence.md — Status: STILL PARTIAL (TD-069, unresolved)
Missing: M11 spot-check, M11 per-task commits, M12 CONTEXT.md handoff. All 3 additions remain undocumented in the contract. No remediation applied.

### progress-file-format.md — Status: STILL PARTIAL (TD-070, unresolved)
Missing: deferred-items.md (M11), CONTEXT.md (M12), continue-here-{timestamp}.md (M13). No remediation applied.

### integration-points.md — Status: UNDERDOCUMENTED (carried from Scan #6)
Wave Execution Groups format (written by plan, read by execute) still not contracted. No separate contract file added for it.

---

## Contracts Currently CURRENT

| Contract | Status | Notes |
|----------|--------|-------|
| scan-schema-contract.md | CURRENT | New for M17 — matches implementation |
| pre-commit-gate.md | CURRENT | No changes |
| backlog-file-formats.md | CURRENT | No changes since M10 |
| backlog-command-interface.md | CURRENT | No changes since M10 |
| domain-structure.md | CURRENT | No changes |

---

## Undocumented (exists in code/commands, no contract)

| Item | Description | Risk |
|------|-------------|------|
| `.gsd-t/events/YYYY-MM-DD.jsonl` | Event stream format contracted in event-schema-contract.md, but lifecycle (max retention, archiving, cleanup) has no contract | Files grow unboundedly |
| `.gsd-t/dashboard.pid` | PID file written by dashboard-server.js on --detach. No format contract, no health check, no cleanup rule | Stale PID file if server crashes without cleanup |
| `gsd-t-update-check.js` CLI behavior | SessionStart hook — no contract for its output format (`[GSD-T AUTO-UPDATE]`, `[GSD-T UPDATE]`, `[GSD-T]` strings) | If strings change, CLAUDE.md parser instructions break |
| `gsd-t-auto-route.js` output format | Emits `[GSD-T AUTO-ROUTE]` signal text. No contract for signal format | If signal text changes, Claude's CLAUDE.md routing instructions break |
| scan-report.html output location | Written to `opts.projectRoot` (root of scanned project). Undocumented — callers assume .gsd-t/scan/ | Could conflict with project files |
| `.gsd-t/CONTEXT.md` | Still no contract for format or lifecycle (TD-070 — carried) | Inconsistent CONTEXT.md across milestones |
| `.gsd-t/continue-here-{timestamp}.md` | Still no contract (TD-070 carried) | Resume edge cases |
| `.gsd-t/deferred-items.md` | Still no contract (TD-070 carried) | No tooling can parse it |

---

## Summary of Contract Drift

| Contract | Status | Priority |
|----------|--------|----------|
| event-schema-contract.md | DRIFTED — session_start/end in contract but not in code | HIGH — code and contract conflict |
| scan-diagrams-contract.md | DRIFTED — MCP renderer in contract, not in code | HIGH — contract promises behavior that doesn't exist |
| qa-agent-contract.md | DRIFTED (carried from #6) — partition/plan still listed | HIGH — carried unresolved 4+ milestones |
| wave-phase-sequence.md | PARTIAL (carried from #6) — missing M11/M12 additions | MEDIUM |
| progress-file-format.md | PARTIAL (carried from #6) — missing M11-M13 artifacts | MEDIUM |
| dashboard-server-contract.md | MOSTLY CURRENT — parent_agent_id null vs "" inconsistency | LOW |
| scan-schema-contract.md | CURRENT | None |
| integration-points.md | UNDERDOCUMENTED (carried) | MEDIUM |
| pre-commit-gate.md | CURRENT | None |
| backlog-file-formats.md | CURRENT | None |
| backlog-command-interface.md | CURRENT | None |
| domain-structure.md | CURRENT | None |
