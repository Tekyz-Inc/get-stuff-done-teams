# Constraints: m56-d2-upper-stage-brief-kinds

## Must Read Before Using (no black-box treatment)
- `bin/gsd-t-context-brief.cjs::KIND_REGISTRY` — read existing 6 kind definitions and their resolver shape before adding 5 new ones
- `bin/gsd-t-context-brief.cjs::generateBrief({kind, projectDir, domain?, spawnId, out})` — the public API new kinds must integrate with
- `.gsd-t/contracts/context-brief-contract.md` v1.0.0 STABLE — token-cap rule, JSON schema, file-resolver determinism rule
- One existing kind's resolver (e.g. `execute` or `verify`) — use as template

## Must Follow
- **Additive-only edits** — DO NOT modify existing 6 kinds. New kinds register alongside.
- **≤2,500-token cap per brief** — each new kind's resolver MUST honor this cap. Use the existing token-counting helper or fall back to character-count heuristic (1 token ≈ 4 chars).
- **Deterministic file-resolution** — same inputs MUST produce byte-identical brief output. No timestamps, no random IDs in the brief body.
- **Missing-input resilience** — `milestone` kind MUST handle "no milestone defined" gracefully (return brief with `notes: ["no milestone defined — using default scope"]`); `partition` kind MUST handle "no domains yet" gracefully; same for `plan`/`discuss`/`impact`.
- **Schema-shape preserved** — output JSON MUST match the v1.0.0 contract schema (`{schemaVersion, kind, generatedAt, sections[], notes[], tokenCount}`). New kinds add to `sections[]`, not to the top-level schema.
- **Resolver inputs follow CLAUDE.md + contracts + scope.md priority** — same convention as the 6 existing kinds. New kinds for upper stages slice the same source-of-truth set, just at different granularities (e.g. `partition` brief includes domain table from `progress.md` + `file-disjointness-rules.md` excerpt; `milestone` brief includes most recent completed milestone summary).

## Must Not
- Modify files outside owned scope
- Change the public `generateBrief` API signature
- Change the v1.0.0 envelope schema (additive `sections[]` entries are NOT a schema change)
- Generate non-deterministic briefs (no `Date.now()`, no `Math.random()` in resolver bodies)
- Skip the token-cap check ("it's a small brief, can't exceed 2,500" is not acceptable — the cap is a hard invariant)
- Touch `commands/*.md` (D3 owns)

## Dependencies
- Depends on: nothing (D2 is purely the brief generator extension)
- Depended on by: D3 (D3's wire-ins call `gsd-t brief --kind {partition|plan|discuss|impact|milestone}` — D2 must publish the new kinds before D3 can wire them in)
- Concurrent with: D1, D4, D5 (file-disjoint)

## Test Baseline
- Pre-D2: 2487/2487 unit
- Post-D2 expected: 2487 + 5 new D2 tests (one per kind) + meta tests for cap+determinism (≈10-15 new), all green
