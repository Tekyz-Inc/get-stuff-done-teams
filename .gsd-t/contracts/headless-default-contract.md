# Contract: headless-default-contract

**Version**: 2.1.0
**Status**: ACTIVE — M43 D4 (channel-separation inversion; Wave 3, 2026-04-21) + M46 D2 (worker sub-dispatch; 2026-04-23)
**Owner**: m43-d4-default-headless-inversion
**Predecessor**: v1.0.0 (M38 Domain 1, 2026-04-16) — `.gsd-t/contracts/_archived/headless-default-contract-v1.0.0.md` if archived; otherwise this file's §Version History preserves the prior semantics.
**Consumers**: every command file that spawns subagents (`gsd-t-execute`, `gsd-t-wave`, `gsd-t-quick`, `gsd-t-integrate`, `gsd-t-debug`, `gsd-t-verify`, `gsd-t-scan`, `gsd-t-test-sync`, `gsd-t-complete-milestone`, `gsd-t-gap-analysis`, `gsd-t-populate`, `gsd-t-feature`, `gsd-t-project`, `gsd-t-partition`); the `/gsd` router (Step 2 action-turn handoff).

**Folded contracts** (deleted by M38 Domain 5 on M38 ship, preserved here for traceability):
- `headless-auto-spawn-contract.md` v1.0.0 (M35) — superseded; this contract is the home
- `runway-estimator-contract.md` v1.0.0 (M35) — runway estimator deleted; no replacement
- `token-telemetry-contract.md` v1.0.0 (M35) — telemetry deleted; no replacement

---

## 1. Purpose

Subagent spawns from GSD-T command files default to **headless** (`autoSpawnHeadless()` from `bin/headless-auto-spawn.cjs`) — the parent context never inflates with subagent transcripts. Headless results land via the read-back banner mechanism (`bin/check-headless-sessions.js`) on the user's next message.

v2.0.0 strengthens v1.0.0 by removing every remaining escape hatch. The architectural shift is complete: the dialog channel is reserved for human↔Claude conversation; everything else spawns.

## 2. Invariants (v2.0.0)

1. **Every command spawns**, unconditionally. No opt-out flag. No context-meter threshold. No low-water-mark bypass.
2. **The only in-session surface is the `/gsd` router** (`commands/gsd.md`), and only for dialog-only (exploratory) turns. Every workflow turn the router classifies (Step 2.5) spawns detached unconditionally.
3. **`shouldSpawnHeadless` is a constant `() => true`.** The export is retained for backward-compat with any caller that imported it from a v1.x consumer.
4. **Legacy `watch` / `inSession` params are accepted but ignored.** `autoSpawnHeadless()` emits a one-shot stderr deprecation warning on first encounter within a process; no functional effect. Scheduled for removal in v3.0.0.
5. **The context-meter bands are observational only.** `getSessionStatus()` still returns `{pct, threshold}`; command files record `pct` into the token-log `Ctx%` column on the next spawn. The `threshold` value does NOT gate any spawn decision (it did in v1.x).
6. **`/gsd` router dialog-growth footer (D5) is unchanged.** Pure read/warn signal. Never refuses, never reroutes.

## 3. What Was Deleted from v1.0.0

- The `--watch` flag's `watch=true + spawnType='primary' → {mode: 'in-context'}` fallback branch in `autoSpawnHeadless()`. Now: all four rows of the propagation matrix are `headless`.
- The `--watch` flag on every user-invocable command file. The flag parse is removed; remaining prose explicitly states "ignored (stderr deprecation line)".
- The orchestrator's "threshold silently reroutes next spawn" prose in command files (Step 3.5 of `gsd-t-execute`, post-phase block of `gsd-t-wave`, Token Budget Check of `gsd-t-quick`). Replaced with "band captured for logging; no gating".
- The `--in-session` opt-out from the v1 spec. It was scoped for v2 in the partition-era plan, then explicitly deleted per channel-separation (2026-04-21 Decision Log entry).
- The 15% low-water bypass from the v1 spec. Same rationale.

## 4. Spawn Primitive Contract

`autoSpawnHeadless({command, args, projectDir, sessionContext, spawnType='primary', context, continue_from, sessionId})` — the single subagent spawn primitive used by every command file and by `/gsd`'s action-turn handoff.

### Inputs

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | yes | Slash command name (e.g., `gsd-t-execute`) — bare form. May include `gsd-t-` prefix; `stripGsdtPrefix()` normalizes. |
| `args` | string[] | no | Command arguments to pass through to the child `gsd-t headless` invocation. Default `[]`. |
| `projectDir` | string | no | Absolute project directory. Default `process.cwd()`. |
| `sessionContext` | object | no | Alias of `context`. |
| `context` | object | no | Snapshot written to `.gsd-t/headless-sessions/{id}-context.json`. When omitted, `buildContextSnapshot(projectDir)` captures progress.md header + last Decision Log entry. |
| `continue_from` | string | no | Relative path passed to child for continuation. Default `"."`. |
| `sessionId` | string | no | Enables the handoff-lock gate; callers that set it acquire `.gsd-t/.handoff/lock-{sessionId}` across the write+spawn window. |
| `spawnType` | string | no | Enum `'primary'` \| `'validation'`. Default `'primary'`. Used for observability classification only — both always go headless. |
| ~~`watch`~~ | boolean | no | **Deprecated under v2.0.0** — accepted for caller backward-compat, ignored. One-shot stderr deprecation warning. Scheduled for removal in v3.0.0. |
| ~~`inSession`~~ | boolean | no | **Deprecated under v2.0.0** — same as `watch`. Was never shipped functionally. |

### Outputs

Returns synchronously:
```
{ id: string, pid: number, logPath: string, timestamp: string, mode: 'headless' }
```
Under v2.0.0 `mode` is always `'headless'`. The `'in-context'` sentinel that v1.x returned for `watch=true + primary` has been removed.

### Propagation matrix (v2.0.0 — every row is headless)

| `watch` (ignored) | `spawnType` | Behavior |
|-------------------|-------------|----------|
| `false` | `'primary'` | headless — detached child, read-back banner surfaces result |
| `false` | `'validation'` | headless — detached child (same path) |
| `true`  | `'primary'` | headless; one-shot stderr deprecation warning |
| `true`  | `'validation'` | headless; one-shot stderr deprecation warning |

### Session artifacts

Unchanged from v1.0.0:
- `.gsd-t/headless-sessions/{id}.json` — running → completed
- `.gsd-t/headless-sessions/{id}-context.json` — context snapshot
- `.gsd-t/headless-{id}.log` — child stdout+stderr
- `bin/check-headless-sessions.js printBannerIfAny()` surfaces on user's next message; marks sessions `surfaced: true`

### Live transcript URL banner (M43 D6)

Preserved from M43 Wave 2 (`bin/headless-auto-spawn.cjs` commit 01f4534). Every spawn prints:

```
▶ Live transcript: http://127.0.0.1:{port}/transcript/{id}
```

The dashboard is autostarted via `scripts/gsd-t-dashboard-autostart.cjs::ensureDashboardRunning` before the banner line is emitted. Both are best-effort — banner failure never crashes the spawn.

### Worker Env Propagation

Unchanged from v1.0.0 (see v1 §3 Worker Env Propagation). `GSD_T_COMMAND`, `GSD_T_PHASE`, `GSD_T_PROJECT_DIR`, `GSD_T_TRACE_ID`, `GSD_T_MODEL`, `GSD_T_AGENT_ID`, `GSD_T_PARENT_AGENT_ID` all propagate to the detached child.

## 5. The `/gsd` Router

The router (`commands/gsd.md`) is the single in-session surface.

- **Exploratory / conversational turns** (Step 2.5 classifier → `conversational`) stay in the dialog channel. No command spawn. Header: `→ Conversational mode (no command spawn)`.
- **Workflow turns** (Step 2.5 classifier → `workflow`, action verbs like fix/add/implement/run/execute) proceed to Step 2 semantic evaluation and spawn the chosen command detached. Header: `→ Routing to /gsd-t-{command}: {reason}`.
- **Continuation turns** (Step 2a) route to the in-flight command; header: `→ /gsd ──▶ continue /gsd-t-{last-command}`.
- **Dialog-growth footer** (Step 5, M43 D5) — pure read/warn; never refuses, never reroutes.

## 6. Migration

- **From v1.0.0 → v2.0.0**: callers that pass `watch` or `inSession` continue to work — the values are ignored with a one-shot stderr deprecation. No code change required in consumers, but command files have been edited in the same commit to drop the flag parse and the threshold branching prose.
- **Removal target**: `watch` / `inSession` are removed from the `autoSpawnHeadless` signature in v3.0.0. Any remaining external consumer should drop them before then.

## 7. Test Coverage

- `test/headless-auto-spawn.test.js` — shape of return, session files, handoff lock wiring. Unchanged.
- `test/headless-default.test.js` — propagation matrix updated for v2.0.0: every row is now `headless`; the former `watch=true + primary → in-context` test is re-asserted as "spawns anyway, flag ignored".
- `test/m43-headless-default-inversion.test.js` — NEW — matrix across the 14 command files + `/gsd` router, asserting every action-turn row resolves to headless; grep-assertion that `--in-session` / `--headless` appear in zero operational command-file prose.
- `test/m43-url-banner.test.js` — D6 transcript URL banner preserved (unchanged).

## §Worker Sub-Dispatch (M46)

Added in v2.1.0. Defines how a single unattended worker iteration may itself fan out across file-disjoint tasks by reusing the M44-verified in-session dispatch instrument. **This section is purely additive** — no v2.0.0 invariant is altered.

### Trigger condition

A worker iteration sub-dispatches when **all** of the following hold:

1. `process.env.GSD_T_UNATTENDED_WORKER === '1'` — the iteration is running inside the unattended supervisor's worker child (not the orchestrator's in-session router, not a one-off headless detached spawn).
2. `tasks.length > 1` — there is more than one ready task assigned to the iteration.
3. The task set is **file-disjoint** per the existing disjointness contract (no two ready tasks declare overlapping file scopes). Disjointness is evaluated by the same predicate the in-session planner uses; the worker does not introduce a second predicate.

If any condition is false, the worker executes serially as before. Sub-dispatch is opt-in by environment + data shape; there is no flag a user sets.

### Delegation path

When the trigger fires, the worker invokes `bin/gsd-t-worker-dispatch.cjs`. That module is a thin adapter that:

1. Resolves the disjoint task set into the dispatch payload shape `runDispatch` already accepts.
2. Calls `bin/gsd-t-parallel.cjs::runDispatch(...)` — **the same M44-verified instrument** the in-session planner uses for its own fan-out.
3. Returns the per-task result envelopes back to the worker iteration for normal post-task accounting (token capture, event-stream rows, progress.md ripple).

D2 ships **no new dispatch logic.** It ships a new caller of `runDispatch`.

### Spawn-plan kind enum

The spawn-plan `kind` enum gains one value in v2.1.0:

| Kind | Meaning | Introduced |
|------|---------|------------|
| `unattended-worker` | Detached supervisor-launched worker child running an iteration. | M43 (v2.0.0) |
| `headless-detached` | One-shot detached headless spawn from a command file or router. | M43 (v2.0.0) |
| `in-session-subagent` | Subagent invoked inside the orchestrator dialog (router-classified action turn that runs `runDispatch` directly). | M44 |
| **`unattended-worker-sub`** | **NEW (v2.1.0).** A sub-task spawn produced by a worker iteration that delegated to `runDispatch` via `bin/gsd-t-worker-dispatch.cjs`. Distinguishes worker-originated fan-out children from orchestrator-originated `in-session-subagent` children for telemetry, event-stream filtering, and dashboard grouping. |

The new kind is observational. It does not gate any decision in `autoSpawnHeadless`, the supervisor, or the router; it exists so consumers (event stream, dashboard, token-log notes, replay tooling) can attribute a sub-task to its worker-iteration parent rather than to the orchestrator.

### Invariant: in-session dispatch path is unchanged

D2 is a **new consumer** of `runDispatch`, not a modifier of it. Specifically:

- `bin/gsd-t-parallel.cjs::runDispatch` accepts the same inputs and produces the same outputs it did under M44.
- The in-session planner's call site is byte-identical post-D2 — the worker adapter is a sibling caller, not a wrapper.
- Disjointness evaluation remains the single predicate it has been; the worker imports it rather than reimplementing.
- All M44 telemetry, token capture, and red-team gating behave identically for both callers; only the `kind` field on emitted spawn-plan rows differs.

Any future change that must alter `runDispatch` semantics is out of scope for v2.1.0 and requires its own contract version bump.

## Version History

- **2.1.0** (M46 D2, 2026-04-23) — Worker Sub-Dispatch. Additive §Worker Sub-Dispatch documents the rule that a worker iteration with `GSD_T_UNATTENDED_WORKER=1` + `tasks.length > 1` + file-disjoint tasks delegates to `bin/gsd-t-worker-dispatch.cjs` → `bin/gsd-t-parallel.cjs::runDispatch`. New spawn-plan kind enum value `unattended-worker-sub` distinguishes worker-originated fan-out children from orchestrator-originated `in-session-subagent` children. The in-session dispatch path is unchanged; D2 is a new CONSUMER of `runDispatch`, not a modifier.
- **2.0.0** (M43 D4, target v3.16.x) — NEW. Channel-separation inversion: every command spawns, unconditionally. `watch` / `inSession` deprecated (accepted-and-ignored; scheduled removal in v3.0.0). `shouldSpawnHeadless` collapsed to `() => true`. Threshold-driven rerouting prose stripped from command files; context-meter bands are observational only. Router (`/gsd`) is the single in-session surface, only for dialog-only turns.
- **1.0.0** (M38, v3.12.10, 2026-04-16) — Initial headless-by-default. Introduced `--watch` opt-in for primary spawns; validation spawns always headless. Folded three M35-era contracts. Threshold band (§4) silently rerouted the next spawn.
