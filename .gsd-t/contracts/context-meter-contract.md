# Contract: Context Meter

## Version: 1.2.0
## Status: ACTIVE
## Owner: context-meter-config domain
## Consumers: context-meter-hook (reads config), token-budget-replacement (reads state file), installer-integration (installs hook, validates config), m34-docs-and-tests (documents), gsd-t-resume (Step 0.6 meter-health check), all loop commands (execute, wave, integrate, quick, debug — auto-pause enforcement)

## Changelog
- **v1.2.0** (2026-04-16) — **Universal Auto-Pause** (M37). The `additionalContext` message is now a multi-line MANDATORY STOP instruction with the same enforcement weight as the Destructive Action Guard. All loop commands must treat this signal as an unignorable hard stop. See §"Universal Auto-Pause Rule".
- **v1.1.0** (2026-04-15) — Added the `stale` band and mandatory resume-time health check (Step 0.6). Fixes M36 regression where `ANTHROPIC_API_KEY` was unset and every PostToolUse hook call failed fail-open (`checkCount=2102`, `pct=0` forever, gate blind). See §"Stale Band and Resume Gating".
- **v1.0.0** (2026-03) — M34 initial release.

---

## Purpose

Defines the configuration schema, state file format, and hook I/O contract for the GSD-T Context Meter — a PostToolUse hook that measures real Claude Code context window usage via Anthropic's `count_tokens` endpoint and signals Claude to pause/clear/resume when usage exceeds a configurable threshold.

M34 replaces the `task-counter.cjs` proxy gate with this real measurement. The task counter is retired in the same milestone.

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
  "apiKeyEnvVar": "ANTHROPIC_API_KEY",
  "statePath": ".gsd-t/.context-meter-state.json",
  "logPath": ".gsd-t/context-meter.log",
  "timeoutMs": 2000
}
```

### Field reference

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `version` | integer | `1` | Schema version. Loader rejects unknown major versions. |
| `thresholdPct` | number (0 < n < 100) | `75` | Percentage of `modelWindowSize` at which the hook emits the pause signal. |
| `modelWindowSize` | integer > 0 | `200000` | Model's context window in tokens (Opus 4.6 / Sonnet 4.6 = 200K). |
| `checkFrequency` | integer ≥ 1 | `5` | Hook runs count_tokens every Nth PostToolUse invocation (1 = every tool call). |
| `apiKeyEnvVar` | non-empty string | `"ANTHROPIC_API_KEY"` | Name of the env var holding the Anthropic API key. Key is NEVER stored in config. |
| `statePath` | relative path | `".gsd-t/.context-meter-state.json"` | Where the hook writes the latest reading for consumers. |
| `logPath` | relative path | `".gsd-t/context-meter.log"` | Diagnostic log (hook failures, API errors). Never logs message content. |
| `timeoutMs` | integer > 0 | `2000` | Hard timeout on the count_tokens request. Hook fails open on timeout. |

### Validation rules (enforced by loader)

- `version` must equal `1`. Unknown versions → error with migration pointer.
- Numeric ranges as listed above.
- Reject any field matching the regex `/api.?key/i` unless the field name is exactly `apiKeyEnvVar` — prevents accidental key leakage into config.
- Reject any string value longer than 100 chars that looks hex-ish (`/^[a-zA-Z0-9_-]{64,}$/`) — same reason.

### Loader: `bin/context-meter-config.cjs`

```javascript
/**
 * Load and validate context meter config.
 * @param {string} [projectRoot] - defaults to cwd
 * @returns {{ version: 1, thresholdPct: number, modelWindowSize: number,
 *             checkFrequency: number, apiKeyEnvVar: string, statePath: string,
 *             logPath: string, timeoutMs: number }}
 * @throws {Error} - only on unknown schema version or API-key leak detection
 *                   (missing file → returns defaults silently)
 */
function loadConfig(projectRoot)
```

---

## State File: `.gsd-t/.context-meter-state.json`

Written atomically by the hook after each successful count_tokens call. Read by `bin/token-budget.js` and `bin/gsd-t.js doStatus`.

### Schema (v1)

```json
{
  "version": 1,
  "timestamp": "2026-04-14T18:05:23.000Z",
  "inputTokens": 124350,
  "modelWindowSize": 200000,
  "pct": 62.175,
  "threshold": "warn",
  "checkCount": 47,
  "lastError": null
}
```

### Field reference

| Field | Type | Meaning |
|-------|------|---------|
| `version` | integer | State schema version (`1`). |
| `timestamp` | ISO 8601 string | When this reading was taken (UTC). |
| `inputTokens` | integer | `input_tokens` value from the count_tokens response. |
| `modelWindowSize` | integer | Copied from config at read time (for consumer convenience). |
| `pct` | number | `(inputTokens / modelWindowSize) * 100`. |
| `threshold` | enum | One of `"normal"`, `"warn"`, `"downgrade"`, `"conserve"`, `"stop"`. Same levels as `token-budget-contract.md`. |
| `checkCount` | integer | Cumulative number of count_tokens calls this session (monotonic). |
| `lastError` | object \| null | If the last check failed, a `{code, message, timestamp}` diagnostic. Null on success. |

### Staleness semantics

- Fresh: `timestamp` within last 5 minutes → `token-budget.getSessionStatus()` uses real data.
- Stale: older than 5 minutes OR file missing → `getSessionStatus()` falls back to historical heuristic from `.gsd-t/token-log.md`.
- This file is ephemeral session state — DO NOT commit it. Installer adds it to `.gitignore` during install.

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

Hook reads the JSON payload from stdin, extracts `transcript_path`, and hands it to the parser.

### Output (stdout, JSON)

- **Threshold not exceeded** (or any failure mode):
  ```json
  {}
  ```
- **Threshold exceeded** (M37 v1.2.0 — multi-line MANDATORY STOP):
  ```json
  {
    "additionalContext": "🛑 MANDATORY STOP — Context window at 76.2% of 200000 (threshold: 75%).\nYou MUST stop what you are doing RIGHT NOW and execute these steps in order:\n1. Run /user:gsd-t-pause to save your exact position\n2. Tell the user to run /clear to free the context window\n3. Tell the user to run /user:gsd-t-resume to continue from the saved position\nDo NOT continue working, spawn subagents, or start new tasks. This has the same enforcement weight as the Destructive Action Guard — violating it risks losing work to context overflow."
  }
  ```

Empty output (`{}`) is the **safe default** for every failure mode: API error, missing key, timeout, malformed transcript, unknown threshold, etc. The hook NEVER blocks Claude.

### Latency budget

- Total hook execution: **< 200ms**.
- count_tokens API call: `timeoutMs` from config (default 2000ms).
- On timeout: return `{}` immediately, log to `logPath`, update `lastError` in state file.

### checkFrequency gate

The hook maintains a per-session counter in `statePath` (`checkCount` field). Every PostToolUse invocation increments the counter. Token estimation runs only when `checkCount % checkFrequency === 0`. Otherwise the hook returns `{}`.

---

## Token estimation (local, zero API cost)

Since v3.12, the context meter uses **local character-based estimation** instead of the Anthropic `count_tokens` API. This eliminates all API costs, network dependencies, and API key requirements.

- Method: Parse transcript → measure total character count → divide by 3.5 (chars per token)
- Module: `scripts/context-meter/estimate-tokens.js`
- Accuracy: Within ~5-10% of the real `count_tokens` API. For threshold bands with 15-point gaps (normal < 70%, warn < 85%), this is more than sufficient.
- Cost: Zero. No API calls, no network, no billing.
- The 3.5 chars/token ratio slightly overestimates token count, which is the safe direction (triggers pause earlier, not later).

### Historical note (v2.75–v3.11)

Previous versions called `POST /v1/messages/count_tokens` via `scripts/context-meter/count-tokens-client.js`, requiring `ANTHROPIC_API_KEY`. This was replaced because:
1. The API bills per input token even for count_tokens calls — at high volumes with Opus model IDs, this reached ~$126/month
2. All Claude 3.5+ models share the same tokenizer, making the API call unnecessary
3. The network dependency and API key requirement added fragility (the M36 regression was caused by a missing API key)

---

## Threshold mapping (mirrors token-budget-contract.md)

| pct | threshold | action |
|-----|-----------|--------|
| < 60% | `normal` | No additionalContext emitted. |
| 60–70% | `warn` | No additionalContext (threshold not reached). |
| 70–85% | `downgrade` | No additionalContext by default — `thresholdPct` in config gates when to actually emit. |
| ≥ `thresholdPct` (default 75) | — | additionalContext emitted instructing pause. |

> The `threshold` label in the state file reflects token-budget's bands (so consumers can reason about `warn`/`downgrade`/`conserve`/`stop`), while the decision to emit `additionalContext` is strictly `pct >= thresholdPct` from config.

---

## Rules

1. **Fail open in the HOOK, fail loud in the GATE**: The PostToolUse hook still returns `{}` on every error path — it must never block Claude. But `token-budget.getSessionStatus()` reading the state file is NOT fail-open. If the hook has been writing `lastError` for every check, or `timestamp` is `null`, or the state is stale, the gate returns `threshold: "stale"` which is treated as STOP by `gsd-t-execute`, `gsd-t-wave`, `gsd-t-integrate`, `gsd-t-debug`, `gsd-t-quick`. This is the v1.1.0 fix — see §"Stale Band and Resume Gating".
2. **No key storage**: API key is only ever read from `process.env[apiKeyEnvVar]`. Never written to disk.
3. **Measurement only**: the API key named in `apiKeyEnvVar` must be used for `count_tokens` and `gsd-t doctor` diagnostic calls ONLY. It must NEVER be used for model inference — inference always runs through the Claude Code subscription. If a future hook or script needs to call `/v1/messages`, it must not reuse this env var.
4. **No message content in logs**: the diagnostic log contains token counts, HTTP status codes, and error categories — never messages.
5. **State file is not committed**: installer adds `.gsd-t/.context-meter-state.json` and `.gsd-t/context-meter.log` to `.gitignore` during install.
6. **Transcript format is not a public contract**: Claude Code's transcript JSONL format is undocumented upstream. `transcript-parser.js` must tolerate unknown fields and unfamiliar event types.
7. **Backward-compatible contract for projects without the meter**: projects where `.gsd-t/.context-meter-state.json` is entirely missing continue to function — `token-budget.getSessionStatus()` falls back to the heuristic (this is different from a file that exists but is dead, which returns `stale`).
8. **additionalContext is a MANDATORY STOP signal** (v1.2.0, M37): When `buildAdditionalContext()` returns a non-null string, Claude MUST immediately stop all work and execute the steps in the message. This signal has the same enforcement weight as the Destructive Action Guard — it is not a suggestion. All loop commands (`gsd-t-execute`, `gsd-t-wave`, `gsd-t-integrate`, `gsd-t-quick`, `gsd-t-debug`) enforce this rule. The `CLAUDE-global.md` template contains a matching `## Universal Auto-Pause Rule` section. Violating this rule risks context overflow and lost work.

---

## Universal Auto-Pause Rule (v1.2.0, M37)

### Why this exists

The Context Meter (M34) measures real context usage and emits an `additionalContext` signal when usage crosses the configured threshold (default 75%). Prior to M37, this signal was a polite suggestion (`⚠️ Run /user:gsd-t-pause...`). Claude consistently ignored it — continuing to work, spawning subagents, and eventually hitting the runtime's ~95% `/compact` wall, which destroys context silently.

### The fix

The `additionalContext` message is now a multi-line **MANDATORY STOP** instruction:

```
🛑 MANDATORY STOP — Context window at {pct}% of {windowSize} (threshold: {thresholdPct}%).
You MUST stop what you are doing RIGHT NOW and execute these steps in order:
1. Run /user:gsd-t-pause to save your exact position
2. Tell the user to run /clear to free the context window
3. Tell the user to run /user:gsd-t-resume to continue from the saved position
Do NOT continue working, spawn subagents, or start new tasks. This has the same enforcement weight as the Destructive Action Guard — violating it risks losing work to context overflow.
```

### Enforcement layers

1. **Hook output**: `buildAdditionalContext()` in `scripts/context-meter/threshold.js` emits the multi-line MANDATORY STOP instruction when `pct >= thresholdPct`.
2. **CLAUDE-global.md template**: Contains a `## Universal Auto-Pause Rule (MANDATORY)` section with the same enforcement weight as `## Destructive Action Guard (MANDATORY)`.
3. **Command files**: All loop commands (`execute`, `wave`, `integrate`, `quick`, `debug`) include an explicit auto-pause signal check that halts execution when the signal is present in the most recent hook output.

### Scope

This rule applies to ALL session types — not just GSD-T orchestrated workflows. Ad-hoc coding, debugging, brainstorming, research — any session where the Context Meter hook fires. The `additionalContext` field in the hook's stdout JSON is delivered to Claude by the Claude Code runtime's PostToolUse mechanism, making it visible regardless of what command or workflow is active.

---

## Stale Band and Resume Gating (v1.1.0)

### Why this exists

During M36 execution (2026-04-15), the user hit the Claude Code context window limit and had to run `/compact` **multiple times** — the exact scenario M34's Context Meter was built to prevent. Audit found the state file looked like:

```json
{ "inputTokens": 0, "pct": 0, "threshold": "normal",
  "checkCount": 2102,
  "lastError": { "code": "missing_key", "message": "env var ANTHROPIC_API_KEY not set" } }
```

Every one of 2102 PostToolUse hook calls failed at the API-key check in `runMeter()` step 5. The hook correctly returned `{}` (fail-open per Rule #1). But `token-budget.getSessionStatus()` dutifully read `pct: 0` and reported `threshold: "normal"` back to the command gate. **The gate had been blind since the day the project was installed without the key set.** There was no user-visible alarm at any layer:
- The hook fails open silently.
- `token-budget.js` treated "state file exists but unfresh" the same as "state file missing" and fell through to the heuristic (which is also near-0 early in a session).
- The gate saw `threshold: "normal"` and cheerfully spawned subagents until the runtime hit its own ~95% compact.
- `gsd-t doctor` DOES detect the missing key, but it's an on-demand command — neither resume nor execute ran it.

### The fix

A fourth band, `stale`, is introduced to `getSessionStatus()`:

| Band | When returned | Gate action |
|------|---------------|-------------|
| `normal` | State file is fresh (timestamp within 5 min), `lastError` is null, `pct < 70` | proceed at full quality |
| `warn` | Fresh state, `lastError` null, `70 ≤ pct < 85` | proceed, log warning |
| `stop` | Fresh state, `lastError` null, `pct ≥ 85` | halt, hand off to runway estimator or headless auto-spawn |
| `stale` | State file exists but: `lastError` is set, OR `timestamp` is null, OR `age > 5 min`, OR JSON corrupt | halt **and refuse to auto-spawn** — the meter is broken, a fresh session would be equally blind |

When `stale` is returned, `getSessionStatus()` also includes a `deadReason` field with one of: `meter_error:missing_key`, `meter_error:api_error`, `meter_error:parse_failure`, `meter_error:no_transcript`, `meter_never_measured`, `meter_state_stale`, `state_file_corrupt`, `state_file_unreadable`.

### Resume-time health check (Step 0.6)

`gsd-t-resume` MUST run a context-meter health check immediately after Step 0.5 (headless read-back banner) and before Step 1 (loading state). If the meter is `stale`:
1. Print a prominent warning with the `deadReason`.
2. Run `gsd-t doctor` inline.
3. Refuse to auto-advance into gated commands (`execute`, `wave`, `integrate`, `quick`, `debug`) until the user fixes the cause.
4. Allow non-gated commands (`status`, `health`, `backlog-*`, etc.) to proceed.

### Gate-treats-stale-as-stop

All four gated commands (`gsd-t-execute` Step 3.5, `gsd-t-wave` Wave Orchestrator Context Gate, `gsd-t-integrate`, `gsd-t-quick`, `gsd-t-debug`) MUST treat `threshold === 'stale'` as an exit-10 STOP but with a different user-facing message than normal stop (no auto-spawn, no runway estimator, just "meter dead — run `gsd-t doctor`"). A fresh session would not help — the guardrail is broken, not the session full.

---

## Breaking Changes

Changing the config schema version or the state file schema version is a breaking change. Bump `version` field and document migration in CHANGELOG.

Adding the `stale` band in v1.1.0 is NOT a breaking change at the state file level (same schema), but it IS a behavior change for consumers reading `threshold` — any consumer that switch-cased only on `normal|warn|stop` must add a `stale` arm. In-repo consumers (`gsd-t-execute`, `gsd-t-wave`, `gsd-t-resume`) are updated in the same patch.
