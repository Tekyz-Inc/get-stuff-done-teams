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

Every command that spawns a Task subagent, invokes `claude -p`, or calls `spawn('claude', ...)` MUST route the spawn through `bin/gsd-t-token-capture.cjs` so the real token-usage envelope is parsed and recorded. This is the M41 canonical pattern — the pre-M41 bash block that wrote `| N/A |` is retired.

### Pattern A — wrap a spawn callable with `captureSpawn`

Preferred for new spawn sites. The wrapper owns the before/after timing, model banner, envelope parse, row write, and JSONL record.

```
node -e "
const { captureSpawn } = require('./bin/gsd-t-token-capture.cjs');
(async () => {
  await captureSpawn({
    command: 'gsd-t-execute',
    step: 'Step 4',
    model: 'sonnet',
    description: 'domain: auth-service',
    projectDir: '.',
    domain: 'auth-service',
    task: 'T-3',
    spawnFn: async () => { /* actual Task(...) or spawn('claude', ...) call */ },
  });
})();
"
```

### Pattern B — record after the result envelope is already in hand

For command files where the Task subagent already ran and the caller has the result object. Identical row format, no timing wrap.

```
node -e "
const { recordSpawnRow } = require('./bin/gsd-t-token-capture.cjs');
recordSpawnRow({
  projectDir: '.',
  command: 'gsd-t-verify',
  step: 'Step 4',
  model: 'haiku',
  startedAt: '2026-04-21 10:00',
  endedAt:   '2026-04-21 10:02',
  usage: result.usage, // may be undefined — wrapper handles with '—'
  domain: '-', task: '-',
  ctxPct: 42,
  notes: 'test audit + contract review',
});
"
```

### Canonical `.gsd-t/token-log.md` header

```
| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Tokens | Notes | Domain | Task | Ctx% |
```

The wrapper detects old headers (no `Tokens` column) and upgrades in place, preserving existing rows. The **Tokens** cell renders as `in=N out=N cr=N cc=N $X.XX` when usage is present, or `—` when absent. Never `0`. Never `N/A`. A zero is a measurement; a dash is an acknowledged gap.

For QA/validation subagents, append findings to `.gsd-t/qa-issues.md`:
```
| Date | Command | Step | Model | Duration(s) | Severity | Finding |
```

## Token Capture Rule (MANDATORY)

Every `Task(...)` subagent spawn, every `claude -p` child process, and every `spawn('claude', ...)` call MUST flow through `bin/gsd-t-token-capture.cjs`. Either wrap with `captureSpawn({..., spawnFn})` or record explicitly with `recordSpawnRow({...})` after the call returns.

No command file ships a bare `Task(...)` or `claude -p` line outside of a wrapper call. `gsd-t capture-lint` (D5) enforces this mechanically; violations fail the opt-in pre-commit hook.

Rationale: the pre-M41 convention silently wrote `N/A` tokens because no caller parsed the `usage` envelope. The wrapper is the single place that parses it. Bypassing the wrapper re-introduces blind spots.


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
