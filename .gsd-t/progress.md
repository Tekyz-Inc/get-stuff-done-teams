# GSD-T Progress

## Project: GSD-T Framework (@tekyzinc/gsd-t)
## Status: COMPLETED — M38 archived, v3.12.10 tagged; ready for next milestone
## Date: 2026-04-17
## Version: 3.12.15

## Current Milestone

None — ready for next milestone

---

## Archived: M38 — Headless-by-Default + Meter Reduction

**Archived**: 2026-04-17
**Version**: 3.12.10
**Tag**: v3.12.10
**Status**: COMPLETE

**M38: Headless-by-Default + Meter Reduction**

**Goal**: Make headless the default subagent spawn path so the parent context grows much slower and the meter mostly stops mattering. Strip the meter to its irreducible core. Reform the unattended watch tick to surface real worker activity in the interactive chat. Net result: same "work never stops" UX achieved by structure instead of instrumentation, with ~5,000 LOC removed and the dead-meter regression class eliminated entirely.

Full scope, domain breakdown, and decision trail preserved in `.gsd-t/milestones/M38-headless-by-default-2026-04-17/`.

## Milestones

| # | Milestone | Status | Version | Domains |
|---|-----------|--------|---------|---------|
| M38 | Headless-by-Default + Meter Reduction | COMPLETE | 3.12.10 | 5 domains in 2 waves: Wave 1 sequential (m38-headless-spawn-default → m38-meter-reduction); Wave 2 parallel (m38-unattended-event-stream + m38-router-conversational + m38-cleanup-and-docs) |
| M37 | Universal Context Auto-Pause | COMPLETE | 3.11.10 | Archived (1 domain: m37-auto-pause; context-meter-contract v1.2.0; 5 command files updated; 1228/1228 tests) |
| M36 | Cross-Platform Unattended Supervisor Loop | COMPLETE | 3.10.10 | Archived (6 domains) |
| M35 | No Silent Degradation + Surgical Model Escalation + Token Telemetry | COMPLETE | 2.76.10 | Archived (7 domains; 38 tasks) |
| M34 | Context Meter | COMPLETE | 2.75.10 | Archived |

## Completed Milestones

| Milestone | Version | Completed | Tag | Summary |
|-----------|---------|-----------|-----|---------|
| M38 Headless-by-Default + Meter Reduction | 3.12.10 | 2026-04-17 | v3.12.10 | Headless spawn default across 7 commands; context meter reduced to single-band; 7 commands deleted; event stream JSONL; smart router intent classifier; 5 contracts folded; 1176/1177 tests |
| M37 Universal Context Auto-Pause | 3.11.10 | 2026-04-16 | v3.11.10 | Strengthened context meter additionalContext from suggestion to MANDATORY STOP instruction; context-meter-contract v1.2.0; CLAUDE-global Universal Auto-Pause Rule section; Step 0.2 in 5 loop commands; 1228/1228 tests |
| M36 Cross-Platform Unattended Supervisor Loop | 3.10.10 | 2026-04-15 | v3.10.10 | Detached supervisor relay for 24h+ unattended milestone execution; 3 new slash commands (unattended/unattended-watch/unattended-stop); ScheduleWakeup(270s) in-session watch loop; /clear+/resume auto-reattach via Step 0; cross-platform (macOS/Linux/Windows except sleep-prevention); safety rails (gutter/blocker/timeout); 1226/1226 tests |
| M35 Runway-Protected Execution | 2.76.10 | 2026-04-15 | v2.76.10 | Removed silent quality degradation; surgical per-phase model selection; pre-flight runway estimator with headless auto-spawn; 18-field per-spawn token telemetry; detect-only optimization backlog; 985/985 tests |
| M34 Context Meter | 2.75.10 | 2026-04-14 | v2.75.10 | Real context-window measurement via Anthropic count_tokens API; replaces task-counter proxy entirely; 941/941 tests |

Older milestones (M33 and earlier) archived under `.gsd-t/milestones/` — see directory listing for the full index.

## Blockers
<!-- No active blockers -->

## Decision Log

> Prior decision log entries preserved in `.gsd-t/milestones/*/progress.md` — see archive snapshots (most recently `M38-headless-by-default-2026-04-17/progress.md`) for pre-M38 history.

- 2026-04-17 18:30: [gsd-t-debug] v3.12.13→3.12.14 — telemetry env-propagation regression fix. Root cause: v3.12.12 Fix 2 added `GSD_T_COMMAND`/`GSD_T_PHASE` env-var fallbacks to `scripts/gsd-t-event-writer.js` but two critical call sites were missed: (a) `scripts/gsd-t-heartbeat.js::buildEventStreamEntry` (PostToolUse hook that fires on every tool call — source of ~90% of `tool_call` events; HARDCODED `{command: null, phase: null, trace_id: null}`), (b) writer/heartbeat had no env read for `GSD_T_TRACE_ID` or `GSD_T_MODEL`. Evidence from bee-poc (50 min observation): 908 events today, 1/908 has `command` populated; 836 `tool_call` events have command/phase/trace_id null; 2 token-log rows (both outer supervisor); 37 inner subagents wrote zero rows; supervisor row showed `model=unknown`. Reproduction test: NEW `test/telemetry-env-propagation.test.js` (6 tests exercising REAL spawn code — headless-auto-spawn.cjs via env-dump shim, unattended `platform.spawnWorker` with env-dump script, writer + heartbeat env-fallback unit coverage); failed 3/6 before fix as expected, 6/6 pass after. Fix: (1) `scripts/gsd-t-event-writer.js` `buildEvent` reads `GSD_T_TRACE_ID`/`GSD_T_MODEL` env fallbacks alongside command/phase. (2) `scripts/gsd-t-heartbeat.js` replaced hardcoded null triple with `process.env.GSD_T_COMMAND||null` + `GSD_T_PHASE||null` + `GSD_T_TRACE_ID||null`. (3) `bin/headless-auto-spawn.{cjs,js}` workerEnv now sets `GSD_T_COMMAND`/`GSD_T_PHASE` and conditionally forwards `GSD_T_TRACE_ID`/`GSD_T_MODEL`/`GSD_T_PROJECT_DIR`; `appendTokenLog` reads `GSD_T_MODEL` instead of `"unknown"` literal. (4) `bin/gsd-t-unattended.cjs::_spawnWorker` workerEnv sets full GSD_T_* set from state + env fallbacks; `_appendTokenLog` uses `process.env.GSD_T_MODEL`. (5) `bin/gsd-t.js` three sites patched: `doHeadlessExec` workerEnv, `spawnClaudeSession` (fallback `gsd-t-debug`/`debug`), `runLedgerCompaction` (fallback model `haiku`); `appendHeadlessTokenLog` reads `GSD_T_MODEL`. (6) `bin/orchestrator.js` new `_buildOrchestratorEnv()` helper threaded through `spawnClaude` sync + `spawnClaudeAsync`. (7) `scripts/gsd-t-design-review-server.js` claude spawn injects GSD_T_* env. Red Team (opus, adversarial sweep): GRUDGING PASS — 5 additional claude-worker spawn sites patched (listed above; no untagged claude-worker spawn paths remain). Tests: Unit 1186/1186 pass, E2E N/A (no playwright.config.* or cypress.config.*). Doc ripple: `.gsd-t/contracts/event-schema-contract.md` (new "Env-Var Fallbacks (v3.12.14)" section with flag/env/caller table), `.gsd-t/contracts/headless-default-contract.md` (new "Worker Env Propagation (v3.12.14)" section), `.gsd-t/contracts/unattended-supervisor-contract.md` §14b v1.2.0 worker env propagation + version history. Files: `scripts/gsd-t-event-writer.js`, `scripts/gsd-t-heartbeat.js`, `bin/headless-auto-spawn.cjs`, `bin/headless-auto-spawn.js`, `bin/gsd-t-unattended.cjs`, `bin/gsd-t.js`, `bin/orchestrator.js`, `scripts/gsd-t-design-review-server.js`, `test/telemetry-env-propagation.test.js` (NEW), `package.json`, `CHANGELOG.md`, 3 contract files.
- 2026-04-17 17:00: [gsd-t-quick] v3.12.11→3.12.12 — token-log observability for headless/unattended workers + command/phase event tagging. Root cause: M38 headless-by-default left token-log.md blind (zero rows from headless workers despite 7+ sessions); all event-stream tool_call entries had command/phase/trace_id=null. Fix 1: three spawn paths now append to token-log.md — `bin/headless-auto-spawn.cjs` (completion watcher appends row on child exit), `bin/gsd-t-unattended.cjs` (new `_appendTokenLog` after each worker iteration), `bin/gsd-t.js` `doHeadlessExec` (synchronous append after claude -p exits). Fix 2: env-var approach for command/phase propagation — `scripts/gsd-t-event-writer.js` reads `GSD_T_COMMAND`/`GSD_T_PHASE` as defaults; `headless-auto-spawn.cjs`, `gsd-t-unattended.cjs` `_spawnWorker`, and `doHeadlessExec` inject env vars at spawn time. Files: `scripts/gsd-t-event-writer.js`, `bin/headless-auto-spawn.cjs`, `bin/gsd-t-unattended.cjs`, `bin/gsd-t.js`, `package.json`, `CHANGELOG.md`, `.gsd-t/progress.md`. Tests: 1177/1177 pass. Red Team: GRUDGING PASS (all 3 "failures" were false positives in the test harness — actual code defects: 0 CRITICAL, 0 HIGH, 0 MEDIUM found).
- 2026-04-17 10:00: [gsd-t-quick] Installer owns global PostToolUse context-meter hook — v3.12.10→3.12.11. Root cause: `CONTEXT_METER_HOOK_COMMAND` pointed at `$CLAUDE_PROJECT_DIR/scripts/gsd-t-context-meter.js`, which fails in non-GSD-T projects and when `CLAUDE_PROJECT_DIR` is unset. Fix: (1) Changed canonical command to `bash -c '[ -f "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-context-meter.js" ] && node "..." || true'` with existence guard. (2) Added `CONTEXT_METER_STALE_PATTERNS` regex list; `configureContextMeterHooks` now migrates any matching stale entry in-place (idempotent) on install/update/update-all/init. (3) New `removeContextMeterHook` function; called from `doUninstall` to clean PostToolUse entries containing the marker. (4) Live `~/.claude/settings.json` migrated (action: "updated") by running `node bin/gsd-t.js update`. Files: `bin/gsd-t.js` (lines 391–398 constants; 551–680 configureContextMeterHooks + new removeContextMeterHook; 1699–1710 doUninstall; exports), `package.json`, `CHANGELOG.md`. Tests: 1177/1177 pass. Smoke: status + doctor clean. Hook manual invocation: exit 0, stderr empty.
- 2026-04-17 05:00: [complete-milestone] M38 Headless-by-Default + Meter Reduction completed — v3.12.10. Archived to .gsd-t/milestones/M38-headless-by-default-2026-04-17/. Tests: 1176/1177 (1 pre-existing scan.test.js failure, tracked for M39). [goal-backward-pass] No placeholder patterns found. [distillation] No repeating failure patterns (< 3 occurrences). Patch lifecycle: no promotions/deprecations. Token optimizer: no new recommendations.
- 2026-04-17 04:00: [M38-VERIFY] `/gsd-t-verify` executed — VERIFIED-WITH-WARNINGS. Test suite 1176/1177 (single pre-existing `scan.test.js` failure unrelated to M38; scan-data-collector regex drift vs architecture.md prose format — tracked for M39/M40 follow-up). LOC delta vs M37 baseline 122 files / +7,446 / −10,374 = net −2,928 (success criterion #11 ≥5,000 lines removed exceeded 2×). All 12 success criteria met or superseded. Next: Step 8 mandatory auto-invoke of `/gsd-t-complete-milestone` → archives M38, tags v3.12.10.
- 2026-04-17 03:30: [M38-CP5] Wave 2 Domain CD (m38-cleanup-and-docs) complete — self-improvement loop deleted, version bumped 3.11.12→3.12.10, folded contracts removed. DELETED 4 commands (optimization-apply/reject/reflect/audit) + qa-calibrator + 5 folded contracts. Full details in M38 archive snapshot.
- 2026-04-17 02:00: [M38-CP4] Wave 2 Domain RC (m38-router-conversational) complete — Smart Router absorbs conversational use cases; 3 commands deleted (prompt/brainstorm/discuss). NEW `test/router-intent.test.js` 8/8 pass.
- 2026-04-17 01:00: [M38-CP3] Wave 2 Domain ES (m38-unattended-event-stream) complete — event stream live; watch tick reformed; supervisor v1.1.0. NEW `bin/event-stream.cjs`, NEW `bin/unattended-watch-format.cjs`; 25 new tests.
- 2026-04-17 00:00: [M38-CP2] Wave 1 Domain MR (m38-meter-reduction) complete — meter collapsed to single-band. context-meter-contract.md v1.3.0; DELETED runway-estimator + token-telemetry + token-optimizer; ~3,100 LOC removed.
- 2026-04-16 15:45: [checkin] v3.11.12 — captured M38 partition+plan+Scan #11 artifacts + Domain H1 in-flight work.
- 2026-04-16 14:35: [milestone-partitioned] M38 PARTITIONED into 5 domains across 2 waves with self-modifying sequencing rationale. Full partition detail in M38 archive snapshot.
- 2026-04-16 14:25: [milestone-defined] M38 committed to progress.md — Headless-by-Default + Meter Reduction. Target version 3.12.10. Full scope source: `.gsd-t/continue-here-2026-04-16T131723.md` "M38 Full Scope" section.
