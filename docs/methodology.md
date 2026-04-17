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

3. **User never types `/clear`.** _Historical framing — M35._ The runway estimator projected runs past 85% and auto-spawned headless continuations on refusal. M38 (v3.12.10) makes this structural rather than reactive: workflow commands go headless by default, so the interactive session never accumulates the context that would need a `/clear` in the first place.

4. **Data before optimization.** _Historical framing — M35, superseded by M38._ M35 ran per-spawn token telemetry (`.gsd-t/token-metrics.jsonl`, 18-field frozen schema) feeding a runway estimator and a detect-only token-optimizer at `complete-milestone`. M38 deletes this loop — the signal never produced action, and the structural fix (headless-by-default spawning) folds the work that would close the loop into the spawn decision itself.

5. **Clean break, no compat shim.** _Historical framing — M35's three-band model (normal < 70%, warn 70–85%, stop ≥ 85%) replaced v2.0.0's downgrade/conserve bands._ M38 (context-meter-contract v1.3.0) further collapses M35's three-band model to a single-band threshold — one threshold, one action (hand off to detached spawn).

**Structural guarantee.** M35's combination of 85% stop threshold + runway projection made native-compact structurally unreachable. M38 retains this guarantee via a different path: headless-by-default spawning resets context by design, so the projection machinery is no longer needed.

**Message content is never logged**: the meter writes only token counts, band names, and error category codes. Never transcript text, never API response bodies, never the API key itself. See `docs/architecture.md` for the full data-flow diagram and `.gsd-t/contracts/context-meter-contract.md` for the schema.

## From Runway-Protected Execution to Cross-Session Relay (M36)

M34 gave GSD-T a real measurement of how much context window each session had consumed. M35 used that signal to refuse starting new work that would exceed the 85% threshold, auto-spawning a detached headless process instead so the user never had to manually run `/clear`. Both milestones still had a ceiling: the headless continuation was a single shot — it ran one Claude session, and if the milestone wasn't complete when that session exhausted its context, a human had to intervene again to trigger the next continuation. Long-running milestones (multi-day builds, large waves) still required periodic human attention to keep the relay going.

M36 (v2.77.10) makes the relay automatic and indefinite. The unattended supervisor (`bin/gsd-t-unattended.js`) is a long-lived OS process, fully detached from any Claude Code terminal session, that drives the relay itself: it spawns a fresh `claude -p "/gsd-t-resume"` worker, waits for it to exit, reads the outcome, and immediately spawns the next worker — repeating until the milestone reaches COMPLETED status or a wall-clock cap is hit. Each worker gets a pristine context window. The `/compact` that inevitably fires in a long session is irrelevant because the *next* session has already started fresh. The supervisor IS the orchestrator of runway handoffs. Safety rails (`bin/gsd-t-unattended-safety.js`) prevent infinite-loop scenarios: gutter detection catches stall patterns, blocker sentinels catch unrecoverable errors, and iteration/hour caps ensure the machine doesn't run forever on a broken state. A cross-platform abstraction layer handles macOS sleep-prevention (`caffeinate`), Linux equivalents, and Windows limitations. From the user's perspective: invoke `/user:gsd-t-unattended`, walk away, and receive a native OS notification when the milestone is done — hours or days later.

The in-session watch loop (270-second `ScheduleWakeup` ticks, chosen to stay inside the 5-minute prompt-cache TTL) closes the feedback loop for users who keep a Claude session open. And the `gsd-t-resume` Step 0 auto-reattach means that even a `/clear` or accidental session close is transparent: the next resume detects the live supervisor and silently re-enters the watch loop without any manual step. Taken together, M34 + M35 + M36 form a complete three-layer system: measure the context accurately, refuse to degrade when it runs low, and relay execution automatically across as many fresh sessions as the work requires.

## From Universal Auto-Pause to Headless-by-Default (M38)

M37 added a Universal Auto-Pause Rule: when the Context Meter crossed a threshold, every session had to stop, pause, clear, and resume. The rule was MANDATORY and carried Destructive-Action-Guard weight. It was right about the symptom — interactive sessions hitting the 95% `/compact` wall lose work silently — and wrong about the elevation. A rule that shouts at the agent every few minutes is not a structural fix; it's a stricter version of the problem it tries to solve. The actual cause is that long-running work ever ran interactively in the first place. Once that's fixed, the meter has nothing to shout about.

M38 (v3.12.10) makes the fix structural: **headless-by-default spawning**. Workflow commands that reliably burn context (execute, wave, integrate, debug repair loops) route through the unattended supervisor from the start. The interactive session sees a launch banner and an event-stream log path, then exits. With `--watch`, the session keeps a live status block via 270s ScheduleWakeup ticks; without it, the session frees immediately and the user gets a macOS notification when work completes. The supervisor emits a JSONL event stream (`.gsd-t/events/YYYY-MM-DD.jsonl`) at every phase boundary, so the watch command, the dashboard, and any future consumer read the same record. The Context Meter collapses to a single band and a single action — hand off to a detached spawn at the threshold — because there's no longer a three-band degradation routing for it to feed. The Smart Router gains a conversational mode: when the user is thinking out loud ("help me think through this", "what are the trade-offs"), the router answers inline without spawning a command. The self-improvement loop (reflect, audit, optimization-apply, optimization-reject, qa-calibrator, token-optimizer) is deleted — it emitted signal that never produced action, and the work that would close the loop is folded into the spawn decision itself. **M37 right about symptom, wrong about elevation; M38 fixes cause.**
