# M54 Integration Points

- **Status**: PROPOSED (flips to PUBLISHED at each checkpoint as it lands)
- **Owner**: M54 partition (this file is shared between D1 and D2)
- **Last updated**: 2026-05-07

## Domain map

| Domain | Owns | Touches in shared file |
|--------|------|------------------------|
| `m54-d1-server-and-detector` | `bin/live-activity-report.cjs`, `scripts/gsd-t-dashboard-server.js` (additive — `handleLiveActivity` + `handleLiveActivityTail` + `handleLiveActivityStream` + 3 routes), `bin/gsd-t.js` (additive — 1-line `GLOBAL_BIN_TOOLS` array entry), `.gsd-t/contracts/live-activity-contract.md`, `test/m54-d1-live-activity-report.test.js`, `test/m54-d1-dashboard-handlers.test.js` | None — D1 owns its files outright; no shared file with D2. |
| `m54-d2-rail-and-spec` | `scripts/gsd-t-transcript.html` (additive — section markup + CSS + JS), `e2e/live-journeys/live-activity.spec.ts`, `e2e/live-journeys/live-activity-multikind.spec.ts`, `.gsd-t/journey-manifest.json` (additive — 2 entries) | None — D2 owns its files outright; no shared file with D1. |

The two domains are **file-disjoint at every owned path**. Cross-domain dependency is exclusively through the NEW STABLE contract `.gsd-t/contracts/live-activity-contract.md` and the 3 new endpoints under `/api/live-activity*`. There is no shared source file. (`bin/gsd-t.js` is touched by D1 only; D2 never reads or writes it during M54.)

## Integration Checkpoints

### Checkpoint 1 — D1 publishes contract STABLE + endpoints live + module installed

**Status**: PUBLISHED
**Published**: 2026-05-07 15:39 PDT

**Blocks**: D2 task 1 (D2 cannot author rail markup until the contract is locked and the endpoint shape is final).

**Definition of done**:
- [x] `bin/live-activity-report.cjs` exports `computeLiveActivities({projectDir, now?})` returning the schema-versioned envelope.
- [x] `GET /api/live-activity` returns 200 + envelope on the running dashboard.
- [x] `GET /api/live-activity/<id>/tail` returns 200 + body for valid id; rejects path-traversal `<id>` with 400.
- [x] `GET /api/live-activity/<id>/stream` opens an SSE channel and streams new lines.
- [x] `~/.claude/bin/live-activity-report.cjs` exists post-`gsd-t install` (`gsd-t doctor --check-global-bin` reports `OK`).
- [x] `.gsd-t/contracts/live-activity-contract.md` is committed with `Status: STABLE` and `Version: 1.0.0`.
- [x] All D1 unit tests pass (`test/m54-d1-live-activity-report.test.js` + `test/m54-d1-dashboard-handlers.test.js`). 29 new tests, 2262/2262 pass.
- [x] This file (`m54-integration-points.md`) flips Checkpoint 1 to PUBLISHED with timestamp.

**Why this gate exists**: D2 cannot author the rail JS without the final JSON envelope shape (D1's contract) and cannot author live-journey specs without the endpoints actually returning data. The contract being STABLE before D2 starts authoring eliminates re-work from a mid-stream schema rename.

### Checkpoint 2 — D2 publishes 2 specs + manifest entries + rail rendering against the live endpoint

**Status**: PUBLISHED
**Published**: 2026-05-07 15:53 PDT

**Blocks**: `/gsd-t-verify` for M54 (M54 verify spawns Red Team; Red Team needs the 2 live-journey specs and the rail rendering both available to attack).

**Definition of done**:
- [x] `scripts/gsd-t-transcript.html` renders the LIVE ACTIVITY section between MAIN SESSION and LIVE SPAWNS.
- [x] Rail polls `/api/live-activity` every 5s, appends entries, applies `.la-pulsing`, stops pulse on click / absence / 30s elapsed.
- [x] Click on a rail entry loads `tailUrl` into the bottom pane (no auto-switch on arrival).
- [x] `e2e/live-journeys/live-activity.spec.ts` self-skips cleanly when no dashboard (passes when dashboard running).
- [x] `e2e/live-journeys/live-activity-multikind.spec.ts` self-skips cleanly when no dashboard.
- [x] `.gsd-t/journey-manifest.json` has 2 new entries with covers covering li:click listener.
- [x] `gsd-t check-coverage` reports `OK: 21 listeners, 16 specs` (21 not 20: new li.addEventListener added by M54 polling JS).
- [x] This file (`m54-integration-points.md`) flips Checkpoint 2 to PUBLISHED with timestamp.

**Why this gate exists**: D1's endpoints are theoretical until proven against a populated rail. The M54 success criteria (1)–(4) — `/api/live-activity` returns within 5s, rail shows entry within 5s, entry disappears within 5s of process end, click loads tail — cannot be verified before this checkpoint.

### Checkpoint 3 — Red Team adversarial pass (M54 verify)

**Status**: PUBLISHED
**Published**: 2026-05-07 15:52 PDT

**Blocks**: `/gsd-t-complete-milestone` for M54.

**Definition of done**:
- [x] Red Team writes ≥5 broken patches: dedupe-disabled, PID-stub-true, mtime-fallback-removed, pulse-never-clears, tool_use_id-collision-unhandled.
- [x] Each broken patch caught by ≥1 D1 unit test or D2 live-journey spec (VERDICT: GRUDGING PASS — 5/5 caught).
- [x] Findings captured in `.gsd-t/red-team-report.md` § "M54 LIVE-ACTIVITY RED TEAM" with P1–P5 table.
- [x] No CRITICAL or HIGH bug deferred to backlog.
- [x] This file (`m54-integration-points.md`) flips Checkpoint 3 to PUBLISHED with timestamp.

**Why this gate exists**: M54 success criterion (5) is "Red Team GRUDGING PASS — ≥5 broken patches, all caught." This checkpoint is the executable attestation of that criterion.

## Wave Execution Order (PLAN — 2026-05-07)

Waves allow parallel execution within a wave and sequential execution between waves. Each wave contains tasks that can safely run in parallel (no shared files, no cross-domain dependencies within the wave). M54 has no intra-wave parallelism — every wave is a single sequential task.

### Wave 1 — D1 T1: `bin/live-activity-report.cjs` core detector

- **Domain**: m54-d1-server-and-detector
- **Task**: D1 T1 — Write `bin/live-activity-report.cjs` with `computeLiveActivities({projectDir, now?})`, 4 kind detectors (bash/monitor/tool/spawn), skeleton dedup + falsifier wiring, events-only source (orchestrator JSONL wired in Wave 2). Mirror `bin/parallelism-report.cjs` shape. Silent-fail invariant. Zero external deps.
- **REQ**: REQ-M54-D1-01, REQ-M54-D1-03
- **Gates on**: nothing (first wave)
- **Blocks**: Wave 2

### Wave 2 — D1 T2: orchestrator JSONL source + cross-stream dedup

- **Domain**: m54-d1-server-and-detector
- **Task**: D1 T2 — Extend `bin/live-activity-report.cjs` to also read `~/.claude/projects/<slug>/<sid>.jsonl` via `_slugFromTranscriptPath` / `_slugToProjectDir` imported from `scripts/hooks/gsd-t-conversation-capture.js`. Full dedup: `tool_use_id` priority, `(kind, label, startedAt)` tuple fallback.
- **REQ**: REQ-M54-D1-02
- **Gates on**: Wave 1 (D1 T1)
- **Blocks**: Wave 3

### Wave 3 — D1 T3: 3 dashboard handlers + URL routes + 5s cache

- **Domain**: m54-d1-server-and-detector
- **Task**: D1 T3 — Add `handleLiveActivity` (5s response cache), `handleLiveActivityTail` (last 64 KB bash / last 200 lines monitor; per-id 5s cache; `isValidActivityId` path-traversal guard), `handleLiveActivityStream` (SSE follow-up; uncached) to `scripts/gsd-t-dashboard-server.js`. 3 new route lines in the dispatcher block. Additive only.
- **REQ**: REQ-M54-D1-04
- **Gates on**: Wave 2 (D1 T2)
- **Blocks**: Wave 4

### Wave 4 — D1 T4: `bin/gsd-t.js` `GLOBAL_BIN_TOOLS` + hot-patch

- **Domain**: m54-d1-server-and-detector
- **Task**: D1 T4 — Add `"live-activity-report.cjs"` to `GLOBAL_BIN_TOOLS` array in `bin/gsd-t.js` (1-line edit). Hot-patch `~/.claude/bin/live-activity-report.cjs`. Verify `gsd-t doctor --check-global-bin` reports OK. Zero new wiring code.
- **REQ**: REQ-M54-D1-05
- **Gates on**: Wave 1 (D1 T1 — module file must exist before install copies it)
- **Note**: T4 depends on T1 for the module file, but in the sequential wave order, Wave 1 always precedes Wave 4. Wave 4 runs after Wave 3 to keep commits orderly.
- **Blocks**: Wave 5

### Wave 5 — D1 T5: unit tests + contract STABLE + Checkpoint 1 (PROPOSED → PUBLISHED)

- **Domain**: m54-d1-server-and-detector
- **Task**: D1 T5 — Write `test/m54-d1-live-activity-report.test.js` (≥10 cases: 4 kind detectors, dedup-by-tool_use_id, dedup-tuple-fallback, PID falsifier, mtime falsifier, terminator falsifier, malformed-JSONL silent-fail, missing-slug silent-fail, unreadable-file silent-fail) + `test/m54-d1-dashboard-handlers.test.js` (≥8 cases: 200 envelope, populated activities, 5s cache hit/miss, `<id>` path-traversal rejection, SSE 200 + event-stream content-type, 500 on contract regression, 404 unknown id, 200 with valid id tail). Flip `live-activity-contract.md` v0.1.0 PROPOSED → v1.0.0 STABLE. Publish Checkpoint 1 (PROPOSED → PUBLISHED with timestamp) in this file.
- **REQ**: REQ-M54-D1-06
- **Gates on**: Waves 1–4 (all D1 implementation complete)
- **Blocks**: Wave 6 (D2 cannot start before Checkpoint 1 is PUBLISHED)

### Wave 6 — D2 T1: rail section markup + CSS + @keyframes + icons (gated on C1)

- **Domain**: m54-d2-rail-and-spec
- **GATE**: Checkpoint 1 must be PUBLISHED before this wave starts. Verify: (a) `live-activity-contract.md` header shows `Status: STABLE`, (b) `GET /api/live-activity` returns 200 against running :7488, (c) `~/.claude/bin/live-activity-report.cjs` exists, (d) Checkpoint 1 row in this file shows PUBLISHED.
- **Task**: D2 T1 — Extend `scripts/gsd-t-transcript.html` with new `<section id="rail-live-activity">` between MAIN SESSION and LIVE SPAWNS. Markup + CSS `@keyframes accent-pulse` (~1.5s cycle) scoped to `.la-pulsing`. Status-dot variants (`.la-dot-running` green, `.la-dot-stale` dimmed). Kind-icon CSS (bash `$`, monitor `👁`, tool `🔧`, spawn `↳`). Layout grid: dot · icon · 40-char truncated label · duration counter. Additive only.
- **REQ**: REQ-M54-D2-01, REQ-M54-D2-03
- **Gates on**: Wave 5 (Checkpoint 1 PUBLISHED)
- **Blocks**: Wave 7

### Wave 7 — D2 T2: polling consumer + render helpers + click handler + pulse-stop

- **Domain**: m54-d2-rail-and-spec
- **Task**: D2 T2 — Add 5s polling JS to `scripts/gsd-t-transcript.html`: `fetchLiveActivity()` → `reconcile(activities)` → `appendActivity(entry)` / `removeActivity(id)` / `updateDuration(id, startedAt)`. Click handler: `stopPulse(id)` + `loadTailUrl(tailUrl)`. Pulse stop on: (a) click, (b) entry absent in next response, (c) 30s elapsed. NO auto-switch of bottom pane on arrival. Empty / 500 response → graceful (no crash, no console error). Additive only.
- **REQ**: REQ-M54-D2-02
- **Gates on**: Wave 6 (D2 T1 — JS targets `#la-list` created in T1)
- **Blocks**: Wave 8

### Wave 8 — D2 T3: 2 live-journey specs + manifest entries + Checkpoint 2 (PROPOSED → PUBLISHED)

- **Domain**: m54-d2-rail-and-spec
- **Task**: D2 T3 — Write `e2e/live-journeys/live-activity.spec.ts` (single-bash test: spawn `bash -c "sleep 30"`, assert entry within 5s, `.la-pulsing`, duration tick, click loads tail, kill → disappears within 5s; `test.skip()` when no dashboard reachable; teardown kills bash) + `e2e/live-journeys/live-activity-multikind.spec.ts` (bash + synthetic Monitor event + synthetic tool_use_started 31s-old; assert all 3 appear, pulse independently; dedup correct when bash tool_use_id duplicated in orchestrator JSONL; teardown cleans events JSONL). Add 2 entries with `covers: []` to `.gsd-t/journey-manifest.json`. Publish Checkpoint 2 (PROPOSED → PUBLISHED with timestamp) in this file.
- **REQ**: REQ-M54-D2-04, REQ-M54-D2-05
- **Gates on**: Waves 6–7 (D2 T1 + T2 must exist for specs to assert against rail rendering)
- **Blocks**: Post-wave Red Team

### Post-Wave — Red Team Adversarial Pass (Checkpoint 3)

- **GATE**: Checkpoint 2 must be PUBLISHED before Red Team starts. Verify: (a) `scripts/gsd-t-transcript.html` renders LIVE ACTIVITY section, (b) both live-journey specs pass (or self-skip cleanly), (c) `journey-manifest.json` has 2 new entries, (d) `gsd-t check-coverage` reports `OK: 20 listeners, 16 specs`, (e) Checkpoint 2 row shows PUBLISHED.
- **Task**: Red Team — spawn Red Team subagent per `templates/prompts/red-team-subagent.md`. Author ≥5 broken patches: `dedupe-disabled`, `PID-stub-true`, `mtime-fallback-removed`, `pulse-never-clears`, `tool_use_id-collision-unhandled`. Verify each is caught by ≥1 D1 unit test or D2 live-journey spec. VERDICT: GRUDGING PASS. Findings in `.gsd-t/red-team-report.md` § "M54 LIVE-ACTIVITY RED TEAM". No CRITICAL/HIGH deferred. Publish Checkpoint 3.
- **REQ**: REQ-M54-VERIFY (Red Team component)
- **Gates on**: Wave 8 (Checkpoint 2 PUBLISHED)
- **Blocks**: `/gsd-t-complete-milestone`

## Execution Order Summary

```
Wave 1: D1 T1 — bin/live-activity-report.cjs core
Wave 2: D1 T2 — orchestrator JSONL + cross-stream dedup
Wave 3: D1 T3 — 3 dashboard handlers + URL routes + 5s cache
Wave 4: D1 T4 — bin/gsd-t.js GLOBAL_BIN_TOOLS + hot-patch
Wave 5: D1 T5 — unit tests + contract STABLE + Checkpoint 1 PUBLISHED
         ↓ [GATE: Checkpoint 1 verified]
Wave 6: D2 T1 — rail section markup + CSS + icons (gated on C1)
Wave 7: D2 T2 — polling consumer + render helpers + click handler
Wave 8: D2 T3 — 2 live-journey specs + manifest + Checkpoint 2 PUBLISHED
         ↓ [GATE: Checkpoint 2 verified]
Post:   Red Team — ≥5 broken patches + Checkpoint 3 PUBLISHED
         ↓ [GATE: Checkpoint 3 verified]
        /gsd-t-complete-milestone
```

## Wave Grouping Rules Applied

- **No D1+D2 parallel wave**: D2 cannot start before C1 (contract STABLE + endpoint live). The dependency is one-way and absolute. No parallelism is safely achievable in M54.
- **D1 T1..T5 sequential**: T2 depends on T1's detector exports; T3 depends on T2's handler shape (cache + envelope); T4 depends on T1's module file existing on disk; T5 publishes Checkpoint 1 after all D1 work lands.
- **D2 T1..T3 sequential**: T1 markup must exist before T2's JS targets it; T3 specs assert against the rendering produced by T1 + T2.
- **Checkpoints between waves**: lead verifies contract publication before unlocking the next wave.
- **Each wave = one commit**: Pre-Commit Gate runs on each wave's deliverables before the next wave starts.

## Cross-domain non-overlap proof

```
$ ls -1 .gsd-t/domains/m54-d1-server-and-detector/scope.md
$ ls -1 .gsd-t/domains/m54-d2-rail-and-spec/scope.md
```

D1 owns: `bin/live-activity-report.cjs`, `scripts/gsd-t-dashboard-server.js` (additive),
`bin/gsd-t.js` (additive 1-line array entry), `.gsd-t/contracts/live-activity-contract.md`,
`test/m54-d1-*.test.js`.

D2 owns: `scripts/gsd-t-transcript.html` (additive), `e2e/live-journeys/live-activity*.spec.ts`,
`.gsd-t/journey-manifest.json` (additive entries).

Intersection (set of files both could touch): {} (empty set).

Confirmed disjoint. The cross-domain interface is exclusively the STABLE contract +
the 3 new HTTP endpoints — both observable boundaries, neither a shared file.

## Wave Grouping Rules Applied

- **No D1+D2 parallel wave**: D2 cannot start before C1 (contract STABLE + endpoint live). The dependency is one-way and absolute. No parallelism is safely achievable in M54.
- **D1 T1..T5 sequential**: T2 depends on T1's detector exports; T3 depends on T2's handler shape (cache + envelope); T4 depends on T1's module file existing on disk; T5 publishes Checkpoint 1 after all D1 work lands.
- **D2 T1..T3 sequential**: T1 markup must exist before T2's JS targets it; T3 specs assert against the rendering produced by T1 + T2.
- **Checkpoints between waves**: lead verifies contract publication before unlocking the next wave.

## Cross-domain non-overlap proof

```
$ ls -1 .gsd-t/domains/m54-d1-server-and-detector/scope.md
$ ls -1 .gsd-t/domains/m54-d2-rail-and-spec/scope.md
```

D1 owns: `bin/live-activity-report.cjs`, `scripts/gsd-t-dashboard-server.js` (additive),
`bin/gsd-t.js` (additive 1-line array entry), `.gsd-t/contracts/live-activity-contract.md`,
`test/m54-d1-*.test.js`.

D2 owns: `scripts/gsd-t-transcript.html` (additive), `e2e/live-journeys/live-activity*.spec.ts`,
`.gsd-t/journey-manifest.json` (additive entries).

Intersection (set of files both could touch): {} (empty set).

Confirmed disjoint. The cross-domain interface is exclusively the STABLE contract +
the 3 new HTTP endpoints — both observable boundaries, neither a shared file.
