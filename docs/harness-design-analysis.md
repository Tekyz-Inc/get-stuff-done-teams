# GSD-T vs. Anthropic's Harness Design Findings - Analysis

**Date**: 2026-04-01
**Source Article**: [Harness Design for Long-Running Application Development](https://www.anthropic.com/engineering/harness-design-long-running-apps) — Prithvi Rajasekaran, Anthropic Labs
**Context**: Deep analysis of how the article's findings relate to GSD-T's architecture, identifying alignments, gaps, and evolution opportunities. Includes consideration of GSD-T's multi-model execution strategy and token-budget constraints on the $200 Max plan.

---

## Article Summary

The article explores how to architect multi-agent systems that enable Claude to produce high-quality applications without human intervention, drawing inspiration from Generative Adversarial Networks (GANs). Key findings:

1. **Generators cannot reliably self-evaluate** — agents confidently praise mediocre work. Separation of generation and evaluation is critical.
2. **Context resets beat compaction** — fresh context windows produce better results than accumulated, compacted ones. Models develop "context anxiety" as windows fill.
3. **Sprint contracts** — negotiated testable acceptance criteria between generator and evaluator before implementation begins.
4. **QA calibration requires iteration** — out-of-box QA agents test superficially. Multiple prompt refinement iterations are needed for reasonable judgment.
5. **Component justification** — every harness component encodes an assumption about model limitations. Assumptions must be stress-tested and become stale as models improve.
6. **Prompt framing shifts quality** — language like "museum quality" shaped output quality more than procedural instructions.
7. **Planner agent** — takes 1-4 sentence prompts, expands to full specs while staying deliberately high-level on implementation to avoid error cascades. Also creates visual design language and proactively suggests AI feature opportunities.
8. **Iterative feedback cycles** — 5-15 generate-evaluate iterations drove convergence from broken to polished output.
9. **Model capability changes harness needs** — Opus 4.6 needed less scaffolding than Opus 4.5. Sprint decomposition and even the evaluator became less critical for simpler tasks.

---

## Where GSD-T Already Aligns Well

### 1. Separation of Generation and Evaluation

**Article finding**: Generators self-praise. "Agents tend to respond by confidently praising the work — even when, to a human observer, the quality is obviously mediocre." Separating evaluation from generation proved more tractable than making single agents self-critical.

**GSD-T's current state**: Strong alignment. GSD-T separates these concerns across multiple agents:

| Role | GSD-T Implementation | Article Equivalent |
|------|---------------------|-------------------|
| Generator | `gsd-t-execute` task subagents | Generator agent |
| Cooperative evaluator | QA Agent (separate file-path boundaries, cannot modify source) | Evaluator agent |
| Adversarial evaluator | Red Team Agent (inverted incentive — success = bugs found) | — (no equivalent) |
| Quality gate | `gsd-t-verify` (independent verification dimensions) | — (partial overlap) |

GSD-T actually goes further than the article's single evaluator. The QA/Red Team split creates both cooperative and adversarial evaluation — a GAN-within-a-GAN structure.

### 2. Context Window Management

**Article finding**: Context resets proved more effective than compaction. Models lose coherence as context windows fill. "Context anxiety" causes premature wrap-up.

**GSD-T's current state**: Strong alignment. This is exactly what GSD-T's fresh-dispatch architecture addresses:

- **Wave orchestrator** (`gsd-t-wave.md`): Spawns independent agents per phase, each with a fresh context window
- **Task-level dispatch** (`gsd-t-execute.md`): Spawns one subagent per task with minimal context payload (~5 prior summaries, scope, contracts, single task)
- **Context self-check**: At 70% utilization, orchestrator saves progress and stops — user runs `/clear` and re-invokes
- **Compaction detection**: Observability logging tracks token deltas and flags when compaction occurs

GSD-T arrived at the same conclusion independently: fresh windows beat accumulated context.

### 3. Sprint Contracts / Acceptance Criteria

**Article finding**: Generator and evaluator negotiate testable acceptance criteria before implementation begins — 27 specific criteria for a single sprint.

**GSD-T's current state**: Direct equivalent. The `partition → plan` pipeline produces:

- Domain contracts in `.gsd-t/contracts/` (API shapes, schemas, component props)
- Atomic task lists with acceptance criteria in `domains/*/tasks.md`
- QA agent generates contract test skeletons during partition phase
- Integration points documented in `.gsd-t/contracts/integration-points.md`

The main difference: the article's contracts are negotiated between generator and evaluator at runtime, while GSD-T's contracts are established during the plan phase and are static during execution. GSD-T's approach is more predictable but less adaptive.

---

## Where the Article Reveals Gaps in GSD-T

### 4. QA Calibration Problem (Critical Gap)

**Article finding**: "Out-of-box QA agents test superficially; the author required multiple prompt refinement iterations before achieving reasonable judgment calibration."

**GSD-T's exposure**: GSD-T's QA and Red Team prompts are **static**. They're defined once in the command files and injected identically every time. The article found that QA quality required iterative tuning — the evaluator needed to learn what "good enough" actually means for each project.

**Evidence in GSD-T**: The E2E Quality Standard ("functional tests, not layout tests") was added to CLAUDE.md precisely because this problem was observed — QA agents were producing shallow tests that passed on empty HTML pages. But this fix is a static rule, not a calibrated evaluator. The rule catches one failure mode; there are others that haven't been discovered yet.

**Impact**: GSD-T's QA might be consistently superficial without the operator knowing. Red Team finds bugs QA missed, but that signal is discarded — there's no feedback loop.

**Proposed evolution**: Wire Red Team miss rates back into QA prompt tuning. Categories with >30% miss rate become dynamic priority injections. See PRD Enhancement 3.2 (QA Calibration Feedback Loop).

### 5. Prompt Framing as Quality Lever (Untapped)

**Article finding**: "Phrasing like 'the best designs are museum quality' shaped visual convergence despite not being explicit instructions." Prompt-based grading criteria alone improved first-iteration outputs noticeably beyond baseline, before any feedback iteration occurred.

**GSD-T's exposure**: GSD-T's subagent prompts are highly procedural — "read this file, execute this task, report pass/fail." They describe *what to do* but rarely set an aspirational quality bar through language framing.

**The mechanism**: Language framing steers models away from generic defaults. A phrase like "museum quality" doesn't map to any checkable rule, but it shifts the agent's internal quality threshold for every decision it makes. This is a different lever than enforcement — it's about raising the *default* rather than catching failures.

**Impact**: GSD-T's agents operate at the model's default quality level, then get corrected by QA/Red Team. The article suggests that a single well-chosen phrase in the prompt can raise the default so that fewer corrections are needed — a multiplicative improvement.

**Proposed evolution**: A project-level "Quality North Star" statement prepended to every subagent prompt. See PRD Enhancement 3.3.

### 6. Component Justification / Harness Simplification (Strategic Gap)

**Article finding**: "Every component in a harness encodes an assumption about what the model can't do on its own. Assumptions require stress testing and become stale as models improve."

This is the most strategically important finding for GSD-T.

**GSD-T's exposure**: GSD-T has accumulated significant complexity over 28+ milestones:

| Component | Added In | Token Cost | Assumption It Encodes |
|-----------|----------|------------|----------------------|
| Observability logging | M25 | ~200 tokens/spawn | Models won't self-report resource usage |
| Stack rules detection | M30 | ~150 tokens + bash | Models don't know framework best practices |
| Graph-enhanced checks | M20 | ~100 tokens conditional | Models can't infer cross-file relationships |
| Rule engine injection | M26 | ~50-100 tokens | Models repeat past mistakes |
| Red Team | v2.51.10 | Full subagent context | QA alone misses adversarial scenarios |
| QA Agent | M17 | Full subagent context | Generators can't self-evaluate |
| Pre-commit gate | M12 | ~300 tokens in CLAUDE.md | Models forget to update docs |
| E2E enforcement | M19 | ~200 tokens in CLAUDE.md | Models skip E2E tests when unit tests pass |
| Branch guard | M22 | ~50 tokens | Models commit to wrong branches |
| Context self-check | M22 | ~100 tokens bash | Models don't notice context filling |

Each was justified when added. But the article warns: **as models improve, components that were load-bearing become dead weight.** The author found that with Opus 4.6, sprint decomposition and even the evaluator became less critical for simpler tasks.

**GSD-T has no mechanism for testing whether its own components are still necessary.** There's no A/B comparison, no "run without Red Team and see if quality degrades" experiment. The framework only grows — it never sheds.

**Proposed evolution**: A `gsd-t-audit` command that stress-tests components by selectively disabling them and comparing outcomes. See PRD Enhancement 3.1 (Harness Audit Capability).

### 7. Evaluator Interactivity (Moderate Gap)

**Article finding**: The evaluator "used Playwright MCP to interact with live pages, running 5-15 iterations per generation with feedback loops driving aesthetic improvement."

**GSD-T's exposure**: GSD-T's QA agent runs tests and reports pass/fail. It does not *interact with the running application* the way the article's evaluator does — clicking through UI, testing workflows as a user would. GSD-T's Playwright enforcement ensures E2E tests exist and run, but the QA agent itself doesn't dynamically explore the application.

**Impact**: For UI-heavy projects, there's a gap between "tests pass" and "this is actually good to use." The article's evaluator found issues that scripted tests missed precisely because it was doing exploratory interaction — unexpected navigation paths, responsive behavior, console errors after actions.

**Proposed evolution**: Give QA/Red Team agents Playwright MCP access for exploratory testing after scripted tests pass. See PRD Enhancement 3.5.

### 8. Iterative Feedback Cycles (Moderate Gap)

**Article finding**: 5-15 iterations of generate → evaluate → improve per sprint. The Retro Game Maker went from broken (solo, 20 min, $9) to polished (harness, 6 hours, $200).

**GSD-T's current state**: The flow is mostly linear: execute → QA → Red Team → fix (up to 2 cycles) → done. The 2-attempt limit is hardcoded.

**Impact**: Simple tasks get 2 attempts (enough). Complex tasks get 2 attempts (not enough), then escalate to the heavyweight headless debug loop. There's no middle ground.

**Proposed evolution**: Configurable iteration budgets with complexity-based defaults. See PRD Enhancement 3.6.

### 9. Planner Agent — Design Language and Proactive Suggestion

**Article finding**: The Planner creates a *visual design language* as part of the spec and proactively suggests AI feature opportunities. It stays deliberately high-level on implementation to avoid error cascades.

**GSD-T's equivalent**: GSD-T fragments the Planner role across `gsd-t-prd → gsd-t-project → gsd-t-partition → gsd-t-plan`. This is more robust (multiple checkpoints) but lacks two capabilities:

1. **Visual design language** — No equivalent. UI-heavy projects suffer aesthetic drift when different task subagents make independent visual decisions.
2. **Proactive feature suggestion** — GSD-T faithfully decomposes what the user asks for but doesn't suggest "you should also add X."

**GSD-T's advantage**: The multi-step pipeline gives multiple course-correction opportunities before execution. The article's single Planner is a single point of failure — a bad spec cascades to everything downstream. GSD-T's approach is more resilient for existing codebases.

**Proposed evolution**: A design brief artifact generated during partition for UI-heavy projects. See PRD Enhancement 3.4.

---

## The Multi-Model Dimension

The article's harness uses a single model (Opus 4.5, later Opus 4.6) for all roles. GSD-T uses a **tiered model strategy**:

| Model | GSD-T Role | Approximate Capability |
|-------|-----------|----------------------|
| **Haiku** | Mechanical tasks: run tests, count pass/fail, validate structure, check file existence | Fast, cheap, narrow judgment |
| **Sonnet** | Mid-tier reasoning: routine code changes, standard refactors, test writing | Good reasoning, cost-efficient |
| **Opus** | High-stakes reasoning: architecture decisions, security analysis, complex debugging | Best reasoning, highest cost |

This introduces a dimension the article doesn't address: **the component justification problem is model-dependent.**

### Model-Specific Implications

**1. QA Calibration is more critical with multi-model**

The article found QA calibration was hard even with a single top-tier model. GSD-T runs QA on **Haiku** — the weakest model in its tier. This means:
- QA's superficial testing problem is likely *worse* in GSD-T than in the article's setup
- Haiku may not have the reasoning capacity to apply nuanced calibration injections effectively
- The QA calibration feedback loop (PRD 3.2) may need to consider **promoting QA to Sonnet** for projects with persistently high miss rates, not just tuning the prompt

**Recommendation**: The QA calibration system should track miss rates per model assignment. If Haiku QA consistently misses >40% of what Red Team finds, the system should recommend model promotion as a calibration action — not just prompt changes.

**2. Quality North Star framing may have differential impact by model**

The article found "museum quality" phrasing shifted output with Opus 4.5/4.6. The question is whether aspirational framing works as well with Sonnet and Haiku:
- **Opus**: High reasoning capacity — likely responds well to aspirational framing (matches article's findings)
- **Sonnet**: Good reasoning — likely responds to framing but with diminishing returns vs. procedural checks
- **Haiku**: Limited reasoning — aspirational framing may be largely ignored in favor of procedural pattern-following

**Recommendation**: Quality North Star injection should be **model-aware**. For Opus tasks, inject the full aspirational statement. For Sonnet tasks, inject a shorter, more concrete version. For Haiku tasks, convert the aspiration into a concrete checklist (Haiku responds better to explicit rules than vibes).

**3. The harness audit problem is amplified by model tiers**

A component that's dead weight for Opus might still be essential for Haiku. Example:
- **Stack rules** (M30): Opus may internalize React best practices without needing them in the prompt. But Haiku, with less training data influence, may genuinely need the explicit rules to avoid anti-patterns.
- **Branch guard**: All models benefit equally — this is a mechanical check, not a reasoning task.
- **E2E enforcement**: Opus might naturally run E2E tests without being told. Sonnet sometimes skips them. Haiku almost certainly skips them without explicit instruction.

**Recommendation**: The harness audit system (PRD 3.1) should test component necessity **per model tier**, not globally. A component might be removable for Opus tasks but essential for Haiku tasks. The audit report should show a model x component matrix.

**4. Iteration budget interacts with model capability**

The article found Opus 4.6 needed fewer iterations than Opus 4.5. By extension:
- **Opus tasks**: May converge in 1-2 iterations (high reasoning = fewer mistakes)
- **Sonnet tasks**: May need 3-5 iterations (good reasoning but misses edge cases)
- **Haiku tasks**: May need the full budget but also may not *converge* — additional iterations on Haiku might just produce different failures rather than improving quality

**Recommendation**: The configurable iteration budget (PRD 3.6) should set model-aware defaults:
- Opus tasks: default budget 2 (current behavior preserved)
- Sonnet tasks: default budget 4
- Haiku tasks: default budget 2 (additional iterations unlikely to help — escalate to Sonnet instead)

The more effective lever for Haiku failures is **model escalation**, not more iterations at the same tier.

**5. Evaluator interactivity requires sufficient model capability**

Exploratory testing through Playwright MCP requires judgment — the agent must decide what to click, what looks wrong, what constitutes a bug vs. intended behavior. This is a reasoning-heavy task.

**Recommendation**: Exploratory testing (PRD 3.5) should be restricted to **Sonnet or Opus** evaluators. Haiku should not be given exploratory testing access — it lacks the judgment capacity to distinguish real bugs from expected behavior, and would likely produce high false-positive rates.

### Summary: Multi-Model Impact on PRD Enhancements

| Enhancement | Multi-Model Impact | Adjustment Needed |
|------------|-------------------|-------------------|
| 3.1 Harness Audit | High — components may be model-dependent | Audit per model tier, not globally |
| 3.2 QA Calibration | High — Haiku QA has worse baseline | Track miss rates per model; recommend model promotion |
| 3.3 Quality North Star | Medium — framing impact varies by model | Model-aware injection: aspirational (Opus), concrete (Sonnet), checklist (Haiku) |
| 3.4 Design Brief | Low — design brief is factual, not reasoning-dependent | No adjustment needed |
| 3.5 Evaluator Interactivity | High — requires judgment capacity | Restrict to Sonnet/Opus evaluators only |
| 3.6 Iteration Budget | Medium — convergence rate differs by model | Model-aware defaults; Haiku escalates rather than iterates |

### The Deeper Question: Should Model Assignment Itself Be Adaptive?

The current model assignment in GSD-T is **static** — defined in CLAUDE.md and the command files:
- Haiku for mechanical tasks
- Sonnet for routine code
- Opus for high-stakes reasoning

The article's finding about component justification extends to model assignment: **the assumption that "QA is a Haiku task" may be stale.** If QA calibration data shows Haiku consistently underperforms, the system should be able to promote individual task categories to higher tiers — not as a global policy change, but as a data-driven adjustment.

This would be a natural extension of the QA calibration feedback loop: instead of just tuning prompts, the system could recommend model tier changes. A "model promotion" patch in the rule engine would follow the same lifecycle as any other patch: candidate -> measured -> promoted -> graduated.

---

## The Token-Budget Constraint

### Context: $200 Max Plan Limits

The article's harness operates on API billing — cost is a variable expense. GSD-T operates on Claude's $200 Max plan, where tokens are a **hard daily/weekly ceiling**. This fundamentally changes the optimization calculus:

- **API billing**: "Is this component worth $X per run?" (cost-benefit analysis)
- **Max plan**: "Will this component cause me to run out of tokens before the milestone is done?" (resource exhaustion risk)

Running out of tokens mid-milestone is a **workflow-breaking event** — uncommitted work may be scattered across subagents, context is lost, and the user must wait for the limit to reset before continuing.

### Token Consumption by Model Tier

| Model | Relative Token Cost | Typical Subagent Spawns per Milestone | Budget Impact |
|-------|-------------------|--------------------------------------|---------------|
| Opus  | 1x (baseline)     | 3-5 (architecture, orchestration)    | ~15-25% of daily budget |
| Sonnet | ~0.2-0.3x        | 15-25 (task execution, refactors)    | ~30-50% of daily budget |
| Haiku | ~0.04-0.07x       | 5-10 (test runs, validation)         | ~2-5% of daily budget |

A typical milestone with tiered models consumes roughly **50-80%** of a daily budget. Switching everything to Opus would push this to **150-300%** — potentially requiring 2-3 days per milestone instead of completing within a single session.

### Why "All Opus" Fails on a Token-Limited Plan

The simplification argument for all-Opus (discussed in the multi-model section above) collapses under a token ceiling:

1. **A 3-domain milestone spawns 30-50+ subagents** across all phases (wave orchestration)
2. **Each Opus subagent costs ~3-5x** a Sonnet call and ~15-25x a Haiku call
3. **One milestone could exhaust the daily budget**, leaving no capacity for debugging, iteration, or follow-up work
4. **Mid-milestone token exhaustion** is worse than slightly lower quality on mechanical tasks — you can't finish what you started

### Refined Model Strategy Under Token Constraints

Instead of all-Opus, the optimal strategy is to **sharpen the tiers** to maximize quality per token spent:

| Model | Current Assignment | Refined Assignment | Rationale |
|-------|-------------------|-------------------|-----------|
| **Opus**   | Architecture, security, complex debugging | Same + **Red Team** | Adversarial reasoning is the highest-ROI Opus use |
| **Sonnet** | Routine code, refactors, test writing | Same + **QA** (promoted from Haiku) | Biggest quality win for moderate token cost |
| **Haiku**  | Run tests, validate structure, count pass/fail | **Narrowed**: only run test suites, check file existence, validate JSON, report counts, branch checks | Strictly mechanical — zero judgment tasks |

The key change: **QA promoted from Haiku to Sonnet**. This is the single highest-ROI model change — it addresses the #1 gap (QA calibration problem) without the budget-breaking cost of Opus.

### Token-Constraint Impact on PRD Enhancements

| Enhancement | Token Impact | Design Adjustment for Token-Limited Plan |
|------------|-------------|----------------------------------------|
| 3.1 Harness Audit | **HIGH** — runs tasks twice | Must be opt-in. Run on smallest possible scope. Consider using Haiku for both control/experiment to minimize audit cost |
| 3.2 QA Calibration | **LOW** — dynamic prompt injection (~100 tokens) | Good as-is. High ROI per token spent |
| 3.3 Quality North Star | **NEGLIGIBLE** — 2-3 lines (~50 tokens) | Best ROI of all enhancements. Nearly zero cost |
| 3.4 Design Brief | **LOW** — conditional injection (~300 tokens, UI tasks only) | Good as-is. Only injected when relevant |
| 3.5 Evaluator Interactivity | **HIGH** — exploratory testing burns tokens on observation/reasoning cycles | Needs a **token budget cap**, not just a time budget. "Spend up to N tokens on exploration" is more meaningful than "spend 3 minutes" on a rate-limited plan |
| 3.6 Iteration Budget | **VARIABLE** — more iterations = more tokens | Must account for daily limits. Add daily-budget-awareness: reduce iteration budgets when approaching ceiling |

### New Enhancement: Token-Aware Orchestration (3.7)

The article doesn't address this because API-based harnesses have no token ceiling. But for Max plan users, GSD-T needs a **7th enhancement**: token-budget-aware orchestration.

**Mechanism**:
1. **Before spawning a subagent**: estimate token cost (model tier x task complexity)
2. **Track cumulative session usage** against estimated daily/weekly ceiling
3. **Degrade gracefully** when approaching limits:

| Budget Consumed | Action |
|----------------|--------|
| < 60%          | Normal operation |
| 60-70%         | Warn user. Reduce iteration budgets to minimum. |
| 70-85%         | Downgrade non-critical Sonnet tasks to Haiku. Skip exploratory testing. |
| 85-95%         | Pause non-essential phases. Checkpoint progress. |
| > 95%          | Hard stop. Save all progress. "Resume tomorrow with `/gsd-t-resume`." |

This prevents the worst outcome: running out of tokens mid-task with uncommitted work scattered across subagents.

**Integration with existing systems**:
- The context self-check (already at 70% per-subagent) monitors individual agent windows
- Token-aware orchestration monitors the **aggregate session budget** across all subagents
- These are complementary: one prevents per-agent compaction, the other prevents session-level exhaustion

---

## Overall Assessment

### Architecture Alignment Score

| Article Finding | GSD-T Alignment | Status |
|----------------|----------------|--------|
| Separate generation/evaluation       | Strong  | No change needed |
| Context resets > compaction          | Strong  | No change needed |
| Sprint contracts                     | Strong  | No change needed |
| QA calibration feedback              | Missing | PRD Enhancement 3.2 |
| Prompt framing quality lever         | Missing | PRD Enhancement 3.3 |
| Component justification/audit        | Missing | PRD Enhancement 3.1 |
| Evaluator interactivity              | Partial | PRD Enhancement 3.5 |
| Iterative feedback cycles            | Limited | PRD Enhancement 3.6 |
| Design language artifact             | Missing | PRD Enhancement 3.4 |
| Model capability adaptation          | Not addressed in article | New GSD-T consideration |
| Token-budget-aware orchestration     | Not addressed in article | New GSD-T consideration (Max plan constraint) |

### Bottom Line

GSD-T's **architecture is fundamentally sound** — it independently arrived at several of the same conclusions the article validates. The four highest-priority evolutions are:

1. **Harness audit capability** — The framework's biggest risk isn't missing features, it's accumulated complexity that no longer earns its keep. Every mandatory block is a tax on every run — and on a token-limited plan, that tax can mean the difference between finishing a milestone in one session or two. The audit mechanism is the meta-capability that keeps all other capabilities honest.

2. **QA calibration loop** — Static QA prompts are the weakest link, especially when QA runs on Haiku. The rule engine and ELO system already exist. Wiring miss rates back into prompt tuning (and potentially model promotion from Haiku to Sonnet) closes the loop. Promoting QA to Sonnet is the single highest-ROI model change.

3. **Quality framing injection** — Minimal work with potentially outsized impact, per the article's findings. At ~50 tokens per injection, this has the best ROI-per-token of any enhancement. Model-aware injection ensures the framing is effective across all tiers.

4. **Token-aware orchestration** — The article's API-billed harness doesn't face this, but on a $200 Max plan, token exhaustion mid-milestone is a workflow-breaking event. Graceful degradation (warn -> downgrade -> checkpoint -> stop) prevents lost work.

The framework does **not** need a fundamental redesign. It needs two meta-capabilities:
- **Self-reflection** — the ability to evaluate its own components the way it evaluates the code it produces
- **Resource awareness** — the ability to manage its token budget across a session the way it manages context within a single agent

The multi-model dimension adds nuance: self-reflection must account for the fact that different models have different needs (what's dead weight for Opus may be essential for Haiku), and resource awareness must account for the fact that model tier directly controls burn rate.

### Recommended Immediate Action (Pre-PRD)

Even before implementing M31-M33, one change has outsized impact with zero infrastructure:

**Promote QA from Haiku to Sonnet in all command files.** This is a search-and-replace operation that addresses the #1 quality gap identified in this analysis. It costs moderately more tokens per milestone but eliminates the largest source of QA miss rates. The token cost is manageable: ~5-10 Sonnet QA calls per milestone vs. ~5-10 Haiku calls — roughly 3-5x more per call, but QA calls are small relative to execute calls.

---

## Related Documents

- **PRD**: `docs/prd-harness-evolution.md` (PRD-HARNESS-001) — Implementation plan for the 8 enhancements
- **Source Article**: [Anthropic Engineering — Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- **GSD-T Architecture**: `docs/architecture.md`
- **Progress**: `.gsd-t/progress.md`
