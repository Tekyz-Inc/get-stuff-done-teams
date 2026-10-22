# GSD-T: Red Team — Independent Adversarial Review of a Change

**Opt-in.** Use it when a change is high-complexity or touches security, money, permissions or
data integrity. Skip it for routine work.

The red team is a **fresh-context agent whose only job is to break the change**. It was not part of
writing it, so it doesn't share the builder's blind spots.

Its cost is turns: every turn re-reads the whole conversation, so a 100-turn run re-reads millions
of tokens. Keep it on the attack — the main session runs the suites, picks the categories that fit,
and later rounds attack only the fix.

## Arguments

`$ARGUMENTS` = what to attack: a branch, a commit range, a PR number, or a plain description
("the refund flow"). Empty → the uncommitted diff plus commits on this branch not on `main`.

## Step 1: Scope (main session)

- Resolve the target to a concrete diff (`git diff main...HEAD`, `gh pr diff <n>`, or the files named).
- Collect what the change must satisfy: the requirements or story it implements, the project's
  `.gsd-t/pseudocode/PseudoCode-*.md` rules for the area, and any contract it touches.
- **Run the full unit and E2E suites yourself** (headless) and keep the result line. Any failure is
  already a finding — fix it before spending a red team on the change.
- **Pick the attack categories that fit the change** from the list in Step 2, one plain reason each
  (a CLI installer has no tenants; a pricing change has no path traversal). Name the ones skipped.
  When unsure, include it.
- List the commands the agent needs to reproduce a bug (how to run one test, how to start the app).

## Step 2: Launch ONE blocking agent

`Agent({ subagent_type: "general-purpose", model: "opus", prompt: <brief> })` — **no `name`**,
so the call blocks and its return value is the report. Pass the diff scope, the requirements and
rules, the suite result, the chosen categories with their reasons, the run commands, and this protocol:

> You are a red team. Your value is **real bugs found**, not tests passed.
>
> **Rules**
> - Report only what you reproduced: *"I did X, expected Y, got Z"* plus the command or test that
>   proves it. An unreproduced concern is not a bug; style is not a bug.
> - Use `gsd-t graph` (who-calls, who-imports, body, who-uses) to find every caller and data path
>   the change reaches. Don't grep for structure.
> - Write zero feature code. You may write tests or scripts that demonstrate a bug.
> - The full suites already ran (result above). Don't re-run them; run single tests or your own
>   repro scripts.
> - Attack only the categories you were given. Go deep on the riskiest paths first; stop when each
>   category has a bug or a clear account of what held.
>
> **Attack categories** (the brief names which apply)
> 1. **Requirements** — does the change do what the story/rules say, including the cases nobody
>    wrote down (N>1 items, repeat runs, existing data)?
> 2. **Boundary inputs** — empty, null, huge, special characters, injection, path traversal.
> 3. **State** — out-of-order actions, double submit, concurrent access, refresh mid-flow.
> 4. **Permissions** — can a user reach data or actions that belong to another user, role or tenant?
> 5. **Money and data integrity** — rounding, duplicates, partial writes, retries that double-apply.
> 6. **Error paths** — missing env vars, dead dependencies, malformed input. Does it HALT loudly,
>    or continue silently? **A fallback that hides a failure is a bug.**
> 7. **Test depth** — do the tests prove behavior, or just that elements exist? Shallow tests are findings.
>
> **Report** (under 400 words)
> - **Verdict:** `FAIL` (any CRITICAL or HIGH) or `GRUDGING-PASS` (nothing found).
> - Per bug: `BUG-n`, severity CRITICAL/HIGH/MEDIUM/LOW, reproduction, expected, actual, proof.
> - Per category: what was tried, one line.

## Step 3: Check the return, then act

- **Empty or missing return → HALT** and say the red team produced no report. Never substitute
  your own review.
- Print a short summary: verdict, then bugs by severity (one plain line each).
- **CRITICAL/HIGH:** fix each, add the proving test, re-run the suites, then run a fresh red team
  **on the fix only**: the fix diff, the bugs it closes with their proof scripts, and the same
  categories. It re-runs each proof, then attacks what the fix touched. **Two rounds max** — still
  failing after two → HALT and report to the user.
- MEDIUM/LOW: list them; fix the cheap ones now, ask about the rest.

Add one `.gsd-t/progress.md` Decision Log line (if the project keeps one) with the verdict.
