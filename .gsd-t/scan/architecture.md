# Architecture Analysis — Scan #10 (2026-03-19)

## Project: GSD-T Framework (@tekyzinc/gsd-t) — v2.38.10

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
| **Total JS**             | **27 files**                         | **4,888** | |
| **Total test files**     | **11 files**                         | **2,943** | |
| **Grand total JS**       | **38 files**                         | **7,831** | (including test files) |

**Command count**: 49 (actual `ls commands/*.md` count). CLAUDE.md Overview says "46 slash commands (42 GSD-T workflow + 4 utility)" — 3-file discrepancy (updated from TD-087).

---

## Tech Stack

- **Language**: JavaScript (Node.js >= 16)
- **Runtime**: Node.js v22.22.0 (current dev environment)
- **Package Manager**: npm
- **Distribution**: npm package (@tekyzinc/gsd-t)
- **Dependencies**: Zero external npm dependencies (built-ins only: fs, path, os, child_process, https, http, crypto)
- **Testing**: Node.js built-in test runner (`node --test`), 294 tests, 11 test files
- **Graph Engine**: Native regex-based indexer (275 entities) + CGC MCP provider (1,439 functions, 153 files, 41 modules via Neo4j)
- **Dashboard HTML**: React 17 + React Flow v11.11.4 + Dagre via CDN (gsd-t-dashboard.html, not shipped to npm)

---

## Architecture Layers

```
Layer 1: Lifecycle Management
  bin/gsd-t.js -- install, update, init, status, doctor, uninstall, update-all, register, changelog, graph

Layer 2: Graph Engine (NEW in M20)
  bin/graph-store.js       -- JSON file storage (.gsd-t/graph/ — 8 files)
  bin/graph-parsers.js     -- JS/TS/Python regex entity extraction
  bin/graph-overlay.js     -- GSD-T context mapper (domain/contract/req/test/debt/surface)
  bin/graph-indexer.js     -- Project indexer with incremental support + file walking
  bin/graph-cgc.js         -- CGC MCP provider (JSON-RPC stdio, 8 CGC tools, health cache)
  bin/graph-query.js       -- Abstraction layer (21 query types, 3 providers, fallback chain)

Layer 3: Hook Scripts (~/.claude/scripts/)
  gsd-t-heartbeat.js      -- PostToolUse, SubagentStart/Stop hooks
  gsd-t-event-writer.js   -- structured JSONL appender
  gsd-t-update-check.js   -- SessionStart auto-update (NO module.exports -- TD-081)
  gsd-t-auto-route.js     -- UserPromptSubmit routing
  gsd-t-tools.js          -- state utility CLI (NO module.exports -- TD-066)
  gsd-t-statusline.js     -- context bar (NO module.exports -- TD-066)
  gsd-t-dashboard-server.js -- SSE server for dashboard
  npm-update-check.js     -- background version checker
  gsd-t-fetch-version.js  -- sync npm fetch

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
Commands (21 graph-aware)
    │
    ▼
graph-query.js  ─── query(type, params, projectRoot) ───►  Result
    │
    ├── cgcProvider (graph-cgc.js)
    │     └── JSON-RPC → CGC MCP Server → Neo4j
    │
    ├── nativeProvider (graph-indexer.js + graph-store.js)
    │     └── Regex parsing → JSON files (.gsd-t/graph/)
    │
    └── grepProvider (graph-query.js inline)
          └── execSync grep → line-based results
```

**Graph Data Flow**:
1. `indexProject(root)` walks files, parses entities, writes to graph-store
2. `buildOverlay(root, entities)` enriches with domain/contract/requirement/test/debt/surface
3. `query(type, params, root)` routes to best provider, returns enriched entities

**Current Index Stats** (self-indexed):
- Native: 275 entities, stale=false
- CGC: 153 files, 1,439 functions, 41 modules (via Neo4j)
- Provider in use: CGC (priority 1)

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
- **Synchronous-first**: All file I/O is synchronous (readFileSync/writeFileSync). Async only in CGC MCP communication.
- **Provider pattern**: Graph engine uses pluggable provider interface with priority-based fallback
- **Overlay enrichment**: Code entities enriched with GSD-T context (domains, contracts, requirements, tests, debt, surfaces) via overlay mapper
- **Session caching**: Provider selection cached per session to avoid re-checking availability
- **Graceful degradation**: All graph queries work at reduced capability if CGC unavailable; commands work without graph entirely

---

## Architecture Concerns

- **Worktree contamination**: Graph indexer walks `.claude/worktrees/` directory and indexes worktree files alongside main project files. Dead code and duplicate detection includes worktree copies, producing false positives. DEFAULT_EXCLUDE should include `.claude` (it does) but the worktree is at project root level under `.claude/worktrees/` — the exclusion check only matches directory names in `walkFiles`, and `.claude` is already excluded. However, CGC indexes the full project including worktrees. This needs investigation.
- **Command count discrepancy**: 49 actual command files vs. "46" documented in CLAUDE.md Overview (TD-087, now 3 off)
- **execSync in grep provider**: graph-query.js uses `execSync` with string interpolation of user-controlled `params.entity` — command injection risk (NEW finding, see security.md)
- **Graph file paths**: Contract Rule 6 states paths MUST be relative but CGC provider returns absolute paths (contract drift)
- **Untestable scripts**: 3 scripts still lack module.exports (TD-066, TD-081)
