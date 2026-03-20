# Architecture Analysis — Scan #11 (2026-03-19)

## Project: GSD-T Framework (@tekyzinc/gsd-t) — v2.39.12

## Overview

GSD-T is an npm-distributed methodology framework for Claude Code. It provides slash commands (markdown files), a CLI installer (Node.js), document templates, and a code graph engine for contract-driven development with AI assistance. There is no traditional runtime — command files are interpreted by Claude Code's slash command system, and the CLI handles lifecycle management.

**Architecture Pattern**: Distributed Markdown Instruction System with CLI Lifecycle Manager + Code Graph Engine.

---

## Component Inventory

| Component                | File(s)                              | Lines | Purpose                                  |
|--------------------------|--------------------------------------|-------|------------------------------------------|
| CLI Installer            | `bin/gsd-t.js`                       | 1,798 | Install, update, diagnose, manage GSD-T  |
| Slash Commands           | `commands/*.md`                      | 49 files | Workflow methodology for Claude Code   |
| Templates                | `templates/*.md`                     | 10 files | Project initialization starters        |
| Graph Store              | `bin/graph-store.js`                 | 147   | JSON file graph persistence (.gsd-t/graph/) |
| Graph Parsers            | `bin/graph-parsers.js`               | 327   | JS/TS/Python regex entity extraction     |
| Graph Overlay            | `bin/graph-overlay.js`               | 195   | GSD-T context mapper (domain/contract/requirement/test/debt/surface) |
| Graph Indexer            | `bin/graph-indexer.js`               | 147   | Project indexer with incremental support |
| Graph CGC Provider       | `bin/graph-cgc.js`                   | 510   | CGC MCP provider (JSON-RPC over stdio)   |
| Graph Query              | `bin/graph-query.js`                 | 400   | Abstraction layer (21 query types, 3-provider fallback) |
| Heartbeat Hook           | `scripts/gsd-t-heartbeat.js`         | 233   | Event logging via Claude Code hooks      |
| Event Writer             | `scripts/gsd-t-event-writer.js`      | 125   | Structured JSONL event appends           |
| Dashboard Server         | `scripts/gsd-t-dashboard-server.js`  | 140   | Zero-dep SSE server                      |
| State Utility CLI        | `scripts/gsd-t-tools.js`             | 163   | State get/set, validate, list            |
| Statusline               | `scripts/gsd-t-statusline.js`        | 94    | Context bar for Claude Code              |
| Auto-Route Hook          | `scripts/gsd-t-auto-route.js`        | 39    | UserPromptSubmit routing hook            |
| Update Check Hook        | `scripts/gsd-t-update-check.js`      | 79    | SessionStart auto-update                 |
| npm Update Check         | `scripts/npm-update-check.js`        | 42    | Background version checker               |
| Version Fetch            | `scripts/gsd-t-fetch-version.js`     | 25    | Sync npm registry fetch                  |
| Schema Extractor         | `bin/scan-schema.js`                 | 103   | ORM/DB schema detection                  |
| Schema Parsers           | `bin/scan-schema-parsers.js`         | 199   | 7 ORM-type parsers                       |
| Scan Data Collector      | `bin/scan-data-collector.js`         | 153   | Aggregates scan markdown into data       |
| Diagram Orchestrator     | `bin/scan-diagrams.js`               | 79    | 6-diagram generation                     |
| Diagram Generators       | `bin/scan-diagrams-generators.js`    | 187   | Mermaid DSL generators                   |
| Diagram Renderer         | `bin/scan-renderer.js`               | 92    | mmdc -> d2 -> placeholder chain          |
| HTML Report              | `bin/scan-report.js`                 | 181   | Self-contained HTML report               |
| Report Sections          | `bin/scan-report-sections.js`        | 121   | HTML section builders                    |
| Export                   | `bin/scan-export.js`                 | 49    | DOCX/PDF export via pandoc/md-to-pdf     |
| **Total JS**             | **25 files**                         | **5,737** | |
| **Total test files**     | **11 files**                         | **5,771** | |
| **Grand total JS**       | **36 files**                         | **11,508** | (including test files) |

**Command count**: 49 (actual `ls commands/*.md` count). CLAUDE.md Overview says "46 slash commands (42 GSD-T workflow + 4 utility)" — 3-file discrepancy persists (updated from TD-087). Test count: 85 test/describe blocks across 11 test files.

---

## Tech Stack

- **Language**: JavaScript (Node.js >= 16)
- **Runtime**: Node.js v22.22.0 (current dev environment)
- **Package Manager**: npm
- **Distribution**: npm package (@tekyzinc/gsd-t), version 2.39.12
- **Dependencies**: Zero external npm dependencies (built-ins only: fs, path, os, child_process, https, http, crypto)
- **Testing**: Node.js built-in test runner (`node --test`), 85 test blocks, 11 test files
- **Graph Engine**: Native regex-based indexer (275 entities) + CGC MCP provider (1,439 functions, 153 files, 41 modules via Neo4j). Graph auto-sync enabled at command boundaries. Freshness detection on startup.
- **Dashboard HTML**: React 17 + React Flow v11.11.4 + Dagre via CDN (gsd-t-dashboard.html, not shipped to npm)

---

## Architecture Layers

```
Layer 1: Lifecycle Management
  bin/gsd-t.js -- install, update, init, status, doctor, uninstall, update-all, register, changelog, graph

Layer 2: Graph Engine (M20/M21 — ENHANCED in v2.39.11)
  bin/graph-store.js       -- JSON file storage (.gsd-t/graph/ — 8 files)
  bin/graph-parsers.js     -- JS/TS/Python regex entity extraction
  bin/graph-overlay.js     -- GSD-T context mapper (domain/contract/req/test/debt/surface)
  bin/graph-indexer.js     -- Project indexer with incremental support + file walking
  bin/graph-cgc.js         -- CGC MCP provider (JSON-RPC stdio, 8 CGC tools, health cache, retry + error reporting)
  bin/graph-query.js       -- Abstraction layer (21 query types, 3 providers, fallback chain, command injection hardening)

Layer 3: Hook Scripts (~/.claude/scripts/)
  gsd-t-heartbeat.js      -- PostToolUse, SubagentStart/Stop hooks, event logging
  gsd-t-event-writer.js   -- structured JSONL appender (.gsd-t/events/)
  gsd-t-update-check.js   -- SessionStart auto-update, version check
  gsd-t-auto-route.js     -- UserPromptSubmit auto-routing
  gsd-t-tools.js          -- state utility CLI (get/set/validate/list)
  gsd-t-statusline.js     -- context bar display
  gsd-t-dashboard-server.js -- SSE server (zero-dependency) for dashboard
  npm-update-check.js     -- background version checker
  gsd-t-fetch-version.js  -- sync npm registry fetch

Layer 4: Scan Modules (bin/)
  scan-schema.js + scan-schema-parsers.js   -- ORM/schema detection
  scan-data-collector.js                     -- scan data aggregator
  scan-diagrams.js + scan-diagrams-generators.js -- diagram generation
  scan-renderer.js                           -- Mermaid/D2 rendering (execSync -- TD-084)
  scan-report.js + scan-report-sections.js   -- HTML report
  scan-export.js                             -- DOCX/PDF export (execSync -- TD-084)

Layer 5: Methodology (commands/*.md)
  49 slash commands executed by Claude Code
```

---

## Graph Engine Architecture (M20/M21)

**Provider Fallback Chain**: CGC (priority 1) -> Native (priority 2) -> Grep (priority 3)

```
Commands (21 graph-aware) + Auto-Sync
    │
    ├── (v2.39.11+) Auto-sync at command boundary
    │     └── Fresh graph required: index + overlay before query
    │
    ▼
graph-query.js  ─── query(type, params, projectRoot) ───►  Result
    │
    ├── cgcProvider (graph-cgc.js)
    │     └── JSON-RPC → CGC MCP → Neo4j (with retry + error reporting)
    │
    ├── nativeProvider (graph-indexer.js + graph-store.js)
    │     └── Regex parsing → JSON files (.gsd-t/graph/)
    │
    └── grepProvider (graph-query.js inline)
          └── execSync grep → line-based results (command-injection hardened)
```

**Graph Data Flow**:
1. Auto-sync check: if stale, call `indexProject(root)` + `buildOverlay(root, entities)`
2. `indexProject(root)` walks files, parses entities, writes to graph-store
3. `buildOverlay(root, entities)` enriches with domain/contract/requirement/test/debt/surface
4. `query(type, params, root)` routes to best provider, returns enriched entities

**Current Index Stats** (self-indexed at v2.39.12):
- Native: 275 entities, 725 relationships, stale=false
- CGC: 153 files, 1,439 functions, 41 modules (via Neo4j)
- Provider in use: CGC (priority 1)
- Auto-sync frequency: command boundary check + startup freshness detection

---

## Data Flow

### CLI Install Flow
User → `npm install -g @tekyzinc/gsd-t` → `bin/gsd-t.js install` → copies commands/ to ~/.claude/commands/ → copies scripts/ to ~/.claude/scripts/ → creates settings.local.json → writes version to ~/.claude/.gsd-t-version

### Session Start Flow
Claude Code start → SessionStart hook → `gsd-t-update-check.js` checks npm version → auto-update if newer → `gsd-t-auto-route.js` registers prompt routing

### Command Execution Flow
User types `/user:gsd-t-{command}` → Claude Code loads `commands/gsd-t-{command}.md` → agent follows markdown instructions → reads/writes .gsd-t/ state files → commits changes

### Graph Query Flow (NEW)
Command needs code data → calls `query(type, params, root)` → provider chain: CGC (Tree-sitter via Neo4j) → native (regex-based JSON index) → grep fallback → returns enriched Entity/Import/etc.

---

## Patterns Observed

- **Zero-dependency**: All modules use only Node.js built-ins (fs, path, os, child_process, https, http, crypto)
- **Synchronous-first**: All file I/O is synchronous (readFileSync/writeFileSync). Async only in CGC MCP communication and dashboard SSE.
- **Provider pattern**: Graph engine uses pluggable provider interface with priority-based fallback chain
- **Overlay enrichment**: Code entities enriched with GSD-T context (domains, contracts, requirements, tests, debt, surfaces) via overlay mapper
- **Auto-sync on demand**: Graph freshness checked at command boundary; stale index triggers reindex + rebuild overlay (v2.39.11+)
- **Graceful degradation**: All graph queries work at reduced capability if CGC unavailable; commands work without graph entirely
- **Event streaming**: All command activity logged to `.gsd-t/events/{date}.jsonl` via PostToolUse hook for analysis and debugging

---

## Architecture Concerns

- **Worktree contamination (STILL PRESENT)**: Graph indexer walks `.claude/worktrees/` directory and indexes worktree files alongside main project files. Dead code and duplicate detection includes worktree copies, producing false positives. DEFAULT_EXCLUDE includes `.claude` but only for path name matching in `walkFiles`. CGC indexes full project including worktrees. Scan #11 observes 11 active worktrees (.claude/worktrees/{name}/) all containing project copies.
- **Command count discrepancy (PERSISTS)**: 49 actual command files vs. "46" documented in CLAUDE.md Overview (TD-087). 3-file gap likely includes: gsd.md (smart router), branch.md, checkin.md, Claude-md.md, or global-change.md (utility commands).
- **execSync grep provider (HARDENED in v2.39.11)**: graph-query.js grep provider no longer uses string interpolation; command injection risk remediated per security.test.js validation.
- **Graph file paths (DRIFT NOTED)**: Contract Rule 6 requires paths MUST be relative; CGC provider returns absolute paths. Impact unknown — needs path normalization audit.
- **Untestable scripts (UNCHANGED)**: gsd-t-update-check.js, gsd-t-tools.js, gsd-t-statusline.js still lack module.exports for unit testing (TD-066, TD-081).
