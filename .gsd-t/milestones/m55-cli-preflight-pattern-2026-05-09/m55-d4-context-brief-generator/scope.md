# Domain: m55-d4-context-brief-generator

## Responsibility

Replace the 30–60k context re-read every parallel worker performs (CLAUDE.md + contracts + domain scope + relevant code) with a single ~2k JSON snapshot generated once per spawn. The brief becomes the worker's first-and-only source of truth — workers grep the brief instead of re-walking the repo. This is the dominant ITPM-relief lever in the M55 charter (Pattern B from charter Context).

## Owned Files/Directories

- `bin/gsd-t-context-brief.cjs` — main library + CLI entry. Public CLI: `gsd-t brief --kind {execute|verify|qa|red-team|design-verify|scan} --domain X --json` (or write-to-file mode `--out .gsd-t/briefs/{spawnId}.json`). Library exports: `generateBrief({projectDir, kind, domain, spawnId})` returning the full JSON snapshot.
- `bin/gsd-t-context-brief-kinds/` — one file per `kind`, each exporting `{ name, collect(ctx) }` where `collect` returns the kind-specific subset of fields. Mirrors D1's per-check directory pattern.
  - `execute.cjs` — domain scope, constraints, contracts referenced, files-owned list, branch state, expected outputs
  - `verify.cjs` — verify-gate plan, prior verify results, current contract DRAFT/STABLE state, success criteria
  - `qa.cjs` — qa protocol path, test runner detection, prior qa-issues entries, contract list
  - `red-team.cjs` — red-team protocol path, recent commits in scope, attack vector seeds
  - `design-verify.cjs` — design contract path(s), Figma URL(s) if present, screenshot manifest
  - `scan.cjs` — repo file inventory hash, prior scan output mtime, exclusions
- `.gsd-t/briefs/` — output directory, one JSON file per spawn (`{spawn-id}.json`). Created on first write; `.gitignore` -ed.
- `.gsd-t/contracts/context-brief-contract.md` v1.0.0 STABLE — schema, freshness rules (mtime hash-stamp invalidates brief if any source file's mtime > brief mtime), fail-open vs fail-closed (default fail-open: stale brief warns, doesn't block), idempotent-join rule (re-generating with the same inputs yields byte-identical output).
- `test/m55-d4-context-brief.test.js` — unit tests (kind dispatch, freshness invalidation, schema-version, idempotent-join, fail-open-on-missing-source).
- `test/m55-d4-context-brief-kinds/` — per-kind test fixtures (mini repo states for each kind's `collect` path).

## NOT Owned (do not modify)

- `bin/cli-preflight.cjs` — D1
- `bin/parallel-cli.cjs` — D2
- `bin/gsd-t-ratelimit-probe.cjs` — D3
- `bin/gsd-t-verify-gate.cjs` — D5 (D5 imports D4's `generateBrief`)
- `templates/prompts/qa-subagent.md` — D5 owns the "check the brief first" hard-rule additive line
- `templates/prompts/red-team-subagent.md` — D5 owns
- `templates/prompts/design-verify-subagent.md` — D5 owns
- Any command file under `commands/` — D5 owns wire-in
- `bin/gsd-t.js` — D5 owns the dispatch wire-in (`gsd-t brief` subcommand)
- `bin/gsd-t-token-capture.cjs` — read-only reference (brief generation is pure, never spawns LLMs)

## Deliverables

- `bin/gsd-t-context-brief.cjs` library + 6 per-kind collectors
- `.gsd-t/contracts/context-brief-contract.md` v1.0.0 STABLE
- `.gsd-t/briefs/` directory created + added to `.gitignore`
- ≥1 unit test per kind plus envelope-shape, freshness, and idempotent-join tests
- `gsd-t brief` subcommand wire-in is **explicitly deferred to D5** to keep D4 file-disjoint

## Brief Schema (Charter Sketch)

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "ISO8601",
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

Target size: ≤2k JSON per brief. If a kind needs more, the kind file is responsible for hashing/summarizing — never inlining raw 30k contracts.

## Integration

- D5's `gsd-t-execute` Step 1 wire-in calls `generateBrief()` once per spawn batch and writes to `.gsd-t/briefs/{spawnId}.json`. Workers receive the brief path as part of their prompt scaffold.
- D5 also adds the "if you're about to grep/read/run-test, check the brief first" hard-rule line to qa/red-team/design-verify subagent protocols.
- The brief is **not** the verify-gate input — the verify-gate uses D1's preflight envelope (state) + D2's parallel CLI summaries (CLI runs). D4's brief is for LLM context relief.

## Sequencing

- Wave 1 — independent of D1, D2, D3 internals. Can start immediately, parallel with D1 and D3.
- Outputs the brief library + contract; D5 (Wave 3) wires it into commands and subagent protocols.
