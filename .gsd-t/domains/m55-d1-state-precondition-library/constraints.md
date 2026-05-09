# Constraints: m55-d1-state-precondition-library

## Must Follow

- **Zero runtime deps** — no `require()` of anything outside Node built-ins (`fs`, `path`, `child_process`, `os`). Mirror the discipline of `bin/parallelism-report.cjs`.
- **Deterministic output** — same project state in → byte-identical envelope out (sort `checks[]` by `id`, sort `notes[]`).
- **Schema-versioned** — envelope's top-level `schemaVersion` field set to `"1.0.0"`. Bump rules documented in `.gsd-t/contracts/cli-preflight-contract.md`.
- **Pure** — never spawn child processes that could mutate state. `child_process.execSync` is OK for `git rev-parse --abbrev-ref HEAD`, `lsof -nP -iTCP:PORT -sTCP:LISTEN`, etc. — read-only commands only.
- **Fail-soft per check** — a single check throwing must not crash the library; catch, mark check `ok: false`, set severity, append a `notes[]` entry pointing at the cause.
- **Severity model**: `error` (blocks), `warn` (records, does not block), `info` (records, does not block). Top-level `ok` = `false` iff any check is `ok: false` AND `severity === "error"`.
- **CLI-as-library-thin-wrapper** — `bin/cli-preflight.cjs` exports the library; the CLI form is a small `if (require.main === module)` block that calls the library and prints JSON or text.
- **Per-check files** — one check per file in `bin/cli-preflight-checks/` so adding a check is a single-file change. Registry is a directory scan, not a hand-maintained switch.
- **`captureSpawn` exemption** — preflight does not spawn LLMs, so `bin/gsd-t-token-capture.cjs` does not apply. Document this explicitly in `cli-preflight-contract.md`.

## Must Not

- Modify any file outside the Owned scope above
- Spawn LLM children (no `claude -p`, no `Task(...)` — preflight is deterministic)
- Take a runtime dependency (no `npm install`)
- Inline check logic into `bin/cli-preflight.cjs` — every check is a separate file
- Reach into `commands/` or `bin/gsd-t.js` (D5's job)
- Fail closed when an OPTIONAL check has nothing to inspect (e.g., `manifest-fresh` against a project with no journey manifest → check is `ok: true, severity: info, msg: "no manifest, skipping"`)

## Must Read Before Using

The execute agent for D1 must read these files BEFORE writing code:

- **`bin/parallelism-report.cjs`** — envelope idiom, zero-dep style, JSON-vs-text mode, error-handling discipline. D1's library is structurally a sibling.
- **`bin/journey-coverage.cjs`** — pattern for one-shot detector libraries that ship as both lib + CLI; same shape as cli-preflight.
- **`scripts/hooks/pre-commit-playwright-gate`** (M50) — example of a state precondition (file mtime comparison) similar to the `manifest-fresh` check.
- **`bin/headless-auto-spawn.cjs`** — see how `hasUI`/`hasPlaywright` are used as preflight gates today; D1 generalizes that pattern.
- **`.gsd-t/contracts/parallelism-report-contract.md`** — sister contract to model `cli-preflight-contract.md` after.
- **`CLAUDE.md` (project)** "Expected branch" idiom — how `branch-guard` reads it (markdown grep against the project CLAUDE.md, not the global one).

D1 is prohibited from treating any of these as black boxes — read the listed sections before depending on shape.

## Dependencies

- Depends on: nothing (independent — Wave 1 candidate, runs parallel with D3 and D4)
- Depended on by: D5 (Track 1 of verify-gate consumes the envelope; D5's `gsd-t-execute` Step 1 wire-in calls `runPreflight()`)
