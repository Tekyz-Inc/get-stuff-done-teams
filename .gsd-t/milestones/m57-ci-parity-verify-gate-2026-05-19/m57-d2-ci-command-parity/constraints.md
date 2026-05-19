# Constraints: m57-d2-ci-command-parity

## Must Follow

- Zero external runtime deps — Node built-ins only. No YAML library: parse
  `cloudbuild.yaml` / `.github/workflows/*.yml` with a minimal line/regex scan
  sufficient for the `steps[].args` / `jobs[].steps[].run` fields. Document the
  parse approach's known limits in the contract.
- `.cjs` module, `'use strict';`, header docblock naming the contract (mirror
  `bin/gsd-t-verify-gate.cjs`).
- CLI entry self-invokes (`require.main === module`), `--json` output, exit **4**
  on `ok:false`, **0** on `ok:true`, **2** on usage error (match D1 / journey
  CLI convention for consistency).
- Detection precedence is LOCKED (cloudbuild → workflows → Dockerfile RUN →
  package.json scripts). Do not add heuristics, do not reorder, do not add an
  opt-in flag for docker. Presence of `Dockerfile` is the sole docker trigger.
- Cache clear is mandatory before running detected commands — failing to clear
  caches reintroduces the exact stale-cache blind spot M57 exists to close.
- Defensive: missing `docker` binary → record note + treat docker step as
  skipped-not-failed (so projects without Docker daemon don't hard-fail);
  missing all CI artifacts AND no package.json scripts → `ok:true` + note.
- Functions under 30 lines where practical; named helpers per detection source
  and for the cache-clear step.

## Must Not

- Modify any file outside Owned scope. `bin/gsd-t.js` and
  `commands/gsd-t-verify.md` are SHARED — integrate-sequenced only, never in
  the parallel execute wave (D1 also edits both).
- Import or copy code from the TimeTracking project (INSPECT-only — post-mortem
  facts in `.gsd-t/progress.md` M57 row define the planted-regression fixture).
- Add a new npm dependency or a YAML parser dep.
- Shell out without timeouts — every spawned command (incl. `docker build`)
  must have a bounded timeout and stream/capture output.

## Must Read Before Using

- `bin/gsd-t.js` lines 4544-4561 (`verify-gate` dispatch) — exact dispatcher
  pattern to replicate at integrate.
- `bin/gsd-t.js` ~lines 1181-1185 and ~2480-2485 — global-bin arrays.
- `.gsd-t/progress.md` M57 row — authoritative SC2 fixture spec (Dockerfile
  project, planted tsc strict regression a warm-cache local tsc misses, real
  `docker build` must fail → `ok:false`).
- `bin/gsd-t-verify-gate.cjs` Track 2 — how detected-command results are
  shaped/consumed downstream (read-only; informs envelope design for the
  verify.md wire-in at integrate).

## Dependencies

- Depends on: nothing (file-disjoint from D1; parallel wave).
- Depended on by: integrate phase (verify.md wire-in + CLI dispatch). No
  execute-time coupling with D1.
