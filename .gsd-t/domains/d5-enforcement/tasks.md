# Tasks: d5-enforcement

## Summary
Make "every spawn uses the wrapper" a mechanical invariant. D2 converts all current call sites; D5 prevents future regressions. Two mechanisms: a pre-commit linter that greps for `Task(`/`claude -p`/`spawn('claude'` without a surrounding wrapper, and a new MUST rule appended to both CLAUDE files.

## Tasks

### Task 1: Linter module
- **Files**: `bin/gsd-t-capture-lint.cjs` (NEW)
- **Contract refs**: N/A
- **Dependencies**: Requires D1 (wrapper exists) and D2 (call sites converted, so linter passes on main at ship time)
- **Wave**: 3
- **Acceptance criteria**:
  - Exports `lintFiles(paths, {projectDir}) → {violations: [{file, line, pattern, message}]}`
  - For each path, reads the file and matches against patterns: `\bTask\(`, `\bspawn\(['"]claude['"]`, `\bclaude -p\b`
  - Filters out comment-only lines (`^\s*//`, `^\s*#`, `^\s*<!--`) and matches inside markdown fenced code blocks correctly (only inside ``` fences, not in prose)
  - For each match, scans ± 20 lines for `captureSpawn(` or `recordSpawnRow(` — if neither found → violation
  - Whitelist: `bin/gsd-t-token-capture.cjs`, `test/**`, files with literal comment `GSD-T-CAPTURE-LINT: skip`
  - Exports `main({projectDir, mode})` where mode is `'staged'` or `'all'`
  - Zero external deps

### Task 2: CLI wiring
- **Files**: `bin/gsd-t.js`
- **Contract refs**: N/A
- **Dependencies**: Requires Task 1
- **Wave**: 3
- **Acceptance criteria**:
  - Adds `gsd-t capture-lint [--staged] [--all] [--project-dir .]` subcommand
  - Default `--staged`
  - `--staged`: runs `git diff --name-only --cached` in `projectDir`, filters to `commands/|bin/|scripts/`, lints
  - `--all`: globs `commands/*.md`, `bin/*.{js,cjs}`, `scripts/*.{js,cjs,html}`, lints all
  - Exit 0 on clean, 1 on violations (printed `path:line: message`), 2 on IO error

### Task 3: Opt-in git hook installer
- **Files**: `scripts/hooks/pre-commit-capture-lint` (NEW, executable bash), `bin/gsd-t.js` (adds `--install-hooks` branch to `gsd-t init`)
- **Contract refs**: N/A
- **Dependencies**: Requires Task 2
- **Wave**: 3
- **Acceptance criteria**:
  - `scripts/hooks/pre-commit-capture-lint` is a minimal bash script: `gsd-t capture-lint --staged || { echo "Token capture lint failed"; exit 1; }`
  - `gsd-t init --install-hooks` copies (or appends to existing) `.git/hooks/pre-commit`, `chmod +x`
  - If `.git/hooks/pre-commit` exists: appends the hook block with header comment `# GSD-T capture lint` — never overwrites existing hook
  - Prints "Hook installed at .git/hooks/pre-commit — test with: gsd-t capture-lint --staged"
  - Hook is opt-in only — never auto-installed by `gsd-t init` alone

### Task 4: CLAUDE-global.md + CLAUDE.md rule
- **Files**: `templates/CLAUDE-global.md`, `/Users/david/projects/GSD-T/CLAUDE.md`
- **Contract refs**: N/A
- **Dependencies**: Requires D1 (so the rule references a real file)
- **Wave**: 3
- **Acceptance criteria**:
  - Appends a "Token Capture Rule (MANDATORY)" section to both files, under the Observability Logging section that D2 rewrote
  - Rule text is identical between the two files
  - Rule states: every `Task(...)` subagent spawn, every `claude -p` child process, every `spawn('claude', ...)` call MUST flow through `bin/gsd-t-token-capture.cjs`
  - Rule references `gsd-t capture-lint` as the mechanical enforcement
  - Rule includes rationale: pre-M41 convention wrote `N/A` because no caller parsed `usage`; wrapper is the single place that parses it

### Task 5: Unit tests
- **Files**: `test/m41-capture-lint.test.js` (NEW)
- **Contract refs**: N/A
- **Dependencies**: Requires Tasks 1, 2, 3, and 4
- **Wave**: 3
- **Acceptance criteria**: 10+ tests:
  - Clean file with `captureSpawn(spawnFn: () => Task(...))` → no violation
  - Bare `Task(...)` in a command file fence → violation with correct file:line
  - `Task(` inside a comment line → not a violation
  - `Task(` inside `test/m41-*.js` → not a violation (test whitelist)
  - `Task(` with `GSD-T-CAPTURE-LINT: skip` on same or adjacent line → not a violation
  - `claude -p` in a command file fence without a wrapper → violation
  - `--staged` mode: mock `git diff --name-only --cached`, verifies filter to `commands/|bin/|scripts/`
  - `--all` mode: globs expected directories
  - Whitelist: `bin/gsd-t-token-capture.cjs` is never flagged
  - Perf: linting all command files completes in < 2s
  - Real-world: after D2 completes, `gsd-t capture-lint --all` on `main` exits 0

## Done Signal
- Tasks 1–2: linter runs; `gsd-t capture-lint --all` exits 0 on post-D2 main
- Task 3: `gsd-t init --install-hooks` installs the hook; firing blocks a staged commit with bare `Task(`; passing once wrapper added
- Task 4: both CLAUDE files carry the new MUST rule
- Task 5: tests pass
- Full suite `npm test` at baseline+N green

## Owned Patterns
- `bin/gsd-t-capture-lint.cjs`
- `test/m41-capture-lint.test.js`
- `scripts/hooks/pre-commit-capture-lint`
- "Token Capture Rule (MANDATORY)" section in `templates/CLAUDE-global.md` and `CLAUDE.md`
- `bin/gsd-t.js`: only the `capture-lint` subcommand and the `init --install-hooks` branch
