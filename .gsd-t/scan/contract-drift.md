# Contract Drift Analysis — 2026-04-16 (Scan #11)

40 contracts in `.gsd-t/contracts/`. Spot-checked the high-traffic ones and the ones
that touch the v3.11.11 change.

## Contract vs Reality

### context-meter-contract.md (v1.2.0)
- **Header** (line 17): "measures real Claude Code context window usage via Anthropic's
  `count_tokens` endpoint and signals Claude to pause/clear/resume…"
- **Reality** (post-v3.11.11): the hook uses a LOCAL estimator
  (`scripts/context-meter/estimate-tokens.js`) — `chars / 3.5`. No HTTP call.
- The contract's later sections do mention "Token estimation (local, zero API cost)"
  and "Historical note (v2.75–v3.11)" — partial update. But the **Purpose** paragraph
  and the **Config Field reference** (which still lists `apiKeyEnvVar` as a required
  field with the implication of API use) tell the older story.
- **Verdict**: PARTIAL DRIFT — needs a content sweep so the header and the field-table
  match the local-estimator reality. The `apiKeyEnvVar` field is still loaded by the
  config loader but is no longer consumed by the hook; either remove it from the schema
  (with a migration note) or annotate it as "deprecated, retained for backward compat".

### token-budget-contract.md
- Says it reads `.gsd-t/.context-meter-state.json` and consumes `inputTokens` /
  `modelWindowSize` to compute `pct` and band.
- **Reality**: matches. `bin/token-budget.cjs` `getSessionStatus()` reads exactly that.
- **Verdict**: MATCHES.

### token-telemetry-contract.md (v1.0.0)
- Per CHANGELOG, contract describes 18 fields per spawn → `.gsd-t/token-metrics.jsonl`.
- **Reality**: spot-checked `bin/token-telemetry.js`/`.cjs` exports `recordSpawn` with
  the documented fields (model, phase, durationMs, tokens, etc.).
- **Verdict**: MATCHES (no deep audit done).

### dashboard-server-contract.md
- Describes the existing `gsd-t-dashboard-server.js` (port 7433).
- **Reality**: also exists `gsd-t-agent-dashboard-server.js` (port 7434, untracked /
  newly added) that is NOT in the contract. Either it's a separate server requiring its
  own contract, or it's a dead WIP. See Quality Q-DC01.
- **Verdict**: UNDOCUMENTED INTERFACE.

### unattended-supervisor-contract.md (v1.0.0, M36)
- Describes state schema, exit codes, CLI flags, platform matrix.
- **Reality**: matches the M36 implementation. Recent v3.10.16 added 3 launch-friction
  fixes; recent v3.10.13 propagated the count_tokens transcript-parser fix. Verify
  the contract's exit-code table includes any new codes from v3.10.13–v3.10.16.
- **Verdict**: VERIFY (likely matches, not deeply checked this scan).

### graph-cgc-contract.md
- Carried debt: TD-101 in archive — "MCP tool names don't match implementation".
  Confirm fix status before next milestone.
- **Verdict**: CARRIED DRIFT.

### graph-query-contract.md
- Carried debt: TD-098 in archive — "Rule 6 violated — absolute paths in results".
  Confirm fix status.
- **Verdict**: CARRIED DRIFT.

### context-observability-contract.md
- Listed as modified in `git status` — recent edit.
- Spot-check: file is current in the working tree; presumably part of the v3.11.11
  changeset though it wasn't called out in the commit.
- **Verdict**: VERIFY (likely matches; recent edit).

### wave-phase-sequence.md
- Carried debt: TD-093 in archive — drift between contract and `commands/gsd-t-wave.md`.
- **Verdict**: CARRIED DRIFT (re-check).

### qa-agent-contract.md
- Carried debt: TD-093 (same item as above) and references in CLAUDE.md.
- **Verdict**: CARRIED DRIFT.

### progress-file-format.md
- Carried debt: TD-070 / TD-089 in archive — missing M11–M13 artifacts. Now also
  missing M34/M35/M36/M37 narratives in the contract example?
- **Verdict**: PARTIAL — re-check whether the example reflects the recent header
  format ("Status: M37 COMPLETE — Universal Context Auto-Pause", etc.).

## API Contract vs Reality
- N/A — this project is a methodology framework, not an HTTP API.
- Internal CLI subcommand list in `bin/gsd-t.js` is the de-facto "API" — verified
  against `gsd-t-help.md` and `README.md` cmd table; counts match.

## Schema Contract vs Reality
- N/A — no DB.

## Undocumented (exists in code, no contract)

1. **`scripts/gsd-t-agent-dashboard-server.js`** — new agent topology dashboard server
   binding port 7434, plus its `gsd-t-agent-dashboard.html` UI. No contract; not in
   `dashboard-server-contract.md`. (Also see Quality Q-DC01.)

2. **`scripts/gsd-t-auto-route.js`** — referenced from CLAUDE.md as the
   `[GSD-T AUTO-ROUTE]` UserPromptSubmit hook, but no dedicated contract for the hook
   payload format / install location / failure modes. (May be implicit in
   `commands/gsd.md`; verify.)

3. **`scripts/gsd-t-tools.js`** — exists; no contract or doc reference found in a
   quick scan. Verify it isn't dead.

4. **The v3.11.11 local estimator privacy invariant** ("never logs message content")
   — enforced in `scripts/gsd-t-context-meter.js` and partially documented in
   `context-meter-contract.md`, but not lifted to a top-level invariant the way the
   fail-open invariant is. Worth promoting.

5. **`templates/stacks/_security.md` and `_auth.md`** — universal stack rules. Their
   "always inject" semantics are described in CLAUDE.md but no contract formalizes
   "what makes a template universal vs stack-specific".

## Drift Summary

| Severity | Count | Items |
|----------|------|-------|
| Major drift (text contradicts reality) | 1 | context-meter-contract Purpose+Config field reference |
| Undocumented interface | 4–5 | agent-dashboard, auto-route, tools.js, estimator privacy invariant, universal stack templates |
| Carried drift (from prior scan, status unknown) | 4 | graph-cgc tool names, graph-query absolute paths, wave-phase-sequence, qa-agent-contract, progress-file-format |
| Verify (likely OK) | 3 | unattended-supervisor exit codes, context-observability, token-telemetry |
| Matches | 1+ | token-budget-contract |
