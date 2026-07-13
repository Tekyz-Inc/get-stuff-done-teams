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

If `$TARGET` is empty, ask the user what to assess. Do not guess.

---

## Behavior contract (what the user asked for)

1. **Default = plan, then offer to build.** Produce the assessment + plan, then end by asking
   "Build the simplest solution now?" — unless `--build` was passed, in which case auto-build.
2. **`--build` = auto-build after planning.** Assess → plan → implement the simplest solution,
   without pausing — BUT still print the findings + plan summary to the session first.
3. **ALWAYS print a session summary** — even in auto-build mode. The user scans the conversation
   for anything that catches their eye while it keeps moving. Never silently proceed.

---

## Step 1: Launch the architect via a Task subagent

Give the assessment a fresh context window. Spawn ONE Task subagent (`model: opus`) — this is
high-stakes design judgment, top tier. Pass it the target and this protocol.

**Before spawning**, gather evidence sources so the subagent reasons from facts, not memory:
- If a code graph exists (`.gsd-t/graph.db`), the subagent uses `gsd-t graph` for reuse/caller
  queries (Stage 3 + Stage 5 duplication check). If absent, it greps/reads and says so LOUDLY
  (reuse-detection is reduced — never a silent "nothing found").
- Read the relevant code the target names (or the plan files).

---

## Step 2: The subagent runs the Six-Stage Pass (with EVIDENCE, never conviction)

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
   failing)? If yes, do NOT design it in — surface it as an OPEN QUESTION for the user, UNLESS
   you can cite a confirmed reproducible case only a fallback catches. The straight-line process
   that produces the result is the goal; where it can fail, prefer a **HALT** (stop + demand
   fix), which is NOT a fallback. (See CLAUDE.md § No-Fallback-Ever Doctrine.)

A stage the subagent cannot answer with evidence is a HALT — surface it as an open question for
the user, do not paper over it with a guess.

---

## Step 3: The subagent produces the output

**A — Plain-English pseudocode** (the artifact), in the house style — title + one-line purpose,
`CURRENT` (what it does today) and `PROPOSED` (the simplest fix) blocks, `# plain comment` inline,
a summary table, near-zero preamble. For each CURRENT block, say **why it does what it does now**
— and flag explicitly if it's a "got complicated over time" accretion (mechanisms stacked by
successive fixes). Unless `--chat-only`, write it to `.gsd-t/pseudocode/PseudoCode-<Target>.md`.

**B — Session summary** (always printed, even under `--build`):
- **Core objective** (one line)
- **Is this a "complicated over time" issue?** (yes/no + the accretion history if yes)
- **What's reusable** (process or a stored output already available)
- **Same pattern elsewhere?** (other instances of the bug/design found)
- **Simplest solution** (one paragraph)
- **Traps surfaced** (each stage's kill/risk finding — especially the Stage-6 "does the fix
  really self-heal?" check)
- **Open questions** (any HALT stages needing the user)

---

## Step 4: Build decision

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
- Standalone command — no successor in the Next-Up map.
