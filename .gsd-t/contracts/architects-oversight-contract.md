# Contract: Architect's Oversight Doctrine (M101)

## Version: 1.1.0
## Status: STABLE
## Owner: m101-d-doctrine-contract (sole writer of shared seams)
## Producers: m101-d-doctrine-contract (§0 grounding, §1 stages, §2 reuse logic), m101-d-hook-trigger (§3 hook), m101-d-workflow-gate (§4 gate), m101-d-jargon-plain (§5 plain-language)
## Consumers: gsd-t-plan.workflow / gsd-t-milestone.workflow (execution), gsd-t-verify.workflow (checks), commands/gsd-t-architect.md (§0 grounding loop)
## Created: 2026-07-12 13:35 PDT
## Updated: 2026-08-05 10:10 PDT — added §0 (Grounding Loop) from a 16-run field audit

## Purpose

Fill the empty **architect seat**. GSD-T staffs only verifiers (Red Team, QA, code-review,
pre-mortem) — every one asks *"is this correct?"*. None asked *"is this the smartest, simplest
design given what already exists?"*. The result is the **wrong thing built correctly, tested
thoroughly, and shipped** — proven by the Binvoice completeness-scan waste: a whole-page DOM
scan that re-derived a comment count already stored locally, invisible under jargon until the
user interrogated it out over five rounds.

This doctrine is the sibling of the Unproven-Assumption Doctrine (M90):
- M90 bars an unproven **fact**.
- M101 bars an unproven **necessity** — building without proving the design is the simplest
  path and that no existing thing already does the job (or holds the answer).

The doctrine applies to GSD-T's own workflows (self-obedience, §6).

---

## §0 — The Grounding Loop (runs BEFORE §1; ground, then assess)

**Evidence.** A field audit of 16 real `/gsd-t-architect` runs (binvoice, 2026-07-12 → 2026-08-04)
found 21 user corrections. **13 of 21 were facts the user already held** and would have supplied
for free. Only 4 of 16 runs needed no correction.

| Failure | n | Representative correction |
|---|---|---|
| Re-derived an already-settled rule | 8 | *"That rule was also implemented, at least I thought it was last week."* |
| Asserted a real-world fact the user knew was false | 5 | *"I believe you're wrong. When scrolling the feed…"* (reasoned from a saved page) |
| Weighed a trade-off the user had closed | 3 | *"Stop telling me rather or two. Just tell me how we get to one."* |
| Output the user could not read | 3 | *"Try again without any jargon. I don't understand the grid."* |
| Analyzed an adjacent thing | 2 | *"Either we're having a miscommunication or you didn't find all the bugs."* |
| Excluded a dimension held in scope | 2 | *"Now consider capture performance in the context of these changes."* |

Root cause of the top two (13 of 21): **the architect reasoned where it should have asked.**

**The loop:** `read → interview → [confident? no] → research → (more interview / more research) → …`
Max **3 cycles**; 1-2 expected ~90% of the time. Confident at any point → proceed to §1.

**§0.1 — Read first.** Gather everything obtainable without the user: target code + callers +
tests, graph queries, and the standing rules (CLAUDE.md hard constraints, `[RULE]` guard maps in
the area's PseudoCode docs, touched contracts, ~30 days of Decision Log). Classify the target type
(`bug-hunt` / `perf` / `plan-review` / `subsystem-audit` / `security-stealth`). **Label every
evidence item `LIVE` or `SNAPSHOT`** — a claim about runtime behavior resting on a snapshot is
unproven and must go to the user.

**§0.2 — Interview (adaptive, never a fixed questionnaire).**
- **Lead with pseudocode of current behavior + intended behavior** for confirmation, in the
  §1.1 flow style. This is the highest-value move: a wrong premise dies in one line of the user's
  time instead of after a wasted pass.
- **Two questions are mandatory every run** (they map to the top-2 failure modes): *what is already
  settled and not open for re-litigation* (echo back the harvested rules so a stale one is
  corrected cheaply), and *what is true at runtime that the code cannot show* (naming every
  snapshot-derived inference explicitly).
- Remaining questions branch on target type. 2-5 total; never ask what reading already answered.
- **Gather what you can, ASK for what you can't** — name the gap explicitly (a captured HTML, a
  screenshot, a prod row). Never proceed silently past evidence you know you need.

**§0.3 — Research (gated on confidence, always AFTER the interview).** If unsure of the
problem/solution landscape, research how this class of problem is currently solved; cite sources
(URL + date) per the auto-research rule. Placed after the interview so it cannot anchor the
questions on an external solution shape, and so no search is spent on what the user would answer
in one line. `--no-research` disables.

**§0.4 — Rule-vs-practice conflict.** The user's standing rule wins; the conflict is named in ONE
line, not debated. **The narrow exception where a fallback is warranted requires ALL of:** primary
path fails a HIGH percentage of the time · cause is OUTSIDE our control · completing the workflow
is CRITICAL. The no-fallback rule exists because 90%+ of fallbacks written covered edge cases that
never or rarely fire, papered over easily-fixable bugs, and caused unpredictable downstream damage
— not because fallbacks are never correct. Any condition unmet → **HALT**, not fallback.

**§0.5 — Cap behavior.** Still not confident after cycle 3 → **present the unresolved questions and
ask the user whether to halt or proceed with the uncertainty flagged.** The architect does not
decide this alone.

**§0.6 — Hand-off.** The §1 pass runs in a fresh-context subagent, which **receives the confirmed
grounding** (confirmed behavior flow, fixed rules, user-supplied facts, LIVE/SNAPSHOT evidence
inventory, research findings, in-scope dimensions, unresolved items). Confirmed items are settled
input: analysis contradicting one is a finding to SURFACE, never a premise to quietly overturn.
The interview runs in the MAIN session because a subagent cannot ask the user anything mid-run.

**§0.7 — Success measure.** A run succeeded if the build it directed needed few follow-ups and few
bug fixes. A well-formed report that led to rework is a FAILED run.

---

## §1 — The Six-Stage Pass (run IN ORDER; each stage can KILL the plan)

Every "am I sure?" is answered with **EVIDENCE** — a grep, a Read, a graph query — never
conviction. Self-confidence is exactly what produced the waste.

| # | Stage | Question(s) | Kills |
|---|-------|-------------|-------|
| 1 | **Objective** | What is the core objective? Why is it the core objective? | Building the wrong thing |
| 2 | **Conflict** | Does it support/conflict with other core objectives? Must a previously-built objective be re-examined/re-planned? | Local win that breaks the system; frozen past decisions |
| 3 | **Reuse** | Have I already accomplished any piece of this? Can I reuse the **process**, or the **output** of that process? | Redundant work (the completeness-scan class) |
| 4 | **Simplicity** | Is this the simplest, most efficient plan? Am I sure? | Bloat |
| 5 | **Reuse forecast & duplication** | (see §2) | Over-engineering AND rogue-twin sprawl |
| 6 | **Risk** | Security risks? Stability/scalability risks? Am I sure? | Fast-but-fragile |
| 6b | **No-Fallback-Ever** | Does this add anything that CONTINUES after a failure? If yes → STOP + ask (or cite a proven case). Prefer a HALT. | Fallbacks that hide real failures |
| 7 | **Simply Stated** | State it simply (every word load-bearing, straight-line logic, no jargon/nesting). Can't → thinking not done → RE-THINK not re-word. HALT-as-defect. | Verbosity that hides muddled thinking → bugs |
| → | **Build** | | |

**Stage 3 split is load-bearing.** "Reuse the **output**" (the answer already produced and
stored) is distinct from "reuse the **code**". The Binvoice waste was a missed *output* reuse —
the captured count was already in the local store; the scan re-derived it from the DOM. Query
the graph, not memory (§3-graph).

---

## §2 — Reuse Logic (Stage 5 — avoid BOTH sprawl and stability-breakage)

**A. Reuse forecast** — score every new function against long-term project scope (read
requirements/architecture; do not guess):

| HIGH likelihood | LOW likelihood |
|-----------------|----------------|
| core domain entity | one-off UI/debug/glue |
| objective recurs across the roadmap | serves a single screen/flag/edge |
| pure transformation (input→output) | wiring (mutates one specific node/state) |

- **HIGH** → build **clean + extractable now** (clear inputs/outputs, no hidden coupling).
  NOT config-knobbed for imagined callers (that is the YAGNI trap). Register in the graph as
  `reuse-likely`.
- **LOW** → simplest **inline** thing. No abstraction, no flag.

**B. When a similar-but-not-reusable thing already exists:**
1. **WHAT vs HOW** — same job (WHAT) → generalize; merely similar-looking (different job, same
   HOW/surface) → build new. Never fuse two different jobs behind a `mode` flag.
2. **Generalize = extract, do NOT mutate.** Pull the shared logic into a new reusable core;
   leave the original calling it so old callers keep identical behavior. Blast-radius checked
   via the graph's caller set.
3. **If stability forbids touching it** → build new, **but register a `reuse-candidate` link in
   the graph** pointing at the twin, with the reason it wasn't merged. **Never build a silent
   rogue twin** — sprawl disables Stage 3's reuse-check for everyone after you.

**C. Wrong-forecast self-correction.** A LOW-forecast function that gets reused anyway is
surfaced by the graph's similarity check at the next Stage 3, firing the `reuse-candidate` debt.
The forecast need only be *directionally* right; the graph rescues the misses. **This is what
removes the paralysis** — act on the forecast, don't agonize over it.

**Graph dependency (per the standing "graph is an architectural anchor" rule):** the reuse-check
(§1 Stage 3) and duplication registry (§2B) are graph consumers. Absent/empty graph → the check
degrades to grep + an explicit LOUD warning that reuse-detection is reduced; it never silently
claims "nothing found".

---

## §3 — The Hook (trigger, not content)

`~/.claude/scripts/gsd-t-architect-oversight-guard.js` — a **PreToolUse** hook on `Write|Edit`.

- Injects **one line** pointing at the doctrine, at the build moment (about to write code).
- Scope gates: GSD-T project only (`.gsd-t/` present) AND target is **code**, not prose
  (skips `.md`/config/asset extensions and any `docs/`|`pseudocode/` path — the doctrine's own
  artifacts are markdown; reminding while authoring them is noise).
- **Fail-open, non-negotiable:** never blocks a write, never throws, exit 0 always. Malformed
  payload / missing field / any error → silent pass-through.
- Carries NO nuance — that stays in CLAUDE.md. Injecting the doctrine ≠ executing it; the hook
  only guarantees it is *considered*.

**§3-graph — Stage 3 evidence.** The reuse-check consults `gsd-t graph` (similarity / caller
neighborhood). The hook does not run the query — it reminds; the *workflow* (§4) runs it.

---

## §4 — The Workflow Gate (execution, with teeth)

The Six-Stage Pass runs as **blocking stages** inside plan/milestone, before pseudocode is
finalized and before execute. Each stage records its EVIDENCE answer. The reuse stage runs the
graph query. A stage that cannot answer with evidence HALTS (needs-human), it does not proceed
on conviction.

**Verify checks (fail-closed, like M90 R-FAIL-*):**
- **A-FAIL-1 — pseudocode-completeness:** the milestone's PseudoCode document must exist and
  answer the Six Stages in plain language, under `## Why this shape` below the divider. The
  document's SHAPE and WORDING are governed by
  `pseudocode-source-of-truth-contract.md` **§1.1** (flow-first: `# Title` → one sentence of
  purpose → the nested plain-English decision-tree flow → `---` → everything else; technical
  terms glossed alongside plain words; code identifiers below the divider only) and gated
  mechanically by `bin/gsd-t-pseudocode-style.cjs`. Missing/empty → FAIL; style violations →
  FAIL via the style gate.
- **A-FAIL-2 — reuse-evidence:** Stage 3 must show a graph query (or a logged LOUD degradation
  when the graph is absent). A Stage-3 answer with no evidence trail → FAIL.
- **A-FAIL-3 — no silent twin:** if execute created a function the graph flags as a near-duplicate
  of an existing one AND no `reuse-candidate` link was registered → FAIL.

When a check is de-scoped for a given milestone (e.g. no graph yet), it is a DOCUMENTED
no-op-PASS distinguishable from wired-but-broken (same discipline as M90 §4).

---

## §5 — Plain-English Proof + Jargonless Output

**Plain-English proof.** The Six-Stage answers are written into the milestone's **PseudoCode
document** in plain, jargon-free language. Jargon is where unexamined complexity hides — a
layman-legible sentence has nowhere for a pointless operation to survive. The pseudocode IS the
audit and lets the user approve **direction before code** as the senior reviewer, not a
rubber-stamp. It is always available to review, never mandatory to review — the goal is that
GSD-T plans correctly so the user *need not* audit.

**Jargonless output (co-equal with brevity, NOT a trade-off).** Short and clear are different
axes; jargon is short, so brevity rules alone reward it. Absorbs backlog #47. Applies to every
reply, plan, options-prompt, and mid-work narration. Crux: individual shorthand may be
decodable, but several mashed into one sentence become unintelligible — never force the reader
toward an "I don't understand" escape hatch; if that option would help, the sentence already
failed. Enforced by the Reader Contract injected every turn
(`scripts/gsd-t-auto-route.js` `READER_CONTRACT`).

---

## §6 — Self-Obedience

GSD-T's own build workflows obey this doctrine. A GSD-T milestone that adds/changes code runs the
Six-Stage Pass and produces its own PseudoCode document (this milestone did — see
`.gsd-t/pseudocode/PseudoCode-ArchitectsOversight.md`).

---

## §7 — Guard Map (grep-checkable invariants)

| Guard | Invariant | Enforced by |
|-------|-----------|-------------|
| G-1 | Doctrine block present in `~/.claude/CLAUDE.md` + `templates/CLAUDE-global.md` | doc-ripple |
| G-2 | Hook registered in `settings.json` PreToolUse `Write\|Edit` | settings + test |
| G-3 | Hook fails open (garbage stdin → exit 0, no output) | hook unit test |
| G-4 | Six-Stage order preserved (Objective→…→Risk→Build) | contract = source |
| G-5 | Stage 3 output-reuse split present (process AND output) | contract = source |
| G-6 | Reuse-forecast HIGH/LOW + graph self-correction present | contract = source |
| G-7 | PseudoCode house-style defined + this milestone's pseudocode exists | A-FAIL-1 |
| G-8 | §0 grounding loop precedes §1 in `commands/gsd-t-architect.md` (interview before pass) | contract = source |
| G-9 | Interview cap = 3 cycles; at-cap behavior is ask-user, never silent proceed | contract = source |
| G-10 | Research is gated on confidence and placed AFTER the interview | contract = source |
| G-11 | Confirmed grounding is threaded into the §1 subagent, not re-derived | contract = source |
