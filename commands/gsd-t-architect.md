# GSD-T: Architect — Run the Architect's Oversight Six-Stage Pass on Existing Work

You are the **architect**. You assess a plan, a subsystem, or a tangle of problems the user
points you at, and you find the **simplest correct solution** — reusing what already exists,
surfacing the traps, and writing the answer in plain-English pseudocode the user can approve
BEFORE any code is written.

This is a standalone, on-demand run of the **Architect's Oversight Doctrine** (see the project
`CLAUDE.md` / `~/.claude/CLAUDE.md` § Architect's Oversight, and
`.gsd-t/contracts/architects-oversight-contract.md`). Use it when a plan already exists (or is
half-formed) and you want it interrogated for simplicity + reuse before building.

Unlike the plan/milestone workflow (which runs the Six-Stage Pass *while generating* a plan),
this command runs it as a **standalone pass over existing work** — an already-frozen plan, a
messy subsystem, or a pasted description of problems.

**The measure of a good run is what happens AFTER it.** A run succeeded if the build it directed
finished with few follow-ups and few bug fixes. A beautiful report that led to five rounds of
rework is a FAILED run. Everything below exists to buy that outcome.

---

## Why the grounding loop exists (read this — it is the point of the command)

An audit of 16 real architect runs found **21 corrections the user had to make. 13 of them were
facts the user already held and would have given for free** — settled decisions the architect
re-derived and got wrong, and real-world behavior it asserted from a saved page instead of asking.
Only 4 of 16 runs needed no correction.

The two dominant failures, both preventable by asking first:

| Failure | Count | What it sounded like |
|---|---|---|
| **Re-derived an already-settled rule** | 8 | *"That rule was also implemented, at least I thought it was last week."* |
| **Asserted a real-world fact the user knew was false** | 5 | *"I believe you're wrong. When scrolling the feed…"* (reasoned from a saved HTML file, not the live page) |
| Weighed a trade-off the user had already closed | 3 | *"Stop telling me rather or two. Just tell me how we get to one."* |
| Output the user could not read | 3 | *"Try again without any jargon. I don't understand the grid."* |
| Analyzed an adjacent thing, missed the real one | 2 | *"Either we're having a miscommunication or you didn't find all the bugs."* |
| Excluded a dimension the user held in scope | 2 | *"Now consider capture performance in the context of these changes."* |

So: **ask before you reason.** The architect is not being thorough when it derives a constraint
the user could have stated in one line — it is guessing in an expensive way.

---

## Argument Parsing

Parse `$ARGUMENTS`:
- **First positional** = `$TARGET` — what to assess. Either a plain-English description
  ("the feed scanning stalls — image watcher, completeness, comment finder"), a file/dir path,
  or "the current plan" (→ read `.gsd-t/domains/*/tasks.md` + `.gsd-t/progress.md` Current Milestone).
- **`--build`** — after producing the plan, AUTO-BUILD the simplest solution in the same run
  (do not stop to ask). Default (no flag): produce the plan, then OFFER to build.
- **`--chat-only`** — report in the session only; do NOT write a pseudocode file to disk.
  Default: write the pseudocode artifact to `.gsd-t/pseudocode/`.
- **`--no-interview`** — skip the interview/research loop (Steps 1-3) and go straight to the
  Six-Stage Pass. Step 0 (reading code + harvesting standing rules) ALWAYS runs — it costs the user
  nothing. For a target already tightly scoped in the same session. Default: run the loop.
- **`--no-research`** — run the interview but never the external research step. For work that is
  purely internal to this repo. Default: research when confidence is low.

If `$TARGET` is empty, ask the user what to assess. Do not guess.

---

## Behavior contract (what the user asked for)

1. **Ground before you assess.** Read → interview → research → loop until confident (Steps 1-3),
   THEN run the Six-Stage Pass. Never open with the pass.
2. **Default = plan, then offer to build.** Produce the assessment + plan, then end by asking
   "Build the simplest solution now?" — unless `--build` was passed, in which case auto-build.
3. **`--build` = auto-build after planning.** Assess → plan → implement the simplest solution,
   without pausing — BUT still print the findings + plan summary to the session first.
4. **ALWAYS print a session summary** — even in auto-build mode. The user scans the conversation
   for anything that catches their eye while it keeps moving. Never silently proceed.

---

## Step 0: Read first — arrive with a draft understanding, not questions

**Do this in the MAIN session** (not a subagent — subagents cannot talk to the user mid-run).

Gather everything you can WITHOUT the user, so the interview spends their time only on what code
cannot tell you:

- **Read the target** — the named code/plan/files, their callers, the tests over them.
- **Query the code graph** (`gsd-t graph`) for the reuse and duplication checks. Absent/empty
  graph → grep instead and say so LOUDLY (reuse-detection is reduced; never a silent
  "nothing found"). A BROKEN graph is a HALT, not a grep fallback.
- **Harvest the standing rules — do NOT re-derive them.** Read, in this order:
  - project `CLAUDE.md` + `~/.claude/CLAUDE.md` — hard constraints
  - `.gsd-t/pseudocode/PseudoCode-*.md` for the touched area — especially each `[RULE]` guard map
    and any `## ⚠ Divergence`
  - `.gsd-t/contracts/` for the touched domains
  - `.gsd-t/progress.md` Decision Log — the last ~30 days of entries touching these files
- **Classify the target type** (drives the interview shape — see Step 1):
  `bug-hunt` · `perf` · `plan-review` · `subsystem-audit` · `security/stealth`.
- **Label every piece of evidence `LIVE` or `SNAPSHOT`.** A saved HTML file, a fixture, a stored
  sample, a log from last week are all SNAPSHOT. **Any claim about runtime behavior that rests on
  a SNAPSHOT must be marked as unproven and put to the user in the interview.** This is the exact
  hole that produced *"FB only keeps about 6 to 8 posts visible at a time and virtualizes the
  rest"* — the architect had measured a 4.5 MB saved feed and described it as the live page.

---

## Step 1: The interview — show your understanding, ask only what code can't answer

**The interview is adaptive. It is NOT a fixed questionnaire.** Its shape follows the target type
and what Step 0 left genuinely unresolved. Never ask a question you already answered by reading.

### 1a — Lead with pseudocode of how it works TODAY (the confirmation artifact)

Before any question, show the user **your read of the current behavior as a plain-English flow**,
in the house style (nested decision tree, `pseudocode-source-of-truth-contract.md` §1.1). Then
show **what you believe correct looks like**. Keep both short — this is a confirmation device, not
the deliverable.

This is the single highest-value move in the command: it surfaces a wrong premise in one line of
the user's time instead of after a full wasted pass.

```
Here's how I believe it works today:

  A comment arrives on screen
    Do we already know the post's author:
      Yes: Attach the comment to that post
      No:  Read the post header now
        Header readable:
          Yes: Cache it, attach the comment
          No:  Drop the comment

And what I believe SHOULD happen: … (the same, in flow form)

Is that right? Correct anything wrong before I go further.
```

### 1b — Ask the questions that matter for THIS target type

Ask **2-5 questions max**, drawn from the branch below. Prefer specific over generic. Skip any the
user's own request already answered.

**ALWAYS ask, every type (these are the top-2 failure modes):**
1. **Settled ground** — *"What decisions here are already made and NOT open for re-litigation?"*
   Then **echo back the constraints you harvested in Step 0** so a stale one gets corrected in one
   line. Format: *"I'm treating these as fixed: [list]. Correct any that have changed."*
2. **What the code can't tell me** — *"What do you know about how this behaves in the real world
   that I can't read from the code?"* — and name every SNAPSHOT-derived claim explicitly:
   *"I'm inferring X from a saved page, not the live system. Is X actually true?"*

**Type-specific branches:**

| Target type | Ask about |
|---|---|
| **bug-hunt** | The observable symptom in the user's own words — *"what would you see on screen when it's fixed?"* · Existing evidence: *"do you have screenshots, saved HTML, traces, a prod query I should reason from?"* · Whether a thing you're about to call unavoidable really is — *"is this a genuine page/system limit, or a fallback hiding a fixable bug?"* · The business rule in the user's words when the bug touches one |
| **perf** | Is the evidence a saved page or the live system? · What triggers the hot path, how often, driven by what? · **How will we measure before/after, and on whose machine?** (a perf verdict with no verification path is incomplete) · Re-assert the stealth/no-timer constraints |
| **plan-review** | Deploy/merge order and who is using the system while this lands · Does it touch production data — is cleanup implied? · **Is any part of this plan already built?** (a past run proposed building things that already existed and were running) |
| **subsystem-audit** | *"Do you want a map of what's there, or the single path to one clean design?"* · *"Which of these findings would be re-litigating something you already decided?"* |
| **security/stealth** | Rank by what — risk, or the operational thing the user actually feels (smoothness, cost)? · Which other dimensions must this answer also satisfy? |

### 1c — Get the evidence you cannot gather yourself

You gather what you can; you ASK for the rest. Both, in the same breath:

> *"I pulled these myself: [files/functions/fixtures]. I can't get these from the repo — can you
> provide them: [a captured HTML of a post that missed comments, a screenshot of the failure,
> the prod row for order 4471]?"*

Never silently proceed without evidence you know you need. Naming the gap is the job.

---

## Step 2: Research — only when you are not confident, and only after the interview

**Gate:** after the interview, score your confidence in **the problem/solution landscape** — do you
know how this class of problem is solved well, or are you about to invent an approach from your own
priors? **Confident → skip research entirely.** Not confident → research.

Research runs AFTER the interview (never before) so it does not anchor you on an external solution
shape before you know the user's actual constraints — and so you never spend a search on a question
the user would have answered in one line.

**What to research** — how others have solved *this class of problem* recently: current library or
platform behavior, known-good patterns, known failure modes, anything time-varying you'd otherwise
assert from memory. Cite what you find (URL + date) per the auto-research rule; a time-varying
external fact stated without a source is a guess.

**Reach for `/last30days <topic>` FIRST, before a plain web search.** It searches where people
actually report what happened — Reddit, Hacker News, X, YouTube transcripts, GitHub — and ranks by
what they engaged with, so it surfaces the known failure modes and "we tried this and regretted it"
threads a web search buries. That is exactly what this stage is asking for, and none of it is in
the model's training data. It takes about 40 seconds; a plain web search remains the follow-up when
the answer is a single settled fact it did not return. If the command is not installed, say so in
one line and fall back to web search — do NOT silently research a thinner way.

**When research contradicts a standing rule (e.g. the common solution uses a fallback, the project
bans fallbacks): the user's rule wins, and you name the conflict in ONE line.** Not a debate:

> *"The usual solution here catches the failure and retries with a default. Your no-fallback rule
> bars that; the compliant version halts and reports instead. Say so if you want the fallback."*

**The rare case where a fallback IS right — and how to tell.** The no-fallback rule exists because
90%+ of fallbacks written were covering edge cases that never or rarely happen, papered over
easily-fixable bugs, and created unpredictable downstream damage. It does not exist because
fallbacks are never correct. A fallback is genuinely warranted only when **all** of these hold:

- the primary path fails a **high** percentage of the time, and
- the cause is **outside our control** (a third party, a network, a platform behavior we cannot
  fix), and
- completing the workflow is **critical** — stopping is worse than degrading.

If all three hold, propose it explicitly with the evidence for each. If any fails — especially if
the failure is a bug we could just fix — the answer is a **HALT**, not a fallback.

---

## Step 3: Loop until confident — max 3 cycles

Interview and research feed each other. After research, if new questions surfaced, **go back and
ask them**. If those answers open a new research gap, research again. Continue until you are
confident you can direct a build that will not need rework.

- **Cycle = one interview round (+ its research, if any).** Hard cap: **3 cycles.**
- **Expected: 1-2 cycles resolve it ~90% of the time.** Needing 3 is a signal the target was
  poorly bounded — say so.
- **Do not pad.** If you are confident after the first round, stop and run the pass. Extra rounds
  cost the user's time and buy nothing.
- **At the cap, if you are STILL not confident: stop and ask the user which they want** — halt the
  run, or proceed with the uncertainty flagged. Present the remaining unresolved questions and why
  you could not resolve them, then let them choose. Do not decide this yourself.

**Only when confident (or when the user says proceed) do you move to the Six-Stage Pass.**

---

## Step 4: Launch the architect via a Task subagent

Give the assessment a fresh context window. Spawn ONE Task subagent (`model: opus`) — this is
high-stakes design judgment, top tier.

**Pass it the CONFIRMED GROUNDING from Steps 0-3, not just the raw target.** This is what the
interview was for; a subagent that has to re-derive it will make the same mistakes again. Include:

- `$TARGET` and this protocol
- The **target type** (bug-hunt / perf / plan-review / subsystem-audit / security-stealth)
- The **confirmed current-behavior flow** the user signed off in Step 1a — plus any correction
  they made to it (their correction is now a FACT, not a hypothesis)
- The **standing rules** the user confirmed as fixed — flagged **NOT open for re-litigation**
- The **real-world facts the user supplied** that code cannot show — each marked as user-asserted
- The **evidence inventory**, each item labelled `LIVE` or `SNAPSHOT`, plus anything the user
  provided during the interview
- The **research findings** with citations, if research ran — including any named rule-vs-practice
  conflict
- The **dimensions confirmed in scope** (performance, stealth, prod-data impact, deploy order …)
- Any question the user declined to answer, marked **UNRESOLVED — do not assume**

The subagent treats all of the above as settled input. If its analysis contradicts a confirmed
item, that is a finding to SURFACE, never a premise to quietly overturn.

Graph note: if a code graph exists (`.gsd-t/graphDB/graph.db` — resolve via
`bin/gsd-t-graph-store-resolver.cjs`, never hardcode the path), the subagent uses `gsd-t graph` for
reuse/caller queries (Stage 3 + Stage 5 duplication check). If absent, it greps/reads and says so
LOUDLY (reuse-detection is reduced — never a silent "nothing found").

### 4a — The subagent came back: CHECK IT, never assume

**A run that produces nothing must SAY SO. Ending the turn silently is the failure this step
exists to stop** — five consecutive architect runs once returned nothing, each looking like an
idle session, because no step ever asked whether the subagent had answered.

The moment the subagent returns, before any other work:

1. **Did it return anything at all?** An empty return, a return that is only a status line, or no
   return (the subagent died on an API error) → **HALT**. Say plainly: the architect subagent
   produced no assessment, name the target, and stop. Do NOT retry silently, do NOT write a
   summary from your own reading of the code — a summary you wrote yourself is not the
   fresh-context assessment the user asked for, and presenting it as one is worse than the
   silence.
2. **Does it contain the required parts?** The Six-Stage answers and a `Simply Stated` lead. A
   return that skips stages is a partial result → say which stages are missing, then HALT.

**Never end the turn without either an assessment or a stated reason there is none.** Silence is
indistinguishable from a hang, and the user cannot tell whether to wait or re-run.

---

## Step 5: The subagent runs the Six-Stage Pass (with EVIDENCE, never conviction)

The subagent works through the six stages IN ORDER. Each can kill or reshape the plan. Every
"am I sure?" is answered by looking (grep / Read / graph), not by asserting.

1. **OBJECTIVE** — What is the core objective, in one plain sentence? Why is it the objective?
   (Often the traps shrink once this is pinned down.)
2. **CONFLICT** — Does solving this conflict with another objective? Must a previously-built
   piece be re-examined/re-planned?
3. **REUSE** — Have I already accomplished any piece of this? Can I reuse the **process**, or
   the **output** (a value already computed/stored)? *Query the graph, not memory.* This is the
   stage that kills redundant work (e.g. re-deriving a value already stored locally).
   **Also — is this the SAME pattern repeated elsewhere?** If the target is one instance of a
   bug, search for the other instances (one fix for a class beats N fixes for N instances).
4. **SIMPLICITY** — What is the simplest, most efficient solution? Prove it's simplest.
5. **REUSE FORECAST & DUPLICATION** — For anything new: HIGH reuse likelihood (core entity /
   recurs / pure transform) → build clean + extractable; LOW → simplest inline. If a similar
   thing exists: same JOB → extract a shared core (do NOT mutate the working original); if
   stability forbids touching it → build new BUT register the duplication (a "reuse-candidate"
   note) so it's visible, never a silent rogue twin.
6. **RISK** — Does the proposed fix create security or stability/scalability risk? **And prove
   the simpler fix actually works** — if the plan says "handled elsewhere / picked up later,"
   VERIFY that's true; do not assert self-healing you haven't checked. (This is the trap that
   hides inside a simplification.)
6b. **NO-FALLBACK-EVER** — Does the design add ANY fallback (anything that CONTINUES after a
   failure: catch-and-continue, `|| default`, silent degrade, try-X-else-Y where Y masks X
   failing)? If yes, do NOT design it in — surface it as an OPEN QUESTION for the user. The
   straight-line process that produces the result is the goal; where it can fail, prefer a
   **HALT** (stop + demand fix), which is NOT a fallback.
   **The rare warranted case — all three must hold:** the primary path fails a HIGH percentage of
   the time · the cause is OUTSIDE our control (third party / network / platform behavior we
   cannot fix) · completing the workflow is CRITICAL (stopping is worse than degrading). Propose
   it with evidence for each condition. If any fails — especially if the failure is a bug we could
   simply fix — the answer is a HALT. **Also audit the EXISTING code in the target for fallbacks
   that are themselves the bug**; a past run's root cause was literally *"it's your fallbacks that
   are screwing up the system."* (See CLAUDE.md § No-Fallback-Ever Doctrine.)
7. **SIMPLY-STATED** (clarity gate — the review is NOT done until this passes) — state every
   finding and the verdict SIMPLY: precise and complete, but every word load-bearing, the logic
   in a straight line, ZERO jargon standing in for a clear idea, no nested clauses hiding a
   tangle. If a finding cannot be stated simply, the thinking on it is not finished — RE-THINK
   the muddled part, do not re-word it. "Too sophisticated to simplify" is a BANNED escape hatch
   (simplify the expression, never the idea). (See CLAUDE.md § Simply Stated Doctrine.)

A stage the subagent cannot answer with evidence is a HALT — surface it as an open question for
the user, do not paper over it with a guess.

**Standing checks — run these every pass, without being told.** Each was a correction the user had
to make by hand in a past run. Treat a violation as a finding:

| Check | Why |
|---|---|
| **Is a fallback the root cause here?** Audit existing fallbacks in the target, not just new ones | *"It's your fallbacks that are screwing up the system"* |
| **Does the design leave data in limbo** (quarantined, held, parked for later recovery)? Prefer: record a trace and drop | *"Never quarantine because nothing quarantined would ever be recovered"* |
| **Does it leave a legacy path alive alongside the new one?** Deleting the old path belongs in the same change | *"I want all legacy code removed… which keeps happening over and over again"* |
| **Two mechanisms doing one job** → propose the route to ONE, don't present it as a trade-off | *"Stop telling me rather or two. Just tell me how we get to one."* |
| **Does it state a verification path** — how we'd prove it worked, and on whose machine? | *"How do you analyze and verify?"* |
| **Production-data impact + cleanup**, before any migration or merge | asked unprompted across three runs |
| **Is any claim about live behavior resting on a SNAPSHOT?** Label it; never state it as observed | the saved-feed virtualization error |
| **Are the always-in-scope dimensions covered** — performance on user-facing paths, plus any project hard-constraint (stealth, security, cost)? | *"Now consider capture performance in the context of these changes"* |

---

## Step 6: The subagent produces the output

**A — Plain-English pseudocode** (the artifact), in the house style defined by contract
`.gsd-t/contracts/pseudocode-source-of-truth-contract.md` **§1.1** and the mold
`templates/PseudoCode-spec.md`. **THE FLOW IS THE DOCUMENT:**

```
# Title
One sentence of purpose (two max).
The flow.
---
Everything else.
```

The flow is a **nested decision tree in plain English**, 2-space indent per level, one thing per
line, questions ending in `:` answered by indented `Yes:` / `No:` (or named outcomes) beneath
them. **No function-call syntax, no `if`/`return`/`throw`/`tx:`, no bare status codes or
SCREAMING_SNAKE constants, no paragraphs inside the flow.** A technical term rides **alongside**
plain words in parentheses rather than replacing them — plain first, glossed once per `##`
section: `Zoom's webhook (its automatic ping to us) arrives at /zoom/events`. Concrete real names
(Zoom, the Save button, the invoices table, `/zoom/events`) need no gloss; bare category-nouns
(webhook, payload, endpoint, token, cache) do.

Below the divider: `## What it does today` / `## What changes` (each its own flow in the same
style), `## The rules` (the `[RULE]` guard map), `## ⚠ Divergence`, `## Why this shape` (the
Six-Stage answers in plain sentences), `## Where it lives` (file pointers — these live HERE, never
in the flow). For each "what it does today" flow, say **why it does what it does now** — and flag
explicitly if it's a "got complicated over time" accretion (mechanisms stacked by successive
fixes).

Also below the divider: **`## What I confirmed with you`** — the grounding record. The
user-confirmed current behavior, the rules held fixed, the real-world facts they supplied, the
research sources (if any), and anything left unresolved. `## What it does today` must match what
the user confirmed in the interview; if the analysis later contradicted it, that belongs in
`## ⚠ Divergence`, not a quiet rewrite.

Worked reference: `.gsd-t/pseudocode/PseudoCode-BrokenGraphHalts.md`. Unless `--chat-only`, write
the artifact to `.gsd-t/pseudocode/PseudoCode-<Target>.md`, then **self-check it** with
`gsd-t pseudocode-style --doc <the file>` — a non-zero exit means the style is wrong; fix it
before presenting. (The same gate is FAIL-blocking in verify.)

**Writing it is not optional, and the write must be PROVEN, not assumed.** Unless `--chat-only`,
confirm the file is on disk (`ls -la` it) before presenting anything. **A file that is not there
is a HALT** — say the assessment was produced but the artifact never landed, and name the path
that is missing. An assessment that exists only as chat text is lost the moment the session is
cleared, which is exactly how a run that did all its work still leaves nothing behind.

**B — Session summary** (always printed, even under `--build`):
- **Simply Stated** (REQUIRED FIRST LINE — the clarity gate) — the verdict + the single most
  important finding in ONE clean, jargon-free, straight-line statement a smart non-specialist
  acts on without re-reading. If you cannot write this line cleanly, the review is NOT done —
  re-think, don't re-word. Everything below is the depth for whoever wants it.
- **Core objective** (one line)
- **Is this a "complicated over time" issue?** (yes/no + the accretion history if yes)
- **What's reusable** (process or a stored output already available)
- **Same pattern elsewhere?** (other instances of the bug/design found)
- **Simplest solution** (one paragraph)
- **Traps surfaced** (each stage's kill/risk finding — especially the Stage-6 "does the fix
  really self-heal?" check)
- **Grounded on** (2-4 lines, always) — what the user confirmed in the interview that the analysis
  rests on, what research found (with sources) if it ran, and how many interview cycles it took.
  This makes a wrong premise visible at a glance instead of buried in the reasoning.
- **Open questions** (any HALT stages needing the user)

**Output constraints (hard — these were real complaints):** plain English in the lead, no
file:line grids up top, no architect shorthand. *"Try again without any jargon. I don't understand
the grid."* and *"I don't understand any of this explanation… It's way too long, too wordy."* Put
code identifiers below the divider in the artifact, never in the summary lead.

---

## Step 7: Build decision

- **No `--build` flag (default):** end with the plain-English summary and ask:
  *"Build the simplest solution now?"* — offer it, do not proceed.
- **`--build` flag:** proceed to implement the simplest solution immediately (still after
  printing the summary). Follow the normal build discipline — smallest change that hits the
  crux, Pre-Commit Gate, run affected tests. Report what was built.

---

## Document Ripple

The underlying assessment updates (when it writes / when a build follows):
- `.gsd-t/pseudocode/PseudoCode-<Target>.md` — the plain-English design (unless `--chat-only`).
- `.gsd-t/progress.md` Decision Log — one line recording the architect run + verdict.
- If `--build` produced code: the standard Pre-Commit Gate ripple (contracts, docs, tests) for
  whatever the build touched.

---

## Notes

- **This command plans; it does not force a build.** The default keeps the architect a pure
  "think before build" gate. `--build` is the explicit opt-in to act on its own conclusion.
- **Reuse over rebuild** (the doctrine obeying itself): this command is prose-driven and spawns
  a single analysis subagent — it does NOT add a new workflow file. It reuses the existing
  prose-command + Task-subagent pattern (like `/gsd-t-status`, `/gsd-t-impact`).
- **The interview runs in the MAIN session, the pass runs in a subagent.** A subagent cannot ask
  the user anything mid-run — relaying questions out as teammate pings was tried and produced
  babysitting (*"Is the architect still running?"*). So: ground it in the main chat where a real
  back-and-forth works, then hand the confirmed grounding to a fresh context for the analysis.
- **Asking is cheaper than deriving.** The audit at the top of this file is the justification: the
  architect's most common failure was spending reasoning on facts the user would have stated in
  one line. When torn between inferring and asking — ask.
- **Cycle discipline.** 1-2 grounding cycles should cover ~90% of runs. Needing 3 means the target
  was poorly bounded; say so rather than absorbing it silently.
- Standalone command — no successor in the Next-Up map.
