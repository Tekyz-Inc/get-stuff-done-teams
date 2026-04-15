# Impact Analysis — M35: No Silent Degradation + Surgical Model Escalation + Token Telemetry
**Date**: 2026-04-14
**Analyst**: gsd-t-impact (automated)
**Milestone**: M35 — 38 tasks, 7 domains, 5 waves
**Verdict**: **PROCEED WITH CAUTION**

---

## Summary

- Breaking changes: 4
- Requires updates: 11
- Safe changes: 10
- Unknown: 1
- **Recommendation**: PROCEED WITH CAUTION — breaking changes are fully enumerated and contained within M35's own task plan. No surprises. Proceed per wave plan; Wave 1+2 are the highest risk since they run before M35's runway protections exist.

---

## Planned Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `bin/token-budget.js` | modify | Rewrite `getDegradationActions()` to three-band model; delete `downgrade`/`conserve` branches; delete `buildDegradationResponse()`; retune thresholds to warn@70%, stop@85% |
| `.gsd-t/contracts/token-budget-contract.md` | rewrite | v2.0.0 → v3.0.0 CLEAN BREAK — removes degradation-action semantics |
| `commands/gsd-t-execute.md` | modify | Replace Token Budget Check block (exit codes 11/12 removed); remove `getDegradationActions` call; add runway check Step 0; add Model Assignment block; add token bracket |
| `commands/gsd-t-wave.md` | modify | Same as execute; replace `estimateMilestoneCost` call; add runway check Step 0; add token bracket |
| `commands/gsd-t-quick.md` | modify | Remove `downgrade`/`conserve` branch handling; add runway check; add Model Assignment block; add token bracket |
| `commands/gsd-t-integrate.md` | modify | Add runway check Step 0; add Model Assignment block; add token bracket |
| `commands/gsd-t-debug.md` | modify | Add runway check Step 0; add mid-loop inter-iteration check; add Model Assignment block; add token bracket; add headless handoff |
| `commands/gsd-t-doc-ripple.md` | modify | Add token bracket (light change — no degradation refs currently) |
| `bin/gsd-t.js` | modify | Update `doStatus()` switch-case to remove `downgrade`/`conserve` color branches |
| `scripts/context-meter/threshold.js` | modify | Update `BANDS` constants and `bandFor()` to remove `downgrade`/`conserve`; retune boundaries to warn@70%, stop@85% |
| `.gsd-t/contracts/context-meter-contract.md` | modify | Update `threshold` enum to remove `downgrade`/`conserve`; update band table |
| `bin/model-selector.js` | create | New — phase→tier declarative rules table |
| `bin/advisor-integration.js` | create | New — escalation hook convention |
| `bin/token-telemetry.js` | create | New — per-spawn JSONL recorder |
| `bin/runway-estimator.js` | create | New — pre-flight runway projection |
| `bin/headless-auto-spawn.js` | create | New — detached child spawn + session state |
| `bin/check-headless-sessions.js` | create | New — interactive read-back banner |
| `bin/token-optimizer.js` | create | New — optimization backlog detector |
| `.gsd-t/contracts/model-selection-contract.md` | create | New v1.0.0 |
| `.gsd-t/contracts/runway-estimator-contract.md` | create | New v1.0.0 |
| `.gsd-t/contracts/token-telemetry-contract.md` | create | New v1.0.0 |
| `.gsd-t/contracts/headless-auto-spawn-contract.md` | create | New v1.0.0 |
| `commands/gsd-t-optimization-apply.md` | create | New command |
| `commands/gsd-t-optimization-reject.md` | create | New command |
| `docs/prd-harness-evolution.md` | modify | §3.7 complete rewrite |
| `templates/CLAUDE-global.md` | modify | Token-Aware Orchestration section renamed; Model Assignment convention added |
| `templates/CLAUDE-project.md` | modify | Same; remove `downgrade`/`conserve` band references |
| `test/token-budget.test.js` | modify | Delete 7 `getDegradationActions` tests for removed bands; add 3-band tests |
| `test/model-selector.test.js` | create | New ~15 tests |
| `test/advisor-integration.test.js` | create | New ~10 tests |
| `test/runway-estimator.test.js` | create | New ~20 tests |
| `test/token-telemetry.test.js` | create | New ~15 tests |
| `test/token-optimizer.test.js` | create | New ~10 tests |
| `test/headless-auto-spawn.test.js` | create | New ~8 tests |
| `test/runway-debug-handoff.test.js` | create | New ~5 tests |
| `docs/` (6 files) | modify | README, GSD-T-README, methodology, architecture, infrastructure, requirements |
| `CHANGELOG.md`, `package.json` | modify | Version bump 2.75.10 → 2.76.10 |

---

## 🔴 Breaking Changes

### IMP-001: `getDegradationActions()` return shape changes — 7 tests will fail immediately after T1

- **Change**: `buildDegradationResponse()` deleted; `getDegradationActions()` returns `{band: 'normal'|'warn'|'stop', pct: number, message: string}` instead of `{threshold: string, actions: string[], modelOverrides: object}`
- **Affected**: `test/token-budget.test.js` lines 230–281 — the entire `describe("getDegradationActions")` block (7 `it()` tests) assert on `result.threshold`, `result.actions`, `result.modelOverrides` which will not exist in the new return shape
- **Impact**: 7 tests fail immediately when `bin/token-budget.js` T1 lands. The test suite drops from 941 to ~934 passing.
- **Required Action**: Must be done in the SAME task (T1): delete the 7 old `getDegradationActions` tests and add new tests for the three-band return shape. The task plan already covers this — T1 acceptance criteria includes `test/token-budget.test.js` update. Confirm execution order: code edit → test delete → test add → full suite green — all atomic.
- **Blocking**: YES — no intermediate state where the code is changed but old tests remain. Both must land together.

### IMP-002: Exit-code 11 (`conserve`) and exit-code 12 (`downgrade`) removed from command-file bash snippets — silent wrong behavior until command files updated

- **Change**: The multi-exit-code context-gate bash snippet in `commands/gsd-t-execute.md` (line 617) currently exits `11` for `conserve` and `12` for `downgrade`. After T1 rewrite, `getSessionStatus()` will never return `conserve` or `downgrade` thresholds — the resolveThreshold function will be updated to only produce `normal/warn/stop`. But the command file bash snippets still check for exit code 11 and apply "skip non-essential operations" logic.
- **Affected**: `commands/gsd-t-execute.md` (lines 466, 617, 624), `commands/gsd-t-wave.md` (lines 134, 141), `commands/gsd-t-quick.md` (lines 22–23)
- **Impact**: **SILENT WRONG BEHAVIOR** during Wave 2 (before command files are swept in DR-T3). The old exit-code checks will never trigger (the thresholds don't exist), so commands will always fall through to the normal path. This is actually *better* behavior (no degradation applied), but the dead code remains until T3 cleans it up. Not a crash, but stale dead code.
- **Required Action**: DR-T3 (Wave 2) must sweep all 6 command files and replace the multi-exit-code gate with the three-band handler. The wave structure already schedules this — Wave 1 changes the JS, Wave 2 sweeps the command files. The window of dead-but-harmless code is Wave 1 → start of Wave 2.
- **Blocking**: YES in principle, but the failure mode is "dead code that does nothing" rather than a crash. The task plan correctly orders this Wave 1 → Wave 2.

### IMP-003: `scripts/context-meter/threshold.js` `bandFor()` must be updated in sync with `bin/token-budget.js` — else state file writes stale `downgrade`/`conserve` band values

- **Change**: `scripts/context-meter/threshold.js` has its own hardcoded `BANDS` constant (matching `bin/token-budget.js`). The comment explicitly says "must match bin/token-budget.js THRESHOLDS exactly." After M35 T1 updates token-budget.js, the context-meter hook's `bandFor()` will still write `threshold: "downgrade"` or `threshold: "conserve"` into `.gsd-t/.context-meter-state.json`.
- **Affected**: `scripts/context-meter/threshold.js` — `BANDS` constant (lines: `downgrade: 70`, `conserve: 85`); `bandFor()` function; all consumers that read `state.threshold` including `bin/token-budget.js` `resolveThreshold()` fallback, `bin/gsd-t.js` `doStatus()`, `docs/GSD-T-README.md`, `docs/infrastructure.md`
- **Impact**: After T1, `bin/token-budget.js` `resolveThreshold()` will only produce 3 bands. But the context-meter PostToolUse hook (which is independent) will still write `"downgrade"` or `"conserve"` into the state file. `bin/token-budget.js` `getSessionStatus()` reads `state.threshold` from that file and returns it — so callers could see `threshold: "downgrade"` even after the rewrite if they're reading from a stale or freshly-written state file. This is a gap the task plan did not explicitly call out: `scripts/context-meter/threshold.js` is NOT listed in any domain's task list.
- **Required Action**: `scripts/context-meter/threshold.js` `BANDS` constant and `bandFor()` must be updated in the same wave as T1 (Wave 1). The constant must change to `{ warn: 70, stop: 85 }` to match the new thresholds. **NOTE: This file is NOT currently in any M35 domain's task list. This is a gap the PLAN phase missed.** Do not add to tasks.md (per execution constraints), but the executing agent must handle it. Recommend: fold into degradation-rip-out T1 since that task already owns `bin/token-budget.js` threshold retune.
- **Blocking**: YES — leaving threshold.js out of sync means the state file will continue writing stale band values, creating inconsistency between the JS module and the hook output.

### IMP-004: `bin/gsd-t.js` `doStatus()` switch-case handles `downgrade`/`conserve` — dead branches after T1, but also must handle the `warn` band correctly now that `warn` moves to 70%

- **Change**: `bin/gsd-t.js` `doStatus()` (lines 1544–1558) has a switch-case that maps `downgrade` → YELLOW, `conserve` → RED. After M35, these bands no longer exist. The function will fall through to the `default: DIM` for any previously-`downgrade` or `conserve` reading if the state file still has stale values.
- **Affected**: `bin/gsd-t.js` lines 1544–1558; any state file written before the hook is updated (IMP-003)
- **Impact**: Users running `gsd-t status` will see context% in DIM color instead of YELLOW/RED when state.threshold is `"downgrade"` or `"conserve"` (from a pre-upgrade state file). After IMP-003 is fixed, the stale values disappear. Must also add YELLOW coloring for `warn` band (which now covers the same territory as old `downgrade` + old `warn`).
- **Required Action**: Update `doStatus()` switch to: `normal` → GREEN, `warn` → YELLOW, `stop` → BOLD+RED. Remove `downgrade` and `conserve` cases. **This file is also not listed in any M35 domain task list.** Recommend folding into degradation-rip-out T3 (command file sweep) or T1.
- **Blocking**: YES (but UI-only) — incorrect visual indication of context band. Not a logic failure.

---

## 🟡 Requires Updates

### IMP-010: `bin/gsd-t.js` command count and help output — 2 new commands not yet registered

- **Change**: `gsd-t-optimization-apply.md` and `gsd-t-optimization-reject.md` are new command files. The CLI installer tracks command count in `bin/gsd-t.js` and help tables.
- **Action**: When optimization-backlog T2 creates these files, also update `bin/gsd-t.js` command counting logic and `commands/gsd-t-help.md`, `README.md`, `docs/GSD-T-README.md`, `templates/CLAUDE-global.md`. The pre-commit gate checklist in project CLAUDE.md explicitly requires this.
- **Blocking**: NO — can be done in the same optimization-backlog task or docs-and-tests T1

### IMP-011: `estimateMilestoneCost()` in `commands/gsd-t-wave.md` — will be superseded by `estimateRunway()` but old call remains until Wave 3

- **Change**: `gsd-t-wave.md` line 57 calls `estimateMilestoneCost()` for pre-flight. This is being replaced by `estimateRunway()` from the runway estimator. Until Wave 3's RE-T4 wires up the runway check into Step 0, the old `estimateMilestoneCost()` call stays active.
- **Action**: `estimateMilestoneCost()` must remain in `bin/token-budget.js` through Wave 2. Do NOT delete it in T1 — it's still called. Only deprecate/remove after Wave 3 wires in the runway estimator.
- **Blocking**: NO — the call continues to work fine with the old implementation. The function survives the T1 rewrite unchanged.

### IMP-012: `docs/architecture.md` exit-code table and band table need updating

- **Change**: `docs/architecture.md` line 394 shows `"downgrade"` and `"conserve"` in the `bandFor()` output union. Line 413 shows the orchestrator exit code map including codes 11 (conserve) and 12 (downgrade).
- **Action**: Update to three-band model. Scheduled in docs-and-tests T2. No functional impact — documentation only.
- **Blocking**: NO

### IMP-013: `docs/infrastructure.md` band table has `downgrade`/`conserve` rows

- **Change**: Lines 255–256 document the old 5-band model.
- **Action**: Update to three-band table. Scheduled in docs-and-tests T2.
- **Blocking**: NO

### IMP-014: `docs/GSD-T-README.md` band table has `downgrade`/`conserve` rows

- **Change**: Lines 455–456 document the old 5-band model.
- **Action**: Update to three-band table. Scheduled in docs-and-tests T1.
- **Blocking**: NO

### IMP-015: `README.md` Token-Aware Orchestration paragraph references `downgrade`/`conserve`

- **Change**: Line 17 explicitly names the degraded bands as features.
- **Action**: Rewrite to "Runway-Protected Execution" per docs-and-tests T1.
- **Blocking**: NO

### IMP-016: `templates/CLAUDE-global.md` Token-Aware Orchestration section references `downgrade`/`conserve` as features

- **Change**: Line 369 describes the degradation bands as designed behavior to users installing GSD-T globally.
- **Action**: Rewrite. Scheduled in degradation-rip-out T4 (Wave 2).
- **Blocking**: NO — but must land before v2.76.10 is published

### IMP-017: `templates/CLAUDE-project.md` band boundary comment references old bands

- **Change**: Lines 31, 42 reference the old downgrade/conserve bands in per-project configuration guidance.
- **Action**: Rewrite. Scheduled in degradation-rip-out T4 (Wave 2).
- **Blocking**: NO

### IMP-018: `docs/prd-harness-evolution.md` §3.7 still frames Token-Aware Orchestration as a valid feature

- **Change**: Section 3.7 (lines 302+) advocates for graduated degradation as a good thing. Risk table (line 501) lists it as a mitigation. These become incorrect/misleading after M35.
- **Action**: Complete §3.7 rewrite. Scheduled in degradation-rip-out T4.
- **Blocking**: NO — but creates a confusing historical record if not updated before M35 complete-milestone

### IMP-019: `docs/methodology.md` line 89 references `downgrade`/`checkpoint`/`stop` as the valid orchestrator decision tree

- **Change**: The methodology narrative describes the old model as the correct approach.
- **Action**: Update "From Silent Degradation to Aggressive Pause-Resume" section in docs-and-tests T2.
- **Blocking**: NO

### IMP-020: `test/token-budget.test.js` — `getSessionStatus()` threshold tests for `downgrade` and `conserve` bands will fail after T1

- **Change**: Lines 176–183 test `getSessionStatus().threshold === "downgrade"` at 70–85% and `"conserve"` at 85–95%. After T1, these thresholds no longer exist — 70–85% becomes `warn`, 85–95% becomes `stop`.
- **Affected**: 2 `it()` tests (lines 176–183)
- **Action**: Update these tests in T1 to test the new three-band boundaries. This is already covered by T1 acceptance criteria.
- **Blocking**: YES — counted in IMP-001 already; breaking if not done atomically with T1

---

## 🟢 Safe Changes

- `bin/model-selector.js` (create) — new module, no consumers until Wave 2 wires it in; safe
- `bin/advisor-integration.js` (create) — new module; safe
- `bin/token-telemetry.js` (create) — new module; no consumers until Wave 2 token bracket wiring; safe
- `bin/runway-estimator.js` (create) — new module; no consumers until Wave 3 Step 0 wiring; safe
- `bin/headless-auto-spawn.js` (create) — new module; no consumers until Wave 3; safe
- `bin/check-headless-sessions.js` (create) — new module; only called from command files in Wave 4; safe
- `bin/token-optimizer.js` (create) — new module; called from complete-milestone in Wave 4; safe
- `commands/gsd-t-optimization-apply.md` (create) — additive new command; safe
- `commands/gsd-t-optimization-reject.md` (create) — additive new command; safe
- `.gsd-t/headless-sessions/` (create directory) — additive; safe
- `.gsd-t/token-metrics.jsonl` (create) — additive new file; safe
- `.gsd-t/optimization-backlog.md` (create) — additive new file; safe
- All 5 new contracts (create) — additive; safe
- New test files (7 creates) — additive; safe

---

## ⚪ Unknown Impact

### IMP-030: `/advisor` native tool programmable API

- **Change**: `bin/advisor-integration.js` depends on whether Claude Code's `/advisor` tool exposes a programmable API callable from a subagent prompt. If yes, the module has a direct integration path. If no, it falls back to convention-based escalation (injected prompt text).
- **Uncertainty**: Cannot determine from static analysis — requires a runtime investigation (model-selector-advisor T1 resolves this)
- **Recommendation**: Resolve in Wave 1, T1 before writing any advisor integration code. The fallback is safe; the unknown only affects which branch is implemented first.

---

## Contract Status

| Contract | Status | Notes |
|----------|--------|-------|
| `token-budget-contract.md` | UPDATE NEEDED — v3.0.0 REWRITE | Clean break. v2.0.0 callers (execute, wave, quick, integrate, debug, complete-milestone) must all be updated in Wave 2. Migration notes section required. |
| `context-meter-contract.md` | UPDATE NEEDED | Threshold enum documents `"downgrade"` and `"conserve"` which will be removed from `scripts/context-meter/threshold.js`. Must update `state.threshold` enum in §State File schema to `"normal"/"warn"/"stop"` only. |
| `model-selection-contract.md` | NEW — v1.0.0 | Created in model-selector-advisor T4. Defines phase→tier declarative rules and escalation hook pattern. |
| `runway-estimator-contract.md` | NEW — v1.0.0 | Created in runway-estimator T2. |
| `token-telemetry-contract.md` | NEW — v1.0.0 | Created in token-telemetry T1. Must freeze schema on creation — additions only. |
| `headless-auto-spawn-contract.md` | NEW — v1.0.0 | Created in headless-auto-spawn T1. |
| `api-contract.md` | OK | Not applicable — no new HTTP API endpoints. |
| `schema-contract.md` | OK | Not applicable — no database schema changes. |
| `component-contract.md` | OK | Not applicable — no UI components. |
| `fresh-dispatch-contract.md` | OK | Read-only reference in two domains. No changes needed. |
| `headless-contract.md` | OK | M29 headless contract remains unchanged. headless-auto-spawn reuses its invocation pattern. |
| `context-observability-contract.md` | OK | `Ctx%` column pattern unchanged. token-metrics.jsonl is a new parallel artifact, not a replacement. |

---

## Blast Radius Map — `bin/token-budget.js` Public API

### `getSessionStatus()` — SAFE (API preserved, internal band set narrows)

Callers (by file): `commands/gsd-t-execute.md` (3 bash snippets), `commands/gsd-t-wave.md` (3 snippets), `commands/gsd-t-quick.md` (2 snippets), `commands/gsd-t-integrate.md` (1 snippet), `commands/gsd-t-debug.md` (2 snippets), `commands/gsd-t-doc-ripple.md` (1 snippet), `commands/gsd-t-reflect.md` (1 snippet), `commands/gsd-t-visualize.md` (1 snippet), `commands/gsd-t-brainstorm.md` (1 snippet), `commands/gsd-t-audit.md` (1 snippet), `commands/gsd-t-verify.md` (2 snippets), `commands/gsd-t-plan.md` (1 snippet), `commands/gsd-t-discuss.md` (1 snippet), `commands/gsd-t-prd.md` (1 snippet), `bin/gsd-t.js` `doStatus()`, `bin/gsd-t.js` `doDoctor()`.

Callers reading `.threshold` and acting on `downgrade`/`conserve` values: **3 command files** (`execute`, `wave`, `quick`) — these are the IMP-002 blast radius. All other callers only read `.pct` for logging (safe).

### `getDegradationActions()` — BREAKING (return shape changes entirely)

Direct callers: `commands/gsd-t-execute.md` (line 127 — full getDegradationActions call with `actions.modelOverride`), `commands/gsd-t-wave.md` (line 100 — prose reference), `commands/gsd-t-quick.md` (line 22 — prose reference), `test/token-budget.test.js` (describe block, 7 tests).

After T1: callers of `getDegradationActions()` that read `.modelOverrides` or `.actions` will get `undefined`. The prose references in wave/quick become stale instructions. All must be updated in Wave 2 (DR-T3).

### `estimateMilestoneCost()` — SURVIVES through Wave 2, replaced in Wave 3

Called only from `commands/gsd-t-wave.md` (line 57). Survives unchanged through Wave 2. Wave 3 RE-T4 replaces it with `estimateRunway()`. Decommission only when runway estimator is wired.

### `estimateCost()`, `recordUsage()`, `getModelCostRatios()` — SAFE (no changes planned)

No consumers adding or removing calls. `recordUsage()` called from `commands/gsd-t-complete-milestone.md` — unaffected.

---

## Command-File Degradation Reference Inventory

Files with `downgrade`/`conserve` band references (live code, not archived):

| File | Lines | Type | Wave to fix |
|------|-------|------|-------------|
| `commands/gsd-t-execute.md` | 131, 132, 466, 617, 623, 624, 648 | bash snippets + prose | Wave 2 (DR-T3) |
| `commands/gsd-t-wave.md` | 100, 101, 134, 140, 141 | bash snippet + prose | Wave 2 (DR-T3) |
| `commands/gsd-t-quick.md` | 22, 23 | prose only | Wave 2 (DR-T3) |
| `bin/token-budget.js` | 33, 34, 150, 179, 180, 190–225 | live code — to be deleted in T1 | Wave 1 (DR-T1) |
| `bin/gsd-t.js` | 1549, 1552, 1560 | doStatus switch-case — dead branches post-T1 | Wave 1 (folded into DR-T1 or DR-T3) |
| `scripts/context-meter/threshold.js` | BANDS constant, bandFor() | live code in PostToolUse hook | Wave 1 (PLAN GAP — must fold into DR-T1) |
| `.gsd-t/contracts/token-budget-contract.md` | entire file | contract definition | Wave 1 (DR-T2) |
| `.gsd-t/contracts/context-meter-contract.md` | line 102, 174, 177 | threshold enum doc | Wave 1 or Wave 2 (DR-T2 or T3) |
| `docs/architecture.md` | 394, 413 | documentation | Wave 5 (DAT-T2) |
| `docs/GSD-T-README.md` | 455–456 | documentation | Wave 5 (DAT-T1) |
| `docs/infrastructure.md` | 255–256 | documentation | Wave 5 (DAT-T2) |
| `docs/methodology.md` | 89 | documentation | Wave 5 (DAT-T2) |
| `docs/prd-harness-evolution.md` | 302–572 | documentation §3.7 | Wave 2 (DR-T4) |
| `README.md` | 17, 351 | documentation | Wave 5 (DAT-T1) |
| `templates/CLAUDE-global.md` | 369–371 | template | Wave 2 (DR-T4) |
| `templates/CLAUDE-project.md` | 31, 42 | template | Wave 2 (DR-T4) |

---

## Memory and Compaction Impact

### Context Gate Bash Snippets — Migration Path

The wave and execute orchestrators each contain context-gate bash snippets that check exit codes 11 (conserve) and 12 (downgrade). After M35 Wave 1:

- **`gsd-t-execute.md` Step 3.5** (line 617): Must change 4-exit-code check to 2-exit-code check (`10` = stop, `13` = warn). The `11` and `12` branches for conserve/downgrade must be removed. Wave 2 DR-T3 handles this.
- **`gsd-t-execute.md` Step 5** (line 466): The mid-domain re-check exits `11` for conserve. After M35, the Step 0 runway check should replace this pattern. Wave 3 RE-T4 handles the Step 0 wire-up; Wave 2 DR-T3 cleans up the old exit code.
- **`gsd-t-wave.md` Step 0** (line 134): Same pattern — exits 10/11; must drop exit 11 branch. Wave 2 DR-T3.
- **`gsd-t-wave.md` Step 0 per-phase check** (line 97): References `getSessionStatus()` with threshold gate. Wave 2 DR-T3.

### Runway Estimator Migration from `estimateMilestoneCost()`

Current `gsd-t-wave.md` Step 0 calls `estimateMilestoneCost()` (line 57) for a feasibility estimate. Wave 3's runway estimator replaces this with a richer `estimateRunway()` call that also factors in `.context-meter-state.json` current pct, domain_type confidence grading, and the headless auto-spawn handoff. The old call can remain as a fallback during Wave 1-2 (it still works), but must be removed from Wave 2 docs sweep to avoid contradicting the new Step 0 pattern. Simplest approach: remove the old `estimateMilestoneCost` call in DR-T3 (Wave 2), accept that wave will run with no pre-flight estimate until RE-T4 (Wave 3) wires the runway check.

---

## Risk Register

| Domain | Risk Level | Justification |
|--------|-----------|---------------|
| degradation-rip-out | HIGH | Clean-break v3.0.0 contract; two hidden files (`scripts/context-meter/threshold.js`, `bin/gsd-t.js`) not in task plan that must be updated atomically with T1. Failure mode: state file continues writing stale band values that cascade into all consumers. |
| model-selector-advisor | MEDIUM | Open question on `/advisor` API surface (IMP-030); fallback path is known-good. 25 command files need `## Model Assignment` blocks — mechanical but high volume; any missed file is a doc-ripple violation at complete-milestone. |
| token-telemetry | MEDIUM | New JSONL schema frozen on creation; field additions only after v1.0.0. If schema is wrong at T1, all downstream consumers (runway estimator, optimizer) inherit the error. Validate schema design against `context-meter-contract.md` field names before freezing. |
| runway-estimator | MEDIUM | Depends on token-telemetry T1+T2 (JSONL schema + writer) and degradation-rip-out T2 (stop threshold = 85%). Conservative constant fallback (4%/task) means Wave 3 runs on estimates, not data — if the constant is too aggressive, it over-refuses and immediately triggers headless auto-spawn before a single M35 task completes. Tune constant conservatively but test the refusal path before Wave 4. |
| headless-auto-spawn | MEDIUM | Depends on runtime behavior of `node bin/gsd-t.js headless` in child process mode — the headless subcommand exists (M29), but `--resume` flag wiring to M35's runway handoff protocol is new. Mid-loop debug handoff is the most complex integration in M35. Risk: headless child doesn't pick up the continue-from context correctly. Mitigation: Wave 3 smoke tests before Wave 4 depends on it. |
| optimization-backlog | LOW | All new code; no existing callers; detection rules are non-blocking; failure is caught and logged by design. Highest risk is noisy recommendations (all rejected) — tracked as a meta-signal in the optimizer itself. |
| docs-and-tests | LOW | Documentation updates only, no executable code changes. Risk: PLAN phase under-counted docs blast radius (it did — see IMP-003 and IMP-004 gaps). Wave 5 must do a final grep sweep before marking complete. |

---

## Waves 1+2 Unguarded — Risk Acknowledgment

Per M35 definition: "Wave 3 onward should be executed with M35's own runway estimator and headless auto-spawn engaged." This means Wave 1 and Wave 2 execute without runway protection. Each Wave 1/2 task runs in the current context window with no pre-flight check. The risk is:
- If context approaches the stop threshold (85%) mid-Wave-2, the old behavior applies: `getSessionStatus()` returns `stop`, the command exits code 10, and the user must manually run `/clear` + `/gsd-t-resume`.
- This is the same risk as any current milestone execution — no regression.
- After M35 Wave 3 deploys the runway estimator, Wave 4 and Wave 5 benefit from protection.

---

## Test Impact

| Test File | Status | Action Needed |
|-----------|--------|---------------|
| `test/token-budget.test.js` | WILL FAIL (7–9 tests) after T1 unless atomically updated | Delete `getDegradationActions` describe block tests for old shape; delete `getSessionStatus()` tests for `downgrade`/`conserve` thresholds; add new 3-band tests in same commit as T1 |
| `test/model-selector.test.js` | NEW — create | 15 tests for model-selector.js |
| `test/advisor-integration.test.js` | NEW — create | 10 tests for advisor-integration.js |
| `test/runway-estimator.test.js` | NEW — create | 20 tests for runway-estimator.js |
| `test/token-telemetry.test.js` | NEW — create | 15 tests for token-telemetry.js |
| `test/token-optimizer.test.js` | NEW — create | 10 tests for token-optimizer.js |
| `test/headless-auto-spawn.test.js` | NEW — create | 8 tests for headless-auto-spawn.js |
| `test/runway-debug-handoff.test.js` | NEW — create | 5 tests for debug mid-loop handoff |
| All other existing tests | WILL PASS | No changes to their domains |

**Baseline**: 941 tests passing (confirmed 2026-04-14).
**Target**: ~1030 tests after M35 (~89 net new, accounting for ~9 deleted in token-budget.test.js).

---

## Recommended Execution Order

1. **Wave 1 (parallel-safe):**
   - DR-T1: Rewrite `getDegradationActions()` + retune thresholds in `bin/token-budget.js` AND simultaneously update `scripts/context-meter/threshold.js` BANDS + `bandFor()` AND update `bin/gsd-t.js` `doStatus()` switch-case AND update failing tests atomically. Full suite must be green before Wave 1 gate.
   - DR-T2: Rewrite `token-budget-contract.md` v3.0.0 (after T1 implementation is complete).
   - MSA-T1: Resolve `/advisor` API open question (investigation only, no code).
   - TT-T1: Draft JSONL schema and `token-telemetry-contract.md` v1.0.0 (parallel with DR, no code dependencies).
   - TT-T2: Implement `bin/token-telemetry.js` skeleton.
   - **Wave 1 gate**: token-budget suite green (941 tests, 9 old deleted + 9 new), threshold.js updated, context-meter-contract.md updated.

2. **Wave 2 (parallel after Wave 1 gate):**
   - DR-T3: Sweep 6 command files (execute, wave, quick, integrate, debug, doc-ripple) — replace Token Budget Check blocks, clean up exit-code 11/12 branches.
   - DR-T4: Rewrite `docs/prd-harness-evolution.md` §3.7 and update `templates/CLAUDE-global.md` + `templates/CLAUDE-project.md`.
   - MSA-T2: Implement `bin/model-selector.js`.
   - MSA-T3: Implement `bin/advisor-integration.js`.
   - MSA-T4: Create `model-selection-contract.md` v1.0.0.
   - MSA-T5: Inject `## Model Assignment` blocks into all subagent-spawning command files.
   - MSA-T6: Update both CLAUDE templates with Model Assignment convention.
   - TT-T3: Wire per-spawn token brackets into 6 command files.
   - TT-T4: Implement `gsd-t metrics --tokens/--halts/--context-window` CLI.
   - TT-T5, TT-T6: Remaining telemetry tasks.

3. **Wave 3 (after Wave 2 gate):**
   - RE-T1: Implement `bin/runway-estimator.js` core.
   - RE-T2: Create `runway-estimator-contract.md` v1.0.0.
   - RE-T3: Write `test/runway-estimator.test.js`.
   - RE-T4: Wire runway Step 0 into 5 command files.
   - HAS-T1: Implement `bin/headless-auto-spawn.js`.
   - HAS-T2: macOS notification integration.
   - HAS-T3: Debug mid-loop handoff.
   - RE-T5: Smoke test for runway refusal triggering headless auto-spawn.

4. **Wave 4 (after Wave 3 gate — smoke tests pass):**
   - OB-T1–T4: token-optimizer, backlog commands, complete-milestone wiring.
   - HAS-T4: Interactive read-back banner.
   - HAS-T5: Final smoke tests + user notification test.

5. **Wave 5 (docs + tests ripple + complete):**
   - DAT-T1–T8: All doc updates; final grep sweep; version bump.

---

## Generated Tasks

These are gaps identified by impact analysis that the PLAN phase missed. Per execution constraints, do NOT modify tasks.md. Executing agent must handle inline with the closest containing task:

- [ ] IMP-003-REMEDIATION: Fold `scripts/context-meter/threshold.js` `BANDS` + `bandFor()` update into degradation-rip-out T1. Same atomic commit.
- [ ] IMP-004-REMEDIATION: Fold `bin/gsd-t.js` `doStatus()` switch-case update into degradation-rip-out T1 or T3. Same atomic commit.
- [ ] IMP-010-REMEDIATION: When optimization-backlog T2 creates the 2 new command files, also update `bin/gsd-t.js` command count logic + help/router/README (4 files — project pre-commit gate requirement).
- [ ] IMP-CONTEXT-METER-CONTRACT: Update `context-meter-contract.md` threshold enum to remove `downgrade`/`conserve` when threshold.js is updated (can fold into DR-T2 or DR-T1).

---

## Contract Status at Execution Start

| Contract | Current Version | Post-M35 Target | Action |
|----------|----------------|-----------------|--------|
| `token-budget-contract.md` | 2.0.0 ACTIVE | 3.0.0 REWRITE | Wave 1 DR-T2 |
| `context-meter-contract.md` | 1.0.0 ACTIVE | 1.1.0 UPDATE | Wave 1 DR-T1 or DR-T2 (fold in) |
| `model-selection-contract.md` | (none) | 1.0.0 NEW | Wave 2 MSA-T4 |
| `runway-estimator-contract.md` | (none) | 1.0.0 NEW | Wave 3 RE-T2 |
| `token-telemetry-contract.md` | (none) | 1.0.0 NEW | Wave 1 TT-T1 |
| `headless-auto-spawn-contract.md` | (none) | 1.0.0 NEW | Wave 3 HAS-T1 |

---

## Final Verdict

**PROCEED WITH CAUTION**

Four breaking changes identified (IMP-001 through IMP-004). All four are:
- Fully contained within M35's own task plan (or can be folded in without task-list modification)
- Logically ordered by the wave structure
- Low risk of data loss or irreversible failure

The most significant risk is IMP-003 (a gap in the PLAN phase): `scripts/context-meter/threshold.js` is not in any domain task list but must be updated in sync with `bin/token-budget.js` T1. Executing agent must fold this into degradation-rip-out T1. The executing agent should also fold `bin/gsd-t.js` `doStatus()` into the same pass (IMP-004).

Wave 1 and Wave 2 execute without M35's own runway protection. This is expected per the M35 definition. No regression from current behavior.

The clean-break token-budget-contract v3.0.0 is safe: no external consumers confirmed via grep. All consumers are in-repo command files covered by the wave plan.

Confidence in PROCEED: HIGH. All risks enumerated, all remediations within M35 scope.
