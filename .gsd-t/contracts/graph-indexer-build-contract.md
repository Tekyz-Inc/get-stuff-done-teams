# Contract: Graph Indexer Build/Put Surface

**Status:** DRAFT — authored by D3 during Wave-2 build (after the K1+K2 hard gate).
**Owner:** d3-indexer-core
**Consumers:** d4-freshness (calls the per-file parse function to re-index a stale file), d5-query-cli (calls re-index inline before answering)
**Version:** 0.2.0 (DRAFT — RE-PLAN Fix-2: FREEZE `parse_and_put`'s tier behavior as an invariant before D3/D4 execute. SCIP indexers are WHOLE-PROJECT BATCH tools; a per-file tree-sitter re-index MUST NOT silently relabel a previously compiler-accurate file as `tree-sitter-floor` — it either re-upgrades or honestly flags `tree-sitter-floor-STALE-SCIP`, never silently downgrades the AC-3 path.)

## Purpose
The function-level build/put surface D3 exposes so D4 and D5 re-index a file WITHOUT editing D3's source (keeps them file-disjoint). D4/D5 call this surface; they never edit `bin/gsd-t-graph-index.cjs`.

## Surface
- `build_index(repo)` — full-repo build: per file → tree-sitter floor parse → optional SCIP upgrade → `store.put(file, content_hash, entities, edges, tier)`
- `parse_and_put(file)` — per-file re-index (the function D4 calls on a stale file; D5 calls inline) → re-parses one file, writes its record, returns the new entities/edges
- both honor the D1 store-schema and D2 taxonomy

## Honesty invariants
- `[RULE] accuracy-tier-labeled-never-silently-wrong` — every edge carries `tier` (compiler-accurate where SCIP present, tree-sitter-floor where absent); never an unlabeled mix
- `[RULE] rust-cross-crate-flagged-partial` — Rust cross-crate edges FLAGGED partial (rust-analyzer SCIP is "limited"); within-crate resolves, cross-crate partial
- The graph NEVER depends on SCIP to FUNCTION — only to get BETTER. SCIP absent → tree-sitter floor, degrades not breaks.

## `parse_and_put` tier-preservation invariant (RE-PLAN Fix-2 — `[RULE] reindex-tier-never-silently-downgraded`)
**The bug this freezes out (a REAL design bug):** `build_index` does a tree-sitter-floor parse → OPTIONAL SCIP upgrade → `store.put(tier)`. SCIP indexers (`scip-typescript`, `scip-python`, `rust-analyzer scip`) are **WHOLE-PROJECT BATCH tools** — they emit ONE `index.scip` per repo/crate and **cannot re-derive a single file in isolation**. But `parse_and_put(file)` (the per-file re-index D4 calls on EVERY stale file, and D5 calls inline) re-parses ONE file via tree-sitter ONLY. So a file that was `tier=compiler-accurate` after `build_index` would, on the very next incremental edit, get silently re-written `tier=tree-sitter-floor` — **smart-reach silently degrading to dumb-reach on the EXACT path AC-3 exercises** (the uncommitted-edit re-index), violating the determinism/accuracy premise.

**The frozen invariant — `parse_and_put(file)` MUST do ONE of (never a silent downgrade):**
1. **Re-upgrade** — if a per-file or incremental SCIP re-derivation is feasible for that language (e.g. re-run the language's SCIP indexer scoped to the file's project/crate if cheap enough, or consult a still-valid prior `index.scip` for the unchanged symbols), re-label the re-indexed edges `tier=compiler-accurate`. — OR —
2. **Honestly downgrade-with-flag** — if SCIP cannot be re-derived per-file, write the new edges as `tier=tree-sitter-floor-STALE-SCIP` (a DISTINCT, explicit label meaning "this file WAS compiler-accurate at build, is now tree-sitter-floor pending a full re-index"). The consumer reads this as a HONEST tree-sitter-floor edge, NEVER as authoritative compiler-accurate.

**Forbidden:** silently relabeling a previously-`compiler-accurate` file as plain `tree-sitter-floor` (loses the "was-accurate" signal), silently KEEPING the stale `compiler-accurate` label on tree-sitter-only edges (claims accuracy it no longer has), or silently dropping to an UNLABELED approximate edge the consumer reads as authoritative. Any of these is a silent accuracy downgrade — the `[RULE] reindex-tier-never-silently-downgraded` violation.

**Test (D3-T5, `test/m94-d3-tier-preserved-on-reindex.test.js`):** `build_index` a fixture with a SCIP indexer present so a target file's edges are `tier=compiler-accurate`; edit that file; call `parse_and_put(file)`; assert the re-indexed edges are EITHER re-upgraded to `compiler-accurate` OR explicitly labeled `tree-sitter-floor-STALE-SCIP` (downgraded-with-flag) — NEVER silently relabeled plain `compiler-accurate` over tree-sitter-only edges, NEVER silently dropped to an unlabeled approximate edge. FAIL-LOUD-SKIP with `scip-indexer-not-present` if no SCIP indexer is installed (so the test cannot silent-green on an environment where it could never observe a compiler-accurate tier).

## Consumed (frozen)
- `graph-store-schema-contract.md` (D1) — record columns
- `graph-parser-floor-contract.md` (D2) — taxonomy + parse harness
