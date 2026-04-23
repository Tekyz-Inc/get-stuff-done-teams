# Changelog

All notable changes to GSD-T are documented here. Updated with each release.

## [3.18.16] - 2026-04-23

### Added — Proof measurement `--visualize` flag

- **`bin/m44-proof-measure.cjs --visualize`** writes synthetic spawn-plan files into the project's `.gsd-t/spawns/` directory as each simulated worker launches and calls `markTaskDone` + `markSpawnEnded` when they finish, so the M44 D9 parallelism panel (`scripts/gsd-t-transcript.html`, endpoint `/api/parallelism`) renders the fan-out live. Off by default — the unflagged measurement still writes spawn-plans only under the temp fixture root. Enables end-to-end visualizer observation of the dispatcher without burning API tokens.
- **Reproducibility**: three consecutive 20s-worker runs (13:08, 13:09, 13:27 local) produced identical `T_par / T_seq ≈ 0.251`, `speedup ≈ 3.98×`, `parallelism_factor ≈ 3.97`, `parallelism_factor_mode: "live"` with `activeWorkers: 4` for the full 20s parallel window. Panel transitions IDLE → live → IDLE confirmed by `/api/parallelism` polling.

## [Unreleased] — v3.19.00 pending

### Measured — Dispatcher T/2 criterion (backlog #15, leg 1 of 2)

- **`bin/m44-proof-measure.cjs`** runs a falsifiable measurement of the v3.19.00 parallel dispatcher using a synthetic spawner (`test/fixtures/m44-proof/worker-sim.js`) injected into `runDispatch` via `opts.spawnHeadlessImpl`. Fixture (`test/fixtures/m44-proof/fixture.tasks.md`): 4 file-disjoint tasks with explicit `- touches:` sub-bullets (D5 disjointness requirement). Each worker sleeps `WORKER_DURATION_MS` (default 8000ms) then writes a JSON `.done` marker — zero LLM calls, zero network, zero side effects outside `OUT_DIR`. **Result**: T_par = **8111.1 ms**, T_seq = **32146.1 ms**, speedup **3.96×**, parallelism_factor **3.95** (ideal = 4), dispatch overhead **8.2 ms**. Criterion `T_par ≤ T_seq/2` → **MET ✓**. Report JSON at `.gsd-t/m44-proof-report.json`. This proves the dispatcher fans out concurrently; it does NOT prove N Claude workers produce correct code in T/N (a separate experiment, deferred to a follow-up backlog item).

### Pending — Zero-compaction criterion (backlog #15, leg 2 of 2)

- **NOT YET MEASURED.** Requires an unattended supervisor run over a workload that historically would have triggered mid-run `/compact`, producing zero `type:"compaction_post_spawn"` rows in `.gsd-t/metrics/compactions.jsonl` under the fully-wired v3.19.00 surface (`ca20477` supervisor→planner + `799a8af` single-instrument + `19eb3eb` D9 observability panel). Existing 81 rows in the compactions log contain 0 `compaction_post_spawn` entries, but the only post-19eb3eb unattended state predates the D9 landing and is therefore not a valid sample.
- **`v3.19.00` tag deferred** until the zero-compaction leg completes. Per user standing directive `feedback_measure_dont_claim.md`: "milestones with measurable success criteria are not complete until measurement is run AND reported."

## [3.18.15] - 2026-04-23

### Fixed — Supervisor false-failed marker (M45 follow-up)

- **`bin/headless-exit-codes.cjs::mapHeadlessExitCode` polarity discipline** — the pre-fix matcher did `lower.includes("tests failed")` / `"verification failed"` / `"context budget exceeded"`, which fired on free-form narration like `"0 tests failed"`, `"no tests failed"`, and quoted phrases inside worker output. During the M45 run the worker's clean output contained `"tests failed"` 6× in healthy prose, flipping its mapped exit code 0 → 1 and causing the supervisor to finalize `status=failed` despite the milestone having been completed and archived. The matchers now require either a non-zero numeric count (`/([1-9]\d*)\s+(?:tests?|specs?|assertions?|examples?|suites?)\s+failed\b/i`), a structured terminal marker (`/^FAIL[:\s]/m`, Jest-style `/^Tests:\s+\d+\s+failed/m`), or a line-boundary / sentence-start anchor for free-form verification/context-budget phrases. 27 new polarity regression tests in `test/m45-fix-headless-exit-polarity.test.js`; all existing `headless.test.js` assertions preserved.
- **`commands/gsd-t-unattended-watch.md` Step 3 reconciliation** — when the supervisor PID file is absent AND `state.status=failed` AND a fresh milestone archive exists under `.gsd-t/milestones/` (mtime ≥ supervisor `startedAt`), the watch tick now renders a reconciled success report noting the archive as the source of truth instead of the contradictory ✅-cleanly-finalized + failed-status block the previous logic would emit. Raw final report preserved for genuinely failed runs with no archive.

## [3.18.14] - 2026-04-23

### Added — M45 Conversation-Stream Observability

- **Orchestrator dialog visible in the transcript viewer** — new hook `scripts/hooks/gsd-t-conversation-capture.js` (SessionStart + UserPromptSubmit + Stop + opt-in PostToolUse via `GSD_T_CAPTURE_TOOL_USES=1`) writes typed NDJSON frames to `.gsd-t/transcripts/in-session-{sessionId}.ndjson` for every human↔Claude turn. The visualizer's left rail now lists those entries with a `💬 conversation` badge alongside the `▶ spawn` entries, so users can watch their own dialog in the same surface as spawned work.
- **Compact marker fallback target-selection** — `scripts/gsd-t-compact-detector.js::findActiveTranscript` now prefers a fresh spawn NDJSON when one has been modified within 30s, and falls back to the most recent `in-session-*.ndjson` otherwise. Mid-conversation `/compact` events land in the correct transcript instead of a random stale spawn file.
- **New contract** `.gsd-t/contracts/conversation-capture-contract.md` v1.0.0 — documents the frame schema (`session_start` / `user_turn` / `assistant_turn` / `tool_use`), file-naming (`in-session-` prefix as the viewer + compact-detector discriminator), hook entry points, session-id source + fallback, and 16 KB content cap.
- **Settings.json hook wiring documented** — `templates/CLAUDE-global.md` gains an "In-Session Conversation Capture (M45 D2)" section so users who install/update pick up the hook alongside the existing in-session token-usage hook.

### Fixed — M45 D1 Viewer Route

- **`GET /transcripts` now serves the real transcript viewer** — reverts the standalone `renderTranscriptsHtml` index page shipped in v3.18.13. The route now reads `scripts/gsd-t-transcript.html` with `__SPAWN_ID__` → `""`, giving users the same left-rail + main + right-panel surface they get at `/transcript/:id`. JSON back-compat preserved: `Accept: application/json` and `*/*` continue to return `{spawns: [...]}`.
- **Session-id path-separator sanitization (Red Team BUG-1)** — `_resolveSessionId` in the new conversation-capture hook now rejects session_ids containing `/`, `\`, `\0`, or `..` and falls through to the pid-hash fallback. Prior behavior let `session_id="a/../b"` lexically collapse via `path.join` to produce `transcripts/b.ndjson` without the `in-session-` prefix, breaking the filename-prefix discriminator contract with the viewer + compact-detector.

## [3.18.13] - 2026-04-23

### Fixed

- **Dashboard `/transcripts` returned raw JSON to browsers** — after the v3.18.12 always-enabled Live Stream button fix, opening the dashboard with no spawn data and clicking Live Stream landed the user on `{"spawns":[]}` because `/transcripts` always served JSON. The route now does Accept-header content negotiation: browsers (`Accept: text/html`) get a proper dark-themed HTML index page with a sortable table of spawns (or a friendly empty state with a `/gsd-t-quick` CTA when no transcripts exist); programmatic clients (`fetch()` default `*/*`, or explicit `application/json`) keep getting the JSON shape the dashboard polling code already consumes — full back-compat.

## [3.18.12] - 2026-04-23

### Fixed

- **Dashboard Live Stream button stuck disabled** — the header button had `cursor:not-allowed` + `pointer-events:none` whenever the `/transcripts` index returned no spawns, including the common case of opening the dashboard before any agent had run. The button now stays enabled in all states. With a live spawn it links to the live transcript; with only finished spawns it links to the most recent one; with no spawn data at all it links to the `/transcripts` JSON index as a discoverable last resort.

## [3.18.11] - 2026-04-23

### Fixed

- **Flaky `m43-dashboard-autostart` test under load** — bumped `_isPortBusySync` spawnSync timeout from 2s → 10s. Under saturated full-suite execution the 2s budget could expire before the probe child even reported back, causing a falsely-free port reading and intermittent assertion failures. The 10s budget is comfortably above any observed real-world probe latency while still bounding hung-child cases.
- **Stale snapshot test in `m43-milestone-complete-detection`** — replaced the live-state assertion that hard-coded `M43=PARTITIONED` (true at the time the test was written, false ever since M43 completed) with an M42-only sanity check. M42 is the oldest stable terminal milestone and serves as a fixed anchor that won't go stale every release. The other 7 tests in the file already cover the actual `isMilestoneComplete` matcher logic via `withTmpProgress` fixtures.

## [3.18.10] - 2026-04-23

### Added — Cross-Domain & Cross-Task Parallelism (M44)

Task-level parallelism shipped to **both** execution modes (in-session and unattended) on equal footing, with mode-aware gating math. 8 of 9 domains landed (D1–D8 DONE; D9 parallelism-observability grafted as backlog #16 follow-up). 3 waves, 1903/1907 tests pass (4 pre-existing unrelated fails).

**Wave 1 foundation:**
- **D1 — Generic task-graph reader**: typed DAG + cycle detection + `gsd-t graph` CLI. 22/22 tests, contract v1.0.0.
- **D7 — Per-CW token attribution**: `cw_id` pass-through + post-spawn calibration hook. 19/19 tests; contracts metrics-schema v2.1.0 + compaction-events v1.1.0.

**Wave 2 parallel:**
- **D4 — Dep-graph veto gate**: refuses fan-out when deps unmet. 4/4 tasks, 13/13 tests.
- **D5 — File-disjointness prover**: union-find + git-history fallback. 4/4 tasks, 11/11 tests.
- **D6 — Pre-spawn economics estimator**: 3-tier corpus lookup (mode-aware 85%/60% thresholds) calibrated against 528-row corpus. 5/5 tasks, 9/9 tests, contract v1.0.0.

**Wave 3:**
- **D2 — `gsd-t parallel` CLI**: mode-aware gating math (in-session 85% + N=1 floor; unattended 60% + task_split signal). 5/5 tasks, 21/21 tests; wave-join-contract v1.0.0 → v1.1.0.
- **D8 — Spawn-plan-visibility**: right-side two-layer panel + `/api/spawn-plans` endpoint + SSE + post-commit token attribution hook. 7/7 tasks, 36/36 tests, contract v1.0.0.
- **D3 — Command-file integration**: additive "Optional — Parallel Dispatch (M44)" blocks in `execute`/`wave`/`quick`/`debug`/`integrate`. No hardcoded `--mode`; silent fallback to sequential. 5/5 tasks; smoke-test fixtures deferred to backlog #15.

**Mode contracts (NON-NEGOTIABLE):**
- **[in-session]** Speed + reduce compaction as much as possible. Hard rule: NEVER throw an interactive pause/resume prompt.
- **[unattended]** Run M1 → M10 end-to-end with zero human involvement and zero compaction. Per-worker CW headroom is the binding gate.

## [3.17.10] - 2026-04-21

### Added — Token Attribution & Always-Headless Inversion (M43)

Every token is now attributable to a specific tool / command / domain, and the framework is locked to a single rule: **the in-session channel is reserved for human↔Claude dialog. All tool-using work spawns. The visualizer is the watching surface.** No flags, no thresholds, no opt-outs — there is no "in-session mode" for commands to enter.

**Part A — Universal Token Attribution**

**In-session usage capture (D1)**: `bin/gsd-t-in-session-usage.cjs` exports `captureInSessionUsage({projectDir, sessionId, turnId, usage, model})` and `processHookPayload({projectDir, payload})`. Branch B locked: Stop hook triggers, Claude Code transcript (`~/.claude/projects/-.../{sessionId}.jsonl`) is the data source. Writes v2-schema JSONL rows with `sessionType: "in-session"` + distinct `turn_id` + parsed `input_tokens`/`output_tokens`/`cache_read_input_tokens`. Idempotent via transcript-line cursor. Live-validated: 523 rows from one 23-min session (`.gsd-t/.hook-probe/` evidence retained).

**Per-tool attribution (D2)**: `.gsd-t/contracts/tool-attribution-contract.md` v1.0.0 + `bin/gsd-t-tool-attribution.cjs` exports `joinTurnsAndEvents` / `attributeTurn` / `aggregateByTool|Command|Domain`. Output-byte ratio algorithm, 4 tie-breakers (zero-byte turn, missing tool_result, no tool calls, null usage). New CLI: `gsd-t tool-cost [--group-by tool|command|domain] [--since YYYY-MM-DD] [--milestone Mxx] [--format table|json]`. Perf gate: 30ms on 3k turns × 30k events fixture (budget 3s). `gsd-t tokens --show-tool-costs` optional integration adds "Top 10 tools by cost" section.

**Sink unification + schema v2 (D3)**: `.gsd-t/contracts/metrics-schema-contract.md` bumped v1 → v2 — adds optional `turn_id`, `session_id`, `sessionType`, `tool_attribution[]`, `compaction_pressure{}`. `recordSpawnRow` / `captureSpawn` pass-through preserves backward compat. `bin/gsd-t-token-regenerate-log.cjs` + `gsd-t tokens --regenerate-log` makes `.gsd-t/token-log.md` a regenerated view (streaming read + deterministic sort).

**Part B — Always-Headless Inversion (Channel Separation)**

**Default headless spawn (D4)**: `bin/headless-auto-spawn.cjs::shouldSpawnHeadless` collapsed to `() => true`. Removed low-water branch, context-meter-driven branching, `--in-session` opt-out parsing. Legacy `watch`/`inSession` params accepted-and-ignored with one-shot stderr deprecation warning. 7 command files stripped of spawn-mode branching (`execute`, `wave`, `integrate`, `quick`, `debug`, `verify`, `scan`). `/gsd` router preserves in-session classification only for dialog-only exploratory turns — all action turns spawn detached. `.gsd-t/contracts/headless-default-contract.md` bumped v1.0.0 → **v2.0.0** (breaking: flag removal). 40 matrix tests.

**Dialog-channel growth meter (D5)**: `bin/runway-estimator.cjs::estimateDialogGrowth({projectDir, sessionId, k = 5, modelContextCap = 200000})` returns `{slope, median_delta, latest_input_tokens, predicted_turns_to_compact, shouldWarn}`. Outlier-resistant median-of-deltas. When `shouldWarn=true`, `/gsd` router appends a one-line blockquote footer suggesting `/compact` or detached spawn. Pure read/warn — never refuses, never reroutes (there's nothing to reroute to under channel separation). Scope collapsed from originally-sketched circuit breaker; `.gsd-t/contracts/context-meter-contract.md` bumped v1.3.0 → v1.4.0 (additive subsection).

**Transcript viewer as primary surface (D6)**: `scripts/gsd-t-dashboard-server.js` gains `GET /transcript/:id/tool-cost` (D2-backed, 503 graceful fallback) + `GET /transcript/:id/usage` (per-turn JSONL rows). `scripts/gsd-t-transcript.html` gains collapsible Tool Cost sidebar panel with live SSE updates. `bin/headless-auto-spawn.cjs` prints `▶ Live transcript: http://127.0.0.1:{port}/transcript/{spawn-id}` on every spawn. New `scripts/gsd-t-dashboard-autostart.cjs` — `ensureDashboardRunning({projectDir})` port-probe + fork-detach + pid file, hooked into spawn start path (idempotent). `.gsd-t/contracts/dashboard-server-contract.md` bumped (routes + banner format + autostart sections).

**Tests**: 1708/1710 pass (2 pre-existing unrelated fails). Net additions across D1–D6: ~90 new test cases.

## [3.16.10] - 2026-04-20

### Added — Live Spawn Transcript Viewer (M42)

Per-spawn live transcript UI on `:7433`: stream-json tee (`bin/gsd-t-transcript-tee.cjs`), SSE route (`/transcript/:id/stream`), Claude-Code-style ndjson renderer (`scripts/gsd-t-transcript.html`), sidebar tree with parent-indent + status dots, per-spawn kill button (POST `/transcript/:id/kill`). 29 M42-specific tests; 1522/1522 suite. Intervene/SIGSTOP deferred to follow-up milestone.

## [3.15.10] - 2026-04-20

### Added — Universal Token Capture Across GSD-T (M41)

Every subagent spawn across GSD-T now routes through a single shared wrapper, retiring the silent `| N/A |` Tokens convention that preceded M41. Every spawn's input/output/cache tokens and cost USD land in both the human-readable `.gsd-t/token-log.md` and the machine-readable `.gsd-t/metrics/token-usage.jsonl` (schema v1, reused from M40 D4).

**Token-capture wrapper (D1)**: `bin/gsd-t-token-capture.cjs` exports `captureSpawn({command, step, model, description, projectDir, spawnFn, domain?, task?})` and `recordSpawnRow({...})`. Parses bare + `.result`-wrapped + stream-json envelopes with assistant-vs-result precedence. Missing usage renders `—`, never `0`, never `N/A`. Migration-in-place upgrades existing `.gsd-t/token-log.md` to the canonical 12-column header (adds Tokens + Compacted columns).

**Command-file doc-ripple (D2)**: all 20 spawn-capable `commands/*.md` files converted from inline `T_START=$(date +%s)` bash blocks to `captureSpawn`/`recordSpawnRow` pattern. `templates/CLAUDE-global.md` and the project `CLAUDE.md` carry the Token Capture Rule (MANDATORY). A canonical-block drift-guard test (`test/m41-canonical-block-drift.test.js`) asserts no legacy blocks remain and every OBSERVABILITY LOGGING declaration pairs with a wrapper call.

**Historical backfill (D3)**: `bin/gsd-t-token-backfill.cjs` + `gsd-t backfill-tokens [--since YYYY-MM-DD] [--patch-log] [--dry-run]`. Walks `.gsd-t/events/*.jsonl`, `.gsd-t/stream-feed/*.jsonl`, and `.gsd-t/headless-*.log`. Handles both event-stream frames and stream-json frames. Idempotent via `source: "backfill"` key-tuple tracking. `--patch-log` atomically rewrites legacy `N/A`/`0`/`—` Tokens cells in place using tmp+rename.

**Token dashboard (D4)**: `bin/gsd-t-token-dashboard.cjs` + `gsd-t tokens [--since] [--milestone] [--format table|json]`. Streams JSONL via `readline.createInterface`; aggregates byDay/byCommand/byModel; top-10 spawns by cost desc; cache-hit rate per model; rolling 7-day projection (daily avg × 30). Injects a 3-line token block at the tail of `gsd-t status`. Perf gate: 22ms on 10k-line JSONL (budget 500ms).

**Enforcement (D5)**: `bin/gsd-t-capture-lint.cjs` + `gsd-t capture-lint [--staged|--all]`. Greps for `Task({`, `spawn('claude', ...)`, and `claude -p` without a surrounding `captureSpawn`/`recordSpawnRow` within ±20 lines. Balanced-quote heuristic excludes JS-string-literal false positives. Whitelists: wrapper/linter modules themselves, `test/**`, `commands/gsd-t-help.md`, comment-only lines, markdown prose outside fences, any line with `GSD-T-CAPTURE-LINT: skip` marker nearby. Opt-in pre-commit hook via `gsd-t init --install-hooks` — appends idempotently to `.git/hooks/pre-commit` with a `# GSD-T capture lint` marker; never overwrites existing hooks.

Tests: +27 net (1479/1479 total). No new contracts — reuses M40's `metrics-schema-contract.md` v1 and `stream-json-sink-contract.md` v1.1.0.

## [3.14.10] - 2026-04-20

### Added — External Task Orchestrator + Streaming Watcher UI (M40)

JS orchestrator (`bin/gsd-t-orchestrator.js`) drives `claude -p` one task per spawn: short-lived, fresh context, architecturally compaction-free. Benchmark gate PASS: 226s orchestrator vs 316s in-session on 20-task/3-wave/4-domain fixture (0.72× wall-clock, threshold 1.05×).

**Orchestrator core (D1)**: wave-barrier join, per-wave Promise.all parallelism (default 3, ceiling 15 per Team Mode §15), workerPid attribution, SIGINT handler, retry policy per completion-signal-contract (first FAIL → single retry; second FAIL → halt wave), state.json atomic writes, task-boundary + wave-boundary synthetic frames emitted to stream-feed clients.

**Task brief builder (D2)**: `bin/gsd-t-task-brief.js` composes 2–5 KB self-contained per-task briefs from `.gsd-t/domains/{domain}/{scope,constraints,tasks}.md` + named contract excerpts + stack rules + Done Signal section; drop-order compactor guarantees non-droppable sections always survive.

**Completion protocol (D3)**: `bin/gsd-t-completion-check.cjs` `assertCompletion()` returns `{ok, missing[], details}` by checking commit-on-expected-branch + progress.md entry + test exit. Ambiguous tasks (commit present but no progress entry) are flagged for operator triage — never silently claimed done.

**Stream-feed server (D4)**: `scripts/gsd-t-stream-feed-server.js` — HTTP POST /ingest, WebSocket /feed?from=N replay, 127.0.0.1:7842, JSONL persist-before-broadcast. `scripts/gsd-t-token-aggregator.js` parses assistant + result envelope usage and writes `.gsd-t/metrics/token-usage.jsonl` schema v1 + rewrites `.gsd-t/token-log.md` in place. New CLI: `gsd-t stream-feed`.

**Stream-feed UI (D5)**: `scripts/gsd-t-stream-feed.html` — 47.5 KB, zero-dep, zero-token-cost local dashboard. Dark-mode claude.ai-style continuous feed with task/wave banners (duration + cost/tokens chips), token corner bar (running total), localStorage-persisted filters (tasks/domains/waves), auto-scroll pause + "↓ Jump to live" button.

**Recovery and resume (D6)**: `bin/gsd-t-orchestrator-recover.cjs` `recoverRunState()` reconciles interrupted runs via assertCompletion replay; `--resume` + `--no-archive` flags on `gsd-t orchestrate`; `/gsd-t-resume` Step 0.3 auto-detects in-flight state.json and surfaces resume invocation; 24 recovery unit tests cover fresh/terminal/resume modes + ambiguous classification + PID liveness.

**Contracts**: `stream-json-sink-contract.md` v1.0.0 → **v1.1.0** (new §"Usage field propagation" documenting assistant vs result envelope semantics); `wave-join-contract.md`, `completion-signal-contract.md`, `metrics-schema-contract.md` — all test-backed.

**Tests**: 1421/1421 pass (up from 1240 at M39 close, +181). 16 new M40 test files. Zero coverage gaps. Zero placeholder patterns (goal-backward PASS).

**New CLI subcommands**: `gsd-t orchestrate`, `gsd-t benchmark-orchestrator`, `gsd-t stream-feed`.

**Files**: `bin/gsd-t-orchestrator.js`, `bin/gsd-t-orchestrator-worker.cjs`, `bin/gsd-t-orchestrator-queue.cjs`, `bin/gsd-t-orchestrator-config.cjs`, `bin/gsd-t-orchestrator-recover.cjs`, `bin/gsd-t-completion-check.cjs`, `bin/gsd-t-benchmark-orchestrator.js`, `bin/gsd-t-task-brief.js`, `bin/gsd-t-task-brief-template.cjs`, `bin/gsd-t-task-brief-compactor.cjs`, `scripts/gsd-t-stream-feed-server.js`, `scripts/gsd-t-stream-feed.html`, `scripts/gsd-t-token-aggregator.js`, `templates/prompts/m40-task-brief.md`, 16 M40 test files, 4 new/updated contracts, `commands/gsd-t-resume.md` Step 0.3.

## [3.13.16] - 2026-04-17

### Changed — Removed proactive suggestions to use `/gsd-t-unattended`; positioned as overnight/idle-only

The unattended supervisor remains supported for genuine overnight or multi-hour idle runs but is no longer pitched as a general workflow option. In practice it runs 5–10× slower than in-session execution because every worker iteration pays cold-context startup cost (re-reads CLAUDE.md, progress.md, all domain files) before doing real work, then is bounded to a 270s cache-warm budget. Daytime work belongs in-session.

**Files**:
- `templates/CLAUDE-global.md` — removed the "Unattended Execution (M36)" section that pitched it as a feature alongside in-session.
- `commands/gsd-t-help.md` — repositioned the `unattended*` rows under AUTOMATION as overnight-only with a slowness caveat.
- `README.md` — removed the top-level "Unattended execution" feature bullet; renamed the commands-table heading and the full section heading to "Overnight / Idle-Run …" with a leading callout that daytime work runs in-session; reworded the M38 headless-by-default bullet to drop "via the unattended supervisor" framing.

**No behavioral changes.** Commands `/gsd-t-unattended`, `/gsd-t-unattended-watch`, `/gsd-t-unattended-stop` continue to work exactly as before. The supervisor contract is unchanged.

## [3.13.15] - 2026-04-17

### Fixed — Self-protection guard now uses package-name identity + narrow `bin/*.cjs` gitignore rule

Two bugs in v3.13.14 surfaced when `gsd-t update-all` ran against GSD-T's own source repo from the globally-installed CLI:

**Bug 1 — Self-protection guard bypassed**: The v3.13.14 guard compared `realpathSync(projectBinDir)` against `realpathSync(PKG_ROOT/bin)`. When `update-all` runs from the globally-installed CLI (`/usr/local/lib/node_modules/@tekyzinc/gsd-t`), `PKG_ROOT` points there — NOT to the local GSD-T source at `/Users/…/projects/GSD-T`. The paths never match in the typical dogfood setup, so the guard returned `false` and the sweep ate the source `bin/gsd-t.js`.

**Fix**: identity is now by `package.json` name. The sweep reads `projectDir/package.json` and skips if `name === "@tekyzinc/gsd-t"`. Works regardless of whether `update-all` runs from the local source tree or the global install.

**Bug 2 — Gitignore rule overly broad**: `UNATTENDED_GITIGNORE_ENTRIES` included `bin/*.cjs`, which ignored every `.cjs` under `bin/` — contradicting the adjacent comment ("legitimate `.cjs` source files under `bin/` ARE tracked"). With the broad rule active, new source `.cjs` files (e.g., `bin/headless-exit-codes.cjs`) couldn't be committed without `--force`.

**Fix**: the gitignore entry narrows to exactly `bin/context-meter-state.cjs` — the single session-state artifact that was the original intent.

**Files**:
- `bin/gsd-t.js` — `isSourcePackage` now reads `package.json.name`; `UNATTENDED_GITIGNORE_ENTRIES` narrowed.
- `test/bin-gsd-t-resilience.test.js` — self-protection test reshaped: seeds a tmp `package.json` with `name: "@tekyzinc/gsd-t"` + a signature-matching stray, asserts the stray survives the sweep.
- `.gitignore` — deduped and restored to the narrow form.

**Tests**: 1240/1240 pass (unchanged count; existing self-protection test reshaped). E2E: N/A.

**Impact**: `gsd-t update-all` is now safe to run with GSD-T itself registered as a project, regardless of where the CLI is installed from. Legitimate `.cjs` source files in `bin/` are no longer blanket-ignored in downstream projects' `.gitignore`. bee-poc's supervisor, which started loading cleanly on v3.13.14, continues to load on v3.13.15 (this release is purely dogfood-protection + gitignore repair; no supervisor-behavior change).

## [3.13.14] - 2026-04-17

### Fixed — Supervisor no longer requires project-local `bin/gsd-t.js` + sweep self-protection

v3.13.13 successfully swept bee-poc's stray `bin/gsd-t.js`, but exposed a second bug: `bin/gsd-t-unattended.cjs:31` still did `require("./gsd-t.js")` to pull in the `mapHeadlessExitCode` helper. With the stray removed, projects could no longer load the supervisor at all — the require chain now failed on `gsd-t.js` itself instead of `debug-ledger.js`. Three options were on the table (restore both files, resolve from global, or remove all stale copies); we picked the middle path via file extraction.

**Fix 1 — extract `mapHeadlessExitCode` to its own file** (`bin/headless-exit-codes.cjs`, new):
The exit-code contract helper (0=success, 1=verify fail, 2=context budget, 3=non-zero exit, 4=blocked, 5=unknown command) is now a standalone zero-dependency module. `bin/gsd-t-unattended.cjs:31` now does `require("./headless-exit-codes.cjs")` — no transitive dependency on the full CLI installer. `bin/gsd-t.js` still re-exports `mapHeadlessExitCode` for backward compatibility (top-of-file require + `module.exports`).

**Fix 2 — `headless-exit-codes.cjs` joins `PROJECT_BIN_TOOLS`**: `copyBinToolsToProject` now copies the new helper into every registered project's `bin/` on the next `update-all`, so the supervisor can load it locally without reaching into the global package.

**Fix 3 — sweep self-protection** (`copyBinToolsToProject`):
While dogfooding v3.13.13, the sweep ran against GSD-T's own source repo (which is registered as a project for eating-our-own-dogfood purposes), recognized the source `bin/gsd-t.js` as matching the installer signature (it IS the installer), and deleted it. The source was restored via `git restore`, but the sweep now carries a guard: if `realpathSync(projectBinDir) === realpathSync(PKG_ROOT/bin)`, skip the sweep entirely. Dogfooding the installer on itself no longer cannibalizes the source.

**Files**:
- `bin/headless-exit-codes.cjs` — new file, 50 lines, extracted helper with explanatory header.
- `bin/gsd-t-unattended.cjs` — line 31 now requires the new helper instead of `./gsd-t.js`.
- `bin/gsd-t.js` — top-of-file re-export of `mapHeadlessExitCode` (backward compat); original declaration replaced with a comment pointing to the extracted module; `PROJECT_BIN_TOOLS` gains `headless-exit-codes.cjs`; sweep logic gains the realpath equality guard.
- `test/bin-gsd-t-resilience.test.js` — new test: `copyBinToolsToProject refuses to sweep the source package's own bin/` (run sweep with `projectDir = PKG_ROOT`, assert `bin/gsd-t.js` still exists after).

**Tests**: 1240/1240 pass (+1 new self-protection test). E2E: N/A.

**Impact**: bee-poc's supervisor can now load after `gsd-t update-all` copies the new `headless-exit-codes.cjs` helper into `bin/`. No project needs a local `bin/gsd-t.js` for the supervisor to function. Running the installer against its own source repo no longer destroys the source.

## [3.13.13] - 2026-04-17

### Fixed — Stray sweep now matches older-version installer artifacts

v3.13.12 shipped the defensive require + DEPRECATED_BIN_STRAYS sweep, but the sweep's safety check was too narrow: it only deleted strays whose bytes matched the **current** source. Projects left behind with a v3.13.11 (or earlier) `bin/gsd-t.js` would not match the current source (different body), so the sweep refused to delete them and those projects stayed crashed.

**Fix**: sweep now uses a **signature** check rather than a byte-identity check. A stray is deleted when it starts with `#!/usr/bin/env node` AND contains the verbatim JSDoc header `GSD-T CLI Installer` in the first 400 characters. That combination is unique enough to rule out user-owned files (a user's own script would not contain our header) while matching every historical version of this installer — so older-version artifacts are swept correctly.

**Files**:
- `bin/gsd-t.js` — sweep loop now uses signature match instead of byte-match.
- `test/bin-gsd-t-resilience.test.js` — new test case covering older-version stray (shebang + header + different body) → must be deleted. Existing byte-match test kept. Existing user-owned test kept.

**Tests**: 1239/1239 pass (+1 new assertion vs v3.13.12). E2E: N/A.

**Impact**: bee-poc and any other project carrying a pre-v3.13.12 `bin/gsd-t.js` now self-heals on the next `gsd-t update-all` pass after installing v3.13.13.

## [3.13.12] - 2026-04-17

### Fixed — Project-local `bin/gsd-t.js` crash on missing `debug-ledger.js` + self-heal sweep

A bee-poc relaunch after the v3.13.11 fix still crashed with `MODULE_NOT_FOUND: Cannot find module './debug-ledger.js'` — but the crash came from `bin/gsd-t.js` itself, not from the v3.13.11 supervisor code. Root cause: an older version of `copyBinToolsToProject` copied `bin/gsd-t.js` into registered projects as part of a now-deprecated whitelist. The current `PROJECT_BIN_TOOLS` whitelist (10 `.cjs` files) does not include `gsd-t.js` or its sibling `debug-ledger.js`, so `update-all` stopped maintaining both — but the stale copy persisted in project `bin/` directories, and `bin/gsd-t.js` had a hard require on `./debug-ledger.js` at the top of the file. Any invocation of the stale project-local copy crashed before the first line of real work. bee-poc had the 130 KB stale `bin/gsd-t.js` from this lineage.

**Layer 1 — defensive require** (`bin/gsd-t.js:23`):
The top-level `require('./debug-ledger.js')` is now wrapped in `try/catch` and falls back to a no-op stub exporting every function the real module exports (`readLedger`, `appendEntry`, `getLedgerStats`, `clearLedger`, `compactLedger`, `generateAntiRepetitionPreamble`). Projects with stale copies no longer crash; they degrade to debug-ledger-disabled behavior until `update-all` sweeps the stray away.

**Layer 2 — deprecated-stray sweep** (`copyBinToolsToProject`):
New `DEPRECATED_BIN_STRAYS = ["gsd-t.js"]` list is swept after the normal copy loop. For each entry: if the project has the stray AND its bytes match the source copy in this package, delete it (proves it's an installer artifact, not a user file that happens to share the name). User-owned files with different content are left untouched. Log line: `{project} — cleaned up N stray bin file(s)`. On the next `gsd-t update-all` after v3.13.12 installs, every project that picked up a stale `bin/gsd-t.js` self-heals; subsequent invocations fall through to the global install.

**Files**:
- `bin/gsd-t.js` — defensive require with full no-op stub; `DEPRECATED_BIN_STRAYS` list; post-copy sweep loop; `copyBinToolsToProject` returns `true` when either a copy happened or a stray was cleaned.
- `test/bin-gsd-t-resilience.test.js` — 3 new tests: (a) loading `bin/gsd-t.js --help` without `debug-ledger.js` does not emit `MODULE_NOT_FOUND`; (b) byte-matching stray is deleted; (c) user-owned file (byte-divergent) is preserved.

**Tests**: 1238/1238 pass (was 1235; +3 new assertions). E2E: N/A (no playwright.config.*).

**Impact**: installed projects that inherited a stale `bin/gsd-t.js` from older `update-all` passes will self-heal on the next `gsd-t update-all` after installing v3.13.12. bee-poc's 130 KB stale copy is removed on its next pass, after which any invocation path that had been hitting the project-local copy falls through to the global install — no more divergent vendoring.

## [3.13.11] - 2026-04-17

### Fixed — Unattended supervisor reliability triple-fix (bee-poc 15-min hang fallout)

A real bee-poc supervisor relay hung for 15+ minutes on v3.12.15 (pid 70897). Three independent defects surfaced from that incident and are fixed together in this patch. The root cause of the hang itself — a 1-hour worker timeout on the deployed v3.12.15 package — is finally resolved by shipping v3.13.10's D4 work to npm; the two other bugs are fixes for contract-boundary and cosmetic issues the hang exposed.

**Bug 1 (P0) — supervisor watchdog visibility on timeout**:
The spawnSync `timeout` option kills a hung worker after `DEFAULT_WORKER_TIMEOUT_MS` (270 s in v3.13.10+) and maps the result to contract exit code 124, but the event was not legibly surfaced in `run.log`. Operators tailing the log saw an empty iter block with no indication that the watchdog had fired. `runMainLoop` now writes a deterministic `[worker_timeout] iter=N budget=Nms elapsed=Nms` line to `run.log` immediately before the regular iter trailer, so timeout-induced cache misses are self-documenting. The existing `writeState` call still commits `lastExit=124` + a fresh `lastTick` so `/gsd-t-unattended-watch` sees a heartbeat post-timeout.

**Note on the deployed-version aspect**: the 1-hour → 270 s worker-timeout reduction shipped in v3.13.10 on GitHub but v3.13.10 was never published to npm (progress.md was in "pending publish" state when the bee-poc run started). bee-poc was running against the installed v3.12.15, which still had `DEFAULT_WORKER_TIMEOUT_MS = 3600000`. Publishing v3.13.11 closes both issues — the timeout reduction reaches bee-poc (and every downstream project) and the new diagnostic line makes future watchdog firings visible.

**Bug 2 (P0) — worker cwd invariant**:
run.log from the bee-poc hang showed a `Shell cwd was reset to /Users/david/projects/GSD-T` line mid-iter — the worker's Bash shell had escaped bee-poc's project directory, and subsequent tool calls silently targeted the wrong repo. `_spawnWorker` already passes `cwd: projectDir` to `platformSpawnWorker` and sets `GSD_T_PROJECT_DIR` on the worker env (correct baseline), but the worker itself had no instruction to re-assert that invariant. The worker prompt now carries an explicit `# CWD Invariant` section that instructs the worker to (a) run `[ "$(pwd)" = "$GSD_T_PROJECT_DIR" ] || cd "$GSD_T_PROJECT_DIR"` as its first Bash call, and (b) scope any directory change inside a subshell (`( cd other && cmd )`) rather than using bare top-level `cd`.

**Bug 3 (P2) — IS_STALE determinism**:
`/gsd-t-unattended-watch` is run by the haiku model and the "tick age > 540 s → append ⚠️ stale" threshold lived in the Step 6a rendering prose. Haiku would occasionally apply the stale flag to ticks in the 330–540 s band by misreading the prose. The threshold math now lives entirely inside Step 2's `node -e` block as a boolean emission (`IS_STALE = tickAgeMs !== null && tickAgeMs > 540000`), and Step 6a just reads the flag. Boundary cases: 539 s = false, 540 s = false (strict greater-than), 541 s = true.

**Files**:
- `bin/gsd-t-unattended.cjs` — worker_timeout run.log append; CWD Invariant section in `_spawnWorker` prompt.
- `commands/gsd-t-unattended-watch.md` — Step 2 IS_STALE computation + emission; Step 6a reader-only rendering; Notes section updated.
- `test/unattended-triple-fix-v3-13-11.test.js` — 8 new tests (3 Bug 1 + 3 Bug 2 + 3 Bug 3 — one boundary-math test covers three points, bringing the practical count to 8 assertions across 8 it-blocks, of which 3 exercise the Bug 3 boundaries).

**Tests**: 1235/1235 pass (was 1227; +8 new assertions). E2E: N/A (no playwright.config.*).

**Impact**: bee-poc-class hangs are self-recoverable in v3.13.11 — a hung worker is bounded at 270 s by the watchdog, the timeout is now visible in run.log, cwd drift is caught by the worker itself on entry, and `/gsd-t-unattended-watch` no longer produces spurious stale warnings under the threshold.

## [3.13.10] - 2026-04-17

### Added — M39: Fast Unattended + Universal Watch-Progress Tree

Closes the 3–5× speed gap between unattended and in-session execution, adds a universal task-list progress view under every `--watch` surface, and keeps supervisor→worker handoffs inside the 5-minute Anthropic prompt-cache TTL.

**D2 — progress-watch (12 tasks)**:
- `.gsd-t/contracts/watch-progress-contract.md` v1.0.0 — state-file schema, tree-reconstruction algorithm, stale-state expiry (24h), renderer contract, integration invariants.
- `scripts/gsd-t-watch-state.js` — zero-dep writer CLI with shim-safe agent-id resolution (CLI arg → `GSD_T_AGENT_ID` env → auto-minted `shell-{pid}-{ts}` fallback). Atomic tmp-write+rename; `start`/`advance`/`done`/`skip`/`fail` subcommands.
- `bin/watch-progress.js` — tree builder (parent_agent_id lineage, orphan handling) + renderer (✅/🔄/⬜/➡️/❌ markers; expanded-current-subtree + collapsed-siblings layout).
- 189 step-shims across 17 workflow command files — every numbered step now writes its progress state under `.gsd-t/.watch-state/{agent_id}.json`.
- Integration into `bin/gsd-t-unattended.cjs`, `bin/unattended-watch-format.cjs`, `bin/headless-auto-spawn.cjs` — tree appends below the existing banner (banner preserved intact).

**D3 — parallel-exec (4 tasks)**:
- Team Mode prompt block inserted into `_spawnWorker` at the worker instruction boundary. Unattended worker now spawns up to 15 concurrent `Task` subagents per wave (intra-wave parallel), waits for all, then advances (inter-wave sequential). Falls back to sequential when the wave contains only one domain.
- `.gsd-t/contracts/unattended-supervisor-contract.md` §15 v1.3.0 — Team Mode contract: cap of 15, dependency-graph preservation, wave-boundary semantics.

**D4 — cache-warm-pacing (3 tasks)**:
- `DEFAULT_WORKER_TIMEOUT_MS = 270000` (270 s) in `bin/gsd-t-unattended.cjs` + `.js`. Preserves the Anthropic 5-min prompt-cache TTL with a ~30 s supervisor→worker handoff budget, eliminating the cold-cache penalty that was adding minutes per iter.
- `--worker-timeout=<ms>` CLI flag parsed and merged into the live config (was documented in §6 but silently ignored pre-M39).
- `.gsd-t/contracts/unattended-supervisor-contract.md` §16 v1.3.0 — cache-warm pacing contract: inline rationale comment requirement, inter-iteration sleep invariant (< 5 s), timeout override semantics.

**Red Team**: Initial FAIL (2 CRITICAL + 2 HIGH) → fixes → GRUDGING PASS.
- BUG-1 (CRITICAL): `GSD_T_AGENT_ID` had no producer — 189 shims would silently fail. Fixed by injecting `supervisor-iter-{N}` in `_spawnWorker`, `headless-{id}` in `autoSpawnHeadless`, and adding an auto-mint fallback chain to the writer CLI.
- BUG-2 (CRITICAL): `--worker-timeout` flag documented in §6 but no `case "worker-timeout":` in `parseArgs`. Fixed with parse case + config merge + test assertion.
- BUG-3 (HIGH): `.js` and `.cjs` variants of unattended + safety files had divergent defaults (3600000 vs 270000). Fixed by aligning all four files to 270000.
- BUG-4 (HIGH): Team Mode prompt referenced "Step 4" but the current execute flow uses "Step 3". Fixed in both the prompt string and the contract §15.

**Tests**: 1227/1227 pass (+3 new: shim-safe agent-id auto-mint, env-var fallback, `--worker-timeout` flag parse).

**Impact**: bee-poc's next supervisor relaunch on v3.13.10 should complete iters 3–5× faster than the v3.12.13 baseline, with visible task-list progression under every `--watch` surface.

## [3.12.15] - 2026-04-17

### Fixed — Decision Log Trim — stop live progress.md bloat

`commands/gsd-t-complete-milestone.md` Step 7 previously instructed "Keep all prior decision log entries — they are valuable context". Because every prior milestone's full log is already frozen into its archive snapshot by Step 4, carrying the same entries forward on the live `.gsd-t/progress.md` produced unbounded file growth (GSD-T's live file had reached 168,921 bytes / 658 lines — 10× the size of a healthy project).

**Fix**: Step 7 now explicitly trims the live Decision Log to the just-completed milestone's entries after the archive snapshot is written. The instruction reads:

> Delete all decision-log entries older than the just-completed milestone's start date. Those entries are preserved in the milestone archive created in Step 4. Keep only the completion entry plus any entries logged on or after the cutoff — typically the live log is near-empty when the next milestone begins.

The archive at `.gsd-t/milestones/{name}-{date}/progress.md` remains the source-of-truth for the full history. A pointer line (`> Prior decision log entries preserved in .gsd-t/milestones/*/progress.md`) is added to the live file so future readers know where to look.

**One-time cleanup on the GSD-T repo**: live `.gsd-t/progress.md` trimmed from 168,921 B / 658 lines to 11,733 B / 67 lines (93% reduction), cut at M38 start (2026-04-16 14:25). Historical decision log preserved by copying the pre-trim file into `.gsd-t/milestones/M38-headless-by-default-2026-04-17/progress.md` (Step 4 missed that archive copy when M38 was completed earlier today; fix-forward).

**Users with bloated `.gsd-t/progress.md`** can run the same one-time cleanup manually: find the current milestone's `[milestone-defined]` start entry in the Decision Log, copy the pre-trim file to the milestone archive directory (if it's not already there), then delete all Decision Log entries older than that start date. Keep the pointer line at the top of the Decision Log section.

**Tests**: Unit 1186/1186 pass (no code paths changed — pure doc/template edits + one-time live file rewrite). E2E N/A.

## [3.12.14] - 2026-04-17

### Fixed — Telemetry Env-Propagation Regression (Tag All Worker Events)

v3.12.12 added `GSD_T_COMMAND`/`GSD_T_PHASE` env-var fallbacks to `scripts/gsd-t-event-writer.js` but two critical call sites were missed — producing mostly-null telemetry in production.

**Evidence from bee-poc (50 min observation)**: 908 events, only 1/908 had `command` populated; 836 `tool_call` events had command/phase/trace_id all null; only 2 `.gsd-t/token-log.md` rows (both from the outer supervisor process; 37 inner subagents wrote zero rows); supervisor row showed `model=unknown`.

**Root causes**:
1. `scripts/gsd-t-heartbeat.js::buildEventStreamEntry` — this PostToolUse hook fires on every tool call in every child process (the source of ~90% of events) and hardcoded `{command: null, phase: null, trace_id: null}` into every event it wrote.
2. Neither the writer nor the heartbeat read `GSD_T_TRACE_ID` or `GSD_T_MODEL` from env — so even when spawners set them, they never appeared on events.
3. Several spawn sites (orchestrator, `spawnClaudeSession`, `runLedgerCompaction`, design-review claude spawn) never set the GSD_T_* env block at all.

**Fixes**:
- `scripts/gsd-t-event-writer.js::buildEvent` now reads `GSD_T_TRACE_ID` and `GSD_T_MODEL` env fallbacks alongside command/phase.
- `scripts/gsd-t-heartbeat.js::buildEventStreamEntry` replaced hardcoded null triple with `process.env.GSD_T_COMMAND||null` / `GSD_T_PHASE||null` / `GSD_T_TRACE_ID||null`.
- `bin/headless-auto-spawn.{cjs,js}` workerEnv sets `GSD_T_COMMAND` + `GSD_T_PHASE` + `GSD_T_PROJECT_DIR`, and conditionally forwards parent `GSD_T_TRACE_ID` / `GSD_T_MODEL`. `appendTokenLog` reads `process.env.GSD_T_MODEL` instead of the `"unknown"` literal.
- `bin/gsd-t-unattended.cjs::_spawnWorker` workerEnv populates the full GSD_T_* block from `state` + env fallbacks. `_appendTokenLog` reads `process.env.GSD_T_MODEL`.
- `bin/gsd-t.js` three sites patched: `doHeadlessExec` workerEnv, `spawnClaudeSession` (fallback command=`gsd-t-debug` / phase=`debug`), `runLedgerCompaction` (fallback model=`haiku`). `appendHeadlessTokenLog` reads `process.env.GSD_T_MODEL`.
- `bin/orchestrator.js` new `_buildOrchestratorEnv(opts, projectDir)` helper threaded through `spawnClaude` (sync) and `spawnClaudeAsync`.
- `scripts/gsd-t-design-review-server.js` claude spawn now injects the GSD_T_* env block.

**Reproduction test**: NEW `test/telemetry-env-propagation.test.js` — 6 tests that exercise the REAL production spawn code paths (not hand-rolled mocks): writer + heartbeat env-fallback unit coverage, `autoSpawnHeadless` real-spawn via env-dump shim at `bin/gsd-t.js`, unattended `platform.spawnWorker` with a real env-dump script. Failed 3/6 before fix as expected; 6/6 pass after.

**Tests**: Unit 1186/1186 pass. E2E N/A (no `playwright.config.*` or `cypress.config.*`).

**Red Team** (opus, adversarial sweep categories: regression-around-fix + original-bug-variants covering context-meter hook and PostToolUse hook paths): verdict **GRUDGING PASS** — 5 additional claude-worker spawn sites found and patched in this same release; no untagged claude-worker spawn paths remain.

**Doc ripple**: `.gsd-t/contracts/event-schema-contract.md` new "Env-Var Fallbacks (v3.12.14)" section with flag/env/caller table; `.gsd-t/contracts/headless-default-contract.md` new "Worker Env Propagation (v3.12.14)" section; `.gsd-t/contracts/unattended-supervisor-contract.md` §14b v1.2.0 Worker Env Propagation + version history entry.

## [3.12.13] - 2026-04-17

### Fixed — `/` Prefix Strip Sitewide

Claude Code does not namespace local slash commands under `user:`, so every `/gsd-t-*`, `/checkin`, `/branch`, `/Claude-md`, `/global-change` reference produced `Unknown command: /X` errors when the user typed one. This release strips the prefix from every live reference:

- **54 command files** in `commands/*.md`
- **All live docs**: `README.md`, `GSD-T-README.md`, `CHANGELOG.md`, `docs/*.md`, `CLAUDE.md`
- **All templates**: `templates/CLAUDE-global.md`, `templates/CLAUDE-project.md`, `templates/stacks/*.md`
- **Scripts and CLI**: `bin/gsd-t.js`, `bin/gsd-t-unattended.js`, `bin/design-orchestrator.js`, `scripts/gsd-t-auto-route.js`, `scripts/gsd-t-update-check.js`
- **All `.gsd-t/contracts/*.md` and live `.gsd-t/domains/*/scope.md`**
- **User-global `~/.claude/CLAUDE.md`** (via `sed` in the same pass)
- Test fixture strings in `test/headless.test.js` preserved — those are regression-test literals asserting `claude -p` rejects the `/` prefix.
- Historical archives (`.gsd-t/milestones/*`, `.gsd-t/progress-archive/*`, `.gsd-t/continue-here-*`) left untouched as time-capsule records.

### Fixed — `update-all` Now Upgrades the Global CLI Binary

v3.12.12's `update-all` propagated command files to `~/.claude/commands/` but never ran `npm install -g @tekyzinc/gsd-t@latest`. Result: the CLI binary stayed stale even after `npm publish`, so new features (like v3.12.12's token-log observability) never activated on user machines that had updated "successfully."

`bin/gsd-t.js`:
- `doUpdateAll()` now calls new `upgradeGlobalBinary()` helper FIRST, which runs `npm install -g @tekyzinc/gsd-t@latest` via `execFileSync({stdio: 'inherit'})`.
- After upgrade succeeds, the newly-installed on-disk version is compared against the running process's `PKG_VERSION`. If they diverge, `reexecUpdateAll()` hands off to the new binary with `GSDT_POST_UPGRADE=1` to prevent recursion.
- On upgrade failure (e.g., missing global-npm permissions), logs the error and continues with command-file propagation so the user isn't fully blocked.
- Upgrade is skipped when `GSDT_POST_UPGRADE=1` is set (re-entry from self-invocation).

### Changed — Global `CLAUDE.md` Size Reduction (−26%)

`~/.claude/CLAUDE.md` was 41,131 chars (above Claude Code's 40k auto-warning threshold). Three optimizations trimmed it to 30,272 chars without losing information:

1. **Commands Reference table removed** (~63 lines). The router and `/gsd-t-help` resolve commands dynamically — nothing reads this table at runtime. Replaced with a one-line pointer: *"See `/gsd-t-help` for the complete command list."*
2. **Markdown Tables / emoji-padding section extracted** to `templates/stacks/_markdown.md` (32 lines, `_` prefix = universal stack rule, auto-injected by Stack Rules Engine for every subagent spawn). CLAUDE.md now has a one-line pointer at that template.
3. **Autonomous Execution Rules subsections tightened** — QA Agent, Design Verification, Red Team, Headless-by-Default Spawn, Unattended Execution each cut from multi-paragraph re-statements to 2–3 lines: rule + enforcement + path to the authoritative contract/protocol file. The contracts (`qa-agent-contract.md`, `headless-default-contract.md`, etc.) and prompts (`red-team-subagent.md`, `design-verify-subagent.md`) remain the source of truth for method specifics.

Same edits propagated to `templates/CLAUDE-global.md` so future installs inherit the lean version.

### Changed — Project `CLAUDE.md` Audit

Audited `CLAUDE.md` in this repo (the @tekyzinc/gsd-t dev repo itself). Removed a duplicate Destructive Action Guard block (verbatim copy of the global's). Pre-Commit Gate now points at `.gsd-t/contracts/pre-commit-gate.md` (which exists and owns the full checklist) while retaining the 7 repo-specific extensions inline. 7,095 → 6,269 chars (−12%).

### Added — New Stack Rule: `templates/stacks/_markdown.md`

Universal (always-injected) stack rule covering markdown-table formatting with emoji. Included in every subagent spawn regardless of detected tech stack, per the Stack Rules Engine's `_`-prefix convention.

### Note — v3.12.12 Supervisor Status

The earlier hypothesis that v3.12.12 broke `bin/gsd-t-unattended.cjs` via a missing `require("./debug-ledger.js")` was incorrect. `bin/debug-ledger.js` exists, ships in the package, and has been present since a March commit. The supervisor was running fine on the globally-installed v3.11.11 binary — it simply never picked up v3.12.12's env-var injection because `update-all` never upgraded the binary (see above fix).

## [3.12.12] - 2026-04-17

### Fixed — Token-Log Observability for Headless/Unattended Workers

**Background**: M38 headless-by-default left `.gsd-t/token-log.md` blind to all supervisor and headless-exec worker activity. Rows were only written by interactive `T_START/T_END` bash blocks in command files. All event-stream `tool_call` entries from workers had `command: null`, `phase: null`, `trace_id: null`.

#### Fix 1: headless worker spawns append to token-log.md

Three spawn paths now write rows to `{projectDir}/.gsd-t/token-log.md`:

- **`bin/headless-auto-spawn.cjs`** — `installCompletionWatcher` appends a row when the detached child exits (poll-based, graceful — never halts on write failure). Creates the file with the canonical header if it does not exist. Migrates files created before this fix (adds header if missing).
- **`bin/gsd-t-unattended.cjs`** — supervisor worker loop appends a row after each `_spawnWorker` call completes, recording iteration number, duration, exit code. New `_appendTokenLog` helper follows the same schema as interactive command observability blocks.
- **`bin/gsd-t.js` `doHeadlessExec`** — `gsd-t headless <command>` invocations append a row synchronously after the `claude -p` process exits.

Row format matches the existing token-log schema:
`| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Domain | Task | Ctx% |`
Tokens are logged as `unknown` (no API access in worker contexts); duration is wall-clock.

#### Fix 2: command/phase propagate to event-stream entries in worker contexts

Env-var approach chosen (cleaner, no call-site changes needed):

- **`scripts/gsd-t-event-writer.js` `buildEvent`** — reads `GSD_T_COMMAND` and `GSD_T_PHASE` env vars as defaults when `--command`/`--phase` flags are absent. Explicit flags always win.
- **`bin/headless-auto-spawn.cjs`** — sets `GSD_T_COMMAND={command}` and `GSD_T_PHASE={phase}` on every detached child's env before spawn.
- **`bin/gsd-t-unattended.cjs` `_spawnWorker`** — sets `GSD_T_COMMAND=gsd-t-resume` and `GSD_T_PHASE={state.phase||execute}` on each `claude -p` worker env.
- **`bin/gsd-t.js` `doHeadlessExec`** — sets `GSD_T_COMMAND=gsd-t-{command}` on the `execFileSync` env.

Result: all `tool_call` events in worker contexts are tagged with the originating command and phase instead of `null`.

## [3.12.11] - 2026-04-17

### Fixed
- **Installer owns global PostToolUse context-meter hook** — the hook command now targets the globally-installed npm package (`$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-context-meter.js`) instead of `$CLAUDE_PROJECT_DIR/scripts/...`. The old path caused `Cannot find module` errors in every non-GSD-T project and when `CLAUDE_PROJECT_DIR` was unset.
- **Auto-migration of stale hook entries** — `install`, `update`, `update-all`, and `init` now detect and replace any PostToolUse entry whose command matches the prior `$CLAUDE_PROJECT_DIR`-based pattern, upgrading it in-place to the canonical global form.
- **Existence guard** — the hook command is wrapped in a `bash -c '[ -f ... ] && node ... || true'` guard so it silently exits 0 when the package is not present (non-GSD-T projects, uninstalled state).
- **Uninstall removes the hook** — `gsd-t uninstall` now removes any PostToolUse hook containing `gsd-t-context-meter` from `~/.claude/settings.json`, leaving all other hooks intact.

## [3.12.10] - 2026-04-17

### M38: Headless-by-Default + Meter Reduction

**Background**: M37 was right that the context meter needed to do more — but escalating to a MANDATORY STOP banner in the interactive session was the wrong fix. M38 removes the cause instead of bandaging the symptom: headless spawning is now the default for all primary workflow subagents, so the parent context grows much slower and the single-band meter threshold is sufficient. Seven commands removed. Five contracts folded. Net result: same "work never stops" UX achieved by structure instead of instrumentation.

### Added
- **`bin/event-stream.cjs`** — new module for structured JSONL event emission to `.gsd-t/events/YYYY-MM-DD.jsonl`. Emits `task_start`, `task_complete`, `subagent_verdict`, `file_changed`, `test_result`, `error`, `retry` event types. Used by unattended supervisor and watch tick.
- **`bin/headless-auto-spawn.cjs`** `watch` + `spawnType` parameters — propagation rules: `spawnType:'validation'` always headless regardless of `--watch`; `spawnType:'primary'` + `watch:true` returns `{mode:'in-context'}` for live streaming.
- **`.gsd-t/contracts/headless-default-contract.md`** v1.0.0 — defines the headless spawn primitive, Conversion Map (7 primary commands converted), `--watch` flag spec, validation-spawn enforcement, and migration path. Folds headless-auto-spawn-contract v1.0.0.
- **`.gsd-t/contracts/unattended-event-stream-contract.md`** v1.0.0 — JSONL event schema, watch tick activity log format, supervisor emission requirements.
- **`test/headless-default.test.js`** — 11 tests covering the 4-cell propagation matrix (primary/validation × watch/no-watch) + regression coverage.
- **`test/event-stream.test.js`**, **`test/unattended-watch.test.js`**, **`test/router-intent.test.js`** — new test files for M38 components.
- **`commands/gsd.md`** intent classifier — handles conversational requests directly (workflow → existing command; conversational → respond; ambiguous → default to conversation).

### Changed
- **7 command files** (`gsd-t-execute`, `gsd-t-wave`, `gsd-t-integrate`, `gsd-t-quick`, `gsd-t-debug`, `gsd-t-scan`, `gsd-t-verify`) — converted to `autoSpawnHeadless({spawnType:'primary', watch:$WATCH_FLAG})` pattern. Validation spawns (QA, Red Team, Design Verification) always headless.
- **`bin/gsd-t-unattended.{cjs,js}`** — rejects `--watch` flag with clear error. Emits structured JSONL events at every phase boundary.
- **`.gsd-t/contracts/context-meter-contract.md`** v1.3.0 — drops three-band model, dead-meter detection, stale-band logic, Universal Auto-Pause elevation. Single-band model: one threshold (default 85%), one action (silent headless handoff). Replaces v1.2.0.
- **`.gsd-t/contracts/unattended-supervisor-contract.md`** v1.1.0 — adds §9 Event Stream Emission requirement: supervisor MUST emit structured events; watch tick MUST read events and format activity log.
- **`templates/CLAUDE-global.md`** — Universal Auto-Pause Rule section removed; Context Meter section updated to single-band description.
- **5 loop commands** (`gsd-t-execute`, `gsd-t-wave`, `gsd-t-integrate`, `gsd-t-quick`, `gsd-t-debug`) — Step 0.2 Universal Auto-Pause enforcement stripped.
- **`scripts/gsd-t-context-meter.test.js`** — rewritten for single-band model.
- **`test/filesystem.test.js`** — command count updated from 61 to 54.
- **`docs/requirements.md`** — REQ-073..078 updated to `SUPERSEDED by REQ-08X (M38)` with replacement pointers. REQ-088..093 added (M38 requirements).
- **`docs/methodology.md`** §3–§5 — historical framing added; deleted machinery marked as superseded by M38.
- **`docs/prd-harness-evolution.md`** — Status updated to `HISTORICAL — M31 shipped; M32/M33 SUPERSEDED by M38`.
- **`docs/architecture.md`**, **`docs/workflows.md`**, **`docs/infrastructure.md`**, **`GSD-T-README.md`** — updated to reflect headless-by-default spawn path, event stream, simplified meter.

### Removed
- **7 commands deleted**: `gsd-t-optimization-apply`, `gsd-t-optimization-reject`, `gsd-t-reflect`, `gsd-t-audit` (self-improvement loop), `gsd-t-prompt`, `gsd-t-brainstorm`, `gsd-t-discuss` (conversational — router intent classifier handles these)
- **`bin/runway-estimator.cjs`** + **`bin/token-telemetry.cjs`** — deleted; replaced by headless-by-default approach
- **`bin/qa-calibrator.js`** + **`bin/token-optimizer.js`** — deleted with self-improvement loop
- **5 contracts folded/deleted**: `runway-estimator-contract.md`, `token-telemetry-contract.md`, `headless-auto-spawn-contract.md`, `qa-calibration-contract.md`, `harness-audit-contract.md`
- **`test/runway-estimator.test.js`**, **`test/token-telemetry.test.js`**, **`test/qa-calibrator.test.js`**, **`test/token-optimizer.test.js`** — deleted with removed modules

### Migration Notes
- **Spawn pattern**: replace `autoSpawnHeadless()` (no args) with `autoSpawnHeadless({spawnType:'primary', watch:$WATCH_FLAG})` in any downstream command files that call the spawn primitive directly.
- **Context meter**: if you depend on the three-band model (`normal`/`warn`/`stop`) or dead-meter detection in `token-budget.cjs`, those fields are removed. `getSessionStatus()` returns `{pct, threshold}` only.
- **Deleted contracts**: any downstream references to `runway-estimator-contract.md`, `token-telemetry-contract.md`, or `headless-auto-spawn-contract.md` should point to `headless-default-contract.md` v1.0.0 instead.
- **Deleted commands**: `gsd-t-prompt`, `gsd-t-brainstorm`, `gsd-t-discuss` — use plain text messages to Claude instead; the router classifier handles conversational requests. `gsd-t-optimization-apply/reject`, `gsd-t-reflect`, `gsd-t-audit` — removed; the self-improvement backlog is no longer maintained.

### Testing
- 1176/1177 tests pass. 1 pre-existing failure (`scan.test.js:287`) carried forward — scan-data-collector regex drift vs current prose format, unrelated to M38 scope.

## [3.11.12] - 2026-04-16

### Added — M38 Partition + Plan + Domain H1 Progress

**Background**: M38 (Headless-by-Default + Meter Reduction) partitioned into 5 domains across 2 waves. Domain H1 (headless-spawn-default) executed through T6 by unattended supervisor Iter 2 but did not commit. This checkin captures all M38 setup work + H1 in-flight progress + Scan #11 regeneration.

### Added
- **5 M38 domain directories** under `.gsd-t/domains/` (m38-headless-spawn-default, m38-meter-reduction, m38-unattended-event-stream, m38-router-conversational, m38-cleanup-and-docs) with scope.md, constraints.md, tasks.md each — 35 atomic tasks total
- **2 new contracts**: `.gsd-t/contracts/headless-default-contract.md` (v1.0.0 DRAFT, folds 3 M35 contracts), `.gsd-t/contracts/unattended-event-stream-contract.md` (v1.0.0 DRAFT)
- **`test/headless-default.test.js`** — 11 tests covering the 4-cell propagation matrix (primary/validation × watch/no-watch) + existing regression coverage
- **`bin/gsd-t.js`** `unattended` passthrough subcommand — dispatches to `bin/gsd-t-unattended.cjs` so defense-in-depth `--watch` rejection reaches the supervisor rejection logic
- **M38 Scan #11** artifacts under `.gsd-t/scan/` (architecture, business-rules, contract-drift, quality, security, test-baseline + scan-report.html)

### Changed
- **`bin/headless-auto-spawn.{cjs,js}`** — added `watch` + `spawnType` parameters; propagation rules implemented (validation spawns always headless, primary+watch returns `{mode: 'in-context'}`)
- **7 command files** converted to `autoSpawnHeadless({...spawnType: 'primary', watch: $WATCH_FLAG})` pattern: `gsd-t-execute`, `gsd-t-wave`, `gsd-t-integrate`, `gsd-t-quick`, `gsd-t-debug`, `gsd-t-scan`, `gsd-t-verify`
- **`bin/gsd-t-unattended.{cjs,js}`** — rejects `--watch` flag with clear error (validation-spawn enforcement in unattended context)
- **`bin/gsd-t.js`** `installContextMeter()` — removed `test-injector.js` skip (file deleted; no longer needed)
- **`.gsd-t/contracts/integration-points.md`** — M38 dependency graph + 5 checkpoints (M38-CP1 → M38-CP5) + file ownership map
- **`.gsd-t/progress.md`** — M38 partition + plan entries added to Decision Log
- **`docs/architecture.md` + `docs/infrastructure.md`** — Scan #11 staleness callouts added (TD-103 doc-ripple candidate noted)

### Removed
- **`scripts/context-meter/count-tokens-client.{js,test.js}`** — retired with v3.11.11 local-estimator switch (count_tokens API no longer called)
- **`scripts/context-meter/test-injector.js`** — test-only infrastructure, no longer referenced

### Testing
- 1234/1242 tests pass. 8 pre-existing failures carried forward: 7 stranded context-meter tests (TD-102, owned by M38-MR) + 1 scan.test.js live-state test (unrelated). No regressions from H1 work.

## [3.11.10] - 2026-04-16

### Added — Universal Context Auto-Pause (M37)

**Background**: The Context Meter (M34) correctly measures context window usage and emits an `additionalContext` signal at the configured threshold (default 75%). However, Claude consistently ignores the single-line suggestion format, continuing to work until hitting the runtime's ~95% `/compact` wall — which destroys context silently and loses work.

### Changed
- **`scripts/context-meter/threshold.js`** — `buildAdditionalContext()` now returns a 6-line MANDATORY STOP instruction instead of a single-line suggestion. The message starts with `🛑 MANDATORY STOP` and includes step-by-step instructions (pause → clear → resume) with explicit reference to the Destructive Action Guard enforcement weight.
- **`.gsd-t/contracts/context-meter-contract.md`** — bumped to v1.2.0. New §"Universal Auto-Pause Rule" documents the mandatory behavioral requirement. Rule #8 added: `additionalContext` is a MANDATORY STOP signal with Destructive Action Guard enforcement weight.
- **`templates/CLAUDE-global.md`** — new `## Universal Auto-Pause Rule (MANDATORY)` section added between Context Meter and API Documentation Guard sections. Same enforcement weight as the Destructive Action Guard.
- **5 loop command files** (`gsd-t-execute`, `gsd-t-wave`, `gsd-t-integrate`, `gsd-t-quick`, `gsd-t-debug`) — Step 0.2 added: Universal Auto-Pause Rule enforcement. If `🛑 MANDATORY STOP` appears in `additionalContext` at any point, immediately halt, pause, and instruct clear+resume.
- **Tests**: All 1228 tests pass (1224 unit + 4 e2e). `threshold.test.js` and `gsd-t-context-meter.e2e.test.js` updated for new multi-line format.

## [3.10.16] - 2026-04-15

### Fixed — unattended supervisor launch friction (3 bugs + UX improvements)

**Background**: Users consistently failed to launch unattended sessions due to compounding pre-flight friction: the supervisor spawn targeted the wrong binary, the dirty-tree check refused on benign files, and missing milestone state caused hard refusals. These issues defeated the purpose of "unattended" mode.

### Changed
- **`bin/gsd-t-unattended-platform.{js,cjs}`** — `spawnSupervisor()` no longer prepends `"unattended"` as a subcommand. `binPath` now points to `bin/gsd-t-unattended.cjs` (the actual supervisor entry) instead of `bin/gsd-t.js` (which has no `unattended` subcommand and printed "Unknown command" on every launch).
- **`bin/gsd-t-unattended.{js,cjs}`** — dirty worktree check changed from **refuse** to **auto-whitelist**. Non-whitelisted dirty files are automatically added to `.gsd-t/.unattended/config.json` and the supervisor proceeds. Only genuine git errors (not a repo, etc.) still refuse. Import of `saveConfig` added.
- **`bin/gsd-t-unattended-safety.{js,cjs}`** — added `saveConfig(projectDir, config)` function to persist auto-whitelisted entries back to the config file. Exported for use by supervisor and tests.
- **`bin/gsd-t.js`** `updateSingleProject()` — now calls `ensureUnattendedConfig()` (creates `.gsd-t/.unattended/config.json` with all defaults) and `ensureUnattendedGitignore()` (adds `bin/*.cjs`, `.gsd-t/.archive-migration-v1`, `.gsd-t/.task-counter-retired-v1` to `.gitignore`).
- **`commands/gsd-t-unattended.md`** — Step 1c.1 "Readiness Bootstrap": if no active milestone found, auto-bootstraps from conversation context or `--milestone=` flag instead of refusing. Works from any workflow state. Step 2 dry-run display and binPath updated to reference `gsd-t-unattended.cjs`.
- **`.gsd-t/contracts/unattended-supervisor-contract.md`** — spawn snippet and exit code 8 description updated.
- **Tests**: `test/unattended-platform.test.js` shim updated (argv[2] not argv[3]). `test/unattended-supervisor.test.js` dirty-tree test now verifies auto-whitelist behavior + git-error refusal. 1136/1136 tests pass.

## [3.10.15] - 2026-04-15

### Fixed — bin tools not propagated to downstream projects (unattended launch fails)

**Background**: The unattended supervisor (`/gsd-t-unattended`) and several other commands reference bin files via `require('./bin/<tool>.js')` resolved against the project cwd. These files only existed in the GSD-T source repo — downstream projects that use GSD-T as tooling (installed via npm) never received them because `PROJECT_BIN_TOOLS` only listed 5 of the 13 needed files. Additionally, `.js` files fail in downstream projects with `"type": "module"` in their `package.json`.

### Changed
- **`bin/gsd-t.js`** `PROJECT_BIN_TOOLS` — expanded from 5 to 13 entries. Now includes: `gsd-t-unattended.cjs`, `gsd-t-unattended-platform.cjs`, `gsd-t-unattended-safety.cjs`, `handoff-lock.cjs`, `headless-auto-spawn.cjs`, `runway-estimator.cjs`, `token-telemetry.cjs`, `token-optimizer.cjs` (plus existing 5).
- **8 new `.cjs` files** created in `bin/` — copies of existing `.js` files with internal cross-requires updated to `.cjs` (e.g., `gsd-t-unattended.cjs` requires `./gsd-t-unattended-safety.cjs` instead of `.js`).
- **15 command files updated** — all `require('./bin/<tool>.js')` calls switched to `.cjs` for the 8 newly-propagated tools: `gsd-t-execute`, `gsd-t-wave`, `gsd-t-quick`, `gsd-t-integrate`, `gsd-t-debug`, `gsd-t-doc-ripple`, `gsd-t-unattended`, `gsd-t-resume`, `gsd-t-status`, `gsd-t-complete-milestone`, `gsd-t-optimization-apply`, `gsd-t-optimization-reject`, `gsd-t-backlog-list`.
- 1229/1229 tests pass.

### Impact
- `/gsd-t-unattended` can now launch from any downstream project (Tekyz-CRM, etc.)
- Runway estimator, headless auto-spawn, and token telemetry brackets work in downstream projects
- Token optimizer hooks in complete-milestone and backlog-list work in downstream projects

## [3.10.14] - 2026-04-15

### Fixed — transcript parser orphaned tool_use blocks cause count_tokens 400

**Background**: With `ANTHROPIC_API_KEY` now set (v3.10.12-13 fix), the context meter hook passed the key check but the `count_tokens` API returned HTTP 400: `"tool_use ids were found without tool_result blocks immediately after"`. The transcript parser (`scripts/context-meter/transcript-parser.js`) faithfully reconstructed the JSONL transcript but didn't enforce the API's strict adjacency constraint: every assistant `tool_use` must be immediately followed by a user `tool_result` with matching ids. Mid-session compaction and summarization can orphan these blocks.

### Changed
- **`scripts/context-meter/transcript-parser.js`** — added `sanitizeToolPairs()` post-processing pass after message reconstruction. Walks the message list enforcing adjacency: assistant `tool_use` blocks are kept only if the immediately following user message contains a `tool_result` with a matching id, and vice versa. Messages that become empty after stripping are dropped. This is a structural fix — any transcript shape (compacted, summarized, interrupted) now produces a valid `count_tokens` payload.
- **`scripts/context-meter/transcript-parser.test.js`** — updated 2 existing tests that created orphaned `tool_result` messages (now include matching `tool_use` predecessors). Added 1 new test: `orphaned tool_use without matching tool_result is stripped`. 1229/1229 tests pass.

### Verification
- Real transcript (626→649 messages, 473KB payload) now returns HTTP 200 with `input_tokens: 153597` (was 400 before fix)
- Context meter state file flipped from `lastError: api_error` to `lastError: null`, `inputTokens: 158543`, `pct: 79.3%`, `threshold: warn`
- First successful real-time context measurement since M34 was built

## [3.10.13] - 2026-04-15

### Fixed — P0 v3.10.12 propagation gap (same regression, downstream projects)

**Background**: v3.10.12 shipped the `stale` band fix to `bin/token-budget.js` in the GSD-T repo, but verification revealed the fix was **never visible in any downstream project**. Every command file gate snippet is `require('./bin/token-budget.js')` resolved against the **project cwd** — and no downstream project has a local `bin/token-budget.js` file. `PROJECT_BIN_TOOLS` in `bin/gsd-t.js` (the list that `update-all` copies to each registered project) did not include `token-budget.js`, so downstream projects never received any copy. The require throws `MODULE_NOT_FOUND`, the surrounding `try{…}catch(_){process.stdout.write('0')}` swallows it, and the gate sees `pct: 0` = normal band. Identical failure mode to the original regression.

### Changed
- **`bin/token-budget.js` → `bin/token-budget.cjs`** — renamed to `.cjs` so it runs as CommonJS regardless of downstream `package.json` `"type"` field. Some registered projects use `"type": "module"`, which would have broken `require('./bin/token-budget.js')` even if the file were propagated. The `.cjs` extension is the same convention used by all other tools in `PROJECT_BIN_TOOLS` (`archive-progress.cjs`, `log-tail.cjs`, `context-budget-audit.cjs`, `context-meter-config.cjs`).
- **`bin/gsd-t.js`** `PROJECT_BIN_TOOLS` — appended `"token-budget.cjs"`. Now `update-all` copies the file to every registered project's `bin/` on update.
- **All 17 command files** referencing `./bin/token-budget.js` — updated to `./bin/token-budget.cjs`: `gsd-t-execute`, `gsd-t-wave`, `gsd-t-quick`, `gsd-t-debug`, `gsd-t-integrate`, `gsd-t-doc-ripple`, `gsd-t-verify`, `gsd-t-plan`, `gsd-t-discuss`, `gsd-t-visualize`, `gsd-t-reflect`, `gsd-t-brainstorm`, `gsd-t-audit`, `gsd-t-prd`, `gsd-t-resume`, `gsd-t-unattended`, `gsd-t-help`.
- **`test/token-budget.test.js`** — require path updated to `../bin/token-budget.cjs`. All 1228 tests pass.

### Why this matters
Without this patch, v3.10.12's `stale` band fix is **dead code in every downstream project**. The command files fail the require, catch silently, and the gate goes back to reporting 0% normal — exactly the invisible failure mode that caused the M36 regression in the first place. The two patches are a single logical fix; shipping v3.10.12 alone was incomplete.

### Verification
- `npm test` → 1228/1228 pass (same baseline as v3.10.12)
- No runtime references to `token-budget.js` remain under `commands/`
- `bin/token-budget.cjs` is 13867 bytes (verbatim copy of the v3.10.12 `token-budget.js`)
- `PROJECT_BIN_TOOLS` now has 5 entries — `update-all` will copy to all 15 registered projects on next invocation

## [3.10.12] - 2026-04-15

### Fixed — P0 context meter regression (M36 /compact incidents)

**Background**: During M36 execution the user hit Claude Code's native `/compact` prompt multiple times — the exact scenario M34's Context Meter was built to prevent. Audit of `.gsd-t/.context-meter-state.json` revealed `checkCount=2102` with `pct=0` and `lastError: missing_key` forever. Every one of 2102 PostToolUse hook calls had silently failed at the `ANTHROPIC_API_KEY` check and returned `{}` per the fail-open invariant. `token-budget.getSessionStatus()` read `pct: 0` and reported `threshold: "normal"` to the gate, so the gate was **blind since installation** with no user-visible alarm at any layer.

### Added
- **`bin/token-budget.js`** — fourth `stale` band in `getSessionStatus()`. When the state file exists but is dead (`lastError` set, `timestamp` null, state older than 5 min, or JSON corrupt), returns `{threshold: "stale", deadReason}` with one of `meter_error:missing_key`, `meter_error:api_error`, `meter_error:parse_failure`, `meter_error:no_transcript`, `meter_never_measured`, `meter_state_stale`, `state_file_corrupt`, `state_file_unreadable`. Previously fell through to the heuristic (which reported 0% and was indistinguishable from a healthy fresh session).
- **`bin/token-budget.js`** — `buildBandResponse()` handles the `stale` band with a loud message pointing at `gsd-t doctor` and `ANTHROPIC_API_KEY`.
- **`commands/gsd-t-resume.md`** — new Step 0.6 "Context Meter Health Check" runs after the headless read-back banner and before state loading. If the meter is stale, prints a prominent warning, runs `gsd-t doctor` inline, and refuses to auto-advance into gated commands (`execute`, `wave`, `integrate`, `quick`, `debug`) until fixed.
- **`.gsd-t/contracts/context-meter-contract.md` v1.1.0** — new §"Stale Band and Resume Gating" documents the regression, the fix, and the mandatory resume-time health check. Also adds a "measurement only, never inference" rule to the configuration section clarifying that the API key named in `apiKeyEnvVar` must never be used for `/v1/messages` inference — inference always runs through the Claude Code subscription.
- **`.gsd-t/contracts/token-budget-contract.md` v3.1.0** — fourth band added to the threshold table with explicit "gate treats stale as exit-10 stop but does NOT auto-spawn" semantics (a fresh session would have the same broken guardrail).

### Changed
- **`commands/gsd-t-execute.md`** — Step 3.5 gate snippet (Orchestrator Context Gate) and Step 7 per-domain context gate re-check now exit 10 on `s.threshold==='stop'||s.threshold==='stale'`. Both sites print different user-facing messages for each band: `stop` → "halt cleanly, hand off to runway estimator"; `stale` → "run `gsd-t doctor` and fix the cause".
- **`commands/gsd-t-wave.md`** — Wave Orchestrator Context Gate snippet now exits 10 on `stale` in addition to `stop`. The `stale` path does NOT call `autoSpawnHeadless()` — a fresh session would have the same broken guardrail.
- **`bin/gsd-t.js`** — `showStatusContextMeter()` promotes the dead-meter line from a dim ignorable whisper to a red `✗ CONTEXT METER DEAD` alarm with actionable fix instructions (explicitly calls out "measurement only — inference stays on Claude Code subscription" when the cause is `missing_key`). This is the line the user would have seen on every `gsd-t status` run during M36 if it had been loud enough to notice.

### Root cause and the 6 hypotheses

The continue-here file for this session listed 6 plausible failure modes. The audit disproved 5 of them and proved the sixth:
1. ❌ Gate only fires at subagent-spawn boundaries — FALSE, coverage is broad (16 command files call `getSessionStatus`, `execute` alone has 13 call sites).
2. ❌ Coverage holes in command files — FALSE, the 4 gated commands (`execute`, `wave`, `integrate`, `quick`, `debug`) all call the gate.
3. ❌ `.gsd-t/.context-meter-state.json` stale due to silent hook failure — PARTIALLY; the state was not stale, it was **never fresh**. The file had `timestamp: null` after 2102 checks.
4. ✅ **PostToolUse hook silent failure on missing `ANTHROPIC_API_KEY` — CONFIRMED root cause.** The hook's `runMeter()` step 5 checks the env var, writes `lastError: {code: "missing_key"}`, persists the state, and returns `{}`. This is correct per the hook's fail-open invariant. But nothing downstream was LOUD about it: `token-budget.js` fell through to the heuristic; the gate saw `threshold: "normal"`; `gsd-t status` printed a dim line.
5. ❌ Session-tokens vs main-transcript measurement gap — MOOT, you can't have a measurement gap if you never measured.
6. ❌ 85% stop band too thin — MOOT for the same reason.

The v3.10.12 fix targets only the real root cause: **make the gate fail loud when the meter is dead**, and add a resume-time health check so future sessions can't silently run without the guardrail.

### User-visible fix

If you see `✗ CONTEXT METER DEAD` on `gsd-t status` or `⚠ Context meter is DEAD` from `gsd-t-resume`, set `ANTHROPIC_API_KEY` in your shell profile:

```bash
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc
source ~/.zshrc
```

**Important:** this key is used ONLY for `count_tokens` measurement via the PostToolUse hook and `gsd-t doctor` diagnostics. It is NEVER used for model inference — inference always runs through the Claude Code subscription. The contract `context-meter-contract.md` v1.1.0 Rule #3 enforces this.

## [3.10.11] - 2026-04-15

### Added
- `docs/unattended-config.md` — full schema and recipe reference for `.gsd-t/.unattended/config.json`. The supervisor has always loaded this file (M36 safety rails), but there was no user-facing doc explaining the schema, precedence, or common overrides.
- `commands/gsd-t-unattended.md` Step 1c cross-references the new config doc and calls out the solo-project recipe (`{"protectedBranches": []}` to disable the main/master guard).

### Fixed
- Flaky test: `scripts/gsd-t-context-meter.e2e.test.js` `HARD_TIMEOUT_MS` bumped 6000 → 12000ms. The hook child process runs fine in 30ms in isolation but was timing out under full-suite parallelism load on some machines. No behavioral change — just a more forgiving outer cap.
- `commands/gsd-t-unattended.md` gained Step 1e: pre-flight software check that hard-fails the launch if `node`, `claude`, or `git` are missing, and prints soft warnings for missing platform helpers (`caffeinate` on darwin; `systemd-inhibit`/`notify-send` on linux; BurntToast advisory on win32). Replaces the previous "crash mid-run when a helper is missing" behavior with fail-fast + actionable install instructions.
- `docs/unattended-windows-caveats.md` added §0 "Required Software" matrix listing hard-required and soft-recommended tools per platform.

### Notes
- No API or contract changes. `.gsd-t/.unattended/config.json` loader and precedence (CLI > env > config > defaults) were already built into M36 safety rails — this release only surfaces them in documentation.

## [3.10.10] - 2026-04-15

### Major version bump: 2.x → 3.x

M36 ships the third pillar of the context/runway/autonomy arc (M34 context meter → M35 no-silent-degradation → M36 unattended supervisor). Cumulatively these three milestones are substantial enough to mark a new major version. No breaking API changes — existing commands and contracts continue to work — but v3.x establishes "unattended-capable" as the default expectation for the harness. Semver major bump also aligns with the "always 2-digit minor and patch" display convention (Minor and Patch start at 10 after a major reset).

### M36: Unattended Supervisor — Zero-Human-Intervention Milestone Execution

**Background**: M35 introduced headless auto-spawn to continue a single runway-exhausted session in a fresh context. M36 generalizes this into a first-class long-running supervisor: a detached OS-level process that drives the active GSD-T milestone to completion over hours or days via a `claude -p` worker relay. Each worker runs in its own fresh context window; the supervisor survives terminal close, `/clear`, and sleep/wake cycles. A 270-second ScheduleWakeup watch loop in the interactive session provides live status without blocking the user.

### Added

- **`bin/gsd-t-unattended.js`** — detached supervisor process. Spawns `claude -p` workers in a relay, writes atomic `state.json` between iterations, manages `supervisor.pid` lifecycle, invokes safety rails at hook points, sends OS notifications on terminal transitions (macOS `osascript`; silent no-op on other platforms), and removes its own PID file on any exit. Singleton: a second launch with a live PID refuses.
- **`bin/gsd-t-unattended-safety.js`** — safety rails module. Exports: `checkGitBranch` (protected branch list; configurable), `checkWorktreeCleanliness` (dirty-tree guard with whitelist), `checkIterationCap`, `checkWallClockCap`, `validateState`, `detectBlockerSentinel` (scan run.log tail for unrecoverable/dispatch-failed patterns), `detectGutter` (repeated-error / file-thrash / no-progress stall detection). Each check returns `{ ok, reason?, code? }`.
- **`bin/gsd-t-unattended-platform.js`** — platform abstraction. Exports: `spawnSupervisor` (detached spawn with `windowsHide`), `preventSleep` / `releaseSleep` (`caffeinate -i` on darwin; no-op on linux/win32), `sendNotification` (osascript on darwin; `notify-send` on linux; toast via PowerShell on win32 — all graceful no-op on failure), `resolveClaudeBin` (`claude.cmd` on win32; `claude` elsewhere + PATH search), `getPlatform`.
- **`bin/handoff-lock.js`** — parent/child race guard for headless-auto-spawn. Writes `.gsd-t/.handoff/{session-id}.lock` before detaching; child removes on first iteration. Prevents the parent from reporting "failed" while the child is still starting. Exports: `acquireLock`, `releaseLock`, `waitForRelease`, `isLocked`.
- **`commands/gsd-t-unattended.md`** — `/gsd-t-unattended` launch command. Pre-flights (singleton check, safety rails, active milestone), spawns the supervisor via `bin/gsd-t-unattended-platform.js`, polls for `supervisor.pid` + `status=running` (up to 5s), prints the initial watch block, calls `ScheduleWakeup(270, '/gsd-t-unattended-watch')`.
- **`commands/gsd-t-unattended-watch.md`** — `/gsd-t-unattended-watch` watch tick. Stateless; reads `supervisor.pid` + `state.json`; renders progress or final summary; reschedules via `ScheduleWakeup(270, ...)` on non-terminal status; stops on terminal status or missing PID file.
- **`commands/gsd-t-unattended-stop.md`** — `/gsd-t-unattended-stop` stop command. Touches `.gsd-t/.unattended/stop` sentinel; prints reassurance; returns immediately (no kill, no wait).
- **`.gsd-t/contracts/unattended-supervisor-contract.md` v1.0.0 ACTIVE** — authoritative interface for state file schema (18 fields), PID file lifecycle, sentinel semantics, exit codes 0–8+124, launch handshake, watch tick decision tree, resume auto-reattach handshake, stop mechanism, notification levels, safety rails hook points, and configuration file schema.
- **`docs/unattended-windows-caveats.md`** — known Windows limitations: sleep-prevention not supported (no `caffeinate` equivalent wired; `powercfg /requests` path is v2), `claude.cmd` wrapper adds ~500ms per spawn, Windows Defender may scan each worker spawn, notification via PowerShell toast requires non-interactive shell workaround.
- **`.claude/settings.json`** (project-shared) — SessionStart hook registered: `node bin/check-headless-sessions.js . 2>/dev/null || true` surfaces completed headless session banners on session start.

### Changed

- **`commands/gsd-t-wave.md`** — "Run /clear" STOP block removed from the runway-exceeded handoff path. The command now calls `autoSpawnHeadless()` seamlessly; user never sees a manual-intervention prompt under normal runway overflow.
- **`commands/gsd-t-execute.md`**, **`gsd-t-quick.md`**, **`gsd-t-integrate.md`**, **`gsd-t-debug.md`** — same "Run /clear" prompt removal; headless auto-spawn wired in.
- **`commands/gsd-t-resume.md`** — new Step 0 "Unattended Supervisor Auto-Reattach": checks `supervisor.pid`; if live and non-terminal, skips normal resume and re-starts the watch loop. New Step 0.2 "Handoff Lock Wait": polls until `.gsd-t/.handoff/*.lock` is released (headless child has taken ownership) before proceeding.

### Fixed

- **`bin/gsd-t.js` headless dispatch** (Phase 0 P0, committed prior milestone): `mapHeadlessExitCode` now maps `"Unknown command:"` in worker stdout → exit code 5 (`command-dispatch-failed`). Worker invocation no longer prepends `/` to command names, preventing "Unknown command:" failures in non-interactive `claude -p` sessions.

### Tests

- `test/unattended-supervisor.test.js` — 42 tests: happy-path relay, gutter halt, stop sentinel, dispatch-failure halt, crash detection, dirty-tree pre-flight refusal.
- `test/unattended-safety.test.js` — 18 tests: each check function, combined pre-flight, gutter threshold config.
- `test/unattended-platform.test.js` — 14 tests: platform detection, spawn flags, sleep-prevention no-op on linux, claude binary resolution.
- `test/handoff-lock.test.js` — 16 tests: acquire/release, race prevention, waitForRelease timeout, stale lock cleanup.
- `test/headless-auto-spawn.test.js` — +9 tests (new handoff-lock integration cases added to existing suite).
- `test/filesystem.test.js` — counts updated to reflect new files (+6 bin files, +3 command files, +1 docs file).
- **Total**: 1146 → 1226 (+80 new tests).

### Migration

After `npm install @tekyzinc/gsd-t@3.10.10`, run `/gsd-t-version-update-all` to propagate v3.10.10 to all registered projects. The new command files, `bin/` modules, and contract are written into each project automatically. No existing `.gsd-t/` state is modified.

---

## [2.76.10] - 2026-04-15

### M35: Runway-Protected Execution — Aggressive Pause-Resume Replaces Graduated Degradation

**Background**: Between v2.74 and v2.75, GSD-T coped with context pressure via graduated degradation — `downgrade` and `conserve` bands that silently demoted opus→sonnet→haiku and skipped Red Team / doc-ripple / Design Verify phases. This made quality **conditional on context pressure**, a load-bearing invariant the user could neither see nor control. M35 removes graduated degradation entirely and replaces it with: surgical per-phase model selection (plan-time, never runtime), a pre-flight runway estimator that refuses runs projected to cross 85% and auto-spawns a detached headless continuation, frozen 18-field per-spawn token telemetry, and a detect-only optimization backlog the user explicitly promotes or rejects. The user never types `/clear` under normal operation.

### Added

- **`bin/model-selector.js`** — declarative phase→tier mapping (≥13 phase mappings) with complexity-signal escalation (`cross_module_refactor`, `security_boundary`, `data_loss_risk`, `contract_design`) that escalates sonnet→opus at plan time. Each command file carries a `## Model Assignment` block.
- **`bin/runway-estimator.js`** — `estimateRunway({command, domain_type, remaining_tasks})` reads `.gsd-t/token-metrics.jsonl` via a three-tier query fallback (exact → command+phase → command) and returns `{can_start, projected_end_pct, confidence, recommendation}`. Confidence grading: high ≥50 records, medium ≥10, low <10 (+1.25× skew).
- **`bin/headless-auto-spawn.js`** — detached `child_process.spawn({detached:true, stdio:['ignore', fd, fd]}) + child.unref()`. Writes `.gsd-t/headless-sessions/{session-id}.json`, polls with `process.kill(pid, 0)` (timer `.unref()`-ed), marks `status: completed`, posts a macOS `osascript` notification on exit (graceful no-op on non-darwin).
- **`bin/check-headless-sessions.js`** — scans `.gsd-t/headless-sessions/` for `status === 'completed' && surfaced !== true` and renders the read-back banner on `/gsd-t-resume` and `/gsd-t-status`. Exports `checkCompletedSessions`, `markSurfaced`, `formatBanner`, `printBannerIfAny`, `computeDurationLabel`.
- **`bin/token-telemetry.js`** — per-spawn token bracket writes one frozen 18-field JSONL record per subagent spawn to `.gsd-t/token-metrics.jsonl`. Fields: `timestamp, session_id, command, phase, domain, task_id, model, complexity_signals[], input_tokens, output_tokens, duration_seconds, start_pct, end_pct, halt_type, halt_reason, exit_code, run_type, projection_variance`. `halt_type` values: `clean`, `stop-band`, `runway-refuse`, `native-compact` (defect), `crash`.
- **`bin/token-optimizer.js`** — at `complete-milestone`, scans the last 3 milestones and appends recalibration recommendations to `.gsd-t/optimization-backlog.md`. Four detection rules: `demote` (opus phase ≥90% success, ≥3 volume), `escalate` (sonnet phase ≥30% failure rate, ≥5 volume), `runway-tune` (projection vs. actual divergence >15%), `investigate` (per-phase p95 > 2× median, ≥10 volume). Fingerprint-based 5-milestone cooldown on rejected items. Exports `detectRecommendations`, `appendToBacklog`, `readBacklog`, `writeBacklog`, `parseBacklog`, `setRecommendationStatus`, `DETECTION_RULES`, `REJECTION_COOLDOWN_MILESTONES`.
- **`bin/advisor-integration.js`** — `/advisor` escalation hook; convention-based fallback if no programmable API.
- **`.gsd-t/contracts/token-budget-contract.md` v3.0.0 ACTIVE** — clean-break rewrite. Three bands only: `normal` <70%, `warn` 70–85%, `stop` ≥85%. Response shape `{band, pct, message}`. `downgrade`, `conserve`, `modelOverrides`, `skipPhases` all deleted — no compat shim.
- **`.gsd-t/contracts/model-selection-contract.md` v1.0.0 ACTIVE** — declarative phase→tier rules, complexity-signal escalation semantics, `/advisor` hook schema.
- **`.gsd-t/contracts/token-telemetry-contract.md` v1.0.0 ACTIVE** — frozen 18-field per-spawn JSONL schema, `halt_type` enum, `run_type` enum.
- **`.gsd-t/contracts/runway-estimator-contract.md` v1.0.0 ACTIVE** — pre-flight projection, three-tier query fallback, confidence grading, refusal + headless handoff contract.
- **`.gsd-t/contracts/headless-auto-spawn-contract.md` v1.0.0 ACTIVE** — detached continuation, session file schema, macOS notification channel, read-back banner.
- **`commands/gsd-t-optimization-apply.md`** — promotes a backlog recommendation by ID, auto-routes to `/gsd-t-quick` or `/gsd-t-backlog-promote` based on recommendation type.
- **`commands/gsd-t-optimization-reject.md`** — rejects a recommendation with optional `--reason`, sets 5-milestone cooldown. Reason captured in token-log.md + Decision Log.
- **`gsd-t metrics` flags** — `--tokens` (per-command/phase token summary), `--halts` (halt-type breakdown; flags any `native-compact` as defect), `--context-window` (trailing 20-run `end_pct` with runway headroom).
- **Test coverage**: `test/headless-auto-spawn.test.js` (16 tests — session file schema, completion watcher, read-back banner, non-darwin degradation, E2E shim smoke), `test/token-optimizer.test.js` (19 tests — each rule triggers/skips, parseBacklog round-trip, cooldown filter, OB-T1+OB-T4 integration roundtrip), plus rewrites of `test/token-budget.test.js` around v3.0.0. **~1011/1011 total tests green through Wave 4**.

### Changed

- **`bin/token-budget.js`** — `getSessionStatus()` now returns `{band, pct, message}` with only three bands. `applyModelOverride`, `skipPhases`, `getDegradationActions` band-branching for `downgrade`/`conserve` — all deleted.
- **`bin/orchestrator.js`** — gate semantics: `normal` proceed, `warn` log + proceed at **full quality**, `stop` halt cleanly and hand off to runway estimator → headless-auto-spawn. No model swaps. No phase skips.
- **Command files** (`gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-quick.md`, `gsd-t-integrate.md`, `gsd-t-debug.md`, `gsd-t-doc-ripple.md`) — Step 0 runway gate; `## Model Assignment` blocks documenting per-phase tier choices; per-spawn token telemetry brackets around every subagent spawn.
- **`commands/gsd-t-resume.md`** — Step 0.5 Headless Read-Back Banner (MANDATORY) invokes `node bin/check-headless-sessions.js . 2>/dev/null || true`.
- **`commands/gsd-t-status.md`** — Step 0 Headless Read-Back Banner + Step 0.5 Optimization Backlog Pending Count (one-liner, suppressed when N=0).
- **`commands/gsd-t-complete-milestone.md`** — Step 14 non-blocking optimizer invocation: `detectRecommendations({lookbackMilestones: 3})` → `appendToBacklog`. Wrapped in try/catch; optimizer failure logged but not re-thrown.
- **`commands/gsd-t-backlog-list.md`** — `--file` flag supports rendering `optimization-backlog.md` via `bin/token-optimizer.js` parseBacklog, with optional `--status {pending|promoted|rejected}` filter.
- **`commands/gsd-t-help.md`** — new OPTIMIZATION section in summary table; detailed entries for `optimization-apply` and `optimization-reject`.
- **Documentation ripple**:
  - `README.md` — "Runway-Protected Execution (M35, v2.76.10)" section replacing "Token-Aware Orchestration"; threshold description updated to "85% = stop band; 70% = warn band — cue for explicit pause/resume; no silent degradation".
  - `docs/GSD-T-README.md` — 3-band table replacing 5-band table, "Zero silent quality degradation" explanation, per-phase model selection, `/advisor` escalation, `gsd-t metrics` flags, optimization apply/reject.
  - `docs/methodology.md` — new "From Silent Degradation to Aggressive Pause-Resume (M35)" section with five principles (quality non-negotiable, explicit per-phase model selection, user never types `/clear`, data before optimization, clean break no compat shim) + "Structural guarantee" closing paragraph.
  - `docs/architecture.md` — dataflow updated for runway estimator + headless auto-spawn + v3.0.0 band semantics; M35 supporting components section (model-selector, token-optimizer, check-headless-sessions).
  - `docs/infrastructure.md` — 3-band threshold table replacing 5-band; new Runway-Protected Execution section covering all 5 components; `gsd-t metrics` CLI table; `/advisor` convention.
  - `docs/requirements.md` — REQ-069 through REQ-078 M35 traceability; REQ-076/077 marked complete.
  - `docs/prd-harness-evolution.md` — §3.7 rewritten as "Context Gate + Surgical Model Escalation"; risk-table + session-cost mitigations updated to reference runway estimator + headless handoff (no graduated degradation).
  - `templates/CLAUDE-global.md` + `templates/CLAUDE-project.md` — Token-Aware Orchestration section rewritten around M35 semantics.

### Removed

- **Graduated degradation** — `downgrade` and `conserve` bands are deleted from `bin/token-budget.js`, the v3.0.0 `token-budget-contract.md`, and every command file. `applyModelOverride`, `skipPhases`, and all related runtime machinery are gone.
- **Runtime model downgrade** — there is no code path that swaps opus→sonnet or sonnet→haiku under context pressure. Model choice is a plan-time decision made by `bin/model-selector.js`, full stop.
- **Phase-skipping under pressure** — Red Team, doc-ripple, and Design Verify always run at their designated tier regardless of context %. No "non-essential" phase exists.
- **Manual `/clear` prompts** under normal operation — the user only sees a `/clear` prompt when the headless handoff itself fails, which is an explicit degradation path, not a silent one.

### Migration

- **No user migration required** for v2.75.10 → v2.76.10 — `gsd-t update-all` rewrites command files in place and the new contracts ship with the package. Existing projects inherit the three-band gate automatically.
- **Projects with custom wrappers calling `getSessionStatus()`** — the return shape changed from `{band, pct, modelOverrides, skipPhases, message}` to `{band, pct, message}`. `modelOverrides` and `skipPhases` consumers must delete their handling code (they never had a quality-reducing role in v3.0.0 anyway).
- **Historical note**: `halt_type: native-compact` entries in `.gsd-t/token-metrics.jsonl` are defect signals — if they appear after upgrade, the runway estimator thresholds need re-tuning. The structural guarantee is that with `STOP_THRESHOLD_PCT = 85` and pre-flight refusal, the runtime's 95% native compact is unreachable under healthy operation.

### Propagation

Run `/gsd-t-version-update-all` from any registered GSD-T project to propagate v2.76.10 to all projects. The command files, templates, and `bin/` scripts are rewritten in place; project state in `.gsd-t/` is preserved.

---

## [2.75.10] - 2026-04-14

### M34: Context Meter — Real Context-Window Measurement Replaces Task-Counter Proxy

**Background**: v2.74.12/v2.74.13 introduced `bin/task-counter.cjs` as a deterministic session-burn gate after the env-var-based context self-check (`CLAUDE_CONTEXT_TOKENS_USED`) was found to be permanently inert. The task counter fixed the immediate bleeding, but it was always a proxy — 5 tasks ≠ N tokens, and Opus-primary sessions burn context faster than Sonnet-primary sessions for the same task count. M34 replaces the proxy with real measurement via the Anthropic `count_tokens` API, re-exposed through a PostToolUse hook.

### Added

- **`scripts/gsd-t-context-meter.js`** — PostToolUse hook that measures the active Claude Code session's context window after every tool call. Writes a snapshot to `.gsd-t/.context-meter-state.json` (`{pct, consumed, limit, timestamp, model}`) and, when `pct >= warn_threshold`, injects `additionalContext` into the Claude Code response so the orchestrator sees real burn in real time. Fails open (silent no-op) when `ANTHROPIC_API_KEY` is missing or the API is unreachable — never blocks the user's session.
- **`scripts/context-meter/`** — helper modules: `parser.js` (extract recent turns from transcript), `client.js` (count_tokens API wrapper with retry), `threshold.js` (warn/degrade/conserve/stop bands), `test-injector.js` (deterministic fixtures for unit tests).
- **`bin/context-meter-config.cjs`** — config loader with defaults and schema validation.
- **`templates/context-meter-config.json`** — default config (thresholds: warn 0.65, degrade 0.75, conserve 0.85, stop 0.92; staleness window 5 min).
- **`.gsd-t/contracts/context-meter-contract.md`** v1.0.0 ACTIVE — hook I/O contract, state file schema, threshold semantics, fail-open guarantees.
- **`.gsd-t/contracts/token-budget-contract.md`** v2.0.0 ACTIVE — rewritten around real measurement; public `getSessionStatus()` API surface preserved but semantics now reflect actual context % instead of task count.
- **Installer extensions (`bin/gsd-t.js`)**:
  - `install`/`update` registers `scripts/gsd-t-context-meter.js` as a PostToolUse hook in `~/.claude/settings.json` (idempotent).
  - First-run prompt for `ANTHROPIC_API_KEY` (skippable — doctor will later fail-red if unset).
  - `doctor` adds hard-gate checks for API key presence, hook registration, config file, and a dry-run smoke test of the hook entry point.
  - `status` displays real context % read from `.gsd-t/.context-meter-state.json` (falls back to heuristic when state is missing/stale).
- **Test coverage**: `scripts/gsd-t-context-meter.e2e.test.js` (90 tests — parser, client, threshold, hook entry, injection); `test/token-budget.test.js` fully rewritten around real measurement; `test/installer-m34.test.js` covers hook install, API key prompt, doctor gate, status line; **941/941 total tests green**.

### Changed

- **`bin/token-budget.js`** — `getSessionStatus()` now reads `.gsd-t/.context-meter-state.json` (with a 5-minute staleness window) and falls back to a heuristic based on `.gsd-t/token-log.md` row count when state is unavailable. Graduated degradation (`warn`/`downgrade`/`conserve`/`stop`) fires on real context % instead of task count. Public API unchanged so `bin/orchestrator.js` and every command that calls it keeps working.
- **`bin/orchestrator.js`** — task-budget gate now calls `token-budget.getSessionStatus()` for the real signal; checkpoint-and-stop behavior preserved.
- **Command files** (`gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-quick.md`, `gsd-t-integrate.md`, `gsd-t-debug.md`) — every `node bin/task-counter.cjs …` invocation replaced with a `CTX_PCT` bash shim that sources the context meter state file. Observability logging updated.
- **Token log schema** — `Tasks-Since-Reset` column renamed to `Ctx%`. All command files and templates updated.
- **Documentation ripple**:
  - `README.md` — Context Meter feature bullet + full "Context Meter Setup" section.
  - `docs/GSD-T-README.md` — Configuration → Context Meter subsection with data-flow, threshold bands, upgrade notes.
  - `docs/architecture.md` — Context Meter Architecture with full data-flow diagram.
  - `docs/infrastructure.md` — Context Meter Setup section with API key instructions, doctor verification, threshold table, upgrade migration.
  - `docs/methodology.md` — "Context Awareness: From Proxy to Real Measurement" narrative explaining why proxies failed and how real measurement restores gate integrity.
  - `docs/requirements.md` — M34 REQ-063 through REQ-068 traceability table with functional and non-functional requirements.
  - `templates/CLAUDE-global.md` — Context Meter Gate subsection + historical note about the task-counter era.
  - `templates/CLAUDE-project.md` — new Context Meter section for per-project setup.

### Removed

- **`bin/task-counter.cjs`** — deleted. The entire proxy gate retires. `.gsd-t/.task-counter`, `.gsd-t/task-counter-config.json`, and the `Tasks-Since-Reset` column are no longer read by any code.
- All `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` references across `commands/`, `bin/`, `scripts/`, and `templates/` — the last vestiges of the original broken env-var self-check.

### Migration

- **`gsd-t update-all`** runs a one-shot task-counter retirement migration: deletes `bin/task-counter.cjs`, `.gsd-t/.task-counter`, `.gsd-t/task-counter-config.json` from each registered project; writes `.gsd-t/.task-counter-retired-v1` marker so the migration is idempotent. Projects that had the proxy gate wired in come out the other side on the real context meter with zero manual intervention.
- **Users MUST set `ANTHROPIC_API_KEY`** in their shell environment (or accept the install-time prompt) for the context meter to produce real readings. Without the key, the hook fails open and `doctor` reports RED on the API key check — the gate falls back to the `token-log.md` row-count heuristic, which is safer than the old env-var vaporware but less accurate than real measurement.
- Both `install` and `update-all` register the hook in `~/.claude/settings.json` and copy the default config template. Existing `.claude/settings.json` is preserved; only the hook entry is appended.

### Propagation

After publishing, run `/gsd-t-version-update-all` to propagate M34 (hook, config, installer, rewritten token-budget, command file updates, retirement migration) to every registered GSD-T project in a single sweep.

## [2.74.13] - 2026-04-14

### Fixed — v2.74.12 task-counter distribution gap (P0)

**Root cause**: v2.74.12 added `bin/task-counter.cjs` as the deterministic context-burn gate and wired every command file to call `node bin/task-counter.cjs …`, but the installer's `PROJECT_BIN_TOOLS` list (`bin/gsd-t.js:1562`) was never updated to include it. Every downstream project ran command files that referenced a file the installer never copied. In every GSD-T project, `node bin/task-counter.cjs status|should-stop|reset|increment` threw "Cannot find module" — swallowed by `2>/dev/null` — and the orchestrator silently continued with no gate. Confirmed in bee-poc: `reassign-display` 6/6 + `reassign-candidates` 2/9 executed across ~30 min while `task-counter status` stayed `{"count":0}` the entire run and `token-log.md` got zero new rows.

**Additionally**: `doInit()` (`bin/gsd-t.js:1095`) never called `copyBinToolsToProject` at all, so brand-new projects created with `gsd-t init` were born with no bin tools until the user manually ran `update`.

**Fix**:
- **`bin/gsd-t.js`** — `PROJECT_BIN_TOOLS` now includes `task-counter.cjs`. One-line change at `bin/gsd-t.js:1562`.
- **`bin/gsd-t.js`** — `doInit()` now calls `copyBinToolsToProject(projectDir, projectName)` after `initGsdtDir`, so newly-initialized projects ship bin tools immediately.

v2.74.12's entire two-layer fix (task-count gate + extracted prompts) is correct — it just needed one line to actually distribute the counter script. Running `/gsd-t-version-update-all` after publishing this version will propagate `task-counter.cjs` to every registered project.

## [2.74.12] - 2026-04-14

### Fixed — Context-Burn Regression (P0, affects every GSD-T project)

**Root cause**: commit `0b91429` (2026-03-24) added an "orchestrator context self-check" that read `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` — environment variables **Claude Code never exports**. The guard was always false, so the self-check was silently inert. Commits `da6d3ae` and `b68353e` then promoted Red Team and Design Verification from per-domain to per-task on the assumption that this guard would catch context drain. With the guard broken, per-task spawning of ~10K-token adversarial prompts drained sessions from 77% → 12% context in just 2 tasks (bee-poc reproducer).

**Fix ships as a comprehensive two-layer correction:**

#### Fix 1: Real task-count gate (replaces vaporware env-var check)
- **NEW `bin/task-counter.cjs`** — deterministic on-disk task counter. State: `.gsd-t/.task-counter`. Config: `.gsd-t/task-counter-config.json` (default limit: 5). Env override: `GSD_T_TASK_LIMIT`. Commands: `increment <kind>`, `status`, `reset`, `should-stop` (exit code 10 at limit). This is the real signal the old self-check *pretended* to be.
- **`commands/gsd-t-execute.md`** — Step 0 resets the counter; Step 3.5 calls `node bin/task-counter.cjs should-stop` as a gate before every task spawn; Step 5 increments after each task. At limit, the orchestrator checkpoints and STOPs — user runs `/clear` then `/gsd-t-resume`.
- **`commands/gsd-t-wave.md`** — analogous phase-count gate replaces the broken "Wave Orchestrator Context Self-Check."
- **`bin/token-budget.js`** — `getSessionStatus()` rewritten to read the task counter instead of env vars. API surface preserved (threshold/pct/consumed/estimated_remaining) so all dependent commands keep working. Graduated-degradation thresholds (warn/downgrade/conserve/stop) now fire on real signal.

#### Fix 2: Revert per-task Red Team / Design Verify, extract prompts to templates
- **NEW `templates/prompts/`** directory with three self-contained prompt files: `qa-subagent.md`, `red-team-subagent.md`, `design-verify-subagent.md`, plus a `README.md` explaining the architecture. Command files reference prompts by **file path**, not by inlining the body. Subagents read the prompt file themselves, so the orchestrator never re-materializes ~3500-token prompt bodies in its own context per spawn.
- **`commands/gsd-t-execute.md`** — Red Team and Design Verification moved back to **per-domain** (where they were before `da6d3ae` / `b68353e`). QA stays per-task (smaller, and contracts can drift task-by-task). Result: safe-task-count-per-session rises from ~5 to ~15+.
- **`commands/gsd-t-quick.md`, `gsd-t-integrate.md`, `gsd-t-debug.md`** — Red Team spawn blocks converted to templated-prompt references. ~270 lines of duplicated adversarial prompt boilerplate removed; run-specific categories (Cross-Domain Boundaries, Regression Around the Fix, Original Bug Variants) preserved as one-line context notes to the subagent.

#### Fix 3: Token-log schema & placeholder cleanup
- Removed `Tokens | Compacted | Ctx%` columns from the token-log schema (they always wrote `0 | null | N/A` because the env vars were never set). Added `Tasks-Since-Reset` as the real burn signal.
- Neutralized **70+ references** to `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` across 14 command files. The 3 remaining references (gsd-t-execute.md, gsd-t-wave.md, gsd-t-doc-ripple.md) are historical-note mentions only. `scripts/gsd-t-heartbeat.js` and `scripts/gsd-t-statusline.js` still read the env vars but treat them as optional fallbacks that gracefully degrade (unchanged behavior).
- Test suite (`test/token-budget.test.js`) rewritten around the new counter-based `getSessionStatus()`. 36/36 passing.

### Propagation
After publishing, run `/gsd-t-version-update-all` to propagate the fix to every registered GSD-T project. Projects will receive the new `bin/task-counter.cjs` and updated command files in a single sweep.

## [2.74.11] - 2026-04-13

### Fixed
- **`bin/archive-progress.js` → `.cjs` rename** — the new bin tools used CommonJS `require()` but failed in projects with `"type": "module"` in `package.json` (caught on BDS-Analytics-UI during first update-all). Renamed all three new bin tools to `.cjs` so they run as CommonJS regardless of the host project's module type. `version-update-all` now copies `.cjs` files and runs `archive-progress.cjs`.

## [2.74.10] - 2026-04-13

### Added
- **`bin/archive-progress.js`** — rolling Decision Log archival. Keeps the last 5 entries live in `.gsd-t/progress.md`; older entries roll into `.gsd-t/progress-archive/NNN-YYYY-MM-DD.md` files (20 entries each) with an `INDEX.md` for date-range lookup. **Solves the runaway context consumption from progress.md growth** — current GSD-T project saw 163KB → 42KB on first migration (Decision Log section dropped from ~100KB to 13KB). Idempotent, dry-run supported, safe to run anytime.
- **`bin/log-tail.js`** — truncate test/build log output before forwarding into context. Writes full output to disk, prints only the tail (default 100 lines, 500 on detected failure). Used by command files to prevent multi-thousand-line stdout dumps from npm test / playwright test from blowing context budget.
- **`bin/context-budget-audit.js`** — measures the static context cost of a Claude Code session before any work happens. Reports tokens consumed by CLAUDE.md files, command manifest, MCP server schemas, auto-memory, and lazy-loaded skill bodies. Use to diagnose why long-running sessions hit manual `/compact` prompts.
- **Auto-migration on `version-update-all`** — every registered project gets `archive-progress.js`, `log-tail.js`, and `context-budget-audit.js` copied into its `bin/` directory automatically. The progress archive migration runs once per project (gated by `.gsd-t/.archive-migration-v1` marker) so the next `version-update-all` reclaims context budget across every GSD-T project at once.

### Fixed
- **Mid-session context exhaustion regression** — manual `/compact` prompts that started ~2026-04-10 traced to `progress.md` growing past 50K tokens (25% of the 200K context window in a single file). Every command that read it paid this cost. Archival fix targets the root cause; commands that read `progress.md` now see <10K tokens of relevant content instead of 50K+ of historical decisions.

## [2.73.28] - 2026-04-09

### Fixed
- **Ctrl+C now cleanly kills the orchestrator and all child processes** — SIGINT handler tracks all spawned Claude processes (build, review, fix) and kills them on Ctrl+C. The sync `spawnClaude` was converted from `execFileSync` (which blocked the event loop and prevented signal handling) to an async `execFile` with a polling wait that checks an interrupt flag. The `waitForReview` polling loop also breaks on Ctrl+C. No more orphaned processes.

## [2.73.27] - 2026-04-09

### Changed
- **Unlimited human review cycles with auto-review reset** — the orchestrator no longer caps human review iterations. After each human fix: (1) fixes are applied, (2) components are re-measured, (3) automated AI review runs with a fresh cycle counter (up to `maxAutoReviewCycles`), (4) components are re-queued for human review. This loop repeats until the reviewer submits with zero changes. The human is always the final gate.

## [2.73.26] - 2026-04-09

### Added
- **AI prompt assistant in review panel** — expandable panel in the header (toggle with Ctrl+K or the AI button). Ask questions about the selected component ("what stroke-width is this using?"), get help translating vague corrections into precise contract language ("arcs are too thick" → actionable property changes), and preview responses before committing them as comments via "Use as comment" button. Uses the Claude Code CLI (`claude -p`) so it works with Claude Max subscriptions — no API key needed. Model defaults to opus (override with `GSD_AI_ASSIST_MODEL` env var).
- **`/review/api/contract` endpoint** — returns the full design contract markdown for a given component path. Used by the AI assistant to provide contract-aware responses.
- **`/review/api/ai-assist` endpoint** — streaming SSE endpoint that spawns `claude -p` with component context (name, measurements, computed styles, contract). Zero external dependencies — uses the locally installed Claude Code CLI.

## [2.73.25] - 2026-04-09

### Added
- **Undo remove** — excluded elements show as struck-through with a green ↩ restore button instead of disappearing. Click to undo before submitting.
- **Contract deletion on submit** — when excluded elements are submitted, their contract files and source files are deleted from the project. The `/review/api/exclude` endpoint handles cleanup.

## [2.73.24] - 2026-04-09

### Added
- **Remove element button** — hover over any component in the list to reveal a red × button. Clicking it excludes the element from review and auto-comments "EXCLUDED — not in Figma design". Excluded count shown in submit stats.

### Fixed
- **Comment validation removed** — all comments are now accepted (questions, exclusions, feedback). The "don't suggest specific changes" popup no longer blocks submission.

### Changed
- **Submit stats** show removed count alongside changed/commented.

## [2.73.23] - 2026-04-09

### Fixed
- **Container props auto-redirect to parent** — setting `gap`, `borderRadius`, or `overflow` on a bar segment (child) now auto-targets the parent flex/grid container. Previously only worked when the container itself was selected.

## [2.73.22] - 2026-04-09

### Added
- **Stack-level border-radius** — setting `borderRadius` on a flex/grid bar column container auto-sets `overflow: hidden` (so rounded corners clip child segments) and propagates to all sibling columns. One change rounds all stacked bars.

## [2.73.21] - 2026-04-09

### Fixed
- **Undo All / Cmd+Z now reverts display** — undo properly sends `gsdt-set-svg-attr` for SVG changes and skips fixture changes. Undo All individually reverts each change before resetting CSS, so the preview updates correctly.
- **Can re-enter original value** — changing a property back to its original value now removes the tracked change and reverts the style (previously rejected as "no change").
- **Gap propagation for bar charts** — setting `gap` on a flex/grid container propagates to all sibling containers with the same display type (e.g., all bar columns). Shows "→ N all columns" feedback.

## [2.73.20] - 2026-04-09

### Added
- **Editable fixture data** — segment label, value, and color fields in the Data Props tree are now clickable to edit. Color fields use a color picker. Changes tracked alongside CSS/SVG changes in the review output.
- **Better SVG tree labels** — circle/arc nodes show stroke color, width, and radius. Path nodes show fill/stroke color. SVG root shows viewBox.
- **Deeper SVG tree traversal** — SVG subtrees traverse up to depth 8 (was 4), ensuring individual arc segments appear in the element tree.

### Removed
- **`percentages_shown`** from donut chart fixture — redundant with `segments[].value`.

## [2.73.19] - 2026-04-09

### Added
- **SVG attribute inspector** — SVG elements (`circle`, `path`, `rect`, `line`, `ellipse`, `text`, `g`, `polyline`, `polygon`) now show an "SVG Attributes" property group with all relevant attributes (stroke-width, r, fill, stroke, stroke-dasharray, viewBox, etc.). Attributes are editable inline with `setAttribute()`. Visual flash zones highlight stroke-width (blue), stroke/fill (matching color), dash patterns (amber dashed), and generic attrs (cyan).
- **SVG permitted value dropdowns** — `stroke-linecap`, `stroke-linejoin`, `text-anchor`, `dominant-baseline` show `<select>` dropdowns with valid SVG values.

### Fixed
- **Dropdown flash-on-click** — clicking a permitted-value `<select>` dropdown no longer re-triggers `startEdit()`, which was recreating the dropdown and causing it to flash on/off. Added re-entry guard checking for existing `select`/`input` inside the value element.

## [2.73.18] - 2026-04-09

### Added
- **Permitted value dropdowns** for enum CSS properties — `display`, `flexDirection`, `textAlign`, `alignItems`, `justifyContent`, `fontWeight`, `overflow`, `position` now show a `<select>` dropdown with valid options instead of a free-text input. Select commits on change.
- **Enhanced visual cue** — generic flashZone fallback now shows a bright blue outline with a computed-value label overlay. All property name clicks flash the element.
- **More editable properties** — added `overflow`, `position`, `top`, `left`, `boxShadow`, `fontFamily` to the editable set.

## [2.73.17] - 2026-04-08

### Added
- **Fixture data tree in property inspector** — when a component is selected, the inspector fetches its test fixture data from `/review/api/fixture` and renders it as an expandable tree. Shows columns, rows, segments, and all nested data with color swatches for hex values. Collapsible at every level.

## [2.73.16] - 2026-04-08

### Added
- **Gallery view** — `/review/gallery?cols=N` renders all queued components in a grid layout, proxied through Vite. Vue error boundaries isolate per-component failures so one broken component doesn't crash the gallery. Gallery button in review UI header toggles between single-component and gallery views.
- **Fixture unwrapping** — when a contract test fixture wraps props in an array (e.g., `{cards: [{value, label}]}`) but the component expects flat props, the first item is auto-unwrapped. Fixes StatCardWithIcon rendering blank in preview.

## [2.73.15] - 2026-04-08

### Added
- **Reviewer output logging** — review and fix outputs now saved to `build-logs/` as `{phase}-review-{id}-c{cycle}.log` and `{phase}-fix-{id}-c{cycle}.log`. Enables auditing whether reviewers actually ran Playwright, what issues were found, and what fixes were applied.

### Changed
- **Default parallelism now all-items** — per-item pipeline runs all items concurrently by default (was sequential). Bottleneck is API latency, not CPU/RAM. Use `--parallel N` to limit if needed.

## [2.73.14] - 2026-04-08

### Fixed (review UI — component preview rendering)
- **Preview HTML now proxied through Vite** for module resolution. Bare module specifiers (`'vue'`, `'react'`) are transformed by Vite into resolved paths. Previously served static HTML which caused `Failed to resolve module specifier "vue"` error.
- **Test fixture props extracted from design contracts** — reads `## Test Fixture` JSON block, strips metadata keys, passes as component props. Components now render with sample data.
- **Playwright-verified** — ChartDonut renders 5-segment donut with center value, sublabel, and percentage labels from contract fixture data.

## [2.73.12] - 2026-04-08

### Added (review UI — isolated component preview + tier tabs)
- **`/review/preview` endpoint** — mounts a single component in isolation via Vite module resolution. Framework-aware: auto-detects Vue/React/Svelte from package.json. Includes global styles and Vite HMR client. Components now render in the review iframe instead of showing a blank page.
- **Tier tabs** — Elements | Widgets | Pages tabs in the sidebar filter components by tier. Counts update as items are queued. All tab shows everything.
- **Framework detection** — review server reads project's package.json to determine mount strategy. Logs detected framework and global styles on startup.

## [2.73.11] - 2026-04-08

### Changed (reviewer — Playwright-first visual inspection)
- **Playwright is now the PRIMARY reviewer method** — every contract-specified visual property is verified via `getComputedStyle()` in a real browser. Code review demoted to supplement for non-visual concerns (props, events, accessibility). CSS box math (cascade, specificity, flex/grid computation, relative units) can only be verified at render time, not from source code.

## [2.73.10] - 2026-04-08

### Added (orchestrator — parallel execution)
- **`--parallel N` flag** — runs N build+review items concurrently via async `spawnClaudeAsync()` and `_runWithConcurrency()`. Default: 1 (sequential). Recommended: 3. Reduces 15-element pipeline from ~30min to ~10min at 3x parallelism.
- **`--clean` artifact cleanup expanded** — now clears `auto-review/`, `build-logs/`, `queue/`, `feedback/`, `review-complete.json`, `orchestrator-state.json` on fresh start (not just build output).

### Changed
- **Orchestrator `run()` is now async** — callers (`bin/gsd-t.js`, `bin/design-orchestrator.js`) updated with `.catch()` for proper error handling.

## [2.72.10] - 2026-04-08

### Added (orchestrator — per-item pipeline, stream-json, verbose, clean)
- **Per-item build+review pipeline** — when workflow provides `buildSingleItemPrompt` + `buildSingleItemReviewPrompt`, each component is built and reviewed individually (1 contract + 1 source per Claude spawn) instead of all-at-once. Fixes reviewer timeout caused by 30+ files in a single context. Each item gets up to 4 auto-review fix cycles independently.
- **`--output-format stream-json`** — Claude spawns now use streaming JSON output. On timeout, partial output is captured and parsed instead of returning empty string. Enables diagnosing what the reviewer was doing before being killed.
- **`--verbose` / `-v` flag** — streams Claude's stderr to terminal for real-time tool call visibility, saves prompts to `build-logs/` for post-mortem, logs completion stats after each spawn.
- **`--clean` flag** — deletes previous build output files before each phase's build step for fresh builds.
- **Version display** — orchestrator shows GSD-T version in startup header.

### Changed
- **Reviewer timeout increased** — 300s → 600s for all-at-once review mode (per-item uses 120s per component).
- **Design orchestrator** — added `buildSingleItemPrompt` and `buildSingleItemReviewPrompt` for per-item pipeline support. Reviewer prompt restructured: code review first, Playwright spot-check second.

## [2.71.21] - 2026-04-08

### Fixed (orchestrator — timeout false-pass, review server health, stale cleanup)
- **Reviewer timeout/kill no longer treated as "pass"** — exit codes 143 (SIGTERM) and 137 (SIGKILL) are now always detected as failures regardless of duration. Previously, a reviewer that timed out at 300s was parsed as "0 issues = pass" because crash detection only checked duration < 10s.
- **Empty output with non-zero exit also caught** — any reviewer that exits non-zero with no output is treated as a failure, not a clean pass.
- **Review server health check during human review gate** — every ~30s the polling loop verifies port 3456 is alive. If the review server dies, it auto-restarts. Previously, a dead review server left the orchestrator stuck forever.
- **Stale auto-review cleanup** — old auto-review files from previous runs are cleared at the start of each phase's review cycle, preventing misleading results from prior orchestrator runs.

## [2.71.20] - 2026-04-08

### Fixed (orchestrator — reviewer crash false-pass + Ctrl+C + build logging)
- **Reviewer crash no longer treated as "pass"** — if the reviewer exits with non-zero code in under 10s, it's a crash, not a clean review. Retried on next cycle. Previously, empty output from a crashed reviewer was parsed as "0 issues = pass."
- **Ctrl+C now works** — replaced `Atomics.wait` with `sleep` command for synchronous polling. `Atomics.wait` blocks the event loop completely, preventing SIGINT.
- **Build output logging** — builder output written to `.gsd-t/design-review/build-logs/{phase}-build.log` for debugging.

## [2.71.18] - 2026-04-08

### Fixed (orchestrator — Claude permissions and timeouts)
- **Added `--dangerously-skip-permissions` to Claude spawns** — builder, reviewer, and fixer Claude instances couldn't write files in non-interactive `-p` mode. They ran successfully but produced zero output files because permission prompts can't be answered in piped mode.
- **Increased fixer timeout from 2min to 10min** — fixer was getting SIGTERM'd (exit code 143) trying to create 15 components in 120s. Now uses the same timeout as the builder (default 600s).

## [2.71.17] - 2026-04-08

### Fixed (orchestrator — auto-review cycle limit)
- **Bumped maxAutoReviewCycles from 2 to 4** — 2 cycles was too conservative for complex components (e.g., charts with multiple contract properties). 4 cycles gives the reviewer/fixer loop enough iterations to converge.

## [2.71.16] - 2026-04-08

### Added (orchestrator — automated AI review loop)
- **Automated review before human review** — orchestrator now spawns an independent reviewer Claude (no builder context) that compares built components against design contracts. If issues found, spawns a fixer Claude, re-measures, and re-reviews (max 2 cycles). Only after automated review passes do items reach human review. This is the Term 2 equivalent, running deterministically in JavaScript.
- **Review report persistence** — each auto-review cycle writes results to `.gsd-t/design-review/auto-review/`. Unresolved issues are written to `{phase}-unresolved.json` for human visibility.
- **Structured review output** — reviewer uses `[REVIEW_ISSUES]` markers for reliable parsing. Fallback parser catches DEVIATION/FAIL/CRITICAL keywords.

### Pipeline (updated)
Build → Measure → **Automated AI Review** (reviewer → fixer → re-review loop) → Human Review → Next Tier

## [2.71.15] - 2026-04-08

### Changed (design-build command → orchestrator delegate)
- **`gsd-t-design-build.md` now delegates to the JS orchestrator** — the 388-line prompt-based command is replaced with a thin wrapper that runs `gsd-t design-build`. Both `/gsd-t-design-build` and `gsd-t design-build` now end up in the same deterministic pipeline. No more prompt-based gates that get skipped.

## [2.71.14] - 2026-04-08

### Added (design-build orchestrator)
- **Abstract workflow orchestrator** (`bin/orchestrator.js`) — base engine for deterministic multi-phase pipelines. Handles Claude spawning, review queue management, ironclad JS polling gates, state persistence/resume, server lifecycle, and cleanup. Workflow definitions plug in via a simple interface (phases, prompts, measurement, feedback). Zero external dependencies.
- **Design-build workflow** (`bin/design-orchestrator.js`) — first workflow implementation: elements → widgets → pages. Discovers contracts from `.gsd-t/contracts/design/`, builds per-tier Claude prompts, Playwright measurement, and review queue items. Plugs into the base orchestrator.
- **CLI subcommand** — `gsd-t design-build [--resume] [--tier] [--dev-port] [--review-port]` delegates to the orchestrator. Integrated into `bin/gsd-t.js` help and switch statement.
- **Resume capability** — orchestrator persists state to `orchestrator-state.json`, supports `--resume` to continue from where it left off after interruption.

### Why
Three separate attempts to enforce review gates via prompt instructions all failed — Claude Code agents optimize for task completion and skip any instruction to pause indefinitely. The orchestrator moves flow control out of prompts entirely into deterministic JavaScript.

## [2.71.13] - 2026-04-08

### Fixed (design-decompose — successor hint)
- **Next Up points to design-build** — `design-decompose` was recommending `partition` as the next step. The natural successor after decomposing contracts is `design-build` (which handles the tiered build with review gates), not `partition`. Updated the command's Step 9 hint and added `design-decompose → design-build` to the successor mapping table in CLAUDE-global template and live CLAUDE.md.

## [2.71.12] - 2026-04-08

### Changed (smart router — design-to-code pipeline)
- **Pipeline Routing** — Smart router now treats design-to-code requests as a multi-step pipeline (clean → decompose → build) instead of picking a single command. When a user says "rebuild from this Figma" or "start from scratch with this design," the router evaluates pipeline entry point based on current state and auto-advances through subsequent steps.
- **Entry Point Detection** — "start over" / "from scratch" / "clean slate" enters at clean step (removes UI assets, then decompose, then build). Missing design contracts enters at decompose. Existing contracts enters at build.
- **Inline Cleanup** — Clean step removes UI component files while preserving non-UI files (API, stores, router config, project scaffold). No separate `quick` command needed.
- **Design Command Slugs** — Added `design-decompose`, `design-build`, `design-audit`, `design-review` to valid router command slugs.

### Why
User gave the router a single prompt asking to delete old assets and rebuild from a Figma design. The router could only pick one command, so it had to choose between `quick` (cleanup) and `design-decompose` (contracts). The natural workflow is a pipeline that the router should execute end-to-end.

## [2.71.11] - 2026-04-08

### Fixed (design-build — review gates and measurement)
- **Explicit Blocking Review Gates** — Steps 5 (widgets) and 6 (pages) now include their own inline bash polling loops instead of cross-referencing Step 3. The subagent was treating "Wait for human review (Step 3)" as an informational note and skipping the gate entirely, building all three tiers without ever showing the review UI.
- **Concrete Widget Measurement** — Step 5 now has full Playwright `page.evaluate()` code for measuring grid columns, gap, children-per-row, padding, and child positioning. Previously was a single vague line ("Playwright measure the assembled widget").
- **Concrete Page Measurement** — Step 6 now has explicit Playwright code for grid column count verification, section ordering, widget width ratios, spacing, and responsive breakpoints. Grid column mismatch (e.g., 4-across instead of 2-across) is flagged as `severity: "critical"`.
- **Auto-Rejection for Grid Failures** — Review server now auto-rejects items with `grid-template-columns`, `gridTemplateColumns`, `columns-per-row`, or `children-per-row` measurement failures as critical (same as chart type mismatches).

### Why
User ran `design-build` and the builder completed all three tiers (elements → widgets → pages) without ever displaying the review panel. The review gate in Steps 5/6 used parenthetical cross-references that the subagent ignored. Additionally, the page rendered 4-across when the contract specified 2-across — the measurement step had no concrete code to catch this.

## [2.70.15] - 2026-04-06

### Changed (design pipeline — decompose verification)
- **Separate Verification Agent** — `gsd-t-design-decompose` Step 6.5 now spawns a dedicated opus-model verification subagent instead of self-verifying chart classifications. The decompose agent cannot verify its own work — sunk cost bias causes it to rubber-stamp its classifications. The separate agent has fresh context and its sole incentive is finding mismatches.
- **BAR CHART ORIENTATION PROOF** — mechanical decision tree injected into the verification agent prompt: rectangles in a ROW → HORIZONTAL, rectangles BOTTOM-TO-TOP → VERTICAL. Eliminates the #1 misclassification (horizontal percentage bars classified as vertical grouped).
- **Max 2 fix cycles** — if the verifier finds mismatches, contracts are corrected and re-verified (up to 2 cycles). Persistent failures block decompose completion.

### Why
v2.70.14 ensured "build follows contracts" but the contracts themselves were wrong. The decompose command's Step 6.5 asked the same agent to verify its own chart type classifications — it always passed itself. Three charts (`Number of Tools`, `Time on Page`, `Number of Visits`) were classified as `bar-vertical-grouped` when the Figma shows `bar-stacked-horizontal-percentage`. A separate verification agent with no sunk cost catches these mismatches before contracts are finalized.

## [2.70.14] - 2026-04-06

### Changed (design pipeline — hierarchical execution)
- **Hierarchical Build Order** — `gsd-t-plan` now detects `.gsd-t/contracts/design/INDEX.md` and auto-generates tasks in strict element → widget → page order (Wave 1/2/3). Each element gets its own focused task with only its element contract. Each widget task imports already-built elements. Each page task imports already-built widgets. ONE CONTRACT = ONE TASK.
- **No Inline Rebuild Rule** — added to `gsd-t-execute`, `gsd-t-quick`, and `design-to-code.md` stack rules. Widget tasks that rebuild element functionality inline (instead of importing the built element component) are a TASK FAILURE. Same for page tasks rebuilding widgets. The hierarchy exists to prevent this.
- **Contract Is Authoritative** — when the element contract and Figma screenshot disagree, the contract wins. The contract was written from careful design analysis; screenshots are ambiguous at small sizes.
- **Per-Wave Design Verification Checkpoints** — `gsd-t-execute` now runs design-specific checks at each wave boundary: element contracts after Wave 1, widget assembly after Wave 2, full Figma comparison after Wave 3.
- **Design Hierarchy Build Rule in subagent prompt** — task subagents now receive explicit instructions for element/widget/page tasks: what to import, what NOT to rebuild, and that contracts are authoritative over screenshots.
- **Hierarchical Audit Mode** — `gsd-t-design-audit` now detects hierarchical design contracts and audits bottom-up: Level 1 (element chart types), Level 2 (widget assembly — imports vs inline rebuilds), Level 3 (page composition). Pinpoints exactly where a deviation originates instead of flat page-level comparison.

### Why
The decomposition (gsd-t-design-decompose) creates a perfect hierarchy — 27 elements → 10 widgets → 1 page. But the plan and execute phases didn't follow it. The planner created monolithic "build the page" tasks, and the builder wrote 700-line inline pages ignoring contracts and existing components. All recent enhancements (v2.70.10-12) targeted post-build verification — catching errors after they were made. This change moves enforcement to the build phase: build each element individually (the subagent can't confuse chart types when it only sees one element contract), verify it, then compose. Inside-out execution matches the decomposition structure.

## [2.70.13] - 2026-04-06

### Changed (gsd-t-init, gsd-t-init-scan-setup)
- **Auto-create project directory + GitHub repo** — both `gsd-t-init` and `gsd-t-init-scan-setup` now create the project directory under a configurable base path and auto-create a private GitHub repo via `gh` CLI when a project name is provided as an argument.
- **Configurable base directory** — `~/.claude/.gsd-t-config` stores `projects_dir` (e.g., `/Users/david/projects`). Set once, never asked again. New projects are created at `{projects_dir}/{project-name}`.
- **Configurable GitHub org** — `~/.claude/.gsd-t-config` stores `github_org` (e.g., `Tekyz-Inc`). When set, repos are created under the org (`gh repo create {org}/{name}`). When not set, repos are created under the user's personal account.
- Existing project detection: if the current directory already has code/config files, Step 0 is skipped entirely — no behavior change for existing projects.

## [2.70.12] - 2026-04-06

### Added (design pipeline — element count reconciliation)
- **Element Count Reconciliation** — new mandatory verification step that runs BEFORE any property or visual comparison. Counts widgets and elements from the Figma decomposition (stored in INDEX.md), counts the built page's widgets and elements via Playwright, and compares. Any mismatch (missing or extra widgets/elements) is a CRITICAL deviation. Added to: `gsd-t-execute` (Step 0 inside Design Verification Agent), `gsd-t-quick` (Step 0), `gsd-t-design-audit` (Step 1.5).
- **Figma Element Counts table in INDEX.md** — `gsd-t-design-decompose` now writes element/widget/page counts and a per-page element manifest to INDEX.md as the verification anchor. The verification agent reads these counts as ground truth.
- **5-layer verification model** — design-to-code.md now documents Targets 0-4 in execution order: count reconciliation → contract comparison → Figma comparison → SVG overlay → DOM box model inspection.

### Why
A missing widget is the most catastrophic deviation but the easiest to miss in a 30+ row comparison table. The agent compares what exists but doesn't notice what's absent. An explicit count gate catches "Figma has 10 widgets, built page has 9 — WHERE IS THE 10TH?" before any property-level work begins.

## [2.70.11] - 2026-04-06

### Added (design pipeline — DOM box model inspection + layout arithmetic)
- **DOM Box Model Inspection** — new mandatory verification step for fixed-height containers. Uses Playwright to evaluate `offsetHeight` vs `scrollHeight` for each child element. Flags elements where `offsetHeight > scrollHeight * 1.5` as INFLATED (symptom: `flex: 1` on a content element inflating its box beyond content size). Added to: `gsd-t-execute` (Step 5.5 inside Design Verification Agent), `gsd-t-quick` (step 8 inside Design Verification Agent), `gsd-t-design-audit` (Step 3.75).
- **Internal Layout Arithmetic** — widget contract template now requires computed height budgets for fixed-height cards: `card_height - padding - header = body_available`, then `child1 + gap1 + child2 + ... = total_content ≤ body_available`. Forces the agent to write the math before coding — prevents `gap: 12px` when only `gap: 8px` fits.
- **Flex Centering Anti-Pattern Rule** — `design-to-code.md` Section 8 now explicitly prohibits `flex: 1` on content elements (KPI, labels, text) for centering. Rule: `flex: 1` belongs on containers, `justify-content: center` on the parent. Children keep natural size.
- **4 new verification checklist items** in `design-to-code.md` and `widget-contract.md`: box model inspection, layout arithmetic, no content flex:1, inflated element detection.

### Why
BDS horizontal stacked bar cards required 5 user-prompted fix iterations to get spacing right. Root cause: agent used `flex: 1` on `.kpi` to center it vertically, which inflated the element to 144px (content was 40px), displacing the chart section. The property comparison table and SVG overlay both missed this because the *positions* were close enough — the problem was *how space was distributed*, not where elements landed. DOM box model inspection catches the cause (inflated element) not just the symptom (displaced sibling).

## [2.70.10] - 2026-04-06

### Added (design pipeline — 2 new capabilities)
- **Design System Detection** — all design pipeline commands now ask for a design system / component library URL upfront before extraction or implementation. If provided, the agent fetches the library docs, catalogs available components, and maps design elements to library primitives (use library components instead of building custom). Added to: `gsd-t-design-decompose` (Step 0.4), `gsd-t-design-audit` (Step 0), `design-to-code.md` (new Section 1 — all subsequent sections renumbered). Verification checklist updated with 2 new items.
- **SVG Structural Overlay Comparison** — new mandatory verification layer that exports the Figma frame as SVG, parses element positions/dimensions/colors from the SVG DOM, maps to built DOM bounding boxes, and compares geometry mechanically (≤2px = MATCH, 3-5px = REVIEW, >5px = DEVIATION). Catches aggregate spacing drift, alignment issues, and proportion errors that pass property-level checks but are visually wrong. Added to: `gsd-t-execute` (Step 5 inside Design Verification Agent), `gsd-t-quick` (step 7 inside Design Verification Agent), `gsd-t-design-audit` (Step 3.5), `design-to-code.md` (Target 3 + workflow step 7 + checklist item).

### Why
- **Design system**: Building custom cards, tables, tabs, and buttons from scratch when a library like shadcn-vue already provides them wastes effort and produces inferior results (missing accessibility, focus states, interactive states). Asking upfront eliminates redundant work.
- **SVG overlay**: The property-level comparison table catches wrong values but misses aggregate visual drift — spacing rhythm, alignment, proportions that are individually correct but collectively off. SVG structural diff is mechanical and non-interpretive: geometry vs geometry, no agent reasoning required.

## [2.69.13] - 2026-04-05

### Fixed (design-to-code pipeline — extraction + verification)
- **Mandate `get_design_context` everywhere in the pipeline** — initial build (design-to-code.md sections 1-2), verification agent (gsd-t-execute.md Step 5.25), quick verification (gsd-t-quick.md Step 5.25), and Red Team design fidelity check all now explicitly require `get_design_context` per widget node for Figma data extraction. `get_screenshot` is prohibited for extraction and restricted to visual-only comparison of built output. This closes the gap where agents chose `get_screenshot` (pixels) over `get_design_context` (structured code/tokens) at every stage.

## [2.69.12] - 2026-04-05

### Fixed (gsd-t-design-audit, gsd-t-design-decompose)
- **Explicit `get_screenshot` prohibition** — agents were choosing `get_screenshot` (returns pixels) instead of `get_design_context` (returns structured code/tokens) for per-widget Figma extraction, defeating structured comparison. Both commands now have explicit tool guards: "NEVER use `get_screenshot` for Figma design extraction." `get_screenshot` is only acceptable for capturing the built page, not for extracting Figma source data.

## [2.69.11] - 2026-04-05

### Changed (gsd-t-design-audit)
- **Auto-fix prompt** — after audit completes, if CRITICAL/HIGH deviations found, automatically prompts `/gsd-t-quick` with the audit report as source of truth. Re-runs audit after fixes to verify. Up to 2 fix cycles before stopping.

## [2.69.10] - 2026-04-05

### Added
- **`/gsd-t-design-audit` command** — compare a built screen against a Figma design. Node-level Figma decomposition, per-widget comparison tables (10-30+ rows each), severity-rated deviations (CRITICAL/HIGH/MEDIUM/LOW), fidelity percentage. Writes zero code — report only. Usage: `/gsd-t-design-audit {Figma URL} {route}`.

## [2.68.13] - 2026-04-05

### Added (element-contract template)
- **Chart-type-specific mandatory Visual Spec properties** — bar charts must now specify: `bar_width`, `bar_gap`, `bar_group_gap`, `corner_radius`, `label_position`, `label_min_width`, `segment_order`, `orientation`. Circular charts: `outer_diameter`, `inner_diameter`, `segment_order`, `start_angle`, `label_position`, `center_content`. Line/area: `stroke_width`, `point_radius`, `curve_type`, `fill_opacity`. Progress/gauge: `track_width`, `fill_width`, `track_color`. These are the exact properties that distinguish "matches the design" from "looks close."

### Why
BDS comparison showed bars with wrong width, wrong gap between groups, labels positioned outside instead of inside, wrong segment stacking order. The element contract's Visual Spec was free-form (`{dimension_1}`) — the agent could skip bar_width, segment_order, and label_position entirely. Chart-type-specific mandatory fields close this gap.

## [2.68.12] - 2026-04-05

### Fixed (design-chart-taxonomy template)
- **Lists section, naming grammar, and formalized extension workflow** now ship in the package source template (previously only existed in local `~/.claude/templates/` copy from v2.67.10 — `update-all` overwrote it). Package template and installed template are now in sync.

## [2.68.11] - 2026-04-05

### Changed (widget-contract template)
- **Alignment column in Card Chrome Slots** — every slot now requires explicit alignment (left/center/right) extracted from Figma. Incorrect legend alignment was the #2 cause of "looks off" results.
- **Internal Element Layout section (MANDATORY)** — new section replacing the flat layout table. Documents: body_layout (flex-row/column/grid), body_justify, body_align, body_gap, chart_width/height, legend_width, footer_legend_justify, header_to_body_gap, body_to_footer_gap. These are the exact values that control spacing and sizing of elements within a widget card.
- **Verification checklist expanded** — now checks: chrome alignment, internal layout, inter-element spacing, element sizing, legend alignment, card container values (6 new items).

### Why
BDS Analytics comparison revealed consistent intra-widget layout errors: legends left-aligned instead of centered, inconsistent spacing between chart and legend, wrong element sizing within cards. The widget contract template had a Layout section but it specified only container-level properties (padding, border, gap) — not how elements were sized, spaced, and aligned WITHIN the card body. These new fields close that gap.

## [2.68.10] - 2026-04-05

### Changed (gsd-t-design-decompose)
- **Node-level Figma decomposition (MANDATORY)** — Step 1 now requires `get_metadata` to map page tree, then `get_design_context` on EACH widget node individually. No more classifying from page screenshots alone. Extracted text content (titles, subtitles, column headers, legend items) becomes mandatory data inventory column.
- **Classification reasoning (MANDATORY)** — Step 2 now requires written decision-tree walkthrough for every chart element: "I see [description]. Decision tree: [walkthrough]. Classification: [entry]. Confidence: [HIGH/MEDIUM/LOW]". Low/medium confidence entries flagged for human review.
- **Human contract review checkpoint** — Step 5 now presents classification reasoning table + data inventory alongside decomposition summary. User reviews chart type assignments and text content before contracts are written. 5-minute gate that catches misclassification before it propagates.
- **Contract-vs-Figma verification gate (MANDATORY)** — New Step 6.5 re-reads each Figma node after contracts are written and produces a mismatch report. Catches: wrong chart types, hallucinated column headers, missing elements, invented data models. Mismatches must be fixed before proceeding to build.

### Changed (design-to-code stack rule)
- **Visual verification against FIGMA, not just contracts** — Section 15 now requires the Design Verification Agent to compare the built screen against the original Figma screenshot (Target 2), not just against design contracts (Target 1). This closes the gap where wrong contracts produce wrong code that still scores 50/50 against itself.

### Why
Post-validation comparison of the built BDS Analytics screen against the original Figma design revealed: wrong chart types (donuts instead of stacked bars in Member Segmentation), hallucinated column headers (Video Playlist), invented data models (Tool Engagement). All scored 50/50 against their contracts — because the contracts were wrong. The contracts→code pipeline is airtight; the Figma→contracts pipeline was unverified. These changes close that gap at four layers: node-level extraction, classification reasoning, human review, and contract-vs-Figma gate.

## [2.67.10] - 2026-04-05

### Added (design-chart-taxonomy)
- **Lists section** — new category between Tables and Controls: `list-simple-vertical`, `list-icon-vertical`, `list-avatar-vertical`, `list-thumbnail-vertical`. Includes decision rule: columns across rows = table; self-contained rows = list.
- **Table-vs-list decision rule** in Tables section — prevents catastrophic misclassification (jamming list-style repeating items into `table-*` entries).
- **Naming grammar** — documents the `{category}-{variant}-{orientation}` pattern with common modifiers. Prevents ad-hoc name invention.
- **Formalized extension workflow** — proposal-first process with: section placement, sibling-diff rationale, catastrophic-misclassification argument, companion-entries-flagged field. Replaces the terse 4-step extension guide.

### Milestone
- **Extensibility VALIDATED** — task-012 forced the taxonomy-extension workflow (picked `list-thumbnail-vertical`, not previously in taxonomy). Proposal-first process worked cleanly; `$ref` composition chain unaffected by new entries. 12 consecutive 50/50 scores across element/widget/page/scale/extensibility tiers.

## [2.66.10] - 2026-04-05

### Changed (page-contract template)
- **Composes Elements (direct)** split into two sub-lists: "Existing element contracts used directly" vs "Inline stubs (promotion candidates)". Closes gap P8 from page-tier run 3.
- **Route guards stub convention** — if a guard is declared but not yet wired, prefix with `(stub)` and link the milestone that will wire it. Closes gap P9.
- **Skip link `tabindex="-1"` note** — `<main>` must be programmatically focusable for skip-link navigation. Closes gap P10.

### Milestone
- **Hierarchical contract system CONVERGED** — 3×3 matrix complete: element/widget/page tiers × 3 convergence runs each × 50/50 score. 11 of 14 gaps resolved across v2.59.10–v2.66.10; remaining 3 are widget-template refinements, non-blocking.

## [2.65.10] - 2026-04-05

### Changed (page-contract template)
- **Boundary grep regex tightened** — line-anchored (`^\s*`) + requires opening `{` — avoids false positives on JS identifiers like `donutProps` or property access `obj.donut`. Only matches actual CSS rules. Closes gap P5 from page-tier run 2.

### Added (page-contract template)
- **Multi-state Page Fixture convention** — for pages whose state swaps widget data, declare one full fixture per state under `__states__` keys, referencing named widget sub-fixtures (`#/fixture-sessions`). Prefer full duplication over override deltas. Closes gap P6.
- **Inline-stub promotion guidance** — if a page-scope control is used in ≥2 pages, promote to its own widget contract; until then list in Composes Elements (direct) with `(promotion candidate)` tag. Closes gap P7.

## [2.64.10] - 2026-04-05

### Added (page-contract template)
- **Page Fixture (OPTIONAL)** section — formalizes the composition chain (element → widget → page) by referencing each widget's fixture via `$ref:{widget-name}#/fixture`. Closes gap P2 from page-tier convergence run 1.
- **Boundary Rules (MANDATORY)** section — explicit rules on what a page may vs may not do (pass data through widget props = OK; declare CSS for widget internal classes = VIOLATION). Adds a grep-based enforcement check. Closes gap P3.
- **Grid position format** clarification — use `grid[row=N, col=M]` OR named CSS grid areas, consistently within one page. Closes gap P4.

### Changed
- **Widgets Used** table: renamed "Notes" column → "Layout Notes" with positioning-only guidance (spans/stacking/sticky — NOT widget configuration). Closes gap P1.

## [2.63.10] - 2026-04-05

### Added
- **Taxonomy filename rule** in `gsd-t-design-decompose.md` Step 0: element contract filenames MUST match the closed-set taxonomy name exactly (`chart-bar-vertical-single.contract.md`, not `bar-vertical-single.contract.md`). Closes widget-tier gap W5 — shortened aliases create taxonomy drift and break link-integrity. Prefer renaming legacy contracts over creating parallel files.

## [2.62.10] - 2026-04-05

### Added
- **Widget-contract Test Fixture section (MANDATORY)** — `templates/widget-contract.md` now requires a `## Test Fixture` section at widget scope, with the same `__fixture_source__` / `__figma_template__` requirements as element contracts. Widget fixtures reference element sub-fixtures via `$ref:{element-name}#/fixture` rather than re-inlining element values — enforces the widget↔element boundary in the fixture layer. Closes gap W4 from widget-tier convergence run 1. Also adds a widget-level Verification Harness subsection.
- **Widget fixture boundary rule**: widget fixture fields MUST NOT duplicate element visual-spec fields (colors, font sizes, padding, radii) — those live in the element contract. A field name matching an element slot (segments, centerValue, xLabels) belongs in the element fixture.

## [2.61.10] - 2026-04-05

### Added
- **Circular charts `-percentage` clarification** — `design-chart-taxonomy.md` now explicitly states that `chart-pie` and `chart-donut` do NOT take a `-percentage` suffix, because circular charts are inherently part-to-whole (circle = 100%). Whether segment labels show percentages or absolute values is a labelling choice recorded in the Test Fixture, not a distinct element. Prevents agents from inventing `chart-donut-percentage` when it doesn't exist in the closed set. Closes gap A from convergence run 2.
- **Figma MCP size guard** in `gsd-t-design-decompose.md` Step 1: call `get_metadata` first to map the tree, then `get_design_context` only on leaf nodes (< 100KB). Avoids the 250KB+ tool-results file dump when called on full-page frames. Closes gap #3 from convergence runs 1 and 2.

## [2.60.10] - 2026-04-05

### Added
- **Shared Templates installer** — `installSharedTemplates()` in `bin/gsd-t.js` copies design-chart-taxonomy.md, element-contract.md, widget-contract.md, page-contract.md, design-contract.md, and shared-services-contract.md into `~/.claude/templates/` on install/update. Fresh-context workers (including Terminal 2 subprocesses) can now reference these at a predictable path instead of hunting through npx caches. Closes framework gap #1 surfaced by v2.59.10 convergence run 1.

### Changed
- **Element template `Test Fixture`** now documents a **Fixture Resolution Order** for Figma designs that use template tokens like `{num}%`: (1) concrete Figma text, (2) existing flat contract, (3) requirements sample data, (4) engineered stub matching visible proportions. Adds mandatory `__fixture_source__` and `__figma_template__` fields so verifiers distinguish extracted-from-design vs engineered-to-match-visual. Closes gap #4.
- **Element template** adds a **Verification Harness** subsection clarifying what card chrome / controls to include vs strip when rendering the element on `/design-system/{name}`. Closes gap #5 ("element-only, no widget chrome" ambiguity).

## [2.59.10] - 2026-04-05

### Added
- **Chart & Atom Taxonomy** — `templates/design-chart-taxonomy.md` — closed enumeration of ~70 valid element names across charts, axes, legends, cards, tables, controls, atoms (icons/badges/chips/dividers), typography, and layout primitives. Fixes catastrophic failure mode where agents invented element names and picked wrong chart variants (e.g., `chart-bar-grouped-vertical` when design was `chart-bar-stacked-horizontal-percentage`). `gsd-t-design-decompose` now REQUIRES element names to come from this closed set.
- **Visual distinguisher decision rules** per chart category (stacked vs grouped vs percentage, pie vs donut vs gauge, line vs area, categorical vs histogram) to prevent near-match pattern-matching.
- **Atoms taxonomy** — icons, badges, chips, dividers, avatars, status-dots, spinners, tooltips, breadcrumbs, pagination, tags — the most-forgotten element tier.

### Changed
- **Element template**: `Test Fixture` section is now MANDATORY with the EXACT labels/values/percentages extracted from the design source. Placeholder data (Calculator/Planner/Tracker instead of real labels) is FORBIDDEN. Verifier compares labels verbatim.
- **Widget template**: adds mandatory **Card Chrome Slots** section (title, subtitle, header_right_control, kpi_header, body, body_sidebar, footer, footer_legend) — each must be filled or explicitly marked N/A. Fixes the "missing subtitle, missing per-card filter dropdown, missing KPI-above-chart" defect.
- **Design Verification Agent** (gsd-t-execute Step 5.25 + gsd-t-quick Step 5.25): adds mandatory **Step 0 — Data-Labels Cross-Check** that runs BEFORE visual comparison. Verifies every label/value/percentage from the Test Fixture appears verbatim in the rendered UI. Wrong data = CRITICAL deviation, no visual polish can redeem it.
- **gsd-t-design-decompose**: MUST ingest existing flat `design-contract.md` when present (especially the `## Verification Status` section from prior verified builds) as ground truth for Test Fixture data — no re-inventing labels.

## [2.58.10] - 2026-04-05

### Added
- **Hierarchical design contracts** — `element` → `widget` → `page` contract hierarchy for design-to-code projects. Element contracts are the single source of truth for visual spec (one contract per visual variant, e.g., `chart-bar-stacked-horizontal` and `chart-bar-stacked-vertical` are separate). Widgets compose elements with layout + data binding. Pages compose widgets with routing + grid layout.
- **Precedence rule**: element > widget > page. Widgets and pages SELECT and POSITION elements but cannot override element visual spec. Structural drift becomes impossible.
- **New templates**: `templates/element-contract.md`, `templates/widget-contract.md`, `templates/page-contract.md`
- **New command**: `/gsd-t-design-decompose` — surveys a design (Figma/image/prototype), classifies elements (reuse count ≥2 or non-trivial spec → promoted to element contract), identifies widgets and pages, writes the full contract hierarchy under `.gsd-t/contracts/design/{elements,widgets,pages}/` plus an `INDEX.md` navigation map.

### Changed
- `design-to-code.md` stack rule adds Section 0 explaining flat vs. hierarchical contract modes and detection at execute-time (presence of `.gsd-t/contracts/design/` triggers hierarchical verification: elements first, then widgets, then pages)
- Command count: 48 GSD-T + 5 utility = 53 total

## [2.57.10] - 2026-04-04

### Added
- **Design Verification Agent** — dedicated subagent (Step 5.25) spawned after QA and before Red Team when `.gsd-t/contracts/design-contract.md` exists. Opens a browser with both the built frontend AND the original design (Figma/image) side-by-side for direct visual comparison. Produces a 30+ row structured comparison table with MATCH/DEVIATION verdicts. Artifact gate enforces completion — missing table triggers re-spawn.
- Wired into `gsd-t-execute` (Step 5.25) and `gsd-t-quick` (Step 5.25)

### Changed
- **Separation of concerns**: Coding agents no longer perform visual verification inline (removed 45-line Step 7 from task subagent prompt). Coding agents write precise code from design tokens; the verification agent proves it matches.
- `design-to-code.md` Section 15 slimmed from 120 lines to 20 lines — now points to the dedicated agent instead of embedding the full verification loop in the stack rule
- `CLAUDE-global.md` updated with Design Verification Agent section between QA and Red Team
- Red Team now runs after Design Verification (previously ran directly after QA)
- Non-design projects are completely unaffected (gate checks for design-contract.md existence)

## [2.52.11] - 2026-04-01

### Added
- **M32: Quality Culture & Design** milestone planning — 3 new domains (design-brief, evaluator-interactivity, quality-persona) with scope and task definitions
- **CI examples** — GitHub Actions and GitLab CI pipeline templates in `docs/ci-examples/`
- **Framework comparison scorecard** — `docs/framework-comparison-scorecard.md`

### Changed
- `.gitignore` updated to exclude Windows `desktop.ini` artifacts, temp files (`.tmp.driveupload/`, `.gsd-t/dashboard.pid`), and generated PDFs
- Fixed package.json version drift (was 2.51.10, should have been 2.52.10 after M31)

### Removed
- `.claude/settings.local.json` — no longer tracked (managed locally)

## [2.51.10] - 2026-03-25

### Added
- **Red Team — Adversarial QA agent** added to `execute`, `quick`, `integrate`, and `debug` commands. Spawns after the builder's tests pass with inverted incentives — success is measured by bugs found, not tests passed.
- **Exhaustive attack categories**: contract violations, boundary inputs, state transitions, error paths, missing flows, regression, E2E functional gaps, cross-domain boundaries (integrate only), fix regression variants (debug only).
- **False positive penalty**: reporting non-bugs destroys credibility, preventing phantom bug inflation.
- **VERDICT system**: `FAIL` (bugs found — blocks phase completion) or `GRUDGING PASS` (exhaustive search, nothing found — must prove thoroughness).
- **Red Team report**: findings written to `.gsd-t/red-team-report.md`; bugs appended to `.gsd-t/qa-issues.md`.
- Red Team documented in CLAUDE-global template, global CLAUDE.md, GSD-T-README wave diagram, README command table.

## [2.50.12] - 2026-03-25

### Added
- **23 new stack rule files** — python, flutter, tailwind, react-native, vite, nextjs, vue, docker, postgresql (with graph-in-SQL section), github-actions, rest-api, supabase, firebase, graphql, zustand, redux, neo4j, playwright, fastapi, llm (with RAG patterns section), prisma, queues, _auth (universal). Total: 27 stack rules (was 4).
- **`_auth.md`** (universal) — email-first registration, auth provider abstraction (Cognito/Firebase/Google), token management, password policy, session management, social auth/OAuth, email verification, MFA, authorization/RBAC, auth security, auth UI patterns.
- **`fastapi.md`** — dependency injection, Pydantic request/response models, lifespan events, BackgroundTasks, async patterns, auto-generated OpenAPI docs.
- **`llm.md`** — provider-agnostic LLM patterns: structured outputs, streaming, error/retry, token management, conversation state, tool/function calling, RAG patterns (chunking, embeddings, retrieval), prompt management, testing, cost/observability.
- **`prisma.md`** — schema modeling, migrations, typed client usage, relation queries, transactions, seeding, N+1 prevention.
- **`queues.md`** — BullMQ/Bull, SQS, RabbitMQ, Celery patterns: idempotent handlers, dead letter queues, retry/backoff, job deduplication, graceful shutdown.
- **Playwright best practices** — coverage matrix per feature, pairwise combinatorial testing, state transition testing, multi-step workflow testing, Page Object Model, API mocking patterns. Enforces rigorous test depth across permutations.
- **react.md expanded** — added state management decision table, form management (react-hook-form + zod), React naming conventions (3 new sections from external best practices review).
- **Project-level stack overrides** — `.gsd-t/stacks/` directory for per-project customization of global stack rules. Local files replace global files of the same name.

### Changed
- Stack detection in execute, quick, and debug commands updated to cover all 27 stack files with conditional detection per project dependencies.
- Detection refactored from one-liner to structured bash with `_sf()` (local override resolver) and `_add()` helper functions.
- PostgreSQL graph-in-SQL patterns (adjacency lists, junction tables, recursive CTEs) added to postgresql.md based on real project analysis.
- GSD-T-README.md stack detection table expanded to list all 27 files with their detection triggers.

## [2.46.11] - 2026-03-24

### Added
- **M28: Doc-Ripple Subagent** — automated document ripple enforcement agent. Threshold check (7 FIRE/3 SKIP conditions), blast radius analysis, manifest generation, parallel document updates. New command: `gsd-t-doc-ripple`. 43 new tests. Wired into execute, integrate, quick, debug, wave.
- **Orchestrator context self-check** — execute and wave orchestrators now check their own context utilization after every domain/phase. If >= 70%, saves progress and stops to prevent session breaks.
- **Functional E2E test quality standard (REQ-050)** — Playwright specs must verify functional behavior, not just element existence. Shallow test audit added to qa, test-sync, verify, complete-milestone commands.
- **Document Ripple Completion Gate (REQ-051)** — structural rule preventing "done" reports until all downstream documents are updated.

### Changed
- Command count: 50 → 51 (added `gsd-t-doc-ripple`)
- Package description updated to include doc-ripple enforcement

## [2.39.12] - 2026-03-19

### Added
- **Graph auto-sync at command boundary** — every GSD-T command now checks index freshness automatically; both native JSON and CGC/Neo4j are re-indexed when files change (500ms TTL deduplication)
- **Neo4j setup guide** — `docs/neo4j-setup.md` with full instructions for Docker container, CGC install, project indexing, and scanning
- Backlog items #8 (Auto-Setup Graph Dependencies) and #9 (Provider Failure Warnings + Auto-Recovery)

### Fixed
- CGC sync uses `cgc index` CLI instead of broken `add_code_to_graph` MCP tool call (CGC 0.3.1 Windows bug workaround)
- CGC sync retries with `--force` on failure, warns user clearly instead of silently swallowing errors
- CGC sync sets `PYTHONIOENCODING=utf-8` to prevent crash on emoji/Unicode in source code on Windows

## [2.39.10] - 2026-03-19

### Added
- **M20: Graph Abstraction Layer + Native Indexer** — 6 new files (`graph-store`, `graph-parsers`, `graph-overlay`, `graph-indexer`, `graph-query`, `graph-cgc`), 3 CLI subcommands (`graph index/status/query`), 4 new contracts, 70 new tests. Self-indexed: 264 entities, 725 relationships.
- **M21: Graph-Powered Commands** — 21 commands now query code structure via graph instead of grep, with automatic fallback chain (CGC → native → grep)
- `/global-change` command for bulk file changes across all registered GSD-T projects (49th command)
- 3-tier model assignments (haiku/sonnet/opus) with mandatory model display before subagent spawns
- Graph vs grep comparison analysis (`scan/graph-vs-grep-comparison.md`)
- PRDs: `prd-graph-engine.md`, `prd-gsd2-hybrid.md`

### Fixed
- **TD-097 (CRITICAL)**: Command injection in `graph-query.js` — replaced `execSync` with `execFileSync` + input validation
- **TD-081/TD-082 (HIGH)**: Shell injection in `gsd-t-update-check.js` — added semver validation, `execFileSync`, `module.exports`
- **TD-083 (HIGH)**: Contract drift — added `session_start`/`session_end` to event writer, removed phantom `mcp` renderer
- **TD-071 (MEDIUM)**: Markdown injection in `stateSet()` — now strips `\r\n` from values
- **TD-084**: `execSync` in `scan-export.js` and `scan-renderer.js` replaced with `execFileSync`
- **TD-085**: Dashboard event loading now handles cross-midnight sessions
- **TD-087**: Command count corrected to 49 in CLI installer
- **TD-072**: Path traversal protection in `templateScope`/`templateTasks`
- **TD-073**: `execSync` in `preCommitCheck()` replaced with `execFileSync`
- **TD-074**: `findProjectRoot()` now returns `null` instead of cwd on failure
- **TD-092**: `scan-report.html` now written to `.gsd-t/` instead of project root
- **TD-099**: `graph-store.js` symlink protection added

### Changed
- 293/294 tests passing (1 pre-existing failure in `scan.test.js`)
- Total command count: 49 (45 GSD-T workflow + 4 utility)

## [2.33.12] - 2026-03-06

### Fixed
- **Dashboard graph now shows the current session** — heartbeat.js now emits `session_start`/`session_end` events (agent_id=session_id) so the session appears as a root node
- **Tool calls attributed to session** — PostToolUse events now carry session_id as agent_id fallback; all activity visible in single-agent sessions
- **Readable node labels** — sessions display as "Session · Mar 6 · abc1234" (blue-bordered); subagents show their type
- 3 new tests (178/178 passing); event-schema-contract.md updated with new event types

## [2.33.11] - 2026-03-05

### Added
- `.gitignore` excludes `.claude/worktrees/` (Claude Code internal) and `nul` (Windows artifact)
- `ai-evals-analysis.md`, `gsd-t-command-doc-matrix.csv` — development reference documents
- `scripts/gsd-t-dashboard-mockup.html` — interactive mockup from M15 brainstorm (historical reference)
- `.gsd-t/brainstorm-2026-02-18.md` — brainstorm notes from Feb 18 ideation session

## [2.33.10] - 2026-03-04

### Added
- **Milestone 15: Real-Time Agent Dashboard** — Zero-dependency live browser dashboard for GSD-T execution:
  - **`scripts/gsd-t-dashboard-server.js`** (141 lines): Node.js HTTP+SSE server (zero external deps). Watches `.gsd-t/events/*.jsonl`, streams up to 500 existing events on connect, tails for new events, keepalive every 15s. Runs detached with PID file. All functions exported for testability (23 unit tests in `test/dashboard-server.test.js`).
  - **`scripts/gsd-t-dashboard.html`** (194 lines): Browser dashboard using React 17 + React Flow v11.11.4 + Dagre via CDN (no build step, no npm deps). Dark theme. Renders agent hierarchy as directed graph from `parent_agent_id` relationships. Live event feed (max 200 events, outcome color-coded: green=success, red=failure, yellow=learning). Auto-reconnects on disconnect.
  - **`commands/gsd-t-visualize`**: 48th GSD-T command. Starts server via `--detach`, polls `/ping` up to 5s, opens browser cross-platform (win32/darwin/linux). Accepts `stop` argument. Includes Step 0 self-spawn with OBSERVABILITY LOGGING.
  - Both `gsd-t-dashboard-server.js` and `gsd-t-dashboard.html` automatically installed to `~/.claude/scripts/` during `npx @tekyzinc/gsd-t install/update`
  - 23 new tests in `test/dashboard-server.test.js` — total: 176/176 passing

### Changed
- Total command count: 47 → **48** (44 GSD-T workflow + 4 utility)

## [2.32.10] - 2026-03-04

### Added
- **Milestone 14: Execution Intelligence Layer** — Structured observability, learning, and reflection:
  - **`scripts/gsd-t-event-writer.js`**: New zero-dependency CLI + module.exports. Writes structured JSONL events to `.gsd-t/events/YYYY-MM-DD.jsonl`. Validates 8 event_type values and 5 outcome values. Symlink-safe. Resolves events dir from `GSD_T_PROJECT_DIR` or cwd. 26 new tests.
  - **Heartbeat enrichment**: `scripts/gsd-t-heartbeat.js` maps `SubagentStart`/`SubagentStop`/`PostToolUse` hook events to the events/ schema, appending them to daily JSONL files alongside existing heartbeat writes.
  - **Outcome-tagged Decision Log**: `execute`, `debug`, and `wave` now prefix all new Decision Log entries with `[success]`, `[failure]`, `[learning]`, or `[deferred]`.
  - **Pre-task experience retrieval (Reflexion pattern)**: `execute` and `debug` grep the Decision Log for `[failure]`/`[learning]` entries matching the current domain before spawning subagents. Relevant past failures prepended as `⚠️ Past Failures` block in subagent prompt.
  - **Phase transition events**: `wave` writes `phase_transition` event with outcome:success/failure at each phase boundary.
  - **Distillation step** (Step 2.5 in `complete-milestone`): Scans event stream for patterns seen ≥3 times, proposes CLAUDE.md / constraints.md rule additions, requires user confirmation before any write.
  - **`commands/gsd-t-reflect`** (134 lines, 47th command): On-demand retrospective from event stream. Generates `.gsd-t/retrospectives/YYYY-MM-DD-{milestone}.md` with What Worked / What Failed / Patterns Found / Proposed Memory Updates. Includes Step 0 self-spawn with OBSERVABILITY LOGGING.
  - `gsd-t-event-writer.js` installed to `~/.claude/scripts/` during install/update

### Changed
- Total command count: 46 → **47** (43 GSD-T workflow + 4 utility)

## [2.28.10] - 2026-02-18

### Added
- **Milestone 13: Tooling & UX** — Infrastructure and UX improvements:
  - **`scripts/gsd-t-tools.js`**: New zero-dependency Node.js CLI utility returning compact JSON. Subcommands: `state get/set` (read/write progress.md keys), `validate` (check required files), `parse progress --section` (extract named sections), `list domains|contracts`, `git pre-commit-check` (branch/status/last-commit), `template scope|tasks <domain>`
  - **`scripts/gsd-t-statusline.js`**: New statusline script for Claude Code. Reads GSD-T project state and optionally reads `CLAUDE_CONTEXT_TOKENS_USED`/`CLAUDE_CONTEXT_TOKENS_MAX` env vars to show a color-coded context usage bar (green→yellow→orange→red). Configure via `"statusLine": "node ~/.claude/scripts/gsd-t-statusline.js"` in `settings.json`
  - **`gsd-t-health`**: New slash command validating `.gsd-t/` project structure. Checks all required files, directories, version consistency, status validity, contract integrity, and domain integrity. `--repair` creates any missing files from templates. Reports HEALTHY / DEGRADED / BROKEN
  - **`gsd-t-pause`**: New slash command saving exact position to `.gsd-t/continue-here-{timestamp}.md` with milestone, phase, domain, task, last completed action, next action, and open items
  - Both scripts automatically installed to `~/.claude/scripts/` during `npx @tekyzinc/gsd-t install/update`

### Changed
- **`gsd-t-resume`**: Now reads the most recent `.gsd-t/continue-here-*.md` file (if present) as the primary resume point before falling back to `progress.md`. Deletes the continue-here file after consuming it
- **`gsd-t-plan`**: Wave Execution Groups added to `integration-points.md` format — groups tasks into parallel-safe waves with checkpoints between them. Wave rules: same-wave tasks share no files and have no dependencies; different-wave tasks depend on each other's output or modify shared files
- **`gsd-t-execute`**: Reads Wave Execution Groups from `integration-points.md` and executes wave-by-wave. Tasks within a wave are parallel-safe; checkpoints between waves verify contract compliance before proceeding. Team mode now spawns teammates only within the same wave
- **`gsd-t-health`** and **`gsd-t-pause`** added to all reference files (help, README, GSD-T-README, CLAUDE-global template, user CLAUDE.md)
- Total command count: 43 → **45** (41 GSD-T workflow + 4 utility)

## [2.27.10] - 2026-02-18

### Changed
- **Milestone 12: Planning Intelligence** — Three improvements to correctness across milestones:
  - **CONTEXT.md from discuss**: `gsd-t-discuss` now creates `.gsd-t/CONTEXT.md` with three sections — Locked Decisions (plan must implement exactly), Deferred Ideas (plan must NOT implement), and Claude's Discretion (free to decide). New Step 5 added to discuss; steps renumbered
  - **Plan fidelity enforcement**: `gsd-t-plan` reads CONTEXT.md and maps every Locked Decision to at least one task. Also produces a REQ-ID → domain/task traceability table in `docs/requirements.md`
  - **Plan validation checker**: A Task subagent validates the plan after creation — checks REQ coverage, Locked Decision mapping, task completeness, cross-domain dependencies, and contract existence. Max 3 fix iterations before stopping
  - **Requirements close-out in verify**: `gsd-t-verify` marks matched requirements as `complete` in the traceability table and reports orphaned requirements and unanchored tasks

## [2.26.10] - 2026-02-18

### Changed
- **Milestone 11: Execution Quality** — Three improvements to execution reliability:
  - **Deviation Rules**: `execute`, `quick`, and `debug` now include a 4-rule deviation protocol — auto-fix bugs (3-attempt limit), add minimum missing dependencies, fix blockers, and STOP for architectural changes. Failed attempts log to `.gsd-t/deferred-items.md`
  - **Atomic per-task commits**: `execute` now commits after each task using `feat({domain}/task-{N}): {description}` format instead of batching at phase end. Team mode instructions updated with the same requirement
  - **Wave spot-check**: Between-phase verification in `wave` now checks git log (commits present), filesystem (output files exist), and FAILED markers in progress.md — not just agent-reported status

## [2.25.10] - 2026-02-18

### Changed
- **Milestone 10: Token Efficiency** — QA overhead significantly reduced across all phases:
  - `partition` and `plan`: QA spawn removed (no code produced in these phases)
  - `test-sync`, `verify`, `complete-milestone`: contract testing and gap analysis performed inline (no QA teammate)
  - `execute`, `integrate`: QA now spawned via lightweight Task subagent instead of TeamCreate teammate
  - `quick`, `debug`: QA spawn removed; tests run inline in the existing Test & Verify step; both commands now self-spawn as Task subagents (Step 0) for fresh context windows
  - `scan`, `status`: wrap themselves as Task subagents for fresh context on each invocation
  - Global CLAUDE.md QA Mandatory section updated to reflect the new per-command QA method

## [2.24.10] - 2026-02-18

### Changed
- **Versioning scheme: patch numbers are always 2 digits**: Patch segment now starts at 10 (not 0) after any minor or major reset. Incrementing continues normally (10→11→12…). Semver validity is preserved — no leading zeros. `checkin.md` and `gsd-t-complete-milestone.md` updated with the new convention. `gsd-t-init` will initialize new projects at `0.1.10`

## [2.24.9] - 2026-02-18

### Changed
- **Default model**: Example settings.json updated from `claude-opus-4-6` to `claude-sonnet-4-6` (faster, lower token usage)

## [2.24.8] - 2026-02-18

### Fixed
- **CLAUDE.md update no longer overwrites user content**: Installer now uses marker-based merging (`<!-- GSD-T:START -->` / `<!-- GSD-T:END -->`). Updates only replace the GSD-T section between markers, preserving all user customizations. Existing installs without markers are auto-migrated. Backup still created for reference

## [2.24.7] - 2026-02-18

### Changed
- **Next Command Hint redesigned**: Replaced plain `Next →` text with GSD-style "Next Up" visual block — divider lines, `▶ Next Up` header, phase name with description, command in backticks, and alternatives section. Format designed to trigger Claude Code's prompt suggestion engine, making the next command appear as ghost text in the user's input field

## [2.24.6] - 2026-02-18

### Added
- **Auto-update on session start**: SessionStart hook now automatically installs new GSD-T versions when detected — runs `npm install -g` + `gsd-t update-all`. Falls back to manual instructions if auto-update fails
- **Changelog link in all version messages**: All three output modes (`[GSD-T AUTO-UPDATE]`, `[GSD-T UPDATE]`, `[GSD-T]`) now include the changelog URL
- **Update check installer**: `bin/gsd-t.js` now deploys the update check script and configures the SessionStart hook automatically during install, with auto-fix for incorrect matchers

### Fixed
- **SessionStart hook matcher**: Changed from `"startup"` to `""` (empty) to match all session types including compact/resumed sessions

## [2.24.5] - 2026-02-18

### Fixed
- **Dead code removed**: `PKG_EXAMPLES` constant in `bin/gsd-t.js` and dead imports (`writeTemplateFile`, `showStatusVersion`) in `test/cli-quality.test.js` (TD-057, TD-058)
- **summarize() case fallthrough**: Combined identical `Read`/`Edit`/`Write` cases using switch fallthrough, saving 4 lines (TD-056)
- **checkForUpdates() condition**: Simplified redundant `!cached && isStale` to `if (!cached) ... else if (stale)` (TD-061)
- **Notification title scrubbing**: Applied `scrubSecrets()` to `h.title` in heartbeat notification handler (TD-063)
- **SEC-N16 note corrected**: Updated informational note during scan #5 (TD-062)
- **Wave integrity check contract**: Updated `wave-phase-sequence.md` to match actual implementation — checks Status, Milestone name, Domains table (not version) (TD-064)
- **Duplicate format contract**: Deleted `file-format-contract.md` — `backlog-file-formats.md` is authoritative (TD-065)

### Added
- 9 new tests: 3 `readSettingsJson()` tests in `cli-quality.test.js`, 6 `shortPath()` tests in `security.test.js` (TD-059, TD-060)
- Total tests: 125 (was 116)

## [2.24.4] - 2026-02-18

### Fixed
- **progress.md status**: Now uses contract-recognized values (READY between milestones, not ACTIVE)
- **CLAUDE.md version**: Removed hardcoded version — references `package.json` directly to prevent recurring drift (TD-048)
- **CHANGELOG.md**: Added missing entries for v2.23.1 through v2.24.3 covering milestones 3-7 (TD-045)
- **Orphaned domains**: Deleted stale `cli-quality/` and `cmd-cleanup/` directories from previous milestones (TD-046)
- **Git line endings**: Applied `git add --renormalize .` to enforce LF across all tracked files (TD-049)
- **Notification scrubbing**: Applied `scrubSecrets()` to heartbeat notification messages (TD-052)

### Changed
- **Contracts synced**: `progress-file-format.md` enriched with milestone table + optional fields. `wave-phase-sequence.md` updated with integrity check (M7) and security considerations (M5). `command-interface-contract.md` renamed to `backlog-command-interface.md`. `integration-points.md` rewritten to reflect current state (TD-047, TD-053, TD-054, TD-055)
- **readSettingsJson()**: Extracted helper to deduplicate 3 `JSON.parse(readFileSync)` call sites in CLI (TD-050)
- **prepublishOnly**: Added `npm test` gate before `npm publish` (TD-051)
- **TD-029 (TOCTOU)**: Formally accepted as risk with 5-point rationale — single-threaded Node.js, user-owned dirs, Windows symlink requires admin

## [2.24.3] - 2026-02-19

### Changed
- **Command file cleanup**: 85 fractional step numbers renumbered to integers across 17 command files. Autonomy Behavior sections added to `gsd-t-discuss` and `gsd-t-impact`. QA agent hardened with file-path boundary constraints, multi-framework test detection, and Document Ripple section. Wave integrity check validates progress.md fields before starting. Structured 3-condition discuss-skip heuristic. Consistent "QA failure blocks" language across all 10 QA-spawning commands

### Fixed
- 8 tech debt items resolved: TD-030, TD-031, TD-036, TD-037, TD-038, TD-039, TD-040, TD-041

## [2.24.2] - 2026-02-19

### Changed
- **CLI quality improvement**: All 86 functions across `bin/gsd-t.js` (80) and `scripts/gsd-t-heartbeat.js` (6) are now <= 30 lines. 3 code duplication patterns resolved (`readProjectDeps`, `writeTemplateFile`, `readPyContent` extracted). `buildEvent()` refactored to handler map pattern. `checkForUpdates` inline JS extracted to `scripts/gsd-t-fetch-version.js`. `doUpdateAll` has per-project error isolation

### Added
- `.gitattributes` and `.editorconfig` for consistent file formatting
- 22 new tests in `test/cli-quality.test.js` (buildEvent, readProjectDeps, readPyContent, insertGuardSection, readUpdateCache, addHeartbeatHook)

### Fixed
- Heartbeat cleanup now only runs on SessionStart (not every event)
- 7 tech debt items resolved: TD-017, TD-021, TD-024, TD-025, TD-032, TD-033, TD-034

## [2.24.1] - 2026-02-18

### Added
- **Security hardening**: `scrubSecrets()` and `scrubUrl()` in heartbeat script scrub sensitive data (passwords, tokens, API keys, bearer tokens) before logging. 30 new security tests in `test/security.test.js`
- `hasSymlinkInPath()` validates parent directories for symlink attacks
- HTTP response accumulation bounded to 1MB in both fetch paths
- Security Considerations section in `gsd-t-wave.md` documenting `bypassPermissions` implications

### Fixed
- `npm-update-check.js` validates cache path within `~/.claude/` and checks for symlinks before writing
- 6 tech debt items resolved: TD-019, TD-020, TD-026, TD-027, TD-028, TD-035

## [2.24.0] - 2026-02-18

### Added
- **Testing foundation**: 64 automated tests in 2 test files (`test/helpers.test.js`: 27 tests, `test/filesystem.test.js`: 37 tests) using Node.js built-in test runner (`node --test`). Zero external test dependencies
- `module.exports` added to `bin/gsd-t.js` for 20 testable functions with `require.main` guard
- CLI subcommand tests (--version, help, status, doctor)
- Helper function tests (validateProjectName, applyTokens, normalizeEol, validateVersion, isNewerVersion)
- Filesystem tests (isSymlink, ensureDir, validateProjectPath, copyFile, hasPlaywright, hasSwagger, hasApi)
- Command listing tests (getCommandFiles, getGsdtCommands, getUtilityCommands with count validation)

### Fixed
- Tech debt item TD-003 (no test coverage) resolved

## [2.23.1] - 2026-02-18

### Fixed
- **Count fix**: All command count references updated to 43/39/4 across CLAUDE.md, README.md, package.json, and docs (TD-022)
- QA agent contract now includes test-sync phase with "During Test-Sync" section and updated output table (TD-042)
- Orphaned domain files from previous milestones archived to `.gsd-t/milestones/` (TD-043)

## [2.23.0] - 2026-02-17

### Changed
- **Wave orchestrator rewrite**: `gsd-t-wave` now spawns an independent agent for each phase instead of executing all phases inline. Each phase agent gets a fresh context window (~200K tokens), eliminating cross-phase context accumulation and preventing mid-wave compaction. The orchestrator stays lightweight (~30KB), reading only progress.md between phases. Phase sequence is unchanged — only the execution model changed. Estimated 75-85% reduction in peak context usage during waves

## [2.22.0] - 2026-02-17

### Added
- **gsd-t-qa**: New QA Agent command — dedicated teammate for test generation, execution, and gap reporting. Spawned automatically by 10 GSD-T phase commands
- **QA Agent spawn steps**: Added to partition (4.7), plan (4.7), execute (1.5 + team), verify (1.5 + team), complete-milestone (7.6), quick (2.5), debug (2.5), integrate (4.5), test-sync (1.5), wave (1.5)
- **Contract-to-test mapping rules**: API contracts → Playwright API tests, Schema contracts → constraint tests, Component contracts → E2E tests
- **QA Agent (Mandatory) section**: Added to global CLAUDE.md template — QA failure blocks phase completion

## [2.21.1] - 2026-02-18

### Fixed
- **PR #7 — Fix 12 scan items**: Security symlink validation gaps, contract/doc alignment, scope template hardening, heartbeat crash guard, progress template field ordering
- **PR #8 — Resolve final 4 scan items**: Function splitting in CLI (`doInit` helpers extracted), ownership validation for domain files, npm-update-check extracted to standalone script (`scripts/npm-update-check.js`)

## [2.21.0] - 2026-02-17

### Added
- **gsd-t-triage-and-merge**: New command to auto-review unmerged GitHub branches, score impact (auto-merge / review / skip), merge safe branches, and optionally version bump + publish. Publish gate respects autonomy level — auto in Level 3, prompted in Level 1-2. Sensitive file detection for commands, CLI, templates, and scripts

## [2.20.7] - 2026-02-17

### Added
- **Formal contracts**: 5 contract definitions for core GSD-T interfaces — backlog file formats, domain structure, pre-commit gate, progress.md format, and wave phase sequence. Formalizes existing conventions as machine-readable reference docs

## [2.20.6] - 2026-02-16

### Fixed
- Stale command/template counts in project CLAUDE.md (25→41 commands, 7→9 templates, v2.0.0→v2.20.x)
- Duplicate step numbering in `gsd-t-execute.md` (two step 10s)
- Windows CRLF/LF comparison causing false "changed" detection in CLI update

### Added
- Document Ripple sections to `gsd-t-execute`, `gsd-t-scan`, `gsd-t-test-sync`, `gsd-t-verify`
- Heartbeat auto-cleanup: files older than 7 days are automatically removed
- Error handling wrapping around file operations in CLI (copy, unlink, write)
- `applyTokens()` and `normalizeEol()` helpers to reduce duplication
- Extracted `updateProjectClaudeMd()`, `createProjectChangelog()`, `checkProjectHealth()` from `doUpdateAll()`

## [2.20.5] - 2026-02-16

### Added
- **Next Command Hint**: After each GSD-T phase completes, displays the recommended next command (e.g., `Next → /gsd-t-partition`). Full successor mapping for all workflow commands. Skipped during auto-advancing (Level 3 mid-wave)

## [2.20.4] - 2026-02-16

### Changed
- **Scan always uses team mode**: `gsd-t-scan` and `gsd-t-init-scan-setup` now spawn a team by default. Solo mode only for trivially small codebases (< 5 files) or when teams are explicitly disabled

## [2.20.3] - 2026-02-16

### Added
- **Playwright Cleanup**: After Playwright tests finish, kill any app/server processes that were started for the tests. Prevents orphaned dev servers from lingering after test runs

## [2.20.2] - 2026-02-16

### Added
- **CLI health checks**: `update-all` and `doctor` now check all projects for missing Playwright and Swagger/OpenAPI
- Smart API detection: scans `package.json`, `requirements.txt`, `pyproject.toml` for API frameworks (Express, Fastify, Hono, Django, FastAPI, etc.)
- Swagger detection: checks for spec files (`openapi.json/yaml`, `swagger.json/yaml`) and swagger packages in dependencies
- Health summary in `update-all` shows counts of missing Playwright and Swagger across all registered projects

## [2.20.1] - 2026-02-16

### Added
- **API Documentation Guard (Swagger/OpenAPI)**: Every API endpoint must be documented in Swagger/OpenAPI spec — no exceptions. Auto-detects framework and installs appropriate Swagger integration. Swagger URL must be published in CLAUDE.md, README.md, and docs/infrastructure.md
- Pre-Commit Gate now checks for Swagger spec updates on any API endpoint change

## [2.20.0] - 2026-02-16

### Added
- **Playwright Setup in Init**: `gsd-t-init` now installs Playwright, creates `playwright.config.ts`, and sets up E2E test directory for every project. Detects package manager (bun, npm, yarn, pnpm, pip) automatically
- **Playwright Readiness Guard**: Before any testing command (execute, test-sync, verify, quick, wave, milestone, complete-milestone, debug), checks for `playwright.config.*` and auto-installs if missing. Playwright must always be ready — no deferring to "later"

## [2.19.1] - 2026-02-16

### Changed
- **Quick**: Now runs the FULL test suite (not just affected tests), requires comprehensive test creation for new/changed code paths including Playwright E2E, and verifies against requirements and contracts. "Quick doesn't mean skip testing."

## [2.19.0] - 2026-02-16

### Changed
- **Execute**: "No feature code without test code" — every task must include comprehensive unit tests AND Playwright E2E specs for all new code paths, modes, and flows. Tests are part of the deliverable, not a follow-up
- **Test-Sync**: Creates tests immediately during execute phase instead of deferring gaps to verify. Missing Playwright specs for new features/modes are created on the spot
- **Verify**: Zero test coverage on new functionality is now a FAIL (not WARN). Coverage audit checks that every new feature, mode, page, and flow has comprehensive Playwright specs covering happy path, error states, edge cases, and all modes/flags

## [2.18.2] - 2026-02-16

### Added
- Gap Analysis Gate in `gsd-t-complete-milestone` — mandatory requirements verification before archiving
- Self-correction loop: auto-fixes gaps, re-verifies, re-analyzes (up to 2 cycles), stops if unresolvable
- Explicit Playwright E2E test execution in milestone test verification step

## [2.18.1] - 2026-02-16

### Added
- Auto-Init Guard — GSD-T workflow commands automatically run `gsd-t-init` if any init files are missing, then continue with the original command
- `gsd-t-init` copies `~/.claude/settings.local` → `.claude/settings.local.json` during project initialization
- Exempt commands that skip auto-init: `gsd-t-init`, `gsd-t-init-scan-setup`, `gsd-t-help`, `gsd-t-version-update`, `gsd-t-version-update-all`, `gsd-t-prompt`, `gsd-t-brainstorm`

## [2.18.0] - 2026-02-16

### Added
- Heartbeat system — real-time event streaming from Claude Code sessions via async hooks
- `scripts/gsd-t-heartbeat.js` — hook handler that writes JSONL events to `.gsd-t/heartbeat-{session_id}.jsonl`
- 9 Claude Code hooks: SessionStart, PostToolUse, SubagentStart, SubagentStop, TaskCompleted, TeammateIdle, Notification, Stop, SessionEnd
- Installer auto-configures heartbeat hooks in settings.json (all async, zero performance impact)
- Event types: session lifecycle, tool calls with file/command summaries, agent spawn/stop/idle, task completions

## [2.17.0] - 2026-02-16

### Added
- `/gsd-t-log` command — sync progress.md Decision Log with recent git activity by scanning commits since last logged entry
- Incremental updates (only new commits) and first-time full reconstruction from git history
- Total commands: 38 GSD-T + 3 utility = 41

## [2.16.5] - 2026-02-16

### Added
- `gsd-t-populate` now reconstructs Decision Log from git history — parses all commits, generates timestamped entries, merges with existing log
- Pre-Commit Gate explicitly lists all 30 file-modifying commands that must log to progress.md

### Changed
- Rebuilt GSD-T project Decision Log with full `YYYY-MM-DD HH:MM` timestamps from 54 git commits

## [2.16.4] - 2026-02-16

### Changed
- Smart router renamed from `/gsd-t` to `/gsd` — sorts first in autocomplete, shorter to type
- Pre-Commit Gate now requires timestamped progress.md entry (`YYYY-MM-DD HH:MM`) after every completed task, not just architectural decisions

## [2.16.3] - 2026-02-16

### Fixed
- Reverted smart router rename (`/gsd` back to `/gsd-t`) — superseded by 2.16.4 which re-applies the rename

## [2.16.2] - 2026-02-16

### Changed
- Smart router renamed from `/gsd-t` to `/gsd` (reverted in 2.16.3)

## [2.16.1] - 2026-02-16

### Fixed
- `gsd-t-init-scan-setup` now pulls existing code from remote before scanning — prevents treating repos with existing code as greenfield

## [2.16.0] - 2026-02-13

### Changed
- Smart router (`/gsd-t`) replaced signal-word lookup table with **semantic evaluation** — evaluates user intent against each command's purpose and "Use when" criteria from help summaries
- Router shows runner-up command when confidence is close: `(also considered: gsd-t-{x} — Esc to switch)`
- New commands automatically participate in routing without updating a routing table

### Added
- Backlog item B1: Agentic Workflow Architecture (future exploration when Claude Code agents mature)

## [2.15.4] - 2026-02-13

### Changed
- `gsd-t-gap-analysis` team scaling: one teammate per requirement (3–10), cap at 10 with even batching for 11+, solo for 1–2

## [2.15.3] - 2026-02-13

### Fixed
- `gsd-t-gap-analysis` hard cap of 4 teammates max — scales by requirement count (2 for 5–10, 3 for 11–15, 4 for 16+), solo for < 5

## [2.15.2] - 2026-02-13

### Changed
- `gsd-t-gap-analysis` team mode now handles flat requirement lists — chunks into batches of ~8–10 per teammate instead of requiring sections

## [2.15.1] - 2026-02-13

### Changed
- `gsd-t-gap-analysis` now uses agent team mode automatically — one teammate per requirement section for parallel scanning and classification, with solo fallback

## [2.15.0] - 2026-02-13

### Added
- `/gsd-t-gap-analysis` command — requirements gap analysis against existing codebase
- Parses spec into discrete numbered requirements, scans codebase, classifies each as implemented/partial/incorrect/not-implemented
- Evidence-based classification with file:line references for each requirement
- Severity levels: Critical (incorrect), High (partial), Medium (not implemented), Low (deferrable)
- Generates `.gsd-t/gap-analysis.md` with requirements breakdown, gap matrix, and summary stats
- Re-run support with diff against previous gap analysis (resolved, new, changed, unchanged)
- Optional merge of parsed requirements into `docs/requirements.md`
- Auto-groups gaps into recommended milestones/features/quick-fixes for promotion
- Autonomy-aware: Level 3 proceeds with flagged assumptions, Level 1-2 pauses for clarification
- Total commands: 37 GSD-T + 3 utility = 40

## [2.14.2] - 2026-02-13

### Changed
- Smart router (`/gsd-t`) now displays selected command as the first line of output (mandatory routing confirmation)

## [2.14.1] - 2026-02-13

### Changed
- Update Notices section in CLAUDE-global template now handles both `[GSD-T UPDATE]` (update available) and `[GSD-T]` (up to date) version banners
- Update command in notification changed from raw npm command to `/gsd-t-version-update-all`

## [2.14.0] - 2026-02-12

### Added
- `/gsd-t` smart router command — describe what you need in plain language, auto-routes to the correct GSD-T command
- Intent classification routes to: quick, feature, project, debug, scan, brainstorm, milestone, wave, status, resume, backlog-add, and more
- Total commands: 36 GSD-T + 3 utility = 39

## [2.13.4] - 2026-02-12

### Added
- Auto-invoked status column on all command tables in README and GSD-T-README (Manual / In wave)
- `[auto]` markers on wave-invoked commands in `gsd-t-help` main listing
- Section headers in `gsd-t-help` now show Manual or Auto label

## [2.13.3] - 2026-02-12

### Changed
- `gsd-t-init-scan-setup` now asks "Is {current folder} your project root?" before prompting for a folder name

## [2.13.2] - 2026-02-12

### Changed
- `gsd-t-init-scan-setup` now asks for project folder name, creates it if needed, and `cd`s into it — can be run from anywhere

## [2.13.1] - 2026-02-12

### Changed
- Update notification now includes changelog link (https://github.com/Tekyz-Inc/get-stuff-done-teams/blob/main/CHANGELOG.md)

## [2.13.0] - 2026-02-12

### Added
- `/gsd-t-init-scan-setup` slash command — full project onboarding combining git setup, init, scan, and setup in one command
- Prompts for GitHub repo URL if not already connected; skips if remote exists
- Total commands: 35 GSD-T + 3 utility = 38

## [2.12.0] - 2026-02-12

### Added
- `/gsd-t-version-update` slash command — update GSD-T to latest version from within Claude Code
- `/gsd-t-version-update-all` slash command — update GSD-T + all registered projects from within Claude Code
- Total commands: 34 GSD-T + 3 utility = 37

## [2.11.6] - 2026-02-12

### Changed
- Update notice now shown at both beginning and end of Claude's first response

## [2.11.5] - 2026-02-12

### Added
- SessionStart hook script (`~/.claude/scripts/gsd-t-update-check.js`) for automatic update notifications in Claude Code sessions
- "Update Notices" instruction in global CLAUDE.md template — Claude relays update notices to the user on first response

## [2.11.4] - 2026-02-12

### Fixed
- First-run update check now fetches synchronously when no cache exists — notification shows immediately instead of requiring a second run

## [2.11.3] - 2026-02-12

### Changed
- Reduced update check cache duration from 24 hours to 1 hour — new releases are detected faster

## [2.11.2] - 2026-02-12

### Fixed
- CLI update check used `!==` instead of semver comparison — would show incorrect downgrade notices when cache had an older version
- Added `isNewerVersion()` helper for proper semver comparison in update notifications

## [2.11.1] - 2026-02-12

### Changed
- `gsd-t-resume` now detects same-session vs cross-session mode — skips full state reload when context is already available, auto-resumes at Level 3
- Added "Conversation vs. Work" rule to global CLAUDE.md template — plain text questions are answered conversationally, workflow only runs when a `/gsd-t-*` command is invoked

## [2.11.0] - 2026-02-12

### Added
- Autonomy-level-aware auto-advancing for all phase commands — at Level 3 (Full Auto), partition, plan, impact, execute, test-sync, integrate, verify, and complete-milestone auto-advance without waiting for user input
- Wave error recovery auto-remediates at Level 3 (up to 2 fix attempts before stopping)
- Discuss phase always pauses for user input regardless of autonomy level
- Autonomy levels documentation added to GSD-T-README Configuration section

## [2.10.3] - 2026-02-11

### Changed
- Default autonomy level changed from Level 2 (Standard) to Level 3 (Full Auto) across all templates and commands
- `gsd-t-init` now sets Level 3 in generated CLAUDE.md
- `gsd-t-setup` defaults to Level 3 when asking autonomy level

## [2.10.2] - 2026-02-11

### Added
- Version update check in `gsd-t-status` slash command — works inside Claude Code and ClaudeWebCLI sessions, not just the CLI binary

### Fixed
- Normalized `repository.url` in package.json (`git+https://` prefix)

## [2.10.1] - 2026-02-10

### Added
- Automatic update check — CLI queries npm registry (cached 24h, background refresh) and shows a notice box with update commands when a newer version is available

## [2.10.0] - 2026-02-10

### Added
- `CHANGELOG.md` release notes document with full version history
- `changelog` CLI subcommand — opens changelog in the browser (`gsd-t changelog`)
- Clickable version links in CLI output (OSC 8 hyperlinks to changelog)
- `checkin` command now auto-updates CHANGELOG.md on every version bump
- `update-all` now creates CHANGELOG.md for registered projects that don't have one

## [2.9.0] - 2026-02-10

### Added
- `gsd-t-setup` command — generates or restructures project CLAUDE.md by scanning codebase, detecting tech stack/conventions, and removing global duplicates

## [2.8.1] - 2026-02-10

### Added
- Workflow Preferences section in global and project CLAUDE.md templates (Research Policy, Phase Flow defaults with per-project override support)

## [2.8.0] - 2026-02-10

### Added
- Backlog management system: 7 new commands (`backlog-add`, `backlog-list`, `backlog-move`, `backlog-edit`, `backlog-remove`, `backlog-promote`, `backlog-settings`)
- 2 new templates (`backlog.md`, `backlog-settings.md`)
- Backlog initialization in `gsd-t-init` with auto-category derivation
- Backlog summary in `gsd-t-status` report
- Backlog section in `gsd-t-help`

### Changed
- Updated `gsd-t-init`, `gsd-t-status`, `gsd-t-help`, CLAUDE-global template, README with backlog integration

## [2.7.0] - 2026-02-09

### Added
- `update-all` CLI command — updates global install + all registered project CLAUDE.md files
- `register` CLI command — manually register a project in the GSD-T project registry
- Auto-registration on `gsd-t init`
- Project registry at `~/.claude/.gsd-t-projects`

## [2.6.0] - 2026-02-09

### Added
- Destructive Action Guard — mandatory safeguard requiring explicit user approval before destructive or structural changes (schema drops, architecture replacements, module removal)
- Guard enforced in global CLAUDE.md, project template, and all execution commands

## [2.5.0] - 2026-02-09

### Changed
- Audited all 27 command files — added Document Ripple and Test Verification steps to 15 commands that were missing them
- All code-modifying commands now enforce doc updates and test runs before completion

## [2.4.0] - 2026-02-09

### Added
- Automatic version bumping in `checkin` command — determines patch/minor/major from change type

## [2.3.0] - 2026-02-09

### Added
- Branch Guard — prevents commits on wrong branch by checking `Expected branch` in CLAUDE.md

## [2.2.1] - 2026-02-09

### Fixed
- `gsd-t-discuss` now stops for user review when manually invoked (was auto-continuing even in manual mode)

## [2.2.0] - 2026-02-09

### Added
- E2E test support in `test-sync`, `verify`, and `execute` commands

## [2.1.0] - 2026-02-09

### Added
- `gsd-t-populate` command — auto-populate living docs from existing codebase
- Semantic versioning system tracked in `progress.md`
- Auto-update README on version changes

## [2.0.2] - 2026-02-07

### Changed
- `gsd-t-init` now creates all 4 living document templates (`requirements.md`, `architecture.md`, `workflows.md`, `infrastructure.md`)
- `gsd-t-scan` cross-populates findings into living docs

## [2.0.1] - 2026-02-07

### Fixed
- Added `gsd-t-brainstorm` to all 4 reference files (README, GSD-T-README, CLAUDE-global, gsd-t-help)
- Fixed workflow diagram alignment

## [2.0.0] - 2026-02-07

### Added
- Renamed package to `@tekyzinc/gsd-t`
- `gsd-t-brainstorm` command — creative exploration, rethinking, and idea generation
- Initialized GSD-T state (`.gsd-t/` directory) on itself

### Changed
- Complete framework rewrite from GSD to GSD-T (contract-driven development)
- npm package with CLI installer (`bin/gsd-t.js`)
- 6 CLI subcommands: install, update, init, status, doctor, uninstall

## [1.0.0] - 2026-02-07

### Added
- Initial GSD-T framework implementation
- Full milestone workflow: partition, discuss, plan, impact, execute, test-sync, integrate, verify, complete
- Agent Teams support for parallel execution
- Living documents system (requirements, architecture, workflows, infrastructure)
