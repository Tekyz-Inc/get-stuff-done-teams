# GSD-T Framework (@tekyzinc/gsd-t)

# Prime Directives

1. SIMPLICITY ABOVE ALL. Every change should be minimal and impact as little code as possible. No massive refactors.
2. ALWAYS check for unwanted downstream effects before writing any new code or changing existing code.
3. ALWAYS check for completeness that any code creation/change/deletion is implemented thoroughly in every relevant file.
4. ALWAYS work autonomously. ONLY ask for user input when truly blocked.


## Overview

Contract-driven development methodology for Claude Code. An npm package that provides 56 slash commands (51 GSD-T workflow + 5 utility), a CLI installer, templates, and documentation for reliable, parallelizable AI-assisted development.

## Autonomy Level

**Level 3 — Full Auto** (only pause for blockers or completion)
Only pause for blockers or project completion. Execute phases continuously.


## Tech Stack

- **Language**: JavaScript (Node.js >= 16)
- **Package Manager**: npm
- **Distribution**: npm package (@tekyzinc/gsd-t)
- **CLI**: bin/gsd-t.js (install, update, init, status, uninstall, doctor, graph, headless)
- **Testing**: Manual CLI testing (command files are markdown, CLI is the testable surface)


## Project Structure

```
bin/gsd-t.js           — CLI installer (12 subcommands)
bin/orchestrator.js    — Abstract workflow engine (phases → Claude → measure → gate → next)
bin/design-orchestrator.js — Design-build workflow (elements → widgets → pages) using orchestrator
commands/              — 56 slash commands for Claude Code (51 GSD-T + 5 utility)
  gsd-t-*.md           — 50 GSD-T workflow commands
  gsd.md               — Smart router (auto-routes user intent)
  branch.md            — Git branch helper
  checkin.md           — Auto-version + commit/push helper
  Claude-md.md         — Reload CLAUDE.md directives
  global-change.md     — Bulk file changes across all GSD-T projects
templates/             — 10 document templates + stacks/ directory
  CLAUDE-global.md     — Global ~/.claude/CLAUDE.md template
  CLAUDE-project.md    — Per-project CLAUDE.md template
  requirements.md      — Requirements template
  architecture.md      — Architecture template
  workflows.md         — Workflows template
  infrastructure.md    — Infrastructure template
  progress.md          — GSD-T progress template
  backlog.md           — Backlog template
  backlog-settings.md  — Backlog settings template
  design-contract.md — Design contract template (design-to-code token extraction)
  stacks/              — Stack Rules Engine templates (28 files, injected at execute-time)
    _security.md       — Universal security rules (always injected, _ prefix)
    _auth.md           — Universal auth rules (always injected, _ prefix)
    react.md           — React patterns and conventions
    typescript.md      — TypeScript strict-mode rules
    node-api.md        — Node API rules (Express/Fastify/Hono/Koa)
    fastapi.md         — FastAPI dependency injection and Pydantic patterns
    llm.md             — LLM app patterns (streaming, RAG, tool calling)
    prisma.md          — Prisma ORM schema, migrations, typed client
    queues.md          — Background jobs (BullMQ, SQS, Celery)
    design-to-code.md  — Pixel-perfect design implementation (Figma MCP, visual verification)
    (+ 18 more: python, flutter, tailwind, react-native, vite, nextjs, vue,
     docker, postgresql, github-actions, rest-api, supabase, firebase,
     graphql, zustand, redux, neo4j, playwright)
scripts/               — Runtime scripts for design review system
  gsd-t-design-review-server.js  — Proxy server (dev server + inject script + review UI)
  gsd-t-design-review.html       — Human review UI (inspector, tree, property editor)
  gsd-t-design-review-inject.js  — Injected into proxied iframe (DOM inspection, style editing)
examples/              — Example project structure and settings
  settings.json        — Claude Code settings with teams enabled
  .gsd-t/              — Example contracts and domain structure
docs/                  — Methodology documentation
  methodology.md       — GSD → GSD-T evolution and concepts
package.json           — npm package config (see package.json for version)
GSD-T-README.md        — Detailed command reference (ships with package)
README.md              — User-facing repo/npm docs
```


## Documentation

- Requirements: docs/requirements.md (if exists)
- Architecture: docs/architecture.md (if exists)
- README.md — User-facing package docs with npm installer instructions
- GSD-T-README.md — Detailed command reference and wave flow diagram
- docs/methodology.md — GSD vs GSD-T evolution and concepts


## Meta-Project Notes

This project uses GSD-T on itself. Key things to understand:

- The "source code" is the `.md` command files in `commands/` and `bin/gsd-t.js` — not a traditional `src/` directory
- Changes to command files affect the methodology itself, so treat them as code: test the workflow after changes
- The `.gsd-t/` state directory will coexist with the command files that *define* `.gsd-t/` — this is intentional
- When running `gsd-t-scan` on this project, it will analyze its own command files as source
- The installer (`bin/gsd-t.js`) is the primary testable code; command files are validated by use


## Conventions

### CLI (bin/gsd-t.js)
- ANSI colors via escape codes (BOLD, GREEN, YELLOW, RED, CYAN, DIM)
- Zero external dependencies — Node.js built-ins only (fs, path, os)
- All file operations use synchronous API for simplicity
- Version tracked in package.json and ~/.claude/.gsd-t-version

### Command Files (commands/*.md)
- Pure markdown, no frontmatter
- All commands accept $ARGUMENTS at the end
- Step-numbered workflow (Step 1, Step 2, etc.)
- Team mode instructions use code blocks with teammate assignments
- Document Ripple section in any command that modifies files
- **Any step that spawns a Task subagent or agent team MUST include the OBSERVABILITY LOGGING block** (see Observability Logging section). Copy the exact pattern from `commands/gsd-t-execute.md` Step 2. This is non-negotiable — every new command must have this.

### Templates (templates/*.md)
- Use `{Project Name}`, `{Date}` as replacement tokens
- Tables for structured data (requirements, decisions, etc.)
- Placeholder text uses `{description}` format

### Directory Structure Convention
- `.gsd-t/contracts/` — domain interface definitions
- `.gsd-t/domains/{name}/` — scope, tasks, constraints per domain
- `.gsd-t/milestones/` — archived completed milestones
- `.gsd-t/scan/` — codebase analysis outputs


### Publishing
- After publishing a new build to npm (`npm publish`), ALWAYS run `/user:gsd-t-version-update-all` to update all registered GSD-T projects with the new version


## Observability Logging (MANDATORY)

Every command that spawns a Task subagent MUST log its execution to `.gsd-t/token-log.md` and (if issues found) `.gsd-t/qa-issues.md`.

**Display model to user — before every subagent spawn, output:**
`⚙ [{model}] {command} → {brief description}` (e.g., `⚙ [sonnet] gsd-t-execute → domain: auth-service`, `⚙ [haiku] gsd-t-execute → QA validation`)

**Log format — before every subagent spawn, run via Bash:**
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M")`

**After subagent returns, run via Bash:**
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && DURATION=$((T_END-T_START))`

**Read the real context-burn signal — the task counter** (v2.74.12+):
```
COUNTER=$(node bin/task-counter.cjs status 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(String(JSON.parse(s).count||''))}catch(_){process.stdout.write('')}})")
```

**Append to `.gsd-t/token-log.md`** (create with header if missing):
`| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Domain | Task | Tasks-Since-Reset |`
`| {DT_START} | {DT_END} | {command} | Step {N} | {model} | {DURATION}s | {brief note} | {domain or ""} | {task or ""} | {COUNTER} |`

**Orchestrator Task-Count Gate (execute + wave, replaces the broken env-var self-check):**
`bin/task-counter.cjs` is the real guard. Before each task/phase spawn, run `node bin/task-counter.cjs should-stop` — exit code 10 means the session has hit its task budget (default 5, overridable via `.gsd-t/task-counter-config.json` or `GSD_T_TASK_LIMIT`). On stop, the orchestrator checkpoints and asks the user to `/clear` + `/user:gsd-t-resume`. After each successful task, run `node bin/task-counter.cjs increment task`. See `commands/gsd-t-execute.md` Steps 0/3.5/5 and `commands/gsd-t-wave.md` Step 0 / phase-count gate.

**Historical note**: v2.74.11 and earlier attempted a similar guard via `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` environment variables. Claude Code **never exports** those vars, so the guard was always inert. That entire code path (token-burn math, compaction detection, CTX_PCT alerts) was removed in v2.74.12 and replaced with the deterministic task counter. Do not reintroduce env-var-based context checks — they do not work.

**For QA/validation subagents:** if issues found, append each to `.gsd-t/qa-issues.md`:
`| Date | Command | Step | Model | Duration(s) | Severity | Finding |`
`| {DT_START} | {command} | Step {N} | {model} | {DURATION}s | {severity} | {finding} |`

**Model assignments:**
- `model: haiku` — strictly mechanical tasks: run test suites and report counts, check file existence, validate JSON structure, branch guard checks
- `model: sonnet` — mid-tier reasoning: routine code changes, standard refactors, test writing, QA evaluation, straightforward synthesis
- `model: opus` — high-stakes reasoning: architecture decisions, security analysis, complex debugging, cross-module refactors, Red Team adversarial QA, quality judgment on critical paths

## GSD-T Workflow

This project uses contract-driven development.
- State: .gsd-t/progress.md
- Contracts: .gsd-t/contracts/
- Domains: .gsd-t/domains/



# Destructive Action Guard (MANDATORY)

**NEVER perform destructive or structural changes without explicit user approval.** This applies at ALL autonomy levels.

Before any of these actions, STOP and ask the user:
- DROP TABLE, DROP COLUMN, DROP INDEX, TRUNCATE, DELETE without WHERE
- Renaming or removing database tables or columns
- Schema migrations that lose data or break existing queries
- Replacing an existing architecture pattern (e.g., normalized → denormalized)
- Removing or replacing existing files/modules that contain working functionality
- Changing ORM models in ways that conflict with the existing database schema
- Removing API endpoints or changing response shapes that existing clients depend on
- Any change that would require other parts of the system to be rewritten

**Rule: "Adapt new code to existing structures, not the other way around."**

# Pre-Commit Gate (MANDATORY)

NEVER commit code without running this checklist. This is not optional.

```
BEFORE EVERY COMMIT:
  ├── Did I change a command file's interface or behavior?
  │     YES → Update GSD-T-README.md command reference
  │     YES → Update README.md commands table
  │     YES → Update templates/CLAUDE-global.md commands table
  │     YES → Update commands/gsd-t-help.md command summaries
  ├── Did I add or remove a command?
  │     YES → Update all 4 files above
  │     YES → Update package.json version (bump minor or major)
  │     YES → Update bin/gsd-t.js command counting logic
  ├── Did I create a new command file?
  │     YES → Does it spawn a Task subagent or agent team?
  │           YES → Verify OBSERVABILITY LOGGING block is present (see Observability Logging section)
  │           NO → No logging needed
  ├── Did I change the CLI installer?
  │     YES → Test: install, update, status, doctor, init, uninstall
  ├── Did I change a template?
  │     YES → Verify gsd-t-init still produces correct output
  ├── Did I change the wave flow (add/remove/reorder phases)?
  │     YES → Update gsd-t-wave.md phase sequence
  │     YES → Update GSD-T-README.md wave diagram
  │     YES → Update README.md workflow section
  ├── Did I make an architectural or design decision?
  │     YES → Add to .gsd-t/progress.md Decision Log
  └── Did I change any contract or domain boundary?
        YES → Update .gsd-t/contracts/ and affected domain scope.md
```


# Don't Do These Things

- NEVER commit without running the Pre-Commit Gate checklist
- NEVER batch doc updates for later — update docs in the same commit as the change
- NEVER report a task as "done" until ALL downstream documents are updated — identify the full blast radius first, complete every update in one pass, then report. If a change applies to N files, update N files before presenting a summary. The user should never need to ask "did you update everything?"
- NEVER add external npm dependencies to the installer — it must stay zero-dependency
- NEVER change command file names without updating all 4 reference files (README, GSD-T-README, CLAUDE-global template, gsd-t-help)
- NEVER modify the wave phase sequence without updating wave, README, and GSD-T-README
- NEVER let the command count in the installer diverge from the actual commands/ directory
- NEVER create a command that spawns a Task subagent or agent team without adding the OBSERVABILITY LOGGING block


# Recovery After Interruption

When resuming work (new session or after /clear):
1. Read `.gsd-t/progress.md` for current state
2. Read `README.md` for what the project delivers
3. Read `package.json` for current version
4. Check `commands/` directory for the actual command list
5. Continue from current task — don't restart the phase

## Current Status

See `.gsd-t/progress.md` for current milestone/phase state.
