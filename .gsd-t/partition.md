# M43 Partition — Token Attribution & Always-Headless Inversion

**Status**: PARTITIONED
**Date**: 2026-04-21
**Target version**: 3.17.10
**Domains**: 6 (D1 in-session-usage-capture, D2 per-tool-attribution, D3 sink-unification-backfill, D4 default-headless-inversion, D5 dialog-channel-meter, D6 transcript-viewer-primary-surface)
**Waves**: 3 (Foundation → Build-out → Inversion-alone)
**Rationale source**: M43 scope revised 2026-04-21 (channel separation; see `.gsd-t/progress.md` M43 "Current Milestone" + Decision Log 2026-04-21 14:43).

## Theme Split

- **Part A — Universal Token Attribution**: D1, D2, D3. Measures cost per turn, tool, command, domain. Must ship before the inversion so the inversion can be validated against attributed data.
- **Part B — Always-Headless Inversion (channel separation)**: D4, D5, D6. D4 strips branching; D5 is a router-only dialog growth meter; D6 makes the transcript viewer the primary surface.

## Domains

### D1 — m43-d1-in-session-usage-capture
**Responsibility**: capture per-turn token usage for the dialog channel (the one thing still running in-session). Branch A (hook-based on Stop/SessionEnd) if Claude Code exposes `usage`; else Branch B (extend M42 transcript tee to interactive sessions). Writes `.gsd-t/metrics/token-usage.jsonl` rows with `turn_id`/`session_id`/`sessionType`.
**Status**: D1-T1 PROBE INSTALLED (`f94857b`). Branch decision BLOCKED on hook-wire-up (settings.json permission) + one real Stop fire.
**Full detail**: `.gsd-t/domains/m43-d1-in-session-usage-capture/{scope,constraints,tasks}.md`.

### D2 — m43-d2-per-tool-attribution
**Responsibility**: join per-turn usage (D1/D3 JSONL) against the tool-call event stream (`.gsd-t/events/*.jsonl`) by `turn_id`; attribute each turn's tokens across its tool_calls by output-byte ratio. Ship `bin/gsd-t-tool-attribution.cjs` + `gsd-t tool-cost --group-by tool|command|domain` CLI.
**Full detail**: `.gsd-t/domains/m43-d2-per-tool-attribution/{scope,constraints,tasks}.md`.

### D3 — m43-d3-sink-unification-backfill
**Responsibility**: one canonical schema (v2) + one canonical sink (`.gsd-t/metrics/token-usage.jsonl`). Every producer (M36 heartbeat, M40 aggregator, M41 wrapper, D1 capture, D2 joiner) writes into that sink. `.gsd-t/token-log.md` becomes a regenerated view (`gsd-t tokens --regenerate-log`). Backfill ~64 historical `Tokens=0`/`—` rows from `.gsd-t/events/*.jsonl` + `.gsd-t/headless-*.log` using the existing (but unrun) M41 D3 backfiller.
**Full detail**: `.gsd-t/domains/m43-d3-sink-unification-backfill/{scope,constraints,tasks}.md`.

### D4 — m43-d4-default-headless-inversion
**Responsibility**: strip spawn-mode conditional logic from ~14 command files. Every command spawns — no `--in-session`, no `--headless`, no low-water mark, no context-meter-driven branching. `bin/headless-auto-spawn.cjs::shouldSpawnHeadless` collapses to `() => true` (or the helper is inlined and deleted). The only in-session surface is the `/gsd` router itself, which always spawns.
**Full detail**: `.gsd-t/domains/m43-d4-default-headless-inversion/{scope,constraints,tasks}.md`.

### D5 — m43-d5-dialog-channel-meter
**Responsibility** (collapsed from original compaction-pressure circuit breaker): extend `bin/runway-estimator.cjs` with a turn-over-turn dialog growth meter (median-of-deltas slope). When growth predicts `/compact` within N turns, the router appends a one-line warning to its response. Pure read/warn — never refuses, never reroutes. Under channel separation there is nothing to reroute *to*.
**Scope note**: the originally-sketched `bin/gsd-t-compaction-pressure.cjs` new module + `compaction-pressure-contract.md` v1.0.0 are **removed from scope**. D5 is now a small extension to an existing module.
**Full detail**: `.gsd-t/domains/m43-d5-compaction-pressure-circuit-breaker/{scope,constraints,tasks}.md` (filename retained; domain body is "dialog-channel-meter").

### D6 — m43-d6-transcript-viewer-primary-surface
**Responsibility**: promote `http://127.0.0.1:7433/transcript/{spawn-id}` from "useful" to **the** primary surface. Every spawn prints the URL. Dashboard auto-launches on first spawn if not already running (port via `projectScopedDefaultPort` from `df34eb2`). Adds per-spawn tool-cost panel backed by D2's attribution library + `GET /transcript/:id/tool-cost` + `GET /transcript/:id/usage` routes.
**Full detail**: `.gsd-t/domains/m43-d6-transcript-viewer-primary-surface/{scope,constraints,tasks}.md`.

## Wave Plan

### Wave 1 — Foundation (schema + probe)

| Domain | Parallel-safe? | Notes |
|--------|----------------|-------|
| D3 sink-unification-backfill | Yes — owns schema v2 | Lands first; D1 + D2 depend on v2 field names. |
| D1 in-session-usage-capture | Yes — owns dialog-channel capture | Probe already installed (`f94857b`). Needs hook wire-up + Branch A/B decision. Writes rows in v2 shape. |

**Gate to Wave 2**: schema v2 contract merged + D1 branch locked + first real D1 row lands in `.gsd-t/metrics/token-usage.jsonl`.

### Wave 2 — Build-out (parallel)

| Domain | Parallel-safe? | Depends on |
|--------|----------------|-----------|
| D2 per-tool-attribution | Yes — new library + new CLI; reads-only from D1/D3 sink + event stream | D3 (schema v2), D1 (rows exist) |
| D5 dialog-channel-meter | Yes — small extension to `bin/runway-estimator.cjs` + `commands/gsd.md` footer | D3 (schema v2), D1 (dialog rows) |
| D6 transcript-viewer-primary-surface | Yes — dashboard server routes + HTML panel + autostart + URL banner | D2 (tool-cost library for the panel route); coordinates URL-banner text with D4 |

**Gate to Wave 3**: D2 ships `gsd-t tool-cost`, D5 warning fires on synthetic fixture, D6 panel renders against a real spawn.

### Wave 3 — Inversion (alone)

| Domain | Parallel-safe? | Notes |
|--------|----------------|-------|
| D4 default-headless-inversion | Runs ALONE in this wave | Deletes spawn-mode branching from the command files the orchestrator itself routes work through. If D4 lands mid-run, every subsequent spawn changes shape under the running orchestrator. Sequencing D4 last guarantees a stable spawn surface for Waves 1+2. |

**No inter-wave parallelism**: Wave N+1 starts only after Wave N's gate passes.

## Shared Files & Conflict Map

- `bin/headless-auto-spawn.cjs`: **D4** (collapses `shouldSpawnHeadless`) + **D6** (adds URL-banner print). Disjoint intent; D4 owns the decision logic, D6 owns the banner-print block. D6 lands in Wave 2, D4 lands in Wave 3 → D4 sees D6's banner additions and preserves them.
- `scripts/gsd-t-dashboard-server.js`: **D6** only (new routes). No conflict.
- `.gsd-t/contracts/headless-default-contract.md` v1.0.0 → v2.0.0: **D4** owns the bump.
- `.gsd-t/contracts/metrics-schema-contract.md` v1 → v2: **D3** owns the bump.
- `.gsd-t/contracts/stream-json-sink-contract.md` v1.1.0 → v1.2.0: **D1** owns the bump (formalizes dialog-channel entry-point).
- `.gsd-t/contracts/tool-attribution-contract.md` v1.0.0: **D2** owns the new contract.
- `commands/gsd.md`: **D5** (dialog-meter warning footer) + **D4** (clarify router always spawns). Disjoint sections.
- `bin/gsd-t-token-capture.cjs`: **D3** only (schema-v2 field pass-through).
- `bin/runway-estimator.cjs`: **D5** only (dialog growth signal function).

## Integration Points

After Wave 2:
- **D2 + D6 integration**: dashboard tool-cost route calls D2's `aggregateByTool` against a per-spawn slice of the sink; verify with one real spawn (any headless command).
- **D1 + D3 integration**: first real Stop fires → row lands in v2 sink with `sessionType: "in-session"` + `turn_id` + `session_id`; `gsd-t tokens --regenerate-log` produces a markdown row that includes it.

After Wave 3:
- **Full cycle smoke test**: invoke any of the 14 stripped command files without flags; assert a spawn happens, the transcript URL is printed, the dashboard auto-starts if down, the tool-cost panel renders, the sink gets a v2 row with non-null usage.
- Grep assertion: `--in-session` + `--headless` return zero matches in `commands/*.md`.

## Skipped Partition Steps (with rationale)

- **Step 1.5 Assumption Audit**: partially in-scope. D1 has an explicit external-reference disposition for the Claude Code hook surface (documented in `d1-in-session-usage-capture/constraints.md`). D2–D6 inherit framework-internal references — no external unlocks needed.
- **Step 1.6 Consumer Surface**: N/A. GSD-T is a framework/CLI package; `SharedCore` already exists via `bin/gsd-t-token-capture.cjs` (M41) — D2/D3 extend it rather than fork.
- **Step 3.5 Design Brief**: skipped. D6 touches HTML but inherits the M42 transcript UI; no new visual language.
- **Step 3.6 Design Contract**: skipped. UI changes are additive panels, not a new aesthetic.

## Execution Order (supervisor / solo)

1. **Wave 1** — D3 first (schema v2 is the prerequisite), then D1 (hook wire-up + branch lock + first row).
2. **Wave 2** — D2 + D5 + D6 in any order (parallel-safe). A Team Mode worker can run all three concurrently.
3. **Wave 3** — D4 alone. No concurrent work.
4. Post-Wave-3: `/gsd-t-integrate` (smoke test + grep assertions) → `/gsd-t-verify` → auto-invokes `/gsd-t-complete-milestone`.
5. User-gated: tag v3.17.10, `npm publish`, `/gsd-t-version-update-all`.

## Known Blockers

- **D1-T1 hook wire-up**: an unattended-worker iteration cannot write to `~/.claude/settings.json` or `.claude/settings.json` (permission denied). Either (a) interactive Claude adds the entry via `/update-config`, or (b) an unattended worker is granted the permission explicitly. Probe script + target directory are already staged.
