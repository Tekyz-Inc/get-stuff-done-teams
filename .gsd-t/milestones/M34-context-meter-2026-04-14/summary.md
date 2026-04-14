# Milestone Complete: M34 — Context Meter (API-Based Token Counting)

**Completed**: 2026-04-14
**Duration**: 2026-04-10 → 2026-04-14
**Version**: 2.74.13 → 2.75.10
**Status**: VERIFIED
**Tag**: v2.75.10

## What Was Built

Real context-window measurement via the Anthropic `count_tokens` API. Replaces the v2.74.12 task-counter proxy entirely. A PostToolUse hook streams the live transcript to the API after each tool call and writes the resulting real `input_tokens` count to `.gsd-t/.context-meter-state.json` with a 5-minute staleness window. `bin/token-budget.js` reads that state file as its primary data source and falls back to a heuristic parse of `.gsd-t/token-log.md` when the state file is absent, stale, or the API key is missing. The public `getSessionStatus()` API was preserved byte-for-byte so every downstream consumer (command files, metrics-collector, status display) transparently moved from proxy to real measurement.

The installer gained five new capabilities: hook installation into `~/.claude/hooks/`, config file copy into the project, an interactive API key prompt that prints the `export` line for the user to paste into their own shell (never written to disk), a doctor sub-check that validates hook + config + key + state file freshness, and a status-line display helper. A retirement migration removes `bin/task-counter.cjs` from existing installs without touching project history.

Every command file that previously referenced the retired task counter was swept and rewritten to use a canonical `CTX_PCT` bash shim that reads the real percentage from the new state file. The observability log header changed from `Tasks-Since-Reset` to `Ctx%`.

## Domains

| Domain                        | Tasks | Key Deliverables |
|-------------------------------|-------|------------------|
| context-meter-config          | 2/2   | `.gsd-t/context-meter-config.json` loader and default template |
| context-meter-hook            | 5/5   | `scripts/gsd-t-context-meter.js` hook entry, `scripts/context-meter/client.js` API client, `scripts/context-meter/parser.js` transcript parser, threshold-band classifier, 4 black-box E2E tests against stub HTTP server |
| installer-integration         | 6/6   | `installContextMeter`, `configureContextMeterHooks`, `promptForApiKeyIfMissing`, `checkDoctorContextMeter`, `showStatusContextMeter`, `runTaskCounterRetirementMigration` — 16 unit tests |
| token-budget-replacement      | 10/10 | `token-budget-contract.md` v2.0.0 rewrite, `bin/token-budget.js getSessionStatus()` real-measurement path, 5-min staleness window, heuristic fallback, command-file sweep across execute/wave/quick/integrate/debug/doc-ripple |
| m34-docs-and-tests            | 9/9   | README, GSD-T-README, CLAUDE-global, CLAUDE-project, architecture, infrastructure, methodology, requirements (REQ-063–REQ-068), CHANGELOG, version bump |
| **Total**                     | **32/32** | **plus 11 gap-closure sites fixed during complete-milestone gate** |

## Contracts Defined/Updated

| Contract                            | Version | Change     |
|-------------------------------------|---------|------------|
| context-meter-contract.md           | v1.0.0  | NEW — hook I/O, state file schema, threshold semantics, fail-open guarantees |
| token-budget-contract.md            | v2.0.0  | REWRITTEN — real measurement instead of task-count proxy; public API preserved byte-for-byte |
| context-observability-contract.md   | v2.0.0  | UPDATED — schemas reference `.context-meter-state.json` instead of environment variables |

## Key Decisions

- **Real measurement, not defense-in-depth**: M34 replaces the task counter entirely rather than augmenting it. Reason: a proxy alongside real data creates two sources of truth and guarantees drift. The task counter is deleted from the package and migrated out of existing installs.
- **Fail-open on missing API key**: if `ANTHROPIC_API_KEY` is unset, the hook does not crash, does not block tool execution, and does not inject errors into the transcript. The doctor check reports RED so the user knows, and `getSessionStatus()` silently falls back to the `.gsd-t/token-log.md` heuristic. Users who set the key get real measurement; users who don't get a safer heuristic than the old env-var vaporware path.
- **Public API preservation**: `token-budget.js` `getSessionStatus()` keeps its v1 signature unchanged. Command files and downstream code see no difference beyond sharper data. This allowed the rewrite to land without touching every consumer in the same milestone.
- **5-minute staleness window**: state file older than 5 minutes triggers heuristic fallback. Chosen because a Claude Code session can go idle between tool calls and the last hook write may precede the next read by several minutes; 5 minutes covers the gap without letting truly stale data drive decisions.
- **Grep-sweep discipline**: Wave 2 Tasks 6-8 scoped the command-file sweep to a pre-selected list (execute, wave, quick, integrate, debug, doc-ripple) and missed 9 others. The gap was caught during complete-milestone and fixed inline (commit `57ce335`). The lesson: retirement waves must grep-sweep the entire `commands/` tree, not a hand-picked list. Captured but not filed as tech debt because the fix landed.

## Issues Encountered

- **Mid-completion gap**: 9 command files (gsd-t-verify, gsd-t-plan, gsd-t-prd, gsd-t-audit, gsd-t-brainstorm, gsd-t-reflect, gsd-t-visualize, gsd-t-debug, gsd-t-discuss) still referenced retired `Tasks-Since-Reset` / `{COUNTER}` / `TOK_*` placeholders. Caught during complete-milestone gate check. Closed via `57ce335` with canonical CTX_PCT shim migration. Also scrubbed pre-v2.74.12 env-var cruft (`TOK_START`/`TOK_END`/`TOK_MAX`/`COMPACTED`) from reflect and visualize.
- **Resume auto-advance gap**: resume chain was stopping at end of wave instead of auto-advancing through verify → complete-milestone. Fixed in commits `23cfaf7` and `93f470b` by adding Step 5 to `gsd-t-resume.md` with an explicit successor mapping and an `Outstanding User Directive` field to `gsd-t-pause.md` so multi-step chains are preserved across pauses.
- **Stale verify-report and progress status**: `.gsd-t/verify-report.md` still held M32 data when complete-milestone started; `.gsd-t/progress.md` Status was IN PROGRESS because verify was never re-run after Wave 3. Both corrected inline during Step 1 of complete-milestone.
- **Inherited silent-degradation anti-pattern (deferred to M35)**: during complete-milestone the user raised that the `downgrade` and `conserve` bands in `bin/token-budget.js` (inherited from M31) violate GSD-T's core principle of excellent results and completely tested software. The bands were never agreed to — they landed as M31 PRD §3.7 "Token-Aware Orchestration" (v2.52.10, commit `22792fd`, 2026-04-01) framed as a safety net but silently swap models down and skip Red Team / doc-ripple / Design Verify under context pressure. M34 preserves them byte-for-byte via the public-API contract; M35 will rip them out. Not blocking for M34 completion because the bands are latent — they fire on future spawns, not during tagging.

## Test Coverage

- **Baseline (pre-M34)**: 833/833 green
- **M34 delta**: +108 net new tests
- **Final**: 941/941 green (Node test runner)
- **Breakdown**:
  - Context Meter E2E: 4/4 (child-process hook spawn against stub HTTP server)
  - Installer M34: 16/16 (retirement migration, gitignore, hook config, API key prompt, context meter install, doctor, status line)
  - Token Budget: 37/37 (real measurement, 5-min staleness, heuristic fallback, stale fallback, missing-file fallback)
  - Regression: all pre-existing tests still green, zero new failures introduced

## Verification

- **Overall**: PASS
- **Functional**: PASS — 6/6 requirements (REQ-063 through REQ-068)
- **Contracts**: PASS — 3 contracts ACTIVE at current versions
- **Code Quality**: PASS — 0 issues, all new modules under file-size limits, zero-dep additions preserved
- **Goal-Backward**: PASS — 6 requirements verified backward through code, 0 findings, real measurement path exercised end-to-end via smoke tests
- **Gap Closure**: PASS — zero remaining references to retired task-counter / TOK_* / Tasks-Since-Reset / {COUNTER} / CLAUDE_CONTEXT_TOKENS_* in live command files

Full verification report: `verify-report.md` in this archive.

## Git Tag

`v2.75.10`

## Files Changed (Summary)

**New files**:
- `scripts/gsd-t-context-meter.js` (hook entry)
- `scripts/context-meter/client.js` (Anthropic API client)
- `scripts/context-meter/parser.js` (transcript parser)
- `.gsd-t/context-meter-config.json` (config template)
- `.gsd-t/.context-meter-state.json` (runtime state, written by hook)
- `.gsd-t/contracts/context-meter-contract.md` (v1.0.0)
- `scripts/gsd-t-context-meter.e2e.test.js` (4 E2E tests)
- `test/installer-m34.test.js` (16 unit tests)

**Rewritten**:
- `bin/token-budget.js` (`getSessionStatus()` and helpers)
- `.gsd-t/contracts/token-budget-contract.md` (v1.x → v2.0.0)
- `.gsd-t/contracts/context-observability-contract.md` (v1.x → v2.0.0)

**Extended**:
- `bin/gsd-t.js` (+5 functions: `installContextMeter`, `configureContextMeterHooks`, `promptForApiKeyIfMissing`, `checkDoctorContextMeter`, `showStatusContextMeter`, plus `runTaskCounterRetirementMigration`)

**Deleted**:
- `bin/task-counter.cjs` (migrated out of installs via the retirement migration)

**Command files swept** (CTX_PCT shim migration, 11 sites total):
- gsd-t-execute.md (3 residual sites), gsd-t-wave.md, gsd-t-quick.md, gsd-t-integrate.md, gsd-t-debug.md, gsd-t-doc-ripple.md (Wave 2 — task-counter replaced)
- gsd-t-verify.md, gsd-t-plan.md, gsd-t-prd.md, gsd-t-audit.md, gsd-t-brainstorm.md, gsd-t-reflect.md, gsd-t-visualize.md, gsd-t-discuss.md (gap closure — task-counter replaced)
- gsd-t-reflect.md, gsd-t-visualize.md (pre-v2.74.12 TOK_* cruft scrubbed)

**Docs updated**:
- README.md (Context Meter Setup section, version bump)
- GSD-T-README.md (Context Meter feature doc)
- docs/architecture.md (hook architecture)
- docs/infrastructure.md (env var requirements, state file location)
- docs/methodology.md (real measurement replaces proxy)
- docs/requirements.md (REQ-063 through REQ-068 marked complete)
- templates/CLAUDE-global.md (Context Meter observability block)
- templates/CLAUDE-project.md (Context Meter observability block)
- CHANGELOG.md (full v2.75.10 entry)
- package.json (version 2.74.13 → 2.75.10)

## Successor

M35 — No Silent Degradation + Surgical Model Escalation + Token Telemetry. Rips out the `downgrade` and `conserve` bands inherited from M31, integrates `/advisor` for per-task opus escalation on routine sonnet phases, adds a runway estimator that auto-spawns headless to continue work instead of prompting for `/clear`, adds granular per-spawn token telemetry to `.gsd-t/token-metrics.jsonl`, and generates an optimization backlog that the user can selectively promote to real rule changes. Details in the M35 milestone definition file.
