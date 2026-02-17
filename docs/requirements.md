# Requirements — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-02-18

## Functional Requirements

| ID | Requirement | Priority | Status | Tests |
|----|-------------|----------|--------|-------|
| REQ-001 | CLI installer with install, update, status, doctor, init, uninstall, update-all, register, changelog subcommands | P1 | complete | manual CLI testing |
| REQ-002 | 37 GSD-T workflow slash commands for Claude Code | P1 | complete | validated by use |
| REQ-003 | 4 utility commands (branch, checkin, Claude-md, gsd smart router) | P1 | complete | validated by use |
| REQ-004 | Backlog management system (7 commands: add, list, move, edit, remove, promote, settings) | P1 | complete | validated by use |
| REQ-005 | Contract-driven development with domain partitioning | P1 | complete | validated by use |
| REQ-006 | Wave orchestration (full cycle: partition → plan → execute → test-sync → integrate → verify) | P1 | complete | validated by use |
| REQ-007 | Heartbeat system via Claude Code hooks | P2 | complete | hook scripts installed |
| REQ-008 | Automatic update check against npm registry | P2 | complete | CLI + slash command |
| REQ-009 | Document templates for living docs (9 templates) | P1 | complete | used by gsd-t-init |
| REQ-010 | Smart router — natural language intent → command routing | P2 | complete | validated by use |

## Technical Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| TECH-001 | Zero external npm dependencies | P1 | complete |
| TECH-002 | Node.js >= 16 compatibility | P1 | complete |
| TECH-003 | Cross-platform support (macOS, Linux, Windows) | P1 | complete |
| TECH-004 | Semantic versioning with git tags | P1 | complete |
| TECH-005 | Pre-Commit Gate enforced on every commit | P1 | complete |

## Non-Functional Requirements

| ID | Requirement | Metric | Status |
|----|-------------|--------|--------|
| NFR-001 | CLI install completes in < 5 seconds | < 5s | complete |
| NFR-002 | No runtime crashes on missing files | graceful fallback | complete |
| NFR-003 | Command files are pure markdown (no frontmatter) | 100% compliance | complete |

## Test Coverage

| Requirement | Test File | Test Name | Status |
|-------------|-----------|-----------|--------|
| REQ-001 | manual | CLI subcommand testing | passing |
| REQ-002–010 | manual | Workflow validation by use | passing |
