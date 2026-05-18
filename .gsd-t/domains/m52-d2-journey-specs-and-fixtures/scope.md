# Domain: m52-d2-journey-specs-and-fixtures

## Responsibility

Build the **content layer** that the D1 enforcer measures coverage against:
12 inaugural Playwright journey specs + 3 real-data NDJSON fixtures + the
"Test Pass-Through — Journey Edition" Red Team category.

A "journey" walks an interactive surface end-to-end (load → click/keystroke →
**assert on user-visible state change**), not on element existence or
JSON-stringify dumps. Each spec corresponds 1:1 to a manifest entry that D1's
detector requires.

This is the *content* half of M52. D1 is the *enforcement* half.

## Owned Files/Directories

- `e2e/journeys/` — 12 inaugural spec files, one per listener-target named
  in the milestone definition:
  1. `main-session-stream.spec.ts`
  2. `click-completed-conversation.spec.ts`
  3. `click-spawn-entry.spec.ts`
  4. `splitter-drag.spec.ts`
  5. `splitter-keyboard.spec.ts`
  6. `right-rail-toggle.spec.ts`
  7. `completed-collapse-toggle.spec.ts`
  8. `auto-follow-toggle.spec.ts`
  9. `kill-button.spec.ts`
  10. `sessionstorage-persistence.spec.ts`
  11. `keyboard-shortcuts.spec.ts`
  12. `hashchange.spec.ts`
- `e2e/fixtures/journeys/` — 3 real-data NDJSON fixtures captured from
  in-session sessions (not synthesised). Names TBD during D2 planning;
  placeholder set: `fixture-medium-session.ndjson` (~50 frames),
  `fixture-completed-session.ndjson` (~150 frames),
  `fixture-multi-spawn.ndjson` (~80 frames across 3 spawns).
- `e2e/fixtures/journeys/replay-helpers.ts` — small helper that loads a
  fixture, slices it into SSE-event-shaped chunks, and feeds them through
  a stub `EventSource` so journey specs can assert on rendered output
  without standing up a live dashboard server. Zero new runtime deps —
  uses Playwright's built-in route/intercept primitives.
- `templates/prompts/red-team-subagent.md` — append "Test Pass-Through —
  Journey Edition" category. Existing categories are not edited; this is
  an additive subsection (see Constraints).
- `.gsd-t/journey-manifest.json` — the manifest D1's detector reads. D2
  authors and maintains this file (one entry per spec; D1 only reads it).

## NOT Owned (do not modify)

- `bin/journey-coverage.cjs`, `bin/journey-coverage-cli.cjs`,
  `scripts/hooks/pre-commit-journey-coverage`,
  `.gsd-t/contracts/journey-coverage-contract.md` — D1 owns.
- `bin/gsd-t.js` — D1 owns the M52 edits to it; D2 must not touch.
- `e2e/viewer/*.spec.ts` — pre-existing M50/M51 specs; off-limits except for
  pattern reading (ephemeral port `port: 0`, outcome-based assertions —
  see § Must Read Below).
- `playwright.config.ts` — pre-existing M50 D2 task-1 file. D2 may register
  the new `e2e/journeys/` directory in `testDir` if and only if the existing
  `testDir: './e2e'` doesn't already cover it. (It does — `'./e2e'` includes
  `e2e/journeys/`. So no edit needed.)
- `scripts/gsd-t-transcript.html`, `scripts/gsd-t-dashboard-server.js`,
  any `bin/gsd-t-dashboard*.cjs` — read-only for spec authoring.

## Public API (what D1 consumes)

D2 produces, D1 consumes:

1. **`.gsd-t/journey-manifest.json`** — populated by D2 with one entry per
   `e2e/journeys/*.spec.ts` file. Schema lives in
   `.gsd-t/contracts/journey-coverage-contract.md` (D1's responsibility).
2. **All 12 specs land green.** D2's CI assertion: full E2E suite includes
   all 12 journey specs and all 12 pass before any commit reports complete.
3. **3 fixture replays pass.** Each fixture has a corresponding journey
   spec that replays it through `replay-helpers.ts` and asserts on the
   rendered output.
