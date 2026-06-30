# PseudoCode-GraphObservability

> **Subject:** GraphObservability — the three-layer, append-only telemetry ledger that makes the
> graph-vs-grep DECISION visible (every graph query, every grep-intercept, every read-intercept,
> every workflow's wiring mode), its sized rotation + on/off flag, and the `gsd-t graph metrics`
> rollup that reads it. Milestone: **M99 — Graph Observability & Consolidation**. `[Title]` is the
> SUBJECT, not the milestone id. The path-migration subject lives in its sibling doc
> [`PseudoCode-GraphFolderMigration.md`](PseudoCode-GraphFolderMigration.md).

---

## Intention

> **Intention (David, 2026-06-30).** Make the graph-vs-grep decision OBSERVABLE. This whole session
> was manual graph-telemetry archaeology: a real NiceNote scan (#12) announced `GRAPH-FALLBACK —
> graph index not available` and silently ran grep-mode while the graph was demonstrably LIVE (156
> files, compiler-accurate, every verb + freshness verified working that same session). It stayed
> invisible for HOURS because NOTHING recorded the graph-consulted → hit / miss / fallback decision,
> and nothing recorded WHEN GREP WAS USED AND FOR WHAT. The graph is GSD-T's mandatory
> structural-knowledge layer (the CENTRAL TENET, peer-priority to contracts) — so its observability
> must be peer-priority too. I cannot trust a layer I cannot see firing.
>
> **The sharpened ask:** telemetry must show the graph-vs-grep DECISION — not just graph usage. When
> grep is used INSTEAD of the graph, and for what, must be on the record. The grep-intercept hook and
> the read-intercept hook are the two points where that decision is MADE; each must leave exactly one
> ledger line per decision. Every graph query already funnels through one chokepoint (`emit()` in the
> query CLI) — that is Layer 1, already built. The interception decisions are Layer 2. A
> `gsd-t graph metrics` rollup (Layer 3) turns the raw ledger into the answer: did the graph answer,
> or did we fall back to grep, and what for?
>
> **Cost is zero where it matters.** A ledger line is a disk append (sub-millisecond, not model
> context) — logging EVERY grep costs no tokens. Telemetry must be best-effort and FAIL-OPEN: a
> ledger write that throws, blocks, or alters the underlying decision is a regression worse than no
> telemetry. The classify→replace/passthrough decision and the augment/passthrough decision must be
> BYTE-IDENTICAL with logging on vs. off.
>
> **One toggle, sized rotation.** Telemetry is toggleable by an explicit flag (default stated, never
> silent-off). The ledger rotates by FILE SIZE or ENTRY COUNT (sized to ~2–3 hours of heavy work per
> file), NOT daily — a heavy session must not bury the signal in one unbounded file.
>
> **Risk-first sequencing is the decision I signed off on.** The scope is locked; the SEQUENCING is
> the lever. Front-load the riskiest, hardest-to-reverse work so a fatal failure is cheap and early:
> the irreversible data-touching migration (the sibling doc's subject) is Tier 0; the
> path-consolidation that prevents an M96-class silent split-brain is Tier 1; the Layer-2 decision
> logging (the REASON this milestone exists) is Tier 2; the Layer-1 fold-in + rotation + toggle is
> Tier 3; the pure read-side rollup CLI is Tier 4 (lowest risk, last). The expensive, low-risk
> surface (Layers 1/3) is never built on an unproven migration.

---

## Mechanism

Pseudocode grounds in EXISTING GSD-T conventions: `bin/<tool>.cjs` CLIs returning a JSON envelope,
`gsd-t <verb>` dispatch, the already-built Layer-1 `_logGraphEvent` chokepoint in
`bin/gsd-t-graph-query-cli.cjs`, the two fail-open intercept hooks in `scripts/`, and the
`GSDT_GRAPH_CONSUMER` / `GSDT_GRAPH_VIA` env convention. The sink path resolves through ONE helper
(introduced by the migration subject) so writer and readers agree by construction. Concrete numeric
caps (rotation size/entry-count) are DEFERRED to plan-time-against-real-inputs.

```
# ============================================================
# SHARED SINK SUBSTRATE (Tier 3 first half) — built ONCE, both layers append through it
# ============================================================

PROCEDURE telemetry_enabled():
    # explicit flag; default stated, never silent-off  [RULE] telemetry-toggle-explicit
    RETURN env("GSDT_GRAPH_TELEMETRY") != "0"      # default ON (stated); "0" => OFF

PROCEDURE append_ledger_line(record):
    IF NOT telemetry_enabled(): RETURN             # OFF => zero lines, query still answers
    TRY:
        dir  = resolveLogsDir()                    # <repoRoot>/.gsd-t/graphDB/logs/  (via the resolver)
        file = current_or_rotated(dir)             # open-or-rotate by SIZE/COUNT — never daily
        mkdir_p(dir)
        append(file, json(record) + "\n")          # disk append, sub-ms, tokens=0
    CATCH:
        RETURN                                     # FAIL-OPEN: telemetry NEVER blocks/alters a decision
                                                   #  [RULE] graph-telemetry-fail-open

PROCEDURE current_or_rotated(dir):
    active = highest_numbered(dir, "graph-events-NNN.jsonl") OR seed "graph-events-001.jsonl"
    IF size_of(active) >= SIZE_CAP OR lines_of(active) >= ENTRY_CAP:   # cap ~= 2–3 hrs heavy work
        active = next_number(active)               # -001 sealed, -002 started   [RULE] rotation-sized-not-daily
    RETURN active

# ============================================================
# LAYER 1 — per-query ledger (ALREADY BUILT; FOLD IN — supersede sink path)
# ============================================================

PROCEDURE _logGraphEvent(envelope):                # the existing emit() chokepoint
    record = {
        ts, verb, target,
        outcome: hit | hit-empty | ambiguous | not-found | graph-unavailable | error,
        tier, resultCount, candidateCount, latencyMs,
        consumer: env("GSDT_GRAPH_CONSUMER") OR "cli",
        via:      env("GSDT_GRAPH_VIA")      OR null,
        staleOnQuery, reindexedCount, addsCount, deletesCount, reindexedFiles,
    }
    append_ledger_line(record)                     # sink MOVED metrics/ -> graphDB/logs/  (⚠ Divergence)

# ============================================================
# LAYER 2a — grep-intercept decision (scripts/gsd-t-graph-intercept.js)
# ============================================================

PROCEDURE on_grep(args):
    consumer = env("GSDT_GRAPH_CONSUMER") OR "cli"
    IF NOT graph_present(): 
        log_grep_decision(classified=null, action="passthrough", consumer, reason="no-graph")
        passThrough()                              # fail-open unchanged
    classified = classifyGrep(args)                # structural | text  (existing classifier)
    IF classified == "structural" AND replaceable():
        log_grep_decision(classified, action="replaced", patternShape(args), consumer)
        emit_graph_replacement()
    ELSE:
        log_grep_decision(classified, action="passthrough", patternShape(args), consumer)
        passThrough()
    # INVARIANT: the classify->replace/passthrough decision is BYTE-IDENTICAL with logging on/off
    #            [RULE] decision-byte-identical-logging-on-off   ·   EVERY grep logs exactly one line

# ============================================================
# LAYER 2b — read-intercept decision (scripts/gsd-t-read-intercept.js)
# ============================================================

PROCEDURE on_read(file):
    consumer = env("GSDT_GRAPH_CONSUMER") OR "cli"
    decision = decide_augment_or_passthrough(file)   # existing never-shrink, default pass-through
    log_read_decision(action=decision, file, consumer)   # exactly one line per decision
    apply(decision)                                  # augment-never-shrink rule KEPT (no flag)

# ============================================================
# LAYER 2c — workflow wiring mode (6 consumers) + 2d consumer labels
# ============================================================

PROCEDURE consumer_preamble(workflowName):           # scan/verify/debug/integrate/quick/phase + 2 hooks
    setenv("GSDT_GRAPH_CONSUMER", workflowName)       # 2d: attribute every event to the right consumer
    mode = probe_graph() ? "WIRED"
         : announced_fallback() ? "fallback-announced"
         : "disabled"
    persist_wiring_mode(mode)                          # 2c: into the ledger
    IF workflowName == "scan": stamp_report_header(mode)  # scan #12 invisibility closed
    # NORTH-STAR: a fallback-announced mode + a same-window outcome:hit query => the previously
    # invisible contradiction is now machine-visible.   [RULE] wiring-mode-persisted-and-stamped

# ============================================================
# LAYER 3 — gsd-t graph metrics rollup (READ-ONLY; mirrors doMetrics)
# ============================================================

PROCEDURE graph_metrics():                            # plugged into the doGraph switch
    events = read_all(resolveLogsDir(), "graph-events-*.jsonl")   # tolerate empty/rotated ledger
    REPORT:
        graph_hit_vs_grep_passthrough_ratio,
        fallback_rate,
        p50_latency, p95_latency,
        tier_mix,
        stale_query_frequency,
        reindex_frequency,
        per_consumer_breakdown,
        per_verb_breakdown
    # mirrors `gsd-t metrics` (doMetrics, bin/gsd-t.js:5135) shape/flags; never writes
    #  [RULE] rollup-read-only-tolerates-empty
```

---

## One-breath table

| Actor | One-breath responsibility | Guard |
|-------|---------------------------|-------|
| `append_ledger_line` (shared sink) | open-or-rotate by size/count, respect the toggle, append one line, swallow all errors | `graph-telemetry-fail-open`, `rotation-sized-not-daily`, `telemetry-toggle-explicit` |
| `_logGraphEvent` (Layer 1) | one line per graph query, sink moved to `graphDB/logs/` | sink supersede flag |
| grep-intercept (Layer 2a) | one line per grep decision incl. text-passthrough; never alter the decision | `decision-byte-identical-logging-on-off` |
| read-intercept (Layer 2b) | one line per augment/passthrough; never shrink | augment-never-shrink KEPT |
| consumer preamble (Layer 2c/2d) | set `GSDT_GRAPH_CONSUMER`, persist `graphWiringMode`, stamp scan header | `wiring-mode-persisted-and-stamped` |
| `gsd-t graph metrics` (Layer 3) | read-only rollup mirroring `gsd-t metrics`; tolerate empty/rotated ledger | `rollup-read-only-tolerates-empty` |

---

## Guard map ([RULE] IDs → falsifiable acceptance)

| [RULE] | What it guarantees | Falsifier (→ FAIL) | Acceptance # |
|--------|--------------------|--------------------|--------------|
| `telemetry-toggle-explicit` | explicit on/off flag, default stated | toggle absent, or OFF still appends | 8 |
| `rotation-sized-not-daily` | rollover by size/count, `-001`→`-002` | single unbounded file or daily rotation | 7 |
| `graph-telemetry-fail-open` | a throwing write never blocks/alters a decision | any decision divergence on vs. off | 11 |
| `decision-byte-identical-logging-on-off` | classify→replace/passthrough identical with logging | a grep interception with no line, or divergent decision | 9, 11 |
| read augment-never-shrink (KEPT) | read decision identical, one line each | a read interception with no line | 10 |
| `wiring-mode-persisted-and-stamped` | wiring mode in ledger + scan header | NiceNote-class invisible fallback leaves no trace | 13 |
| consumer attribution | each consumer + hook sets `GSDT_GRAPH_CONSUMER` | a consumer's events labeled `cli`/unknown | 12 |
| sink path (Layer 1) | sink is `graphDB/logs/`, not `metrics/` | any event at old `.gsd-t/metrics/graph-events.jsonl` | 6 |
| `rollup-read-only-tolerates-empty` | rollup reports all dimensions, never crashes empty | any dimension missing or crash on empty/rotated | 14 |
| contract sync | event + rollup schema documented | `graph-metrics-contract.md` absent or out of sync | 15 |

---

## ⚠ Divergence flags (keep-or-supersede over inherited shipped-code models)

One inherited model is carried forward from the already-built, uncommitted Layer 1
(`bin/gsd-t-graph-query-cli.cjs`). The keep-or-supersede protocol was run per inherited sub-model:

⚠ Divergence: telemetry-sink-path — supersedes shipped Layer-1 sink at `.gsd-t/metrics/graph-events.jsonl`. Reason: user-locked consolidation under `.gsd-t/graphDB/logs/` with sized rotation + on/off flag.

**KEPT (no flag):**
- The Layer-1 record SHAPE (verb / target / outcome / tier / resultCount / candidateCount /
  latencyMs / consumer / via + freshness staleOnQuery / reindexedCount / addsCount / deletesCount /
  reindexedFiles) — folded in unchanged.
- The FAIL-OPEN telemetry invariant (a write must never block/alter a query answer) — KEPT and
  EXTENDED to Layers 2a/2b. Telemetry must not weaken it.
- The read-intercept "default pass-through, never shrink" rule — KEPT.
- The `GSDT_GRAPH_CONSUMER` / `GSDT_GRAPH_VIA` env convention — KEPT, EXTENDED to all 6 workflows +
  2 hooks (previously read only by the query CLI).

---

## Appendix — sequencing, scope fence, and the one guarded action

**Risk-first tiers (the signed-off sequencing):**
- **Tier 0** — migration shim (sibling doc; HIGHEST risk: irreversible, data-touching; do FIRST, gate all on it).
- **Tier 1** — path consolidation behind ONE resolver (HIGH risk: ~7 scattered literals + 20 test files; a missed literal = M96-class silent split-brain). Salvaged risk from Candidate C: the
  query CLI derives `projectRoot` via `path.dirname(path.dirname(storePath))` (verified at
  `bin/gsd-t-graph-query-cli.cjs:515` and the Layer-1 logger root at `:1246`). Moving the store one
  directory deeper (`.gsd-t/graphDB/graph.db`) breaks that derivation → sink/freshness/rollup would
  silently target `.gsd-t/.gsd-t/...`. The depth-correction and the path-move are ONE atomic change
  and must land before any sink write. (Detailed in the sibling doc; cross-referenced here because
  Layer-1's sink resolution depends on it.)
- **Tier 2** — Layer 2 decision logging (the REASON the milestone exists; fail-open invariant is the proof obligation).
- **Tier 3** — Layer 1 fold-in + rotation + toggle (mostly relocation; sequenced after the resolver exists).
- **Tier 4** — Layer 3 rollup CLI + contract (LOWEST risk: pure read-side; easiest to falsify).

**Scope fence (locked — do NOT re-litigate):** IN: acceptance items 1–16. OUT (deferred backlog,
named for traceability): scan-findings-enrich-graph (scan WRITES graph), flaky-test-telemetry (graph
as shared observability infra) — the NEXT consumers of this substrate, not part of M99.

**Guarded action:** the folder consolidation is a PATH MIGRATION of a real project's store. The
guarded behavior (copy-then-verify-then-swap, old retained until new proven readable, never delete
the only readable graph) lives in the sibling [`PseudoCode-GraphFolderMigration.md`](PseudoCode-GraphFolderMigration.md).
