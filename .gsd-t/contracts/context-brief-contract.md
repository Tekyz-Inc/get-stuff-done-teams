# Context-Brief Contract

> Status: **PROPOSED** — partition stub. D4 (`m55-d4-context-brief-generator`) promotes to STABLE during execute.
> Version: 0.1.0 (stub) → 1.0.0 (STABLE target)
> Owner: D4
> Consumer: D5 (`gsd-t-execute` Step 1 wire-in; subagent prompts read brief path from env)

## Purpose

Replace the 30–60k context re-read every parallel worker performs (CLAUDE.md + contracts + scope + relevant code) with a ~2k JSON snapshot generated once per spawn. Workers grep the brief instead of re-walking the repo. The dominant ITPM-relief lever in M55.

## Library API (target)

```js
const { generateBrief } = require('./bin/gsd-t-context-brief.cjs');
const brief = generateBrief({ projectDir: '.', kind: 'execute', domain: 'm55-d1-state-precondition-library', spawnId: 'execute-D1-T3-...Z' });
fs.writeFileSync(`.gsd-t/briefs/${brief.spawnId}.json`, JSON.stringify(brief, null, 2));
```

## CLI Form (target)

```
gsd-t brief --kind execute --domain m55-d1-state-precondition-library --json
gsd-t brief --kind qa --domain m55-d3-ratelimit-probe-map --out .gsd-t/briefs/qa-...json
```

## Schema (target — D4 finalizes)

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-05-NNTNN:NN:NNZ",
  "spawnId": "string",
  "kind": "execute|verify|qa|red-team|design-verify|scan",
  "domain": "string|null",
  "sourceMtimes": { "<path>": "ISO8601" },
  "branch": "string",
  "contracts": [{ "path": "string", "status": "STABLE|DRAFT|PROPOSED" }],
  "scope": { "owned": ["..."], "notOwned": ["..."], "deliverables": ["..."] },
  "constraints": ["..."],
  "ancillary": { "<kind-specific>": "..." }
}
```

## Hard Token Cap

Every brief is ≤2,500 tokens (≈10 KB JSON). Validation at write-time. Over-cap is a runtime error, not silent truncation.

## Freshness via mtime hash-stamp

`sourceMtimes` records every file the brief depends on. A consumer regenerates if any `sourceMtimes[path]` has changed (mtime newer than recorded value). Default behavior is fail-open (warn) when source is stale; `--strict` flag fails closed.

## Idempotent-Join

Same `(projectDir, kind, domain, spawnId, sourceMtimes)` → byte-identical brief output. Sort all arrays. Stable JSON keys. `generatedAt` is the only varying field on re-runs.

## Fail-Open vs Fail-Closed

- `--kind execute|verify|scan` → **fail-open** by default (missing optional source → field set to `null`, brief still written)
- `--kind qa|red-team|design-verify` → **fail-closed** (missing required source → exit 4 with structured `notes[]`)

## captureSpawn Exemption

Brief generation is pure (filesystem + git read; no LLM spawn), so `bin/gsd-t-token-capture.cjs` does not apply.

## Path Safety

`--domain` and `--spawnId` accept only `[a-zA-Z0-9_-]+`. Any `..` or `/` rejects with non-zero exit.

## `.gsd-t/briefs/` is gitignored

Briefs are per-spawn ephemera. D4 ships `.gsd-t/briefs/.gitignore` containing `*` (or equivalent global rule).

## Promotion to STABLE

D4 promotes to v1.0.0 STABLE when:
- Library + 6 kind collectors shipped
- ≥1 unit test per kind plus envelope/freshness/idempotent-join
- Charter-aligned schema validated by `test/m55-d4-context-brief.test.js`
