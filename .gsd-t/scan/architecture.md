# Architecture Analysis — 2026-03-09 (Scan #9, Post-M17)

## Stack
- Language: JavaScript (Node.js >= 16)
- Framework: None — pure Node.js built-ins
- Distribution: npm package (@tekyzinc/gsd-t)
- Dependencies: Zero external (fs, path, os, child_process, https, http only)
- Testing: Node.js built-in test runner (node:test)
- Tests at scan start: 205/205 passing
- Version at scan: 2.34.10

## Changes Since Scan #7 (2026-03-09)

Only two commits since M17 milestone:
1. `fix(dashboard): custom tooltip with portal z-index — hover no longer hidden behind sidebar` (d4567cf)
2. `Revert "fix(dashboard): custom tooltip with portal z-index..."` (3daeebb)

Net change: **zero** — the fix was reverted. `scripts/gsd-t-dashboard.html` is identical to the M17 state.

## Structure (Post-M17, unchanged)

```
bin/
  gsd-t.js                  — CLI installer (1,509 lines, all functions ≤30 lines)
  scan-schema.js            — NEW (M17): ORM/DB schema detector + extractor (77 lines)
  scan-schema-parsers.js    — NEW (M17): 7 ORM parsers (Prisma, TypeORM, Drizzle, Mongoose, Sequelize, SQLAlchemy, raw-SQL) (199 lines)
  scan-diagrams.js          — NEW (M17): Diagram orchestrator — 6 diagram types (77 lines)
  scan-diagrams-generators.js — NEW (M17): Mermaid source generators (102 lines)
  scan-renderer.js          — NEW (M17): SVG renderer chain (inline Mermaid JS, fallback to placeholder) (92 lines)
  scan-report.js            — NEW (M17): Self-contained HTML report generator (116 lines)
  scan-report-sections.js   — NEW (M17): HTML section builders (74 lines)
  scan-export.js            — NEW (M17): Export subcommand handler (DOCX/PDF stubs) (49 lines)
commands/                   — 48 slash commands (44 GSD-T + 4 utility)
  gsd-t-*.md                — 44 workflow commands
  gsd.md, branch.md, checkin.md, Claude-md.md — utility
scripts/
  gsd-t-heartbeat.js        — Claude Code hook event logger (233 lines)
  gsd-t-dashboard-server.js — NEW (M15): SSE-based real-time event dashboard server (140 lines)
  gsd-t-event-writer.js     — NEW (M15): Structured JSONL event appender CLI (124 lines)
  gsd-t-auto-route.js       — NEW (M16): Auto-route hook script (39 lines)
  gsd-t-update-check.js     — NEW (M16): SessionStart version/update checker (79 lines)
  gsd-t-dashboard.html      — NEW (M15): Real-time agent dashboard browser UI (199 lines)
  gsd-t-dashboard-mockup.html — NEW (M15): Dashboard mockup/reference
  npm-update-check.js       — Background version checker (42 lines)
  gsd-t-fetch-version.js    — Synchronous version fetch (25 lines)
  gsd-t-tools.js            — State utility CLI (163 lines) [NO module.exports — TD-066 still open]
  gsd-t-statusline.js       — Context statusline script (94 lines) [NO module.exports — TD-066 still open]
templates/                  — 9 document templates
test/                       — 7 test files (+ verify-gates.js), 205 tests total
  scan.test.js              — NEW (M17): 47 tests for scan subsystem
  dashboard-server.test.js  — NEW (M15): tests for dashboard server
  event-stream.test.js      — NEW (M15): tests for event writer/stream
  cli-quality.test.js       — existing
  filesystem.test.js        — existing
  helpers.test.js           — existing
  security.test.js          — existing
  verify-gates.js           — NEW (M17): HTML gate validation
docs/                       — Living docs (Updated: Post-M6 scan)
.gsd-t/                     — Project state (contracts, domains, progress, events, scan)
```

## Architecture Concerns (Scan #8 Assessment)

### AC-1 (carried from Scan #6/#7): gsd-t-tools.js and gsd-t-statusline.js have no module.exports
Still unresolved. Both scripts execute immediately when required. Zero test coverage for these scripts.

### AC-2 (carried): gsd-t-tools.js findProjectRoot falls back to cwd on failure
Still unresolved. gsd-t-statusline.js correctly returns null; tools.js returns cwd.

### AC-3 (carried): deferred-items.md not initialized or health-checked
Still unresolved. Referenced by execute/quick/debug but not created by init or health-checked.

### AC-7 (carried from Scan #7): gsd-t-update-check.js uses execSync for npm and gsd-t commands
Lines 61-64: `execSync('npm install -g @tekyzinc/gsd-t@' + latest)` and `execSync('gsd-t update-all')`. The version string `latest` comes from npm registry — potentially attacker-controlled. Still unresolved.

### AC-8 (carried from Scan #7): scan-export.js is a stub — export formats not implemented
bin/scan-export.js validates format (html/docx/pdf) but DOCX and PDF export are stubs that return success:false. Still unresolved.

### AC-9 (carried from Scan #7): gsd-t-dashboard-server.js only watches newest JSONL file
tailEventsFile() watches only the getNewestJsonl() file at server start. Date rollover not handled. Still unresolved.

### AC-11 (carried from Scan #7): Command count mismatch — 48 files found, CLAUDE.md says 46
Still unresolved. CLAUDE.md says "46 slash commands (42 GSD-T workflow + 4 utility)" but `ls commands/*.md` = 48 files.

### AC-12 (NEW — Scan #8): gsd-t-dashboard.html loads 5 external CDN resources
`scripts/gsd-t-dashboard.html` loads React, ReactDOM, dagre, and ReactFlow from unpkg.com CDN (lines 6-10). Unlike scan-report.html (which is fully self-contained), the dashboard requires internet access to render. This creates:
- Privacy risk: browsing behavior observable by unpkg.com/Cloudflare when dashboard is opened
- Availability risk: dashboard fails without internet access
- Security risk: unpkg.com CDN resources could be modified or injected
- Inconsistency: scan-report.html is self-contained; dashboard is not
This is architecturally inconsistent with the zero-external-dependency principle applied to the rest of the codebase.

### AC-13 (NEW — Scan #8): dashboard tooltip fix attempted and reverted — tooltip bug unresolved
The `fix(dashboard): custom tooltip with portal z-index` was reverted. The underlying bug (hover tooltip hidden behind sidebar) remains unresolved. This is a UX defect carried forward after the milestone.

## Data Flow (Complete Picture)

### Scan Flow (M17 addition)
```
gsd-t-scan.md Step 2.5 → scan-schema.js.extractSchema(projectRoot)
  → detectOrm() → scan-schema-parsers.js (one of 7 parsers)
  → returns: { detected, ormType, entities[], parseWarnings[] }
Step 3.5 → scan-diagrams.js.generateDiagrams(analysisData, schemaData, opts)
  → scan-diagrams-generators.js (genSystemArchitecture, genAppArchitecture, etc.)
  → scan-renderer.js.renderDiagram(mmd, type, opts) → SVG or placeholder HTML
  → returns: diagrams[] array
Step 8 → scan-report.js.generateReport(analysisData, schemaData, diagrams, opts)
  → scan-report-sections.js (buildMetricCards, buildDomainHealth, buildDiagramSection, etc.)
  → writes scan-report.html (self-contained, no external deps)
```

### Dashboard / Event Flow (M14)
```
Claude Code hook → gsd-t-event-writer.js --type {event_type} [args]
  → validateEvent() → appendEvent() → .gsd-t/events/YYYY-MM-DD.jsonl
gsd-t-dashboard-server.js → http://localhost:7433
  → GET / → serves gsd-t-dashboard.html (loads from CDN on client side)
  → GET /events → SSE stream: readExistingEvents() + tailEventsFile() (fs.watchFile)
  → GET /ping → { status: "ok", port }
  → GET /stop → graceful shutdown
```

### Auto-Update Flow (M15/M16)
```
Claude Code SessionStart → gsd-t-update-check.js
  → reads ~/.claude/.gsd-t-version
  → reads/refreshes ~/.claude/.gsd-t-update-check cache (1h TTL)
  → if newer: npm install -g @tekyzinc/gsd-t@{latest} + gsd-t update-all (execSync)
  → outputs: [GSD-T AUTO-UPDATE], [GSD-T UPDATE], or [GSD-T] v{ver}
```

## Patterns Observed

- Zero-dependency pattern: enforced across all bin/ and scripts/ JS modules (fs, path, os, child_process, http, https only). **Exception: gsd-t-dashboard.html loads CDN libraries on the client side — not a JS module but still a deviation from the spirit of zero-external-deps.**
- module.exports + require.main guard: followed by all NEW M14-M17 scripts (event-writer, dashboard-server, scan-* modules). NOT followed by gsd-t-tools.js and gsd-t-statusline.js (pre-M14 gap) and gsd-t-update-check.js / gsd-t-auto-route.js (new gap found in Scan #7).
- Error-first returns: scan modules return `{ error, detected, ... }` shaped objects; never throw
- Symlink check pattern: dashboard-server.js and event-writer.js both check lstatSync().isSymbolicLink() before reading/writing
- Mermaid-first with placeholder fallback: scan-diagrams.js gracefully falls back to placeholder HTML on render failure

## Scan Metadata
- Scan date: 2026-03-09
- Previous scan: Scan #7 at v2.34.10 (2026-03-09)
- Commits since Scan #7: 2 (fix + revert — net zero change)
- Total JS files: ~19 (bin + scripts)
- Total JS lines: ~3,234 (bin) + ~974 (scripts) = ~4,208
- Command files: 48
- Test files: 7 + verify-gates.js = 8
- Total tests: 205 passing
