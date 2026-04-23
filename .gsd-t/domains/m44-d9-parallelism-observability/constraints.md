# M44-D9 — Constraints

## Hard rules

1. **Reader, never writer** — D9 is pure observability. It reads spawn-plan files, event JSONL, token-log, partition. It writes ONLY to dashboard responses (HTTP) and rendered HTML. It NEVER writes to `.gsd-t/spawns/`, `.gsd-t/events/`, `.gsd-t/token-log.md`, or any source-of-truth file.

2. **Silent-fail on malformed inputs** — if a spawn-plan file is unparseable, an event JSONL line is corrupt, or a token-log row is malformed: log to stderr and continue with partial data. Never throw; never break the panel render.

3. **No new LLM token cost** — see scope.md "Token cost" section. Computation is pure file I/O. No subagent calls, no LLM-driven analysis.

4. **Lands AFTER D8 in Wave 3 sequencing** — D9 reader depends on D8 spawn-plan writer being live. Both are in Wave 3 and parallel-safe with D2/D3, but D9 must commit AFTER at least D8-T1 (writer module) lands. D8-T2 through T7 can land concurrently with D9-T1 through T4.

5. **Dashboard endpoint additive** — `/api/parallelism` and `/api/parallelism/report` are net-new; do NOT change existing `/api/spawn-plans` (D8), `/api/token-breakdown`, `/api/transcript`, or any current SSE channel.

6. **Renderer panel additive** — adds a NEW `<aside class="parallelism-panel">` (or left-column equivalent). Does NOT modify D8's spawn-plan panel, the transcript stream, or any existing CSS class. CSS rules scoped to the new panel class only.

7. **Stop Supervisor button reuses existing path** — the dashboard server proxy MUST invoke the existing `/gsd-t-unattended-stop` flow (creates `.gsd-t/.unattended/stop` sentinel). D9 does NOT implement its own stop logic. NO direct kill, NO PID file manipulation.

8. **Color thresholds documented in contract** — all five color-state thresholds (active workers vs. ready, gate veto rate, parallelism factor, spawn age, time since last spawn) live in `parallelism-report-contract.md` v1.0.0 with WHY each threshold was chosen. Future calibration adjusts only the contract values; reader logic reads thresholds from contract-frozen constants.

9. **Disjoint with D2-D8** — D9 must not touch any file owned by D2-D8 except the shared additive edits to `scripts/gsd-t-dashboard-server.js`, `scripts/gsd-t-transcript.html`, `commands/gsd-t-help.md`, `docs/architecture.md` (each gets a NEW non-overlapping code block).

10. **No transcript-derivation fallback** — even if spawn-plan files are missing for an active wave, D9 does NOT attempt to reconstruct parallelism state from transcript heuristics. The panel either renders from real plan files + event log, or shows "no parallelism active" dimmed state. Half-measures are forbidden (per user feedback 2026-04-22, applied to D8 and inherited).

## Format rules

- Color codes: `green` (panel border `#10b981`), `yellow` (`#f59e0b`), `red` (`#ef4444`), `dimmed` (`#374151` opacity 0.5)
- parallelism_factor: 1 decimal place, suffix `×` (e.g., `3.2×`)
- Spawn age: `Hh Mm Ss` format (`0h 4m 12s`); for >1h use `Hh Mm` (`1h 23m`)
- Token tally per active spawn: `in=Nk` (k-suffix above 1000) — NOT full breakdown (D8's panel shows that on done)
- Gate decision tally: `✓ N` (green checkmark + count) when last 10 events show 0 vetoes; `⚠ N` (yellow) when 1-3 vetoes; `❌ N` (red) when 4+ vetoes

## Mode contract reminders (from M44 partition)

- **[unattended]** mode: panel reads spawn-plan files written by Team Mode workers. No new writer in this domain.
- **[in-session]** mode: panel reads spawn-plan files written by `gsd-t parallel` orchestrator. Same reader, same metrics.

## Layout decision (deferred to T3 build time)

Two layouts viable:
- **Layout A — Right column third panel** (below D8's two-layer task panel)
- **Layout B — Left column** (separate column from transcript stream + D8 panel)

Decision criterion: pick whichever fits cleaner once D8's panel is rendering. Document the choice in T3 commit message.
