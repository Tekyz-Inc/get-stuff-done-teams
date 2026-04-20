# Domain: d2-command-file-doc-ripple

## Responsibility

Wire every GSD-T command file that spawns a Task subagent (or any claude-in-claude child) through the D1 `captureSpawn` wrapper. Replace the scattered `T_START=$(date +%s)…` + `| … | N/A | …` row snippets with a single canonical pattern that calls `captureSpawn` / `recordSpawnRow` so real token usage is captured at every spawn site.

This is the mechanical blast-radius pass. D1 builds the pipe; D2 connects all 20 faucets to it.

## Owned Files/Directories

Every command file currently containing either a `T_START=$(date +%s)` block, a `token-log.md` append, or a Task subagent spawn instruction. Grep confirms 20 files in `commands/`:

- `commands/gsd-t-execute.md`
- `commands/gsd-t-quick.md`
- `commands/gsd-t-wave.md`
- `commands/gsd-t-scan.md`
- `commands/gsd-t-integrate.md`
- `commands/gsd-t-complete-milestone.md`
- `commands/gsd-t-verify.md`
- `commands/gsd-t-plan.md`
- `commands/gsd-t-status.md`
- `commands/gsd-t-prd.md`
- `commands/gsd-t-design-decompose.md`
- `commands/gsd-t-visualize.md`
- `commands/gsd-t-doc-ripple.md`
- `commands/gsd-t-health.md`
- `commands/gsd-t-init.md`
- `commands/gsd-t-init-scan-setup.md`
- `commands/gsd-t-debug.md`
- `commands/gsd-t-unattended.md`
- `commands/gsd-t-unattended-watch.md`
- `commands/gsd-t-help.md` (only if it shows a spawn example — otherwise skipped)

Plus the canonical template block in:

- `templates/CLAUDE-global.md` — Observability Logging section
- `/Users/david/projects/GSD-T/CLAUDE.md` — Observability Logging section (project-local copy of the template rule)

## NOT Owned (do not modify)

- `bin/gsd-t-token-capture.cjs` — D1's module; D2 **calls** it, doesn't change it
- `scripts/gsd-t-token-aggregator.js` — M40 D4's aggregator
- `bin/gsd-t-orchestrator.js` + `bin/gsd-t-orchestrator-worker.cjs` — already captures usage via stream-json sink (M40). D2 is the command-file path only.
- `test/` — unit tests for the wrapper are D1's; D2 verifies *call sites* via grep + snapshot

## Public API (consumption)

Every spawn site in a command file becomes one of two patterns:

**Pattern A — command executes a shell spawn and needs explicit capture** (kept for backwards compatibility with existing bash-style blocks, now routed through the wrapper):

```bash
node -e "
const { captureSpawn } = require('./bin/gsd-t-token-capture.cjs');
await captureSpawn({
  command: 'gsd-t-execute',
  step: 'Step 4',
  model: 'sonnet',
  description: 'domain: auth-service',
  projectDir: '.',
  domain: 'auth-service',
  task: 'T-3',
  spawnFn: async () => { /* actual Task() invocation */ },
});
"
```

**Pattern B — command already has the result envelope** (Task subagent already ran and returned):

```js
const { recordSpawnRow } = require('./bin/gsd-t-token-capture.cjs');
recordSpawnRow({
  projectDir: '.',
  command: 'gsd-t-verify',
  step: 'Step 4',
  model: 'haiku',
  startedAt: DT_START,
  endedAt: DT_END,
  usage: result.usage,
  domain: '-',
  task: '-',
  ctxPct: CTX_PCT,
  notes: 'test audit + contract review',
});
```

## Migration Rules

1. The legacy bash-only block (the one using `T_START=$(date +%s)` + direct `>>` append to `token-log.md` with `N/A` tokens) is **retired** in every file. Replace it with a reference to the wrapper block.
2. The canonical block in `templates/CLAUDE-global.md` and `CLAUDE.md` Observability Logging section is rewritten to document Pattern A/B above. Old bash snippet is deleted from both template and live file in the same commit.
3. No command file may ship a `| … | N/A | …` row format. The header `| Tokens |` column now always receives either `in=… out=… cr=… cc=… $X.XX` or `—` — never `N/A` and never `0`.
4. Commands that don't spawn subagents (pure flow-control files like `gsd-t-help.md`, `gsd-t-status.md` read-only paths) keep their existing non-spawn logging and are only touched to remove stale `N/A` token rows if present.
