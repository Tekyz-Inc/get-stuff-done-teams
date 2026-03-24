# Domain: global-metrics

## Responsibility
Implements the dual-layer learning architecture: project-local `.gsd-t/metrics/` (existing, read-only for this domain) plus global `~/.claude/metrics/` (new). Provides the global-sync-manager module that reads local rollups/rules and writes global aggregated files. Handles global rollup aggregation, global rule storage, and signal distribution comparison across projects.

## Owned Files/Directories
- `bin/global-sync-manager.js` — core module: read local metrics, write global metrics, compare signal distributions, aggregate rollups, manage universal rule promotion
- `~/.claude/metrics/` — global metrics directory (created on first write)
  - `~/.claude/metrics/global-rules.jsonl` — promoted rules from all projects (with source_project tag)
  - `~/.claude/metrics/global-rollup.jsonl` — aggregated rollup entries from all projects
  - `~/.claude/metrics/global-signal-distributions.jsonl` — per-project signal-type distributions for comparison
- `test/global-sync-manager.test.js` — unit tests for the module

## NOT Owned (do not modify)
- `bin/rule-engine.js` — owned by M26, read-only (USE disposition)
- `bin/patch-lifecycle.js` — owned by M26, read-only (USE disposition)
- `bin/metrics-collector.js` — owned by M25, read-only (USE disposition)
- `bin/metrics-rollup.js` — owned by M25, read-only (USE disposition)
- `.gsd-t/metrics/` — local metrics (read-only; this domain reads but does not write local files)
- `bin/gsd-t.js` — CLI installer (owned by cross-project-sync domain)
- `commands/*.md` — command files (owned by command-extensions domain)
