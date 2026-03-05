# AI Evals × GSD-T: Critical Analysis

**Date:** 2026-02-25
**Objective:** Evaluate whether AI evals make sense for GSD-T, given the goal of building a predictable system that produces sophisticated, well-architected, highly maintainable, high-quality software.

---

## What AI Evals Actually Are

AI evals (evaluation frameworks) are the systematic practice of measuring how well AI systems perform against clearly defined acceptance criteria. The core loop:

```
Input → LLM system → Output → Evaluator (LLM-as-judge / metrics / human) → Score
```

**The critical distinction** (from the source course):
- **Model evals**: Is this LLM model good at task X? (SWE-bench, MMLU, benchmarks)
- **Product evals**: Is YOUR AI-powered product working correctly for YOUR users?

GSD-T is neither of these. GSD-T is a **development workflow** — which puts it in a third category.

### What the Leading Frameworks Actually Do

| Framework | Designed For | Primary Metrics |
|---|---|---|
| **RAGAS**      | RAG pipelines            | Faithfulness, context precision/recall, answer relevancy |
| **DeepEval**   | LLM apps (chat, RAG)     | Hallucination, relevancy, task completion, tool correctness |
| **PromptFoo**  | Prompt A/B testing       | Output quality, robustness, prompt variant comparison |
| **LangSmith**  | LangChain-based apps     | Tracing, logging, bias/safety, human feedback |
| **Braintrust** | Production AI systems    | CI/CD integration, regression testing, observability |
| **Bloom**      | Agentic behavioral evals | Behavioral conformance for frontier AI agents (Anthropic, Dec 2025) |

**Notable absence**: None of these are designed for evaluating AI-assisted software development workflows.

---

## The Central Critical Question

**Is GSD-T's problem an "output quality measurement" problem?**

The goal is **predictable** output. The word *predictable* is the tell.

AI evals are a **measurement** mechanism, not a **predictability** mechanism. You can discover that 73% of your outputs score well — but that does not eliminate the bad 27%. It does not prevent the next bad output. Measurement without process control does not produce predictability.

GSD-T's actual predictability problems are **process and constraint problems**:

| Problem | GSD-T's Solution |
|---|---|
| Claude makes wrong assumptions | Assumption audit directives (7 categories, v2.31.18) |
| Claude goes down wrong debug paths | Deep research escalation (v2.31.19) |
| Claude doesn't maintain architecture | Pre-commit gates + contracts + QA agent |
| Claude drifts from requirements | Requirements traceability, gap analysis, verify phase |

None of these failures are fundamentally "output quality scoring" problems. They are guardrail problems — and GSD-T already has guardrails.

---

## The Most Important Finding: GSD-T Is Already Doing Eval-Driven Development

Anthropic's own guidance on evals: **"Define success criteria before building."**

Their recommended pattern:
```
Define eval criteria → Build system → Run evals → Iterate
```

GSD-T's pattern:
```
Write contracts (success criteria) → Execute → QA agent verifies → Iterate
```

These are structurally identical.

**GSD-T contracts ARE evals.** The partition phase's contract definitions — API shapes, acceptance criteria, quality thresholds — are precisely what Anthropic means by "evaluation criteria." GSD-T has been doing eval-driven development without using the word.

This is the most important reframe: you don't need to ADD evals to GSD-T. You need to recognize that contracts already ARE the eval layer. The question is whether the contracts are expressive enough.

---

## For AI Coding Agents, Test Passage IS the Primary Eval Metric

From SWE-bench — the leading coding agent benchmark — the success criterion is:

> A task is resolved if previously failing tests now pass AND all existing tests still pass.

That is exactly what GSD-T's QA agent checks. The research confirms:

> For software development agents, **deterministic test passage outperforms LLM-as-judge** for measuring correctness.

RAGAS, DeepEval, LangSmith are not the right tools for evaluating whether an agent correctly implemented a feature. They are designed for RAG pipelines and chatbots. For coding agents, SWE-bench's approach (tests pass = success) is the right model — and GSD-T already implements it.

By 2026, the best coding agents (Claude Sonnet 4.5, Claude Sonnet 4) resolve ~43-44% of real SWE-bench Pro issues using this exact metric.

---

## The LLM-as-Judge Problem

The research is specific and damning:

- Legal AI tools hallucinate **17-33% of the time despite using RAG**
- LLM-as-judge evaluations can themselves hallucinate incorrect scores
- You need a meta-judge to check the judge (compounding non-determinism)
- LLM judges have known biases: positional bias, verbosity preference, self-preference
- Agreement with human experts is 80-90% — only when rubrics are clear, model is capable, and chain-of-thought is used

**For a system designed for predictability, introducing LLM-as-judge scoring into quality gates is the wrong direction.** More determinism, not less, serves the predictability goal.

---

## Where AI Evals DOES Apply to GSD-T (Narrowly)

**Scenario**: A GSD-T-managed project is building an AI-powered product — a RAG chatbot, an LLM-based classifier, an AI agent.

Those systems need eval criteria as part of their quality definition. Example contract:

```markdown
## AI Component Contract

**Component**: Document Q&A system
**Eval criteria**:
- Faithfulness score ≥ 0.85 (RAGAS)
- Answer relevancy ≥ 0.80
- Hallucination rate < 5%
- Latency P95 < 2s

**Evaluation method**: `npm run evals` (runs RAGAS suite against golden dataset)
**Dataset location**: `tests/evals/golden-qa-pairs.json`
**Pass/fail**: All thresholds must be met for QA to PASS
```

The QA agent should verify:
1. Eval criteria are defined in the contract
2. The eval command is runnable
3. The command produces a pass/fail result

**Notice what this is**: eval criteria IN contracts. GSD-T enforces the pattern exists and is executable. The project owns the framework choice (RAGAS, DeepEval, PromptFoo, custom). GSD-T never prescribes specific eval frameworks.

This is narrow but real value — and only applicable to GSD-T projects with AI components.

---

## Anthropic's Bloom: The Actually Relevant Framework

Anthropic released **Bloom** (Dec 2025) — an open-source agentic framework for automated behavioral evaluations:

> Takes researcher-specified behaviors and builds targeted evaluations measuring how often and how strongly those behaviors appear in realistic scenarios.

This is NOT about LLM output quality scores. It measures **behavioral conformance** — whether a system consistently exhibits specified behaviors. This is the right framework for evaluating GSD-T's own command behavior across versions, not RAGAS.

---

## The Unexplored Angle: GSD-T Behavioral Conformance Testing

The most valuable eval-inspired idea for GSD-T is not evals for projects GSD-T builds — it is evals for GSD-T itself.

A behavioral conformance test suite for GSD-T commands:

```
For gsd-t-partition:
  Given: requirements.md with N requirements
  Expected: N domains defined, each with scope.md, no missing contracts
  Assertion: deterministic filesystem checks (not LLM-as-judge)

For gsd-t-execute:
  Given: a plan with M tasks
  Expected: M task commits, all tests passing, no orphaned requirements
  Assertion: git log inspection + test runner results

For gsd-t-complete-milestone:
  Given: active milestone with completed domain tasks
  Expected: milestone archived, version bumped, git tag created
  Assertion: filesystem + git verification
```

This would:
- Catch GSD-T regressions as command files evolve between versions
- Provide coverage for command behavior (currently zero coverage — test suite only covers the CLI installer)
- Use deterministic assertions, not LLM-as-judge
- Directly serve the predictability objective

Current GSD-T test coverage: 125+ tests for `bin/gsd-t.js` (CLI installer). Zero tests for command file behavior. This is the real gap.

---

## Critical Assessment of Backlog Item #7

**Current framing** (backlog item #7):
> "gsd-t-evals command or integration into gsd-t-qa that runs LLM output evaluation suites, integrates with RAGAS/LangSmith/PromptFoo..."

**Problems with this framing**:

1. **Wrong tool category**: RAGAS/LangSmith/PromptFoo are for RAG/chat apps. Wrong tools for the job.
2. **Prescribes framework choice**: GSD-T should never force a specific eval framework. Projects own that decision.
3. **Narrow applicability**: Only useful for GSD-T projects building AI-powered apps. Most GSD-T users build traditional software.
4. **Adds non-determinism**: LLM-as-judge in quality gates undermines the predictability objective.
5. **Eval datasets**: Requires curated test datasets the developer must create. GSD-T can't generate meaningful evals for arbitrary projects — that is domain knowledge only the project owner has.
6. **Misses the real insight**: GSD-T already IS eval-driven. The opportunity is making that explicit, not adding a new layer.

---

## Assumptions Challenged

| Assumption | Verdict |
|---|---|
| AI evals = quality improvement | Wrong. Evals = quality *measurement*. Measurement alone doesn't fix bad outputs. |
| LLM-as-judge is reliable for code quality | Wrong. For deterministic code correctness, a compiler and test suite are always better. |
| GSD-T should integrate eval frameworks | Wrong. GSD-T should enforce eval CONTRACT PATTERNS. Projects own their frameworks. |
| GSD-T needs evals to be predictable | Wrong. GSD-T's frontier is deterministic guardrails, not probabilistic quality scoring. |
| Contracts and evals are different things | Wrong. GSD-T contracts ARE eval criteria. The pattern already exists. |

---

## Recommendations

### Option A: Narrow the backlog item (minimal change)

Rewrite item #7 as:

> **"AI Component Contract Pattern"** — when a GSD-T project contains AI components (LLM calls, RAG pipelines, agent behaviors), contracts MUST define eval criteria: expected input/output shape, quality thresholds (numeric), evaluation method (runnable command), and dataset location. The QA agent verifies these are defined and that the eval command produces a pass/fail result. GSD-T is framework-agnostic — projects choose RAGAS, DeepEval, PromptFoo, or custom tooling. GSD-T enforces the pattern, not the tooling.

### Option B: Replace the backlog item (better)

Replace item #7 with two items:

**Item A: Explicit Eval-Driven Contract Language**
> Formalize that GSD-T contracts are already evaluation criteria. Update contract templates and partition guidance to use explicit eval language: "acceptance criteria" replaces vague "requirements"; quality thresholds require numeric values; AI-component domains require an eval contract section. The partition command should prompt for eval criteria when AI components are detected.

**Item B: GSD-T Behavioral Conformance Suite**
> A test harness that evaluates GSD-T command behavior deterministically against controlled input scenarios. Run after each version release to catch regressions in command behavior. Assertions are deterministic (filesystem, git, test runner) — not LLM-as-judge. This fills the zero-coverage gap in GSD-T's own test suite for command-level behavior. Watch Anthropic's Bloom framework for tooling as it matures.

### Option C: Both A and B above (recommended)

---

## Summary

AI evals (as the industry defines them) solve a different problem than GSD-T's core problem.

- **AI evals answer**: "Is my LLM-powered product producing good outputs?"
- **GSD-T's problem**: "Is my AI-assisted development process reliably producing good software?"

These are related but distinct. GSD-T is already doing eval-driven development through contracts. The right next steps are making that explicit, enforcing it for AI-component projects, and building deterministic behavioral conformance testing for GSD-T itself — not integrating RAGAS or LangSmith.

The predictability objective is served by **more determinism**, not measurement. Better guardrails, stronger contracts, and conformance testing give predictable outcomes. Probabilistic quality scores do not.

---

## Key Sources

- [Anthropic: Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Anthropic Bloom: Open-source behavioral evals (Dec 2025)](https://alignment.anthropic.com/2025/bloom-auto-evals/)
- [LLM Eval Driven Development with Claude Code — Fireworks AI](https://fireworks.ai/blog/eval-driven-development-with-claude-code)
- [Anthropic: Define success criteria and build evaluations](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)
- [SWE-bench: coding agent benchmark](https://github.com/SWE-bench/SWE-bench)
- [DeepEval: LLM evaluation framework](https://github.com/confident-ai/deepeval)
- [Best 7 LLM Evaluation Tools of 2026](https://www.techloy.com/best-7-llm-evaluation-tools-of-2026-for-genai-systems/)
- [LLM-as-a-Judge: Complete Guide — Langfuse](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge)
- [AI Evals for Everyone course](https://github.com/aishwaryanr/awesome-generative-ai-guide/tree/main/free_courses/ai_evals_for_everyone)
