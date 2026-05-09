# CLI-Preflight Contract

> Status: **PROPOSED** — partition stub. D1 (`m55-d1-state-precondition-library`) promotes to STABLE during execute.
> Version: 0.1.0 (stub) → 1.0.0 (STABLE target)
> Owner: D1
> Consumer: D5 (verify-gate Track 1 + `gsd-t-execute` Step 1 wire-in)

## Purpose

Pluggable, deterministic, zero-dep state-precondition library. Inspects project state (branch, ports, deps, contracts, manifests, working-tree) and emits a versioned envelope that downstream code judges. Pure inspector — no LLM calls, no token spend.

## Envelope (target — D1 finalizes)

```json
{
  "schemaVersion": "1.0.0",
  "ok": true,
  "checks": [
    { "id": "branch-guard",       "ok": true,  "severity": "error", "msg": "...", "details": {} },
    { "id": "ports-free",         "ok": true,  "severity": "error", "msg": "..." },
    { "id": "deps-installed",     "ok": true,  "severity": "warn",  "msg": "..." },
    { "id": "contracts-stable",   "ok": true,  "severity": "warn",  "msg": "..." },
    { "id": "manifest-fresh",     "ok": true,  "severity": "info",  "msg": "..." },
    { "id": "working-tree-state", "ok": true,  "severity": "warn",  "msg": "..." }
  ],
  "notes": []
}
```

Top-level `ok` = `false` iff any check is `ok: false` AND `severity === "error"`.

## Library API (target)

```js
const { runPreflight } = require('./bin/cli-preflight.cjs');
const result = runPreflight({ projectDir: '.', checks: undefined /* default = all built-ins */, mode: 'json' });
if (!result.ok) process.exit(4);
```

## CLI Form (target)

```
node bin/cli-preflight.cjs --project . --json
node bin/cli-preflight.cjs --project . --text         # human-friendly summary
node bin/cli-preflight.cjs --project . --skip ports-free,manifest-fresh
```

## Built-In Checks (target)

| ID | Severity | What it checks |
|----|----------|---------------|
| `branch-guard` | error | Current branch matches CLAUDE.md "Expected branch" rule |
| `ports-free` | error | Required dev ports unbound (configurable list) |
| `deps-installed` | warn | `node_modules/` exists; `package-lock.json` mtime ≥ `package.json` mtime |
| `contracts-stable` | warn | No `.gsd-t/contracts/*.md` flagged DRAFT/PROPOSED past PARTITIONED milestone state |
| `manifest-fresh` | info | `.gsd-t/journey-manifest.json` newer than every file under `e2e/journeys/` |
| `working-tree-state` | warn | git working tree clean OR matches `dirtyTreeWhitelist` |

## Schema-Version Policy (target)

- `schemaVersion` MAJOR bumps for breaking envelope shape changes
- MINOR bumps for additive fields
- PATCH bumps for documentation/check-text changes only

## captureSpawn Exemption

Preflight does not spawn LLMs, so `bin/gsd-t-token-capture.cjs` does not apply. This contract is the canonical reference for that exemption.

## Promotion to STABLE

D1 promotes this contract to v1.0.0 STABLE when:
- Library + 6 checks shipped
- ≥1 unit test per check (happy + fail)
- Envelope schema validated by `test/m55-d1-cli-preflight.test.js`
- Charter SC1 satisfied
