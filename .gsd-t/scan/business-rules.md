# Business Rules — 2026-03-09 (Scan #9, Post-M17)

## Scan Context
Package: @tekyzinc/gsd-t v2.34.10
Previous scan: Scan #8 at v2.34.10 (2026-03-09)
Changes since Scan #8: No new code changes. All Scan #8 business rules carried forward.
Test baseline: 205/205 passing.

---

## Existing Rules (Scan #7) — Status Check

All rules from Scan #7 remain in effect. The tooltip fix+revert had no effect on business logic. Additions and new observations below.

---

## Dashboard UI Rules (Scan #8 additions)

### Rule: Dashboard tooltip renders via CSS position:fixed — known bug
The tooltip for node hover in the agent graph is implemented as a CSS `position:fixed` overlay. A prior fix attempted to use a React portal to render tooltips above the sidebar z-index layer; this fix was reverted. Current behavior: tooltips may be hidden behind the sidebar when hovering nodes near the right edge of the graph canvas.
- **Impact**: UX defect only. No data loss or behavioral correctness issue.
- **Status**: Unresolved — fix was reverted.

### Undocumented: Dashboard loads only from filesystem (no bundler)
`gsd-t-dashboard.html` is a single HTML file served by `gsd-t-dashboard-server.js`. It loads React, dagre, and ReactFlow from CDN at runtime. No build step. This means:
- Version pinning is by URL query string (`react@17`, `reactflow@11.11.4`)
- unpkg serves the UMD builds of these packages
- There is no lock file or integrity check for the browser-side dependencies

---

## Auto-Route Rules (M16 — gsd-t-auto-route.js, carried)

### Rule: Plain-text prompts in GSD-T projects are auto-routed via /gsd
1. Hook reads stdin JSON `{ prompt, cwd, session_id }`
2. If `.gsd-t/progress.md` does NOT exist in cwd → exit silently (not a GSD-T project)
3. If prompt starts with `/` → exit silently (user typed a command)
4. If prompt is empty → exit silently
5. If plain text in a GSD-T project → emit `[GSD-T AUTO-ROUTE]` signal

### Undocumented: Auto-route only fires for UserPromptSubmit hook
The auto-route behavior only activates when installed as a UserPromptSubmit hook. If not configured in `.claude/settings.json`, auto-route never fires. No validation that the hook is installed.

---

## Auto-Update Rules (M16 — gsd-t-update-check.js, carried)

### Rule: Version update cache is 1 hour TTL
Cache file at `~/.claude/.gsd-t-update-check`. If stale (>1h), fetch latest from npm registry.

### Rule: Auto-update installs and runs update-all atomically
If new version available: `npm install -g @tekyzinc/gsd-t@{latest}` then `gsd-t update-all` (in that order). If either fails, falls back to manual update notice `[GSD-T UPDATE]`.

### Rule: Version file at ~/.claude/.gsd-t-version is the source of truth
If the file does not exist, script exits silently (no banner).

### Undocumented: Auto-update runs every SessionStart
gsd-t-update-check.js is invoked on every Claude Code SessionStart. The npm registry is only queried if cache is stale (>1h), but the version comparison runs every time.

---

## Event Logging Rules (M14 — gsd-t-event-writer.js, carried)

### Rule: Event schema is closed for M14
Exactly 9 fields: ts, event_type, command, phase, agent_id, parent_agent_id, trace_id, reasoning, outcome.

### Rule: Valid event_types (8 types)
command_invoked, phase_transition, subagent_spawn, subagent_complete, tool_call, experience_retrieval, outcome_tagged, distillation.

### Rule: Valid outcomes (5 values)
success, failure, learning, deferred, null (null means in-progress).

### Rule: Events file rotates daily by UTC date
File: `.gsd-t/events/YYYY-MM-DD.jsonl`. New file created each UTC day. Append-only.

### Rule: Symlink check before write
Event writer checks `lstatSync().isSymbolicLink()` before writing. Returns exit code 2 if symlink detected.

### Undocumented: event_type 'session_start' / 'session_end' listed in contract but not in VALID_EVENT_TYPES set
event-schema-contract.md lists `session_start` and `session_end` as event types. The VALID_EVENT_TYPES set in gsd-t-event-writer.js has 8 items — but `session_start` and `session_end` are NOT in the set. Attempting to write a `session_start` event fails with exit code 1.

---

## Dashboard Server Rules (M14 — gsd-t-dashboard-server.js, carried)

### Rule: Maximum 500 events loaded on SSE connect
readExistingEvents() caps at MAX_EVENTS = 500. Older events are discarded.

### Rule: Server watches only the newest JSONL file at startup
tailEventsFile() watches the file returned by getNewestJsonl() at server start time. New files created after server start are not picked up.

### Rule: Keepalive every 15 seconds on SSE stream
Sends `: keepalive\n\n` every 15s to prevent connection timeout.

### Rule: PID file at .gsd-t/dashboard.pid written on --detach
Server writes its PID to the file on detach. Deletes it on clean SIGTERM/SIGINT.

### Undocumented: --stop uses process.kill(pid) — cross-platform risk
On Windows, `process.kill(pid)` with SIGTERM defaults to a forceful kill. The server may not clean up its PID file before dying.

---

## Scan Visual Output Rules (M17, carried)

### Rule: extractSchema() never throws
All ORM detection and parsing wrapped in try/catch. Returns `{ detected: false, ... }` on any failure.

### Rule: generateDiagrams() always returns exactly 6 DiagramResult objects
One per type in fixed order. Failed diagrams receive placeholder, not null.

### Rule: Database schema diagram requires detected=true
If schemaData.detected is false, diagram #6 (database-schema) is automatically a placeholder.

### Rule: generateReport() writes self-contained HTML with no external resources
verify-gates.js enforces: no external link stylesheet, no `src="https://"`, has DOCTYPE, has 6 diagram sections.
**Note: This rule applies to scan-report.html only. gsd-t-dashboard.html is intentionally not self-contained.**

### Rule: scan-export.js does NOT export HTML — only docx/pdf
exportReport() returns error for any format other than 'docx' or 'pdf'.

### Rule: scan-export.js checks for required tools before attempting export
pandoc must be on PATH for docx export; `npx md-to-pdf` must be available for pdf export.

---

## Undocumented Rules (logic with no comments or docs)

| File | Location | What it does | Risk if changed |
|------|----------|--------------|-----------------|
| gsd-t-event-writer.js | VALID_EVENT_TYPES | session_start/session_end NOT in set despite being in contract | Heartbeat cannot write session events through event-writer |
| gsd-t-update-check.js | line 40 | Cache TTL is exactly 1 hour (3600000 ms) — hardcoded | Changing this changes update check frequency globally |
| gsd-t-dashboard-server.js | getNewestJsonl() | Sorts files alphabetically — relies on YYYY-MM-DD naming for correct order | Non-date filenames would sort incorrectly |
| scan-renderer.js | tryD2() | Always writes generic 'app -> db: query' regardless of mmdContent | d2 diagram is never meaningful — always shows generic arch |
| scan-report.js | line 92-93 | outputPath always in opts.projectRoot (no scan/ subdirectory) | scan-report.html is written to project root, not .gsd-t/scan/ |
| gsd-t-dashboard.html | CDN URLs | Version pins by URL (react@17, reactflow@11.11.4) — no SRI | CDN compromise or version float could run malicious code |
