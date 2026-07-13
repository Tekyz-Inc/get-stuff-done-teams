# Contract: Architect's Oversight Doctrine (M101)

## Version: 1.0.0
## Status: STABLE
## Owner: m101-d-doctrine-contract (sole writer of shared seams)
## Producers: m101-d-doctrine-contract (§1 stages, §2 reuse logic), m101-d-hook-trigger (§3 hook), m101-d-workflow-gate (§4 gate), m101-d-jargon-plain (§5 plain-language)
## Consumers: gsd-t-plan.workflow / gsd-t-milestone.workflow (execution), gsd-t-verify.workflow (checks)
## Created: 2026-07-12 13:35 PDT

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
  answer the Six Stages in plain language (title + one-line purpose, `CURRENT`/`PROPOSED`
  blocks, `# plain comment` inline, summary table — the `.gsd-t/pseudocode/` house style).
  Missing/empty → FAIL.
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
