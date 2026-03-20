# Brainstorm Notes — 2026-03-19

## Topic: Keeping Graph Indexes in Sync with Code Changes

**Question:** How should the native JSON graph and CGC/Neo4j indexes be updated automatically when code changes occur during a session?

---

### Ideas Worth Exploring

1. **Dirty Queue + PostToolUse Hook** — Extend existing heartbeat hook to append changed file paths to `.gsd-t/graph/dirty-queue.json`. Before any graph query, check queue and incrementally reindex only those files. Zero new dependencies, ~100 LOC.

2. **Two-Tier Staleness Detection (mtime → hash)** — Replace current "hash all files" check with git-style two-level: stat mtime first (instant), only hash if mtime changed. Makes "is anything stale?" near-zero cost even without dirty queue.

3. **CGC Incremental Bridge** — When CGC is available, use `add_code_to_graph` for per-file Neo4j updates (~0.05s/file) instead of full re-indexing. Dirty queue feeds both backends. Use stale-while-revalidate: return native results immediately, queue CGC update.

### Assumptions Challenged

- We assumed full reindex was necessary — but `isStale()` already returns `changedFiles` that the indexer ignores
- We assumed CGC needed full directory re-scans — but `add_code_to_graph` accepts single files incrementally
- We assumed we'd need a background daemon or fs.watch — but the PostToolUse hook already intercepts file writes

### Key Insight

**Don't optimize what doesn't hurt.** Full reindex is <100ms — invisible to the user. The right answer is the simplest: check staleness at command boundary (~5 lines), not an event-sourcing dirty-queue architecture (~150 lines). The dirty-queue becomes the right answer only when codebases grow past 500+ files. Until then, KISS wins.

### Research Findings

#### Landscape (existing tools)
- CGC has `watch_directory` (live filesystem monitoring) and `add_code_to_graph` (single-file, ~0.05s)
- Sourcegraph, GitHub code navigation, JetBrains all use incremental indexing triggered by file change events
- VS Code LSP uses `didChangeWatchedFiles` notifications — same pattern as PostToolUse
- tree-sitter supports incremental re-parsing of changed ranges

#### Alternatives Evaluated (Deep Analysis)
| Rank | Approach              | Freshness    | Latency      | Complexity | Winner?                          |
|------|-----------------------|--------------|--------------|------------|----------------------------------|
| 1    | Command-boundary      | Per-command  | <100ms (0 perceived) | ~5 LOC  | **YES — simplest, strongest** |
| 2    | Lazy (query-time)     | Per-query    | 5-15ms/query | ~20 LOC    | Partial (already exists)         |
| 3    | Reactive (hook+queue) | Near-instant | ~5ms/file    | ~150 LOC   | Overkill at <40 files            |
| 4    | Git hooks             | At commit    | Zero in-session | ~15 LOC | No — stale during Execute        |
| 5    | Continuous (fs.watch) | Real-time    | Zero         | ~200+ LOC  | No — fragile on Windows          |

**Critical finding:** Full reindex is <100ms for ~40 files. The dirty-queue pattern adds ~150 lines of complexity to save <100ms — not justified at current scale. Command-boundary reindex is the right answer: ~5 lines in graph-query.js, zero perceived latency (absorbed into command startup), zero new infrastructure.

#### Cross-Domain Analogies
| Domain | Pattern | Takeaway |
|--------|---------|----------|
| Database materialized views | Eager refresh on write | PostToolUse = trigger |
| CDN invalidation | Stale-while-revalidate | Serve native, async CGC |
| Event sourcing | Append-only change log | dirty-queue.json |
| React virtual DOM | Dirty checking + minimal diff | mtime-first, then hash |
| rsync | Delta sync | Only reparse changed files |
| Search engines (ES/Solr) | Near-real-time refresh | Configurable refresh interval |

### Recommended Architecture: Command-Boundary + CGC Bridge

```
GSD-T Command Invoked (execute, impact, scan, verify, etc.)
    ↓
graph-query.js — first query of this command
    ↓
Check: has 500ms passed since last staleness check?
    ├── No  → skip (de-duplicate rapid-fire queries within same command)
    └── Yes → indexProject(root)
                ├── isStale() internally checks MD5 hashes
                ├── No changes → no-op (<15ms)
                └── Changes found → full reindex (<100ms for 40 files)
    ↓
If CGC available AND stale:
    └── cgcQuery('add_code_to_graph', { directory: root })
    ↓
Query proceeds with fresh index
```

### Implementation Plan

**Phase 1: Command-Boundary Auto-Sync (~5 LOC)**
```javascript
// graph-query.js — add to query() before provider selection
let _lastCheckAt = 0;
// ...inside query():
const now = Date.now();
if (!_lastCheckAt || now - _lastCheckAt > 500) {
  _lastCheckAt = now;
  indexProject(projectRoot);  // isStale() inside; no-op if fresh
}
```

**Phase 2: CGC Sync at Command Boundary (~15 LOC)**
- When CGC is available AND `isStale()` returned true, call `add_code_to_graph`
- Gate on staleness to avoid CGC cold-start cost (~500ms) on every command

**Phase 3 (Future — 500+ files only): Dirty Queue**
- Only implement if full reindex exceeds 200ms
- Dirty queue + incremental patch for per-file updates
- PostToolUse hook writes changed paths to queue file

### Questions to Answer
- Should CGC sync be blocking or async (stale-while-revalidate)?
- At what file count threshold should we switch to dirty-queue approach?

### Parking Lot
- Dirty queue + PostToolUse hook (defer until 500+ file codebases)
- mtime-first staleness check (optimization if hash check becomes slow)
- fs.watch as optional "turbo mode" for large codebases
- Git diff integration for cross-session staleness detection
- Graph diff visualization in dashboard
