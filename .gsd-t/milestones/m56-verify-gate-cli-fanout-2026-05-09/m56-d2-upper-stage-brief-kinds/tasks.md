# Tasks: m56-d2-upper-stage-brief-kinds

## Summary
Extend `bin/gsd-t-context-brief.cjs::KIND_REGISTRY` with 5 new brief kinds (`partition`, `plan`, `discuss`, `impact`, `milestone`). Each kind's resolver maps to relevant CLAUDE.md/contract/scope.md slices, capped at ≤2,500 tokens per brief.

## Tasks

### M56-D2-T1 — Read existing 6 kinds + extract resolver pattern
- **Touches**: read-only (`bin/gsd-t-context-brief.cjs`)
- **Contract refs**: `.gsd-t/contracts/context-brief-contract.md` v1.0.0
- **Deps**: NONE
- **Acceptance criteria**:
  - Document the resolver pattern used by existing 6 kinds (`execute`/`verify`/`qa`/`red-team`/`design-verify`/`scan`) in code comments at top of new resolver functions.
  - Identify shared helpers (token-counting, file-read, section-trim) that 5 new kinds will reuse.

### M56-D2-T2 — Implement 5 new resolver functions (TDD red→green)
- **Touches**: `test/m56-d2-brief-kinds.test.js` (new — written FIRST), `bin/gsd-t-context-brief.cjs` (additive)
- **Contract refs**: `.gsd-t/contracts/context-brief-contract.md` v1.0.0
- **Deps**: Requires T1
- **Acceptance criteria**:
  - Test written first: 10-15 unit tests covering all 5 new kinds. Schema-shape (`{schemaVersion, kind, generatedAt, sections[], notes[], tokenCount}`), ≤2,500-token cap honored, missing-input resilience (e.g. milestone kind without defined milestone falls back gracefully), determinism (same inputs → byte-identical output), no `Date.now()` or `Math.random()` in resolver bodies.
  - Each kind's resolver added to `KIND_REGISTRY` with its own file-mapping function. Resolver inputs:
    - `partition`: progress.md milestone row + `.gsd-t/contracts/file-disjointness-rules.md` excerpt + existing domain table
    - `plan`: progress.md milestone row + all `.gsd-t/domains/{m56-*}/scope.md` summaries + REQ traceability table excerpt
    - `discuss`: progress.md current-state + relevant CLAUDE.md sections (depending on what's being discussed — use `--domain` arg or fall back to whole CLAUDE.md trimmed)
    - `impact`: progress.md current-state + `.gsd-t/contracts/integration-points.md` (or m56-integration-points.md) + git diff summary
    - `milestone`: progress.md most-recent COMPLETE milestone row + version bump rationale + last 3 Decision Log entries
  - All 5 resolvers honor the 2,500-token cap. If a section overflows, trim with `notes: ["partition: scope.md trimmed at 1,800 tokens to honor cap"]`.

### M56-D2-T3 — Update context-brief-contract.md note (additive, no schema change)
- **Touches**: `.gsd-t/contracts/context-brief-contract.md` (additive § "Supported Kinds")
- **Contract refs**: self
- **Deps**: Requires T2
- **Acceptance criteria**:
  - Append a § "Supported Kinds (M55+M56)" listing all 11 kinds (6 from M55 + 5 from M56). Schema version remains v1.0.0 (additive entries are NOT a schema change). Status remains STABLE.

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 1 (T1)
- Blocked tasks: 2 (T2 needs T1; T3 needs T2)
- Estimated context per task: T1 small (~10%), T2 medium (~30% — includes ~5 file-resolution patterns + token-cap logic), T3 small (~5%)

## REQ Coverage
- REQ-M56-D2-01 → T2 (5 new kinds in KIND_REGISTRY)
- REQ-M56-D2-02 → T2 (unit tests covering all 5 kinds)
