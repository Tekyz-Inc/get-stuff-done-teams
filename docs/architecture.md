# Architecture — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-10-10 (v6.0.10 slim-down)

## System Overview

GSD-T is an npm package that adds guardrails to Claude Code. It has no long-running process. It ships:

- **Slash commands** (`commands/*.md`) — markdown instructions Claude Code follows.
- **Hook scripts** (`scripts/*.js`) — registered in `~/.claude/settings.json`; they block, rewrite or annotate tool calls.
- **A CLI** (`bin/gsd-t.js`) — install, update, update-all, init, doctor, graph, worktree picking, estimate sheets.
- **Tools** (`bin/*.cjs`) — the code graph, worktree provisioner, env registry, estimate writer, guards. Copied into each project's `bin/` (and some into `~/.claude/bin/`).
- **Templates** — the global `CLAUDE.md` block, project scaffolding, the scan and debug Workflow scripts, demo-video and estimate assets.

v6 removed the phase pipeline (milestone → partition → plan → execute → verify → wave) and everything that served it. Claude does that work directly; GSD-T enforces the rules around it.

## Components

### CLI (`bin/gsd-t.js`)

- Node built-ins only in the CLI itself; the graph needs `better-sqlite3` and `tree-sitter` (+ TypeScript / Python grammars), declared as package dependencies. `install` also installs the SCIP indexers.
- Subcommands: `install`, `update`, `update-all`, `init`, `register`, `status`, `uninstall`, `doctor`, `changelog`, `graph`, `pick-worktree`, `setup-playwright`, `workflow-path`, `estimate-sheet`, `talk`, plus the tool routes `install-check`, `slice-budget`, `pseudocode-style`, `graph-availability`.
- `PROJECT_BIN_TOOLS` lists what is copied into every project's `bin/`. `bin/gsd-t-install-check.cjs` parses that array from the source text, so it must keep the `const PROJECT_BIN_TOOLS = [ … ];` shape.

### Commands (`commands/`)

17 shipped files plus `gsd-t-red-team.md` — run `ls commands/` for the current set. Two are thin Workflow invokers (`gsd-t-scan`, `gsd-t-debug`); the rest are prose procedures. `gsd-t-*.md` files GSD-T once shipped (`RETIRED_V6.commandNames`) are removed from `~/.claude/commands/` on install when the package no longer ships them; any other `gsd-t-*.md` is a user command and is left alone.

### Hooks (`scripts/`)

| Script | Event / matcher | Role |
|---|---|---|
| `gsd-t-graph-search-guard.js` | PreToolUse `Bash\|Grep` | Blocks structural code searches; unclear → block; missing graph → block |
| `gsd-t-graph-intercept.js` | PostToolUse `Grep` | Replaces a structural grep's output with the graph answer |
| `gsd-t-read-intercept.js` | PostToolUse `Read` | Appends a `graph body` pointer; never shrinks output |
| `gsd-t-graph-use-report.js` | Stop | Reports structural work done without graph queries; never blocks |
| `gsd-t-fallback-guard.js` | PreToolUse `Write\|Edit` | Denies unapproved fallbacks (uses `bin/gsd-t-fallback-detect.cjs`, approvals in `.gsd-t/fallbacks.json`) |
| `gsd-t-date-guard.js` | PreToolUse `Write\|Edit` | Blocks timestamps > ±5 min from the live clock |
| `gsd-t-changelog-check.js` | SessionStart | Logs an outside edit to `CLAUDE.md` in `CLAUDE.md updates.md` |
| `gsd-t-changelog-post-edit.js` | PostToolUse `Write\|Edit` | Reminds Claude to log its own `CLAUDE.md` edit |
| `gsd-t-install-heal.js` | SessionStart | Restores missing project `bin/` tools; halts if it cannot |
| `gsd-t-update-check.js` | SessionStart | Version banner + auto-update |
| `gsd-t-auto-route.js` | UserPromptSubmit | Wrong-app guard (blocks a prompt meant for another registered app), then emits `[GSD-T NOW]` and the Reader Contract |

The guard hooks run from the installed package path. `update-check` and `auto-route` are copied to `~/.claude/scripts/`. `gsd-t-fetch-version.js` and `npm-update-check.js` support the CLI's update notice.

### Code graph

| Part | File |
|---|---|
| Indexer (tree-sitter floor, streaming SQLite writes) | `bin/gsd-t-graph-index.cjs`, `gsd-t-graph-edge-extract.cjs` |
| SCIP upgrade to compiler-accurate edges | `bin/gsd-t-graph-scip-upgrade.cjs`, `gsd-t-scip-reader.cjs` |
| Freshness (re-index content-hash-dirty files before answering) | `bin/gsd-t-graph-freshness.cjs` |
| Query CLI (`who-calls`, `who-imports`, `blast-radius`, `body`, `who-uses`, `table`, `dead-code`, `dangling`, `cluster`, `test-impl`, `status`) | `bin/gsd-t-graph-query-cli.cjs` |
| Store path resolution + telemetry sink | `bin/gsd-t-graph-store-resolver.cjs` |
| Exclude list (`.gsd-t/graph-exclude.json`) + git-visible file list (`.gitignore` respected by indexer and freshness) | `bin/gsd-t-graph-exclude.cjs` |
| Native module loading (project → global → dev, fail loud) | `bin/gsd-t-require-store.cjs` |
| Availability probe for workflows | `bin/gsd-t-graph-availability.cjs` |
| Usage rollup (`graph metrics`) | `bin/gsd-t-graph-metrics-rollup.cjs` |
| Hook classifiers | `bin/gsd-t-code-search-classifier.cjs` (search guard), `gsd-t-grep-classifier.cjs` (intercept) |

- Store: `.gsd-t/graphDB/` — `graph.db` (+ WAL/SHM), SCIP indexes, `logs/graph-events-NNN.jsonl` telemetry (`GSDT_GRAPH_TELEMETRY=0` disables).
- Accuracy tiers per file: tree-sitter floor, compiler-accurate, compiler-partial, SCIP-missing.
- Drizzle `pgTable` / `mysqlTable` / `sqliteTable` and enums are indexed with columns, foreign keys and READ/WRITE usage edges.
- Invariant: **no query path greps.** A broken parser or store returns `{ok:false, reason:"graph-unavailable"}`.
- Contracts: `.gsd-t/contracts/graph-*.md`.

### Workflows (`templates/workflows/`)

Only `gsd-t-scan.workflow.js` and `gsd-t-debug.workflow.js` remain. Command files resolve the absolute path with `gsd-t workflow-path <name>` and call `Workflow({scriptPath, args})`.

**Sandbox invariant:** the Workflow runtime provides only `agent`, `parallel`, `pipeline`, `log`, `phase`, `budget`, `args`; no `require` / `fs` / `path` / `child_process` / `process`, and `args` arrives as a JSON string. Each script parses `args` itself and runs every CLI call inside an `agent()`'s Bash. Lint: `test/m71-workflow-runtime-native-lint.test.js`.

- **Scan** — preflight → volume probe → graph wiring (index if absent, structural slice) → line-budgeted slices (`bin/gsd-t-slice-budget.cjs`; a failure halts) → deep finder per slice + verify → synthesis (archive prior register, write new one) → consolidation → living docs + dimension files + plain-English companion.
- **Debug** — graph localize (blast-radius + who-calls) → cycle 1 → cycle 2 (sees cycle 1's failed hypothesis) → `needs-human`. Both cycles on `opus`. The two-cycle cap is the loop itself. After a fix, touched files are re-indexed.

### Worktrees

- `bin/gsd-t-pick-worktree.cjs` — picks, enters or creates the worktree for a session (`--name`, `--list`, `--suggest`). Enters an existing free worktree; refuses a folder git doesn't know as that branch's worktree, or one a live session occupies. `main` / the remote default branch means the main checkout.
- `bin/gsd-t-worktree-provision.cjs` — CARRY local config and secrets (`.env*`, `.npmrc`, credentials; permissions kept), SKIP per-session `.gsd-t` state, build output and OS junk, INSTALL dependencies from the worktree's own lockfile. Unreadable files are reported; a failed install halts.
- `bin/gsd-t-worktree-detect.cjs` — tells a worktree from the main checkout.

### Environments registry

`bin/gsd-t-env-registry.cjs` (record / lookup / detect / add-permission / ensure `.env` ignored) writes the `## Environments` table in a project's `docs/infrastructure.md` through the shared marker-block writer `bin/gsd-t-doc-marker.cjs`. Rows are upserted by `(scope, kind)`. Columns hold the map only — vault name, env-var name, `$VAR`-referencing commands; a literal secret is rejected. Contract: `.gsd-t/contracts/env-registry-contract.md`.

### Talk

`bin/gsd-t-talk.cjs` — one shared talk program for all sessions, started detached by the SessionStart hook `scripts/gsd-t-talk-start.js` as `--supervise`: a supervisor (`supervisor.json`) runs the worker and restarts it after any crash; a restart has failed when the new worker crashes within 60 s, and after two failed restarts in a row it writes `status.json` `{state: "crashed"}`, notifies via `osascript`, and every crash's stderr goes to `crashes.log` (approved fallback `talk-supervisor-restart`). A local HTTP door on 127.0.0.1 (bearer token, found via `~/.claude/.gsd-t-talk.json`, mode 600) takes `POST /hush` (stop speech, drop the rest of the answer — Claude's work continues; warms the voice) and `POST /say {text}`. A say is routed to the session in tmux's active pane: `tmux display-message -p '#{pane_id}'` matched against Claude Code's own session records (`~/.claude*/sessions/<pid>.json`, `kind: interactive`, `tmux: <session>:@<window>.<pane>`, live pid); none there → 409, spoken. The copy runs under that record's account folder (`CLAUDE_CONFIG_DIR`). The first say starts `claude --print --input-format stream-json --resume <session> --fork-session` with `--replay-user-messages` (a turn is ours only from the echo of our message to its result — a copy's own turns, e.g. the original's queued task notices, are logged, never spoken) and a decision-shaped appended system prompt plus the project's last five talk summaries; later says queue behind a busy turn. Every exchange is appended to `<project>/.gsd-t/talk/<date>-<session>[-n].md`. "We're done, pass it on / ignore" (matched in code) asks the copy for a summary, appends it with the outcome, closes the copy; pass returns `paste` for the dictation app to paste. A speech filter skips the GSD-T header line, tables and code; a speaker queue synthesizes ahead and plays in order (`afplay`). Voices: `bin/gsd-t-talk-kokoro.py` (Kokoro via `uv run`, loaded on first use) or Google Cloud TTS. A failed voice is logged red; it never switches voices. Plan: `.gsd-t/pseudocode/PseudoCode-Talk.md`.

### Estimate sheet writer

`bin/gsd-t-estimate-sheet.cjs` — deterministic writer for Tekyz estimate Google Sheets (`read`, `plan-check`, `write`, `audit`, `size`, plus repair verbs `teammix`, `format`, `phases`, `titles`). The model supplies a JSON plan of judgments; the tool computes formulas, roster split, months, ramp and styling, writes, then audits by reading back. Violations exit 4. Spec: `templates/estimate-sheet-spec.md`; config: `templates/estimate-config.json` (both also copied to `~/.claude/templates/`). Playbook: `templates/playbooks/tekyz-estimation-and-prd-playbook.md`.

### Demo-video templates

`templates/demo-videos/` — `e2e/` (cast, manifest, runtime, signin, preflight and example specs) and `scripts/walkthrough-*.mjs` (voice via Google Cloud TTS fixed voice, voice check/ensure, clip rates, implied clicks, lines check, mux, normalise, trim) plus `seed-lib.mjs`. `/gsd-t-demo-videos` copies them into a project.

### Other tools

- `bin/gsd-t-pseudocode-style.cjs` — style gate for PseudoCode flow blocks (exit 0 / 4 / 64).
- `bin/gsd-t-install-check.cjs` — check and repair a project's `bin/` against `PROJECT_BIN_TOOLS`.
- `bin/gsd-t-claude-md-changelog.cjs` — append-only `CLAUDE.md updates.md`.
- `bin/playwright-bootstrap.cjs`, `bin/ui-detection.cjs` — install Playwright when a project has UI and no config.

## Data Flow

### Install / update

```
gsd-t install | update
  ├── ~/.claude resolved once to its real folder (it may be a link); symlink checks apply below it
  ├── preflightGlobal: settings.json shape, symlinks, CLAUDE.md markers, any hook/statusLine that would
  │     point at a missing GSD-T script → HALT with fix, nothing changed
  ├── commands/*.md → ~/.claude/commands/
  ├── templates/CLAUDE-global.md → marked block in ~/.claude/CLAUDE.md
  ├── update-check + auto-route scripts → ~/.claude/scripts/ + hooks
  ├── shared templates → ~/.claude/templates/; global bin tools → ~/.claude/bin/
  ├── register the guard hooks (find by marker, refresh stale command, else add)
  ├── removeRetiredHooks + retireV6Files (RETIRED_V6 → moved to ~/.claude/.gsd-t-retired/<date>/)
  ├── verify: no hook or statusLine names a GSD-T script that does not exist, else HALT
  └── install SCIP indexers
```

### update-all

```
gsd-t update-all
  ├── npm install -g fails → HALT before touching anything
  ├── installed version ≠ package → full update; equal → preflight + CLAUDE.md compare + RETIRED_V6 retirement
  ├── for each registered project: symlink preflight (CLAUDE.md, CHANGELOG.md, bin/), move retired strays to
  │     .gsd-t/retired/<date>/, copy PROJECT_BIN_TOOLS into bin/; any failure halts THAT project
  ├── project health (graph move/build, Playwright) — halted projects skipped
  └── any halted project → exit non-zero
```

### init

```
gsd-t init [name]
  ├── CLAUDE.md (from CLAUDE-project.md), docs/{requirements,architecture,workflows,infrastructure}.md
  ├── .gsd-t/progress.md, .gsd-t/contracts/, .gsd-t/domains/
  ├── bin/ tools; register in ~/.claude/.gsd-t-projects
  └── Playwright bootstrap when the project has UI and no config
```

### Retired-file cleanup (`RETIRED_V6`)

One object in `bin/gsd-t.js` drives every retirement: commands, `~/.claude/bin` and project `bin/` tools, `~/.claude/scripts` files, `~/.claude/templates`, the status-line script, and `settings.json` hook markers. **Move, never delete:** a file whose first 1,200 characters contain a verbatim header GSD-T shipped (for `gsd-t-*.md` commands: the `# GSD-T: ` header, which must be the FIRST line) is moved by `retireShippedFile` to `~/.claude/.gsd-t-retired/<YYYY-MM-DD>/<relative path>` (project: `<project>/.gsd-t/retired/<YYYY-MM-DD>/bin/…`), keeping its permissions and never overwriting an existing backup (`name.1.ext`, …); one summary line gives the count and folder. A file without the header is reported and kept. Why: two red-team rounds on delete-based cleanup did not converge; a move makes any misclassification recoverable. The project backup is added to `.gitignore` only when the project already ignores `.gsd-t/` working files. The status-line setting is cleared when it names (in any spelling) a retired GSD-T script that is now gone. A move that fails (e.g. EXDEV, a different disk) removes the backup folder it just created and prints a fix. Appending a GSD-T section to an unmarked CLAUDE.md writes a backup first. The GSD-T source repo is never swept.

**Halts, not fallbacks.** `preflightGlobal` (install / update / update-all) and `haltOnSymlinks` (also at the top of the project sweep) stop with a `Fix:` line before any change when settings.json is not an object of hook arrays, a path GSD-T would write / copy over / move — or a directory between it and `~/.claude` / the project — is a symlink, or CLAUDE.md markers are malformed (`claudeMdProblem`). A failed copy or move throws: no "Installation Complete!", version file not advanced, so the next run retries.

**One hook registrar.** `upsertGsdtHook` registers every GSD-T hook (guards, intercepts, use report, changelog hooks, install-heal, update-check, auto-route): one entry per script on its intended event, copies on other events removed, SessionStart matcher `""`, user groups never re-matched. `normalizeHookCommand` rewrites every spelling of a script path (quotes, `~`, `$HOME`, `${HOME}`, `"$HOME"/…`, the absolute or real home path, the `$(npm root -g)/@tekyzinc/gsd-t/scripts/` wrapper) to one form, and `gsdtScriptRefs` matches only `~/.claude/scripts/[hooks/]gsd-t-*` or the package scripts dir — a user hook running a same-named script from its own repo is not ours. **Invariant:** after install no hook or statusLine names a GSD-T script that does not exist; a run that would break it halts before any change, and the end of the run re-checks it.

## Configuration Model

| Layer | Location | Purpose |
|---|---|---|
| Global | `~/.claude/CLAUDE.md` (GSD-T marked block) | v6 rules: output style, live clock, graph, no-fallback, destructive guard, worktrees, environments |
| Project | `{project}/CLAUDE.md` | Project-only rules, stack, commands, expected branch |
| State | `{project}/.gsd-t/` | progress, contracts, graph, scan output, pseudocode, approvals |

## State Files (per project)

| Path | Purpose |
|---|---|
| `.gsd-t/progress.md` | Version, status, timestamped Decision Log |
| `.gsd-t/contracts/` | Interfaces between parts |
| `.gsd-t/pseudocode/PseudoCode-*.md` | Architect plans (plain-English decision trees) |
| `.gsd-t/scan/` | Scan register, dimension files, archives |
| `.gsd-t/graphDB/` | Code graph store, SCIP indexes, telemetry |
| `.gsd-t/fallbacks.json` | Approved fallbacks |
| `.gsd-t/graph-exclude.json`, `graph-search-gate.json` | Graph exclude list; search-guard opt-out |
| `.gsd-t/continue-here-*.md` | Pause checkpoints |
| `docs/infrastructure.md` `## Environments` | Environment map |

## Security Model

- Symlink checks before writes (`isSymlink`, `hasSymlinkInPath`); init uses exclusive create (`wx`).
- `execFileSync` with array args, not shell strings.
- Retired files are header-sentinel matched and moved to a dated backup, never deleted; any symlink on a touched path halts the run before changes; a file without GSD-T provenance is never touched.
- Env registry stores no secret values.
- HTTP responses capped at 1 MB with timeouts in the update check.
