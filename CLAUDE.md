# GSD-T Framework (@tekyzinc/gsd-t)

Prime Directives, core guards, and workflow rules live in `~/.claude/CLAUDE.md`. This file covers what's specific to this repo.

## Overview

Guardrails for Claude Code, shipped as the npm package `@tekyzinc/gsd-t`: slash commands, hook scripts, a CLI installer, and templates. Since v6 there is no execution pipeline — Claude plans, builds and tests directly; GSD-T supplies the code graph, the no-fallback guard, the architect and red-team passes, worktrees, the environments registry, demo videos and estimates.

## Autonomy Level

**Level 3 — Full Auto**. Only pause for blockers, destructive actions, or project completion.

## Tech Stack

- **Language**: JavaScript (Node.js >= 16). Zero-dep is a guiding principle for the CLI, not a hard rule — the code graph depends on `better-sqlite3`, `tree-sitter` (+ grammars) and the SCIP indexers.
- **Distribution**: npm package `@tekyzinc/gsd-t`
- **CLI**: `bin/gsd-t.js` — run `node bin/gsd-t.js --help` for the subcommand list
- **Testing**: `npm test` (Node built-in test runner); heavy real-repo graph tests need `GSDT_SLOW_TESTS=1`

## Project Structure

```
bin/          — CLI (gsd-t.js) + tools: graph (gsd-t-graph-*.cjs, scip-*), worktree
                (pick-worktree, worktree-provision, worktree-detect), env registry
                (env-registry, doc-marker), estimate-sheet, fallback-detect,
                code-search / grep classifiers, install-check, slice-budget,
                pseudocode-style, claude-md-changelog, playwright-bootstrap
commands/     — slash commands
scripts/      — hook scripts (graph guards/intercepts, fallback guard, date guard,
                changelog hooks, install-heal, update-check, auto-route)
templates/    — CLAUDE-{global,project}.md, living-doc templates, progress.md,
                PseudoCode-spec.md, estimate-sheet-spec.md + estimate-config.json,
                playbooks/, demo-videos/, test-helpers/, workflows/ (scan + debug)
examples/     — settings.json
docs/         — methodology, architecture, requirements, workflows, infrastructure, GSD-T-README
package.json, README.md, GSD-T-README.md, CHANGELOG.md
```

Exact command list: `ls commands/`. Don't hand-maintain counts in docs.

## Meta-Project Notes

- The "source" is the `.md` files in `commands/` + `templates/` and the JS in `bin/` + `scripts/`. There is no `src/`.
- Changes to command files change the methodology itself — treat them as code; verify by running them.
- `bin/gsd-t.js` is the primary testable surface; command files are validated by use.
- `templates/CLAUDE-global.md` is what every user's `~/.claude/CLAUDE.md` block becomes on update.

## Conventions

**CLI** — ANSI colors via escape codes, sync file APIs, version tracked in `package.json` and `~/.claude/.gsd-t-version`. `bin/gsd-t-install-check.cjs` parses `PROJECT_BIN_TOOLS` from `bin/gsd-t.js` source text — keep its `const PROJECT_BIN_TOOLS = [ … ];` shape.

**Command files** — markdown, accept `$ARGUMENTS`, step-numbered. `gsd-t-scan` and `gsd-t-debug` are thin invokers: resolve `gsd-t workflow-path <name>`, then `Workflow({scriptPath, args})`.

**Retiring something** — add it to `RETIRED_V6` in `bin/gsd-t.js` with a verbatim header sentinel from the shipped file (and a hook marker if it was a hook), so install/update/update-all remove it from every machine and project.

**Templates** — `{Project Name}`, `{Date}` replacement tokens; tables for structured data.

**Publishing** — `/cpua` only. It verifies the release actually landed before propagating.

## Living Documents (project-specific)

Architect plans live in `.gsd-t/pseudocode/PseudoCode-[Title].md` — a plain-English decision tree, style-gated by `gsd-t pseudocode-style`. A supersede of shipped behavior writes a `⚠ Divergence` flag.

## GSD-T Workflows

Only two Workflow scripts remain in `templates/workflows/`:

- `gsd-t-scan.workflow.js` — preflight → volume probe → graph wiring → line-budgeted slices → deep finder per slice + verify → synthesis → consolidation → living docs + dimension files + plain-English companion
- `gsd-t-debug.workflow.js` — graph localize → two fix cycles on opus → `needs-human`

**Runtime-native invariant:** the Workflow sandbox provides ONLY `agent/parallel/pipeline/log/phase/budget/args` — NO `require`/`fs`/`path`/`child_process`/`process`, and `args` arrives as a JSON STRING. Each script `JSON.parse`s `args` and runs every CLI call through an inline helper inside an `agent()`'s Bash (project-local `bin/<tool>.cjs` first, else the global `gsd-t`). Enforced by `test/m71-workflow-runtime-native-lint.test.js`.

## Validation Protocols

There is no `templates/prompts/` in v6. The red-team protocol lives inline in `commands/gsd-t-red-team.md` (one fresh-context opus agent; verdict `FAIL` / `GRUDGING-PASS`; two fix rounds max). The architect pass lives in `commands/gsd-t-architect.md`.


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

- **Command added/removed/renamed or its behavior changed** → update `README.md` command table, `GSD-T-README.md` + `docs/GSD-T-README.md`, and the command table in `templates/CLAUDE-global.md`. A removed command's leftovers go in `RETIRED_V6` (non-prefixed files) — `gsd-t-*.md` files are removed automatically.
- **Hook added/removed** → registrar + marker in `bin/gsd-t.js` (`GSDT_HOOK_MARKERS`; retired ones in `RETIRED_V6.hookMarkers`), README hooks table, `docs/infrastructure.md`.
- **bin tool added/removed** → `PROJECT_BIN_TOOLS` / `GLOBAL_BIN_TOOLS`; a removed one also goes in `RETIRED_V6.bin` with its header sentinel. Then `ls` the file in a real project after `update-all`.
- **Workflow script changed** → `scriptPath` still resolves via `gsd-t workflow-path`, `args` matches `meta.phases`, sandbox lint passes, and run it in the real Workflow sandbox.
- **CLI installer changed** → smoke test `install`, `update`, `status`, `doctor`, `init`, `uninstall`.
- **Template changed** → verify `gsd-t init` still produces correct output.
- **Contract changed** → update `.gsd-t/contracts/`.

## Don't

- Don't add npm runtime dependencies casually — but don't let zero-dep ship a worse product either.
- NEVER rename or remove a command without updating every reference file above.
- NEVER let docs advertise a command that doesn't exist (`test/m112-retired-commands.test.js` checks README).
- NEVER reintroduce `require`/`fs`/`path`/`child_process`/`process` into a `*.workflow.js`.
- NEVER `git add -A` here — stage the files you changed.

## Recovery After Interruption

1. Read `.gsd-t/progress.md`
2. Read `README.md` for what the package delivers
3. Check `commands/` and `package.json` for current state
4. Continue from current task; don't restart the phase

## Current Status

See `.gsd-t/progress.md`.

## Logging Posture

GSD-T **opts out of BOTH trace and audit logging** — it is a stateless CLI + methodology package, not a running application. Records: `.gsd-t/trace-optout.json` + `.gsd-t/audit-optout.json`. (The logging scaffolder and its contracts were cut in v6; the records stay as the decision.)
