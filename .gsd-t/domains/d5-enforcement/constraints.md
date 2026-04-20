# Constraints: d5-enforcement

## Must Follow

- Zero external npm runtime deps (GSD-T installer invariant)
- `.cjs` extension for the linter
- Linter must be fast: < 200ms on `--staged`, < 2s on `--all` (grep-fast, not parse-fast)
- False-positive discipline: a single fix applied across 20 files must NOT cause 20 spurious lint failures. The ± 20 line window is generous on purpose.
- Git hook is **opt-in** — never auto-install. User opts in via `gsd-t init --install-hooks`. Document the command explicitly.
- When adding the MUST rule to `CLAUDE-global.md` and `CLAUDE.md`, append it — do not reorder existing rules.

## Must Not

- Block a legitimate pattern where the spawn is mocked in a test
- Silently modify existing git hooks — if the user has a `.git/hooks/pre-commit`, append to it rather than overwriting. Document the append.
- Hardcode the wrapper path — use `require.resolve('./gsd-t-token-capture.cjs', {paths: [...]})` so the linter keeps working if someone moves the file
- Add a dependency on git internals beyond `git diff --name-only --cached` — no libgit2 bindings, no node-git
- Scan files outside `commands/`, `bin/`, `scripts/` — those are the only places a spawn should appear; widening scope wastes time and produces noise

## Must Read Before Using

- `bin/gsd-t-token-capture.cjs` (D1) — know what "surrounding wrapper" looks like
- `commands/gsd-t-execute.md` post-D2 — the reference converted file; linter should pass on it
- Existing hook patterns in `scripts/hooks/` (if any) — follow repo convention

## Dependencies

- Depends on: D1 (wrapper exists, so "surrounding wrapper call" is a well-defined string)
- Depends on: D2 (call sites are converted, so the linter should pass on `main` at ship time — otherwise we'd be shipping a linter that flags our own code)
- Depended on by: nothing (D5 is terminal and additive)
