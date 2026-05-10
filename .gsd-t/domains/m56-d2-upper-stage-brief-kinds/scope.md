# Domain: m56-d2-upper-stage-brief-kinds

## Responsibility
Extend `bin/gsd-t-context-brief.cjs::KIND_REGISTRY` with 5 new brief kinds: `partition`, `plan`, `discuss`, `impact`, `milestone`. Each kind defines a deterministic file-resolver mapping a brief request to the relevant CLAUDE.md + contract excerpts + scope.md slice, capped at ≤2,500 tokens per brief. This is the dominant ITPM-relief lever in M56 — first-of-milestone brief shaves 30–60k from each subsequent phase's read-budget.

## Files Owned
- `bin/gsd-t-context-brief.cjs` — additive `KIND_REGISTRY` entries for the 5 new kinds (DOES NOT touch existing 6 kinds: `execute`/`verify`/`qa`/`red-team`/`design-verify`/`scan`)
- `test/m56-d2-brief-kinds.test.js` — new unit tests covering all 5 new kinds (schema-shape, ≤2,500-token cap, missing-input resilience, determinism)

## NOT Owned (do not modify)
- Existing 6 brief kinds in `KIND_REGISTRY` — read-only USE (M55 D4 stable)
- `.gsd-t/contracts/context-brief-contract.md` — D2 may need to additively note the 5 new kinds, but contract is v1.0.0 STABLE; any schema change requires a contract version bump (additive entries DO NOT change schema)
- `commands/*.md` — D3 + D4 own command-file wire-ins
- `bin/gsd-t-verify-gate.cjs` — D1 owns
- `bin/gsd-t.js`, `bin/gsd-t-parallel.cjs`, `bin/gsd-t-ratelimit-probe-worker.cjs`, `bin/gsd-t-capture-lint.cjs` — D5 owns

## Files Touched (audit trail)
- `bin/gsd-t-context-brief.cjs` (additive — 5 new KIND_REGISTRY entries + their resolver functions)
- `test/m56-d2-brief-kinds.test.js` (new)
- (Optional) `.gsd-t/contracts/context-brief-contract.md` — additive note that 5 new kinds are now supported (no schema change)
