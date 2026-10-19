# Requirements — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-10-10 (v6.0.10 slim-down)

Requirements for the v6 package. Requirements for the cut pipeline (milestone → verify chain, triad, competition, model profiles, backlog, design-to-code, logging scaffolder, stack rules, headless/unattended, dashboards, test-plan-first) were retired with that code; their history is in `CHANGELOG.md` and on the `archive/v5` branch.

## Functional Requirements

### Installer and lifecycle

| ID | Requirement | Tests |
|---|---|---|
| REQ-I1 | `install` / `update` copy shipped commands to `~/.claude/commands/` and merge the GSD-T block into `~/.claude/CLAUDE.md` without touching user content outside the markers | `filesystem`, `cli-quality`, `m50-d1-cli-integration` |
| REQ-I2 | A `gsd-t-*.md` command GSD-T once shipped (name on `RETIRED_V6.commandNames`), no longer ships, and that opens with the `# GSD-T: ` header is moved on install to `~/.claude/.gsd-t-retired/<date>/commands/`; any other `gsd-t-*.md` (a user command, or a listed name without the header) is never touched | `m112-retired-commands`, `v6-retire-move` |
| REQ-I3 | Install registers every guard hook (graph search guard, graph intercept, read intercept, graph use report, fallback guard, date guard, CLAUDE.md changelog check + post-edit, install self-heal, update check, auto-route); a stale command is refreshed in place | `m97-install-hook`, `m106-fallback-gate`, `v6-retired-cleanup` |
| REQ-I4 | Install, update (including same-version) and update-all MOVE every `RETIRED_V6` file that carries a shipped header sentinel to a dated backup (`~/.claude/.gsd-t-retired/<date>/`, `<project>/.gsd-t/retired/<date>/`; relative path + permissions kept, existing backups never overwritten, one summary line) and remove retired hook markers; nothing is deleted; a same-named user file is reported and kept | `v6-retired-cleanup`, `v6-retire-move`, `m61-context-meter-hook-retired` |
| REQ-I4a | Before any change, install / update / update-all run a preflight and HALT non-zero with the exact fix, having changed nothing, when: `settings.json` is not a JSON object of hook arrays; any path GSD-T would write, copy over or move (or a directory between it and `~/.claude` / the project) is a symlink; `~/.claude/CLAUDE.md` markers are not exactly one START before one END, or it holds an old unmarked GSD-T section | `v6-retire-move`, `v6-redteam-fixes` |
| REQ-I4b | A failed copy or move halts non-zero without "Installation Complete!" and without advancing the installed version; `update-all` halts before touching anything when `npm install -g` fails | `v6-retire-move` |
| REQ-I4c | One registrar for every GSD-T hook: exactly one entry per script on its intended event, copies on other events removed, SessionStart matcher normalized to `""`, user groups' matchers never changed; GSD-T hooks matched only by the package-installed path (`~/.claude/scripts/…`, `$HOME/.claude/scripts/…`, `…/@tekyzinc/gsd-t/scripts/…`) | `v6-retire-move`, `v6-redteam-fixes` |
| REQ-I5 | `update-all` refreshes every registered project's `bin/` and moves retired strays to `.gsd-t/retired/<date>/` (adds it to `.gitignore` only if `.gsd-t` working files are already ignored); never downgrades the global install | `update-all-downgrade-halt`, `bin-gsd-t-resilience` |
| REQ-I6 | `init` scaffolds CLAUDE.md, the four living docs, `.gsd-t/progress.md`, `contracts/`, `domains/`, copies `bin/` tools, registers the project; never overwrites existing files | `filesystem`, `helpers` |
| REQ-I7 | Install self-heal restores missing project tools at session start and halts when it cannot | `m108-install-heal` |
| REQ-I8 | `uninstall` removes every GSD-T hook and command, keeps project files | `v6-retired-cleanup` |
| REQ-I9 | Playwright is bootstrapped into a project with UI and no config | `m50-d1-playwright-bootstrap`, `m50-d1-ui-detection` |

### Code graph

| ID | Requirement | Tests |
|---|---|---|
| REQ-G1 | Index JS/TS/Python with tree-sitter into SQLite under `.gsd-t/graphDB/`, streaming writes | `m94-d3-*`, `m94-graph-end-to-end` |
| REQ-G2 | Upgrade call edges with SCIP; record per-file accuracy tier; never silently downgrade a tier on re-index | `m95-scip-call-resolution`, `m97-scip-python-resolution`, `m94-d3-tier-preserved-on-reindex`, `m118-anonymous-callers-scip-missing` |
| REQ-G3 | Re-index content-hash-dirty files before answering (add/delete/rename/uncommitted edits) | `m94-d4-*` |
| REQ-G4 | Query verbs: who-calls, who-imports, blast-radius, body, who-uses, table, dead-code, dangling, cluster, test-impl, status, metrics | `m94-d5-*`, `m94-d9-*`, `m98-d2-body`, `graph-drizzle-tables`, `m119-who-calls-golden` |
| REQ-G5 | No query path greps; a broken store or parser fails loud | `m94-d5-no-grep-fallback-structural`, `m94-d5-fault-injection-fail-loud`, `broken-graph-halts` |
| REQ-G6 | One resolver owns every store path; telemetry is toggleable, size-capped and rotated | `m99-*` |
| REQ-G7 | Exclude list `.gsd-t/graph-exclude.json`; malformed file halts | `m118-graph-exclude` |
| REQ-G8 | Import aliases and nested tsconfigs resolve | `m112-alias-query-resolution`, `m112-import-alias-expansion`, `m114-nested-tsconfig-graph` |

### Guards

| ID | Requirement | Tests |
|---|---|---|
| REQ-H1 | Search guard blocks structural code searches, blocks unclear ones, blocks when the graph is missing; content searches over non-indexed files run | `m117-graph-search-guard` |
| REQ-H2 | Graph intercept replaces structural grep output; read intercept only appends | `m97-graph-intercept-hook`, `m97-grep-classifier`, `m98-d3-read-intercept` |
| REQ-H3 | Fallback guard denies unapproved fallbacks; errors halt, never allow | `m106-fallback-gate` |
| REQ-H4 | CLAUDE.md changelog records outside and Claude edits | `m110-claude-md-changelog` |
| REQ-H5 | Auto-route emits `[GSD-T NOW]` and the Reader Contract every prompt | `m93-reader-contract-presence` |
| REQ-H6 | Wrong-app guard: a prompt Haiku assigns to another registered app is blocked with a red message and the prompt to paste there; `This App - This Session` prefix skips it; a failed check blocks | `wrong-app-guard` |

### Worktrees, environments, estimates

| ID | Requirement | Tests |
|---|---|---|
| REQ-W1 | `pick-worktree` enters a free existing worktree, creates and provisions a new one, refuses occupied or unknown folders; `--list` prints `free\|busy` | `m111-pick-worktree` |
| REQ-W2 | Provisioning carries config/secrets with permissions, skips session state, installs from the lockfile, reports what it couldn't copy, halts on install failure | `m112-worktree-provision` |
| REQ-E1 | Env registry upserts rows by `(scope, kind)`, rejects literal secrets, reads back for lookup | `m102-env-registry` |
| REQ-S1 | Estimate writer computes, writes and audits by read-back; violations exit 4 | `estimate-sheet-writer` |
| REQ-P1 | PseudoCode flow-style gate (exit 0 / 4 / 64) | `pseudocode-style-gate`, `m112-architect-stage` |

### Workflows

| ID | Requirement | Tests |
|---|---|---|
| REQ-F1 | Scan and debug workflows use only sandbox globals and parse `args` as a string | `m71-workflow-runtime-native-lint`, `m81-workflows-runtime-native`, `m112-workflow-undeclared-assignment` |
| REQ-F2 | `workflow-path` resolves absolute paths; commands invoke the Workflow tool, never hand-drive | `m69-workflow-path`, `m70-workflow-invocation-guard` |
| REQ-F3 | Scan slices are budgeted by lines, split never dropped; slice-budget failure halts | `m112-slice-budget`, `m71-slice-cap-algorithm`, `m72-coverage-accounting` |
| REQ-F4 | Scan writes the register in chunks, ASCII-clean, grouped plain-English companion, tolerant of schema variants | `m75-chunked-register`, `m76-ascii-clean-register`, `m78-plain-english-grouping`, `m112-scan-schema-tolerance`, `m112-severity-labels`, `m80-scan-document-phase-refs` |
| REQ-F5 | Scan and debug consume and refresh the graph (reader + writer) | `m94-d6-scan-consumer`, `m94-d11-writer-wiring`, `m99-wiring-mode`, `m112-graph-wiring-casing` |
| REQ-F6 | Debug runs at most two fix cycles, then `needs-human`; a broken graph halts it, an absent one is built | `broken-graph-halts` (graph classification); cycle cap verified by use |

## Technical Requirements

- Node.js ≥ 16. CLI uses Node built-ins; graph dependencies: `better-sqlite3`, `tree-sitter`, `tree-sitter-typescript`, `tree-sitter-python`; SCIP indexers installed by `install`.
- Command files are markdown; Workflow scripts obey the sandbox invariant.
- Every destructive file operation is header-sentinel matched and path-contained.

## Non-Functional Requirements

- **Halt, never fall back:** any tool that cannot complete returns a non-zero exit and says why.
- **Named removals:** nothing is deleted silently.
- **No secrets in docs:** the env registry and every shipped doc hold names and `$VAR` references only.

## Test Coverage

`npm test` (Node built-in runner) over `test/*.test.js`. Heavy real-repo graph tests run only with `GSDT_SLOW_TESTS=1`.
