# Tasks: m54-d2-rail-and-spec

## Summary

Build the LIVE ACTIVITY rail section in the viewer + 2 live-journey specs that prove M54 works end-to-end against a running dashboard. 3 tasks, sequential within the domain. ALL tasks are gated on D1 Checkpoint 1 (contract STABLE, all 3 endpoints live, module installed). No parallelism opportunity within D2 — T1 markup must exist before T2's JS targets it, and T3 specs assert against T1+T2's output.

## Tasks

---

### T1 — Rail section markup + CSS + @keyframes accent-pulse + status-dot + kind-icon

| Field | Value |
|-------|-------|
| **Status** | planned |
| **REQ** | REQ-M54-D2-01, REQ-M54-D2-03 |
| **Dependencies** | D1 Checkpoint 1 PUBLISHED (contract STABLE, endpoint live — D2 cannot start before C1) |

**Deliverables**

| File | Action | Details |
|------|--------|---------|
| `scripts/gsd-t-transcript.html` | EXTEND (additive) | New `<section id="rail-live-activity">` markup, new CSS rules appended at end of `<style>` block. No existing markup/CSS/JS renamed or removed. |

**Section Markup Structure**
```html
<section id="rail-live-activity" class="rail-section">
  <h3 class="rail-heading">LIVE ACTIVITY</h3>
  <ul id="la-list" class="la-list">
    <!-- Entries injected by JS (T2). Empty section header visible when list is empty. -->
  </ul>
  <!-- LIVE SPAWNS section visually nested here via CSS layout.
       The existing LIVE SPAWNS <section> is NOT moved or modified —
       its appearance inside LIVE ACTIVITY is achieved via the new section's
       margin/padding/border layout, not by editing the LIVE SPAWNS section. -->
</section>
```

**Rail Insertion Point**
- Between the existing `<section id="rail-main-session">` (MAIN SESSION) and `<section id="rail-live-spawns">` (LIVE SPAWNS) in the rail-stack DOM order.
- The insertion is purely additive — the two existing sections retain their ids, classes, and internal markup unchanged.

**CSS Rules (append at end of `<style>` block)**

| Rule | Purpose |
|------|---------|
| `#rail-live-activity { ... }` | Section container — consistent with other `rail-section` styles. |
| `.la-list { ... }` | `<ul>` reset, flex column layout for entries. |
| `.la-entry { ... }` | Grid layout: `dot · kind-icon · label · duration`. |
| `.la-dot { ... }` | Status dot base (8px circle). |
| `.la-dot-running { background: #2dd4bf; }` | Green dot — alive activity. |
| `.la-dot-stale { background: #6b7280; }` | Dimmed dot — stale-but-not-yet-removed. |
| `.la-icon { ... }` | Kind icon cell (monospace, fixed width). |
| `.la-label { ... }` | 40-char truncated label (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40ch;`). |
| `.la-duration { ... }` | Live wall-clock counter (monospace, right-aligned). |
| `@keyframes accent-pulse { ... }` | ~1.5s cycle. Appended next to any existing `@keyframes` rules in the `<style>` block. |
| `.la-pulsing { animation: accent-pulse 1.5s ease-in-out infinite; }` | Scoped to `.la-pulsing` class only — no other element is affected. |

**Kind Icons (exact code points set during execute — T1 reserves the slots)**

| Kind | Glyph | CSS class |
|------|-------|-----------|
| `bash` | `$` | `.la-icon-bash` |
| `monitor` | `👁` | `.la-icon-monitor` |
| `tool` | `🔧` | `.la-icon-tool` |
| `spawn` | `↳` | `.la-icon-spawn` |

**LIVE SPAWNS Visual Nesting**
- REQ-M54-D2-03: LIVE SPAWNS data continues to populate (D1 returns `kind: "spawn"` entries). Visual nesting is achieved by the new section's CSS layout (`margin-left`, `border-left`, or `padding` that visually subordinates the existing LIVE SPAWNS section when rendered below LIVE ACTIVITY).
- The existing `<section id="rail-live-spawns">` is NOT modified, NOT wrapped, NOT reparented. The nesting effect is purely CSS positioning.

**Must-Read Before Coding**
- `scripts/gsd-t-transcript.html` — full file, focusing on:
  - The existing `<section id="rail-...">` structure (insertion point between MAIN SESSION and LIVE SPAWNS).
  - The existing `@keyframes` rules at the bottom of `<style>` (append `accent-pulse` next to them; pattern matches).
  - The existing `connectMain(sessionId)` SSE wiring (D2 mirrors the same module-script section style in T2).

**Acceptance Criteria**
- [ ] `<section id="rail-live-activity">` appears between MAIN SESSION and LIVE SPAWNS in DOM order (verified by opening the HTML in a browser and inspecting the rail stack).
- [ ] `@keyframes accent-pulse` is present in the `<style>` block and runs when `.la-pulsing` class is present.
- [ ] `.la-pulsing` animation does not bleed onto other rail entries (verified by Red Team patch "pulse-never-clears" — T3 specs will catch it).
- [ ] All 4 kind icon glyphs are defined in CSS (`.la-icon-bash`, `.la-icon-monitor`, `.la-icon-tool`, `.la-icon-spawn`).
- [ ] `.la-dot-running` and `.la-dot-stale` CSS variants are defined.
- [ ] `git diff scripts/gsd-t-transcript.html` shows only additive lines — no existing line modified or removed.

---

### T2 — Polling consumer + render helpers + click handler + pulse-stop logic

| Field | Value |
|-------|-------|
| **Status** | planned |
| **REQ** | REQ-M54-D2-02 |
| **Dependencies** | T1 (section markup + CSS must exist before JS targets `#la-list`) |

**Deliverables**

| File | Action | Details |
|------|--------|---------|
| `scripts/gsd-t-transcript.html` | EXTEND (additive) | New JS functions appended at end of existing inline `<script>` or bottom of the existing module-script section. No existing function renamed or removed. |

**JS Module Functions**

| Function | Signature | Behaviour |
|----------|-----------|-----------|
| `appendActivity(entry)` | `(entry: Activity) → void` | Creates `.la-entry` element with dot + icon + label + duration from the entry; appends to `#la-list`; adds `.la-pulsing`. |
| `removeActivity(id)` | `(id: string) → void` | Removes the `.la-entry[data-id="${id}"]` from `#la-list`. |
| `updateDuration(id, startedAt)` | `(id: string, startedAt: string) → void` | Updates the `.la-duration` cell for that id with `Math.floor((Date.now() - new Date(startedAt)) / 1000)` seconds. |
| `loadTailUrl(tailUrl)` | `(tailUrl: string) → void` | Fetches `tailUrl` and renders result in the bottom pane (same mechanism as existing bottom-pane loaders — mirror the pattern). NO auto-call on entry arrival; click handler only. |
| `stopPulse(id)` | `(id: string) → void` | Removes `.la-pulsing` from the entry element for `id`. |

**5s Polling Timer**
- Interval set to 5000ms — the same cadence as the existing `/api/parallelism` poll (match the tick, do NOT add a second timer or jitter).
- Pattern: `setInterval(async () => { const data = await fetchLiveActivity(); reconcile(data.activities); }, 5000)`.
- `fetchLiveActivity()`: `fetch('/api/live-activity')` → parse JSON → return envelope. On 500 or network error: log to console, return `{activities: []}` (no crash, no console.error re-thrown as unhandled).

**Reconciliation Loop (`reconcile(activities)`)**
- Build a `Map<id, Activity>` from the new response.
- For each new id not in the current DOM: `appendActivity(entry)` + `setTimeout(() => stopPulse(id), 30_000)`.
- For each DOM entry whose id is not in the new response: `removeActivity(id)`.
- For each DOM entry still present: `updateDuration(id, entry.startedAt)`.

**Pulse Stop Conditions (all three must be implemented)**

| Condition | Implementation |
|-----------|----------------|
| (a) User click | Click handler on `.la-entry` calls `stopPulse(id)` immediately before `loadTailUrl(tailUrl)`. |
| (b) Entry absent in next response | `reconcile()` calls `removeActivity(id)` → element no longer in DOM, pulse moot. |
| (c) 30s elapsed | `setTimeout(() => stopPulse(id), 30_000)` scheduled in `appendActivity`. |

**Click Handler**
```js
entry.addEventListener('click', () => {
  stopPulse(entry.dataset.id);
  loadTailUrl(entry.dataset.tailUrl);
  // NO bottom-pane auto-switch on arrival — click ONLY
});
```

**Duration Counter**
- Wall-clock derived from `entry.startedAt` directly (NOT from `entry.durationMs` — that's a snapshot).
- Updated every 1s via the reconcile tick's `updateDuration` call.
- Display format: `Xs` for under 60s; `Xm Ys` for 60s+; `Xh Ym` for 3600s+.

**Error Tolerance**
- `fetch` 500 → log once per interval, render empty section header, no crash.
- `fetch` network error → same treatment (no console.error unhandled rejection).
- Empty `activities[]` → empty section header visible, no crash.

**Must-Read Before Coding**
- `scripts/gsd-t-transcript.html` — focus on the existing 5s `/api/parallelism` polling pattern (`connectMain`, `setInterval`); mirror the same module-script section style.
- `bin/parallelism-report.cjs` — the envelope shape D2 receives (`{schemaVersion, generatedAt, activities, notes}`).
- `.gsd-t/contracts/live-activity-contract.md §4` — `Activity` field shape, especially `id`, `kind`, `label`, `startedAt`, `tailUrl`.

**Acceptance Criteria**
- [ ] 5s polling timer is active when the page loads (verified by opening :7488 and observing `GET /api/live-activity` in network tab every ~5s).
- [ ] When a `bash -c "sleep 30"` is backgrounded, the entry appears in `#la-list` within 5s with `.la-pulsing` class.
- [ ] The duration counter ticks (two snapshots ≥1s apart show different values).
- [ ] Clicking an entry removes `.la-pulsing` and loads `tailUrl` into the bottom pane (verified by T3 spec).
- [ ] Bottom pane does NOT auto-load on entry arrival (Red Team patch "auto-switch" must not exist).
- [ ] When the bash is killed, the entry disappears from `#la-list` within 5s.
- [ ] `GET /api/live-activity` returning 500 → no crash, no unhandled rejection, section header still visible.
- [ ] `git diff scripts/gsd-t-transcript.html` shows only additive JS lines — no existing function renamed or removed.

---

### T3 — 2 live-journey specs + manifest entries + Checkpoint 2 publication

| Field | Value |
|-------|-------|
| **Status** | planned |
| **REQ** | REQ-M54-D2-04, REQ-M54-D2-05 |
| **Dependencies** | T1, T2 (markup, CSS, JS all must exist and be observable before specs can assert against them) |

**Deliverables**

| File | Action | Details |
|------|--------|---------|
| `e2e/live-journeys/live-activity.spec.ts` | CREATE | Single-bash live-journey spec. |
| `e2e/live-journeys/live-activity-multikind.spec.ts` | CREATE | 3-concurrent-kind live-journey spec. |
| `.gsd-t/journey-manifest.json` | EXTEND (additive) | 2 new entries with `covers: []`. |
| `.gsd-t/contracts/m54-integration-points.md` | EDIT | Checkpoint 2 PROPOSED → PUBLISHED + timestamp + all 7 checkboxes ticked. |
| `docs/architecture.md` | EDIT | Append rail-behavior + 2-spec verification narrative to existing § "Live Activity Observability (M54)" subsection (D1 T5 finalised endpoint signatures; D2 T3 appends the rail + spec narrative). |

**`live-activity.spec.ts` — Test Flow**

```
SETUP: resolve dashboard URL = GSD_T_LIVE_DASHBOARD_URL ?? 'http://localhost:7488'
       test.skip() if URL not reachable (try GET / with 2s timeout → skip on ECONNREFUSED)
       spawn real bash: child = spawn('bash', ['-c', 'sleep 30'])

STEP 1: assert GET /api/live-activity returns entry with kind:"bash" within 5s
        (poll endpoint every 500ms for up to 5s; fail if not found)

STEP 2: open dashboard URL in Playwright browser

STEP 3: assert rail entry `#la-list [data-kind="bash"]` appears within 5s
        (Playwright waitForSelector with 5000ms timeout)

STEP 4: assert `.la-pulsing` class present on the entry

STEP 5: capture duration value at T0; wait 1.1s; capture at T1
        assert T1 > T0 (duration counter ticked)

STEP 6: click the entry
        assert `.la-pulsing` removed from entry (stopPulse fired)
        assert bottom pane is non-empty (tailUrl loaded)

STEP 7: kill the bash process (child.kill())
        assert entry disappears from #la-list within 5s
        (poll every 500ms for up to 5s)

TEARDOWN (test.afterAll): child.kill() if still alive (cleanup guard)
```

**`live-activity-multikind.spec.ts` — Test Flow**

```
SETUP: resolve dashboard URL; test.skip() if unreachable
       spawn real bash: bash_child = spawn('bash', ['-c', 'sleep 30 && echo done'])
       issue Monitor tool call: via Playwright page.evaluate or a direct call to the
         dashboard's /api/live-activity stream (the Monitor watch is initiated by
         writing a `tool_use` named "Monitor" event to .gsd-t/events/<today>.jsonl
         — the synthetic path, since issuing a real Monitor from a spec is impractical)
       write synthetic tool_use_started event to .gsd-t/events/<today>.jsonl:
         { event_type: "tool_use_started", tool_use_id: "test-tool-123",
           name: "Write", startedAt: <now-31s-ISO>, pid: 99999 }
         (30s threshold ensures it shows as `tool` kind; pid: 99999 assumed absent
          from system — F2 clears it, but the test runs before F2 fires in next cycle)

STEP 1: poll GET /api/live-activity every 500ms for up to 5s
        assert 3 entries appear: kind:"bash" + kind:"monitor" + kind:"tool"

STEP 2: open dashboard URL; assert 3 entries visible in #la-list

STEP 3: assert all 3 have .la-pulsing (independent pulse per entry)

STEP 4: dedup correctness — also write the bash's tool_use_id to the orchestrator JSONL
        (copy same tool_use_id as the bash event) → re-poll endpoint →
        assert still exactly 3 entries (not 4 — dedup by tool_use_id works)

TEARDOWN: bash_child.kill(); restore .gsd-t/events/<today>.jsonl to pre-test state
          (remove synthetic Monitor and tool lines appended by this spec)
```

**Note on Monitor synthetic path**: issuing a live `Monitor` tool call from a Playwright spec is impractical (it would recurse into the orchestrator). The multikind spec exercises the Monitor kind by writing a synthetic `tool_use_started` event with `name: "Monitor"` to the events JSONL — this is the "events-only source path" explicitly called out in D2 scope.md and constraints.md. The spec's teardown reverts the events JSONL to pre-test state.

**Manifest Entries (`.gsd-t/journey-manifest.json`)**
```json
{
  "id": "live-activity-single-bash",
  "spec": "e2e/live-journeys/live-activity.spec.ts",
  "description": "Single bash backgrounder appears in rail, pulses, duration ticks, click loads tail, kill removes",
  "covers": [],
  "type": "live-journey",
  "addedAt": "2026-05-07"
},
{
  "id": "live-activity-multikind",
  "spec": "e2e/live-journeys/live-activity-multikind.spec.ts",
  "description": "3 concurrent kinds (bash + monitor + tool) appear independently; dedup correct on orchestrator+events overlap",
  "covers": [],
  "type": "live-journey",
  "addedAt": "2026-05-07"
}
```
`covers: []` per M52 doctrine — live-journey specs probe live URLs, not viewer-source `addEventListener` listeners. `gsd-t check-coverage` continues to report `OK: 20 listeners, 16 specs`.

**Must-Read Before Coding**
- `e2e/live-journeys/parallelism-endpoint.spec.ts` — canonical `test.skip()` pattern, `GSD_T_LIVE_DASHBOARD_URL` env override, schema-versioned envelope assertion style.
- `e2e/live-journeys/dashboard-endpoint-coverage.spec.ts` — route-by-route assertion vocabulary.
- `.gsd-t/journey-manifest.json` — existing format (append-only, never edit existing entries).
- `.gsd-t/contracts/live-activity-contract.md v1.0.0 STABLE` — the contract the specs attest against.

**Checkpoint 2 Publication (`.gsd-t/contracts/m54-integration-points.md`)**
- Checkbox all 7 Checkpoint 2 definition-of-done items.
- Change `Checkpoint 2 Status: PROPOSED` → `PUBLISHED`.
- Add `Published: 2026-05-07 HH:MM PDT` timestamp (live clock at commit time).

**doc-ripple for D2 T3**
- `docs/architecture.md` § "Live Activity Observability (M54)": append paragraph describing the rail section behavior (5s poll, pulse, click-to-tail) + reference to the 2 live-journey specs as the executable attestation.
- `CHANGELOG.md` Unreleased: append D2 completion note.
- REQ-M54-D2-04 and REQ-M54-D2-05 in `docs/requirements.md`: status `planned → done`.

**Acceptance Criteria**
- [ ] `live-activity.spec.ts` passes all 7 steps against the running dashboard (or self-skips cleanly when `localhost:7488` is not reachable).
- [ ] `live-activity-multikind.spec.ts` passes all 4 steps.
- [ ] `.gsd-t/journey-manifest.json` has exactly 2 new entries with `covers: []`.
- [ ] `gsd-t check-coverage` reports `OK: 20 listeners, 16 specs` (was 14 pre-M54 → +2 new live-journey specs).
- [ ] Checkpoint 2 in `m54-integration-points.md` is PUBLISHED with timestamp.
- [ ] `docs/architecture.md` contains the rail-behavior + 2-spec narrative.
- [ ] REQ-M54-D2-04 and REQ-M54-D2-05 in `docs/requirements.md` show `done`.
- [ ] Teardown reverts `.gsd-t/events/<today>.jsonl` to pre-test state (no synthetic events left behind).

---

## Execution Estimate

| Metric | Value |
|--------|-------|
| Total tasks | 3 |
| Independent tasks (no blockers within D2) | 0 — all gated on D1 Checkpoint 1 |
| Cross-domain gate | D1 Checkpoint 1 must be PUBLISHED before D2 T1 starts |
| Sequential chain | D2 T1 → D2 T2 → D2 T3 |
| Parallelism | None within D2 — T1 markup is T2's JS target; T3 specs assert against T1+T2 output |
| Checkpoints emitted | 1 (Checkpoint 2, after D2 T3) |
| New files | `e2e/live-journeys/live-activity.spec.ts`, `e2e/live-journeys/live-activity-multikind.spec.ts` |
| Modified files | `scripts/gsd-t-transcript.html` (additive T1+T2), `.gsd-t/journey-manifest.json` (additive entries), `.gsd-t/contracts/m54-integration-points.md` (C2 flip), `docs/architecture.md` (additive), `docs/requirements.md` (status flip D2-04, D2-05) |
| External deps added | 0 |
