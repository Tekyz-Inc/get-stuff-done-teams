# Constraints: m52-d2-journey-specs-and-fixtures

## Must Follow

- **Functional, not layout.** Every spec assertion verifies one of: state
  changed, data flowed, content loaded, widget responded — per CLAUDE.md
  § "E2E Test Quality Standard (MANDATORY)". An assertion of
  `toBeVisible()` / `toBeAttached()` / `toHaveCount(N)` alone is a layout
  test, not a journey test. Reject it during self-review.
- **Real-data fixtures, not synthesised.** The 3 NDJSON fixtures must be
  captured from actual in-session sessions (e.g., copy frames from
  `.gsd-t/transcripts/in-session-*.ndjson`). Synthesising fake frames
  re-creates the M48-M51 drift problem one layer up.
- **One spec per manifest entry.** D2 maintains the 1:1 mapping between
  `e2e/journeys/*.spec.ts` filenames and `.gsd-t/journey-manifest.json`
  entries. D1's gap-finder relies on this — extra specs without manifest
  entries are flagged just as missing specs are.
- **Ephemeral port `port: 0`, server.address().port readback** — copy from
  M51 viewer-spec rigor commit (`f45ab77`). No `Math.floor(Math.random()
  * 100)` ports — that pattern was retired in M51.
- **Test runtime budget.** Each journey spec must complete in < 5 seconds
  on the local Playwright runner (CI baseline). The full 12-spec set must
  add < 60 seconds to the E2E suite. Slow specs (> 5s) are split or
  rewritten.
- **Red Team scoped to journeys.** The new "Test Pass-Through — Journey
  Edition" category in `red-team-subagent.md` writes 5+ broken viewer
  patches and proves each named journey spec catches the regression. This
  uses M51's red-team pattern (`.gsd-t/red-team-report.md` § "M51 RED TEAM
  FINDINGS") as the structural template — additive, doesn't replace the
  per-line categories.

## Must Not

- **Modify D1's owned files** — see scope.md § NOT Owned.
- **Modify M50/M51 viewer specs.** `e2e/viewer/title.spec.ts`,
  `e2e/viewer/timestamps.spec.ts`, `e2e/viewer/chat-bubbles.spec.ts`,
  `e2e/viewer/dual-pane.spec.ts`, `e2e/viewer/lazy-dashboard.spec.ts`,
  `e2e/viewer/click-completed.spec.ts` are off-limits. M52 adds journeys
  alongside; it does not edit existing viewer specs.
- **Touch unit tests.** Unit-test rigor is out of scope (milestone § Non-goals).
- **Auto-generate spec bodies.** Each of the 12 specs is hand-authored.
  AST-driven scaffolding is forbidden — it re-introduces the
  shape-of-handler bias the milestone exists to break.
- **Modify production viewer code.** If a journey spec fails because of a
  real viewer bug, file as backlog and stop. M52 ships zero
  production-code changes by definition.

## Must Read Before Using

- `e2e/viewer/dual-pane.spec.ts` — M51-strengthened reference for the
  `EventSource` constructor patch + outcome-based assertion shape.
- `e2e/viewer/click-completed.spec.ts` — closest surface analogue to
  several journey specs (click-completed-conversation, click-spawn-entry).
- `scripts/gsd-t-transcript.html` lines 353-1614 — listener call-site map.
  D2 uses this to map manifest entries to actual handlers and to know what
  user-visible state to assert on after each interaction.
- `.gsd-t/red-team-report.md` § "M51 RED TEAM FINDINGS" — structural
  template for the journey-edition adversarial run.
- `.gsd-t/contracts/journey-coverage-contract.md` (D1-owned) — manifest
  schema D2 must conform to.
- `.gsd-t/transcripts/in-session-*.ndjson` (any recent file) — source
  material for fixtures.

## Dependencies

- **Depends on**: D1's `.gsd-t/contracts/journey-coverage-contract.md` and
  `gsd-t check-coverage` CLI (both must exist + be committed before D2
  starts authoring the manifest); M50's `playwright.config.ts` (already
  in place); M51 viewer-spec patterns (read-only reference).
- **Depended on by**: D1 cannot finish its own integration verification
  without D2's manifest + 12 specs being present (the gap-finder needs a
  populated manifest to prove it works against a real codebase). This
  surfaces as Integration Checkpoint 2 — see
  `.gsd-t/contracts/m52-integration-points.md`.

## Branch & Commit

- **Expected branch**: `main` (in-session single-day build).
- **Commit cadence**: spec batches of 4 (3 commits — specs 1-4, 5-8, 9-12),
  then 1 commit for fixtures + replay-helpers, 1 commit for Red Team
  category + adversarial run report = 5 commits.
- **Doc-ripple set** (D2's share of the 5-file ripple): none directly —
  D1 owns the doc-ripple files. D2 only touches `templates/prompts/red-team
  -subagent.md`.
- **Pre-commit gate special**: every D2 commit that adds/edits a spec must
  also update `.gsd-t/journey-manifest.json` so the gate stays green.
