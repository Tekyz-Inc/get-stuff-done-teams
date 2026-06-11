# Contract: Model-Profile Config + Resolver Seam (M86)

## Version: 1.0.0
## Status: DRAFT (partition-time seam; promoted to STABLE by D1 at execute)
## Owner: m86-d1-policy-profiles-config-cli
## Consumers: m86-d2-invoker-wiring-and-workflow-forms, m86-d3-drift-lint-unwrap-guard, m86-d4-surfacing-and-doc-ripple
## Created: 2026-06-10 18:23 PDT (M86 partition)

---

## Purpose

M86 adds three named **profiles** (standard / pro / premium) as a SECOND dimension over the
M85 frozen `STAGE_TIERS`, selectable per-project, injected at invoke time (M69 path — NO
tracked-file rewriting on switch). This contract is the **partition-time seam**: D1 PRODUCES the
profile dimension + config + resolver; D2/D3/D4 CONSUME the published surface below, never D1's
internals. Riskiest internal logic (override-beats-profile precedence) lives behind this envelope.

This seam is layered ADDITIVELY on top of `model-tier-policy-contract.md` (M85 v1.0.0 STABLE
constants unchanged). D1 bumps that contract to v1.1.0 to fold this dimension in at execute.

---

## Profile Dimension (the second axis)

| Profile | Fable stages | Definition |
|---------|--------------|------------|
| `standard` | ZERO fable | pre-M85 tiers: probes→opus, judge→sonnet, pre-mortem→opus, red-team→opus, debug both cycles→opus; producers→opus (unchanged). |
| `pro` | red-team + pre-mortem + debug-cycle-2 | the 3 highest-value fable stages; everything else reverts to standard. |
| `premium` | all 6 (M85 full set) | solution-space-probe + partition-probe + competition-judge + pre-mortem + red-team + debug-cycle-2 on fable; producers HELD opus. |

`competition-producers` is `opus` in ALL three profiles (M82 blindness invariant — never fable).
Bottom of the ladder (`haiku`, `sonnet`) unchanged except `standard`'s judge→sonnet remap.

---

## Per-Project Config Schema

`.gsd-t/model-profile.json`:
```json
{ "profile": "pro", "stageOverrides": { "competition-judge": "fable" } }
```
- `profile` ∈ { standard, pro, premium }. Absent file → GLOBAL DEFAULT, NAMED (SC(f) — no silent
  degradation). The global default is `premium` (the M85 full posture) unless documented otherwise.
- `stageOverrides` (optional) → per-stage `tier` that WINS over the profile.

---

## Resolver Surface (the seam D2/D3/D4 consume)

```
node bin/gsd-t-model-profile.cjs resolve --profile <p> [stage] [--json]
gsd-t model-profile resolve --profile <p> [stage] --json
```
Emits:
```json
{
  "ok": true,
  "profile": "pro",
  "overrides": { "red-team": "claude-fable-5", "pre-mortem": "claude-fable-5", "debug-cycle-2": "claude-fable-5" },
  "requiresThinkingOmitted": { "red-team": true, ... }
}
```
- **Precedence:** `stageOverrides[stage] ?? profile-tier ?? global-default`.
- `overrides` maps designated stage key → concrete model id (from M85 `MODEL_IDS`).
- The CLI: `show` / `set <profile>` / `set-stage <stage> <tier>` / `resolve` / `--json`.

---

## Workflow `??`-Form Obligation (D2 produces, D3 validates)

Each designated workflow stage becomes exactly:
```
model: overrides["<stage>"] ?? "<premium-literal>"
```
- The premium literal stays the **lint-guarded fallback** (D3 unwraps + validates it).
- The resolved override (injected by the invoker via `args`) WINS when present.
- Producers stay a BARE `model: "opus"` (M82 — NOT wrapped).
- Designated stages + their premium fallback literal:
  `solution-space-probe → "fable"`, `partition-probe → "fable"`,
  `competition-judge → "fable"`, `pre-mortem → "fable"`, `red-team → "fable"`,
  `debug-cycle-2 → "fable"` (cycle-1 stays `"opus"`).

---

## Drift-Lint Obligation (D3 owns)

`test/m85-workflow-tier-policy-lint.test.js` UNWRAPS the `??` form and validates the FALLBACK
literal against the tier set + designated-stage policy. Three mandatory negatives: drifted bare
literal FAILS, drifted fallback FAILS, out-of-tier fallback FAILS. Fail-closed on unparseable
`model:` lines.

---

## Invoke-Time Injection (M69 — closes the M85 dead-export concern, SC(e))

Command invokers (`commands/gsd-t-{partition,verify,debug}.md`) call the resolver at invoke time,
build the `overrides` map, and inject it into the workflow via `args`. The workflow `JSON.parse`s
`args` (a STRING — TD-113) and reads `overrides` (default `{}`). The resolved map is VISIBLE in
the args the invoker passes (the live-export proof).

---

## File Ownership (re-validated for disjointness by the partition oracle)

| Domain | Owns |
|--------|------|
| D1 | `bin/gsd-t-model-tier-policy.cjs`, `bin/gsd-t-model-profile.cjs`, `bin/gsd-t.js`, `.gsd-t/contracts/model-tier-policy-contract.md`, `test/m86-policy-profiles.test.js` |
| D2 | `templates/workflows/gsd-t-{phase,verify,debug}.workflow.js`, `commands/gsd-t-{partition,verify,debug}.md` |
| D3 | `test/m85-workflow-tier-policy-lint.test.js`, `test/m86-lint-unwrap-fallback.test.js` |
| D4 | `scripts/gsd-t-auto-route.js`, `scripts/gsd-t-statusline.js`, `commands/gsd-t-status.md`, `commands/gsd-t-help.md`, `README.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`, `CLAUDE.md`, `package.json` |

No file appears under two domains. This contract is owned by D1 (a contract file under
`.gsd-t/contracts/`, disjoint from every domain's source).

---

## Out of Scope

- Session default model (`/model`) — profiles govern workflow stages only.
- New tiers / new stages — profiles re-map the existing M85 `STAGE_TIERS` set.
- Tracked-file rewriting on switch — the entire point is invoke-time injection.
