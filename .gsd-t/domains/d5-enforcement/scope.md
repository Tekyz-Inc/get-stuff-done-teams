# Domain: d5-enforcement

## Responsibility

Make "every spawn uses the wrapper" a **mechanical invariant**, not a policy. D2 converts all current call sites; D5 ensures future call sites can't regress. Two mechanisms:

1. **Pre-commit linter** — `bin/gsd-t-capture-lint.cjs`: greps staged files for spawn patterns (`Task(`, `claude -p`, `spawn('claude'`) that are NOT within a `captureSpawn`/`recordSpawnRow` call. Exits non-zero with file:line on violation.
2. **CLAUDE-global.md rule** — a new MUST rule stating "every subagent/claude-p spawn goes through `bin/gsd-t-token-capture.cjs`" so the methodology itself enforces it even before pre-commit runs.

## Owned Files/Directories

- `bin/gsd-t-capture-lint.cjs` (NEW) — the linter
- `templates/CLAUDE-global.md` — add the new MUST rule under Observability Logging (same section D2 rewrote)
- `/Users/david/projects/GSD-T/CLAUDE.md` — same rule added here (project-local copy)
- `test/m41-capture-lint.test.js` (NEW)
- One new subcommand in `bin/gsd-t.js`: `gsd-t capture-lint [--staged] [--all] [--project-dir .]`
- One optional git hook: `scripts/hooks/pre-commit-capture-lint` (user installs via `gsd-t init --install-hooks` — not auto-installed)

## NOT Owned (do not modify)

- `bin/gsd-t-token-capture.cjs` — D1
- Any `commands/*.md` content — D2 owns the call-site rewrites; D5 only *verifies* them
- Any existing git hook the user already has — append, never overwrite

## Public API

### `gsd-t capture-lint [--staged] [--all] [--project-dir .]`

- `--staged` (default): lint only git-staged files
- `--all`: lint every file in `commands/` and `bin/` and `scripts/`
- Exit 0: no violations
- Exit 1: violations found; prints `path:line: <spawn-pattern> without surrounding captureSpawn/recordSpawnRow`

### The new CLAUDE.md MUST rule (exact text)

```
## Token Capture Rule (MANDATORY)

Every Task subagent spawn, every `claude -p` child process, and every `spawn('claude', ...)`
call MUST flow through `bin/gsd-t-token-capture.cjs`. Either wrap with `captureSpawn({...,
spawnFn})` or record explicitly with `recordSpawnRow({...})` after the call returns.

No command file ships a bare `Task(...)` or `claude -p` line outside of a wrapper call.
`gsd-t capture-lint` enforces this mechanically; violations fail pre-commit.

Rationale: the pre-M41 convention silently wrote `N/A` tokens because no caller parsed
the `usage` envelope. The wrapper is the single place that parses it. Bypassing the
wrapper re-introduces blind spots.
```

## Linter Rules

1. For each file, find all occurrences of: `Task(`, `spawn('claude'`, `spawn("claude"`, `\bclaude -p\b` (executable lines only — comment lines and markdown prose are OK).
2. For each occurrence, check ± 20 lines around it for either `captureSpawn(` or `recordSpawnRow(`.
3. If neither is found within that window → violation.
4. Whitelist: `bin/gsd-t-token-capture.cjs` itself (it *is* the wrapper), `test/**` (tests may spawn without the wrapper for test-of-the-wrapper purposes), and any file with a literal comment `// GSD-T-CAPTURE-LINT: skip` (explicit opt-out with justification expected inline).

## Scope of Enforcement

Initial ship: **warn-level** linter is an error, but the pre-commit hook is **opt-in** (user installs via `gsd-t init --install-hooks`) so we don't break existing contributors who haven't updated. Post-M41 shakedown (M42+ if needed): consider making the hook automatic when the linter is stable.
