# Contract: Graph Scan Consumer Wiring

**Status:** STABLE — M94-D6-T1 complete (2026-06-26).
**Owner:** d6-scan-wiring
**Consumers:** none (terminal consumer — the falsifiable payoff)
**Version:** 1.0.0 (STABLE — all T1 acceptance criteria met: additive wiring, INSIGHT-delta-only AC-4, ac4Verdict machine-checkable, deterministic structural-finding identity, Atos SHA pin, announced fallback)

## Purpose
How `/scan` (the FIRST narrow consumer) consumes the deterministic query CLI's pre-computed structural slice ADDITIVELY — the current `/scan` architecture is kept FULLY INTACT (it works, it's praised; Destructive Action Guard). The graph makes scan's structural findings ACCURATE (graph-derived, not LLM-reconstructed), it does NOT replace scan's enumerate-and-deep-read pipeline.

## AC-4 — what the graph actually does for scan (INSIGHT DELTA ONLY — user rescope 2026-06-25)

**SCOPE DECISION (user, 2026-06-25):** AC-4 = **INSIGHT delta only**. M94 keeps the CURRENT `/scan` architecture fully intact; the graph is wired ADDITIVELY. AC-4 is NOT a speed claim and NOT a files-read claim — both were UNBINDABLE without redesigning scan's enumerate-EVERY-file logic-bug mandate (finding in-file logic defects genuinely requires reading the file; a relationship graph holds no logic, so it cannot displace that read). That redesign is a SEPARATE future milestone ("re-think `/scan` from the graph up"), recorded out-of-scope below.

What the graph DOES for scan, additively:
1. **SKIP RELATIONSHIP-RECONSTRUCTION (accuracy).** Call chains, imports, dependents, dead-code, cycles, coupling are **PRE-COMPUTED** in the graph. Today the deep-finder agents reconstruct these by reading files (error-prone); the graph hands them over already-resolved and ACCURATE, INJECTED into the `scanSlice` agent context.
2. **DETERMINISM.** The structural findings come from a deterministic index, not from an LLM's per-run reconstruction — so they are repeatable, not stochastic.

So **AC-4 = a graph-wired `/scan` surfaces ≥ the no-graph run's structural findings PLUS ≥1 the no-graph run MISSED or got WRONG** (a real dead-code symbol / cycle / dependent the raw-read reconstruction failed to catch). Falsifiable, measured on a pinned Atos SHA, neither asserted.

### The specific scan findings the graph feeds (additive injection — NOT a path/speed binding)
The structural / dependency / dead-code / cycle / coupling findings that today come from the deep-finder agents **reconstructing relationships by reading** are now pre-computed by the graph and **INJECTED into the `scanSlice` agent context** so those findings are ACCURATE. This is ADDITIVE: scan still enumerates and deep-reads every file for in-file logic defects (the part the graph cannot replace). The graph supplies the relationship layer; scan keeps its content layer.

### The TWO distinct runs (no-graph baseline vs graph-wired — same pinned SHA)
The insight baseline MUST be the NO-GRAPH run (today's scan reading raw source) to prove the graph surfaces findings raw-reading missed. Comparing graph-vs-graph would show ~zero delta. The plan defines TWO runs, both on the SAME pinned Atos SHA:
- **no-graph baseline:** today's `/scan` with graph wiring DISABLED (the grep-mode path) — the structural-findings BASELINE for the INSIGHT axis.
- **graph-wired:** index built (if absent) → query → structural slice injected into the `scanSlice` deep-finders — the SMART-REACH run.

### Pre-registered PASS threshold (falsifiable — the INSIGHT gate is the SOLE AC-4 binding)
Measured on the SAME pinned Atos commit SHA for both runs:
- **INSIGHT gate (`[RULE] scan-insight-gate`):** the graph-wired run surfaces **≥ the no-graph baseline's structural findings PLUS ≥1 structural finding the no-graph run missed or got wrong** (a concrete, named dead-code symbol / cycle / coupling / dependent). The comparison is graph-wired-vs-no-graph — NOT graph-vs-graph (which would show ~zero delta and silently mis-pass). The ≥1 missed/wrong finding MUST be a concrete named structural fact, not a generic claim.
- **Graph-attribution clause (`[RULE] scan-insight-delta-graph-attributed`):** because `/scan`'s deep-finders are stochastic LLM agents, a single no-graph-vs-graph diff could reflect mere run-to-run LLM variance with NO graph contribution. So the ≥1 missed/wrong delta finding MUST be **traceable to the graph's deterministic query result** — it appears in the injected structural slice (a D5 query output recorded in the result doc), and the test FAILS if the claimed delta is not backed by a graph query result. This is what makes the INSIGHT gate falsifiable rather than a variance artifact.
- **Consumed-not-just-passed clause (`[RULE] scan-slice-consumed`):** "injected" is not enough — the dead-injection trap is passing the slice into context the deep-finders never use. The graph-wired run's output MUST contain ≥1 structural finding **byte-traceable to the injected D5 query result** (the same symbol/cycle/dependent the CLI returned), proving the slice reached a finding.

### Deterministic structural-finding IDENTITY (RE-PLAN Fix-3 — the ⊇ is over facts, not free-text)
The INSIGHT ⊇ comparison MUST be over a deterministic structural-finding IDENTITY KEY, NEVER raw LLM free-text titles (which can spuriously pass/fail the gate when an agent rephrases the same fact).
- **Identity key (`[RULE] scan-finding-identity-canonical`):** `{ kind, symbolFileSet }` where
  - `kind` ∈ `{ dead-code, cycle, dependent, coupling }` (lowercased enum — the structural-finding class).
  - `symbolFileSet` = the SORTED, path-normalized set of symbols/files the finding is ABOUT (e.g. for a cycle, the sorted set of files in the cycle; for dead-code, the unreachable symbol's canonical path; for a dependent, the `{importer, imported}` pair sorted).
- **Canonicalization rule:** normalize every path (repo-relative, POSIX separators), sort the symbol/file set, lowercase the `kind` enum, and **STRIP the free-text title entirely** from the identity. Two findings with the same `kind` + same `symbolFileSet` are the SAME structural fact regardless of title phrasing.
- **The gate compares CANONICAL IDENTITIES:** `graph-wired canonical-set ⊇ no-graph canonical-set`, and the ≥1 missed/wrong delta is a canonical identity present in the graph-wired set and ABSENT (or wrong) in the no-graph set. A rephrased title can NEVER flip the gate; a genuinely-new structural fact (distinct `symbolFileSet` or `kind`) yields a DISTINCT identity and is NOT masked.
- **Test (D6-T2's `test/m94-d6-scan-consumer.test.js`):** two fixture finding-sets differing ONLY in title phrasing for the same structural fact canonicalize to the SAME identity (rephrasing can't break ⊇); a genuinely-new fact yields a DISTINCT identity. The test FAILS if canonicalization keys off the raw title.

**OUT OF SCOPE for AC-4 (dropped from M94 by the user rescope):** any SPEED ceiling (run-2 < 0.5× run-1), any COST-CRITICAL-PATH / files-read assertion, and the three-run speed split. AC-4 measures NO wall-clock. The "reads fewer files / faster" redesign is a SEPARATE future milestone.

### Atos commit-SHA pin (no finding-set against an unpinned/absent repo)
- `[RULE] ac4-atos-sha-pinned` — the no-graph and graph-wired runs MUST be measured against the SAME pinned Atos commit SHA (asserted equal). The measurement **fails LOUD on repo-not-found OR commit-mismatch** — a finding-set is NEVER recorded against an unpinned or absent repo.

### AC-4 OUTCOME LADDER — the halt path (RE-PLAN Fix-1 — `[RULE] ac4-verdict-machine-checkable`)
**The problem this closes:** today's `/scan` ALREADY surfaces dead-code / cycles / dependents (the architecture is kept intact). If the no-graph baseline and the graph-wired run find the SAME canonical structural set on the pinned Atos SHA, the bare INSIGHT gate (⊇ + ≥1 missed/wrong) FAILS with **no KILL / RESCOPE outcome** — the debug-loop-never-halts anti-pattern (M90 lesson). K1 / K2 / AC-3 all carry a kill-outcome record (`[RULE] kill-outcome-records-ac-descope`); AC-4's headline must too.

**The verdict field.** D6-T3 writes a machine-checkable `ac4Verdict ∈ { PROVEN, RESCOPE }` into the result-doc envelope (`.gsd-t/spikes/ac4-scan-insight-delta-results.md`), read by a HARD-GATE test (`test/m94-d6-scan-consumer.test.js`, the AC-4 peer of D7-T2's Wave-1 gate). The **structured `ac4Verdict` is authoritative** — a prose "cleared"/"passed" string in the doc is NOT the verdict (M90 lesson: the structured verdict, never a prose claim, gates the headline).

**The two outcomes:**
- **`ac4Verdict == PROVEN`** — the ≥1 graph-attributed structural delta exists: a real dead-code symbol / cycle / dependent the no-graph baseline MISSED, present in the graph-wired CANONICAL-IDENTITY set and ABSENT from the no-graph set, AND traceable to the graph's deterministic query result (`[RULE] scan-insight-delta-graph-attributed`). The INSIGHT gate is satisfied. PASSES.
- **`ac4Verdict == RESCOPE`** — ZERO missed-finding delta, BUT the graph-wired run records EITHER:
  - **(a) an ACCURACY correction** — ≥1 graph-attributed correction of a baseline finding the graph proves WRONG (e.g. a symbol the baseline flagged dead-code that the graph shows is LIVE via a real edge; a cycle the baseline mis-reported that the graph's edges disprove). The correction MUST be graph-attributed (backed by a recorded D5 query result), not LLM re-judgement. This is a legitimate INSIGHT payoff (the graph made a baseline finding ACCURATE) even with zero NEW findings. — OR —
  - **(b) a documented descope** — the insight headline is explicitly DESCOPED to a follow-on milestone per `[RULE] kill-outcome-records-ac-descope`, recorded in `m94-integration-points.md` (which AC survives, what moves to Phase-2), with the named reason (e.g. "no missed-finding delta AND no accuracy correction on the pinned Atos SHA — the graph and raw-read converge here; insight headline deferred to the scan-redesign milestone").

**The hard-gate test asserts (`[RULE] ac4-verdict-machine-checkable`):**
- `ac4Verdict == PROVEN` ⇒ the ≥1 graph-attributed missed/wrong delta is present + graph-attributed ⇒ PASSES.
- `ac4Verdict == RESCOPE` with a recorded accuracy-correction (a) OR a documented descope (b) ⇒ PASSES (legitimate halt — the headline either delivered an accuracy win or was honestly deferred).
- **Zero delta AND no rescope record (neither accuracy correction NOR descope) ⇒ FAILS** — forces a halt + descope, NEVER a silent re-run loop. A result doc with no `ac4Verdict` field at all FAILS (mirrors the missing-`k1Verdict` rejection).

This gives the AC-4 headline a HALT path matching K1 / K2 / AC-3 — the gate can always resolve to PASS-via-proof, PASS-via-rescope, or FAIL-forcing-descope, never to an unbounded "findings still match, try again" loop.

## Wiring (additive — current scan kept intact)
- **build:** if `store.exists()` is false → `build_index(repo)` first
- **query + inject:** query the D5 CLI (`dead-code` / `dangling` / `cluster`) for the structural slice and INJECT it into the `scanSlice` deep-finder agent context — ADDITIVELY, so the deep-finders reason over accurate pre-computed structure. Scan's enumerate-and-deep-read pipeline is NOT removed
- `[RULE] scan-injects-structural-slice` — scan answers structural questions from the index (accurate, deterministic), additively to its existing content read
- `[RULE] scan-slice-consumed` — injected slice must REACH a finding (a graph-wired run's output contains ≥1 structural finding byte-traceable to the injected D5 query result — same funcId/symbol/cycle the CLI returned). Merely passing the slice into context that finders never use (the dead-injection trap) does NOT satisfy this rule.
- `[RULE] no-graph-baseline-proven-graph-free` — when `graphMode === "disabled"` (the AC-4 no-graph baseline), the graph-query call-count MUST be 0 (ZERO graph queries fired). The baseline is genuinely graph-free; any graph query in the disabled path would make the recorded AC-4 baseline set bogus and the INSIGHT gate mis-pass. Test: spy/mock the runCli invocation and assert call-count == 0 when disabled, > 0 when wired.

## Fallback
- query CLI returns `{ok:false, reason:"graph-unavailable"}` → scan falls back to today's grep mode, ANNOUNCED (never silent). No grep when the index is live.

## Sandbox (M81)
- `templates/workflows/gsd-t-scan.workflow.js` stays runtime-native — the query-CLI call is delegated to an inline `agent()` Bash helper; no `require`/`fs`/`child_process`.

## AC-4 measurement protocol (INSIGHT delta only)
- PIN the Atos commit SHA; assert no-graph SHA == graph-wired SHA (both runs on the same pin); fail LOUD on repo-not-found / commit-mismatch (`[RULE] ac4-atos-sha-pinned`).
- Run BOTH on the SAME pinned SHA, then measure the INSIGHT axis:
  - **Insight:** the structural-findings set + accuracy of the graph-wired run vs the **no-graph baseline**; PASS iff graph-wired ⊇ no-graph findings PLUS ≥1 concrete named finding the no-graph run missed/got-wrong (`[RULE] scan-insight-gate`).
- Record both structural-findings sets + the named missed/wrong finding + the pinned SHA + the machine-checkable **`ac4Verdict ∈ {PROVEN, RESCOPE}`** (RE-PLAN Fix-1) in `.gsd-t/spikes/ac4-scan-insight-delta-results.md`, progress.md, and CHANGELOG.md, with a LIVE-CLOCK timestamp. On `RESCOPE`, record EITHER the graph-attributed accuracy correction (a) OR the descope record in `m94-integration-points.md` (b). The structured `ac4Verdict` — not a prose "cleared" string — is the authoritative gate (`[RULE] ac4-verdict-machine-checkable`).
- NO wall-clock / speed / files-read number is recorded for AC-4 (that axis is out of M94).

## Consumed (frozen)
- `graph-query-cli-contract.md` (D5) — the JSON envelope
