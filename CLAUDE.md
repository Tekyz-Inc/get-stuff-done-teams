# GSD-T Framework (@tekyzinc/gsd-t)

Prime Directives, core guards, and workflow rules live in `~/.claude/CLAUDE.md`. This file covers what's specific to this repo.

## Overview

Contract-driven development methodology for Claude Code. npm package providing slash commands, a CLI installer, templates, and stack rules for reliable parallelizable AI-assisted development.

## Autonomy Level

> Overrides global: pins the default from `~/.claude/CLAUDE.md` § Autonomy Levels.

**Level 3 — Full Auto**. Only pause for blockers, destructive actions, or project completion.

## Tech Stack

- **Language**: JavaScript (Node.js >= 16), zero external runtime deps for the installer
- **Distribution**: npm package `@tekyzinc/gsd-t`
- **CLI**: `bin/gsd-t.js` (install, update, init, status, uninstall, doctor, graph, headless, …)
- **Testing**: `npm test` (Node built-in test runner) + manual CLI testing

## Project Structure

```
bin/                     — CLI entry (gsd-t.js) + orchestrators (orchestrator.js, design-orchestrator.js)
                           + support modules (headless-auto-spawn.cjs, token-budget.cjs, model-selector.js, …)
commands/                — slash commands for Claude Code (GSD-T workflow + utility)
templates/               — document + prompt + stack templates
  CLAUDE-{global,project}.md, requirements.md, architecture.md, workflows.md,
  infrastructure.md, progress.md, backlog.md, backlog-settings.md, design-contract.md
  prompts/               — validation subagent protocols (qa, red-team, design-verify)
  stacks/                — Stack Rules Engine templates (injected at spawn time)
scripts/                 — runtime scripts (design review, context meter hook, event writer)
examples/                — example project structure + settings
docs/methodology.md      — GSD → GSD-T evolution and concepts
package.json, README.md, GSD-T-README.md, CHANGELOG.md
```

Exact command list: `ls commands/`. Exact stack rule set: `ls templates/stacks/`. Don't hand-maintain counts in docs.

## Meta-Project Notes

- The "source" is the `.md` files in `commands/` + `templates/` and the JS in `bin/` + `scripts/`. There is no `src/`.
- Changes to command files change the methodology itself — treat them as code; verify by running the workflow.
- The `.gsd-t/` state dir coexists with the commands that *define* `.gsd-t/` — intentional.
- `bin/gsd-t.js` is the primary testable surface; command files are validated by use.

## Conventions

**CLI** — ANSI colors via escape codes, zero external deps, sync file APIs, version tracked in `package.json` and `~/.claude/.gsd-t-version`.

**Command files** — pure markdown, no frontmatter, accept `$ARGUMENTS`, step-numbered workflow, include a Document Ripple section when they modify files. Any step that spawns a Task subagent or agent team MUST include the OBSERVABILITY LOGGING block (copy from `commands/gsd-t-execute.md`). Keep validation-subagent protocol bodies in `templates/prompts/*-subagent.md` — command files resolve the path and spawn with a short referral prompt; don't inline the protocol.

**Templates** — `{Project Name}`, `{Date}`, `{description}` replacement tokens; tables for structured data.

**Directory structure** — `.gsd-t/contracts/` (domain interfaces), `.gsd-t/domains/{name}/` (scope/tasks/constraints), `.gsd-t/milestones/` (archives), `.gsd-t/scan/` (analysis outputs).

**Publishing** — after `npm publish`, ALWAYS run `/gsd-t-version-update-all` to propagate to registered projects.

## Observability Logging (MANDATORY)

Every command that spawns a Task subagent MUST log to `.gsd-t/token-log.md` and (if issues found) `.gsd-t/qa-issues.md`.

**Before spawn**: output `⚙ [{model}] {command} → {description}`, then `T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M")`.

**After spawn**: `T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && DURATION=$((T_END-T_START))`, then `CTX_PCT=$(node -e "try{const tb=require('./bin/token-budget.cjs'); process.stdout.write(String(tb.getSessionStatus('.').pct))}catch(_){process.stdout.write('N/A')}")`.

**Append to `.gsd-t/token-log.md`** (create with header if missing):
```
| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Domain | Task | Ctx% |
| {DT_START} | {DT_END} | {command} | Step {N} | {model} | {DURATION}s | {note} | {domain} | {task} | {CTX_PCT} |
```

For QA/validation subagents, append findings to `.gsd-t/qa-issues.md`:
```
| Date | Command | Step | Model | Duration(s) | Severity | Finding |
```


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

## Pre-Commit Gate (project-specific additions)

The global gate applies first (see `~/.claude/CLAUDE.md`). Additionally for this repo:

- **Command file interface/behavior changed** → update `GSD-T-README.md` + `README.md` commands table + `templates/CLAUDE-global.md` + `commands/gsd-t-help.md`.
- **Command added/removed** → update all 4 files above, bump `package.json`, update any command-counting logic in `bin/gsd-t.js`.
- **New command spawns a subagent** → verify OBSERVABILITY LOGGING block is present.
- **CLI installer changed** → smoke test `install`, `update`, `status`, `doctor`, `init`, `uninstall`.
- **Template changed** → verify `gsd-t-init` still produces correct output.
- **Wave flow changed (phases added/removed/reordered)** → update `gsd-t-wave.md`, `GSD-T-README.md` wave diagram, `README.md` workflow section.
- **Contract or domain boundary changed** → update `.gsd-t/contracts/` and owning `scope.md`.

## Don't

- NEVER add external npm runtime dependencies to the installer — zero-dep invariant.
- NEVER rename a command without updating all 4 reference files above.
- NEVER modify wave phase sequence without updating wave, README, GSD-T-README in the same commit.
- NEVER let installer's command count diverge from `commands/` directory reality.
- NEVER spawn a Task subagent without OBSERVABILITY LOGGING.
- NEVER inline validation-subagent protocol bodies into command files — path-reference `templates/prompts/*-subagent.md`.

## Recovery After Interruption

1. Read `.gsd-t/progress.md`
2. Read `README.md` for what the package delivers
3. Check `commands/` and `package.json` for current state
4. Continue from current task; don't restart the phase

## Current Status

See `.gsd-t/progress.md`.
