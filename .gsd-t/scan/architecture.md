# Architecture Analysis — Scan #8 (2026-03-09)

## Project: GSD-T Framework (@tekyzinc/gsd-t) — v2.34.10

## Overview

GSD-T is an npm-distributed methodology framework for Claude Code. It provides slash commands (markdown files), a CLI installer (Node.js), and document templates for contract-driven development with AI assistance. There is no traditional runtime — command files are interpreted by Claude Code's slash command system, and the CLI handles lifecycle management.

**Architecture Pattern**: Distributed Markdown Instruction System with CLI Lifecycle Manager.

---

## Component Inventory

| Component | File(s) | Lines | Purpose |
|-----------|---------|-------|---------|
| CLI Installer | `bin/gsd-t.js` | 1,509 | Install, update, diagnose, manage GSD-T |
| Slash Commands | `commands/*.md` | 48 files | Workflow methodology for Claude Code |
| Templates | `templates/*.md` | 9 files | Project initialization starters |
| Heartbeat Hook | `scripts/gsd-t-heartbeat.js` | ~181 | Event logging via Claude Code hooks |
| Event Writer | `scripts/gsd-t-event-writer.js` | 124 | Structured JSONL event appends |
| Dashboard Server | `scripts/gsd-t-dashboard-server.js` | 140 | Zero-dep SSE server |
| State Utility CLI | `scripts/gsd-t-tools.js` | 163 | State get/set, validate, list |
| Statusline | `scripts/gsd-t-statusline.js` | 94 | Context bar for Claude Code |
| Auto-Route Hook | `scripts/gsd-t-auto-route.js` | 39 | UserPromptSubmit routing hook |
| Update Check Hook | `scripts/gsd-t-update-check.js` | 79 | SessionStart auto-update |
| npm Update Check | `scripts/npm-update-check.js` | 43 | Background version checker |
| Version Fetch | `scripts/gsd-t-fetch-version.js` | 26 | Sync npm registry fetch |
| Schema Extractor | `bin/scan-schema.js` | 77 | ORM/DB schema detection |
| Schema Parsers | `bin/scan-schema-parsers.js` | 199 | 7 ORM-type parsers |
| Diagram Orchestrator | `bin/scan-diagrams.js` | 77 | 6-diagram generation |
| Diagram Generators | `bin/scan-diagrams-generators.js` | 102 | Mermaid DSL generators |
| Diagram Renderer | `bin/scan-renderer.js` | 92 | mmdc -> d2 -> placeholder chain |
| HTML Report | `bin/scan-report.js` | 116 | Self-contained HTML report |
| Report Sections | `bin/scan-report-sections.js` | 74 | HTML section builders |
| Export | `bin/scan-export.js` | 49 | DOCX/PDF export via pandoc/md-to-pdf |
| **Total JS** | 19 files | **2,934 lines** | |

**Command count**: 48 (actual ls count) vs "46" stated in CLAUDE.md Overview — 2-file discrepancy (TD-087).

---

## Tech Stack

- **Language**: JavaScript (Node.js >= 16)
- **Package Manager**: npm
- **Distribution**: npm package (@tekyzinc/gsd-t)
- **Dependencies**: Zero external npm dependencies (built-ins only: fs, path, os, child_process, https, http)
- **Testing**: Node.js built-in test runner (`node --test`), 205 tests, 8 test files
- **Dashboard HTML**: React 17 + React Flow v11.11.4 + Dagre via CDN (gsd-t-dashboard.html, not shipped to npm)

---

## Architecture Layers

```
Layer 1: Lifecycle Management
  bin/gsd-t.js -- install, update, init, status, doctor, uninstall, update-all, register, changelog

Layer 2: Hook Scripts (~/.claude/scripts/)
  gsd-t-heartbeat.js    -- PostToolUse, SubagentStart/Stop hooks
  gsd-t-event-writer.js -- structured JSONL appender
  gsd-t-update-check.js -- SessionStart auto-update (NO module.exports -- TD-081)
  gsd-t-auto-route.js   -- UserPromptSubmit routing
  gsd-t-tools.js        -- state utility CLI (NO module.exports -- TD-066)
  gsd-t-statusline.js   -- context bar (NO module.exports -- TD-066)
  gsd-t-dashboard-server.js -- SSE server for dashboard
  npm-update-check.js   -- background version checker
  gsd-t-fetch-version.js -- sync npm fetch

Layer 3: Scan Modules (bin/)
  scan-schema.js + scan-schema-parsers.js -- ORM/schema detection
  scan-diagrams.js + scan-diagrams-generators.js -- diagram generation
  scan-renderer.js -- Mermaid/D2 rendering (execSync pattern -- TD-084)
  scan-report.js + scan-report-sections.js -- HTML report
  scan-export.js -- DOCX/PDF export (execSync pattern -- TD-084)

Layer 4: Methodology (commands/*.md)
  48 slash commands executed by Claude Code
```

---

## Data Flow

### Installation
```
npm install @tekyzinc/gsd-t
  -> bin/gsd-t.js install
    -> commands/*.md -> ~/.claude/commands/
    -> templates/CLAUDE-global.md -> ~/.claude/CLAUDE.md
    -> scripts/*.js -> ~/.claude/scripts/
    -> ~/.claude/settings.json (9 hooks configured)
    -> ~/.claude/.gsd-t-version
```

### Event Stream Flow (M14/M15)
```
Claude Code hook fires
  -> gsd-t-heartbeat.js (PostToolUse/SubagentStart/Stop)
  -> gsd-t-event-writer.js --type {type} ...
  -> .gsd-t/events/YYYY-MM-DD.jsonl (append)
  -> gsd-t-dashboard-server.js (SSE tail)
  -> gsd-t-dashboard.html (React Flow visualization)
```

### Scan Output Flow (M17)
```
gsd-t-scan (command file)
  -> scan-schema.js -> extractSchema() -> SchemaData
  -> scan-diagrams.js -> generateDiagrams() -> DiagramResult[6]
    -> scan-diagrams-generators.js (Mermaid DSL)
    -> scan-renderer.js -> tryMmdc() -> tryD2() -> placeholder
  -> scan-report.js -> generateReport() -> scan-report.html
    -> scan-report-sections.js (HTML section builders)
  -> bin/scan-export.js -> exportReport() -> .docx/.pdf
```

---

## Module Export Gaps

Three scripts lack module.exports and execute immediately when required:
- `scripts/gsd-t-tools.js` -- no require.main guard, no exports (TD-066)
- `scripts/gsd-t-statusline.js` -- no require.main guard, no exports (TD-066)
- `scripts/gsd-t-update-check.js` -- no require.main guard, no exports (TD-081)

All other scripts/bin modules correctly export functions and use `if (require.main === module)` guards.

---

## Count Summary

| Metric | CLAUDE.md / README | Actual | Delta |
|--------|-------------------|--------|-------|
| Slash commands | 46 | 48 | +2 |
| GSD-T workflow commands | 42 | 44 | +2 |
| Utility commands | 4 | 4 | 0 |
| JS files total | ~10 (est.) | 19 | +9 (scan modules) |
| Tests | 204 (progress.md) | 205 (npm test) | +1 |

---

## Known Architecture Concerns (Carried)

1. `bin/gsd-t.js` at 1,509 lines -- accepted deviation (zero-dep constraint)
2. Four-file sync requirement -- manual, not automated
3. Pre-Commit Gate is a mental checklist, not a git hook or CI
4. Progress.md Decision Log is unbounded append-only
5. `scan-report.html` written to project root, not `.gsd-t/scan/` (TD-092)
6. Dashboard does not watch for new JSONL files after date rollover (TD-085)
