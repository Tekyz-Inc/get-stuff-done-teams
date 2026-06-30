# Tasks: m99-d2-layer2-decision-logging

> **Wave 2** — starts ONLY after D1's resolver lands + the migration shim is proven (D1 is the serial
> gate). Runs in parallel with D3; fully file-disjoint from D3. IMPORTS D1's resolver — never hardcodes
> a path. Contracts: [`graph-store-resolver-contract.md`](../../contracts/graph-store-resolver-contract.md)
> (consumer), [`graph-metrics-contract.md`](../../contracts/graph-metrics-contract.md) § Layer-2a/2b/2c.

## Files Owned
- scripts/gsd-t-graph-intercept.js
- scripts/gsd-t-read-intercept.js
- templates/workflows/gsd-t-scan.workflow.js
- templates/workflows/gsd-t-verify.workflow.js
- templates/workflows/gsd-t-debug.workflow.js
- templates/workflows/gsd-t-integrate.workflow.js
- templates/workflows/gsd-t-quick.workflow.js
- templates/workflows/gsd-t-phase.workflow.js
- test/m99-layer2-decision-logging.test.js
- test/m99-wiring-mode.test.js

---

### M99-D2-T1 — grep-intercept: repoint + Layer-2a logging
**What:** In `scripts/gsd-t-graph-intercept.js`: (1) repoint the `fs.existsSync(...graph.db)` presence
check (`:69`) at D1's resolver (`resolveStorePath`, imported — never re-derive) so the hook does NOT
silently disable after the `graphDB/` migration; (2) add Layer-2a logging — one ledger line per decision
`{kind:'grep', classified:'structural'|'text', action:'replaced'|'passthrough', patternShape, consumer}`
via `append_ledger_line`, INCLUDING text-classified passthrough. The classify LOGIC is UNCHANGED — logging
is a pure side-channel; fail-open; byte-identical decision with telemetry on vs. off.
**Files (ImplPath):** `scripts/gsd-t-graph-intercept.js` — `:69` (presence-check repoint) + one `append_ledger_line` call per decision branch (replaced + passthrough).
**Touches:** scripts/gsd-t-graph-intercept.js
**Contract:** graph-metrics-contract.md § Layer-2a (`kind:"grep"` field set); graph-store-resolver-contract.md (import resolver).
**Depends on:** D1 complete (imports `resolveStorePath`, `append_ledger_line`).
**Test:** `test/m99-layer2-decision-logging.test.js` — a structural grep ⇒ exactly one `kind:'grep'`
`action:'replaced'` line; a text grep ⇒ exactly one `action:'passthrough'` line (passthrough still logs);
classified value matches the (unchanged) classifier; the chosen path (replace vs passthrough) is
byte-identical with `GSDT_GRAPH_TELEMETRY` on vs off.
**AC:** Criteria 9 (one line per grep decision, incl. passthrough), 11 (byte-identical on/off), 12 (consumer attributed). `[RULE] presence-check-repointed`, `[RULE] byte-identical-on-off`, `[RULE] fail-open`, `[RULE] import-resolver-never-hardcode`.

### M99-D2-T2 — read-intercept: repoint + Layer-2b logging
**What:** In `scripts/gsd-t-read-intercept.js`: (1) repoint the presence check (`:74`) AND the
`new Database(...graph.db...)` open (`:108`) at D1's resolver (`resolveStorePath`, imported); (2) add
Layer-2b logging — one line per augment/passthrough decision `{kind:'read', action:'augment'|'passthrough',
file, consumer}`. The M98 augment-never-shrink rule is KEPT (default pass-through; an augment only ADDS a
body-verb pointer, never shrinks). Fail-open; byte-identical augment-vs-passthrough decision on vs. off.
**Files (ImplPath):** `scripts/gsd-t-read-intercept.js` — `:74` (presence repoint), `:108` (`Database(...)` open repoint) + one `append_ledger_line` per decision branch.
**Touches:** scripts/gsd-t-read-intercept.js
**Contract:** graph-metrics-contract.md § Layer-2b (`kind:"read"` field set); graph-store-resolver-contract.md (import resolver).
**Depends on:** D1 complete.
**Test:** `test/m99-layer2-decision-logging.test.js` — a read that augments ⇒ one `kind:'read'`
`action:'augment'` line; a passthrough read ⇒ one `action:'passthrough'` line; the read OUTPUT is
byte-identical with telemetry on vs off AND never shrinks vs. the raw read (never-shrink KEPT).
**AC:** Criteria 10 (one line per read decision), 11 (byte-identical on/off), 12. `[RULE] presence-check-repointed`, `[RULE] augment-never-shrink-kept`, `[RULE] byte-identical-on-off`, `[RULE] fail-open`.

### M99-D2-T3 — per-workflow consumer label + graphWiringMode persistence
**What:** Add the consumer preamble to all 6 graph-consuming workflows (scan/verify/debug/integrate/quick/phase):
set `GSDT_GRAPH_CONSUMER` to the workflow name and probe-and-persist `graphWiringMode`
(`WIRED`|`fallback-announced`|`disabled`) into the ledger as a `kind:'wiring'` line via `append_ledger_line`.
This closes the NiceNote gap: a `fallback-announced` wiring line co-occurring with a same-window
Layer-1 `outcome:'hit'` is the machine-visible contradiction.
**Files (ImplPath):** `templates/workflows/gsd-t-scan.workflow.js`, `-verify`, `-debug`, `-integrate`,
`-quick`, `-phase` — each gains the consumer-env + `kind:'wiring'` ledger write (via the inline runCli /
Bash `agent()` helper, since the sandbox has no `require`/`fs`; the wiring line is written through a
project-local `bin/` call that imports the resolver — NOT direct fs in the orchestrator).
**Touches:** templates/workflows/gsd-t-scan.workflow.js, templates/workflows/gsd-t-verify.workflow.js, templates/workflows/gsd-t-debug.workflow.js, templates/workflows/gsd-t-integrate.workflow.js, templates/workflows/gsd-t-quick.workflow.js, templates/workflows/gsd-t-phase.workflow.js
**Contract:** graph-metrics-contract.md § Layer-2c (`kind:"wiring"`, three-state `graphWiringMode`).
**Depends on:** D1 complete (`append_ledger_line` via resolver).
**Test:** `test/m99-wiring-mode.test.js` — each of the 6 consumers persists exactly one `kind:'wiring'`
line tagged with its own `consumer` label; the value is one of the three states; events from inside a
labeled workflow are NEVER attributed to `cli`.
**AC:** Criteria 12 (each consumer sets `GSDT_GRAPH_CONSUMER`, correct label), 13 (graphWiringMode persisted). `[RULE] wiring-mode-three-states`.

### M99-D2-T4 — stamp wiring mode into the scan report header (north-star)
**What:** Stamp the resolved `graphWiringMode` into the `/scan` report HEADER so an announced fallback
beside a live graph is human-visible at the top of the report (the NiceNote scan-#12 north-star — the
specific failure this milestone exists to make impossible).
**Files (ImplPath):** `templates/workflows/gsd-t-scan.workflow.js` — the report-header assembly stage.
**Touches:** templates/workflows/gsd-t-scan.workflow.js
**Contract:** graph-metrics-contract.md § Layer-2c (north-star note).
**Depends on:** M99-D2-T3.
**Test:** `test/m99-wiring-mode.test.js` — the scan report header contains the `graphWiringMode` string;
a simulated `fallback-announced` + same-window `outcome:'hit'` is detectable from header + ledger together.
**AC:** Criterion 13 (north-star: invisible fallback leaves a `graphWiringMode` trace + is stamped in the header). `[RULE] wiring-mode-three-states`.

### M99-D2-T5 — author the 2 owned tests
**What:** Author `test/m99-layer2-decision-logging.test.js` (one line per grep decision; one per read
decision; byte-identical classify/augment with logging on vs off; never-shrink KEPT) and
`test/m99-wiring-mode.test.js` (per-consumer wiring-mode persistence + scan-header stamp + no `cli` leakage).
**Files (ImplPath):** `test/m99-layer2-decision-logging.test.js` (NEW), `test/m99-wiring-mode.test.js` (NEW).
**Touches:** test/m99-layer2-decision-logging.test.js, test/m99-wiring-mode.test.js
**Contract:** graph-metrics-contract.md § Invariants (one line per interception; byte-identical on/off).
**Depends on:** M99-D2-T1..T4.
**Test:** the two files themselves, run via `npm test` (+ heavy subset `--test-concurrency=1 GSDT_SLOW_TESTS=1` if they build a graph).
**AC:** Criteria 9, 10, 11, 12, 13, 16 (suite green incl. these tests).
