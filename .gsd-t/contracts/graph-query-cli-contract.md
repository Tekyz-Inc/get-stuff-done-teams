# Contract: Graph Query CLI Envelope

**Status:** DRAFT — authored by D5 during Wave-2 build (after the K1+K2 hard gate).
**Owner:** d5-query-cli
**Consumers:** d6-scan-wiring (reads this JSON envelope to query the index instead of re-reading the repo)
**Version:** 0.2.0 (DRAFT — RE-PLAN Fix-3: `who-calls` keyed by a function-identity key (`file#function`), NOT a bare name; bare-name ambiguity returns an `ambiguous-function` envelope, never a silently-merged caller set. Until this is defined+tested, AC-2 who-calls correctness is not provable on real data.)

## Purpose
The deterministic query interface the model cannot route around — the no-stale-no-wrong keystone. The ONLY way commands read the graph.

## CLI surface (`gsd-t graph <verb>`)
- `who-imports <file>` — file→file reverse import edges
- `who-calls <function-identity>` — function→function reverse call edges, keyed by the **function-identity key** (RE-PLAN Fix-3), NOT a bare name — see "who-calls function identity" below
- `blast-radius <target>` — combined downstream impact set (see Blast-radius semantics below)
- `status` — live queryable index state (`[RULE] graph-status-live` — the M20–M21 "no graph index found" is the anti-goal)

## who-calls function identity (RE-PLAN Fix-3 — `[RULE] who-calls-function-identity-disambiguated`)
**The bug this closes (not provable on real data otherwise):** real codebases have MANY same-named functions (`handle`/`init`/`run`/`get`/`render`) across files. A bare-NAME `who-calls('handle')` MERGES the callers of every `handle` into one wrong answer on real Atos. AC-2's hand-checked fixtures can pick unique names and pass while the query is broken on real data.
- **Argument form:** `who-calls` accepts a **file-qualified identity** — `gsd-t graph who-calls 'file#function'` (repo-relative POSIX path `#` function name; `file#function@line` or `file#FQN` where a file holds overloads / same-named nested functions). The call-graph edges are keyed by `funcId` at both ends (`graph-store-schema-contract.md`), so the query resolves the exact function, not a name-merge.
- **Bare-name disambiguation:** a bare `who-calls 'handle'` (no `#`) that matches MULTIPLE `funcId`s MUST NOT silently merge their callers. It either (a) returns a `{ok:false, reason:"ambiguous-function", candidates:[funcId,...]}` envelope listing the candidate `file#function` keys for the caller to pick, OR (b) returns results GROUPED per candidate `funcId` (never a flat merged caller set). A bare name matching exactly ONE `funcId` resolves directly.
- **Test (D5-T4, `test/m94-d5-who-calls-identity.test.js`):** a fixture with TWO functions named `foo` in different files (`a.ts#foo`, `b.ts#foo`) with DISTINCT callers; assert `who-calls('a.ts#foo')` returns ONLY `a.ts#foo`'s callers (never `b.ts#foo`'s), AND a bare `who-calls('foo')` either returns the `ambiguous-function` envelope with both candidates OR per-candidate grouped results — NEVER a flat merged set. FAILS if the query merges callers across same-named functions.
- **Until who-calls identity is defined+tested, AC-2 who-calls correctness is NOT provable on real data** — this is the bind that makes D5-T1's hand-checked who-calls fixture meaningful at Atos scale.

## Blast-radius Phase-1 status (`[RULE] blast-radius-sequenced-follow-on-not-phase1-consumed`)
`blast-radius` is BUILT and TESTED in Phase 1 (the `D5-T1` verb + the `D5-T3` union fixture) but has **ZERO Phase-1 consumer** — its consumers `/impact` and `/debug` are DEFERRED to the mandated sequenced-follow-on roadmap (see `integration-points.md` § Mandated SEQUENCED follow-on consumers). It is a DECLARED foundation deliverable, not a silent dead deliverable. Its sole liveness guarantee in Phase 1 is the `D5-T3` blast-radius union fixture test (which exercises the verb end-to-end). It is **NOT wired into `/scan`** — wiring it there would be scope creep (scan consumes the dependents/dead-code/cycles slice, not blast-radius). This is the option-(b) honest marking matching the deferral, NOT a removal.

## Blast-radius semantics (`[RULE] blast-radius-unions-both-graphs`)
`blast-radius(target)` returns the downstream impact set computed as the **UNION of the import-graph reverse-reachable set AND the call-graph reverse-reachable set** from `target`:
- **Graphs unioned:** both the file→file import graph and the function→function call graph. A node reachable via EITHER graph is in the blast radius; a node reachable via NEITHER is excluded.
- **Hop-depth:** **transitive** (full reverse-reachable closure), NOT one-hop. (Contrast with D4 freshness re-validation, which is deliberately one-hop — blast-radius is the user-facing "everything downstream" query, freshness is the cheap incremental check.)
- **Falsifiable:** the fixture test MUST include a node reachable ONLY via the call graph (NOT the import graph) — it MUST appear in the result (proves both graphs are unioned, not import-only) — AND an unrelated node reachable via neither — it MUST be excluded (proves the set is not over-broad). Over-broad OR under-broad fails the test.

Each verb calls D4's `freshness_check_on_query` INLINE before answering.

## JSON envelope
```json
{ "ok": true,  "verb": "who-imports", "target": "...", "results": [ ... ], "tier": "compiler-accurate|tree-sitter-floor|tree-sitter-floor-STALE-SCIP" }
{ "ok": false, "reason": "graph-unavailable" }
{ "ok": false, "reason": "ambiguous-function", "verb": "who-calls", "target": "foo", "candidates": [ "a.ts#foo", "b.ts#foo" ] }
```
(`ambiguous-function` — RE-PLAN Fix-3: a bare `who-calls <name>` matching multiple `funcId`s returns this rather than a silently-merged caller set; the caller re-issues with a `file#function` identity. `tree-sitter-floor-STALE-SCIP` — RE-PLAN Fix-2: an honestly-flagged per-file re-index of a previously-compiler-accurate file.)

## Invariants
- `[RULE] query-cli-never-greps` — NO directive-driven grep fallback in ANY code path; verified by STRUCTURAL grep-for-absence (parse the paths), not a substring scan
- `[RULE] parser-fail-disables-loud-never-silent` — genuine parser-load failure → `{ok:false, reason:"graph-unavailable"}` (commands fall back to grep mode, ANNOUNCED) — never a partial edge; verified by fault-injection
- `[RULE] stale-file-reindexed-before-answer` — re-index any stale touched file inline BEFORE returning
- `[RULE] who-calls-function-identity-disambiguated` — `who-calls` keys on a `file#function` identity; a bare name matching multiple `funcId`s returns `{ok:false, reason:"ambiguous-function", candidates:[...]}` (or per-candidate grouped results), NEVER a flat merged caller set across same-named functions

## Consumed (frozen)
- `graph-store-schema-contract.md` (D1) — the store it reads
- `graph-freshness-contract.md` (D4) — the inline `freshness_check_on_query`
