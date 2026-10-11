# Workflows — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-10-10 (v6.0.10 slim-down)

## User Workflows

### Install GSD-T

1. `npx @tekyzinc/gsd-t install`
2. Commands land in `~/.claude/commands/`; the GSD-T block is merged into `~/.claude/CLAUDE.md` (only the content between the `GSD-T:START` / `GSD-T:END` markers is replaced); hooks are registered in `~/.claude/settings.json`; SCIP indexers are installed.
3. Anything an earlier version installed and v6 no longer ships is removed and named in the output.

### Onboard a project

1. In the project, run `/gsd-t-init-scan-setup`.
2. It sets up git, runs `gsd-t init` (CLAUDE.md, docs/, .gsd-t/, bin/ tools, registration), runs `/gsd-t-scan`, then rewrites the project CLAUDE.md from the scan findings and logs the rewrite.
3. Existing `.gsd-t/` artifacts only skip re-creating directories; scan and the CLAUDE.md refresh always run.

### Everyday change

1. Claude reads the request, the project CLAUDE.md and the relevant docs.
2. Non-trivial design → `/gsd-t-architect` → PseudoCode plan → user approves direction.
3. Claude builds and tests directly. Structural questions go through `gsd-t graph`.
4. Risky change → `/gsd-t-red-team` → fix CRITICAL/HIGH, re-attack (two rounds max).
5. Commit with docs, tests and a timestamped Decision Log line in the same commit.

### Debug

1. `/gsd-t-debug "<symptom>"` resolves `gsd-t workflow-path debug` and calls the Workflow.
2. Graph localize: blast-radius + who-calls for the failing area. Graph unavailable → halt with "fix it (gsd-t graph status)"; no grep fallback.
3. Cycle 1: diagnose → hypothesis → fix → test.
4. Cycle 2 (only if cycle 1 failed): sees cycle 1's failed hypothesis.
5. Still failing → exit `needs-human` with what was tried. Touched files are re-indexed after a fix.

### Scan

1. `/gsd-t-scan` resolves `gsd-t workflow-path scan` and calls the Workflow.
2. Preflight → volume probe (cohesive sub-domains) → graph wiring (index if absent; dead-code, dangling, cluster slices).
3. `gsd-t slice-budget` splits slices by line count; it never drops a slice, and a failure halts.
4. Deep finder per slice → single verify → synthesis (archive the prior register, write the new one, continue TD numbering) → consolidation of related findings.
5. Document stage: living docs, five dimension files under `.gsd-t/scan/`, and a plain-English companion.

### Pause and resume

- `/gsd-t-pause` writes `.gsd-t/continue-here-{timestamp}.md`: position, last action, next action, blockers.
- `/gsd-t-resume` reads the newest continue-here file and `.gsd-t/progress.md`, reports, and continues.

### Work in a worktree

1. `gsd-t pick-worktree --name <branch>` → prints the path; `cd` there and start Claude.
2. New worktree → created under `~/Worktrees/<project>/<branch>/` and provisioned (carry config + secrets, skip session state, install from lockfile).
3. Existing free worktree → entered. Occupied, or a folder git doesn't know as that branch's worktree → refused.

### Reach a non-local environment

1. Read `## Environments` in `docs/infrastructure.md`.
2. Hit → run the recorded command; the secret comes from its vault via `$VAR`.
3. Miss → halt, ask the user, `record` the row first, add the permission entry, then proceed.

### Demo videos

1. `/gsd-t-demo-videos` checks prerequisites (fixed-voice TTS, auto-editor, Playwright project pinned to 1440×900).
2. Copies `templates/demo-videos/` into the project, writes a spec + narration lines per walkthrough.
3. Voices lines (one sentence per request, cached), records, trims, muxes, normalises loudness, checks; re-renders until the checks pass.

### Estimates

1. `/gsd-t-estimate` reads the source documents and the target sheet (`gsd-t estimate-sheet read`).
2. Claude writes a JSON plan of judgments; `plan-check` validates it and prints the roster it would write.
3. `write` creates T-Shirt, Team Mix and Tech Stack, then `audit` reads back against the spec. Any violation halts.
4. `/gsd-t-estimate-rescale` re-prices an existing sheet on the AI-assisted scale into `(Rescale)` tabs.

## Technical Workflows

### Hook registration

Each guard hook has a marker string. On install, the registrar finds an existing entry by marker, refreshes its command if stale, or adds it. `removeRetiredHooks` deletes entries whose command contains any `RETIRED_V6.hookMarkers` string. `uninstall` removes every GSD-T marker.

### Update all projects

1. `gsd-t update-all` (or `/gsd-t-version-update-all`).
2. Global: installed version differs → full update; same version → still remove retired hooks and files.
3. Per registered project: copy `PROJECT_BIN_TOOLS` into `bin/`; remove listed retired tools whose header matches a shipped sentinel. The GSD-T source repo is skipped.

### Install self-heal

At session start `gsd-t-install-heal.js` runs `gsd-t-install-check` on the project: missing tools are copied from the installed package and logged; anything it can't repair halts with a message.

### CLAUDE.md changelog

- SessionStart: `gsd-t-changelog-check.js` compares `CLAUDE.md` mtime to the last entry in `CLAUDE.md updates.md`; newer → appends "External update detected".
- After Write/Edit to `CLAUDE.md`: `gsd-t-changelog-post-edit.js` reminds Claude to append an entry (`bin/gsd-t-claude-md-changelog.cjs append`).

### Version bump

Semver with a two-digit patch (reset to 10). Version lives in `package.json`, `package-lock.json`, `.gsd-t/progress.md`, README, CHANGELOG, and the git tag.

### Publish (this repo)

`/cpua`: `npm test` → bump version + CHANGELOG + progress.md → commit → tag + push → `npm publish` → poll until the registry serves the tarball → clean npm cache → install by tarball → verify the installed version on disk → `gsd-t install` → `update-all` → re-check. Any step that reports success without the change landing halts.
