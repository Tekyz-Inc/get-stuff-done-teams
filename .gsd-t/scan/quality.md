# Code Quality Analysis — 2026-03-09 (Scan #9, Post-M17)

**Date:** 2026-03-09
**Version:** v2.34.10
**Previous scan:** Scan #8 at v2.34.10 (2026-03-09). No new code changes since Scan #8.
**Test baseline:** 205/205 passing (confirmed by running node --test).
**Focus:** Carried items from Scan #7/#8 assessment. All items remain open.

---

## Scan #7/#8 Open Item Status Assessment

| ID | Title | Status |
|----|-------|--------|
| TD-066 | gsd-t-tools.js / gsd-t-statusline.js no module.exports | OPEN — still unresolved |
| TD-067 | qa-agent-contract.md still lists partition/plan | OPEN — still unresolved |
| TD-068 | Living docs not updated post-M10-M17 | OPEN — docs stale for M14-M17 additions |
| TD-069 | wave-phase-sequence.md missing M11/M12 additions | OPEN — still unresolved |
| TD-070 | progress-file-format contract missing M11-M13 artifacts | OPEN — still unresolved |
| TD-071 | stateSet() markdown injection | OPEN — still unresolved |
| TD-072 | templateScope/templateTasks path traversal | OPEN — still unresolved |
| TD-073 | gsd-t-tools.js uses execSync | OPEN — still unresolved |
| TD-074 | findProjectRoot() returns cwd on failure | OPEN — still unresolved |
| TD-075 | deferred-items.md not initialized by init | OPEN — still unresolved |
| TD-076 | gsd-t-health --repair template check | OPEN — still unresolved |
| TD-077 | continue-here files accumulate | OPEN — still unresolved |
| TD-078 | Doctor doesn't check utility scripts | OPEN — still unresolved |
| TD-079 | infrastructure.md stale counts | OPEN — counts still stale (M14-M17 additions missing) |
| TD-080 | token-log.md / qa-issues.md unbounded growth | OPEN — still unresolved |

---

## New Findings — Scan #8 (carried into Scan #9)

### DC-NEW-02 (from Scan #8): Dashboard tooltip CSS fix was reverted — unresolved UX defect
- `scripts/gsd-t-dashboard.html`
- A fix was attempted in commit d4567cf to resolve hover tooltips being hidden behind the sidebar. The fix was reverted in commit 3daeebb. The underlying UX bug remains.
- **Impact**: LOW-MEDIUM — tooltip UX is broken for nodes near the sidebar edge. No functional regression.
- **Suggestion**: Re-attempt the tooltip fix with a different approach (e.g., absolute positioned tooltip within the graph container instead of a portal) or open a backlog item.

### CONV-NEW-05 (from Scan #8): gsd-t-dashboard.html has no automated tests
- `scripts/gsd-t-dashboard.html` (199 lines)
- The dashboard HTML file is tested indirectly via dashboard-server.test.js (server behavior) but no tests for the React app logic itself (event rendering, node layout, tooltip, SSE parsing).
- **Impact**: LOW-MEDIUM — tooltip regression was only caught manually. A Playwright/E2E test would catch UI regressions automatically.
- **Suggestion**: Add a basic Playwright test that loads the dashboard and verifies at least one event renders as a graph node.

---

## Dead Code (carried)

### DC-NEW-01 (carried from Scan #7): tryKroki() in scan-renderer.js is dormant — never called in sync path
- `bin/scan-renderer.js` lines 53-77
- tryKroki() returns a Promise but renderDiagram() is synchronous. Never called in production path.
- Impact: LOW — adds maintenance burden. Suggestion: Remove or document as future async enhancement.

---

## Duplication (carried)

### DUP-NEW-02 (carried from Scan #7): execSync + string interpolation pattern used 3 times across 3 new bin/ files
- `bin/scan-renderer.js`, `bin/scan-export.js`, `scripts/gsd-t-update-check.js`
- All pass paths via string interpolation instead of execFileSync array args. Addressed in SEC-N28, SEC-N29, SEC-N30.

### DUP-OLD-01 (carried): findProjectRoot() duplicated in gsd-t-tools.js and gsd-t-statusline.js
Still unresolved. Acceptable given zero-dependency constraint.

---

## Complexity Hotspots

All functions remain within 30-line limit. No changes since Scan #7. No new hotspots.

---

## Error Handling Gaps (carried)

### EH-NEW-03 (carried): scan-renderer.js tryMmdc/tryD2 swallow all exceptions silently
- Intentional for graceful degradation. Assessment: acceptable.

### EH-NEW-04 (carried): gsd-t-update-check.js has no version format validation before execSync
- See SEC-N28 for full details.

### EH-NEW-05 (carried): scan-report-sections.js buildDiagramSection does not escape svgContent
- Informational only — content is from trusted rendering pipeline.

---

## Test Coverage Gaps

### TCG-NEW-03 (carried): scan-renderer.js tryKroki() has zero test coverage
- Dormant async path, not tested. Impact: LOW.

### TCG-NEW-04 (carried): gsd-t-update-check.js has no module.exports — untestable
- Contains auto-update logic that modifies global npm installation with zero regression safety net.
- Impact: MEDIUM — same untestable-script pattern as TD-066.

### TCG-NEW-05 (carried): gsd-t-auto-route.js has no module.exports — untestable
- Routing logic untested at unit level. Impact: LOW — simple logic.

### TCG-CARRIED-01 (TD-066, carried): gsd-t-tools.js and gsd-t-statusline.js — still zero test coverage
- Primary finding from Scan #6 HIGH item. Unresolved after 5+ milestones.

### TCG-NEW-06 (from Scan #8, carried): gsd-t-dashboard.html React app has no E2E or UI tests
- 199-line React application with no test coverage beyond "server serves the file."
- Tooltip regression only caught manually. Impact: LOW-MEDIUM.

---

## Naming and Convention Issues

### CONV-NEW-03 (carried from Scan #7): Command count mismatch — 48 files in commands/, docs say 46
- `ls commands/*.md` = 48 files; CLAUDE.md says "46 slash commands"
- Discrepancy is 2 commands. Still unresolved.
- Remediation: Audit and update CLAUDE.md, README.md, GSD-T-README.md, gsd-t-help.md count.

### CONV-NEW-04 (carried from Scan #7): RendererName enum in scan-diagrams-contract.md lists 'mcp' but implementation has no MCP code
- Contract rule 7 promises MCP-first behavior; scan-renderer.js has no MCP code path.
- Still unresolved.

---

## Unresolved Developer Notes
No TODO, FIXME, HACK, or XXX comments found in any JS files.

---

## Performance Issues

### PERF-NEW-01 (carried from Scan #7): Dashboard server watches only the newest JSONL file at server-start
- UTC midnight rollover not handled. New events from the new day not streamed until server restart.
- Impact: MEDIUM for long-running dashboard sessions.

---

## Living Docs Staleness (Post-M17)

All four living docs remain stale. Noted in Scans #7 and #8; still not addressed.

| Doc | Missing Content |
|-----|-----------------|
| docs/architecture.md | gsd-t-dashboard-server.js, gsd-t-event-writer.js, gsd-t-auto-route.js, gsd-t-update-check.js, all 8 scan-*.js modules, dashboard.html, updated command count (45→48), updated test count (125→205) |
| docs/workflows.md | Dashboard launch workflow, event stream workflow, auto-route hook flow, auto-update flow, scan visual output workflow |
| docs/infrastructure.md | New scripts in Scripts table, updated test/command counts, scan-report.html output path, dashboard.html CDN deps |
| docs/requirements.md | REQ-024 through REQ-030 not yet reflected as implemented |

---

## Stale Dependencies
No npm dependencies — nothing to update. Zero supply chain attack surface on the Node.js side.
(Browser-side CDN dependencies in dashboard.html are pinned to fixed versions but not audited. See SEC-N37.)

## Scan #6 Open Item Status Assessment

| ID | Title | Status |
|----|-------|--------|
| TD-066 | gsd-t-tools.js / gsd-t-statusline.js no module.exports | OPEN — still unresolved |
| TD-067 | qa-agent-contract.md still lists partition/plan | OPEN — still unresolved |
| TD-068 | Living docs not updated post-M10-M13 | PARTIALLY RESOLVED — docs were updated post-Scan #6, but now stale again post-M14-M17 |
| TD-069 | wave-phase-sequence.md missing M11/M12 additions | OPEN — still unresolved |
| TD-070 | progress-file-format contract missing M11-M13 artifacts | OPEN — still unresolved |
| TD-071 | stateSet() markdown injection | OPEN — still unresolved |
| TD-072 | templateScope/templateTasks path traversal | OPEN — still unresolved |
| TD-073 | gsd-t-tools.js uses execSync | OPEN — still unresolved |
| TD-074 | findProjectRoot() returns cwd on failure | OPEN — still unresolved |
| TD-075 | deferred-items.md not initialized by init | OPEN — still unresolved |
| TD-076 | gsd-t-health --repair template check | OPEN — still unresolved |
| TD-077 | continue-here files accumulate | OPEN — still unresolved |
| TD-078 | Doctor doesn't check utility scripts | OPEN — still unresolved |
| TD-079 | infrastructure.md stale counts | PARTIALLY RESOLVED — but new staleness from M14-M17 |
| TD-080 | token-log.md / qa-issues.md unbounded growth | OPEN — still unresolved |

---

## Dead Code

### DC-NEW-01: tryKroki() in scan-renderer.js is dormant — never called in sync path
- `bin/scan-renderer.js` lines 53-77
- tryKroki() returns a Promise but renderDiagram() is synchronous. The function is defined but line 85 explicitly notes "skip in sync rendering path." It is never called. This is dead async code.
- Impact: LOW — adds maintenance burden (tests needed for untested async path). Lowers clarity.
- Suggestion: Either implement async render chain to use it, or remove it and note in contract that Kroki is planned but not yet implemented.

---

## Duplication

### DUP-NEW-02: execSync + string interpolation pattern used 3 times across 3 new bin/ files
- `bin/scan-renderer.js` tryMmdc (line 26), tryD2 (line 43)
- `bin/scan-export.js` exportToDocx (line 21), exportToPdf (line 29)
- `scripts/gsd-t-update-check.js` (lines 61, 64)
- All pass paths via string interpolation instead of execFileSync array args. Pattern is inconsistent with bin/gsd-t.js convention. Addressed in security findings SEC-N28, SEC-N29, SEC-N30.

### DUP-OLD-01 (carried): findProjectRoot() duplicated in gsd-t-tools.js and gsd-t-statusline.js
Still unresolved. Acceptable given zero-dependency constraint.

---

## Complexity Hotspots

All new functions in M14-M17 are within 30-line limit:
- scan-schema.js: largest function: detectOrm (24 lines) — OK
- scan-schema-parsers.js: largest function: parsePrisma (approx 30 lines) — at the limit
- gsd-t-dashboard-server.js: largest: handleEvents (7 lines) + readExistingEvents (11 lines) — OK
- scan-renderer.js: tryKroki (24 lines) — within limit

No complexity hotspots in new code.

---

## Error Handling Gaps

### EH-NEW-03: scan-renderer.js tryMmdc/tryD2 swallow all exceptions silently
- Lines 29, 44: `catch { return null; }` — any error in mmdc/d2 invocation returns null (treated as "not available"), which causes fallback to placeholder. This is intentional for graceful degradation.
- Assessment: Acceptable. The fallback mechanism is sound. No change needed.

### EH-NEW-04: gsd-t-update-check.js has no version format validation before execSync
- Line 44-52: `result` from the npm registry inline JS could be any string. Used directly in execSync line 61 without semver validation. See SEC-N28 for full details.
- Remediation: Validate with `/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/` before use.

### EH-NEW-05: scan-report-sections.js buildDiagramSection does not escape svgContent
- `bin/scan-report-sections.js` line 38: `'<div class="diagram-container">' + d.svgContent + '</div>'`
- svgContent is SVG/HTML from the renderer. If it contains malformed HTML (e.g., unclosed tags), it could break the report layout. In practice the content is either from mmdc (trusted), d2 (trusted), or the hardcoded PLACEHOLDER_HTML — so no XSS risk. Informational only.

---

## Test Coverage Gaps

### TCG-NEW-03: scan-renderer.js tryKroki() has zero test coverage
- The async Kroki path is never called in production code but exists in the module. Not tested in scan.test.js.
- Impact: LOW — dormant code, but if activated, there are no tests to catch regressions.

### TCG-NEW-04: gsd-t-update-check.js has no module.exports — untestable
- `scripts/gsd-t-update-check.js` (79 lines): Executes immediately when required. No exports.
- Contains auto-update logic (installs new npm package globally). This is significant behavior with no test coverage.
- Impact: MEDIUM — auto-update logic modifies the user's global npm installation. A bug here could install wrong versions or corrupt the GSD-T install.
- Assessment: This is similar to TD-066 (tools.js / statusline.js). The pattern of executing-at-require without exports is still appearing in new scripts.

### TCG-NEW-05: gsd-t-auto-route.js has no module.exports — untestable
- `scripts/gsd-t-auto-route.js` (39 lines): Reads stdin and writes to stdout. No exports.
- The routing logic (GSD-T project detection, slash-command detection) is tested indirectly by behavior but has no unit tests.
- Impact: LOW — simple logic, low risk.

### TCG-CARRIED-01 (TD-066): gsd-t-tools.js and gsd-t-statusline.js — still zero test coverage
These were the primary finding of Scan #6 HIGH item TD-066. Still unresolved after 4 milestones.

---

## Naming and Convention Issues

### CONV-NEW-03: Command count mismatch — 48 files in commands/, docs may say 46
- `ls commands/*.md` = 48 files
- CLAUDE.md says "46 slash commands (42 GSD-T workflow + 4 utility)"
- The discrepancy is 2 commands. Likely gsd-t-prd.md and gsd-t-reflect.md are new additions from M14-M17 that were not counted in CLAUDE.md.
- Remediation: Audit and update CLAUDE.md, README.md, GSD-T-README.md, gsd-t-help.md count.

### CONV-NEW-04: RendererName enum in scan-diagrams-contract.md lists 'mcp' but implementation has no MCP code
- Contract says: `'mcp' — MCP server (diagram-bridge-mcp | C4Diagrammer | mcp-mermaid)` as first renderer
- Implementation (scan-renderer.js line 81-88): only tries mmdc, d2, then placeholder. No MCP code path.
- This is a contract drift: the contract promises MCP-first behavior (contract rule 7: "MCP is checked before CLI chain"), but the implementation skips MCP entirely.

---

## Unresolved Developer Notes
No TODO, FIXME, HACK, or XXX comments found in any JS files.

---

## Performance Issues

### PERF-NEW-01: Dashboard server watches only the newest JSONL file at server-start
- When the UTC date rolls over (midnight), a new `.jsonl` file is created. The dashboard server continues to watch only the file that was newest at startup. New events from the new day are not streamed until server restart.
- Impact: MEDIUM for long-running dashboard sessions. LOW for typical daily use.
- Remediation: Use `fs.watch(eventsDir)` to detect new file creation, then start watching the new file.

---

## Living Docs Staleness (Post-M14-M17)

All four living docs need updates for M14-M17 additions:
| Doc | Missing Content |
|-----|-----------------|
| docs/architecture.md | gsd-t-dashboard-server.js, gsd-t-event-writer.js, gsd-t-auto-route.js, gsd-t-update-check.js, all 8 scan-*.js modules, updated command count (45→48), updated test count (125→205) |
| docs/workflows.md | Dashboard launch workflow, event stream workflow, auto-route hook flow, auto-update flow, scan visual output workflow |
| docs/infrastructure.md | New scripts in Scripts table, updated test/command counts, scan-report.html output path |
| docs/requirements.md | REQ-024 through REQ-030 not yet reflected as implemented in docs |

---

## Stale Dependencies
No npm dependencies — nothing to update. Zero supply chain attack surface.
