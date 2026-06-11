# Tasks: m86-d1-policy-profiles-config-cli

## Files Owned

- `bin/gsd-t-model-tier-policy.cjs`
- `bin/gsd-t-model-profile.cjs`
- `bin/gsd-t.js`
- `.gsd-t/contracts/model-tier-policy-contract.md`
- `test/m86-policy-profiles.test.js`

---

### M86-D1-T1 — Profile dimension on the policy module
**Touches:** `bin/gsd-t-model-tier-policy.cjs`
Add `PROFILE_STAGE_TIERS` — a frozen `{ standard, pro, premium } → { stageKey → tier }` map
layered over the frozen M85 `STAGE_TIERS`. standard=zero fable; pro=red-team+pre-mortem+
debug-cycle-2 fable; premium=all 6. Producers HELD opus in all three. Export it additively
alongside the unchanged M85 surface. Add a `resolveProfile(stageKey, { profile, stageOverrides })`
helper honoring `stageOverrides[stage] ?? profile-tier ?? global-default` and returning the
concrete model id (via `MODEL_IDS`). Never throws.

### M86-D1-T2 — model-profile config + CLI module (NEW)
**Touches:** `bin/gsd-t-model-profile.cjs`
New zero-dep module: read/write `.gsd-t/model-profile.json` (`{ profile, stageOverrides }`)
with safe absent-file defaulting (named global default). CLI: `show` / `set <profile>` /
`set-stage <stage> <tier>` / `resolve --profile <p> [stage]` / `--json`. The resolve command
emits `{ ok, profile, overrides: {stage: modelId}, requiresThinkingOmitted? }` — the seam D2
consumes. Validate profile names + tier names; reject unknown with a non-zero exit + envelope.

### M86-D1-T3 — gsd-t.js dispatch + dual bin-propagation
**Touches:** `bin/gsd-t.js`
Add `case "model-profile"` (thin — mirrors the existing `model-tier-policy` case, delegates to
`gsd-t-model-profile.cjs`). Register `gsd-t-model-profile.cjs` in BOTH `GLOBAL_BIN_TOOLS`
(~1190) and `PROJECT_BIN_TOOLS` (~2486).

### M86-D1-T4 — Contract bump to v1.1.0 (additive)
**Touches:** `.gsd-t/contracts/model-tier-policy-contract.md`
Bump version 1.0.0 → 1.1.0 (Status STABLE). Add: the profile dimension table (3 profiles ×
fable-stage-set), the profile-aware resolve surface shape, and the `??`-form lint obligation
(`model: overrides["x"] ?? "<premium-literal>"` — premium literal is the lint-guarded fallback).
The M85 v1.0.0 constants section stays unchanged (mark additive). Update Consumers list.

### M86-D1-T5 — Unit tests (Headline + killing tests)
**Touches:** `test/m86-policy-profiles.test.js`
**Headline test:** assert `resolveProfile` returns the EXACT per-stage model id for each of the
three profiles (standard zero-fable; pro = red-team+pre-mortem+debug-cycle-2 fable; premium = all
6 fable; producers opus everywhere). Killing tests: override-beats-profile precedence; absent-config
→ named global default (SC(f)); `requiresThinkingOmitted` propagated for fable stages; unknown
profile/stage rejected. Run `node --test test/m86-policy-profiles.test.js` to green before commit.

---

## Acceptance bindings (this domain)

- SC(d) per-project divergence: the resolver reads per-project `.gsd-t/model-profile.json` —
  proven by D1's config-read logic + tests; live two-project proof is verify's job.
- SC(f) no silent degradation: T2 named-default logic + T5 absent-config test.
- Foundation for SC(a)/(b)/(c)/(e): D1 publishes the seam; D2/D3 prove them live.
