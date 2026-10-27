# Plan Review
A fresh agent reads a finished architect plan and the code, and reports where the plan is wrong before anything is built.

**Status: declined by David, 2026-10-26.** Too little value for the cost: most plan corrections are facts only the user knows, which a no-context reviewer cannot catch. Not built; no trial run.

```text
First, the trial decides whether to build any of it:
  Pick two past plans whose builds needed follow-up fixes
  Take each plan as it was the day it was approved (from the git history)
  Run the plan review on it with no knowledge of what went wrong later
  Did it flag at least one problem that a later fix actually corrected:
    Yes, for both: Build it
    No:  Drop the idea and record why
Once built:
  The architect finishes a plan and prints its summary
  Is the change risky (security, money, permissions, data, or high complexity):
    No:  Ask "Build the simplest solution now?" as today
    Yes: Offer a plan review before building
  The user runs the red team on the plan file
  The red team sees the target is a plan, not a code change
  It launches one fresh agent and waits for its answer
  The agent gets only the plan file, the standing rules, and access to the code and the code graph (the map of who calls what)
  The agent attacks the plan on four points:
    Every file, routine and table the plan names exists (checked with the code graph)
    Nothing is built that already exists or is not needed
    A newcomer can follow every step without asking what a term means
    Each failure and edge case has a path that stops loudly
  Did the agent send back a report:
    No:  Stop and say the plan review produced nothing
    Yes: Print each finding with the plan line it points at and the evidence
  Did it find a serious problem:
    Yes: Fix the plan, then review only the fixed part, at most twice
    No:  Ask "Build the simplest solution now?"
```
---
## What it does today

```text
The architect reads the code and the rules, interviews the user, and writes the plan
The same session that wrote the plan judges it
A style check (a script) catches code words and bad shape in the flow
The user approves, then it is built
For risky work the red team attacks the finished code, not the plan
```

v5 ran the architect's thinking in a fresh agent. v6 moved it back into the main session on purpose: the fresh agent's result was lost several times (it ran in the background and the session never received it). The plan review below keeps the fix that v6 made: one blocking agent, and stop if nothing comes back.

## What changes

```text
The red team accepts a plan file as its target
The architect offers it, for risky plans only, in its final step
Nothing else: no new command, no new agent types, no new files to install
```

## The rules

[RULE] plan-review-is-opt-in — it runs only when the user asks, offered for risky plans only.
[RULE] no-new-command — it lives inside the red team as a second kind of target.
[RULE] blocking-agent-or-halt — one agent, waited on; an empty return stops the run.
[RULE] evidence-or-not-a-finding — each finding cites the plan line plus code or graph evidence; an unbacked worry is not reported.
[RULE] settled-rules-not-reopened — the standing rules go to the agent as fixed; contradicting one is a finding, never a quiet override.
[RULE] trial-before-build — it ships only if the trial shows it catches real problems.

## What I confirmed with you

- Scope: decide whether this is a good addition and how to integrate it without bloating GSD-T. No build.
- No interview round: the target was scoped in the previous turn, so these questions are left open below instead.

## Why this shape

- **Objective.** Catch a wrong plan before code is written, using a reader who does not share the writer's blind spots.
- **Conflict.** v6 stopped running the architect in a fresh agent. This does not undo that: the plan is still written in the main session, which keeps the interview and the facts the user gave. The fresh agent only checks the result.
- **Reuse.** The red team already does this job for code: a blocking fresh agent, a halt on an empty return, a two-round limit, a short report. Pointing it at a plan reuses all of it.
- **Simplicity.** EGM uses five stages and seven reviewers. Two of those (layout, style) are already covered by the style-check script, and the reference check is done better by the code graph. Four attack points in one agent cover the rest.
- **Duplication.** A separate plan-review command would copy the red team's launch and halt rules. Folding it in avoids a second copy.
- **Risk.** The main limit: the architect's own notes say most corrections were facts only the user knew. A reader with no context cannot catch those. It can catch missing references, extra building, unclear steps and unhandled failures. Whether that is worth one agent run per risky plan is not proven, so the trial gates it.
- **No fallback.** An empty return halts; a finding without evidence is dropped rather than guessed at.
- **How we verify.** The trial: blind replays on past plans whose builds needed fixes (the same method used to test the old test-plan command in M115).

## Where it lives

- `commands/gsd-t-red-team.md` — Step 1 detects a `.gsd-t/pseudocode/PseudoCode-*.md` target; Step 2 gets a plan variant of the brief with the four attack points; Step 3 unchanged.
- `commands/gsd-t-architect.md` — Step 6 offers the red team on the plan for risky plans.
- Docs to update if built: `README.md`, `GSD-T-README.md`, `docs/GSD-T-README.md`, and the red team line in `templates/CLAUDE-global.md`.
- Trial candidates: `.gsd-t/pseudocode/PseudoCode-Talk.md` (followed by fixes in v6.2.21 and v6.2.25) and `.gsd-t/pseudocode/PseudoCode-WrongAppGuard.md`.
- Source idea: google/elephant-goldfish-model, `docs/designs/review.md` and `agents/` (read Oct 25, 2026).
