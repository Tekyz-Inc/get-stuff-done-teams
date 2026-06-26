# M94 Integration Points (integrate-read-path copy)

> **Why this file exists (RE-PLAN Fix-2):** the integrate workflow reads `.gsd-t/contracts/${milestone.toLowerCase()}-integration-points.md` (`templates/workflows/gsd-t-integrate.workflow.js` line 81), i.e. `m94-integration-points.md` — NOT the generic `integration-points.md`. The full M94 narrative + wave diagram lives in the generic `.gsd-t/contracts/integration-points.md`; THIS file is the canonical integrate-stage entry point so the seam-test spec + wave groupings + the AC-descope-record location are FINDABLE at integrate time.

## Wave Groupings (the integration shape)
- **WAVE 1 — PROVE-OR-KILL (parallel, file-disjoint, throwaway spike code; HARD GATE):** `d1 store-bakeoff-spike` (K1) ∥ `d2 treesitter-throughput-spike` (K2 = AC-1).
- **WAVE-1 HARD GATE (machine-checkable — RE-PLAN Fix-4):** REQUIRE `k1Verdict == PICK` (store on evidence, ALL 4 sub-criteria: embedded · <50ms query · <1s incremental · concurrent-atomicity, + the Fix-6 footprint ceilings) AND `k2Verdict == PASS` (tree-sitter full-indexes REAL Atos < ~2 min, against a PINNED SHA, within the Fix-6 RSS ceiling AND the Fix-6 MEASURED-scale sanity check vs the bake-off). The verdict fields are written by D1-T3 (`k1Verdict`) + D2-T3 (`k2Verdict`); the gate is enforced by `test/m94-wave1-hard-gate.test.js` (D7-T2). Either fails its numbers → legitimate KILL/RE-SCOPE; **the KILL MUST record an explicit AC-descope (which ACs survive) HERE before any Wave-2 task** (`[RULE] kill-outcome-records-ac-descope`). A KILL with no descope record FAILS the gate; no Wave-2 build artifact may exist while a spike verdict is KILL without a descope.
- **WAVE 2 — BUILD (parallel, file-disjoint over a SHARED on-disk store; D3 writes, D4 mutates, D5 reads):** `d3 indexer-core` ∥ `d4 freshness` ∥ `d5 query-cli` (the keystone).
- **WAVE 3 — CONSUMER WIRING (additive extend-class on existing scan files; current scan kept INTACT):** `d6 scan-wiring` (AC-4 = INSIGHT delta only).
- **INTEGRATE stage — `d7 integrate-rewire`:** the rewire + dead-file deletion (Fix-1) + the live-store seam test (Fix-2) + the Wave-1 hard-gate test (Fix-4). Gated on the Wave-2 trio integrating + the Wave-1 envelopes existing.

## Wave-1-CLOSE scale reconciliation (R3-Fix-6 — no mid-spike deadlock)
D1 (K1 store bake-off) and D2 (K2 throughput + Atos-scale measurement) run CONCURRENTLY at the ~1.5M-node HYPOTHESIS. AFTER both report, BEFORE the hard gate finalizes K1 PICK: if K2's MEASURED Atos node-equivalent scale (`atosFileCount` + entity/edge enumeration — graph units, NOT raw LOC) materially diverges (>1.5× / <0.66×) from the ~1.5M synthetic default, the K1 bake-off is RE-RUN at the corrected `--scale` and K1 PICK is re-confirmed at the right size (so store evidence isn't validated at the wrong size). `scaleMismatch:true` from K2 forces this reconciliation before `k1Verdict` is final. This is a Wave-1-close step, never a mid-spike cross-dependency.

## AC-descope record (Wave-1 KILL outcomes — `[RULE] kill-outcome-records-ac-descope`)
> If K1 or K2 KILLs, record the explicit AC-descope HERE (which ACs survive, which move to Phase-2) BEFORE any Wave-2 task. The D7-T2 hard-gate test reads this section.

- **K1 verdict:** _(recorded at Wave-1 close: `PICK` + picked store + 4 sub-metrics, OR `KILL_OR_RESCOPE` + per-candidate per-criterion breakdown + the surviving-AC descope)_
- **K2 verdict:** _(recorded at Wave-1 close: `PASS` + Atos build wall-clock + MEASURED scale + pinned SHA, OR `KILL` + the surviving-AC descope)_

## Cross-domain seams (function-level / contract-level — NO shared file edits)
| Seam | Producer | Consumer(s) | Surface |
|------|----------|-------------|---------|
| Store schema | d1 (M94-D1-T3) | d3 (write), d4 (read hash), d5 (read) | `graph-store-schema-contract.md` columns + `k1Verdict` + footprint ceilings |
| Parser-floor taxonomy | d2 (M94-D2-T1) | d3 (lifts WHAT) | `graph-parser-floor-contract.md` |
| Build/put surface | d3 (M94-D3-T2) | d4 (`parse_and_put`), d5 (re-index inline) | `graph-indexer-build-contract.md` function surface |
| Freshness check | d4 (M94-D4-T1) | d5 (inline before answer) | `graph-freshness-contract.md` `freshness_check_on_query` |
| Query envelope | d5 (M94-D5-T1) | d6 (scan reads it), d7 (dispatch delegates to the CLI) | `graph-query-cli-contract.md` JSON envelope |
| Scan wiring | d6 (M94-D6-T2) | none (terminal) | extend-class edits to existing scan files (d6 sole owner) |
| **Live store seam (#8, D7-OWNED — Fix-2)** | d7 (M94-D7-T3) | n/a | `test/m94-integrate-live-store-seam.test.js` — real D3 index → real D1 store → edit file → D5 query reflects edit |
| **Graph dispatch rewire (Fix-1, D7-OWNED)** | d7 (M94-D7-T1) | n/a — terminal | `bin/gsd-t.js` `case "graph"` delegates to `bin/gsd-t-graph-query-cli.cjs`; 6 dead `bin/graph-*.js` + 3 dead tests DELETED |

## RE-PLAN (2026-06-26) — the 6 deeper-pre-mortem fixes
| Fix | Sev | Rule / test | Owner | `[RULE]` |
|-----|-----|-------------|-------|----------|
| 1 | CRITICAL (USER-APPROVED destructive) | Rewire `bin/gsd-t.js` `case "graph"` → D5 CLI; DELETE 6 dead `bin/graph-*.js` + 3 dead tests; integration test shells out real `gsd-t graph status`/`who-imports` through the entry point, asserts the NEW CLI (live/graph-unavailable), NEVER the dead "No graph index found" | D7-T1 | `graph-status-live` |
| 2 | CRITICAL | Live-store seam test (#8) gets a NAMED owner (`test/m94-integrate-live-store-seam.test.js`) + a FINDABLE spec — M94 integration-points doc published at the integrate-read path (`m94-integration-points.md`) | D7-T3 | `live-store-seam-real-pipeline` |
| 3 | HIGH | AC-4 insight ⊇ over a deterministic structural-finding IDENTITY (`{kind | sorted symbol/file set}`, free-text title stripped) + canonicalization; unit test: rephrase → same identity, new fact → distinct identity | D6-T1 (contract) + D6-T2 (test) | `scan-finding-identity-canonical` |
| 4 | HIGH | Wave-1 HARD GATE machine-checkable: D1-T3/D2-T3 write `k1Verdict`/`k2Verdict`; gate test reads them, a KILL with no AC-descope FAILS, no Wave-2 artifact while KILL-without-descope | D7-T2 + D1-T3 + D2-T3 | `wave1-hard-gate-machine-checkable` · `kill-outcome-records-ac-descope` |
| 5 | MEDIUM | K1 KILL attributable: per-candidate per-criterion breakdown + `candidateSetJustification` (closure of the embedded/no-server/no-paid category or next candidate); a bare KILL FAILS | D1-T2 (test) + D1-T3 (doc) | `k1-kill-attributable-per-candidate` |
| 6 | MEDIUM | K2 measures REAL Atos scale (`atosFileCount` + `atosTotalLoc` + `atosLangBreakdown`), never assumes ~1.5M; the D1 synthetic scale + the K1/K2 ceilings are sanity-checked against the measured number; material divergence → FAIL-LOUD | D2-T2/T3 (+ D1-T1 scale derivation) | `k2-atos-scale-measured-not-assumed` · `k2-scale-sanity-vs-bakeoff` |

## Disjointness verdict (re-validated this RE-PLAN — 24 tasks)
- 21 prior tasks + 3 new D7 tasks = **24 atomic tasks**, every task carries an explicit `**Touches**` list.
- New write targets, all uniquely owned, zero overlap: `bin/gsd-t.js` (D7-T1 SOLE owner anywhere in M94), `test/m94-d5-graph-dispatch.test.js` (D7-T1), `test/m94-wave1-hard-gate.test.js` (D7-T2), `test/m94-integrate-live-store-seam.test.js` (D7-T3), `.gsd-t/contracts/m94-integration-points.md` (D7-T3).
- Fix-3/Fix-5/Fix-6 are EDITS to files each already SOLE-owned by their domain's authoring task (`graph-scan-consumer-contract.md` ← D6-T1; `graph-store-schema-contract.md` ← D1-T3; D1-T2/D2-T2/T3 test+impl already owned) — no new write target, no overlap.
- The 6 dead `bin/graph-*.js` use the bare `graph-` prefix — disjoint from the new `gsd-t-graph-*` prefix; deleted ONLY by D7-T1, requirer-verified safe (only the rewired dispatch + the 3 dead tests reference them).
