# Business Rules Analysis — Scan #8 (2026-03-09)

## Project: GSD-T Framework (@tekyzinc/gsd-t) — v2.34.10

**Total rules identified**: 47
**Undocumented rules** (not in contracts or CLAUDE.md): 8

---

## Core Workflow Rules

### BR-001: Wave Phase Ordering (Documented)
Phases execute in fixed order: PARTITION -> DISCUSS -> PLAN -> IMPACT -> EXECUTE -> TEST-SYNC -> INTEGRATE -> VERIFY -> COMPLETE. No phase may skip except Discuss.

### BR-002: Discuss Skip Heuristic (Documented)
Discuss is skippable only when ALL three conditions hold: (1) single domain, (2) no open questions in Decision Log, (3) all cross-domain contracts already exist.

### BR-003: Impact Gate Verdicts (Documented)
Three verdicts: PROCEED, PROCEED WITH CAUTION (continue unless user intervenes), BLOCK (stop and require user decision).

### BR-004: Verify Gate (Documented)
Milestone cannot complete without VERIFIED status. If VERIFY_FAILED: remediate and re-verify up to 2 attempts.

### BR-005: Gap Analysis Gate (Documented)
Requirements must reach 100% Implemented for scoped requirements before milestone completion. Auto-fix up to 2 cycles.

### BR-006: Deviation Rules in Execute (Documented)
Four-rule protocol: (1) Bug -> fix up to 3 attempts, then defer; (2) Missing dependency -> add minimum; (3) Blocker -> fix and log; (4) Architectural change -> STOP (Destructive Action Guard).

### BR-007: Per-Task Commit Format (Documented)
Execute enforces `feat({domain}/task-{N})` commit format after each task.

### BR-008: Between-Phase Spot-Check (Documented in architecture.md, NOT in wave contract -- TD-093)
After each phase agent completes, wave reads progress.md (status), runs git log (commits), verifies filesystem output. Re-spawns phase agent once on failure.

### BR-009: QA Blocking Rule (Documented)
QA failure BLOCKS phase completion. Lead cannot proceed until QA reports PASS or user explicitly overrides.

### BR-010: QA Phase Assignment (PARTIALLY documented -- qa-agent-contract.md lists stale phases)
QA runs: execute (Task subagent), integrate (Task subagent), test-sync (inline), verify (inline), complete-milestone (inline), quick (inline), debug (inline). NOT on partition or plan (removed M10). qa-agent-contract.md incorrectly lists partition and plan (TD-067/TD-093).

---

## Version and State Rules

### BR-011: Semantic Versioning Convention (Documented)
Major.Minor.Patch. Patch always 2 digits (>=10). New minor/major starts patch at 10 (not 0).

### BR-012: Version Bump Triggers (Documented)
Major: breaking changes/v1 launch. Minor: new features/completed feature milestones. Patch: bug fixes, minor improvements.

### BR-013: Status Enum Validation (Documented)
Valid statuses: READY, INITIALIZED, PARTITIONED, DISCUSSED, PLANNED, IMPACT_ANALYZED, EXECUTING, EXECUTED, TESTS_SYNCED, INTEGRATED, VERIFIED, VERIFY_FAILED, COMPLETED.

### BR-014: Wave Integrity Check (Documented)
Wave Step 1 verifies: (1) status is recognized, (2) active milestone identified, (3) at least one domain row defined. Stops on failure.

### BR-015: CONTEXT.md Locked Decisions (Documented)
Plan reads `.gsd-t/CONTEXT.md` and fails validation if any Locked Decision has no task mapping.

---

## Installation and Update Rules

### BR-016: Zero External Dependencies (Documented)
CLI installer must never use external npm packages. Node.js built-ins only.

### BR-017: Update Cache TTL (Documented)
Update check cache (`~/.claude/.gsd-t-update-check`) expires after 1 hour.

### BR-018: Auto-Update Flow (Partially documented)
SessionStart hook reads version, checks cache, if newer available: `npm install -g @tekyzinc/gsd-t@{latest}` then `gsd-t update-all`. Outputs [GSD-T AUTO-UPDATE] or [GSD-T UPDATE] banner.

### BR-019: Version String Validation (Documented in CLI, NOT applied in update-check)
Version strings must match `/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/`. Applied in CLI bin but NOT applied to the `latest` version fetched from npm registry before execSync use -- security gap (TD-082).

### BR-020: Project Name Validation (Documented)
Project names must match `/^[a-zA-Z0-9][a-zA-Z0-9._\- ]{0,100}$/`.

### BR-021: Registered Projects Filtering (Partially documented)
getRegisteredProjects() reads `~/.claude/.gsd-t-projects`, splits on `|` (inline comment separator), skips lines starting with `#`, filters to only existing directories.

---

## Security and File Write Rules

### BR-022: Symlink Check Before Write (Documented)
Every file write calls `isSymlink()` first. Every directory creation calls `hasSymlinkInPath()` for parent traversal. Skip with warning if symlink detected.

### BR-023: Exclusive File Creation (Documented)
Init operations use `{ flag: "wx" }` for atomic create-or-fail.

### BR-024: Session ID Regex Validation (Documented)
Heartbeat validates session_id format before use in path construction.

### BR-025: Input Size Limits (Documented)
Heartbeat stdin capped at 1MB. HTTP responses (npm registry) capped at 1MB.

### BR-026: Secret Scrubbing (Documented)
`scrubSecrets()` applied to all heartbeat log values and notification messages. `scrubUrl()` masks URL query params. 4 regex patterns with `/gi` flags.

### BR-027: HTTPS Only for Network Requests (Documented)
All external HTTP requests (npm registry) use HTTPS, 5s/8s timeouts.

### BR-028: Path Containment for npm Update Cache (Documented)
`npm-update-check.js` validates cache path stays within `~/.claude/` before writing.

---

## Event Stream Rules

### BR-029: JSONL One Event Per Line (Documented)
Events appended as single-line JSON. Multi-line values must escape newlines as `\n`.

### BR-030: Event Type Whitelist (PARTIALLY documented -- contract vs implementation mismatch)
Only 8 types accepted in event-writer.js: command_invoked, phase_transition, subagent_spawn, subagent_complete, tool_call, experience_retrieval, outcome_tagged, distillation. `session_start` and `session_end` listed in CONTRACT but NOT in VALID_EVENT_TYPES -- callers receive exit code 1 silently (TD-083).

### BR-031: Outcome Enum Whitelist (Documented)
Valid outcomes: success, failure, learning, deferred, null. Null = in-progress.

### BR-032: Daily File Rotation (Documented)
Event files rotate daily: `YYYY-MM-DD.jsonl` based on UTC date at write time.

### BR-033: Max Events on Dashboard Connect (Documented)
SSE stream sends up to 500 existing events on new client connection.

### BR-034: Dashboard File Watch -- Single File Only (Documented in contract, NOT fully implemented)
Dashboard server watches only the file newest at startup. Does NOT watch for new JSONL files created after date rollover (TD-085).

---

## Scan and Reporting Rules

### BR-035: Always Return 6 Diagrams (Documented)
`generateDiagrams()` must return exactly 6 DiagramResult objects. Failed diagrams get placeholder HTML, never null.

### BR-036: Renderer Chain Order (DRIFT -- contract says MCP first, code skips MCP)
Contract says: MCP -> mmdc -> d2 -> placeholder. Reality: mmdc -> d2 -> placeholder. MCP not implemented (TD-083).

### BR-037: D2 Renderer Scope (Documented)
D2 renderer only attempted for `system-architecture` and `data-flow` diagram types.

### BR-038: SVG Dimension Stripping (Documented)
Width and height attributes must be removed from rendered SVGs.

### BR-039: Schema Never Throws (Documented)
`extractSchema()` catches all errors and surfaces them in `parseWarnings[]`.

### BR-040: Single ORM Detection (Documented)
Only one ORM type returned even if multiple detected. Highest-confidence wins.

### BR-041: HTML Report Output Path (UNDOCUMENTED gap -- TD-092)
`scan-report.js` line 93 writes to `{projectRoot}/scan-report.html` (root), not `.gsd-t/scan/scan-report.html` as expected.

---

## Autonomy and Workflow Control Rules

### BR-042: Destructive Action Guard (Documented)
Always pause for user approval before: DROP TABLE, data-losing migrations, removing working files/endpoints, replacing architecture patterns.

### BR-043: Autonomy Level 3 Default (Documented)
Level 3 (Full Auto) is default unless project CLAUDE.md overrides. Only stop for: unrecoverable errors (2 attempts), fundamental ambiguity, milestone completion, destructive actions.

### BR-044: Pre-Commit Gate (Documented)
12-point checklist must run before every commit.

### BR-045: Four-File Sync on Command Change (Documented)
Any command file change requires updating: GSD-T-README.md, README.md, templates/CLAUDE-global.md, commands/gsd-t-help.md.

---

## Undocumented Rules (Not in Contracts)

### BR-U01: stateSet() Writes Value Directly Without Sanitization (TD-071)
`gsd-t-tools.js stateSet()` writes value parameter directly to progress.md without newline sanitization. A value containing `\n## Section` injects a new markdown section.

### BR-U02: findProjectRoot() Fallback Behavior Inconsistency (TD-074)
`gsd-t-tools.js findProjectRoot()` returns `process.cwd()` on failure. `gsd-t-statusline.js` correctly returns null. Inconsistent behavior.

### BR-U03: detectTool() Uses execSync with String Concatenation (TD-073 pattern)
`scan-export.js detectTool()` uses execSync with `'where "' + cmd + '"'` pattern.

### BR-U04: Dashboard SSE Has No Authentication (TD-090)
`/events` endpoint streams all events with `Access-Control-Allow-Origin: *`. No token or auth check. Localhost-only assumption is undocumented.

### BR-U05: PID File Has No Lifecycle Rules (TD-094)
Dashboard PID file written on --detach but no format contract, no gsd-t-health check, no live-process validation on --stop.

### BR-U06: continue-here Files Accumulate Without Cleanup (TD-077)
Multiple /pause invocations without /resume create multiple continue-here files. gsd-t-resume reads only the most recent. No cleanup mechanism.

### BR-U07: deferred-items.md Created Ad-Hoc (TD-075)
File referenced by execute/quick/debug but never created by gsd-t-init and not checked by gsd-t-health.

### BR-U08: Doctor Does Not Check Utility Scripts (TD-078)
`checkDoctorInstallation()` verifies command files but not gsd-t-tools.js and gsd-t-statusline.js presence in `~/.claude/scripts/`.
