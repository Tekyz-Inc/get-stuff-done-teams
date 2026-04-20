# Domain: d1-token-capture-wrapper

## Responsibility

Build the single reusable module every GSD-T spawn call site uses to parse Claude's result envelope, extract real token usage, and append a fully-populated row to `.gsd-t/token-log.md` + `.gsd-t/metrics/token-usage.jsonl`. This is the pipe; D2–D5 wire into it.

The wrapper is the successor to the scattered bash snippets (`T_START=$(date +%s)…`) scribbled across 20 command files. Those snippets record a row with `Tokens=0` because nobody ever parsed `usage.*`. D1 ends that.

## Owned Files/Directories

- `bin/gsd-t-token-capture.cjs` (NEW) — exports `captureSpawn({command, step, model, description, projectDir, spawnFn}) → {result, usage, rowWritten}` and `recordSpawnRow({projectDir, command, step, model, startedAt, endedAt, usage, domain?, task?, ctxPct?, notes?})`. Zero deps. Built on top of `scripts/gsd-t-token-aggregator.js` (M40 D4) helpers — **re-uses** the same `token-usage.jsonl` schema v1 writer so aggregation is consistent across orchestrator and command-file spawns.
- `test/m41-token-capture.test.js` (NEW) — unit tests for envelope parsing (assistant vs result frame usage precedence), row formatting, atomic append, missing-usage handling (writes `—` not `0`), cost fallback.

## NOT Owned (do not modify)

- `scripts/gsd-t-token-aggregator.js` — owned by M40 D4; D1 **imports** its schema helpers
- Any `commands/*.md` — D2 owns the wiring
- `bin/gsd-t-orchestrator*.cjs` — M40 orchestrator has its own path; the wrapper is for **command-file Task spawns**, not orchestrator workers

## Public API

```js
const { captureSpawn, recordSpawnRow } = require('./bin/gsd-t-token-capture.cjs');

// Option A — callers that wrap a spawn callable
const { result, usage } = await captureSpawn({
  command: 'gsd-t-execute',
  step: 'Step 4',
  model: 'sonnet',
  description: 'domain: auth-service',
  projectDir: '.',
  spawnFn: async () => Task({...}),   // returns Claude result envelope
});

// Option B — callers that already have the result in hand
recordSpawnRow({
  projectDir: '.',
  command: 'gsd-t-execute',
  step: 'Step 4',
  model: 'sonnet',
  startedAt: '2026-04-21 10:00',
  endedAt: '2026-04-21 10:02',
  usage: result.usage,  // may be undefined — wrapper handles
  domain: 'auth',
  task: 'T-3',
  ctxPct: 42,
});
```
