# Brainstorm Notes — 2026-03-19 (Session 2)

## Topic: Incremental Scan Doc Freshness

**Question:** How do scan docs stay fresh between full scans without 3-5 minute re-scans after every milestone?

---

### The Two-Layer Truth

Scan docs contain two types of content:

**STRUCTURAL (auto-patchable, no LLM needed):**
- File counts, LOC, component inventory tables
- Test counts, coverage summary
- Dependency lists, stale deps table
- TODO/FIXME grep results
- Consumer Surfaces and Shared Service Candidates tables
- Resolved/open status of tech debt items

**ANALYTICAL (requires LLM reasoning):**
- Security risk assessments and finding severity
- Architecture concerns and pattern observations
- Quality recommendations and code smell judgments
- Business rule documentation
- Shared Service Candidate identification (new candidates)

### Key Finding

The two commands that consume scan docs downstream (`feature`, `partition`) both rely **exclusively on STRUCTURAL sections** — Consumer Surfaces and Shared Service Candidates tables in `quality.md`. These are derivable from code/graph without LLM reasoning.

### Cross-Domain Research Findings

| Pattern | Source | Insight |
|---------|--------|---------|
| Trigger file sets | Snyk/Dependabot | Each scan dimension has specific files that invalidate it |
| Content hash cache | ESLint | Skip re-analysis if trigger files haven't changed |
| Semantic finding IDs | Terraform state | Track which files each finding covers + their hash |
| Make staleness visible | Terraform v0.15.4 | Never silently serve stale data |
| Delta reporting | Snyk-delta | After re-scan, surface only what changed |
| Config invalidation | ESLint | If scan rules change, invalidate ALL dimensions |
| Event sourcing | CQRS pattern | Findings as events, scan docs as projections |

### Recommended Architecture: D + E + Cache

**Phase 1: Post-Change Micro-Updates (~50 LOC)**
After execute/quick/debug, patch structural metadata:
- New file → append to architecture.md with [NEW] tag
- TD resolved → mark [RESOLVED] in techdebt.md
- Test added → update test-baseline.md count
- Dependency changed → update architecture.md + [NEEDS AUDIT] in quality.md
- Contract updated → [UPDATED] in contract-drift.md

**Phase 2: Staleness Warnings (~20 LOC)**
Commands that read scan docs check freshness:
- Count commits since last scan commit
- If >10 commits or >14 days → warn with specific impact
- Don't block — warn and let user decide

**Phase 3: Hash Cache + Trigger File Sets (~40 LOC)**
`.gsd-t/scan/.cache.json` with composite hashes per dimension.
Trigger file sets per dimension:
- security → package.json, *.lock, auth modules, env config
- test-baseline → test files, test config
- contract-drift → .gsd-t/contracts/*, domain boundary files
- architecture → all source files
- quality → all source files
Skip dimensions where trigger files haven't changed.

**Phase 4: Milestone Checkpoint**
Add full scan to complete-milestone when scan is older than milestone start.

### Change-Type to Dimension Invalidation Map

| Change Type | arch | security | quality | contract-drift | test-baseline |
|-------------|------|----------|---------|----------------|---------------|
| New file | Yes | Maybe | Yes | Maybe | No |
| Modified function | LOC only | Line refs | Complexity | If interface | No |
| Deleted module | Yes | Phantom refs | Yes | Yes | No |
| New dependency | Stack | Audit | Stale deps | No | No |
| Changed API | Data flow | Maybe | Surfaces | Yes | No |
| New test | No | No | Coverage | No | Yes |
| Refactor | Layer diagram | Line refs | Hotspots | Location refs | No |

### Implementation Priority

1. Phase 1 (micro-updates) — highest impact, lowest cost
2. Phase 2 (staleness warnings) — prevents silent degradation
3. Phase 4 (milestone checkpoint) — natural full refresh point
4. Phase 3 (hash cache) — makes scan itself incremental (biggest engineering effort)
