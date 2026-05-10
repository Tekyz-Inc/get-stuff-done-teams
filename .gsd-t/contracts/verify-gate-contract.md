# Verify-Gate Contract

> Status: **STABLE**
> Version: 1.0.0
> Owner: D5 (`m55-d5-verify-gate-and-wirein`)
> Consumer: `commands/gsd-t-verify.md` Step 2 (LLM judges the ≤500-token summary); `bin/gsd-t-verify-gate-judge.cjs`
> Promoted: 2026-05-09 by D5 build agent.

## Purpose

Two-track gate that executes BOTH:

- **Track 1** — D1's state-preflight envelope (`bin/cli-preflight.cjs::runPreflight`). Hard-fail on any `severity: "error"` check.
- **Track 2** — D2's parallel-CLI substrate (`bin/parallel-cli.cjs::runParallel`) fans out off-the-shelf deterministic CLIs (typecheck / lint / tests / dead-code / secrets / complexity).

Returns a ≤500-token JSON summary an LLM judges via `bin/gsd-t-verify-gate-judge.cjs`. Raw worker output stays on disk under `.gsd-t/verify-gate/{runId}/` for human-only inspection. The gate's `ok` is **purely deterministic** — the LLM verdict is advisory and never flips `ok`.

## Public API

```js
const { runVerifyGate } = require('./bin/gsd-t-verify-gate.cjs');
const result = await runVerifyGate({
  projectDir: '.',                       // optional — defaults to '.'
  preflightChecks: undefined,            // optional — default = all D1 built-ins
  parallelTrack: undefined,              // optional — array of worker specs (default = detect 6 CLIs)
  maxConcurrency: undefined,             // optional — default = read .gsd-t/ratelimit-map.json::recommended.peakConcurrency, fallback 2
  failFast: false,                       // optional — passed through to runParallel
  summaryTokenCap: 500,                  // optional — hard cap for `summary` JSON serialization
  skipTrack1: false,                     // optional — diagnostic only
  skipTrack2: false,                     // optional — diagnostic only
  now: undefined,                        // optional Date — injected for tests / determinism
});
```

`runVerifyGate` returns a Promise resolving to the v1.0.0 envelope below. It MUST NOT throw to the caller — internal failures surface as `ok: false` with structured `notes[]` entries.

## CLI Form

```
gsd-t verify-gate --json
gsd-t verify-gate --skip-track1 --json
gsd-t verify-gate --skip-track2 --json
gsd-t verify-gate --max-concurrency 4 --json
gsd-t verify-gate --project DIR --json
```

| Flag | Required | Effect |
|------|----------|--------|
| `--json` | optional (default) | Render envelope as `JSON.stringify(envelope, null, 2)` to stdout |
| `--skip-track1` | optional | Skip preflight (diagnostic). Track 1 reports `{ ok: true, skipped: true }`. |
| `--skip-track2` | optional | Skip parallel CLIs (diagnostic). Track 2 reports `{ ok: true, skipped: true }`. |
| `--max-concurrency N` | optional | Override D3-map default; passed to runParallel. |
| `--project DIR` | optional (default `.`) | Project root |
| `--help`, `-h` | optional | Print usage |

Exit codes:

| Code | Meaning |
|------|---------|
| `0`  | `ok: true` |
| `4`  | `ok: false` (failure detected on at least one track) |
| `2`  | CLI usage error (bad flag) |
| `3`  | Unhandled internal error |

## Envelope (v1.0.0)

```jsonc
{
  "schemaVersion": "1.0.0",
  "ok": true,                             // track1.ok && track2.ok
  "track1": {                              // D1 preflight envelope verbatim
    "schemaVersion": "1.0.0",
    "ok": true,
    "checks": [/* sorted by id ASC */],
    "notes": []
  },
  "track2": {
    "ok": true,                            // AND of every worker.ok (skipped workers count as ok:true)
    "wallClockMs": 5678,
    "maxConcurrencyApplied": 2,
    "workers": [                           // sorted by id ASC, deterministic
      {
        "id": "tsc",
        "ok": true,
        "exitCode": 0,
        "durationMs": 1234,
        "skipped": false,                  // true → reason field present, exitCode/durationMs may be 0
        "reason": null,                    // "not installed" | "skipped by flag" | etc.
        "summarySnippet": "head\n…\ntail"  // ≤per-CLI cap; never raw stdout
      }
    ],
    "notes": []
  },
  "summary": {                             // ≤summaryTokenCap (500 by default), fed to LLM judge
    "verdict": "PASS|FAIL",                // deterministic: derived from track1.ok && track2.ok
    "track1": {
      "ok": true,
      "failedChecks": []                   // [] when ok; else [{id, severity, msg}]
    },
    "track2": {
      "ok": true,
      "failedWorkers": []                  // [] when ok; else [{id, exitCode, summarySnippet}]
    }
  },
  "llmJudgePromptHint": "Render PASS / FAIL verdict on the summary above. Be terse. The deterministic verdict is `summary.verdict`; you confirm or contradict.",
  "meta": {
    "runId": "verify-gate-2026-05-09T17-08-25Z",
    "generatedAt": "2026-05-09T17:08:25.000Z"
  }
}
```

### Field rules

- `schemaVersion` — string `"MAJOR.MINOR.PATCH"`. v1.0.0 envelope shape locked.
- `ok` — boolean. **Strictly `track1.ok && track2.ok`.** No LLM influence.
- `track1` — verbatim D1 preflight envelope. When `skipTrack1: true`: `{ ok: true, skipped: true, schemaVersion: "1.0.0", checks: [], notes: ["skipped by flag"] }`.
- `track2.workers[]` — sorted by `id` ASC. Each worker has the fields above; raw stdout/stderr is NOT included (it lives in `.gsd-t/verify-gate/{runId}/{workerId}.{stdout,stderr}.ndjson` per D2 contract).
- `summary` — JSON object, MUST serialize to ≤`summaryTokenCap` bytes-of-tokens (4 chars/token approximation; hard cap measured at 1 token = 4 bytes).
- `meta.runId` — `verify-gate-{ISO-without-colons}`. Used for the on-disk raw-output dir.
- `meta.generatedAt` — ISO8601. The ONLY non-deterministic field across re-runs.

## Two-Track Hard-Fail

`top-level ok = (skipTrack1 || track1.ok) && (skipTrack2 || track2.ok)`.

- **Track 1 fail** (preflight detects e.g. wrong-branch / port-conflict / contract-DRAFT): `track1.ok=false`, `ok=false`. Track 2 still runs and reports — both tracks always run unless explicitly skipped via flag.
- **Track 2 fail** (any worker `ok:false` AND not skipped): `track2.ok=false`, `ok=false`. Track 1 still runs.
- **Both fail**: both report; `ok=false`.

Skipping a track via `--skip-track1` / `--skip-track2` is diagnostic-only — that track's `ok` is forced `true` and `notes[]` records `"skipped by flag"`. Production callers MUST NOT skip.

## ≤500-Token Summary Discipline

The `summary` field is the **only thing** the LLM judge sees. Each Track 2 worker contributes a head-and-tail snippet of stdout + stderr. Per-CLI snippet cap is configurable (defaults: 200 chars head + 200 chars tail per stream); total `summary` JSON ≤500 tokens after serialization.

The summary truncation algorithm (locked):

1. Build the summary skeleton above.
2. Serialize to JSON.
3. If `Buffer.byteLength(json) / 4 > summaryTokenCap` (4 chars/token), shrink each `failedWorkers[i].summarySnippet` by 50% (head and tail halved) and re-serialize.
4. Repeat shrink until under cap, OR until snippets reach a 32-char-per-worker floor.
5. If still over cap (pathological — 100+ failed workers), truncate `failedWorkers[]` to the first N entries that fit and append `"truncated: M more failed workers"` to `notes[]`.

Raw stdout/stderr is NEVER passed to the LLM judge. The judge sees only the structured summary.

## Off-the-Shelf CLIs (Track 2 default plan)

D5 detects each CLI via `which`/`npx --no-install` semantics. CLIs that aren't installed are NOT auto-installed — they report `skipped: true, reason: "not installed"`.

| Worker id | Job | Detection | Default args |
|-----------|-----|-----------|--------------|
| `tsc`        | typecheck   | `node_modules/.bin/tsc` exists OR `tsconfig.json` present | `tsc --noEmit` |
| `lint-js`    | lint (JS)   | `biome.json` exists | `npx biome check` |
| `lint-py`    | lint (Py)   | `pyproject.toml` with `[tool.ruff]` exists | `ruff check .` |
| `tests`      | test runner | `package.json` has `scripts.test` | `npm test --silent` |
| `dead-code`  | dead-code   | `node_modules/.bin/knip` exists | `npx knip` |
| `secrets`    | secrets     | `gitleaks` on PATH | `gitleaks detect --no-git -v` |
| `complexity` | complexity  | `scc` OR `lizard` on PATH | first-match |

Detection is read-only — D5 NEVER auto-installs. Detection results land in `track2.workers[].skipped`/`reason` fields.

## Defensive on D3 Map Absence

If `.gsd-t/ratelimit-map.json` doesn't exist (e.g., dev machine that hasn't run probe), D5:

1. Logs a structured warning into `notes[]`: `"ratelimit-map.json absent — using maxConcurrency=2 conservative default"`.
2. Sets `maxConcurrency: 2` for runParallel.
3. Continues normally.

If the map exists but `recommended.peakConcurrency` is missing/invalid, the same default-2 fallback applies, with a different note: `"ratelimit-map.json missing recommended.peakConcurrency — using maxConcurrency=2"`.

`opts.maxConcurrency` overrides this defensive default unconditionally.

## Idempotent Re-Runs

Same `(projectDir, source-tree-state, preflightChecks, parallelTrack, maxConcurrency)` → byte-identical `track1` + `track2.workers[].{ok,exitCode,skipped,reason}` + `summary` (all but the per-worker `durationMs`, `track2.wallClockMs`, and `meta.runId`/`meta.generatedAt`, which are inherently non-deterministic).

The fields that vary across re-runs are isolated to:

- `meta.runId` — derived from generatedAt, hence varies.
- `meta.generatedAt` — current ISO timestamp.
- `track2.wallClockMs` — orchestrator real time.
- `track2.workers[i].durationMs` — per-worker real time.

ALL other fields (track1 envelope, worker exit codes, ok flags, summarySnippets if deterministic CLI output, summary verdict) MUST be byte-identical for the same source state.

## Schema-Version Bump Rules

| Change | Bump |
|--------|------|
| Add an optional top-level field that older consumers can ignore | minor |
| Add an optional field to `track2.workers[i]` | minor |
| Change a default Track 2 CLI list entry (replace `biome` → `eslint`) | minor |
| Remove a top-level field | major |
| Change `summaryTokenCap` default (500 → 1000) | minor (looser) / major (stricter) |
| Change semantics of `ok` (e.g., LLM verdict influences) | major |

D5 ships v1.0.0; consumers MAY check `schemaVersion` and refuse to proceed on MAJOR mismatch.

## Head-and-Tail Snippet Rule (per worker)

Each worker's `summarySnippet` is built as:

```
HEAD(stdout[0..200]) + "\n…\n" + TAIL(stdout[-200..])
```

…where `200` is the per-CLI character cap (configurable via worker spec field `summarySnippetCharsPerSide`, default 200). If stdout < 400 chars, the full output is included with no `…` separator. Stderr, when non-empty, is appended after stdout with prefix `STDERR: `.

The snippet character set is sanitized — non-printable bytes (control chars except newline/tab) are replaced with `?` to avoid breaking the JSON envelope.

## Raw-Output Retention Path

`.gsd-t/verify-gate/{runId}/{workerId}.{stdout,stderr}.ndjson` per D2's tee contract. The directory is gitignored (added to `.gitignore` by D5 wire-in).

A consumer looking at a failed verify-gate run can:

1. Read `track2.workers[i].summarySnippet` for the head-and-tail.
2. Open `.gsd-t/verify-gate/{runId}/{workerId}.stdout.ndjson` for full stream.

Retention is **NOT auto-cleaned** by D5 — operators may snapshot or rotate as they wish. A future ratchet milestone may add `gsd-t verify-gate --gc-older-than=Nd`.

## captureSpawn Inheritance (NOT exempt)

Unlike D1 (preflight) and D4 (brief), the verify-gate library spawns subprocesses (Track 2 CLIs) AND will be invoked from inside a context that may LLM-judge the summary. **The verify-gate library itself is NOT a `captureSpawn` exemption** — every Track 2 worker spawn flows through D2's `runParallel`, which already enforces the wrapper. The library NEVER calls `child_process.spawn` directly.

The LLM judge invocation (when wired into `commands/gsd-t-verify.md` Step 2) is performed via the orchestrator's standard Task subagent path, which already lives behind `bin/gsd-t-token-capture.cjs::captureSpawn`.

## Wire-In Targets (D5 owns these touchpoints)

D5's wire-in commit lands ALL of these files in a single Document-Ripple-compliant change:

- `bin/gsd-t.js` — three dispatch subcommands (`preflight`, `brief`, `verify-gate`) + `GLOBAL_BIN_TOOLS` additions.
- `commands/gsd-t-execute.md` — Step 1 additive block (preflight + brief invocation).
- `commands/gsd-t-verify.md` — Step 2 additive block (verify-gate invocation + judge).
- `templates/prompts/qa-subagent.md` — additive "check the brief first" line.
- `templates/prompts/red-team-subagent.md` — same additive line.
- `templates/prompts/design-verify-subagent.md` — same additive line.
- `docs/architecture.md` — new "CLI-Preflight Pattern" section.
- `docs/requirements.md` — REQ-M55-D1, D2, D3, D4, D5 entries.
- `CLAUDE.md` (project) — "Mandatory Preflight Before Spawn" + "Brief-First Worker Rule" sections.
- `commands/gsd-t-help.md` — three new entries.
- `GSD-T-README.md` — workflow diagram + CLI table updated.
- `templates/CLAUDE-global.md` — preflight/brief/verify-gate documentation block.
- `~/.claude/CLAUDE.md` — Pre-Commit Gate addition: "Brief regenerated if preflight inputs changed".

## SC3 Failure Classes (D5 ships 3 e2e/journeys specs)

| Failure class | Spec | Expected behavior |
|---------------|------|-------------------|
| Wrong branch | `e2e/journeys/verify-gate-blocks-wrong-branch.spec.ts` | `track1.checks[branch-guard].ok=false`; `ok:false`; gate exits 4 |
| Port conflict | `e2e/journeys/verify-gate-blocks-port-conflict.spec.ts` | `track1.checks[ports-free].ok=false`; `ok:false`; gate exits 4 |
| Contract DRAFT | `e2e/journeys/verify-gate-blocks-contract-draft.spec.ts` | `track1.checks[contracts-stable].ok=false`; `ok:false`; gate exits 4 |

All 3 specs add entries to `.gsd-t/journey-manifest.json`.

## Promotion Criteria (satisfied 2026-05-09)

D5 promoted v0.1.0 PROPOSED → v1.0.0 STABLE when ALL of the following held:

- `bin/gsd-t-verify-gate.cjs` library + CLI shipped.
- `bin/gsd-t-verify-gate-judge.cjs` companion shipped.
- 3 wire-in assertion tests (`m55-d5-wire-in-execute`, `m55-d5-wire-in-verify`, `m55-d5-subagent-prompts`) GREEN.
- 3 e2e/journeys SC3 specs GREEN; manifest entries land.
- ≥6 unit tests in `test/m55-d5-verify-gate.test.js` covering: Track-1 hard-fail, Track-2 fan-out (mocked), summary truncation ≤500 tokens, schema-version stability, defensive-on-missing-map, idempotent-rerun.
- Judge prompt size budget test in `test/m55-d5-verify-gate-judge.test.js` GREEN.
- Doc ripple complete (12 wire-in targets above).
- Pre-Commit Gate addition landed in `~/.claude/CLAUDE.md`.
- `npm test` baseline 2262/2262 preserved (D5 adds new test files, no regressions).
