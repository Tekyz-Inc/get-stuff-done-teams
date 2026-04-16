# Architecture Analysis — 2026-04-16 (Scan #11)

## Stack
- **Language**: JavaScript (Node.js >= 16)
- **Module systems**: Mixed CommonJS — `.js` and `.cjs` (paired files for many tools)
- **Package manager**: npm
- **Distribution**: npm package (`@tekyzinc/gsd-t` v3.11.11)
- **External dependencies**: ZERO runtime, ZERO devDependencies (deliberate constraint)
- **Test runner**: `node --test` (built-in)
- **Target environment**: Claude Code CLI as the host runtime (slash commands + hooks)

## Structure

```
bin/                     49 files (~19,931 LOC)   CLI installer + orchestration libs
  gsd-t.js               main CLI (install, update, init, status, doctor, headless, metrics, graph, ...)
  orchestrator.js        abstract phase/gate engine
  design-orchestrator.js design-build pipeline (uses orchestrator)
  graph-*.js             M20/M21 Code Graph (indexer/store/query/cgc/parsers/overlay)
  scan-*.js              scan data collection, schema extraction, diagrams, report
  gsd-t-unattended*.{js,cjs}     M36 detached supervisor (paired esm-ish/.cjs)
  context-meter-config.cjs       Config loader (.cjs to be require()-able from hook)
  token-budget.cjs       getSessionStatus() — primary context-burn signal
  token-telemetry*.{js,cjs}      18-field per-spawn telemetry (M35)
  model-selector.js      Per-phase model picker (M35)
  runway-estimator*.{js,cjs}     Pre-flight runway estimate (M35)
  headless-auto-spawn*.{js,cjs}  Headless dispatch surface
  handoff-lock.{js,cjs}  Parent/child handoff primitive
  rule-engine.js         Stack rules injector
  qa-calibrator.js, component-registry.js, debug-ledger.js, advisor-integration.js,
  metrics-collector.js, metrics-rollup.js, archive-progress.cjs,
  patch-lifecycle.js, scan-export.js, scan-renderer.js, ...

scripts/                 ~5,837 LOC               runtime scripts (hooks + dashboards + helpers)
  gsd-t-context-meter.js          PostToolUse hook entry (M34/v3.11.11 local estimator)
  context-meter/                  helper modules (estimate-tokens, threshold, transcript-parser + tests)
  gsd-t-dashboard-server.js       SSE metrics dashboard (port 7433, wired into CLI/README)
  gsd-t-dashboard.html            (UI for above)
  gsd-t-agent-dashboard-server.js NEW — Agent topology dashboard (port 7434) — UNWIRED (see Quality)
  gsd-t-agent-dashboard.html      NEW — UI for agent topology — UNWIRED
  gsd-t-design-review-server.js   Two-terminal proxy for design build/review
  gsd-t-design-review.html, gsd-t-design-review-inject.js
  gsd-t-statusline.js, gsd-t-heartbeat.js, gsd-t-event-writer.js,
  gsd-t-fetch-version.js, gsd-t-update-check.js, npm-update-check.js,
  gsd-t-auto-route.js, gsd-t-tools.js, gsd-t-dashboard-mockup.html

commands/                61 files (~14,663 LOC)   slash commands (markdown is "source")
  gsd-t-*.md             56 GSD-T workflow commands
  gsd.md, branch.md, checkin.md, Claude-md.md, global-change.md (5 utility)

templates/               29 files (~9,890 LOC)
  CLAUDE-global.md, CLAUDE-project.md, requirements.md, architecture.md,
  workflows.md, infrastructure.md, progress.md, backlog.md, backlog-settings.md,
  context-meter-config.json, design-contract.md, element-contract.md,
  page-contract.md, widget-contract.md, shared-services-contract.md,
  design-chart-taxonomy.md, prompts/
  stacks/                28 stack rule packs (auth+security universal + 26 stack-specific)

test/                    38 files (~13,694 LOC)   node --test suite
  + scripts/context-meter/*.test.js + scripts/gsd-t-context-meter.test.js +
    scripts/gsd-t-context-meter.e2e.test.js + bin/context-meter-config.test.cjs

docs/                    16 files                 living docs + analyses + PRDs
  requirements.md, architecture.md, workflows.md, infrastructure.md (the 4 living docs),
  GSD-T-README.md, methodology.md, prd-graph-engine.md, prd-gsd2-hybrid.md,
  prd-harness-evolution.md, harness-design-analysis.md,
  context-budget-recovery-plan.md, framework-comparison-scorecard.md,
  neo4j-setup.md, unattended-config.md, unattended-windows-caveats.md, ci-examples/

.gsd-t/                  state directory          (own dogfooding)
  contracts/             40 contracts             interface specs
  domains/               domain scopes
  milestones/            archived completed milestones
  scan/                  this scan's outputs
```

## Data Flow

### 1. User invokes a slash command (`/user:gsd-t-execute`)
- Claude Code reads `commands/gsd-t-execute.md` and follows the markdown procedure.
- Command may spawn Task subagents, run Bash to call `bin/*.js` helpers, write to `.gsd-t/`.

### 2. CLI tool (`npx @tekyzinc/gsd-t <subcmd>`)
- `bin/gsd-t.js` is the entry. Subcommands: `install`, `update`, `update-all`, `init`,
  `status`, `doctor`, `headless`, `metrics`, `graph`, `uninstall`, etc.
- Reads/writes `~/.claude/commands/`, `~/.claude/CLAUDE.md`, project `.gsd-t/`.

### 3. Hooks (PostToolUse → Context Meter)
- Claude Code calls `scripts/gsd-t-context-meter.js` after each tool use.
- Hook reads transcript → `parseTranscript()` → `estimateTokens()` (LOCAL, chars/3.5) →
  `bandFor(pct)` → writes `.gsd-t/.context-meter-state.json` → emits `additionalContext`
  (mandatory STOP message at >=75% per v1.2.0).
- `bin/token-budget.cjs` `getSessionStatus()` reads the state file as the authoritative
  context-pressure signal for command-file gates.

### 4. Telemetry / Metrics
- `bin/metrics-collector.js` + `bin/metrics-rollup.js` aggregate `.gsd-t/events/*.jsonl`
  and `heartbeat-*.jsonl` into `.gsd-t/metrics/`.
- `scripts/gsd-t-dashboard-server.js` serves SSE on port 7433.
- `bin/token-telemetry.{js,cjs}` writes per-spawn 18-field rows to `.gsd-t/token-metrics.jsonl`.

### 5. Unattended Supervisor (M36)
- `bin/gsd-t-unattended.js` (lifecycle) + `gsd-t-unattended-platform.js` (cross-platform
  process spawn / sleep prevention / notifications) + `gsd-t-unattended-safety.js` (gutter,
  blocker detection, branch guards). Detached process drives `claude -p` worker relay.
- State in `.gsd-t/.unattended/`.

### 6. Code Graph (M20/M21)
- `bin/graph-indexer.js` walks the project, parses with `graph-parsers.js`, persists to
  `bin/graph-store.js` → `.gsd-t/graph/`.
- `bin/graph-cgc.js` runs `tree-sitter` via spawned binary for AST-level parsing.
- `bin/graph-query.js` answers queries (`findDeadCode`, `findDuplicates`, etc.).

## State Management
- **Persistent**: `.gsd-t/` per-project (progress, contracts, milestones, events, metrics,
  graph, scan outputs).
- **Hook session**: `.gsd-t/.context-meter-state.json` (5-min freshness window).
- **Unattended supervisor**: `.gsd-t/.unattended/{state.json, supervisor.pid, run.log}`.
- **Cross-project registry**: `~/.claude/.gsd-t-projects.json` (project list for update-all).
- **Versioning**: `.gsd-t/progress.md` Header line + `package.json` for the package itself.

## Configuration
- `~/.claude/settings.json` — Claude Code settings, hook registration.
- `.gsd-t/context-meter-config.json` — threshold/checkFrequency/timeoutMs.
- `.gsd-t/.unattended/config.json` — supervisor config.
- `.gsd-t/backlog-settings.md` — backlog taxonomy.
- Env: post-v3.11.11, **no env var is required at runtime**. `ANTHROPIC_API_KEY` is now
  optional (used only by `bin/runway-estimator.js` and the legacy install prompt — see
  TD candidate "stale ANTHROPIC_API_KEY references").

## Patterns Observed
- **Markdown-as-source**: command files are the canonical workflow definition; agents
  follow them step-by-step. JS helpers are leaf utilities the markdown references.
- **Paired `.js` / `.cjs` files** for tools that must be `require()`d from hooks
  (which run as plain CommonJS) and also from main CLI. (Examples: `token-budget`,
  `runway-estimator`, `token-telemetry`, `headless-auto-spawn`, `handoff-lock`,
  `gsd-t-unattended-*`.) Cost: drift risk if one half is updated and the other isn't.
- **Zero-dependency stance**: all bin/scripts use only Node built-ins. Reduces supply-chain
  risk, avoids version conflicts in the consumer environment.
- **Fail-open hooks**: PostToolUse hook never throws and never exits non-zero; on any
  failure it returns `{}`. Documented invariant in `gsd-t-context-meter.js`.
- **Contract-driven**: 40 interface contracts in `.gsd-t/contracts/` — each domain consumes
  contracts from its dependencies and publishes its own.
- **Three-band context gate** (M35): `normal` (<70%) / `warn` (70–85%) / `stop` (>=85%) —
  no silent quality degradation.

## Architecture Concerns

1. **Two parallel dashboard implementations.** `scripts/gsd-t-dashboard-server.js`
   (port 7433, wired into CLI + commands + README) AND a new
   `scripts/gsd-t-agent-dashboard-server.js` (port 7434) + `gsd-t-agent-dashboard.html`
   that are checked into git but not referenced by any command, CLI subcommand, or doc.
   Either it's dead code, or the wiring step was missed.

2. **CLAUDE.md (project) drift after M34/M37.** Project `CLAUDE.md` still describes the
   retired `bin/task-counter.cjs` proxy as the "real guard" with sample bash for
   `should-stop`/`increment task` — the file was removed in M34 (v2.75.10). The live
   commands (`gsd-t-execute.md`, `gsd-t-wave.md`) no longer reference it.

3. **Stale `ANTHROPIC_API_KEY` references after v3.11.11.** v3.11.11 (this morning)
   replaced the count_tokens API with a local estimator. README, docs/architecture.md,
   docs/infrastructure.md, docs/requirements.md, docs/methodology.md, CHANGELOG, several
   contracts, and ~3 command files still document the API key as required and instruct
   users to set it. Doctor was updated; user-facing docs were not.

4. **Heartbeat JSONL pollution.** 76 `heartbeat-*.jsonl` files live in `.gsd-t/`
   (not git-tracked — gitignored — but cluttering the working tree). These are
   session-scoped and should be cleaned up on session end or rotated into a subdirectory.

5. **18+ brainstorm/continue-here/M3*-spike-findings docs in `.gsd-t/` root.** Working
   notes accumulate; nothing prunes them. Compare to `progress-archive/` and
   `milestones/` which already have proper homes.

6. **`scripts/context-meter/` lives outside `bin/`** despite being pure library code that
   the hook consumes — a holdover from M34 where the hook itself was the only consumer.
   Now `bin/token-budget.cjs` indirectly depends on the same shape via the state file.
   Worth considering a move to `bin/context-meter/` for consistency.

7. **Test layout split**: most tests in `test/`, but the context-meter unit/e2e tests
   live in `scripts/` next to the code. Two test discovery roots → easy to forget one
   when running scoped subsets.
