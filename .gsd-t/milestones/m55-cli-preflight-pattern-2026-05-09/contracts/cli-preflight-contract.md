# CLI-Preflight Contract

> **Status**: STABLE
> **Version**: 1.0.0
> **Date**: 2026-05-09
> **Owner**: M55 D1 (`m55-d1-state-precondition-library`)
> **Consumer**: M55 D5 (verify-gate Track 1 + `gsd-t-execute` Step 1 wire-in)

## Purpose

Pluggable, deterministic, zero-dep state-precondition library. Inspects project state — branch, ports, deps, contracts, manifests, working-tree — and emits a versioned envelope that downstream code judges. Pure inspector: no LLM calls, no token spend, no side effects beyond reading the filesystem and running a small fixed list of read-only `git` / `lsof` commands. Architecturally a sibling to `bin/parallelism-report.cjs` (zero deps, JSON envelope, schema-versioned, deterministic).

## Public API

```js
const { runPreflight } = require('./bin/cli-preflight.cjs');
const result = runPreflight({
  projectDir: '.',     // required string
  checks: undefined,   // optional Array<id> — default = run all built-ins
  mode: 'json',        // optional 'json' | 'text' — informational; envelope is identical
});
if (!result.ok) process.exit(4);
```

`runPreflight` is synchronous and never throws to the caller. Per-check throws are caught and recorded in the envelope (see § Fail-Soft).

## Envelope (v1.0.0)

```json
{
  "schemaVersion": "1.0.0",
  "ok": true,
  "checks": [
    { "id": "branch-guard",       "ok": true,  "severity": "error", "msg": "...", "details": { } },
    { "id": "contracts-stable",   "ok": true,  "severity": "warn",  "msg": "...", "details": { } },
    { "id": "deps-installed",     "ok": true,  "severity": "warn",  "msg": "..." },
    { "id": "manifest-fresh",     "ok": true,  "severity": "info",  "msg": "..." },
    { "id": "ports-free",         "ok": true,  "severity": "error", "msg": "..." },
    { "id": "working-tree-state", "ok": true,  "severity": "warn",  "msg": "..." }
  ],
  "notes": []
}
```

### Field rules

- `schemaVersion` — string `"MAJOR.MINOR.PATCH"`. v1.0.0 envelope shape locked.
- `ok` — `false` iff at least one check has `ok: false` AND `severity: "error"`. Non-error failures (warn/info) do NOT flip top-level `ok`.
- `checks[]` — sorted ascending by `id` (lexicographic). Stable across runs.
- `checks[].id` — kebab-case, matches the `bin/cli-preflight-checks/<id>.cjs` filename stem.
- `checks[].severity` — `"error" | "warn" | "info"`.
- `checks[].msg` — single-line human summary; required.
- `checks[].details` — optional object with structured payload (e.g., `{expected, actual}` for branch-guard, `{ports: [{port, listener}]}` for ports-free). Omitted when empty.
- `notes[]` — sorted strings. Used for: skipped checks, registry-load failures, per-check throws, missing optional artifacts.

### Severity model

| severity | Effect on top-level `ok` | Use case |
|----------|--------------------------|----------|
| `error`  | Blocks (sets `ok:false`) | Wrong branch, occupied port — never proceed |
| `warn`   | Records, does not block  | Stale lockfile, dirty tree — operator should know |
| `info`   | Records, does not block  | Manifest missing (non-fatal), no expected-branch rule |

## CLI Form

```
node bin/cli-preflight.cjs [--project DIR] [--json | --text] [--skip id1,id2,...]
```

| Flag | Default | Effect |
|------|---------|--------|
| `--project DIR` | `.` | Project root passed to checks |
| `--json` | (default) | Print envelope as `JSON.stringify(envelope, null, 2)` |
| `--text` | off | Print human-readable summary (status icon per check + top-level OK/FAIL) |
| `--skip id,...` | (none) | Skip listed checks; each skip appends a `notes[]` entry `"skipped: <id>"` |

Exit code is `0` when `ok===true` and `4` when `ok===false`. (`4` matches the headless-auto-spawn fail-closed convention used by M50.)

## Built-in Checks

Each check lives in `bin/cli-preflight-checks/<id>.cjs` and exports:

```js
module.exports = {
  id:        'kebab-case-id',           // string, must match filename stem
  severity:  'error' | 'warn' | 'info', // declared severity for this check
  run({ projectDir }) {                  // pure synchronous function
    return { ok: true, msg: '...', details: { /* optional */ } };
  },
};
```

| ID | Severity | Behavior |
|----|----------|----------|
| `branch-guard` | error | Reads project `CLAUDE.md`. Looks for an `Expected branch:` line (anywhere in the file). If found, compares to `git branch --show-current`. `ok:false` if mismatch. If no rule is set, `ok:true` with `msg:"no expected-branch rule set"`. |
| `contracts-stable` | warn | Scans `.gsd-t/contracts/*.md` for `Status: DRAFT` or `Status: PROPOSED`. Reads `.gsd-t/progress.md` to determine whether the project is past PARTITIONED (look for `Status: ACTIVE` or any milestone past PARTITIONED). If past PARTITIONED and any DRAFT/PROPOSED contracts exist, `ok:false`. Otherwise `ok:true`. |
| `deps-installed` | warn | Checks `node_modules/` exists AND `package-lock.json` mtime ≥ `package.json` mtime. `ok:false` if `node_modules/` is missing OR lockfile is older. If neither manifest exists, `ok:true` (non-Node project). |
| `manifest-fresh` | info | Compares `.gsd-t/journey-manifest.json` mtime against every file under `e2e/journeys/`. `ok:false` if manifest is older than any journey file. If either path is missing, `ok:true` with `msg:"no manifest, skipping"` (info-grade noop). |
| `ports-free` | error | Reads `requiredFreePorts: number[]` from `.gsd-t/.unattended/config.json` (default empty). For each port, runs `lsof -nP -iTCP:<port> -sTCP:LISTEN`. `ok:false` if any port has a listener. |
| `working-tree-state` | warn | Runs `git status --porcelain`. Reads `dirtyTreeWhitelist: string[]` from `.gsd-t/.unattended/config.json`. Each dirty path must match the whitelist (simple glob: `**` matches any segments, `*` matches non-slash). `ok:true` iff clean OR all dirty paths whitelisted. |

Adding a new check is a single-file change: drop `bin/cli-preflight-checks/<new-id>.cjs` exporting the shape above; the directory-scan registry will pick it up automatically. No edit to `bin/cli-preflight.cjs` is required.

## Determinism

Same project state in → byte-identical envelope out. Specifically:

- `checks[]` sorted by `id` (lexicographic ascending)
- `notes[]` sorted ascending
- No timestamps in the envelope (timestamps live in caller's logs, not here)
- No PIDs, no random IDs, no environment-dependent strings unless captured under `details`

## Fail-Soft

A single check throwing must not crash the library. The library catches the throw and emits a synthetic check entry:

```json
{ "id": "<id>", "ok": false, "severity": "<declared severity>", "msg": "check threw: <error.message>" }
```

…and appends a corresponding entry to `notes[]`. Top-level `ok` is then computed normally: synthetic failures with `severity:"error"` will set `ok:false`; warn/info synthetic failures will not.

If a check file in the registry is malformed (missing `id`, missing `run`, wrong shape), it is skipped at registry-load time with a `notes[]` entry `"registry: <filename> malformed"`. The library continues with the remaining valid checks.

## Schema-Version Policy

| Bump | Trigger |
|------|---------|
| MAJOR | Breaking envelope shape change (rename a field, change a type, remove a check id from the default registry) |
| MINOR | Additive field on the envelope or on a check entry, new check added to default registry, new severity tier |
| PATCH | Documentation-only changes, check `msg` text changes, internal refactors that preserve byte-identical output |

D1 ships v1.0.0; consumers MAY check `schemaVersion` and refuse to proceed on MAJOR mismatch.

## captureSpawn Exemption

Preflight is pure inspection — it does not spawn LLMs, so the M41 `bin/gsd-t-token-capture.cjs` invariant does not apply. The lint at `bin/gsd-t-capture-lint.cjs` does not flag this library. This contract is the canonical reference for that exemption; D5's `gsd-t-verify-gate.cjs` (which DOES spawn an LLM judge) inherits no such exemption.

## Promotion Criteria (satisfied 2026-05-09)

D1 has shipped:

- `bin/cli-preflight.cjs` library + 6 built-in checks under `bin/cli-preflight-checks/`
- ≥1 happy + ≥1 fail unit test per check
- Envelope-shape tests (schemaVersion stability, sort-stability, fail-soft-on-throw)
- CLI integration tests (`--json` parseable, `--text` human-readable, `--skip` honored)

Contract is therefore STABLE v1.0.0. M55 success criterion 1 is satisfied.

## Wire-in (deferred to D5)

The `gsd-t preflight` subcommand wire-in in `bin/gsd-t.js`, plus the `runPreflight()` call inside `bin/gsd-t-verify-gate.cjs` Track 1, are owned by D5 to keep D1 file-disjoint. D5 confirms STABLE flip during its wire-in pass.
