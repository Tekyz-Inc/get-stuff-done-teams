# Code Quality Analysis — 2026-04-16 (Scan #11)

## Dead Code

### Q-DC01 — Two parallel dashboard implementations, the new one unwired
- Files (new, untracked → just `git add`'d this session):
  `scripts/gsd-t-agent-dashboard-server.js`, `scripts/gsd-t-agent-dashboard.html`
- The existing `scripts/gsd-t-dashboard-server.js` (port 7433) is wired into the CLI
  (`bin/gsd-t.js`), `commands/gsd-t-visualize.md`, `README.md`, and contracts.
- The new agent topology dashboard (port 7434) has **zero references** anywhere
  (verified: `grep "agent-dashboard"` returns no hits in commands, CLI, README, docs,
  or other scripts).
- Either: (a) finish wiring it (add `gsd-t-visualize-agents` command or extend
  `gsd-t-visualize` with a `--agents` flag, register port + path in
  `dashboard-server-contract.md`, document in README), OR (b) remove the files. As
  shipped today it is dead code that ships in the npm package (the `scripts/` dir is
  in `package.json#files`).
- Effort: small (wire-up) or trivial (remove).

### Q-DC02 — Dead-file deletion confirmed (housekeeping note)
- Three files were deleted this session per the operator note:
  `scripts/context-meter/count-tokens-client.js`,
  `scripts/context-meter/count-tokens-client.test.js`,
  `scripts/context-meter/test-injector.js`.
- The corresponding skip rule in `bin/gsd-t.js` was reportedly cleaned up too.
- Verified: `scripts/context-meter/` now contains only `estimate-tokens.{js,test.js}`,
  `threshold.{js,test.js}`, `transcript-parser.{js,test.js}`. No further action needed.

## Duplication

### Q-DUP01 — Paired `.js` / `.cjs` duplicates with drift risk
- 7 paired sets in `bin/`: `gsd-t-unattended`, `gsd-t-unattended-platform`,
  `gsd-t-unattended-safety`, `runway-estimator`, `token-telemetry`,
  `headless-auto-spawn`, `handoff-lock`.
- Necessary because hooks and some installer paths require CommonJS-with-`.cjs`
  resolution while the rest of the codebase is mixed. But this means every code change
  to those modules must be made in both files.
- No automated check ensures the pairs stay in sync.
- Effort: medium — write a `npm test` companion that diff-compares paired modules at
  the AST level (or a simpler check: same exported symbols + same line count
  ±10%); fail CI on drift.

## Reusability Analysis

### Consumer Surfaces Detected

| Surface | Type | Operations Used |
|---------|------|----------------|
| `bin/gsd-t.js` CLI | CLI | install, update, init, status, doctor, headless, metrics, graph, uninstall, version-update-all |
| Slash commands (`commands/*.md`) | Agent workflow | All workflow phases — orchestrate via Bash to call bin/* helpers |
| Hooks (context-meter, statusline, heartbeat, update-check, auto-route) | Claude Code hook | Each does one narrow job |
| Dashboards (`scripts/gsd-t-dashboard-server.js`, `scripts/gsd-t-agent-dashboard-server.js`) | Local web UI | Read events, heartbeats, context-meter state, supervisor state |
| Unattended supervisor (detached) | OS process | Drives `claude -p` worker relay |

### Shared Service Candidates

| Operation | Found In | Recommendation |
|-----------|----------|----------------|
| Atomic file write (write tmp → rename) | `scripts/gsd-t-context-meter.js` `writeStateAtomic`, several `bin/*.js` files implement variants | Extract to `bin/fs-atomic.js` and require in all sites |
| `.jsonl` line append + tail | `bin/metrics-collector.js`, `scripts/gsd-t-event-writer.js`, `scripts/gsd-t-heartbeat.js`, dashboard servers | Extract `bin/jsonl-tail.js` (open + watch + parse + replay) |
| Threshold-band classification | `bin/token-budget.cjs` `bandFor`, `scripts/context-meter/threshold.js` `bandFor` | These exist in both sides of the meter — verify single source of truth (the meter side is canonical; the budget side should `require()` it instead of re-implementing) |
| Cross-platform process spawn with stdin/stdout JSON | `bin/headless-auto-spawn.js`, `bin/gsd-t-unattended-platform.js`, `bin/graph-cgc.js` | Each handles signal forwarding / timeout / fail-open differently — extract `bin/spawn-json.js` |

> **Note**: These candidates should seed Step 1.6 (Consumer Surface Identification) the
> next time `/user:gsd-t-partition` is run.

## Complexity Hotspots

| File | Approx LOC | Notes |
|------|-----------|-------|
| `bin/gsd-t.js` | ~3,300+ | Mega-installer. Already split out several helpers; further extraction (graph subcommand, metrics subcommand, doctor) would help. |
| `bin/orchestrator.js` | high | Abstract phase engine — consolidates many gates; worth a contract-level review next milestone. |
| `commands/gsd-t-execute.md` | ~700 lines | The richest command file. Step 5 alone has multiple sub-steps + observability + Red Team + Design Verification. |
| `commands/gsd-t-wave.md` | 489 lines | Coordinates the full cycle; high coupling to other command files. |

## Error Handling Gaps
- Most CLI sites use synchronous `fs` calls with simple try/catch around write operations.
- The PostToolUse hook is correctly wrapped in a top-level try/catch (fail-open invariant
  documented and enforced).
- **Gap (carried)**: `bin/scan-export.js` / `bin/scan-renderer.js` `execSync` interpolation
  (TD-084 in archive) — string-interpolated shell, can throw obscure errors and bypass
  intended validation.

## Performance Issues
- 76 `heartbeat-*.jsonl` files in `.gsd-t/` slow down `ls`, `du`, and any scan that walks
  `.gsd-t/`. Low impact today (9.7 MB total), but grows monotonically.
- The dashboard SSE servers do not appear to use sendfile / batched writes; for large
  event volumes a buffered batch flush would reduce per-event syscall pressure
  (defer until measured pain).

## Naming
- Consistent overall (`snake_case` for JS file names, `PascalCase` for classes, `camelCase`
  for functions).
- Minor: `gsd-t-unattended-platform.js` vs `unattended-platform.test.js` — the test name
  drops the `gsd-t-` prefix that the source has. 7 paired files have similar
  test-name/source-name skew. Trivial; mention only because uniformity across `test/`
  improves grep workflows.

## Unresolved Developer Notes
- No TODO/FIXME/XXX/HACK markers found in `bin/` or `scripts/`. (Discipline: good.)

## Test Coverage Gaps

### Q-T01 — 7 failing tests in `scripts/gsd-t-context-meter.test.js` after v3.11.11
- **Status**: known regression introduced by yesterday's switch from API to local
  estimator.
- Failures: tests 2, 3, 4, 6, 7b, 10c, 11. All use the now-removed `_countTokens`
  injection or assert on a `tokens=42` log line that the new estimator doesn't produce.
- Root cause: source was migrated to `_estimateTokens` injection but the test file was
  not.
- Fix: rewrite each test to inject `_estimateTokens` and assert on the new behavior;
  retain the privacy-content invariant (test 11) but with the new log format
  (`tokens=N pct=X.X band=Y`).
- This is a **stop-the-line** item — the tests these replaced cover privacy and
  fail-open invariants.

### Q-T02 — Pre-existing `test/token-budget.test.js` "heuristic fallback" failures
- **Status**: per operator note, 2 known failures expected. Verified separately with
  `node --test test/token-budget.test.js`: result is **42/42 passing** as of this
  scan. The previously-flagged heuristic-fallback tests appear to no longer be failing
  — possibly fixed in a recent commit (file is listed as ` M test/token-budget.test.js`
  in `git status` so the working tree includes the fix).
- Recommend: clear the "2 known failures" advisory from operator notes; current
  baseline is clean for this file.

### Q-T03 — No coverage of v3.11.11 estimator privacy invariant
- `scripts/context-meter/estimate-tokens.js` does not appear in any `*.test.js` file
  besides its own `estimate-tokens.test.js`. The privacy-content rule (must never log
  raw user/assistant text) needs a dedicated test in `gsd-t-context-meter.test.js`
  once that file is repaired.

## Stale Dependencies

| Package | Current | Latest | Breaking? | Priority |
|---------|---------|--------|-----------|----------|
| (none — zero declared deps) | — | — | — | — |

- Node engine requirement: `>=16`. Node 16 is EOL (April 2024). Bump to `>=18` or
  `>=20` (active LTS) to remove an EOL signal in users' npm warnings.

## Documentation Drift Hotspots (Quality)

### Q-DOC01 — Project `CLAUDE.md` describes the retired `bin/task-counter.cjs` as the "real guard"
- Project `CLAUDE.md` (this repo) under "Observability Logging" still includes:
  > `COUNTER=$(node bin/task-counter.cjs status …)`
  >
  > `Orchestrator Task-Count Gate (execute + wave, replaces the broken env-var self-check):`
  > `bin/task-counter.cjs is the real guard.`
- The file no longer exists. M34 retired it. The live commands (`gsd-t-execute.md`,
  `gsd-t-wave.md`) and global `~/.claude/CLAUDE.md` reflect the retirement.
- Effort: small — replace the section with the M34/M35 context-meter narrative.

### Q-DOC02 — Stale `count_tokens` / `ANTHROPIC_API_KEY` references after v3.11.11
- Files still referring to the API path:
  `.gsd-t/contracts/context-meter-contract.md` (16 hits — partial update, but Purpose
  paragraph + Field reference still tell the API story),
  `docs/architecture.md` (4),
  `docs/infrastructure.md` (12),
  `docs/requirements.md` (2),
  `README.md` (10),
  `docs/methodology.md` (multiple),
  `CHANGELOG.md` (multiple),
  commands `gsd-t-execute.md`, `gsd-t-resume.md`, `gsd-t-wave.md`.
- Doctor and installer were updated; user-facing surface was not.
- Effort: medium — full doc-ripple pass. Each file needs a "v3.11.11 supersedes this"
  marker + replacement narrative.

### Q-DOC03 — Command count drift
- `package.json` description says `61 slash commands`. Actual: 61. ✅
- Project `CLAUDE.md` line in Overview says `56 slash commands (51 GSD-T workflow + 5 utility)`.
  Actual: 61 (56 GSD-T + 5 utility — the `+5` figure is right but the total is wrong).
- README.md mentions `61 slash commands` ✅ in two places.
- Effort: trivial — bump CLAUDE.md.

## Misc / Housekeeping

### Q-H01 — Working-tree noise in `.gsd-t/`
- 76 `heartbeat-*.jsonl` files (gitignored, but still in the working dir).
- 6 `continue-here-*.md` files. 4 `brainstorm-*.md`. Several `M*-*.md` spike-finding
  files at the root (M35, M36).
- These are gitignored or are intentional records, but they accumulate. A documented
  "session-end housekeeping" command (or `gsd-t-pause` extension) would help.

### Q-H02 — Runtime files dirty in `git status`
- `.claude/scheduled_tasks.lock`, `.gsd-t/.unattended/run.log`,
  `.gsd-t/.unattended/state.json` are listed as modified. These are runtime artifacts;
  they should be in `.gitignore`. Verify `.gsd-t/.unattended/` is ignored
  (state.json may legitimately be tracked as the canonical schema example, but
  run.log + supervisor.pid should not be).
