# Constraints: m52-d1-journey-coverage-tooling

## Must Follow

- **Zero runtime deps.** The installer's zero-dep invariant (project CLAUDE.md
  § Don't) extends to `bin/journey-coverage.cjs`. Source-form walking is
  regex + manual splitting; no `acorn`, no `@babel/parser`, no esprima.
- **Mirror M50 hook patterns exactly.** The pre-commit hook installer
  (`installJourneyCoverageHook`), the marker delimiter style, the bash hook
  shape, and the `gsd-t doctor --install-hooks` integration all follow
  `installPlaywrightGateHook` / `pre-commit-playwright-gate` line-for-line.
  Diverging from the M50 model is forbidden — operators learn one pattern.
- **Idempotent everywhere.** Hook install, manifest reads, CLI runs:
  re-running the same operation must yield the same result. Reuse the M50
  `MARKER` round-trip pattern.
- **Fail-closed on missing manifest, fail-open on detector crash.**
  - Missing `.gsd-t/journey-manifest.json` → exit 4 with hint
    `run: gsd-t init-journeys` (or equivalent bootstrap message). This is
    intentional: we want the operator to feel the gate the first time they
    touch viewer source.
  - Detector internal exception → exit 0 + stderr warning. A broken detector
    must never block a commit (lesson from M50's playwright-gate fail-open
    on missing timestamps).
- **Source-form walking only.** Detector reads files as strings. No code
  execution, no DOM construction, no headless browser. Speed target:
  < 100ms on the full viewer file set, since pre-commit must stay snappy.
- **Universal token capture.** No `Task(...)` / `claude -p` / `spawn('claude', …)`
  in this domain — tooling, not subagents. (No wrapper needed.)

## Must Not

- **Modify any file under D2's ownership.** No edits to `e2e/journeys/`,
  `e2e/fixtures/journeys/`, or `e2e/viewer/`.
- **Modify production viewer code.** `scripts/gsd-t-transcript.html`,
  `scripts/gsd-t-dashboard-server.js`, and any `bin/gsd-t-dashboard*.cjs` are
  read-only targets. If the detector reveals a real viewer bug, file under
  `backlog/` and stop — fixing it is out of scope.
- **Touch M50's spawn-time gate.** `bin/headless-auto-spawn.cjs` and
  `scripts/hooks/pre-commit-playwright-gate` are off-limits. M52 is parallel
  enforcement, not replacement.
- **Skip the `bin/gsd-t.js` checkpoint.** D1's edits in that file must be
  staged + committed BEFORE D2 starts so that D2's CI assertion of
  `gsd-t check-coverage` can pass. D1 publishes a checkpoint comment in
  `.gsd-t/contracts/m52-integration-points.md` after the
  `bin/gsd-t.js` edits land.
- **Add new external runtime deps.** Confirmed by `package.json`
  inspection — `dependencies` stays empty.

## Must Read Before Using

- `bin/playwright-bootstrap.cjs::installPlaywrightSync` — D1 mirrors its
  idempotent-installer pattern + return-shape contract (M50 D1 task-3).
- `bin/headless-auto-spawn.cjs::TESTING_OR_UI_COMMANDS` — D1's hook uses
  the same staged-file-pattern style (M50 D2 task-2).
- `scripts/hooks/pre-commit-capture-lint` — original delimited-block model.
- `scripts/hooks/pre-commit-playwright-gate` — closest structural template.
  Copy the bash shape (shebang, `set -e`, marker block, `git diff --cached
  --name-only`, fail-open on detector errors).
- `bin/gsd-t.js::installPlaywrightGateHook` (~ line 584) and its caller
  in `installHeartbeat` — the wiring template.
- `bin/gsd-t.js::checkDoctorProject` — for the `--install-journey-hook` flag.

## Dependencies

- **Depends on**: M50 (`installPlaywrightSync`, `pre-commit-playwright-gate`
  bash patterns, `gsd-t doctor --install-hooks`); existing
  `bin/gsd-t-token-capture.cjs` (untouched, but D1's tests use the same
  Node test runner conventions).
- **Depended on by**: D2 (manifest contract, `gsd-t check-coverage` CLI,
  pre-commit hook installer wiring).

## Branch & Commit

- **Expected branch**: `main` (in-session single-day build, per milestone
  definition § "in-session-build").
- **Commit cadence**: one commit per task (5 tasks in D1). Each commit's
  Pre-Commit Gate verifies test + doc updates + manifest schema bump.
- **Doc-ripple set** (D1's share of the 5-file ripple):
  `~/.claude/CLAUDE.md` (Playwright Readiness Guard adjacent — append a
  Journey Coverage Guard subsection), `templates/CLAUDE-global.md` (mirror),
  `commands/gsd-t-debug.md`, `commands/gsd-t-execute.md`,
  `commands/gsd-t-quick.md`, `commands/gsd-t-verify.md`,
  `docs/architecture.md` (new "Journey Coverage Enforcement (M52)" subsection).
