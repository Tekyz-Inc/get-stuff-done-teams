# Contract: Context Meter

## Version: 1.3.0
## Status: ACTIVE
## Owner: m38-meter-reduction domain
## Consumers: context-meter-hook (reads config), token-budget (reads state file), installer-integration (installs hook, validates config), orchestrator (reads threshold band to trigger silent headless handoff)

## Changelog
- **v1.3.0** (2026-04-16) — **Meter Reduction** (M38). Collapses three-band model to single-band: `normal` and `threshold` only. Deletes `warn`, `stop`, `downgrade`, `conserve`, `dead-meter`, `stale` bands. Deletes `getDegradationActions`. Deletes Universal Auto-Pause MANDATORY STOP banner in `additionalContext` — replaced with silent marker consumed by the orchestrator to trigger `autoSpawnHeadless()` on the next subagent spawn. Deletes resume-time health check (Step 0.6). Deletes `deadReason` field from state and gate return. Rationale: M37's elevation was the right symptom fix but wrong enforcement layer — M38 moves overflow prevention into structure (headless-by-default) instead of runtime banners Claude routinely ignored. See M38 milestone notes.
- **v1.2.0** (2026-04-16) — [SUPERSEDED] Universal Auto-Pause (M37). Made `additionalContext` a multi-line MANDATORY STOP. Removed in v1.3.0.
- **v1.1.0** (2026-04-15) — [SUPERSEDED] Added `stale` band and resume-time health check. Removed in v1.3.0.
- **v1.0.0** (2026-03) — M34 initial release.

---

## Purpose

Defines the configuration schema, state file format, and hook I/O contract for the GSD-T Context Meter — a PostToolUse hook that measures Claude Code context window usage via local character-based token estimation and signals the orchestrator to spawn the next subagent headless when usage exceeds a configurable threshold.

M38 collapses the meter to its irreducible core: a single threshold, a single signal, and a silent handoff. The meter no longer tries to instruct Claude — the orchestrator reads the band and routes spawns accordingly.

---

## Config File: `.gsd-t/context-meter-config.json`

Shipped template lives at `templates/context-meter-config.json`. Copied into downstream projects on `gsd-t init` and `gsd-t update-all`.

### Schema (v1)

```json
{
  "version": 1,
  "thresholdPct": 75,
  "modelWindowSize": 200000,
  "checkFrequency": 5,
  "statePath": ".gsd-t/.context-meter-state.json",
  "logPath": ".gsd-t/context-meter.log",
  "timeoutMs": 2000
}
```

### Field reference

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `version` | integer | `1` | Schema version. Loader rejects unknown major versions. |
| `thresholdPct` | number (0 < n < 100) | `75` | Percentage of `modelWindowSize` at which the band flips from `normal` to `threshold`. |
| `modelWindowSize` | integer > 0 | `200000` | Model's context window in tokens (Opus 4.6+, Sonnet 4.6 = 200K). |
| `checkFrequency` | integer ≥ 1 | `5` | Hook runs estimation every Nth PostToolUse invocation (1 = every tool call). |
| `statePath` | relative path | `".gsd-t/.context-meter-state.json"` | Where the hook writes the latest reading for consumers. |
| `logPath` | relative path | `".gsd-t/context-meter.log"` | Diagnostic log (hook failures, parse errors). Never logs message content. |
| `timeoutMs` | integer > 0 | `2000` | Hard timeout on transcript parsing + estimation. Hook fails open on timeout. |

### Validation rules (enforced by loader)

- `version` must equal `1`. Unknown versions → error with migration pointer.
- Numeric ranges as listed above.
- Reject any field matching the regex `/api.?key/i` — estimation is local; no keys belong here.

### Loader: `bin/context-meter-config.cjs`

```javascript
/**
 * Load and validate context meter config.
 * @param {string} [projectRoot] - defaults to cwd
 * @returns {{ version: 1, thresholdPct: number, modelWindowSize: number,
 *             checkFrequency: number, statePath: string, logPath: string,
 *             timeoutMs: number }}
 * @throws {Error} - only on unknown schema version (missing file → defaults)
 */
function loadConfig(projectRoot)
```

### v1.3.0 field removal

`apiKeyEnvVar` is removed from the schema. Local estimation (v3.12+) doesn't call any API. Existing config files with this field remain readable — the loader simply ignores the field and emits no warning. Template files ship without it.

---

## State File: `.gsd-t/.context-meter-state.json`

Written atomically by the hook after each successful estimation. Read by `bin/token-budget.cjs` and the orchestrator spawn path.

### Schema (v1)

```json
{
  "version": 1,
  "timestamp": "2026-04-16T18:05:23.000Z",
  "inputTokens": 124350,
  "modelWindowSize": 200000,
  "pct": 62.175,
  "threshold": "normal",
  "checkCount": 47,
  "lastError": null
}
```

### Field reference

| Field | Type | Meaning |
|-------|------|---------|
| `version` | integer | State schema version (`1`). |
| `timestamp` | ISO 8601 string | When this reading was taken (UTC). |
| `inputTokens` | integer | Estimated input tokens from transcript parse. |
| `modelWindowSize` | integer | Copied from config at read time (for consumer convenience). |
| `pct` | number | `(inputTokens / modelWindowSize) * 100`. |
| `threshold` | enum | `"normal"` (pct < thresholdPct) or `"threshold"` (pct ≥ thresholdPct). |
| `checkCount` | integer | Cumulative estimations this session (monotonic). |
| `lastError` | object \| null | If the last check failed, a `{code, message, timestamp}` diagnostic. Null on success. |

### Staleness semantics

- Fresh: `timestamp` within last 5 minutes → `token-budget.getSessionStatus()` uses real data.
- Stale: older than 5 minutes OR file missing → `getSessionStatus()` falls back to the historical heuristic from `.gsd-t/token-log.md`. The gate treats stale the same as normal — no special band, no user-facing alarm.
- This file is ephemeral session state — DO NOT commit it. Installer adds it to `.gitignore` during install.

### v1.3.0 field removal

`deadReason` is no longer written. State files from v1.1/v1.2 that contain this field remain readable; the loader simply ignores it. The `stale` value for `threshold` is no longer produced — legacy state files written with `threshold: "stale"` are mapped to `"normal"` at read time with no error.

---

## Hook I/O: `scripts/gsd-t-context-meter.js`

### Input (from Claude Code PostToolUse hook payload on stdin)

```json
{
  "session_id": "abc-123",
  "transcript_path": "/Users/.../claude-code/projects/.../abc-123.jsonl",
  "tool_name": "...",
  "tool_input": { ... },
  "tool_response": { ... }
}
```

Hook reads the JSON payload from stdin, extracts `transcript_path`, parses it locally, and writes the state file.

### Output (stdout, JSON)

- **Below threshold** (or any failure mode):
  ```json
  {}
  ```
- **At or above threshold** (v1.3.0 — short silent marker):
  ```json
  {
    "additionalContext": "next-spawn-headless:true"
  }
  ```

The marker is a machine-readable breadcrumb for the orchestrator, NOT a user-facing instruction. Claude sees the line in context but should not treat it as a command. The orchestrator's spawn path reads `.gsd-t/.context-meter-state.json` directly and honors the `threshold` band — the marker is a redundant cross-check.

Empty output (`{}`) is the **safe default** for every failure mode: parse error, missing transcript, timeout, malformed state, etc. The hook NEVER blocks Claude and NEVER emits a user-facing STOP banner.

### Latency budget

- Total hook execution: **< 200ms**.
- Transcript parse + estimation: `timeoutMs` from config (default 2000ms).
- On timeout: return `{}` immediately, log to `logPath`, update `lastError` in state file.

### checkFrequency gate

The hook maintains a per-session counter in `statePath` (`checkCount` field). Every PostToolUse invocation increments the counter. Estimation runs only when `checkCount % checkFrequency === 0`. Otherwise the hook returns `{}`.

---

## Token estimation (local, zero API cost)

Since v3.12, the context meter uses **local character-based estimation** — no Anthropic API calls, no API key, no network.

- Method: Parse transcript → measure total character count → divide by 3.5 (chars per token)
- Module: `scripts/context-meter/estimate-tokens.js`
- Accuracy: Within ~5–10% of `count_tokens` API. For a single threshold with no intermediate bands, this is more than sufficient — the threshold is imprecise by nature (it's a heuristic, not a hard limit).
- Cost: Zero.
- The 3.5 chars/token ratio slightly overestimates token count, which is the safe direction (triggers handoff earlier, not later).

---

## Threshold mapping (single-band, v1.3.0)

| pct | threshold | orchestrator action |
|-----|-----------|---------------------|
| `< thresholdPct` | `normal` | Proceed; next subagent spawn goes headless-by-default (per M38 headless-default-contract) or inline per command settings. |
| `≥ thresholdPct` | `threshold` | Next subagent spawn MUST go through `autoSpawnHeadless()` regardless of command default. Silent — no user-visible STOP. |

There are no intermediate bands, no dead-meter state, no stale band, no special user-facing messaging. The orchestrator reads the band from state and routes; Claude is not asked to stop or to display banners.

---

## Rules

1. **Fail open always**: The PostToolUse hook returns `{}` on every error path — parse failure, missing transcript, timeout, unreadable state file, unknown config version. It must never block Claude and never emit a user-facing instruction.
2. **No message content in logs**: the diagnostic log contains token counts, parse error categories, and timings — never messages.
3. **State file is not committed**: installer adds `.gsd-t/.context-meter-state.json` and `.gsd-t/context-meter.log` to `.gitignore` during install.
4. **Transcript format is not a public contract**: Claude Code's transcript JSONL format is undocumented upstream. `transcript-parser.js` must tolerate unknown fields and unfamiliar event types.
5. **Backward-compatible contract for projects without the meter**: projects where `.gsd-t/.context-meter-state.json` is entirely missing continue to function — `token-budget.getSessionStatus()` falls back to the heuristic.
6. **Threshold band is the orchestrator's signal, not Claude's**: The `threshold` band triggers `autoSpawnHeadless()` in the spawn path (see headless-default-contract). Claude itself should not interpret the band or the `additionalContext` marker as an instruction.
7. **No inference keys**: Estimation is local. If a future hook needs an API key, it must use a distinct env var — never reintroduce `apiKeyEnvVar` under the meter.

---

## Breaking Changes from v1.2.0 → v1.3.0

1. **`getDegradationActions` export removed** from `bin/token-budget.cjs`. Any consumer calling it must switch to reading `{pct, threshold}` from `getSessionStatus()` and making their own routing decision.
2. **`bandFor(pct)` return values narrowed** from `"normal"|"warn"|"downgrade"|"conserve"|"stop"|"dead-meter"|"stale"` to `"normal"|"threshold"`. Consumers that switch-cased on intermediate bands must collapse to the two-state model.
3. **`additionalContext` payload shape changed** from multi-line MANDATORY STOP banner to short silent marker. Any command file or subagent prompt that depended on the STOP banner wording (M37 Step 0.2) must be updated to read the state file band directly.
4. **`deadReason` field removed** from state file and from `getSessionStatus()` return. Consumers that surfaced `deadReason` must drop that UI.
5. **Resume-time health check (Step 0.6) removed**. `gsd-t-resume` no longer runs a meter-dead gate. If the meter state file is absent or stale, resume proceeds normally — the fallback heuristic handles it.
6. **Universal Auto-Pause Rule removed** from `CLAUDE-global.md` template. The `## Step 0.2: Auto-Pause Rule` block is removed from all loop commands (execute, wave, integrate, quick, debug).

## Migration note for downstream projects

On `gsd-t version-update-all`:
- Template `.gsd-t/contracts/context-meter-contract.md` overwritten to v1.3.0.
- Existing state files require no migration (backward-compatible read).
- Existing config files require no migration (unused fields ignored).
- Command file deletions propagate automatically via template overwrite in the same update pass.
