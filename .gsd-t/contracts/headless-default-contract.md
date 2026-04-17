# Contract: headless-default-contract

**Version**: 1.0.0
**Status**: ACTIVE — M38 Domain 1 (finalized 2026-04-16 by H1-T1)
**Owner**: m38-headless-spawn-default
**Consumers**: every command file that spawns subagents; m38-meter-reduction (Domain 2 strips meter callsites that this contract obviates); m38-unattended-event-stream (Domain 3 — independent); m38-router-conversational (Domain 4 — independent); m38-cleanup-and-docs (Domain 5 — folds 3 deleted contracts into this one)

**Folded contracts** (deleted by Domain 5 on M38 ship):
- `headless-auto-spawn-contract.md` v1.0.0 (M35) — superseded; this contract is the new home
- `runway-estimator-contract.md` v1.0.0 (M35) — runway estimator deleted by Domain 2; no replacement (headless-by-default removes the need)
- `token-telemetry-contract.md` v1.0.0 (M35) — telemetry deleted by Domain 2; no replacement (per-spawn telemetry was instrumentation for the meter, not for users)

---

## 1. Purpose

Subagent spawns from GSD-T command files default to **headless** (`autoSpawnHeadless()` from `bin/headless-auto-spawn.cjs`) instead of in-context Task spawn. The parent context grows much slower because subagent transcripts never inflate it. Headless results land via the existing read-back banner mechanism (`bin/check-headless-sessions.js`) on the user's next message.

This is the architectural shift M38 ships: treat the cause (parent context grows from in-context subagent transcripts), not the symptom (predict-and-pause when full).

## 2. The `--watch` Flag

User-invoked commands accept `--watch` to opt back into in-context streaming for **primary work spawns only**.

### Propagation Rules

| Spawn type | Default | `--watch` propagates? |
|------------|---------|------------------------|
| Primary work (execute domain workers, debug fix agent, quick's main task) | headless | yes — streams in-context |
| QA validation | headless | **no** — always headless |
| Red Team adversarial QA | headless | **no** — always headless |
| Design Verification | headless | **no** — always headless |
| Doc-ripple agents | headless | **no** — always headless |
| Unattended supervisor workers | headless (detached) | **rejected** — passing `--watch` to `gsd-t-unattended` errors |

### `--watch` Acceptance

- `gsd-t-execute --watch` → primary domain workers stream
- `gsd-t-quick --watch` → quick's inner subagent streams
- `gsd-t-debug --watch` → debug fix-loop agent streams
- `gsd-t-wave` → primary phase agents respect `--watch`; validation spawns ignore it
- `gsd-t-integrate --watch` → integration agent streams
- `gsd-t-scan` → dimension subagents respect `--watch`
- `gsd-t-verify` → verification subagents respect `--watch`
- `gsd-t-unattended --watch` → **error** with message: "Unattended supervisor is detached by definition. `--watch` is incompatible. Run `/gsd-t-unattended-watch` from your interactive session to see live activity."

### Default Behavior (no flag)

Every subagent spawn goes headless. The user sees:
1. A brief one-line status when each spawn launches: `⚙ [{model}] {command} → {description} (headless)`
2. The read-back banner on their next message: `## Headless runs since you left` listing completed sessions

## 3. Spawn Primitive Contract

`autoSpawnHeadless({command, args, projectDir, sessionContext, watch=false, spawnType='primary', context, continue_from, sessionId})` — the default subagent spawn primitive used by command files.

### Inputs

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | yes | Slash command name (e.g., `gsd-t-execute`) — bare form, no `/` prefix. May include the `gsd-t-` prefix; `stripGsdtPrefix()` normalizes. |
| `args` | string[] | no | Command arguments to pass through to the child `gsd-t headless` invocation. Defaults to `[]`. |
| `projectDir` | string | no | Absolute project directory. Defaults to `process.cwd()`. |
| `sessionContext` | object | no | Alias of `context` for readability in new callsites. Identical behavior. |
| `context` | object | no | Snapshot written to `.gsd-t/headless-sessions/{id}-context.json`. When omitted, `buildContextSnapshot(projectDir)` captures progress.md header + last Decision Log entry. |
| `continue_from` | string | no | Relative path passed to child for continuation. Defaults to `"."`. |
| `sessionId` | string | no | Enables the handoff-lock gate — callers that set it acquire `.gsd-t/.handoff/lock-{sessionId}` across the write+spawn window. Callsites that do not set it keep pre-m36 behavior. |
| `watch` | boolean | no | If `true` AND `spawnType === 'primary'`, signal fallback to in-context Task spawn. Default `false`. |
| `spawnType` | string | no | Enum `'primary'` \| `'validation'`. Default `'primary'`. Controls `--watch` propagation. |

### Outputs

Returns synchronously:
```
{ id: string, pid: number, logPath: string, timestamp: string, mode: 'headless' | 'in-context' }
```
- `mode: 'headless'` — default headless path; detached child running `node bin/gsd-t.js headless {command} [args] --log`
- `mode: 'in-context'` — `watch=true && spawnType==='primary'`; `{id, pid, logPath}` are `null` sentinels and the caller falls back to in-context Task spawn (existing M35-and-prior pattern). The OBSERVABILITY LOGGING block still runs around the Task spawn.

### Behavior matrix

| `watch` | `spawnType` | Behavior |
|---------|-------------|----------|
| `false` | `'primary'` | headless — detached child, read-back banner surfaces result |
| `false` | `'validation'` | headless — detached child (same path) |
| `true`  | `'primary'` | returns `{mode: 'in-context'}` signal; caller performs in-context Task spawn |
| `true`  | `'validation'` | logs `[headless-default] --watch ignored for validation spawn type: {type}` to stderr; proceeds headless |

### Session artifacts (headless mode)

- `.gsd-t/headless-sessions/{id}.json` — running session with `status: 'running'`; updated to `status: 'completed'` with `exitCode` + `endTimestamp` via `markSessionCompleted()`
- `.gsd-t/headless-sessions/{id}-context.json` — serialized `context` or `buildContextSnapshot()` capture
- `.gsd-t/headless-{id}.log` — child stdout+stderr (via `logFd` opened in `autoSpawnHeadless`)
- On user's next message, `bin/check-headless-sessions.js printBannerIfAny()` surfaces `status: 'completed' && surfaced !== true` sessions, then marks them `surfaced: true`.

## 4. Threshold Crossing — Silent Orchestrator Action

When the local-estimator hook reports context above threshold (Domain 2 owns the simplified single-band semantics), the orchestrator silently routes the next subagent spawn through `autoSpawnHeadless()` regardless of `--watch`. NO MANDATORY STOP banner. NO ceremony.

The user sees:
- Brief log: `⚙ [orchestrator] context above threshold ({pct}%) — next spawn forced headless`
- Activity continues without ritual

This replaces the M37 Universal Auto-Pause Rule's MANDATORY STOP behavior with a structural fix: the spawn that would have been the straw that broke the camel's back goes headless instead.

## 5. Read-Back Banner

Existing mechanism in `bin/check-headless-sessions.js` is unchanged. On user's next message, the banner formats completed sessions:

```
## Headless runs since you left
- {sessionId} — {command} {args} — completed in {duration} — exit {code}
  → see {logPath}
```

Sessions are marked `surfaced: true` after first banner display.

## 6. Migration

- Wave 1 Domain 1: command files convert spawn callsites from in-context Task to `autoSpawnHeadless()`. The OBSERVABILITY LOGGING block is preserved.
- Wave 1 Domain 2: deletes meter machinery (runway-estimator, telemetry, three-band, dead-meter detection) — safe because Domain 1's spawn-time orchestrator action replaces the runway estimator's preventative role.
- Wave 2 Domain 5: deletes the 3 folded contracts; CHANGELOG documents the architectural shift.

## 7. Test Coverage

- `test/headless-auto-spawn.test.js` — extends existing 16+ tests with `--watch` propagation rule cases
- `test/headless-default.test.js` — NEW — tests for `--watch` rejection by unattended, validation-spawn-always-headless rule, threshold-cross silent routing
- `test/filesystem.test.js` — command count adjusted for Domain 4's 3 conversational deletions and Domain 5's 4 self-improvement deletions

## Appendix A: Spawn Callsite Conversion Map

Authored by H1-T1 audit (2026-04-16). Consumed by H1-T3 / H1-T4 / H1-T5 conversion tasks. Each item below becomes an `autoSpawnHeadless({..., spawnType: 'primary' | 'validation', watch: $WATCH_FLAG})` call.

### commands/gsd-t-execute.md (14 spawns)
- Step 2 (validation) — QA subagent runs full test suite, reports pass/fail + coverage gaps
- Step 3 (primary) — Domain task-dispatcher fresh-dispatch spawn per task
- Step 3 (validation) — Post-task QA subagent (inline QA after each task)
- Step 5.25 (validation) — Design Verification Agent (when design contract exists)
- Step 5.5 (validation) — Red Team adversarial QA per domain
- Step 5.5 (validation) — Doc-ripple agent blast-radius analysis

### commands/gsd-t-wave.md (9 spawns)
- Step 3 (primary) — Phase agent spawn per wave phase (PARTITION → DISCUSS → PLAN → IMPACT → EXECUTE → TEST-SYNC → INTEGRATE → VERIFY+COMPLETE)
- Step 3 (validation) — Post-phase spot-check agent (status/git/filesystem)
- Step 3 (validation) — Phase transition event writer

### commands/gsd-t-integrate.md (2 spawns)
- Step 5 (validation) — QA subagent for contract compliance at domain boundaries
- Step 7.5 (validation) — Red Team adversarial validation of integrated system

### commands/gsd-t-quick.md (4 spawns)
- Step 0.1 (primary) — Fresh-dispatch subagent runs the quick task
- Step 5.25 (validation) — Design Verification Agent (when design contract exists)
- Step 5.5 (validation) — Red Team adversarial validation
- Step 6 (validation) — Doc-ripple agent blast-radius analysis

### commands/gsd-t-debug.md (5 spawns)
- Step 0.1 (primary) — Fresh-dispatch subagent runs the debug session
- Step 1.5 (validation) — 3 parallel Deep Research teammates (root-cause, alternatives, prior-art) when debug loop detected
- Step 5.3 (validation) — Red Team adversarial validation post-fix
- Step 6 (validation) — Doc-ripple agent blast-radius analysis

### commands/gsd-t-scan.md (6 spawns)
- Step 0 (primary) — Fresh-dispatch subagent runs the scan
- Step 2 (primary) — 5 parallel dimension agents (architecture, business-rules, security, quality, contracts)
- Step 3 (primary) — Synthesis agent → tech-debt register
- Step 5 (validation) — Living-document updater agent
- Step 8 (validation) — HTML report generator

### commands/gsd-t-verify.md (2 spawns)
- Step 4 (primary|validation) — Team-mode 4 parallel verification agents (functional, contracts, quality, security) OR solo through each dimension. **Treat as `spawnType: 'validation'`** per constraints — verify is validation by nature, the work product is a verdict, not a code change.
- Step 8 (validation) — Auto-invoke complete-milestone spawn (preserves verify → complete-milestone chaining)

### Argument Parsing Gap

None of the 7 files currently has a `## Argument Parsing` section. H1-T3..T6 must add this stub near the top of each user-invocable file (`execute`, `quick`, `debug`, `wave`, `integrate`, `scan`, `verify`). Detect `--watch` in `$ARGUMENTS` and set `WATCH_FLAG=true` (default `false`).

### OBSERVABILITY LOGGING Compliance

Six of seven files (all except `gsd-t-scan.md`) already have the required block per project CLAUDE.md. Conversions MUST preserve these blocks — wrap `autoSpawnHeadless()` calls with the same `T_START` / `T_END` / `DURATION` / `token-log.md` append pattern used around the current `Task(...)` spawns.

---

## Version History

- **1.0.0** (M38, target v3.12.10) — NEW. Folds and supersedes headless-auto-spawn-contract v1.0.0. Folds-and-deletes runway-estimator-contract v1.0.0 + token-telemetry-contract v1.0.0 (no replacement; headless-by-default obviates them). §3 spawn primitive signature finalized against actual `autoSpawnHeadless()` exports in `bin/headless-auto-spawn.cjs`. Appendix A Conversion Map authored by H1-T1 audit 2026-04-16.
