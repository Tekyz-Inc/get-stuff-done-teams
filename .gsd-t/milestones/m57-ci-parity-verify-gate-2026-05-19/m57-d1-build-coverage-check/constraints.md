# Constraints: m57-d1-build-coverage-check

## Must Follow

- Zero external runtime deps — Node built-ins only (`child_process` for git,
  `fs`, `path`). This is a hard repo invariant (CLAUDE.md § Don't).
- `.cjs` module with `'use strict';`, header docblock naming the contract
  (mirror the style of `bin/gsd-t-verify-gate.cjs` lines 1-25).
- CLI entry self-invokes when run directly (`if (require.main === module)`),
  prints JSON on `--json`, exits **4** on `ok:false`, **0** on `ok:true`,
  **2** on usage error. Match the exit-code convention of
  `bin/journey-coverage-cli.cjs` (0/4/2).
- Functions under 30 lines where practical; named helpers for git-diff parsing,
  top-level collapse, and per-artifact reference scan.
- Defensive: missing git repo, detached HEAD, identical baseRef/headRef, no CI
  artifacts → return a well-formed envelope with `note`, never throw.
- baseRef/headRef defaulting: when omitted, derive the milestone commit range
  from `.gsd-t/progress.md` current-milestone tag heuristic OR fall back to
  `HEAD~1..HEAD` — document the chosen default in the contract.

## Must Not

- Modify any file outside Owned scope. `bin/gsd-t.js` and
  `commands/gsd-t-verify.md` are SHARED — touched only at integrate, never in
  the parallel execute wave.
- Import or copy code from the TimeTracking project. It is INSPECT-only —
  the post-mortem facts in `.gsd-t/progress.md` M57 row define the fixture; do
  not read or vendor TimeTracking sources.
- Add a new npm dependency.
- Treat the CI-artifact formats as a black box — write explicit, minimal
  parsers (line-based `COPY`/`ADD` scan for Dockerfile; YAML-ish path scan for
  cloudbuild.yaml / workflows — no YAML lib, regex/line scan only).

## Must Read Before Using

- `bin/gsd-t.js` lines 4544-4561 (`verify-gate` dispatch case) — the exact
  spawnSync dispatcher pattern D1 must replicate at integrate.
- `bin/gsd-t.js` ~lines 1181-1185 and ~2480-2485 — global-bin propagation
  arrays the new module name must be added to at integrate.
- `bin/journey-coverage-cli.cjs` — exit-code convention (0/4/2) precedent.
- `.gsd-t/progress.md` M57 row — authoritative SC1 fixture spec (new `hooks/`
  dir committed, absent from Dockerfile COPY → `missing[]` non-empty + exit 4).

## Dependencies

- Depends on: nothing (file-disjoint from D2; parallel wave).
- Depended on by: integrate phase (verify.md wire-in + CLI dispatch), D2 shares
  only the integrate-sequenced files — no execute-time coupling.
