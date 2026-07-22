# M58 Integration Points

## Domains

- **D1 m58-d1-test-data-ledger** — `bin/gsd-t-test-data-ledger.cjs` + 3 adapters + contract + tests
- **D2 m58-d2-verify-cleanup-step** — Playwright fixture helper + tagging convention contract + verify-step content draft

## Pairwise File-Disjointness

| File | D1 | D2 |
|------|----|----|
| `bin/gsd-t-test-data-ledger.cjs` | OWNS | reads at runtime |
| `bin/gsd-t-test-data-adapters/*.cjs` | OWNS | — |
| `.gsd-t/contracts/test-data-ledger-contract.md` | OWNS | — |
| `templates/test-helpers/test-data-fixture.ts` | — | OWNS |
| `templates/test-helpers/README.md` | — | OWNS |
| `.gsd-t/contracts/test-data-tagging-contract.md` | — | OWNS |
| `test/m58-d1-*.test.js` | OWNS | — |
| `test/m58-d2-*.test.js` | — | OWNS |
| `test/fixtures/m58-test-data/` | OWNS | — |
| `test/fixtures/m58-d2/` | — | OWNS |
| `bin/gsd-t.js` | — | — | (integrate-sequenced) |
| `commands/gsd-t-verify.md` | — | — | (integrate-sequenced) |
| `commands/gsd-t-help.md` | — | — | (integrate-sequenced) |
| `templates/CLAUDE-global.md` | — | — | (integrate-sequenced) |
| `GSD-T-README.md` | — | — | (integrate-sequenced) |
| `README.md` | — | — | (integrate-sequenced) |
| `CHANGELOG.md` | — | — | (integrate-sequenced) |
| `package.json` | — | — | (complete-milestone) |
| `~/.claude/.gsd-t-version` | — | — | (complete-milestone) |

D2 imports D1's `appendInsert` and `purgeRunInserts` at *runtime* (via published package or local relative require). Imports do not constitute a file-ownership conflict — D2 reads, D1 writes.

## Checkpoints

- **C1 (D1 publishes)**: `bin/gsd-t-test-data-ledger.cjs::{appendInsert,purgeRunInserts}` exported + `test-data-ledger-contract.md` flipped STABLE → unblocks D2-T2 (fixture imports the function).
- **C2 (D2 publishes)**: `templates/test-helpers/test-data-fixture.ts` + `test-data-tagging-contract.md` STABLE → unblocks integrate (verify-step text becomes wirable).
- **C3 (integrate)**: `gsd-t.js` CLI dispatch + verify Step 4.5 + doc-ripple in `templates/CLAUDE-global.md` + `commands/gsd-t-help.md` + `GSD-T-README.md` + `README.md`. Test-baseline check (must not regress 2587).
- **C4 (verify)**: Red Team adversarial pass + Test Data Cleanup Gate self-test (the new gate runs on M58's own verify — eat-our-own-dogfood).

## Cross-Domain Coupling

- **Runtime import only** — D2 calls `appendInsert` once C1 publishes. Adapters are dispatched by `kind` string, so D2 fixture passes ledger rows by name; no compile-time linkage.
- **No shared mutable state** — ledger file is the only shared artifact, and D1 owns the only writer (D2's fixture writes via D1's function).

## SharedCore Audit

- Single CLI consumer class. No SharedCore needed (matches M57 pattern).

## Test Baseline

- 2587/2587 unit pass (M57 final) — both domains must not regress.

## Versioning

Minor bump 3.27.10 → **3.28.10** on complete-milestone (new feature, additive).
