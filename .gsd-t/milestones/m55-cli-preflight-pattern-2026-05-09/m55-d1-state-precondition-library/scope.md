# Domain: m55-d1-state-precondition-library

## Responsibility

Pluggable state-precondition CLI library — a deterministic, zero-dep, schema-versioned state inspector that emits a `{ok, checks[], notes[]}` envelope. Pure state inspection: no LLM calls, no token spend, no side effects beyond reading filesystem and git state. Mirrors the architectural pattern of `bin/parallelism-report.cjs` (zero deps, deterministic output, JSON envelope).

This is the FIRST half of M55's two-track guarantee — every spawn is gated by deterministic state checks before any LLM work begins. The library powers D5's verify-gate Track 1 and D5's `gsd-t-execute` Step 1 wire-in.

## Owned Files/Directories

- `bin/cli-preflight.cjs` — main library + CLI entry. Exports: `runPreflight({ projectDir, checks?, mode? })` returning `{ ok, schemaVersion, checks: [{ id, ok, severity, msg, details? }], notes: [] }`. CLI form: `node bin/cli-preflight.cjs --project . --json` (or `--text` for human read).
- `bin/cli-preflight-checks/` — built-in check registry (one file per check):
  - `branch-guard.cjs` — current branch vs CLAUDE.md "Expected branch" guard
  - `ports-free.cjs` — required dev ports (configurable list) are unbound
  - `deps-installed.cjs` — `node_modules/` exists and `package-lock.json` mtime ≥ `package.json` mtime
  - `contracts-stable.cjs` — no contract files in `.gsd-t/contracts/` are flagged DRAFT/PROPOSED when the milestone is past PARTITIONED
  - `manifest-fresh.cjs` — `.gsd-t/journey-manifest.json` newer than every file under `e2e/journeys/`
  - `working-tree-state.cjs` — git working tree status (clean, allowed-dirty per dirtyTreeWhitelist, unsafe)
- `test/m55-d1-cli-preflight.test.js` — unit tests for the library (envelope shape, every check happy/fail path, schema-version stability)
- `test/m55-d1-cli-preflight-checks/` — per-check test fixtures (mini repos / git states per check)

## NOT Owned (do not modify)

- `bin/parallel-cli.cjs` — owned by D2 (only INSPECT for envelope-style reference)
- `bin/gsd-t-ratelimit-probe.cjs` — owned by D3
- `bin/gsd-t-context-brief.cjs` — owned by D4
- `bin/gsd-t-verify-gate.cjs` — owned by D5 (D5 imports D1's `runPreflight`)
- Any command file under `commands/` — D5 owns wire-in
- `bin/gsd-t.js` — D5 owns the dispatch wire-in (`gsd-t preflight` subcommand)
- `bin/gsd-t-token-capture.cjs` — read-only reference (preflight is pure, never spawns)
- `bin/parallelism-report.cjs` — INSPECT-only reference for envelope idiom

## Deliverables

- `bin/cli-preflight.cjs` library + 6 built-in checks
- `.gsd-t/contracts/cli-preflight-contract.md` v1.0.0 STABLE (envelope schema, check registry shape, severity model, schema-version policy)
- ≥1 unit test per check (happy + fail path) plus envelope-shape tests
- `gsd-t preflight` subcommand wire-in is **explicitly deferred to D5** to keep D1 file-disjoint

## Integration

- Track 1 of D5's verify-gate consumes D1's envelope; D1 ships standalone and tested before D5 wires it
- D5's `gsd-t-execute` Step 1 wire-in calls `runPreflight()` programmatically
