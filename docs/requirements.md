# Requirements — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-02-18 (Scan #4)

## Functional Requirements

| ID | Requirement | Priority | Status | Tests |
|----|-------------|----------|--------|-------|
| REQ-001 | CLI installer with install, update, status, doctor, init, uninstall, update-all, register, changelog subcommands | P1 | complete | manual CLI testing |
| REQ-002 | 39 GSD-T workflow slash commands for Claude Code (incl. QA agent) | P1 | complete | validated by use |
| REQ-003 | 4 utility commands (gsd smart router, branch, checkin, Claude-md) | P1 | complete | validated by use |
| REQ-004 | Backlog management system (7 commands: add, list, move, edit, remove, promote, settings) | P1 | complete | validated by use |
| REQ-005 | Contract-driven development with domain partitioning | P1 | complete | validated by use |
| REQ-006 | Wave orchestration (full cycle: partition → discuss → plan → impact → execute → test-sync → integrate → verify → complete) | P1 | complete | validated by use |
| REQ-007 | Heartbeat system via Claude Code hooks (9 events, JSONL output, 7-day cleanup) | P2 | complete | hook scripts installed |
| REQ-008 | Automatic update check against npm registry (1h cache, background refresh) | P2 | complete | CLI + slash command |
| REQ-009 | Document templates for living docs (9 templates with token replacement) | P1 | complete | used by gsd-t-init |
| REQ-010 | Smart router — natural language intent → command routing | P2 | complete | validated by use |
| REQ-011 | Triage and merge — auto-review, score, merge safe GitHub branches | P2 | complete | validated by use |
| REQ-012 | QA Agent — test-driven contract enforcement spawned in 10 phases | P1 | complete | validated by use |
| REQ-013 | Wave orchestrator — agent-per-phase execution with fresh context windows | P1 | complete | validated by use |

## Technical Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| TECH-001 | Zero external npm dependencies | P1 | complete |
| TECH-002 | Node.js >= 16 compatibility | P1 | complete |
| TECH-003 | Cross-platform support (macOS, Linux, Windows) | P1 | complete |
| TECH-004 | Semantic versioning with git tags | P1 | complete |
| TECH-005 | Pre-Commit Gate enforced on every commit | P1 | complete (manual, not automated) |
| TECH-006 | Symlink protection on all file write operations | P1 | complete |
| TECH-007 | Input validation on project names, versions, paths, session IDs | P1 | complete |

## Non-Functional Requirements

| ID | Requirement | Metric | Status |
|----|-------------|--------|--------|
| NFR-001 | CLI install completes quickly | < 5s | complete |
| NFR-002 | No runtime crashes on missing files | graceful fallback | complete |
| NFR-003 | Command files are pure markdown (no frontmatter) | 100% compliance | complete |
| NFR-004 | Heartbeat auto-cleanup prevents unbounded growth | 7-day TTL | complete |
| NFR-005 | Update check is non-blocking after first run | background process | complete |

## Test Coverage

| Requirement | Test File | Test Name | Status |
|-------------|-----------|-----------|--------|
| REQ-001 | test/helpers.test.js, test/filesystem.test.js | CLI subcommand + helper tests | passing (64 tests) |
| REQ-006 | test/cli-quality.test.js | Wave-related function tests (buildEvent, etc.) | passing (22 tests) |
| REQ-007 | test/security.test.js | Heartbeat security (scrubSecrets, scrubUrl) | passing (30 tests) |
| REQ-002–005, 008–013 | manual | Workflow validation by use | passing |

**Total automated tests**: 116 across 4 test files (M4, M5, M6). Runner: `node --test` (zero dependencies).

## Gaps Identified

### Open (Scan #4 — 2026-02-18)
- progress.md Status: ACTIVE not recognized by wave contract (TD-044)
- CHANGELOG.md missing M4-M7 entries (TD-045)
- Orphaned domain files from M6/M7 not deleted (TD-046)
- progress-file-format contract needs enriched format update (TD-047)
- See `.gsd-t/techdebt.md` for full list (13 items, all LOW-MEDIUM)

### Resolved (Milestones 3-7, 2026-02-18/19)
- ~~No automated test suite (TD-003)~~ — RESOLVED (116 tests, M4)
- ~~Command count 42→43 not updated (TD-022)~~ — RESOLVED (M3)
- ~~QA agent contract missing test-sync (TD-042)~~ — RESOLVED (M3)
- ~~Wave bypassPermissions not documented (TD-035)~~ — RESOLVED (M5)
- ~~All 15 scan #3 functions >30 lines (TD-021)~~ — RESOLVED (M6, all 80 functions ≤30 lines)
- ~~34 fractional step numbers (TD-031)~~ — RESOLVED (M7, all renumbered)
- ~~Backlog file format drift (TD-014)~~ — RESOLVED
- ~~Progress.md format drift (TD-015)~~ — RESOLVED
- ~~7 backlog commands missing from GSD-T-README (TD-016)~~ — RESOLVED
