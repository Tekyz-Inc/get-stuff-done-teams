# Context-Brief Contract

> Status: **STABLE**
> Version: 1.0.0
> Owner: D4 (`m55-d4-context-brief-generator`)
> Consumer: D5 (`gsd-t-execute` Step 1 wire-in; subagent prompts read brief path from env)
> Promoted: 2026-05-09 by D4 build agent.

## Purpose

Replace the 30–60k context re-read every parallel worker performs (CLAUDE.md
+ contracts + scope + relevant code) with a ≤10 KB / ≤2,500-token JSON
snapshot generated once per spawn. Workers grep the brief instead of
re-walking the repo. The dominant ITPM-relief lever in M55 (charter
Pattern B).

## Library API

```js
const { generateBrief } = require('./bin/gsd-t-context-brief.cjs');
const brief = generateBrief({
  projectDir: '.',
  kind: 'execute',
  domain: 'm55-d1-state-precondition-library',
  spawnId: 'execute-D1-T3-20260509T160000Z',
});
fs.writeFileSync(`.gsd-t/briefs/${brief.spawnId}.json`, JSON.stringify(brief, null, 2));
```

### Public exports

| Export | Type | Purpose |
|--------|------|---------|
| `generateBrief(opts)` | `({projectDir, kind, domain, spawnId, strict?, now?}) => Brief` | Pure synchronous brief assembly. |
| `SCHEMA_VERSION` | `string` | `'1.0.0'`. |
| `MAX_BRIEF_BYTES` | `number` | `10240` (≈2,500 tokens at ~4 chars/token). |
| `KINDS` | `string[]` | `['design-verify','execute','qa','red-team','scan','verify']`. |
| `loadKindRegistry()` | `() => KindModule[]` | Directory scan of `bin/gsd-t-context-brief-kinds/`. |

The library MUST NOT spawn LLMs, network requests, or any subprocess other
than read-only `git` invocations executed inside per-kind collectors.

## CLI Form

```
node bin/gsd-t-context-brief.cjs --kind execute --domain m55-d1-... --spawn-id smoke-001 --json
node bin/gsd-t-context-brief.cjs --kind qa --domain m55-d3-... --spawn-id qa-001 --out .gsd-t/briefs/qa-001.json
```

Flags:

| Flag | Required | Notes |
|------|----------|-------|
| `--kind X` | yes | Must be one of `KINDS`. |
| `--domain Y` | yes for execute/verify/qa/red-team kinds; optional for scan/design-verify | Path-safety: matches `^[a-zA-Z0-9_-]+$`. |
| `--spawn-id Z` | yes | Path-safety: matches `^[a-zA-Z0-9_-]+$`. |
| `--out PATH` | optional | Writes brief to file. Without `--out` the brief prints to stdout. |
| `--json` | optional | Default. JSON envelope to stdout when `--out` absent. |
| `--strict` | optional | Fail-closed on missing OPTIONAL sources too. |
| `--project DIR` | optional | Defaults to `.`. |
| `--help` | optional | Prints usage. |

Exit codes:

| Code | Meaning |
|------|---------|
| `0` | Brief generated. |
| `2` | CLI usage error (bad flag, missing required, path-safety reject). |
| `4` | Required source missing (fail-closed kinds: qa, red-team, design-verify) OR `--strict` over an optional source OR brief exceeds `MAX_BRIEF_BYTES`. |

The wrapper around `gsd-t-token-capture.cjs` does not apply (see
§ captureSpawn Exemption).

## Schema

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-05-09T16:00:00.000Z",
  "spawnId": "string",
  "kind": "execute|verify|qa|red-team|design-verify|scan",
  "domain": "string|null",
  "sourceMtimes": { "<repo-relative-path>": "ISO8601" },
  "branch": "string",
  "contracts": [
    { "path": "string", "status": "STABLE|DRAFT|PROPOSED|UNKNOWN" }
  ],
  "scope": {
    "owned": ["..."],
    "notOwned": ["..."],
    "deliverables": ["..."]
  },
  "constraints": ["..."],
  "ancillary": { "<kind-specific>": "..." }
}
```

Top-level keys appear in alphabetical order in serialized output (stable
keys). Nested arrays are sorted unless explicitly noted as ordered (e.g.
`recentCommits` for the `red-team` kind, which is newest-first).

## Hard Token Cap

Every brief is ≤2,500 tokens (≤`MAX_BRIEF_BYTES` = 10,240 bytes of JSON).
Validation is enforced in `generateBrief` at write-time:

- If serialized length > `MAX_BRIEF_BYTES`, the library throws an
  `Error('brief exceeds MAX_BRIEF_BYTES (...)')` and `--out` is NOT
  written. The CLI returns exit 4.
- Over-cap is a runtime error, never silent truncation. Kind collectors
  that risk the cap MUST summarize via `sha256-prefix(8)`, line count,
  or first-N-line snippet — never inline raw 30 KB contracts.

## Freshness via mtime hash-stamp

`sourceMtimes` records every file the brief depends on, keyed by the path
the kind passed to the recorder, with the value set to the file's mtime
ISO string. A consumer regenerates if any `sourceMtimes[path]` mtime is
newer than the recorded value. Default behavior is fail-open (`null`
field, brief still written) when an optional source is missing; `--strict`
fails closed (exit 4).

## Idempotent-Join

Same `(projectDir, kind, domain, spawnId, sourceMtimes)` →
byte-identical brief output **with the single exception of
`generatedAt`**. Sort all arrays. Stable JSON keys. Nested objects
serialized in alphabetical key order. The library exposes a deterministic
JSON.stringify shim that the test suite uses to assert byte-identical
re-generation.

## Fail-Open vs Fail-Closed (per kind)

| Kind | Default mode | Required sources |
|------|--------------|------------------|
| `execute` | fail-open | none (domain dir absence → brief fields null) |
| `verify`  | fail-open | none |
| `scan`    | fail-open | none |
| `qa`      | fail-CLOSED | `templates/prompts/qa-subagent.md` |
| `red-team` | fail-CLOSED | `templates/prompts/red-team-subagent.md` |
| `design-verify` | fail-CLOSED | at least one of `.gsd-t/contracts/design-contract.md` or `.gsd-t/contracts/design/INDEX.md` |

`--strict` upgrades fail-open kinds to fail-closed for any missing
optional source.

## captureSpawn Exemption

Brief generation is pure (filesystem + read-only git read; never spawns
LLM children) and is therefore exempt from `bin/gsd-t-token-capture.cjs`
wrapping. This exemption is explicit and locked to this contract — any
future kind collector that triggers an LLM child MUST be rejected during
review and revert to a synchronous, deterministic implementation (or
move to a separate library that does flow through the wrapper).

## Path Safety

`--domain` and `--spawn-id` accept ONLY characters matching
`^[a-zA-Z0-9_-]+$`. Any input containing `/`, `..`, leading dot,
whitespace, or other punctuation is rejected with exit code 2 and a
structured error to stderr. The library validates these inputs at the
start of `generateBrief` and CLI argv parse.

## `.gsd-t/briefs/` is gitignored

Briefs are per-spawn ephemera, not committed artifacts.

- Repo-level `.gitignore` MUST contain a line `.gsd-t/briefs/`.
- D4 ships `.gsd-t/briefs/.gitignore` containing `*\n!.gitignore\n` so
  the directory exists in-repo but its contents are excluded.

## Kind Registry Shape

Each `bin/gsd-t-context-brief-kinds/{name}.cjs` exports:

```js
module.exports = {
  name: 'execute',                    // matches filename stem
  requiresSources: ['templates/.../qa-subagent.md'], // empty array allowed
  collect(ctx) {
    // ctx = { projectDir, kind, domain, spawnId, recordSource }
    // Returns the kind-specific subset {scope, constraints, contracts, ancillary}.
  },
};
```

The library's `loadKindRegistry()` is a deterministic directory scan —
adding a new kind is a single-file change. The registry validates
filename stem === `name`, that `collect` is a function, and that
`requiresSources` is an array of strings. Modules failing validation are
skipped with a structured note (no crash).

## Schema-Version Bump Rules

| Change | Bump |
|--------|------|
| Add an optional top-level field that older consumers can ignore | minor (`1.0.0 → 1.1.0`) |
| Change a default from fail-open to fail-closed for any kind | minor (`1.0.0 → 1.1.0`) |
| Remove a top-level field | major (`1.0.0 → 2.0.0`) |
| Change semantics of `sourceMtimes` keys (e.g., absolute vs relative) | major |
| Bump `MAX_BRIEF_BYTES` upward | minor |
| Lower `MAX_BRIEF_BYTES` | major (existing briefs may be invalidated) |

## Promotion to STABLE — locked criteria

D4 promoted v1.0.0 STABLE when ALL of the following held:
- Library + 6 kind collectors shipped.
- ≥1 unit test per kind plus envelope/freshness/idempotent-join/path-safety/hard-cap.
- Charter-aligned schema validated by `test/m55-d4-context-brief.test.js`.
- `.gsd-t/briefs/` and its `.gitignore` shipped.
- `npm test` passes with no new regressions.
