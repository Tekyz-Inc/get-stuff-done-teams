# Integration Points

## Current State: Milestone 39 — Fast Unattended + Universal Watch-Progress Tree (PARTITIONED — 3 domains)

## M39 Dependency Graph

```
Wave 1 (all three domains parallel):
  D2 progress-watch       ────► new files + 17 workflow command shims + 3 watch-printer call sites (additive)
  D3 parallel-exec        ────► _spawnWorker prompt + unattended-supervisor-contract.md §15 (additive)
  D4 cache-warm-pacing    ────► supervisor main relay loop timeout + unattended-supervisor-contract.md §16 (additive)
                                                           │
                                            GATE: Wave 1 complete
                                                           │
                                                           ▼
                              SMOKE: /gsd-t-quick --watch (banner + task list)
                                                           │
                                                           ▼
                            VERIFY → COMPLETE-MILESTONE → tag v3.13.10
```

### Abbreviation Key

| Abbrev | Domain |
|--------|--------|
| D2 | d2-progress-watch |
| D3 | d3-parallel-exec |
| D4 | d4-cache-warm-pacing |

### Checkpoints

- **M39-CP1** (Wave 1 complete): all three domains landed; `watch-progress-contract.md` v1.0.0 finalized (full body by D2); `unattended-supervisor-contract.md` bumped to v1.3.0 with §15 (D3) + §16 (D4) appended; full test suite green; `/gsd-t-quick --watch` smoke test renders banner + task list.

### File-Ownership Map (M39)

| File / directory | Owner |
|------------------|-------|
| `bin/watch-progress.js` (NEW) | D2 |
| `scripts/gsd-t-watch-state.js` (NEW) | D2 |
| `.gsd-t/.watch-state/` (NEW, gitignored) | D2 |
| `test/watch-progress.test.js` (NEW) | D2 |
| `.gsd-t/contracts/watch-progress-contract.md` v1.0.0 | D2 |
| `.gitignore` (ADD `.gsd-t/.watch-state/`) | D2 |
| Shims in 17 workflow command files (`commands/gsd-t-{project,feature,milestone,partition,plan,execute,test-sync,integrate,verify,complete-milestone,scan,gap-analysis,wave,quick,debug,unattended,resume}.md`) | D2 |
| `bin/gsd-t-unattended.cjs` watch printer (append render below banner) | D2 |
| `bin/unattended-watch-format.cjs` (append render below banner) | D2 |
| `bin/headless-auto-spawn.cjs` `autoSpawnHeadless` watch fallback (append render below banner) | D2 |
| `bin/gsd-t-unattended.cjs::_spawnWorker` prompt text (~lines 1120–1145) | D3 |
| `.gsd-t/contracts/unattended-supervisor-contract.md` §15 "Worker Team Mode (v1.3.0)" | D3 |
| `test/unattended-worker-team-mode.test.js` (NEW) | D3 |
| `bin/gsd-t-unattended.cjs` main relay loop (~lines 861–939) worker timeout | D4 |
| `.gsd-t/contracts/unattended-supervisor-contract.md` §16 "Cache-Warm Pacing (v1.3.0)" | D4 |
| `test/unattended-cache-warm-pacing.test.js` (NEW) | D4 |

### Shared File Sequencing (M39)

Two files are edited by more than one domain; both cases are additive and non-overlapping:

1. **`bin/gsd-t-unattended.cjs`** — D3 edits `_spawnWorker` prompt text (~lines 1120–1145). D4 edits the main relay loop (~lines 861–939). Disjoint line ranges; no coordination required.
2. **`.gsd-t/contracts/unattended-supervisor-contract.md`** — D3 appends §15. D4 appends §16. Disjoint section additions; no coordination required. Version header bumps to v1.3.0 as a single-line change — whichever domain's edit lands second picks up the version bump (idempotent).

No checkpoints needed between the three domains because the edits are additive section appends and disjoint line ranges.

### Wave Execution Groups (M39)

#### Wave 1 — All Three Domains (parallel-safe)

| Domain | Owner | Parallel-safe? |
|--------|-------|----------------|
| D2 progress-watch | d2-progress-watch | Yes — disjoint targets from D3/D4 |
| D3 parallel-exec | d3-parallel-exec | Yes — non-overlapping with D4 in shared files |
| D4 cache-warm-pacing | d4-cache-warm-pacing | Yes — non-overlapping with D3 in shared files |

**Completes when**: M39-CP1 passes.

### Execution Order (solo mode)

1. Wave 1: D2 + D3 + D4 in any order (solo agent runs sequentially; recommended D2 first — largest surface, lowest risk).
2. After all three land: smoke test `/gsd-t-quick --watch`. Banner preserved + task list renders below.
3. `/gsd-t-verify` → auto-invokes `/gsd-t-complete-milestone`.
4. User-gated: `npm publish` v3.13.10 → `gsd-t update-all`.

---

## Previous State: Milestone 38 — Headless-by-Default + Meter Reduction (PARTITIONED — 5 domains)

## M38 Dependency Graph

```
Wave 1 (sequential within wave — Domain 1 first, Domain 2 second):
  m38-headless-spawn-default   ────► commands/* spawn pattern + headless-default-contract.md
                                                            │
                                                            ▼
  m38-meter-reduction          ────► strip meter machinery + supervisor callsite updates
                                                            │
                                            GATE: Wave 1 complete
                                                            │
Wave 2 (parallel after Wave 1 gate — 3 truly-independent domains):
  ┌─────────────────────────────────────────────────────────┘
  m38-unattended-event-stream  ────► event emission + watch tick reform
  m38-router-conversational    ────► gsd.md intent classifier + delete 3 commands
  m38-cleanup-and-docs         ────► delete self-improvement loop + doc ripple + version bump
                                                            │
                                            GATE: Wave 2 complete
                                                            │
                                                            ▼
                            VERIFY → COMPLETE-MILESTONE → tag v3.12.10
```

### Abbreviation Key

| Abbrev | Domain |
|--------|--------|
| H1 | m38-headless-spawn-default |
| MR | m38-meter-reduction |
| ES | m38-unattended-event-stream |
| RC | m38-router-conversational |
| CD | m38-cleanup-and-docs |

### Checkpoints

- **M38-CP1** (Domain 1 complete within Wave 1): `headless-default-contract.md` v1.0.0 finalized + every command file converted to `autoSpawnHeadless()` + `--watch` flag implemented + tests green → unblocks Domain 2
- **M38-CP2** (Wave 1 complete): meter machinery stripped (runway-estimator/token-telemetry/three-band/dead-meter detection deleted) + supervisor callsites updated + 7 stranded context-meter tests rewritten + `bin/token-budget.cjs` single-band → unblocks Wave 2
- **M38-CP3** (Domain 3 complete within Wave 2): `bin/event-stream.cjs` operational + watch tick reform shipped + `unattended-event-stream-contract.md` v1.0.0 finalized
- **M38-CP4** (Domain 4 complete within Wave 2): Router intent classifier live + 3 conversational commands deleted + tests adjusted
- **M38-CP5** (Wave 2 complete): All Wave 2 domains done + Domain 5 doc ripple + version bump 3.11.11 → 3.12.10 + folded contracts deleted + `gsd-t version-update-all` ready (user-gated) → ready for verify + complete-milestone

### File-Ownership Map (M38)

| File / directory | Owner |
|------------------|-------|
| `bin/headless-auto-spawn.cjs` | H1 |
| `commands/gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-integrate.md`, `gsd-t-quick.md`, `gsd-t-debug.md`, `gsd-t-scan.md`, `gsd-t-verify.md` (spawn pattern + `--watch` flag) | H1 (Wave 1) |
| `.gsd-t/contracts/headless-default-contract.md` (NEW) | H1 |
| `bin/token-budget.cjs`, `scripts/gsd-t-context-meter.js`, `scripts/context-meter/threshold.js`, `scripts/context-meter/transcript-parser.js` | MR |
| `bin/runway-estimator.cjs`, `bin/token-telemetry.cjs/.js` (DELETE) | MR |
| `commands/*.md` per-spawn token bracket / runway gate / Step 0.2 auto-pause STRIPS | MR (Wave 1, after H1) |
| `bin/gsd-t-unattended.cjs` meter callsite updates | MR (Wave 1) |
| `.gsd-t/contracts/context-meter-contract.md` v1.3.0 | MR |
| `bin/event-stream.cjs` (NEW), `bin/gsd-t-unattended.cjs` event emission, `commands/gsd-t-unattended-watch.md` reform | ES |
| `.gsd-t/contracts/unattended-event-stream-contract.md` (NEW) | ES |
| `.gsd-t/contracts/unattended-supervisor-contract.md` v1.1.0 (UPDATE) | ES |
| `commands/gsd.md` (intent classifier) | RC |
| `commands/gsd-t-prompt.md`, `gsd-t-brainstorm.md`, `gsd-t-discuss.md` (DELETE) | RC |
| `commands/gsd-t-optimization-apply.md`, `gsd-t-optimization-reject.md`, `gsd-t-reflect.md`, `gsd-t-audit.md` (DELETE) | CD |
| `bin/qa-calibrator.js`, `bin/token-optimizer.js` (DELETE) | CD |
| `commands/gsd-t-complete-milestone.md` Step 14 removal, `gsd-t-backlog-list.md` `--file` flag removal, `gsd-t-status.md` Step 0.5 removal | CD |
| `commands/gsd-t-help.md` (entry deletions for 4 self-improvement + 3 conversational = 7 total) | CD (coordinate with RC for the 3 conversational entries) |
| `templates/CLAUDE-global.md`, `templates/CLAUDE-project.md`, project `CLAUDE.md` | CD |
| `docs/architecture.md`, `docs/workflows.md`, `docs/infrastructure.md`, `docs/methodology.md`, `docs/requirements.md`, `docs/prd-harness-evolution.md` | CD |
| `README.md`, `GSD-T-README.md`, `CHANGELOG.md` | CD |
| `package.json` (3.11.11 → 3.12.10), `bin/gsd-t.js` (command count) | CD |
| Deleted contracts: `runway-estimator-contract.md`, `token-telemetry-contract.md`, `headless-auto-spawn-contract.md`, `qa-calibration-contract.md`, `harness-audit-contract.md` | CD |
| Test additions/rewrites: `test/headless-auto-spawn.test.js` extend, `test/headless-default.test.js` NEW, `test/event-stream.test.js` NEW, `test/unattended-watch.test.js` NEW, `test/router-intent.test.js` NEW, `test/token-budget.test.js` REWRITE, `scripts/gsd-t-context-meter.test.js` REWRITE 7 stranded, `test/filesystem.test.js` count adjust, DELETE `test/runway-estimator.test.js` + `test/token-telemetry.test.js` | per owning domain |

### Shared File Sequencing (Critical — M38)

The 7 command files in H1's scope are ALSO touched by MR (token bracket strips). The agreed sequence:

1. **Within Wave 1**: H1 lands FIRST (converts spawn pattern, adds `--watch`, preserves OBSERVABILITY LOGGING blocks)
2. **Then within Wave 1**: MR applies on top (strips per-spawn token brackets, runway gates, Step 0.2 auto-pause STOP language). The blocks MR strips are distinct from H1's edits — additive separations.
3. **Within Wave 2**: CD applies the doc-ripple AFTER ES + RC are done so docs reflect final command-file shape.

The supervisor (`bin/gsd-t-unattended.cjs`) is touched by both MR (meter callsite updates) and ES (event emission). Sequence:

1. **Wave 1**: MR updates meter callsites
2. **Wave 2**: ES adds event emission on top of MR's clean state

### Self-Modifying Sequencing Rationale

M38 deletes/rewires load-bearing parts the unattended supervisor itself uses. To prevent the supervisor from pulling the rug out from under itself, the partition sequences:

- **Wave 1 (H1 + MR) = supervisor-critical infrastructure**: spawn primitive + meter machinery. MUST land before any unattended run executes Wave 2 work. If a user re-launches `/gsd-t-unattended` mid-M38, it must be against a Wave-1-complete codebase.
- **Wave 2 (ES + RC + CD) = supervisor-extension and cleanup**: event emission improves the supervisor; router and cleanup are independent of supervisor execution path. Safe to run unattended once Wave 1 is in.

The interactive partition step (Path A choice in this resume cycle) gates the supervisor against Wave 1's land before unattended execution of Wave 2. After this partition completes, Wave 1 should be executed interactively (or via headless-default `autoSpawnHeadless()` pattern). Wave 2 can run unattended.

### Wave Execution Groups (M38)

#### Wave 1 — Supervisor-Critical (sequential within wave)

| Domain | Owner | Concern |
|--------|-------|---------|
| m38-headless-spawn-default | H1 | Lands FIRST. Spawn primitive + `--watch` + headless-default-contract |
| m38-meter-reduction | MR | Lands SECOND, on top of H1. Meter strip + supervisor callsite updates |

**Completes when**: M38-CP1 + M38-CP2 both pass; full test suite green at clean Wave-1 state

#### Wave 2 — Independent Parallel (after Wave 1 gate)

| Domain | Owner | Parallel-safe? |
|--------|-------|----------------|
| m38-unattended-event-stream | ES | Yes — owns disjoint files (event-stream.cjs NEW, watch.md, unattended.cjs additive) |
| m38-router-conversational | RC | Yes — owns gsd.md + 3 deletions; help.md edits coordinated with CD |
| m38-cleanup-and-docs | CD | Mostly yes; runs LAST in the wave to capture final shape in docs |

**Within-Wave-2 sequencing**:
- ES + RC truly parallel
- CD waits for ES + RC to finish, then does the doc ripple in one pass (Document Ripple Completion Gate per CLAUDE-global.md)

**Completes when**: M38-CP3 + M38-CP4 + M38-CP5 all pass; full test suite green; deleted contracts removed; version bumped

### Execution Order (solo mode)

1. Wave 1: H1 (sequential tasks within domain) → COMMIT → MR (sequential tasks within domain)
2. GATE: M38-CP2 (Wave 1 complete) — full test suite green, supervisor smoke test
3. Wave 2: ES + RC parallel → COMMIT both → CD (doc ripple complete pass) → COMMIT
4. GATE: M38-CP5 (Wave 2 complete)
5. `/gsd-t-verify` → auto-invokes `/gsd-t-complete-milestone`
6. User-gated: `npm publish` + `gsd-t version-update-all`

---

## Previous State: Milestone 35 — No Silent Degradation + Surgical Model Escalation + Token Telemetry (PLANNED — 7 domains)

## M35 Dependency Graph

```
Wave 1 (parallel-safe, foundational):
  degradation-rip-out T1+T2  ──────────────────────────────────────────┐
  model-selector-advisor T1 (investigation — no file edits)             │
  token-telemetry T1+T2 ─────────────────────────────────────────────── GATE: Wave 1 complete
                                                                        │
Wave 2 (parallel after Wave 1 gate):                                    │
  ┌─────────────────────────────────────────────────────────────────────┘
  degradation-rip-out T3 → T4
  model-selector-advisor T2 → T3 → T4 → T5 (blocked by DR-T3) → T6 (blocked by DR-T4)
  token-telemetry T3 (blocked by DR-T3) → T4 → T5 → T6
                                                          │
                                     GATE: Wave 2 complete
                                                          │
Wave 3 (parallel after Wave 2 gate):                      │
  ┌───────────────────────────────────────────────────────┘
  runway-estimator T1 → T2 → T3 → T4 (blocked by HAS-T1) → T5 (blocked by HAS-T3)
  headless-auto-spawn T1 → T2 → T3 (blocked by RE-T5)
                                          │
                     GATE: Wave 3 complete (smoke tests pass)
                                          │
Wave 4 (after Wave 3 gate):               │
  ┌───────────────────────────────────────┘
  optimization-backlog T1 (blocked by TT-T2 + MSA-T4) → T2 → T3 (blocked by HAS-T4) → T4
  headless-auto-spawn T4 → T5
                   │
  GATE: Wave 4 complete
                   │
Wave 5 (final docs + verify):
  docs-and-tests T3 → T1 → T2 → T4 → T5 → T6 → T7 → T8 → complete-milestone
```

### Abbreviation Key

| Abbrev | Domain |
|--------|--------|
| DR     | m35-degradation-rip-out |
| MSA    | m35-model-selector-advisor |
| TT     | m35-token-telemetry |
| RE     | m35-runway-estimator |
| HAS    | m35-headless-auto-spawn |
| OB     | m35-optimization-backlog |
| DAT    | m35-docs-and-tests |

### Checkpoints

- **M35-CP1** (Wave 1 complete): `token-budget-contract.md` v3.0.0 finalized + `token-telemetry-contract.md` v1.0.0 finalized + advisor findings documented → unblocks all Wave 2 work
- **M35-CP2** (Wave 2 complete): All command-file sweeps done (Token Budget Check + Model Assignment blocks + token brackets), 3-band API live, model-selector.js implemented, token telemetry wiring in 6 files, `gsd-t metrics` CLI → unblocks Wave 3
- **M35-CP3** (Wave 3 complete): Runway estimator + headless-auto-spawn T1/T2/T3 operational, smoke tests pass, debug handoff tested → unblocks Wave 4
- **M35-CP4** (Wave 4 complete): Optimization backlog + headless read-back banner + all unit tests → unblocks Wave 5 docs pass
- **M35-CP5** (Wave 5 complete): All docs updated, REQ-069–078 verified, full test suite green, version bumped → ready for complete-milestone

### File-Ownership Map (M35)

| File / directory | Owner |
|------------------|-------|
| `bin/token-budget.js`, `test/token-budget.test.js`, `.gsd-t/contracts/token-budget-contract.md` | degradation-rip-out |
| `bin/model-selector.js`, `bin/advisor-integration.js`, `test/model-selector.test.js`, `test/advisor-integration.test.js`, `.gsd-t/contracts/model-selection-contract.md`, `.gsd-t/M35-advisor-findings.md` | model-selector-advisor |
| `bin/token-telemetry.js`, `.gsd-t/token-metrics.jsonl`, `.gsd-t/contracts/token-telemetry-contract.md`, `test/token-telemetry.test.js` | token-telemetry |
| `bin/runway-estimator.js`, `.gsd-t/contracts/runway-estimator-contract.md`, `test/runway-estimator.test.js` | runway-estimator |
| `bin/headless-auto-spawn.js`, `bin/check-headless-sessions.js`, `.gsd-t/contracts/headless-auto-spawn-contract.md`, `.gsd-t/headless-sessions/`, `test/headless-auto-spawn.test.js`, `test/runway-debug-handoff.test.js` | headless-auto-spawn |
| `bin/token-optimizer.js`, `.gsd-t/optimization-backlog.md`, `commands/gsd-t-optimization-apply.md`, `commands/gsd-t-optimization-reject.md`, `test/token-optimizer.test.js` | optimization-backlog |
| `README.md`, `docs/GSD-T-README.md`, `docs/methodology.md`, `docs/architecture.md`, `docs/infrastructure.md`, `docs/requirements.md`, `docs/prd-harness-evolution.md` (final pass), `CHANGELOG.md`, `package.json`, `.gsd-t/progress.md`, memory files | docs-and-tests |
| `commands/gsd-t-execute.md` | DR-T3, MSA-T5, TT-T3, RE-T4 (sequential waves 2→3) |
| `commands/gsd-t-wave.md` | DR-T3, MSA-T5, TT-T3, RE-T4 (sequential waves 2→3) |
| `commands/gsd-t-quick.md` | DR-T3, MSA-T5, TT-T3, RE-T4 (sequential waves 2→3) |
| `commands/gsd-t-integrate.md` | DR-T3, MSA-T5, TT-T3, RE-T4 (sequential waves 2→3) |
| `commands/gsd-t-debug.md` | DR-T3, MSA-T5, TT-T3, RE-T4, HAS-T3, RE-T5 (sequential waves 2→3) |
| `commands/gsd-t-doc-ripple.md` | DR-T3, MSA-T5, TT-T3 (sequential wave 2) |
| `commands/gsd-t-partition.md`, `commands/gsd-t-discuss.md`, `commands/gsd-t-plan.md`, `commands/gsd-t-verify.md`, `commands/gsd-t-test-sync.md` | MSA-T5 (wave 2) |
| `templates/CLAUDE-global.md`, `templates/CLAUDE-project.md` | DR-T4 then MSA-T6 then DAT-T7 (sequential waves 2→5) |
| `commands/gsd-t-complete-milestone.md` | OB-T3 (wave 4) |
| `commands/gsd-t-backlog-list.md`, `commands/gsd-t-status.md`, `commands/gsd-t-help.md` | OB-T3, HAS-T4 (wave 4 — additive) |
| `commands/gsd-t-resume.md` | HAS-T4 (wave 4) |
| `bin/gsd-t.js` | TT-T4/T5/T6 (wave 2), DAT-T6 (wave 5) |

### Shared File Execution Order (Critical)

The following files are touched by multiple domains across multiple waves. Apply in wave order:

1. `commands/gsd-t-execute.md` and the other 5 command files: Wave 2 (DR-T3 Token Budget sweep first, then MSA-T5 Model Assignment block, then TT-T3 token bracket) → Wave 3 (RE-T4 Step 0 runway check)
2. `commands/gsd-t-debug.md`: same as above plus HAS-T3 debug handoff (Wave 3) and RE-T5 inter-iteration check (Wave 3)
3. `templates/CLAUDE-global.md` and `templates/CLAUDE-project.md`: DR-T4 (Wave 2 Token-Aware rename) → MSA-T6 (Wave 2 Model Assignment section) → DAT-T7 (Wave 5 final consistency pass)
4. `commands/gsd-t-status.md`: HAS-T4 (headless banner, Wave 4) → OB-T3 (optimization one-liner, Wave 4 — apply HAS-T4 first)

## M35 Wave Execution Groups

### Wave 1 — Foundational (parallel-safe)

| Domain | Tasks | Shared files | Notes |
|--------|-------|--------------|-------|
| degradation-rip-out | T1, T2 | None with Wave 1 peers | T1 then T2 (sequential within domain) |
| model-selector-advisor | T1 | None (no file edits) | Investigation only |
| token-telemetry | T1, T2 | None with Wave 1 peers | T1 then T2 (sequential within domain) |

**Completes when**: DR-T2 done (token-budget-contract v3.0.0), MSA-T1 done (advisor-findings.md), TT-T2 done (token-telemetry.js skeleton)

### Wave 2 — Parallel Expansion (after Wave 1 gate)

| Domain | Tasks | Shared file concerns |
|--------|-------|----------------------|
| degradation-rip-out | T3, T4 | T3 touches 6 command files; T4 touches 2 templates + 1 PRD |
| model-selector-advisor | T2, T3, T4, T5, T6 | T5 blocked by DR-T3; T6 blocked by DR-T4 |
| token-telemetry | T3, T4, T5, T6 | T3 blocked by DR-T3 (same 6 command files) |

**Within-Wave-2 sequencing for shared files**:
- Run DR-T3 (Token Budget sweep) first on the 6 command files
- Then run TT-T3 (token brackets) and MSA-T5 (Model Assignment blocks) on those same files — additive, distinct sections
- Run DR-T4 on templates first, then MSA-T6 on same templates

**Completes when**: All DR/MSA/TT Wave 2 tasks done

### Wave 3 — Protection Self-Hosts (sequential checkpoints within wave)

| Domain | Tasks | Blocked by |
|--------|-------|------------|
| runway-estimator | T1, T2, T3 | Wave 2 complete |
| runway-estimator | T4 | HAS-T1 (autoSpawnHeadless must exist) |
| runway-estimator | T5 | HAS-T3 (debug handoff must exist) |
| headless-auto-spawn | T1, T2 | Wave 2 complete |
| headless-auto-spawn | T3 | RE-T5 (inter-iteration check must exist first) |

**Intra-Wave-3 order**: RE-T1→T2→T3 and HAS-T1→T2 in parallel; then RE-T4 (needs HAS-T1); then HAS-T3 and RE-T5 together

**Completes when**: Smoke tests in RE-T5 pass; HAS-T3 integration test passes

### Wave 4 — Stabilization (after Wave 3 gate)

| Domain | Tasks | Blocked by |
|--------|-------|------------|
| optimization-backlog | T1 | TT-T2, MSA-T4 |
| optimization-backlog | T2, T4 | OB-T1 |
| optimization-backlog | T3 | HAS-T4 (status.md edit order) |
| headless-auto-spawn | T4 | Wave 3 complete |
| headless-auto-spawn | T5 | HAS-T4 |

**Intra-Wave-4 order**: HAS-T4 first (status.md), then OB-T1→T2→T3→T4 (T3 after HAS-T4)

**Completes when**: All OB and remaining HAS tasks done; integration roundtrip test passes

### Wave 5 — Docs + Verify + Complete (after Wave 4 gate)

All docs-and-tests tasks in recommended order: T3 → T1 → T2 → T4 → T5 → T6 → T7 → T8

**Completes when**: T8 reports full suite green, goal-backward verify 0 findings

## Execution Order (solo mode)

1. Wave 1: DR-T1, DR-T2, MSA-T1, TT-T1, TT-T2 (all parallel-safe)
2. GATE: Wave 1 complete
3. Wave 2: DR-T3 (first on shared files), then DR-T4, MSA-T2, MSA-T3, MSA-T4 (parallel), then MSA-T5+TT-T3 (after DR-T3), then MSA-T6+TT-T4/T5/T6 (after DR-T4 and TT skeleton)
4. GATE: Wave 2 complete
5. Wave 3: RE-T1+T2+T3, HAS-T1+T2 (parallel); then RE-T4 (needs HAS-T1); then RE-T5+HAS-T3 (parallel)
6. GATE: Wave 3 smoke tests pass
7. Wave 4: HAS-T4, OB-T1 (parallel); then OB-T2+T4, HAS-T5 (parallel); then OB-T3 (needs HAS-T4)
8. GATE: Wave 4 complete
9. Wave 5: DAT-T3, DAT-T1, DAT-T2, DAT-T4, DAT-T5, DAT-T6, DAT-T7, DAT-T8
10. complete-milestone → git tag v2.76.10

---

## Previous State: Milestone 34 — Context Meter (COMPLETE — 5 domains)

## M34 Dependency Graph

```
                          context-meter-config
                          (schema + loader)
                                 |
                    +------------+------------+
                    |                         |
                    v                         v
          context-meter-hook       installer-integration
          (runtime script)         (install + doctor + status)
                    |                         |
                    +------------+------------+
                                 |
                                 v
                   token-budget-replacement
                   (rewrite + command file cleanup + task-counter deletion)
                                 |
                                 v
                        m34-docs-and-tests
                        (user-facing docs + integration tests + version bump)
```

### Checkpoints

- **M34-CP1**: `context-meter-config` finalizes `context-meter-contract.md` (schema + state file format) → unblocks `context-meter-hook` and `token-budget-replacement`.
- **M34-CP2**: `context-meter-hook` delivers a working `scripts/gsd-t-context-meter.js` with passing unit tests → unblocks `installer-integration` (which must copy the script) and `token-budget-replacement` (which tests against real state file output).
- **M34-CP3**: `token-budget-replacement` finishes deleting `bin/task-counter.cjs` and removing all command-file references → unblocks `installer-integration` to update `PROJECT_BIN_TOOLS` without shipping a broken-window state.
- **M34-CP4**: All three implementation domains (hook, config, installer, token-budget) report unit tests passing → unblocks `m34-docs-and-tests` to begin final docs pass + integration tests + version bump.

### File-Ownership Map (M34)

| File / directory | Owner |
|---|---|
| `scripts/gsd-t-context-meter.js`, `scripts/context-meter/**`, `scripts/gsd-t-context-meter.test.js` | context-meter-hook |
| `.gsd-t/context-meter-config.json`, `templates/context-meter-config.json`, `bin/context-meter-config.cjs`, `bin/context-meter-config.test.cjs`, `.gsd-t/contracts/context-meter-contract.md` | context-meter-config |
| `bin/gsd-t.js` | installer-integration |
| `bin/token-budget.js`, `bin/token-budget.test.js`, `bin/orchestrator.js`, `bin/task-counter.cjs` (DELETE), `bin/task-counter.test.cjs` (DELETE), `.gsd-t/contracts/token-budget-contract.md`, `.gsd-t/contracts/context-observability-contract.md`, `commands/gsd-t-execute.md`, `commands/gsd-t-wave.md`, `commands/gsd-t-quick.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-debug.md` | token-budget-replacement |
| `README.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`, `templates/CLAUDE-project.md`, `docs/methodology.md`, `docs/architecture.md`, `docs/requirements.md`, `docs/infrastructure.md`, `CHANGELOG.md`, `package.json` (version bump), `tests/integration/**` | m34-docs-and-tests |

### Wave Ordering (recommended)

1. **Wave 1** (parallel): `context-meter-config` + `context-meter-hook` — can run concurrently once the contract is drafted.
2. **Wave 2** (parallel after CP1+CP2): `installer-integration` + `token-budget-replacement` — serialized against each other only at CP3 (PROJECT_BIN_TOOLS update must follow task-counter deletion).
3. **Wave 3** (serial after CP4): `m34-docs-and-tests`.

---

## Historical: Milestone 32 — Quality Culture & Design (PLANNED — 3 domains)

## M32 Dependency Graph

### Wave 1: All domains are INDEPENDENT and parallel-safe

All three M32 domains touch distinct files with no shared ownership:
- quality-persona: templates/CLAUDE-project.md, gsd-t-init.md, gsd-t-setup.md
- design-brief: gsd-t-partition.md, gsd-t-plan.md, gsd-t-setup.md (different sections)
- evaluator-interactivity: gsd-t-execute.md, gsd-t-quick.md, gsd-t-integrate.md, gsd-t-debug.md

> Note: both quality-persona and design-brief touch gsd-t-setup.md but in different sections
> (persona config vs. design brief generation). This is safe as long as edits are to distinct
> steps and do not conflict. Execute these tasks in the same session but with non-overlapping
> section targets, or run them sequentially.

### Shared File Alert: gsd-t-setup.md

| Domain           | Section Target in gsd-t-setup.md        |
|------------------|------------------------------------------|
| quality-persona  | New step: persona configuration option   |
| design-brief     | New step: design brief generation option |

**Resolution**: These are additive new steps in different locations within the file. The execute agent must apply both changes in a single pass to avoid merge conflicts.

### Checkpoint: M32 Complete

- GATE: `templates/CLAUDE-project.md` contains `## Quality North Star` section with preset options
- GATE: `commands/gsd-t-init.md` contains persona detection/selection step
- GATE: `commands/gsd-t-setup.md` contains both persona config AND design brief generation options
- GATE: `commands/gsd-t-partition.md` contains design brief detection/generation step
- GATE: `commands/gsd-t-plan.md` contains note referencing design brief for UI tasks
- GATE: `commands/gsd-t-execute.md` contains exploratory testing block in QA/Red Team section
- GATE: `commands/gsd-t-quick.md` contains exploratory testing block
- GATE: `commands/gsd-t-integrate.md` contains exploratory testing block
- GATE: `commands/gsd-t-debug.md` contains exploratory testing block
- VERIFY: All exploratory blocks skip silently when Playwright MCP not available
- VERIFY: Persona injection skips silently when `## Quality North Star` section absent
- VERIFY: Design brief generation skips for non-UI projects

## M32 Detailed Dependency Graph

```
quality-persona Task 1 — INDEPENDENT, parallel-safe
  - templates/CLAUDE-project.md (new section)
  - commands/gsd-t-init.md (new step)
  - commands/gsd-t-setup.md (new option — section A)

design-brief Task 1 — INDEPENDENT, parallel-safe (caution: gsd-t-setup.md shared)
  - commands/gsd-t-partition.md (new detection step)
  - commands/gsd-t-plan.md (new reference note)
  - commands/gsd-t-setup.md (new option — section B, different from quality-persona's)

evaluator-interactivity Task 1 — INDEPENDENT, parallel-safe
  - commands/gsd-t-execute.md (exploratory block)
  - commands/gsd-t-quick.md (exploratory block)
  - commands/gsd-t-integrate.md (exploratory block)
  - commands/gsd-t-debug.md (exploratory block)

All three tasks complete → CHECKPOINT: M32 Complete
```

## M32 Wave Execution Groups

### Wave 1 — All Domains (parallel-safe with sequential constraint on gsd-t-setup.md)

All three domains are independent with no cross-domain blocking dependencies.

| Domain                  | Task | Files                                                              |
|-------------------------|------|--------------------------------------------------------------------|
| quality-persona         | T1   | templates/CLAUDE-project.md, gsd-t-init.md, gsd-t-setup.md (§A)  |
| design-brief            | T1   | gsd-t-partition.md, gsd-t-plan.md, gsd-t-setup.md (§B)           |
| evaluator-interactivity | T1   | gsd-t-execute.md, gsd-t-quick.md, gsd-t-integrate.md, gsd-t-debug.md |

**Shared files**: `gsd-t-setup.md` — touched by both quality-persona (§A: persona config) and design-brief (§B: design brief generation). These are additive edits in separate sections; safe to apply in a single sequential pass (quality-persona first, then design-brief).

**Completes when**: All three Task 1s are done and M32 checkpoint gates pass.

### Integration

After Wave 1 completes, no wiring step is needed — all three domains contribute independent additions to existing commands. Integration is implicit in the gsd-t-setup.md sequential edit constraint.

## M32 Execution Recommendation

Run all three tasks in the same execute session. Since evaluator-interactivity touches 4 different files from the other two domains, it is fully parallel-safe. The quality-persona + design-brief tasks share gsd-t-setup.md — execute them sequentially (quality-persona first, then design-brief) to apply both changes in one file pass.

## Execution Order (solo mode)

1. quality-persona Task 1 (templates/CLAUDE-project.md + gsd-t-init.md + gsd-t-setup.md §A)
2. design-brief Task 1 (gsd-t-partition.md + gsd-t-plan.md + gsd-t-setup.md §B) — sequential after quality-persona to avoid gsd-t-setup.md edit conflict
3. evaluator-interactivity Task 1 (4 command files) — parallel-safe with either of the above
4. CHECKPOINT: verify all 9 gate conditions pass

---

## Previous State: Milestone 30 — Stack Rules Engine (PARTITIONED — 2 domains)

## M30 Dependency Graph

### Wave 1: stack-templates (must complete first)
- stack-templates: All tasks (react.md, typescript.md, node-api.md)
- INDEPENDENT — no dependencies on other domains

### Checkpoint 1 (stack-templates complete)
- GATE: `templates/stacks/react.md` exists and follows template structure contract
- GATE: `templates/stacks/typescript.md` exists and follows template structure contract
- GATE: `templates/stacks/node-api.md` exists and follows template structure contract
- VERIFY: Each file starts with `# {Name} Standards` and includes mandatory framing

### Wave 2: command-integration (after stack-templates complete)
- command-integration: All tasks (detection + injection in 5 commands + QA + tests + docs)
- BLOCKED BY: stack-templates completion (templates must exist for integration tests)

### Final Checkpoint (command-integration complete)
- GATE: All 5 target commands contain stack detection + injection block
- GATE: QA subagent prompts include stack rule validation
- GATE: Reference docs updated (README, GSD-T-README, CLAUDE-global, gsd-t-help)
- GATE: Tests validate detection logic and template matching
- VERIFY: All existing tests pass (537+)

## M30 Detailed Dependency Graph

```
stack-templates Task 1 (react.md) — INDEPENDENT, parallel-safe
stack-templates Task 2 (typescript.md) — INDEPENDENT, parallel-safe
stack-templates Task 3 (node-api.md) — INDEPENDENT, parallel-safe

stack-templates complete — CHECKPOINT 1
  └──▶ command-integration Task 1 (detection block + execute + quick wiring)
  └──▶ command-integration Task 2 (integrate + wave + debug wiring)
  └──▶ command-integration Task 3 (QA prompt updates across all 5 commands)
  └──▶ command-integration Task 4 (tests + reference doc updates)
```

---

## Previous State: Milestone 29 — Compaction-Proof Debug Loop (PARTITIONED — 3 domains)

## Dependency Graph

### Wave 1: debug-state-protocol (must complete first)
- debug-state-protocol: All tasks (ledger API + contract + tests)
- INDEPENDENT — no dependencies on other domains

### Checkpoint 1 (debug-state-protocol complete)
- GATE: bin/debug-ledger.js exists and exports all 6 functions (readLedger, appendEntry, compactLedger, generateAntiRepetitionPreamble, getLedgerStats, clearLedger)
- GATE: .gsd-t/contracts/debug-loop-contract.md exists with ledger schema and API definitions
- VERIFY: All ledger functions work correctly (unit tests pass)

### Wave 2: headless-loop (after debug-state-protocol complete)
- headless-loop: All tasks (CLI debug-loop mode + escalation tiers + tests)
- BLOCKED BY: debug-state-protocol completion (imports bin/debug-ledger.js)

### Checkpoint 2 (headless-loop complete)
- GATE: `gsd-t headless --debug-loop --help` produces valid output
- GATE: --max-iterations flag enforced externally
- GATE: Escalation tiers work (sonnet 1-5, opus 6-15, stop 16-20)
- VERIFY: Unit tests for loop functions pass

### Wave 3: command-integration (after headless-loop complete)
- command-integration: All tasks (wire 5 commands + update reference docs)
- BLOCKED BY: headless-loop completion (commands reference the debug-loop invocation)

### Final Checkpoint (command-integration complete)
- GATE: All 5 target commands contain debug-loop delegation pattern
- GATE: Reference docs updated (README, GSD-T-README, CLAUDE-global, gsd-t-help)
- VERIFY: All existing tests pass (537+)

## Detailed Dependency Graph

```
debug-state-protocol Task 1 (contract finalization + ledger schema) — INDEPENDENT
  └──▶ debug-state-protocol Task 2 (bin/debug-ledger.js — all 6 exports)
       └──▶ debug-state-protocol Task 3 (unit tests for ledger API)

debug-state-protocol Task 3 complete — CHECKPOINT 1
  └──▶ headless-loop Task 1 (--debug-loop flag parsing + doHeadlessDebugLoop skeleton)
       └──▶ headless-loop Task 2 (iteration cycle + escalation tiers + preamble injection)
            └──▶ headless-loop Task 3 (unit tests for debug-loop functions)

headless-loop Task 3 complete — CHECKPOINT 2
  └──▶ command-integration Task 1 (wire execute + debug — parallel-safe)
  └──▶ command-integration Task 2 (wire wave + test-sync + verify — parallel-safe)
  └──▶ command-integration Task 3 (update 4 reference docs — parallel-safe)
```

## Wave Execution Groups

### Wave 1 — Foundation
- debug-state-protocol: Tasks 1-3 (sequential — contract → implementation → tests)

### Wave 2 — Loop Controller
- headless-loop: Tasks 1-3 (sequential — skeleton → full implementation → tests)

### Wave 3 — Wiring (all parallel-safe after checkpoint)
- command-integration: Tasks 1-3 (parallel-safe — each touches different files)

## Shared File Analysis

No shared files between domains. Each domain owns distinct files:
- debug-state-protocol: bin/debug-ledger.js, test/debug-ledger.test.js, .gsd-t/contracts/debug-loop-contract.md
- headless-loop: bin/gsd-t.js (new functions only), test/headless-debug-loop.test.js
- command-integration: 5 command files + 4 reference docs
