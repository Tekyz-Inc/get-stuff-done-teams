# Architecture Analysis — 2026-02-18 (Scan #6, Post-M10-M13)

## Stack
- Language: JavaScript (Node.js >= 16)
- Framework: None — pure Node.js built-ins
- Distribution: npm package (@tekyzinc/gsd-t)
- Dependencies: Zero external (fs, path, os, child_process, https only)
- Testing: Node.js built-in test runner (node:test)
- Tests at scan start: 125/125 passing
- Version at scan: 2.28.10

## Structure (Post-M13)

```
bin/gsd-t.js            — CLI installer (1,438 lines, all functions ≤30 lines)
commands/               — 45 slash commands (41 GSD-T + 4 utility)
  gsd-t-*.md            — 41 workflow commands (includes NEW: health, pause)
  gsd.md, branch.md, checkin.md, Claude-md.md — utility
scripts/
  gsd-t-heartbeat.js    — Claude Code hook event logger (180 lines)
  npm-update-check.js   — Background version checker (43 lines)
  gsd-t-fetch-version.js — Synchronous version fetch (26 lines)
  gsd-t-tools.js        — NEW (M13): state utility CLI (163 lines) [NO module.exports]
  gsd-t-statusline.js   — NEW (M13): statusline script (94 lines)  [NO module.exports]
templates/              — 9 document templates
test/                   — 4 test files, 125 tests
docs/                   — Living docs (Last Updated: Post-M9 / Scan #5 — STALE)
.gsd-t/                 — Project state (contracts, domains, progress)
```

## New Components Added by M10-M13

### M10: Token Efficiency
- QA agent removed from partition and plan phases (was spawning unnecessarily)
- execute/integrate: QA spawned as Task subagent (not team member)
- test-sync/verify/complete-milestone: QA runs inline
- quick, debug, scan, status: wrapped in Step 0 subagent self-spawn for fresh context

### M11: Execution Quality
- Deviation Rules (4-rule protocol + 3-attempt limit) added to execute, quick, debug
- Per-task atomic commits enforced in execute: feat({domain}/task-{N})
- Wave spot-check added between each phase (status + git + filesystem verification)
- `.gsd-t/deferred-items.md` introduced as new state file (referenced but not in init)

### M12: Planning Intelligence
- discuss creates `.gsd-t/CONTEXT.md` (Locked Decisions / Deferred Ideas / Claude's Discretion)
- plan reads CONTEXT.md; every Locked Decision must map to a task
- plan writes REQ-ID traceability table to docs/requirements.md
- plan spawns plan validation checker Task subagent (max 3 iterations)
- verify marks matched requirements complete, reports orphans

### M13: Tooling & UX
- scripts/gsd-t-tools.js: state utility CLI — state get/set, validate, parse, list, git pre-commit-check, template scope/tasks
- scripts/gsd-t-statusline.js: context usage bar + project state for Claude Code statusLine setting
- commands/gsd-t-health.md: validates .gsd-t/ structure, optionally repairs with --repair
- commands/gsd-t-pause.md: creates .gsd-t/continue-here-{timestamp}.md with exact position
- commands/gsd-t-resume.md: updated to read continue-here files first
- commands/gsd-t-plan.md: wave groupings written to integration-points.md
- commands/gsd-t-execute.md: reads wave groupings for parallel scheduling
- bin/gsd-t.js: installUtilityScripts() installs gsd-t-tools.js and gsd-t-statusline.js

## Data Flow Additions (M10-M13)

### CONTEXT.md Flow (M12)
```
discuss → .gsd-t/CONTEXT.md (Locked Decisions written)
plan → reads CONTEXT.md → maps each Locked Decision to tasks
execute → implements tasks
```

### Continue-Here Flow (M13)
```
/pause → gsd-t-pause.md → reads progress.md + domains/*/tasks.md
  → creates .gsd-t/continue-here-{timestamp}.md
/resume → gsd-t-resume.md → globs continue-here-*.md → reads most recent
  → deletes file after reading → resumes from Next Action
```

### Wave Grouping Flow (M13)
```
plan → writes ## Wave Execution Groups to integration-points.md
execute → reads wave groups → executes wave-by-wave
  → within wave: parallel (team mode) or interleaved (solo)
  → between waves: CHECKPOINT (contract compliance verification)
```

### State Utility CLI (M13)
```
Claude Code / user → node scripts/gsd-t-tools.js [cmd] [args]
  state get/set → reads/writes .gsd-t/progress.md
  validate → checks required file presence
  list domains/contracts → reads .gsd-t/ directories
  git pre-commit-check → runs hardcoded git commands (safe)
  template scope/tasks → reads .gsd-t/domains/{domain}/*.md [PATH TRAVERSAL RISK]
```

## Architecture Concerns

### AC-1: gsd-t-tools.js and gsd-t-statusline.js have no module.exports
Both scripts execute immediately when required. They cannot be unit-tested without architectural changes. All other scripts (bin/gsd-t.js, gsd-t-heartbeat.js) have module.exports + require.main guard. Inconsistent pattern.

### AC-2: gsd-t-tools.js findProjectRoot falls back to cwd on failure
When no .gsd-t/ directory is found, returns process.cwd() instead of null (unlike gsd-t-statusline.js which correctly returns null). Will attempt state operations in a non-project directory silently.

### AC-3: deferred-items.md not initialized or health-checked
Referenced by execute/quick/debug but not created by gsd-t-init, not listed in gsd-t-health checks, not in any contract. Accumulates indefinitely with no cleanup.

### AC-4: Living docs not updated after M10-M13
All four living docs show Last Updated: Post-M9/Scan #5. New components, flows, and patterns are undocumented.

### AC-5: Doctor does not check utility scripts
checkDoctorInstallation() does not verify gsd-t-tools.js and gsd-t-statusline.js are in ~/.claude/scripts/.

### AC-6: continue-here files accumulate without cleanup
No mechanism to clean up stale continue-here files. If user pauses multiple times without resuming, files accumulate. gsd-t-health does not check for orphaned continue-here files. Resume reads "most recent" which may not be what the user wants after multiple pauses.
