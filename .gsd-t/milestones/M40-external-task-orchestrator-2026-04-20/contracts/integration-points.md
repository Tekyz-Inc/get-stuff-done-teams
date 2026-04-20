# Integration Points

## Current State: Milestone 40 — External Task Orchestrator + Streaming Watcher UI (PARTITIONED — 7 domains)

## M40 Dependency Graph

```
Wave 0 (go/no-go gate — kill-switch):
  D3 (contract-only slice: completion-signal-contract.md + assertCompletion)
      │
      ▼
  D1 (minimal slice: queue + worker spawn + wave join, no UI)  ──┐
  D2 (minimal slice: brief builder + template + compactor)     ──┤
      │                                                          │
      ▼                                                          │
  D0 speed-benchmark: orchestrator wall-clock vs in-session  ◄───┘
      │
      ├── PASS → unlock Wave 2 + Wave 3 + Wave 4
      └── FAIL → HALT M40; D4/D5 deferred; D1/D2/D3 shipped as primitives

Wave 1 (unlocked by D0 PASS, contract-only prep):
  (already complete — D3 contract landed in Wave 0)

Wave 2 (unlocked by D0 PASS):
  D1 orchestrator-core (full)
  D2 task-brief-builder (full)
      │
      ▼
Wave 3 (unlocked by Wave 2 done):
  D4 stream-feed-server ◄─── consumes D1 worker stdout
  D5 stream-feed-ui     ◄─── consumes D4 ws feed

Wave 4 (unlocked by Wave 3 done):
  D6 recovery-and-resume

                GATE: all waves complete
                              │
                              ▼
       VERIFY → COMPLETE-MILESTONE → tag v3.14.10
```

### Abbreviation Key

| Abbrev | Domain |
|--------|--------|
| D0 | d0-speed-benchmark |
| D1 | d1-orchestrator-core |
| D2 | d2-task-brief-builder |
| D3 | d3-completion-protocol |
| D4 | d4-stream-feed-server |
| D5 | d5-stream-feed-ui |
| D6 | d6-recovery-and-resume |

### Checkpoints

- **M40-CP0** (Wave 0 gate): D3 contract landed; D1+D2 minimal slices runnable; D0 benchmark executed; verdict recorded in `docs/m40-benchmark-report.md`. If FAIL → milestone halts here (D0 constraint: "It's not worth doing if it doesn't run at least as fast[er]").
- **M40-CP2** (Wave 2 complete): D1 full orchestrator ships; D2 full brief builder ships; orchestrator can drive an arbitrary domain end-to-end (without UI).
- **M40-CP3** (Wave 3 complete): D4 server + D5 UI render live worker output at `localhost:7842`; backlog replay works; task-boundary banners render.
- **M40-CP4** (Wave 4 complete): D6 recovery-and-resume in place; `/gsd-t-resume` detects orchestrator runs; operator flow documented.

## Wave Execution Groups (task-level)

### Wave 0 — Foundation + Gate (parallel-safe within sub-groups)

**0a — Independent starts (no blockers):**
- D3 Task 1: Freeze completion-signal-contract.md
- D1 Task 1: Config loader
- D2 Task 1: Brief template
- D0 Task 1: Benchmark workload fixture

**0b — Unlocked by 0a:**
- D3 Task 2: Implement assertCompletion (after D3 Task 1)
- D1 Task 2: Queue + wave partitioning (after D1 Task 1)
- D2 Task 2: Compactor (after D2 Task 1)

**0c — Cross-domain integration:**
- D2 Task 3: buildTaskBrief (after D2 Task 2, D3 Task 1)
- D3 Task 3: Completion check unit tests (after D3 Task 2)
- D1 Task 3: Worker lifecycle (after D1 Task 2, D3 Task 2)

**0d — Orchestrator CLI ready:**
- D1 Task 4: Main CLI + wave-join loop (after D1 Task 3, D2 Task 3)
- D1 Task 5: Subcommand wiring (after D1 Task 4)

**0e — THE GATE:**
- D0 Task 2: Benchmark driver (after D1 Task 5, D2 Task 3)
- D0 Task 3: Test wrapper + verdict recording (after D0 Task 2)

**Shared files in Wave 0**: `bin/gsd-t.js` touched once (D1 Task 5). All other file writes are to NEW files — no parallel write contention.

**GATE after Wave 0**: benchmark verdict must be recorded. PASS → Wave 2 unlocks. FAIL → M40 halts; D4/D5/D6 deferred.

### Wave 2 — Full orchestrator (after D0 PASS, parallel)
- D1 Task 6: Full worker + state.json refinement
- D2 is already complete in Wave 0 (no extra tasks)

**Shared files**: D1 Task 6 modifies `bin/gsd-t-orchestrator-worker.cjs` and `bin/gsd-t-orchestrator.js` — same-domain, serialized.

### Wave 3 — Stream feed (parallel across D4 + D5 at inspection stage, then gated)

**3a — Parallel inspect:**
- D4 Task 1: Inspect + decide on existing agent-dashboard server
- D5 Task 1: Inspect + decide on existing agent-dashboard UI (conditionally waits on D4 Task 2 for contract stability — see task dep)

**3b — D4 server build:**
- D4 Task 2: Implement server (after D4 Task 1)
- D4 Task 3: Client helper (after D4 Task 2)
- D4 Task 4: CLI subcommand (after D4 Task 2)
- D4 Task 5: Server + client tests (after D4 Tasks 2, 3)

**3c — D5 UI build (after D4 Task 2):**
- D5 Task 2: Render loop (after D5 Task 1, D4 Task 2)
- D5 Task 3: Boundary banners (after D5 Task 2)
- D5 Task 4: Scrollback + filter + auto-scroll (after D5 Task 3)
- D5 Task 5: Smoke test (after D5 Task 4)

**3d — Orchestrator ↔ stream-feed wiring:**
- D1 Task 7: Stream sink wiring (after D1 Task 6, D4 Task 3)

**Shared files**: `bin/gsd-t.js` touched by D4 Task 4 (additive subcommand). Within same wave D1 Task 7 only touches `bin/gsd-t-orchestrator-worker.cjs` — independent of D4/D5.

### Wave 4 — Recovery (after Wave 3 done, serial)
- D6 Task 1: Recovery algorithm (needs D1 Task 6 + D4 Task 2 outputs)
- D6 Task 2: `--resume` CLI flag (after D6 Task 1)
- D6 Task 3: `/gsd-t-resume` Step 0 integration (after D6 Task 2)
- D6 Task 4: Recovery unit tests (after D6 Tasks 1, 2)

**Shared files**: `bin/gsd-t-orchestrator.js` modified by D6 Task 2 — single-domain, serialized. `commands/gsd-t-resume.md` modified by D6 Task 3 only.

## Execution Order (solo mode)

Linear sequence if parallelism unavailable:
1. D3 Task 1 (contract freeze)
2. D1 Tasks 1, 2 (config, queue)
3. D2 Tasks 1, 2 (template, compactor)
4. D3 Task 2 (assertCompletion)
5. D2 Task 3 (buildTaskBrief — now has completion contract)
6. D3 Task 3 (completion tests)
7. D1 Tasks 3, 4, 5 (worker, CLI, subcommand)
8. D0 Tasks 1, 2, 3 (fixture, driver, verdict) → **GATE**
9. If GATE PASS: D1 Task 6 (full worker)
10. D4 Tasks 1, 2, 3, 4, 5 (inspect, server, client, CLI, tests)
11. D5 Tasks 1, 2, 3, 4, 5 (inspect, render, banners, scroll, smoke)
12. D1 Task 7 (stream wiring)
13. D6 Tasks 1, 2, 3, 4 (recovery)
14. VERIFY → COMPLETE-MILESTONE → tag v3.14.10

### File-Ownership Map (M40)

| File / directory | Owner | Notes |
|------------------|-------|-------|
| `bin/gsd-t-orchestrator.js` (NEW) | D1 | main entry |
| `bin/gsd-t-orchestrator-queue.cjs` (NEW) | D1 | wave partitioning |
| `bin/gsd-t-orchestrator-worker.cjs` (NEW) | D1 | worker lifecycle |
| `bin/gsd-t-orchestrator-config.cjs` (NEW) | D1 | config merge |
| `bin/gsd-t-orchestrator-recover.cjs` (NEW) | D6 | recovery algo |
| `bin/gsd-t-task-brief.js` (NEW) | D2 | public API |
| `bin/gsd-t-task-brief-template.cjs` (NEW) | D2 | prose envelope |
| `bin/gsd-t-task-brief-compactor.cjs` (NEW) | D2 | size budget |
| `bin/gsd-t-completion-check.cjs` (NEW) | D3 | assertCompletion helper |
| `bin/gsd-t-benchmark-orchestrator.js` (NEW) | D0 | go/no-go driver |
| `bin/gsd-t-stream-feed-client.cjs` (NEW) | D4 | orchestrator-side push |
| `scripts/gsd-t-stream-feed-server.js` (NEW or rewrite of existing untracked `gsd-t-agent-dashboard-server.js`) | D4 | 127.0.0.1 ws server |
| `scripts/gsd-t-stream-feed.html` (NEW or rewrite of existing untracked `gsd-t-agent-dashboard.html`) | D5 | UI |
| `.gsd-t/contracts/task-brief-contract.md` (NEW) | D2 | excerpt source for briefs |
| `.gsd-t/contracts/completion-signal-contract.md` (NEW) | D3 | done-signal definition |
| `.gsd-t/contracts/stream-json-sink-contract.md` (NEW) | D1↔D4 joint | frame schema + transport |
| `.gsd-t/contracts/wave-join-contract.md` (NEW) | D1 | parallelism semantics |
| `commands/gsd-t-resume.md` (MODIFY Step 0 only) | D6 | add orchestrator-run detection |
| `docs/m40-benchmark-report.md` (NEW, produced by D0 run) | D0 | gate artifact |
| `test/m40-*.test.js` (NEW, one per domain D0–D6) | respective owners | unit + integration |

### Cross-Domain Checkpoints

| From | To | Checkpoint |
|------|-----|-----------|
| D3 contract complete | D1 orchestrator-core can implement `assertCompletion` calls | Wave 0 item 1 |
| D3 contract complete | D2 brief-builder can excerpt Done Signal into briefs | Wave 0 item 1 |
| D1 minimal + D2 minimal | D0 can run benchmark | Wave 0 item 3 |
| D0 PASS verdict | D1/D2 full, D4/D5 begin | Gate |
| D1 full (state.json schema stable) | D6 recovery can read it | Wave 4 precondition |
| D1 stdout piping stable | D4 ingest endpoint can receive | Wave 3 precondition |
| D4 ws endpoint stable | D5 UI can subscribe | Wave 3 internal |

### Shared Files / Contention Points

| File | Domains | Coordination |
|------|---------|--------------|
| `bin/gsd-t.js` | D1 (adds `orchestrate` subcommand), D4 (adds `stream-feed` subcommand), D6 (adds `--resume` flag to orchestrate) | Additive — each domain appends its own subcommand block; no shared lines edited |
| `commands/gsd-t-resume.md` | D6 only | D6 modifies Step 0 only; rest untouched |
| `package.json` version | complete-milestone only | No domain bumps mid-milestone |
| `CHANGELOG.md` | complete-milestone only | No domain bumps mid-milestone |

### Existing-Code Dispositions (Assumption Audit)

| External / existing reference | Disposition | Rationale |
|-------------------------------|-------------|-----------|
| `bin/gsd-t-unattended.cjs` `_spawnWorker` | **INSPECT** | Read for spawn shape, prompt envelope, CWD invariant pattern. Do NOT import — D1 orchestrator is a new entry point, not a refactor of supervisor. |
| `.gsd-t/events/YYYY-MM-DD.jsonl` (existing event stream) | **USE** | D1 continues writing `task-start` / `task-done` events here for backwards compat with existing telemetry. |
| `scripts/gsd-t-agent-dashboard-server.js` (424 LOC untracked) | **INSPECT-then-decide** | D4 reads first; if it already matches the `stream-json-sink-contract.md` shape, promote to `scripts/gsd-t-stream-feed-server.js`. If not, salvage patterns and rewrite. Decision recorded in Decision Log post-inspection. |
| `scripts/gsd-t-agent-dashboard.html` (1043 LOC untracked) | **INSPECT-then-decide** | Same treatment as the server file — D5 inspects and decides promote vs rewrite. |
| `templates/stacks/*.md` (Stack Rules Engine) | **USE** | D2 brief builder calls `bin/rule-engine.js` which reads these. No change to the engine. |
| `bin/model-selector.js` | **NOT USED** | Orchestrator workers do NOT pick their own model. The brief specifies the model; D1 passes `--model` to `claude -p`. |
| `bin/token-budget.cjs` | **NOT USED in workers** | Each worker is one task, one shot — context meter is irrelevant inside workers. Orchestrator itself may read it for its own status banner (optional). |
| `commands/gsd-t-execute.md` | **UNCHANGED** | M40 ships alongside interactive execute; the two paths coexist. |
| `bin/gsd-t-unattended.cjs` supervisor | **UNCHANGED** | Stays for overnight/idle use per M40 scope §Explicitly NOT in scope. |

### User Intent Locked-In Interpretations (Assumption Audit Category 4)

| Ambiguous phrase from M40 definition | Interpretations | Locked |
|---------------------------------------|-----------------|--------|
| "claude.ai-style" (D5 UI) | (a) pixel-perfect clone, (b) same layout conventions (assistant cards, collapsible tools, dark mode) | **(b)** — visual conventions only, not an exact clone. Operator tool, not a product. |
| "streaming watcher UI" | (a) real-time tail only, (b) backlog + tail | **(b)** — ws connect replays today's JSONL, then tails live. |
| "zero Claude token cost" | (a) no Claude API calls from UI, (b) no LLM at all in the rendering path | **(b)** — no LLM, no cloud, fully local. |
| "process-level parallelism" | (a) shell fork-exec, (b) node `child_process.spawn` | **(b)** — node `child_process.spawn`, so frames can be piped programmatically. |
| "recovery" (D6) | (a) auto-resume on crash, (b) operator-initiated resume | **(b)** — operator runs `gsd-t orchestrate --resume` explicitly. No silent auto-restart. |

---

## Prior Milestone Archives

Previous integration-points content (M39 and earlier) is preserved in milestone archives under `.gsd-t/milestones/`. Most recent: `M39-fast-unattended-watch-progress-2026-04-18/`.
