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

**Status**: PROPOSED

**Blocks**: D2 task 1 (D2 cannot author rail markup until the contract is locked and the endpoint shape is final).

**Definition of done**:
- [ ] `bin/live-activity-report.cjs` exports `computeLiveActivities({projectDir, now?})` returning the schema-versioned envelope.
- [ ] `GET /api/live-activity` returns 200 + envelope on the running dashboard.
- [ ] `GET /api/live-activity/<id>/tail` returns 200 + body for valid id; rejects path-traversal `<id>` with 400.
- [ ] `GET /api/live-activity/<id>/stream` opens an SSE channel and streams new lines.
- [ ] `~/.claude/bin/live-activity-report.cjs` exists post-`gsd-t install` (`gsd-t doctor --check-global-bin` reports `OK`).
- [ ] `.gsd-t/contracts/live-activity-contract.md` is committed with `Status: STABLE` and `Version: 1.0.0`.
- [ ] All D1 unit tests pass (`test/m54-d1-live-activity-report.test.js` + `test/m54-d1-dashboard-handlers.test.js`).
- [ ] This file (`m54-integration-points.md`) flips Checkpoint 1 to PUBLISHED with timestamp.

**Why this gate exists**: D2 cannot author the rail JS without the final JSON envelope shape (D1's contract) and cannot author live-journey specs without the endpoints actually returning data. The contract being STABLE before D2 starts authoring eliminates re-work from a mid-stream schema rename.

### Checkpoint 2 — D2 publishes 2 specs + manifest entries + rail rendering against the live endpoint

**Status**: PROPOSED

**Blocks**: `/gsd-t-verify` for M54 (M54 verify spawns Red Team; Red Team needs the 2 live-journey specs and the rail rendering both available to attack).

**Definition of done**:
- [ ] `scripts/gsd-t-transcript.html` renders the LIVE ACTIVITY section between MAIN SESSION and LIVE SPAWNS.
- [ ] Rail polls `/api/live-activity` every 5s, appends entries, applies `.la-pulsing`, stops pulse on click / absence / 30s elapsed.
- [ ] Click on a rail entry loads `tailUrl` into the bottom pane (no auto-switch on arrival).
- [ ] `e2e/live-journeys/live-activity.spec.ts` passes against the running dashboard.
- [ ] `e2e/live-journeys/live-activity-multikind.spec.ts` passes against the running dashboard.
- [ ] `.gsd-t/journey-manifest.json` has 2 new entries with `covers: []`.
- [ ] `gsd-t check-coverage` reports `OK: 20 listeners, 16 specs`.
- [ ] This file (`m54-integration-points.md`) flips Checkpoint 2 to PUBLISHED with timestamp.

**Why this gate exists**: D1's endpoints are theoretical until proven against a populated rail. The M54 success criteria (1)–(4) — `/api/live-activity` returns within 5s, rail shows entry within 5s, entry disappears within 5s of process end, click loads tail — cannot be verified before this checkpoint.

### Checkpoint 3 — Red Team adversarial pass (M54 verify)

**Status**: PROPOSED

**Blocks**: `/gsd-t-complete-milestone` for M54.

**Definition of done**:
- [ ] Red Team writes ≥5 broken patches: dedupe-disabled, PID-stub-true, mtime-fallback-removed, pulse-never-clears, tool_use_id-collision-unhandled.
- [ ] Each broken patch caught by ≥1 D1 unit test or D2 live-journey spec (VERDICT: GRUDGING PASS).
- [ ] Findings captured in `.gsd-t/red-team-report.md` § "M54 LIVE-ACTIVITY RED TEAM" using the M51/M52 structural template.
- [ ] No CRITICAL or HIGH bug deferred to backlog (matches M52 / M53 standard).
- [ ] This file (`m54-integration-points.md`) flips Checkpoint 3 to PUBLISHED with timestamp.

**Why this gate exists**: M54 success criterion (5) is "Red Team GRUDGING PASS — ≥5 broken patches, all caught." This checkpoint is the executable attestation of that criterion.

## Wave Execution Groups

Waves allow parallel execution within a wave and sequential execution between waves. Each wave contains tasks that can safely run in parallel (no shared files, no cross-domain dependencies within the wave).

### Wave 1 — D1 Build-Out (sequential within domain)

- **m54-d1-server-and-detector**: Task 1 (`bin/live-activity-report.cjs` + unit tests), Task 2 (`/api/live-activity` handler + 5s cache), Task 3 (`/api/live-activity/<id>/tail` + `/stream` handlers + path-traversal guard), Task 4 (`bin/gsd-t.js` `GLOBAL_BIN_TOOLS` array entry), Task 5 (contract STABLE + Checkpoint 1 publication + arch-doc finalisation).
- **Shared files**: D1 alone (D2 has no work in this wave).
- **Sequential within D1**: T1 → T2 → T3 → T4 → T5 (T2 needs T1's detector exports; T3 needs T2's handler shape; T4 needs T1's module file to exist; T5 publishes after all above land).
- **Completes when**: Checkpoint 1 PUBLISHED — contract STABLE, endpoints live, module installed.

### Wave 2 — After Checkpoint 1 (sequential within D2)

- **CHECKPOINT 1**: Lead verifies (a) `live-activity-contract.md` STABLE, (b) all 3 endpoints return 200 against the running dashboard, (c) `~/.claude/bin/live-activity-report.cjs` exists, (d) `m54-integration-points.md` Checkpoint 1 flipped to PUBLISHED.
- **m54-d2-rail-and-spec**: Task 1 (rail markup + CSS + pulse keyframes), Task 2 (polling consumer + render helpers + click handler), Task 3 (2 live-journey specs + manifest entries + Checkpoint 2 publication).
- **Shared files**: `scripts/gsd-t-transcript.html` (D2 alone, sequential T1 → T2). `.gsd-t/journey-manifest.json` (D2 alone, T3).
- **Completes when**: Checkpoint 2 PUBLISHED — rail renders, 2 specs pass, manifest at +2 entries, `gsd-t check-coverage` `OK: 20 listeners, 16 specs`.

### Wave 3 — Red Team Adversarial Pass (sequential, single task)

- **CHECKPOINT 2**: Lead verifies the rail renders the LIVE ACTIVITY section, both live-journey specs pass, manifest has 2 new entries, `gsd-t check-coverage` reports `OK: 20 listeners, 16 specs`.
- **`/gsd-t-verify` Red Team**: spawn Red Team subagent per `templates/prompts/red-team-subagent.md`; ≥5 broken patches authored; verify each is caught.
- **Shared files**: `.gsd-t/red-team-report.md` (append-only).
- **Completes when**: Checkpoint 3 PUBLISHED — VERDICT: GRUDGING PASS, all ≥5 patches caught, no CRITICAL/HIGH deferred.

## Execution Order (for solo mode)

1. **Wave 1 sequential**: D1 T1 → D1 T2 → D1 T3 → D1 T4 → D1 T5 (Checkpoint 1 published).
2. **CHECKPOINT 1 verification**.
3. **Wave 2 sequential**: D2 T1 → D2 T2 → D2 T3 (Checkpoint 2 published).
4. **CHECKPOINT 2 verification**.
5. **Wave 3**: Red Team adversarial pass (Checkpoint 3 published).

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
