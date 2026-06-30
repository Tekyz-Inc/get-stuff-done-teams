# Domain: m99-d2-layer2-decision-logging

## Wave: 2 (after D1's resolver lands; parallel with D3, file-disjoint)

## One-line
The REASON the milestone exists. Owns BOTH intercept scripts wholly + adds Layer-2 decision logging to them and the wiring-mode preamble to the 6 consuming workflows.

## Why this domain exists
The graph-vs-grep DECISION is what M99 makes observable. This domain adds the per-decision ledger line at the two interception points (grep + read) and makes every consuming workflow attribute its events + persist its wiring mode. Owning the intercept scripts WHOLE dissolves the D1-vs-intercept collision by ownership (not by splitting a file): D1 builds the resolver; D2 repoints the intercepts at it.

## Owned / Written files
- `scripts/gsd-t-graph-intercept.js` — repoint the `fs.existsSync(...graph.db)` presence check (`:69`) at D1's resolver (import, never re-derive) so the hook doesn't silently disable after the migration; add Layer-2a logging: one ledger line per decision `{kind:'grep', classified, action, patternShape, consumer}` (incl. text passthrough). Fail-open, byte-identical on/off, classify decision unchanged.
- `scripts/gsd-t-read-intercept.js` — repoint the presence check (`:74`) + the `Database(...graph.db)` open (`:108`) at D1's resolver; add Layer-2b logging: one line per augment/passthrough decision `{kind:'read', action, file, consumer}`. The augment-never-shrink rule is KEPT (default pass-through). Fail-open, byte-identical on/off.
- `templates/workflows/gsd-t-scan.workflow.js` — set `GSDT_GRAPH_CONSUMER`, persist `graphWiringMode` (WIRED|fallback-announced|disabled) into the ledger, **stamp the mode into the scan report header** (the NiceNote north-star).
- `templates/workflows/gsd-t-verify.workflow.js` — set `GSDT_GRAPH_CONSUMER` + persist `graphWiringMode`.
- `templates/workflows/gsd-t-debug.workflow.js` — same.
- `templates/workflows/gsd-t-integrate.workflow.js` — same.
- `templates/workflows/gsd-t-quick.workflow.js` — same.
- `templates/workflows/gsd-t-phase.workflow.js` — same.
- `test/m99-layer2-decision-logging.test.js` — **NEW**. One line per grep decision; one per read decision; byte-identical classify/augment with logging on vs off.
- `test/m99-wiring-mode.test.js` — **NEW**. Each consumer persists its `graphWiringMode`; scan stamps it into the report header.

## NOT owned (other domains)
- The resolver + sink + the 5 producer files + `.gitignore` — **D1**. D2 IMPORTS `resolveStorePath` / `resolveLogsDir` / `append_ledger_line` from D1, never hardcodes a path.
- `bin/gsd-t.js`, `bin/gsd-t-graph-metrics-rollup.cjs`, the contract — **D3**.

## Depends on (D1 exports)
`resolveStorePath`, `resolveLogsDir`, `append_ledger_line` from `bin/gsd-t-graph-store-resolver.cjs`.

## Done when
1. Both intercept scripts repoint their presence checks at D1's resolver (no silent disable post-migration).
2. Grep-intercept emits one `kind:'grep'` line per decision; read-intercept emits one `kind:'read'` line per augment/passthrough — both fail-open + byte-identical on/off, never-shrink KEPT.
3. All 6 workflows set `GSDT_GRAPH_CONSUMER` + persist `graphWiringMode`; scan stamps it into its report header.
