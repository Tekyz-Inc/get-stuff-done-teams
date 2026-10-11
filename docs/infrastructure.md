# Infrastructure - GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-10-10 (v6.0.10 slim-down)

---

## Quick Reference

| Task | Command |
|------|---------|
| Install GSD-T | `npx @tekyzinc/gsd-t install` |
| Update GSD-T | `npx @tekyzinc/gsd-t update` |
| Update GSD-T + all projects | `npx @tekyzinc/gsd-t update-all` |
| Installation status | `gsd-t status` |
| Diagnose | `gsd-t doctor [--install-playwright]` |
| Scaffold a project | `gsd-t init [project-name]` |
| Register current dir | `gsd-t register` |
| Changelog | `gsd-t changelog` |
| Uninstall | `gsd-t uninstall` |
| Code graph | `gsd-t graph index \| status \| who-calls \| who-imports \| blast-radius \| body \| who-uses \| table \| metrics` |
| Worktree | `gsd-t pick-worktree [--name <branch> \| --list \| --suggest]` |
| Workflow path | `gsd-t workflow-path scan \| debug` |
| Estimate sheet | `gsd-t estimate-sheet <verb> --sheet <id\|url>` |
| PseudoCode style | `gsd-t pseudocode-style --doc <f> \| --dir <d>` |
| Install check | `gsd-t install-check --project <dir> [--check]` |
| Unit tests | `npm test` |
| Publish | `/cpua` (never bare `npm publish`) |

---

## Local Development

```bash
git clone https://github.com/Tekyz-Inc/get-stuff-done-teams.git
cd get-stuff-done-teams
npm install                     # graph deps: better-sqlite3, tree-sitter + grammars
node bin/gsd-t.js --help        # no build step
npm test                        # Node built-in runner over test/*.test.js
GSDT_SLOW_TESTS=1 npm test      # include heavy real-repo graph tests
```

`pretest` / `posttest` move this repo's own `.gsd-t/graph.db` aside during the run and restore it.

Real work happens in a worktree: `~/Worktrees/GSD-T/<branch>/` (v6 was built in `~/Worktrees/GSD-T/v6`).

---

## Distribution

- **Registry**: https://www.npmjs.com/package/@tekyzinc/gsd-t
- **Version**: `package.json` (also `package-lock.json`, `.gsd-t/progress.md`, README, CHANGELOG); installed version in `~/.claude/.gsd-t-version`.
- **Runtime dependencies**: `better-sqlite3`, `tree-sitter`, `tree-sitter-typescript`, `tree-sitter-python`. SCIP indexers (`scip-typescript`, `scip-python`) installed by `gsd-t install`.
- **Files shipped**: `bin/`, `commands/`, `scripts/`, `templates/`, `examples/`, `docs/`, `CHANGELOG.md`.
- **Publish**: `/cpua` — tests, bump, commit, tag, publish, poll the registry tarball, clean cache, install by tarball, verify the on-disk version, `install`, `update-all`, re-check.

### Installed locations

| What | Where |
|------|-------|
| Slash commands | `~/.claude/commands/` |
| Global rules (marked block) | `~/.claude/CLAUDE.md` |
| Update-check + auto-route scripts | `~/.claude/scripts/` |
| Shared templates (`estimate-config.json`, `estimate-sheet-spec.md`) | `~/.claude/templates/` |
| Global bin tools (pick-worktree, worktree-detect, worktree-provision, slice-budget, pseudocode-style, fallback-detect, code-search-classifier, install-check, estimate-sheet) | `~/.claude/bin/` |
| Hooks | `~/.claude/settings.json` |
| Version / update cache / project registry | `~/.claude/.gsd-t-version`, `.gsd-t-update-check`, `.gsd-t-projects` |
| Per-project tools | `{project}/bin/gsd-t-*.cjs` |

### Installed hooks

| Event | Script | Purpose |
|---|---|---|
| UserPromptSubmit | `gsd-t-auto-route.js` | `[GSD-T NOW]` live clock + Reader Contract |
| SessionStart | `gsd-t-update-check.js` | Version banner, auto-update |
| SessionStart | `gsd-t-install-heal.js` | Restore missing project tools |
| SessionStart | `gsd-t-changelog-check.js` | Log outside CLAUDE.md edits |
| PreToolUse Bash\|Grep | `gsd-t-graph-search-guard.js` | Block structural code searches |
| PreToolUse Write\|Edit | `gsd-t-fallback-guard.js` | Block unapproved fallbacks |
| PreToolUse Write\|Edit | `gsd-t-date-guard.js` | Block stale timestamps |
| PostToolUse Grep | `gsd-t-graph-intercept.js` | Answer structural greps from the graph |
| PostToolUse Read | `gsd-t-read-intercept.js` | Point at `graph body` slices |
| PostToolUse Write\|Edit | `gsd-t-changelog-post-edit.js` | Remind to log CLAUDE.md edits |
| Stop | `gsd-t-graph-use-report.js` | Report structural work done without the graph |

Guard hooks run from `$(npm root -g)/@tekyzinc/gsd-t/scripts/`. Hooks from earlier versions (heartbeat, context meter, status line, dashboard, in-session probes, architect oversight, brevity guard, worktree guard, …) are removed by install / update / update-all.

---

## Project directory (`.gsd-t/`)

| Path | Purpose |
|---|---|
| `progress.md` | Version, status, Decision Log |
| `contracts/` | Interfaces between parts |
| `pseudocode/` | Architect plans |
| `scan/` | Scan register, dimension files, archives |
| `graphDB/` | `graph.db` (+WAL/SHM), SCIP indexes, `logs/graph-events-NNN.jsonl` |
| `continue-here-*.md` | Pause checkpoints |
| `fallbacks.json` | Approved fallbacks |
| `graph-exclude.json` | Folders/globs the graph skips |
| `graph-search-gate.json` | `{"enabled": false}` turns the search guard off for this project |

---

## Secrets and credentials

GSD-T itself needs none beyond an npm login for publishing. Projects record environment access in the `## Environments` table of their own `docs/infrastructure.md` (vault + env-var name + `$VAR` command; never a value) via `bin/gsd-t-env-registry.cjs`. Demo videos need Google Cloud TTS credentials in the project's environment; estimates need a Google service-account key (default `~/.claude/gsd-t-secrets/gsd-t-sheets-writer-key.json`, override with `--key <path>`).

---

## Security notes

- All file writes check for symlinks; init uses exclusive create.
- Retired files are moved, never deleted, to `~/.claude/.gsd-t-retired/<date>/` or `<project>/.gsd-t/retired/<date>/`, and only with a verbatim shipped header; any symlink on the way halts the run first.
- HTTPS with timeouts and a 1 MB cap for the version check.
- The env registry rejects literal secret values.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `gsd-t: command not found` | `npm install -g @tekyzinc/gsd-t` or use `npx @tekyzinc/gsd-t` |
| Hooks not firing | `gsd-t doctor`, then `npx @tekyzinc/gsd-t install` |
| "graph unavailable" / search blocked for a missing graph | `gsd-t graph status`, then `gsd-t graph index` |
| SCIP tier missing on large files | Re-run `gsd-t graph index`; check `graph status` for SCIP-missing files |
| A project is missing `bin/` tools | Start a session (self-heal) or run `gsd-t install-check --project .` / `gsd-t update-all` |
| Old v5 commands or hooks still present | `npx @tekyzinc/gsd-t update` — retired files are moved to `~/.claude/.gsd-t-retired/<date>/` |
| Install halts on a symlink / settings.json / CLAUDE.md markers | Follow the printed `Fix:` line (replace the link with a real file, repair the JSON or markers), re-run — nothing was changed |
| Need a retired file back | Move it from `~/.claude/.gsd-t-retired/<date>/<path>` (or `<project>/.gsd-t/retired/<date>/<path>`) back to `<path>` |
