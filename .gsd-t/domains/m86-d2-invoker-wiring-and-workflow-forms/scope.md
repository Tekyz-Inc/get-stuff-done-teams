# Domain: m86-d2-invoker-wiring-and-workflow-forms

**Milestone:** M86 — Model Profiles (standard/pro/premium tier-spend switch)
**Role:** QUARANTINED runtime-native surface (TD-113 sandbox risk).

## Thesis

Convert the designated workflow stages to the invoke-time-injectable `??` form and wire the
thin command invokers to call D1's resolver and inject the resolved `overrides` map via `args`.
This domain owns ONLY workflow source + invoker command files — it NEVER touches the lint (D3)
that validates it, so a defect here cannot mask a defect in the guard.

## Owned Files (this domain WRITES these — no other domain may)

| File | Why |
|------|-----|
| `templates/workflows/gsd-t-phase.workflow.js` | `??` form for solution-space-probe, partition-probe, competition-judge, pre-mortem. |
| `templates/workflows/gsd-t-verify.workflow.js` | `??` form for red-team. |
| `templates/workflows/gsd-t-debug.workflow.js` | `??` form for the cycle-2 branch of the ternary. |
| `commands/gsd-t-partition.md` | Invoker calls D1 resolver, injects `overrides` into the phase workflow via args. |
| `commands/gsd-t-verify.md` | Invoker calls D1 resolver, injects `overrides` into the verify workflow via args. |
| `commands/gsd-t-debug.md` | Invoker calls D1 resolver, injects `overrides` into the debug workflow via args. |

## Deliverables

1. **Workflow `??` forms** — each designated stage becomes
   `model: overrides["<stage>"] ?? "<premium-literal>"` so the premium literal stays the
   lint-guarded fallback and the resolved override wins when present:
   - `gsd-t-phase.workflow.js`: solution-space-probe, partition-probe, competition-judge, pre-mortem.
   - `gsd-t-verify.workflow.js`: red-team.
   - `gsd-t-debug.workflow.js`: cycle-2 branch of the `cycle === 1 ? "opus" : ...` ternary →
     `cycle === 1 ? "opus" : (overrides["debug-cycle-2"] ?? "fable")`.
   - **Producers HELD opus** (M82 blindness) — do NOT add an override to `competition-producers`.
2. **JSON.parse args.overrides** — each workflow `JSON.parse`s `args` (a STRING) and reads the
   `overrides` map; stays runtime-native (NO require/fs/path/child_process/process — TD-113).
   Default to `{}` when `overrides` absent so the premium literal fallback applies.
3. **Invoker wire-in** — `commands/gsd-t-partition.md`, `gsd-t-verify.md`, `gsd-t-debug.md` call
   D1's profile-aware resolver at invoke time (`gsd-t model-profile resolve --profile <p> --json`),
   build the `overrides` map, and inject it into the workflow via `args` (M69 path). This closes
   SC(e) — the resolved overrides appear in the args the invoker passes.

## NOT Owned (other domains)

- The policy module / config / CLI / contract → D1 (this domain CONSUMES D1's published resolver).
- The drift lint + unwrap negative fixture → D3 (write-disjoint — D3 independently verifies D2).
- `wave` invoker / status / help / README / CLAUDE docs → D4.

## Dependencies

- **Inbound:** D1's published resolver surface (the `overrides` map shape from
  `gsd-t model-profile resolve --json`). Code against the contract seam, not D1's internals.
- The drift lint (D3) validates this domain's `??` forms — D2 must produce the EXACT form D3
  unwraps: `model: overrides["<stage>"] ?? "<premium-literal>"`.
