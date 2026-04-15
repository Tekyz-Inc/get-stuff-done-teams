# GSD-T Methodology

## Evolution from GSD to GSD-T

GSD (Get Stuff Done) was a structured methodology for Claude Code that organized work into Milestones → Phases → Waves with living documentation. It worked well for solo sessions but had limitations:

- **No parallelism**: Single agent, sequential execution
- **Context loss**: Long sessions would lose track of decisions
- **No explicit interfaces**: Components interacted through implicit assumptions
- **Documentation drift**: Docs fell out of sync with code

GSD-T addresses all of these by adding:

1. **Contracts** — Explicit interfaces between domains that serve as the single source of truth
2. **Domain isolation** — Each domain owns specific files with no overlap
3. **Checkpoints** — Cross-domain dependencies are explicit gates
4. **Agent Teams support** — Parallel execution when beneficial
5. **Pre-Commit Gate** — Mandatory documentation checklist on every commit
6. **Document Ripple** — Changes cascade to all affected docs automatically

## Core Concepts

### Contracts

A contract is a documented interface between two or more domains. It specifies:
- Data shapes (request/response types, database schemas)
- Endpoint signatures (HTTP methods, paths, auth requirements)
- Component interfaces (props, events, callbacks)
- Error handling (error shapes, status codes)

Contracts are stored in `.gsd-t/contracts/` and are the single source of truth. If code and contract disagree, one must be fixed.

### Domains

A domain is an independent area of responsibility within a milestone. Each domain:
- Has a clear responsibility (auth, data-layer, ui, etc.)
- Owns specific files — no overlap with other domains
- Can be worked on independently once contracts are defined
- Has well-defined inputs and outputs at its boundaries

### Checkpoints

Checkpoints are explicit gates in the dependency graph. When a checkpoint is reached:
1. Execution of blocked tasks stops
2. The lead verifies the implemented code matches the contract
3. If compliant, downstream tasks are unblocked
4. If not, the deviation is fixed before proceeding

### Pre-Commit Gate

A mandatory checklist that runs before every commit:
- Did I change an API? → Update api-contract.md
- Did I change the schema? → Update schema-contract.md
- Did I add files? → Update scope.md
- Did I implement a requirement? → Update requirements.md
- etc.

This prevents the most common problem: code shipping without documentation updates.

## When to Use Each Entry Point

| Situation | Command | What happens |
|-----------|---------|-------------|
| New idea, nothing built | `gsd-t-project` | Vision → milestone roadmap → ready to partition |
| Existing codebase, adding major feature | `gsd-t-feature` | Impact analysis → feature milestones → partition |
| Existing codebase, need to understand/clean up | `gsd-t-scan` | 5-dimension analysis → techdebt.md → promotable |
| Already have milestones defined | `gsd-t-milestone` | Define one milestone → partition → execute |
| Just need to do something quick | `gsd-t-quick` | Fast task with contract respect |

## Solo vs Team Decision

Teams burn tokens fast. Use them strategically:

**Use teams when:**
- 3+ truly independent domains
- Complex design decisions with multiple valid approaches
- Large verification across many dimensions
- Debugging cross-domain issues where multiple hypotheses need parallel testing

**Stay solo when:**
- < 8 total tasks
- Domains are tightly coupled
- Planning (always — need full cross-domain context)
- Integration (always — need to see all seams)
- The task is straightforward

## Context Awareness: From Proxy to Real Measurement (M34)

GSD-T has always needed a reliable signal for "how much of the context window is consumed right now" so the orchestrator can decide whether to continue, pause, or hand off to a headless continuation. The journey to real measurement is instructive:

1. **v1.0 era — env var check.** Early GSD-T read `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` environment variables, assuming Claude Code exported them. It does not. The check was always inert — `pct` was effectively zero forever, and the stop gate never fired. The first symptom was not a crash, it was silent context exhaustion leading to mid-session compaction.

2. **v2.74.12 — task-counter proxy.** To patch the regression, `bin/task-counter.cjs` tracked the number of tasks completed since the last `/clear` and assumed a linear correspondence between task count and context percentage (e.g., 5 tasks ≈ 80%). This was better than nothing but fundamentally a proxy — it could not distinguish a task that read three files from a task that ran a full-project grep and a Playwright suite.

3. **v2.75.10 (M34) — real measurement.** The Context Meter PostToolUse hook streams the current transcript to the Anthropic `count_tokens` API after every tool call and writes the exact `input_tokens` count to `.gsd-t/.context-meter-state.json`. `bin/token-budget.js` `getSessionStatus()` reads that state file as the authoritative signal. Proxies are retired.

**Why this matters**: Opus-primary sessions compound context risk (larger system prompts, deeper reasoning, longer tool outputs). A proxy with ±20% error is fine for an undercommitted Sonnet session but causes silent compaction on a busy Opus session. Real measurement is the only durable fix.

**Fail-open principle**: the meter hook never blocks tool calls or crashes Claude Code. Every failure mode (missing API key, network error, malformed transcript, rate limit) catches and writes a partial state file with `lastError.code` set. The orchestrator treats a missing or stale state file as "fall back to heuristic" rather than "stop immediately" — the user never loses work to a meter hiccup.

## From Silent Degradation to Aggressive Pause-Resume (M35)

Between v2.74 and v2.75, GSD-T attempted to cope with context pressure through **graduated degradation** — downgrading subagent models (opus→sonnet, sonnet→haiku), checkpointing early, skipping "non-essential" phases (Red Team, doc-ripple, Design Verify). The idea was well-intentioned: burn less context, finish more work before hitting the runtime's native compact at 95%.

**It was the wrong framing.** Degradation is invisible to the user: a task that silently dropped from opus to haiku still reports "completed," and a skipped Red Team pass still looks like a green wave. Several regressions showed up where bugs made it through QA because Red Team had been silently skipped under context pressure, and where cross-module refactors made on haiku introduced subtle type errors that opus would have caught. The quality floor had become conditional on context pressure — a load-bearing invariant that the user could not see or control.

**M35 (v2.76.10) replaces graduated degradation with aggressive pause-resume.** The core principles:

1. **Quality is non-negotiable.** No phase is "non-essential." No model is downgraded under pressure. Red Team, doc-ripple, and Design Verify always run at their designated tier. If a task can't fit, the task pauses — it does not degrade.

2. **Explicit per-phase model selection.** `bin/model-selector.js` carries a declarative rules table with ≥13 phase mappings. Complexity signals (`cross_module_refactor`, `security_boundary`, `data_loss_risk`, `contract_design`) escalate sonnet→opus at plan time. Each command file carries a `## Model Assignment` block documenting its assignments. Model choice is now a plan-time decision, not a runtime pressure response.

3. **User never types `/clear`.** When the runway estimator (`bin/runway-estimator.js`) projects a run would cross 85% context, the command refuses to start — then auto-spawns a detached headless continuation via `bin/headless-auto-spawn.js`. The interactive session sees a single ⛔ banner and exits cleanly. The user gets a macOS notification when the headless run finishes and a read-back banner on the next `gsd-t-resume` or `gsd-t-status` call.

4. **Data before optimization.** Per-spawn token telemetry (`.gsd-t/token-metrics.jsonl`, 18-field frozen schema) is the raw material. The runway estimator reads historical consumption to project future runs. The token optimizer (`bin/token-optimizer.js`) runs at `complete-milestone` and appends retrospective recalibration recommendations to `.gsd-t/optimization-backlog.md`. Recommendations are **never auto-applied** — the user promotes or rejects deliberately. Tier calibration is a data-driven human decision, not a runtime heuristic.

5. **Clean break, no compat shim.** The v2.0.0 `token-budget-contract.md` defined `downgrade` and `conserve` bands with `modelOverrides` and `skipPhases` fields. v3.0.0 drops all of it. The contract is a clean three-band model (`normal` < 70%, `warn` 70–85%, `stop` ≥ 85%) and the response object is just `{band, pct, message}`. No backwards-compat translation layer — the old API is gone.

**Structural guarantee.** Because `STOP_THRESHOLD_PCT = 85` and the runway estimator refuses runs that would project past 85%, the runtime's 95% native compact is now structurally unreachable under healthy operation. `halt_type: native-compact` in `.gsd-t/token-metrics.jsonl` is a defect signal — if it appears, the estimator needs re-tuning.

**Message content is never logged**: the meter writes only token counts, band names, and error category codes. Never transcript text, never API response bodies, never the API key itself. See `docs/architecture.md` for the full data-flow diagram and `.gsd-t/contracts/context-meter-contract.md` for the schema.
