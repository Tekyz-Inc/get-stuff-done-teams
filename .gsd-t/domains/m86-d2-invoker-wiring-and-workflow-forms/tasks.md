# Tasks: m86-d2-invoker-wiring-and-workflow-forms

## Files Owned

- `templates/workflows/gsd-t-phase.workflow.js`
- `templates/workflows/gsd-t-verify.workflow.js`
- `templates/workflows/gsd-t-debug.workflow.js`
- `commands/gsd-t-partition.md`
- `commands/gsd-t-verify.md`
- `commands/gsd-t-debug.md`

---

### M86-D2-T1 — phase workflow `??` forms
**Touches:** `templates/workflows/gsd-t-phase.workflow.js`
`JSON.parse` `args`, read `const overrides = parsed.overrides ?? {}`. Convert four stages:
- solution-space-probe (line ~172): `model: overrides["solution-space-probe"] ?? "fable"`
- partition-probe (line ~198): `model: overrides["partition-probe"] ?? "fable"`
- competition-judge (line ~476): `model: overrides["competition-judge"] ?? "fable"`
- pre-mortem (line ~656): `model: overrides["pre-mortem"] ?? "fable"`
Leave producers (line ~432) as bare `model: "opus"` (M82 HELD). Stay runtime-native.

### M86-D2-T2 — verify workflow `??` form
**Touches:** `templates/workflows/gsd-t-verify.workflow.js`
`JSON.parse` args, read `overrides`. Convert red-team (line ~307):
`model: overrides["red-team"] ?? "fable"`. Leave code-review-ultra + synthesis as `"opus"`.

### M86-D2-T3 — debug workflow cycle-2 `??` form
**Touches:** `templates/workflows/gsd-t-debug.workflow.js`
`JSON.parse` args, read `overrides`. Convert the ternary (line ~97):
`model: cycle === 1 ? "opus" : (overrides["debug-cycle-2"] ?? "fable")`.

### M86-D2-T4 — partition invoker wire-in
**Touches:** `commands/gsd-t-partition.md`
At invoke time, call D1's resolver (`gsd-t model-profile resolve --profile <active> --json`),
build the `overrides` map (stage → concrete model id), and inject it into the phase workflow via
`args` alongside the existing partition args (M69 path). Document the new `overrides` arg.

### M86-D2-T5 — verify invoker wire-in
**Touches:** `commands/gsd-t-verify.md`
Same pattern: resolve active profile → inject `overrides` (at minimum `red-team`) into the verify
workflow args.

### M86-D2-T6 — debug invoker wire-in
**Touches:** `commands/gsd-t-debug.md`
Same pattern: resolve active profile → inject `overrides` (at minimum `debug-cycle-2`) into the
debug workflow args.

### M86-D2-T7 — real-sandbox run (killing test for SC(a)/(e))
**Touches:** (verification — no new file)
Run a real-sandbox phase + verify + debug with each profile and confirm the `⚙ [model]` lines
match the profile (standard zero-fable, pro three-fable, premium six-fable) and that `overrides`
appears in the args. This is verify's deep proof but D2 must self-smoke before handing off.

---

## Acceptance bindings (this domain)

- SC(a) profile→spend real-sandbox: D2's `??` forms + invoker injection make it true; proven live.
- SC(b) override beats profile live: invoker passes `stageOverrides`-derived `overrides`.
- SC(e) resolver consumed at invoke time: `overrides` visible in workflow args (the dead-export fix).
- SC(g) M85 partition-probe fable line: banked when partition runs with premium active (T7).
