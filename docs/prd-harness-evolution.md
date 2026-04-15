# PRD: Harness Evolution — Self-Calibrating Quality Infrastructure

## Document Info
| Field             | Value                                                                 |
|-------------------|-----------------------------------------------------------------------|
| **PRD ID**        | PRD-HARNESS-001                                                       |
| **Date**          | 2026-04-01                                                            |
| **Author**        | GSD-T Team                                                            |
| **Status**        | DRAFT                                                                 |
| **Milestones**    | M31 (Tier 1), M32 (Tier 2), M33 (Tier 3)                             |
| **Version Target**| 2.52.10 (M31), 2.53.10 (M32), 2.54.10 (M33)                         |
| **Priority**      | P0 — framework self-improvement and quality convergence               |
| **Predecessor**   | M30 (Stack Rules Engine), M26 (Rule Engine + Patch Lifecycle), M29 (Debug Loop) |
| **Successor**     | Production quality parity with human-curated codebases                |
| **Related**       | PRD-GSD2-001 (M22-M24), PRD-GRAPH-001 (M20-M21)                     |

---

## Revision History

| Date       | Version | Changes                |
|------------|---------|------------------------|
| 2026-04-01 | v1      | Initial DRAFT — 6 enhancements across 3 tiers |
| 2026-04-01 | v2      | Added token-constraint analysis: enhancement 3.7 (token-aware orchestration), 3.8 (model tier refinement), updated risk/success metrics |

---

## 1. Problem Statement

GSD-T's quality infrastructure has grown significantly through M25-M30: telemetry collection, declarative rule engine, patch lifecycle, Red Team adversarial QA, stack rules, and compaction-proof debug loops. These components are individually effective, but five structural gaps prevent them from reaching their full potential:

1. **Framework bloat without pruning** — GSD-T only grows, never sheds. Every milestone adds new checks, rules, and enforcement mechanisms to subagent prompts. There is no mechanism to determine whether a component (Red Team, stack rules, observability logging) is still earning its keep. A component that added value at M26 may be pure overhead at M35, consuming precious context tokens without preventing real failures.

2. **Static QA prompts** — The QA subagent prompt is frozen at the text written during its creation. Red Team regularly finds bugs that QA missed, but this signal is never fed back to improve QA's detection capability. The rule engine (M26) and ELO system (M25) exist but are not connected to QA calibration. QA's miss rate is measurable but not actionable.

3. **Procedural prompts without quality vision** — Every subagent prompt is purely procedural: "do X, check Y, report Z." Research on long-running AI harnesses shows that injecting an aspirational quality statement (a "quality persona") shifts output quality more effectively than adding more procedural checks. A phrase like "museum-quality code" or "production-ready from line one" changes the agent's default quality threshold. GSD-T has no mechanism for this.

4. **Aesthetic drift in UI-heavy projects** — When GSD-T executes UI tasks, each subagent makes independent aesthetic decisions. Task 1 might pick rounded corners and soft shadows, Task 3 might use sharp borders and flat design. Contracts define functional interfaces but not visual language. There is no design brief artifact that flows through execution like contracts do.

5. **Scripted-only test evaluation** — QA and Red Team agents can only evaluate through scripted Playwright assertions. They cannot interactively explore the application the way a human tester would — clicking around, trying unexpected flows, observing visual glitches. The article's evaluator harness found issues through dynamic interaction that scripted tests missed entirely.

6. **Fixed iteration budget** — GSD-T hardcodes "2 fix attempts" before escalating to the headless debug loop. Research shows that 5-15 iterations drive convergence to significantly better quality for complex tasks. The current budget is one-size-fits-all: simple tasks get 2 attempts (enough), complex tasks get 2 attempts (not enough), and the headless debug loop is a heavyweight escalation that disrupts the normal execution flow.

**Root cause**: GSD-T was designed as a *methodology* that prescribes process. It now needs to become a *self-calibrating system* that measures its own component effectiveness, tunes its quality signals based on outcomes, and adapts its iteration depth to task complexity.

---

## 2. Objective

Evolve GSD-T from a static methodology framework into a self-calibrating quality system across 6 enhancements in 3 tiers.

**Primary goals** (in priority order):
1. **Self-awareness** — GSD-T can measure whether its own components add value, and disable ones that don't
2. **Closed-loop QA** — QA miss rates feed back into QA prompt tuning automatically
3. **Quality culture** — Subagent prompts carry a project-level quality aspiration, not just procedural rules
4. **Aesthetic coherence** — UI projects get a design brief that flows through execution like contracts
5. **Exploratory evaluation** — QA/Red Team can interact with running applications, not just run scripts
6. **Adaptive iteration** — Iteration budgets scale with task complexity, not a fixed constant
7. **Token-budget awareness** — On a token-limited plan ($200 Max), the orchestrator must manage session-level token consumption to prevent mid-milestone exhaustion

**Core principle**: Every quality mechanism must prove its value through measurable outcomes. Components that cannot demonstrate impact are candidates for removal, not preservation.

**Operational constraint**: GSD-T runs on Claude's $200 Max plan, where tokens are a hard daily/weekly ceiling — not a variable cost. Running out mid-milestone is a workflow-breaking event. All enhancements must be designed with token conservation as a first-class concern.

---

## 3. Enhancements

### 3.1 Harness Audit Capability (HIGH PRIORITY — Tier 1)

**Problem**: The framework accumulates enforcement mechanisms (Red Team, stack rules, observability logging, E2E enforcement, doc-ripple checks) but has no way to determine if they are still earning their context-token cost. Over time, the aggregate prompt overhead may exceed the value delivered.

**Solution**: A `gsd-t-audit` command and supporting infrastructure that stress-tests GSD-T's own components by selectively disabling them and comparing outcomes.

**Mechanism**:
1. **Component registry** — A structured file (`.gsd-t/component-registry.jsonl`) listing every enforcement mechanism: name, injection point (which command files), approximate token cost (lines of prompt text), date added, last measured impact.
2. **Audit mode** — `gsd-t-audit` runs a milestone's worth of tasks twice: once with all components active (control), once with a target component disabled (experiment). Compares: bugs caught, test pass rates, rework cycles, and time-to-completion.
3. **Shadow mode** — For components that can't be cleanly disabled (like the pre-commit gate), audit mode runs them in "shadow" — the check executes but its result is logged, not enforced. This measures whether it would have caught something without blocking execution.
4. **Cost/benefit ledger** — `.gsd-t/metrics/component-impact.jsonl` tracks per-component: token cost per invocation, bugs prevented (from QA/Red Team logs), false positives generated, context % consumed. Components with cost > benefit for 3+ milestones are flagged for deprecation review.
5. **Integration with rule engine** — Components flagged for deprecation become candidates in the patch lifecycle (M26). A "disable component X" patch follows the same candidate -> measured -> promoted -> graduated flow.

**Files affected**:
- NEW: `commands/gsd-t-audit.md` — audit command (new command, count goes to 52)
- NEW: `.gsd-t/component-registry.jsonl` template
- MODIFY: `bin/gsd-t.js` — command count update
- MODIFY: `commands/gsd-t-complete-milestone.md` — component impact evaluation in distillation step
- MODIFY: `templates/CLAUDE-global.md`, `commands/gsd-t-help.md`, `README.md`, `GSD-T-README.md` — command reference updates

**Success criteria**:
- [ ] Component registry lists all enforcement mechanisms with token cost estimates
- [ ] `gsd-t-audit` can disable a named component and run comparison tasks
- [ ] Shadow mode logs enforcement results without blocking execution
- [ ] Cost/benefit ledger accumulates per-milestone impact data
- [ ] Components with 3+ milestones of negative ROI are flagged in `gsd-t-status`
- [ ] Flagged components enter the patch lifecycle as deprecation candidates

**Acceptance test**: Run `gsd-t-audit --component=red-team` on a small milestone. Verify the audit produces a comparison report showing bugs caught vs. context tokens consumed, and the result is persisted in `component-impact.jsonl`.

---

### 3.2 QA Calibration Feedback Loop (HIGH PRIORITY — Tier 1)

**Problem**: QA subagent prompts are static text. Red Team finds bugs that QA missed, but this signal is discarded. The rule engine (M26) and ELO system (M25) exist but are not connected to QA prompt tuning.

**Solution**: Wire Red Team miss-rate data back into QA prompt generation, creating a closed-loop calibration system.

**Mechanism**:
1. **Miss-rate tracking** — After Red Team completes, compare its findings against QA's report. Bugs found by Red Team but missed by QA are logged to `.gsd-t/metrics/qa-miss-log.jsonl` with category tags (contract violation, boundary input, state transition, error path, missing flow, regression, E2E gap).
2. **Category aggregation** — `bin/qa-calibrator.js` reads `qa-miss-log.jsonl` and computes miss rates per category across milestones. Categories with miss rates > 30% are "weak spots."
3. **Dynamic QA prompt injection** — During `gsd-t-execute` Step 2 (QA subagent spawn), the orchestrator calls `qa-calibrator.js` to get current weak spots. These are injected into the QA prompt as priority focus areas: "PRIORITY: Your historical miss rate for {category} is {N}%. Pay extra attention to: {specific patterns from miss log}."
4. **Calibration rules** — Weak spots that persist for 3+ milestones generate a rule engine candidate patch that adds a permanent check to the QA prompt template. Weak spots that drop below 10% miss rate for 2+ milestones have their priority injection removed.
5. **ELO integration** — QA miss rates factor into the process ELO calculation. A milestone with high QA miss rates gets a lower ELO delta, incentivizing the system toward better first-pass QA detection.

**Files affected**:
- NEW: `bin/qa-calibrator.js` — miss-rate aggregation and weak-spot detection
- MODIFY: `commands/gsd-t-execute.md` — inject weak spots into QA subagent prompt
- MODIFY: `commands/gsd-t-quick.md` — same injection for inline QA
- MODIFY: `commands/gsd-t-integrate.md` — same injection for integration QA
- MODIFY: `templates/CLAUDE-global.md` — document QA calibration in QA Agent section
- MODIFY: `bin/metrics-rollup.js` — incorporate QA miss rates into ELO calculation

**Success criteria**:
- [ ] Red Team findings not in QA report are logged to `qa-miss-log.jsonl` with category tags
- [ ] `qa-calibrator.js` computes per-category miss rates and identifies weak spots (>30%)
- [ ] QA subagent prompts include dynamic weak-spot injections during execute
- [ ] Weak spots persisting 3+ milestones generate rule engine candidate patches
- [ ] Weak spots dropping below 10% for 2+ milestones have injections removed
- [ ] QA miss rate is reflected in process ELO calculation

**Acceptance test**: After a Red Team run that finds 2 boundary-input bugs QA missed, verify `qa-miss-log.jsonl` contains the entries, `qa-calibrator.js` reports boundary-input as a weak spot, and the next QA subagent spawn includes the priority injection.

---

### 3.3 Quality North Star Injection (MEDIUM PRIORITY — Tier 2)

**Problem**: Every subagent prompt is procedural. Research shows that an aspirational quality statement ("quality persona") shifts output quality more effectively than adding procedural checks. GSD-T has no mechanism for project-level quality aspiration.

**Solution**: A configurable quality persona that gets prepended to every subagent prompt, set once during `gsd-t-init` or `gsd-t-setup` and stored in project CLAUDE.md.

**Mechanism**:
1. **Quality persona field** — A new section in the project CLAUDE.md template: `## Quality North Star`. Contains a 1-3 sentence aspirational quality statement. Examples: "Museum-quality code — every function reads like it was written for a textbook", "Production-ready from line one — no TODOs, no shortcuts, no 'fix later'", "Enterprise-grade reliability — every error path is handled, every edge case is tested."
2. **Default personas** — `gsd-t-init` offers 3 preset personas based on project type detection:
   - **Library/package**: "This code will be read by thousands of developers. Every public API must be self-documenting, every edge case must be handled, every error message must be actionable."
   - **Web application**: "Every user interaction must feel instant, every error must be recoverable, every page must be accessible. Ship quality a designer would screenshot."
   - **CLI tool**: "Every command must complete in under 2 seconds, every error must suggest a fix, every flag must have a help string. The --help output is the product."
   - **Custom**: User writes their own statement.
3. **Injection point** — The quality persona is prepended to every subagent prompt (execute, quick, debug, integrate, wave) immediately before the task-specific instructions. It sits above procedural checks, framing the agent's quality default before any rules are read.
4. **Stack rule integration** — Quality persona is injected before stack rules, so the aspirational statement colors how the agent interprets and applies the rules.

**Files affected**:
- MODIFY: `templates/CLAUDE-project.md` — add Quality North Star section with placeholder
- MODIFY: `commands/gsd-t-init.md` — persona selection during init
- MODIFY: `commands/gsd-t-setup.md` — persona configuration
- MODIFY: `commands/gsd-t-execute.md` — inject persona into subagent prompt
- MODIFY: `commands/gsd-t-quick.md` — same injection
- MODIFY: `commands/gsd-t-debug.md` — same injection
- MODIFY: `commands/gsd-t-integrate.md` — same injection
- MODIFY: `commands/gsd-t-wave.md` — same injection
- MODIFY: `templates/CLAUDE-global.md` — document the feature

**Success criteria**:
- [ ] CLAUDE-project.md template includes Quality North Star section
- [ ] `gsd-t-init` prompts for or auto-selects a quality persona
- [ ] Quality persona is prepended to all subagent prompts (execute, quick, debug, integrate, wave)
- [ ] Persona injection occurs before stack rules and procedural checks
- [ ] Projects without a persona skip injection silently (backward compatible)

**Acceptance test**: Set persona to "Museum-quality code" in CLAUDE.md. Run `gsd-t-execute` on a task. Verify the subagent prompt starts with the persona statement before any procedural instructions.

---

### 3.4 Design Brief Artifact (MEDIUM PRIORITY — Tier 2)

**Problem**: UI-heavy projects suffer aesthetic drift when different execution subagents make independent visual decisions per task. Contracts define functional interfaces (component props, API shapes) but not visual language (colors, spacing, typography, interaction patterns).

**Solution**: A design brief artifact generated during `gsd-t-partition` or `gsd-t-plan` that flows into execute subagents alongside contracts.

**Mechanism**:
1. **Design brief detection** — During `gsd-t-partition`, if any domain contains UI/frontend tasks (detected by: React/Vue/Svelte/Flutter in stack, component files in scope, CSS/styling files), prompt generation of a design brief.
2. **Design brief structure** — `.gsd-t/contracts/design-brief.md`:
   - **Color palette**: Primary, secondary, accent, background, text colors with hex values
   - **Typography**: Font families, size scale, weight usage
   - **Spacing system**: Base unit, scale (4px, 8px, 12px, 16px, 24px, 32px, 48px)
   - **Component patterns**: Border radius, shadow levels, hover/active states, transition durations
   - **Layout principles**: Grid system, breakpoints, container widths
   - **Interaction patterns**: Loading states, error states, empty states, success feedback
   - **Tone**: Formal/casual, dense/spacious, minimal/rich
3. **Injection** — Design brief is injected into subagent prompts for UI-related tasks (same injection point as contracts). Non-UI tasks skip it.
4. **Sources** — If the project already has a design system (Tailwind config, theme file, Storybook), the brief is derived from existing sources. If none exist, the brief is generated from the quality persona + project type.
5. **Existing project support** — `gsd-t-setup` can generate a design brief for an existing project by analyzing current CSS/theme files.

**Files affected**:
- MODIFY: `commands/gsd-t-partition.md` — design brief detection and generation step
- MODIFY: `commands/gsd-t-plan.md` — reference design brief in UI task descriptions
- MODIFY: `commands/gsd-t-execute.md` — inject design brief for UI tasks
- MODIFY: `commands/gsd-t-quick.md` — same injection for quick UI tasks
- MODIFY: `commands/gsd-t-setup.md` — design brief generation for existing projects
- NEW: Template section in `templates/CLAUDE-project.md` referencing design brief convention

**Success criteria**:
- [ ] `gsd-t-partition` detects UI-heavy domains and triggers design brief generation
- [ ] Design brief is stored in `.gsd-t/contracts/design-brief.md`
- [ ] Design brief is injected into subagent prompts for UI-related tasks only
- [ ] Non-UI tasks do not receive design brief injection
- [ ] Existing Tailwind/theme configs are parsed to pre-populate the brief
- [ ] Projects without UI domains skip design brief entirely (no overhead)

**Acceptance test**: Partition a milestone with a React frontend domain. Verify `design-brief.md` is generated with color palette and component patterns. Execute a UI task and verify the subagent prompt includes the design brief. Execute a backend task and verify it does not.

---

### 3.5 Evaluator Interactivity (MEDIUM PRIORITY — Tier 2)

**Problem**: QA and Red Team agents evaluate through scripted Playwright assertions only. They cannot explore the running application dynamically — clicking unexpected paths, trying edge-case inputs, observing visual rendering. Scripted tests verify known requirements; exploratory testing finds unknown bugs.

**Solution**: Give QA and Red Team agents access to Playwright MCP for interactive browser testing beyond their scripted assertions.

**Mechanism**:
1. **MCP detection** — Before spawning QA/Red Team subagents, check if Playwright MCP server is registered in Claude Code settings (`.claude/settings.local.json` or global settings). If available, include MCP access instructions in the subagent prompt.
2. **Exploratory testing prompt** — After scripted tests pass, the QA/Red Team subagent receives an additional instruction block:
   ```
   "You have access to Playwright MCP for interactive browser testing.
   After scripted tests pass, spend up to 3 minutes exploring:
   - Navigate to every route in the application
   - Try unexpected inputs in every form field
   - Click UI elements in unexpected order
   - Resize the browser to test responsive behavior
   - Check console for errors after each action
   Report any issues found as EXPLORATORY findings (separate from scripted test results)."
   ```
3. **Time budget** — Exploratory testing has a configurable time budget (default: 3 minutes for QA, 5 minutes for Red Team). This prevents runaway exploration while allowing meaningful coverage.
4. **Finding classification** — Exploratory findings are tagged `[EXPLORATORY]` in qa-issues.md and red-team-report.md to distinguish them from scripted test failures. They feed into the QA calibration loop (3.2) as a separate category.
5. **Graceful degradation** — If Playwright MCP is not available, exploratory testing is skipped silently. The feature is purely additive.

**Files affected**:
- MODIFY: `commands/gsd-t-execute.md` — add exploratory testing block to QA/Red Team prompts
- MODIFY: `commands/gsd-t-quick.md` — same for inline QA
- MODIFY: `commands/gsd-t-integrate.md` — same for integration QA/Red Team
- MODIFY: `commands/gsd-t-debug.md` — same for debug verification
- MODIFY: `templates/CLAUDE-global.md` — document evaluator interactivity in QA Agent section
- MODIFY: `templates/CLAUDE-project.md` — optional `Evaluator Time Budget` field

**Success criteria**:
- [ ] QA/Red Team subagent prompts include exploratory testing instructions when Playwright MCP is detected
- [ ] Exploratory testing has configurable time budgets (default 3min QA, 5min Red Team)
- [ ] Exploratory findings are tagged `[EXPLORATORY]` in reports
- [ ] Exploratory findings feed into QA calibration feedback loop (3.2)
- [ ] Missing Playwright MCP causes graceful skip, not failure
- [ ] Scripted tests still run first and must pass before exploratory testing begins

**Acceptance test**: With Playwright MCP registered, run `gsd-t-execute` on a web application task. Verify the QA subagent runs scripted tests, then performs exploratory testing via MCP, and any findings are tagged `[EXPLORATORY]` in qa-issues.md.

---

### 3.6 Configurable Iteration Budget (LOW-MEDIUM PRIORITY — Tier 3)

**Problem**: GSD-T hardcodes "2 fix attempts" before escalating to the headless debug loop (M29). Research shows 5-15 iterations drive convergence to significantly better quality for complex tasks. Simple tasks need 1-2 attempts; complex tasks need 5-10. The current one-size-fits-all budget under-serves complex tasks and the headless debug loop is a heavyweight escalation.

**Solution**: Allow domains and individual tasks to specify iteration budgets, with intelligent defaults based on task complexity signals.

**Mechanism**:
1. **Budget specification** — Three levels of override:
   - **Project-level default**: `Iteration Budget: N` in CLAUDE.md (default: 2 if unset, preserving current behavior)
   - **Domain-level override**: `iteration_budget: N` in domain `constraints.md` (overrides project default)
   - **Task-level override**: `[budget:N]` tag in task description in `tasks.md` (overrides domain default)
2. **Complexity-based defaults** — During `gsd-t-plan`, each task gets a complexity score based on:
   - File count in scope (>5 files = +1)
   - Cross-domain dependencies (any = +1)
   - New vs. modify (new file = +0, modify existing = +1)
   - Test requirements (E2E = +1, unit-only = +0)
   - Historical failure rate for similar domain types (from rule engine)
   - Complexity score 0-1 = budget 2, score 2-3 = budget 4, score 4+ = budget 6
3. **In-context vs. headless threshold** — The iteration budget applies to in-context fix attempts. The headless debug loop (M29) is still the escalation path, but it activates after the full budget is exhausted (not after a fixed 2). This makes the headless loop a true last resort.
4. **Budget telemetry** — Each task's actual iteration count is logged in task-metrics.jsonl. Over time, this data refines the complexity-based defaults through the rule engine.
5. **Budget governance** — The quality budget system (M26) still applies. If a milestone's aggregate rework rate exceeds the ceiling, the system tightens constraints rather than increasing iteration budgets.

**Files affected**:
- MODIFY: `commands/gsd-t-plan.md` — complexity scoring and budget assignment per task
- MODIFY: `commands/gsd-t-execute.md` — read task budget, use as fix-attempt limit instead of hardcoded 2
- MODIFY: `commands/gsd-t-quick.md` — same budget-aware fix attempts
- MODIFY: `commands/gsd-t-debug.md` — same
- MODIFY: `commands/gsd-t-wave.md` — same
- MODIFY: `commands/gsd-t-test-sync.md` — same
- MODIFY: `commands/gsd-t-verify.md` — same
- MODIFY: `templates/CLAUDE-project.md` — add Iteration Budget field
- MODIFY: `templates/CLAUDE-global.md` — document iteration budget system

**Success criteria**:
- [ ] Project CLAUDE.md supports `Iteration Budget: N` setting
- [ ] Domain `constraints.md` supports `iteration_budget: N` override
- [ ] Task descriptions support `[budget:N]` tag
- [ ] `gsd-t-plan` assigns complexity-based default budgets to tasks
- [ ] Execute commands respect task budget instead of hardcoded 2
- [ ] Headless debug loop activates only after full budget exhaustion
- [ ] Actual iteration counts are logged in task-metrics.jsonl
- [ ] Default behavior (no budget set) preserves current 2-attempt limit

**Acceptance test**: Set project budget to 5. Create a task with `[budget:8]` tag. Verify execute allows up to 8 fix attempts before escalating to headless debug loop. Create a task with no tag — verify it uses project default of 5.

---

### 3.7 Context Gate + Surgical Model Escalation (REWRITTEN IN M35 — v2.76.10)

**Status**: The original v2 design for this section described graduated degradation with `downgrade` and `conserve` bands that silently demoted models and skipped Red Team / doc-ripple phases under context pressure. **M35 removed that behavior entirely** (see `token-budget-contract.md` v3.0.0 and `.gsd-t/M35-definition.md`). The historical text is preserved in git history; this section documents the replacement.

**Problem**: Silent quality degradation is the wrong answer to context pressure. If the orchestrator is allowed to swap opus for sonnet, sonnet for haiku, or skip Red Team / doc-ripple / Design Verification when context is tight, the user silently receives lower-quality work than they asked for. GSD-T's core principle is excellent, deeply-tested results — not "best effort under pressure."

**Solution**: Three strict components that replace the old graduated-degradation model.

**Mechanism**:

1. **Three-band context gate** (`bin/token-budget.js` v3.0.0, `token-budget-contract.md` v3.0.0):

| Session Context Consumed | Band | Action |
|--------------------------|------|--------|
| < 70% | `normal` | Proceed at full quality. |
| 70–85% | `warn` | Log to `.gsd-t/token-log.md` and proceed at **full quality**. **Never** downgrade models, skip Red Team, skip doc-ripple, or skip Design Verification. |
| ≥ 85% | `stop` | Halt cleanly. Checkpoint progress. Hand off to runway estimator / headless auto-spawn (see below). |

   The bands `downgrade` and `conserve` that existed in v2.x are deleted. `applyModelOverride`, `skipPhases`, and all related machinery are deleted.

2. **Surgical per-phase model selection** (`bin/model-selector.js`, `model-selection-contract.md` v1.0.0 — m35-model-selector-advisor):
   - Declarative phase→tier mapping: `haiku` for strictly mechanical work (test runners, file-existence checks, JSON validation, branch guards), `sonnet` for routine code work (execute step 2, test-sync, doc-ripple wiring), `opus` for high-stakes reasoning (partition, discuss, Red Team, verify judgment, debug root-cause, architecture/contract design).
   - Sonnet is the **routine default** — opus is applied surgically at declared escalation points, not as a fallback for "important-looking" work.
   - Dual-layer: `ANTHROPIC_MODEL=opus` for the interactive session, `model:` directive overrides per-spawn.
   - Optional `/advisor` escalation hook at declared points; convention-based fallback if the native tool is not programmable.

3. **Runway estimator + headless auto-spawn** (`bin/runway-estimator.js`, `bin/headless-auto-spawn.js` — m35-runway-estimator, m35-headless-auto-spawn):
   - Pre-flight: before spawning a phase or task subagent, estimate the token cost of the remaining work from `.gsd-t/token-metrics.jsonl` history. If the projected runway crosses the `stop` threshold, **refuse the run and auto-spawn a headless session** to continue the work.
   - The user never types `/clear` under normal operation. The interactive session stays idle; the headless run consumes the fresh context window and reports results back via `.gsd-t/M35-headless-results-*.md`.
   - The only time a user sees a `/clear` prompt is when headless auto-spawn itself fails — an explicit degradation path, not a silent one.

4. **Per-spawn telemetry** (`bin/token-telemetry.js`, `token-telemetry-contract.md` v1.0.0 — m35-token-telemetry):
   - Every Task subagent spawn is wrapped in a token bracket that records `{timestamp, milestone, command, phase, step, domain, task, model, duration_s, input_tokens_before, input_tokens_after, tokens_consumed, context_window_pct_before, context_window_pct_after, outcome, halt_type, escalated_via_advisor}` to `.gsd-t/token-metrics.jsonl`.
   - `gsd-t metrics --tokens [--by model,command,phase,milestone]`, `gsd-t metrics --halts`, `gsd-t metrics --context-window` surface the history.
   - Telemetry feeds the runway estimator (historical cost-per-phase) and the optimization backlog (`bin/token-optimizer.js` → `.gsd-t/optimization-backlog.md`, detect-only — user selectively promotes via `/user:gsd-t-optimization-apply|reject`).

**Files affected (M35 active set)**:
- MODIFY: `bin/token-budget.js` — three-band `getDegradationActions`, `WARN_THRESHOLD_PCT = 70`, `STOP_THRESHOLD_PCT = 85`
- MODIFY: `.gsd-t/contracts/token-budget-contract.md` — v3.0.0 rewrite (Option X clean break, no compat shim)
- NEW: `bin/model-selector.js`, `bin/advisor-integration.js`, `bin/runway-estimator.js`, `bin/headless-auto-spawn.js`, `bin/token-telemetry.js`, `bin/token-optimizer.js`
- NEW: `.gsd-t/contracts/model-selection-contract.md`, `runway-estimator-contract.md`, `token-telemetry-contract.md`, `headless-auto-spawn-contract.md` (all v1.0.0)
- MODIFY: `commands/gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-quick.md`, `gsd-t-integrate.md`, `gsd-t-debug.md`, `gsd-t-doc-ripple.md` — three-band handlers, Model Assignment blocks, per-spawn token brackets, runway estimator wires
- MODIFY: `templates/CLAUDE-global.md`, `templates/CLAUDE-project.md` — rewrite Token-Aware Orchestration section

**Success criteria**:
- [ ] Zero `downgrade`, `conserve`, `modelOverride`, `skipPhases` references in live code under `bin/`, `scripts/`, `commands/`, `templates/` (prose discussing the removal is acceptable)
- [ ] `bin/model-selector.js` contains ≥ 8 declarative phase mappings
- [ ] Runway estimator wired into ≥ 5 command files
- [ ] Per-spawn token telemetry captures the full 18-field schema
- [ ] Headless auto-spawn tested end-to-end
- [ ] ~1030/1030 tests green (954 baseline at M35 Wave 1 exit)
- [ ] M35 dogfooded itself from Wave 3 onward
- [ ] `v2.76.10` tagged

**Non-goals**: cost modeling (M35 tracks tokens, not dollars), auto-optimization (backlog is detect-only), model marketplace (Claude models only), runtime Claude Code patches (convention-based `/advisor` fallback if no programmable API).

**Acceptance test**: Start a multi-wave milestone. Drive session context above 70% mid-wave. Verify: (a) the orchestrator logs a `warn` entry and proceeds at full quality with no model swaps and no phase skips; (b) when the runway estimator projects a `stop` crossing before the next phase completes, it halts cleanly and auto-spawns a headless session to continue; (c) the user never sees a `/clear` prompt unless the headless handoff itself fails; (d) `.gsd-t/token-metrics.jsonl` contains one record per spawn with the full schema.

---

### 3.8 Refined Model Tier Assignments (IMMEDIATE — Pre-Milestone)

**Problem**: The current model assignments have QA running on Haiku. The analysis (see `docs/harness-design-analysis.md`) identifies this as the single largest source of quality gaps — QA on Haiku produces superficial evaluations that Red Team consistently catches.

**Solution**: Promote QA from Haiku to Sonnet across all command files. Narrow Haiku's scope to strictly mechanical (zero-judgment) tasks.

**Mechanism**:
This is a search-and-replace operation in existing command files, not a new system:

| Role | Current Model | New Model | Rationale |
|------|-------------|-----------|-----------|
| Task execution | Sonnet | Sonnet | No change |
| QA evaluation | Haiku | **Sonnet** | Biggest quality-per-token improvement |
| Red Team | Sonnet | **Opus** | Adversarial reasoning benefits most from top-tier |
| Test running (count pass/fail) | Haiku | Haiku | Mechanical — no judgment needed |
| File existence checks | Haiku | Haiku | Mechanical |
| Branch guards | Haiku | Haiku | Mechanical |
| Orchestration | Opus | Opus | No change |

**Token cost impact**: QA calls increase ~3-5x per call (Haiku → Sonnet), but QA calls are small relative to execute calls. Red Team increases ~3-5x per call (Sonnet → Opus), but there's only 1 Red Team call per milestone. Net impact: ~10-15% more tokens per milestone — well within the daily budget with the token-aware orchestration (3.7) managing the ceiling.

**Files affected**:
- MODIFY: `commands/gsd-t-execute.md` — QA model: haiku → sonnet, Red Team model annotation
- MODIFY: `commands/gsd-t-quick.md` — QA model annotation
- MODIFY: `commands/gsd-t-integrate.md` — QA model annotation
- MODIFY: `templates/CLAUDE-global.md` — model assignment table

**This can be done immediately as a standalone change**, before M31-M33. No new infrastructure required.

---

## 4. Milestone Plan

### Pre-Milestone: Refined Model Tiers (v2.51.11)

**Scope**: Enhancement 3.8 (Refined Model Tier Assignments)

**Rationale**: This is a search-and-replace operation that addresses the #1 quality gap (QA on Haiku) with zero new infrastructure. Should be done immediately before M31, as the QA calibration system (3.2) will produce better baseline data when QA is already running on Sonnet.

**Estimated effort**: 1-2 hours (direct edits to 4 command files + 1 template)
**Predecessor**: None — standalone change

---

### M31: Self-Calibrating QA (Tier 1) — v2.52.10

**Scope**: Enhancements 3.1 (Harness Audit) + 3.2 (QA Calibration Feedback Loop) + 3.7 (Token-Aware Orchestration)

**Rationale**: These three enhancements are complementary — all three measure and manage GSD-T's resource effectiveness. The harness audit measures component-level ROI; the QA calibration measures QA-specific detection quality; the token-aware orchestrator ensures the framework can complete milestones within daily token limits. Together they establish the "self-awareness" foundation that all other enhancements benefit from.

**Estimated domains**: 4-5
- `harness-audit` — component registry, audit command, shadow mode, cost/benefit ledger
- `qa-calibrator` — miss-rate tracking, category aggregation, weak-spot detection, dynamic injection
- `token-orchestrator` — budget estimation, tracking, graduated degradation, pre-flight checks
- `command-integration` — wire audit into complete-milestone, wire calibrator into execute/quick/integrate, wire budget checks into wave/execute
- `telemetry-extension` — extend metrics-rollup with QA miss rates and component impact

**Estimated tasks**: 14-18
**Predecessor**: M30 (Stack Rules Engine — for component registry baseline), Pre-Milestone model tier refinement

### M32: Quality Culture & Design (Tier 2) — v2.53.10

**Scope**: Enhancements 3.3 (Quality North Star) + 3.4 (Design Brief) + 3.5 (Evaluator Interactivity)

**Rationale**: These three enhancements share a theme: raising the quality ceiling through non-procedural means. Quality persona raises the baseline aspiration. Design brief ensures aesthetic coherence. Evaluator interactivity finds bugs that procedural checks miss. Grouping them ensures they are designed to work together — the quality persona influences how the design brief is generated, and evaluator interactivity tests against both.

**Estimated domains**: 3-4
- `quality-persona` — CLAUDE.md section, init/setup integration, prompt injection
- `design-brief` — detection, generation, contract storage, injection for UI tasks
- `evaluator-interactivity` — MCP detection, exploratory testing prompts, finding classification
- `command-integration` — wire all three into execute/quick/debug/integrate/wave

**Estimated tasks**: 10-12
**Predecessor**: M31 (QA calibration must exist for exploratory findings to feed into)

### M33: Adaptive Iteration (Tier 3) — v2.54.10

**Scope**: Enhancement 3.6 (Configurable Iteration Budget)

**Rationale**: This enhancement depends on telemetry data from M31 (QA miss rates, component impact) and M32 (exploratory findings) to make intelligent budget decisions. It also modifies the most command files (7), so it should be last to minimize merge conflicts with M31/M32 changes.

**Estimated domains**: 2-3
- `complexity-scoring` — plan-time complexity analysis, budget assignment, defaults
- `budget-execution` — budget-aware fix attempts in all 7 execution commands
- `telemetry-extension` — iteration count tracking in task-metrics.jsonl

**Estimated tasks**: 8-10
**Predecessor**: M32

---

## 5. Impact Analysis

### Existing commands modified

| Command              | M31 | M32 | M33 | Changes                                                        |
|----------------------|-----|-----|-----|----------------------------------------------------------------|
| `gsd-t-execute`      | X   | X   | X   | QA calibration injection, persona injection, design brief, budget |
| `gsd-t-quick`        | X   | X   | X   | Same as execute (inline variants)                              |
| `gsd-t-integrate`    | X   | X   |     | QA calibration injection, persona, design brief                |
| `gsd-t-debug`        |     | X   | X   | Persona injection, budget                                      |
| `gsd-t-wave`         |     | X   | X   | Persona injection, budget                                      |
| `gsd-t-plan`         |     |     | X   | Complexity scoring, budget assignment                          |
| `gsd-t-partition`    |     | X   |     | Design brief detection and generation                          |
| `gsd-t-init`         |     | X   |     | Quality persona selection                                      |
| `gsd-t-setup`        |     | X   |     | Quality persona + design brief configuration                   |
| `gsd-t-test-sync`    |     |     | X   | Budget-aware fix attempts                                      |
| `gsd-t-verify`       |     |     | X   | Budget-aware fix attempts                                      |
| `gsd-t-complete-milestone` | X |  |     | Component impact evaluation in distillation                    |
| `gsd-t-status`       | X   |     |     | Show flagged components + QA miss rate summary                 |
| `gsd-t-help`         | X   |     |     | New audit command entry                                        |

### New artifacts

| Artifact                               | Milestone | Purpose                                    |
|----------------------------------------|-----------|--------------------------------------------|
| `commands/gsd-t-audit.md`              | M31       | Harness audit command                      |
| `bin/qa-calibrator.js`                 | M31       | QA miss-rate aggregation + weak-spot detection |
| `bin/token-budget.js`                  | M31       | Token budget estimation, tracking, thresholds |
| `.gsd-t/component-registry.jsonl`      | M31       | Component inventory with cost tracking     |
| `.gsd-t/metrics/qa-miss-log.jsonl`     | M31       | Red Team findings QA missed                |
| `.gsd-t/metrics/component-impact.jsonl`| M31       | Per-component cost/benefit ledger          |
| `.gsd-t/contracts/design-brief.md`     | M32       | Design language for UI-heavy projects      |

### Backward compatibility

All enhancements are **purely additive**:
- Projects without a quality persona skip injection silently
- Projects without UI domains skip design brief entirely
- Projects without Playwright MCP skip exploratory testing
- Projects without iteration budget settings use current 2-attempt default
- The audit command is opt-in — it never runs automatically
- QA calibration activates only when Red Team data exists (Red Team was added in v2.51.10)

No existing behavior changes unless the user explicitly enables the new features.

### Zero-dependency constraint

All new code (`bin/qa-calibrator.js`, component registry logic) uses Node.js built-ins only. No external npm dependencies. This is non-negotiable per TECH-001.

---

## 6. Risk Assessment

| Risk                                          | Likelihood | Impact | Mitigation                                                       |
|-----------------------------------------------|------------|--------|------------------------------------------------------------------|
| Harness audit doubles execution time           | Medium     | High   | Audit is opt-in, never automatic. Budget per audit session.      |
| QA calibration creates feedback oscillation    | Low        | Medium | Damping: changes only after 3+ milestones of consistent signal. |
| Quality persona is ignored by subagent         | Medium     | Low    | Minimal cost (2-3 lines of prompt). Measure via A/B in audit.   |
| Design brief is too prescriptive               | Low        | Medium | Brief sets direction, not pixel specs. Execution agents adapt.  |
| Playwright MCP not widely available            | Medium     | Low    | Graceful degradation — feature skips if MCP absent.              |
| Higher iteration budgets waste context tokens  | Low        | Medium | Budget governance (M26) caps aggregate rework. Telemetry tracks. |
| Command file sizes grow beyond readability     | Medium     | High   | Each injection is max 5-10 lines. Total overhead auditable via 3.1. |
| **Token exhaustion mid-milestone**             | **High**   | **High** | **Token-aware orchestration (3.7) with graduated degradation. Progress always checkpointed before hard stop.** |
| **QA promotion to Sonnet exceeds token budget** | Low       | Medium | QA calls are small relative to execute. Net impact ~10-15% more tokens. Token orchestrator manages ceiling. |
| **Budget estimation inaccuracy**               | Medium     | Medium | Estimates improve over time using historical data from token-log.md. Conservative defaults (overestimate). |

---

## 7. Success Metrics

| Metric                               | Baseline (current)    | Target (post-M33)          |
|--------------------------------------|-----------------------|----------------------------|
| QA-to-Red-Team miss rate             | Not tracked           | < 15% per category         |
| Component ROI visibility             | None                  | 100% of components tracked |
| Subagent prompt quality signal       | Procedural only       | Persona + procedural       |
| UI aesthetic consistency (manual)     | Per-task independent  | Brief-governed coherence   |
| Exploratory bugs found               | 0 (no capability)     | > 0 per UI milestone       |
| Iteration convergence (complex tasks)| Fixed 2 attempts      | Adaptive 2-8 attempts      |
| Framework bloat detection            | None                  | Components flagged at 3+ milestone negative ROI |
| **Token exhaustion incidents**       | **Not tracked**       | **Zero — milestones always complete or checkpoint gracefully** |
| **Milestones per daily budget**      | **~1-2 (unmanaged)**  | **2-3 with budget-aware orchestration** |
| **QA model effectiveness**           | **Haiku (baseline)**  | **Sonnet (post-3.8 promotion)** |

---

## 8. Out of Scope

- **Automated component removal** — Flagging is automated; actual removal requires user approval (Destructive Action Guard)
- **Visual regression testing** — Design brief ensures consistency via prompt engineering, not pixel-diff tooling
- **Custom LLM model selection** — Quality persona works within the refined haiku/sonnet/opus model assignments. Fully dynamic model selection per-task is a future enhancement beyond 3.8's static tier refinement
- **Cross-project QA calibration** — QA calibration is per-project in this PRD. Cross-project propagation follows the M27 pattern if warranted later
- **Real-time quality dashboard** — The existing dashboard (M15) displays events; adding QA calibration visualizations is a future enhancement
- **AI-generated design systems** — The design brief is a coordination artifact, not a Figma export or component library generator

---

## 9. Dependencies

| Dependency                     | Type     | Status      | Required By |
|--------------------------------|----------|-------------|-------------|
| Rule Engine (M26)              | Internal | COMPLETE    | M31 (audit integration with patch lifecycle) |
| Patch Lifecycle (M26)          | Internal | COMPLETE    | M31 (component deprecation as patches) |
| Red Team (v2.51.10)            | Internal | COMPLETE    | M31 (miss-rate source data) |
| Metrics Rollup (M25)           | Internal | COMPLETE    | M31 (ELO integration for QA miss rates) |
| Headless Debug Loop (M29)      | Internal | COMPLETE    | M33 (budget exhaustion triggers headless) |
| Stack Rules Engine (M30)       | Internal | COMPLETE    | M32 (persona injected before stack rules) |
| Playwright MCP                 | External | Optional    | M32 (evaluator interactivity — graceful skip if absent) |
| Claude Code Agent tool         | External | Available   | All (subagent spawning) |

---

## 10. Implementation Notes

### Token budget awareness

There are two distinct token budget concerns:

**A. Per-subagent prompt overhead** — how many tokens each enhancement adds to individual subagent prompts:
- Quality persona: 2-3 lines (~50 tokens)
- QA weak-spot injection: 3-5 lines (~100 tokens) — only when weak spots exist
- Design brief: 15-30 lines (~300 tokens) — only for UI tasks
- Exploratory testing instructions: 8-10 lines (~150 tokens) — only when MCP available
- Iteration budget: 1 line (~20 tokens) — always injected

**Maximum additional overhead per subagent**: ~620 tokens (UI task with all features active). This is well within the per-agent context budget and measurable via the harness audit (3.1).

**B. Session-level token consumption** — how all enhancements affect daily/weekly token limits on the $200 Max plan:
- QA model promotion (Haiku → Sonnet): +10-15% tokens per milestone
- Red Team model promotion (Sonnet → Opus): +3-5% tokens per milestone (only 1 call)
- Exploratory testing: +5-10% tokens per milestone (when MCP available)
- Higher iteration budgets: variable, capped by token-aware orchestrator (3.7)
- Harness audit: opt-in only, not counted in normal milestone budgets

**Maximum additional session cost**: ~25-30% more tokens per milestone vs. current. The token-aware orchestrator (3.7) ensures this stays within daily limits through graduated degradation.

### Command file discipline

Each command file modification is a targeted injection (5-15 lines), not a restructure. The existing step numbering and flow are preserved. New injection points follow the established pattern: read a state file, conditionally inject content into the subagent prompt.

### Testing strategy

- `bin/qa-calibrator.js` — unit tests in `test/qa-calibrator.test.js` (JSONL parsing, miss-rate math, weak-spot detection)
- Component registry — unit tests in `test/component-registry.test.js` (CRUD, cost calculation, flagging logic)
- Integration — manual CLI testing of `gsd-t-audit` command, verified via existing `gsd-t-verify` gates
- No new external dependencies for testing (stays with Node.js built-in `node --test`)
