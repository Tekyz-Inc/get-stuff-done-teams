# Opus 5 vs the GSD-T rulebook — findings

**Date:** 2026-08-06 · **Branch:** `opus-5-claude` · **Status:** analysis + draft. Nothing installed.
**Artifacts:** this file (findings) · `CLAUDE-global-draft.md` (the ~185-line replacement)

---

## Stated simply

**The 697-line rules file is two different things badly mixed: reminders the model no longer needs, and re-explanations of rules that code already enforces. About 250 lines are backed by a hook or gate that works whether the words are there or not. Nine rules have nothing but words behind them — those are the only ones that can actually be ignored, and four of them are serious.**

Cutting to ~185 lines is far safer than it looks, because **most of what gets deleted was never doing the enforcing.**

---

## The reframe that changed the pass

The first draft of this document asked "what is obsolete?" The user's answer redirected it:

> *"The prose gets ignored too often. It makes me think maybe the CLAUDE.md file has gotten too complex."*

That is a live observation of real behavior, and it splits every rule in two:

| | If the prose is ignored |
|---|---|
| **~250 lines** backed by a hook, lint, or gate | Nothing happens — the mechanism catches it regardless |
| **9 rules** with nothing but prose | **It silently does not happen** |

Length and ignoring are different problems with different fixes. **Subtraction fixes length. Mechanisms fix ignoring.** Both are needed; neither substitutes for the other.

---

## Part 1 — What changed, Opus 4.5 → Opus 5

The rules were authored in the 4.5/4.6 era, so that is the baseline.

| | Opus 4.5 | Opus 5 | Why it matters here |
|---|---|---|---|
| Context window | 200K | **1M** (5×) | Whole-repo reasoning |
| Max output | 64K | **128K** | Bigger single-pass deliverables |
| Thinking | manual `budget_tokens` | **adaptive, on by default** | The old knob no longer exists |
| Effort levels | 3 (`low`–`high`) | **5** (`low`–`max`) | A cost/quality dial GSD-T does not use at all |
| Price | $5/$25 per Mtok | **$5/$25 — same** | The capability jump is free |
| Knowledge cutoff | May 2025 | **May 2026** | A year less "go research this" |
| Prompt-cache minimum | 4096 tokens | **512 tokens** | 8× more cacheable surface, unexploited |

**Verified LIVE** against Anthropic's models overview, fetched 2026-08-06.

### The behavioral shifts that break old rules

| Shift | Consequence |
|---|---|
| **Self-verifies by default** | "Verify your work" causes *over*-verification. Anthropic's guidance: delete those instructions. |
| **Follows instructions more literally** | Volume stopped being free — more lines means more literal compliance with the *wrong* line. |
| **Delegates to subagents readily** (4.8 under-delegated) | Any "delegate more" guidance is now backwards; needs a cap. |
| **Longer default output** | Conciseness must be prompted. Lowering effort does *not* shorten output. |
| **Expands task scope** | Needs an explicit scope-discipline instruction. |
| **Narrates self-corrections at length** | Reads as thrash without a corrections rule. |

**The pattern: every new rule is a brake.** Old rules pushed a reluctant model to do more; new ones restrain a capable one from doing too much. That inversion is the most useful sentence in this document.

---

## Part 2 — The enforcement audit

Method: read all 697 lines, then map every rule to the code that enforces it — `settings.json` hooks, `bin/*.cjs` gates, `scripts/*.js`, verify-gate check ids. **No code graph exists in this worktree**, so reuse was checked by grep and file reads: thorough but manual, not graph-proven.

### Category 1 — MECHANISM (~212 lines → ~21)

Code enforces these. Prose is reducible to a pointer.

| Rule | Enforcer (verified wired) | Lines → target |
|---|---|---|
| Live Clock Rule | `scripts/gsd-t-date-guard.js` | 7 → 1 |
| One session per tree | `scripts/gsd-t-worktree-guard.js` | 4 → 1 |
| Reader Contract / brevity | `scripts/gsd-t-auto-route.js` (every turn) | 35 → 4 |
| Architect Six-Stage trigger | `scripts/gsd-t-architect-oversight-guard.js` | 28 → 2 |
| Unproven-Assumption Doctrine | `research-gate` / `architectural-trigger` / `loop-ledger` | 35 → 2 |
| PseudoCode Style | `bin/gsd-t-pseudocode-style.cjs` (FAIL-blocking) | 45 → 2 |
| Logging defaults | verify-gate `logging-envelope` | 9 → 1 |
| Environment registry | verify-gate `env-registry` | 12 → 2 |
| Integer primary key | verify-gate `schema-id` | 10 → 1 |
| Playwright / E2E | verify-gate `playwright` | 10 → 2 |
| Test-data cleanup | `bin/gsd-t-test-data-ledger.cjs` | 2 → 1 |
| Model tier policy | `bin/gsd-t-model-tier-policy.cjs` + lint | 12 → 1 |
| CI parity | `build-coverage` + `ci-parity` | 3 → 0 |
| Secrets | verify-gate `secrets` (gitleaks) | inline → 1 |

**This is the largest cut and the safest one.** The enforcement does not live in the words.

### Category 2 — PROSE-ONLY, LOAD-BEARING (the dangerous nine)

Ranked by what a violation costs.

| # | Rule | Cost if ignored | Recommended mechanism |
|---|---|---|---|
| **1** | **Destructive Action Guard** | **Irreversible data loss** | Hook on `Bash` matching destructive SQL and history-rewriting git verbs → deny with a prompt to ask. A `Bash` guard pattern already exists in the repo; the slot is free. **Highest priority by a wide margin.** |
| **2** | **Pre-Commit Gate** (13-item doc checklist) | Docs and code silently diverge — then "read the docs, don't re-research" reads stale docs | Hook on `git commit` running a doc-ripple check on the staged diff; block if a triggered doc is untouched |
| **3** | **Document Ripple Gate** | Partial work reported as done | **Same rule as #2, stated twice, 20 lines apart.** Route to one. |
| **4** | **No-Fallback-Ever** (general case) | The exact bug class the doctrine exists to stop | Today it only *reminds* — the guard injects a line and always exits 0, never blocks. A static lint genuinely cannot judge "proven-necessary". Recommend a verify-stage agent that diffs for new catch-and-continue / `\|\| default` and FAILs any uncited one. |
| 5 | Secret handling | Credential leak | Partly covered (registry check + gitleaks). Gap: a secret written to any other file pre-commit. Extend to a PreToolUse Write scan. |
| 6 | API Documentation Guard | Undocumented endpoints accumulate | Verify-gate check: diff adds a route handler, no OpenAPI file changed → FAIL. Mechanically decidable. |
| 7 | GSD-T-native effort units | Misleading estimates reach the user | Pattern check in the existing `gsd-t-jargon-lint.cjs` |
| 8 | Conversation vs. Work | Wasted spend | Partly handled by the auto-route hook. Low risk — keep as prose. |
| 9 | Auto-Init Guard | Commands run unprepared | Low risk — commands mostly self-heal. |

**Items 1–4 are the real exposure.** 5–9 do not justify new machinery on their own.

### Category 3 — PROSE-ONLY, NOT LOAD-BEARING (~150 lines, delete)

Work Hierarchy diagram · Living Documents table · **Next Command Hint successor table (36 lines — the largest single deletable block)** · No-Re-Research decision tree · Autonomy Levels table · Stack Rules Engine description · Recovery After Interruption · Code Standards line/function limits (enforced by `complexity`) · Versioning mechanics · Markdown Tables pointer-to-a-pointer · Prime Directives 2 and 3 (third statement of the same idea).

**Naming conventions block is not just deletable — it is wrong.** It mandates `snake_case` files; this codebase is JavaScript with kebab-case.

### Category 4 — OBSOLETE (Opus 5 makes it wrong or harmful)

| Rule | Verdict | Why |
|---|---|---|
| **"ALWAYS self-verify work"** (stated twice) | **Harmful — delete** | Opus 5 self-verifies; the instruction causes over-verification with no gain |
| **"Never touch more than 3 files without pausing"** | **Harmful — delete** | A 1M-context model trips it constantly, and it contradicts both Prime Directive 4 (autonomy) and Level 3 Full Auto |
| "If `[GSD-T NOW]` is absent, fall back to `currentDate`" | **Wrong — replace with HALT** | See below |
| "Opus 4.7/4.8 ship 1M context" | Stale | Opus 5 does too |
| M86 profiles switching Fable vs Opus | Stale | Fable removed 2026-07-24 |
| Token-budget / `budget.total` guidance | Stale | Meter retired in M61; prose survived it |
| Red Team "high-severity only" framing | **Harmful** | Opus 5 follows severity filters literally and drops real bugs. In `red-team-subagent.md`, not this file — but caused by it. |

---

## Part 3 — Three things nobody was looking for

**1. The file contains a banned fallback, inside the rule that bans fallbacks.** The Live Clock Rule says *"if `[GSD-T NOW]` is absent, fall back to `currentDate`"* — nine lines above the paragraph forbidding `currentDate` and naming the correct straight-line command. A stale timestamp then gets written to real files. This is a defect, not a style point.

Two more fallback-shaped rules: *"no branch guard → proceed but warn"* (silent degrade past a missing precondition), and the worktree guard's documented fail-open (probably correct, but stated as a feature with no cited proven case — which the doctrine forbids).

**2. `scripts/gsd-t-brevity-guard.js` is dead code.** 380 lines on disk; `bin/gsd-t.js` actively removes it from `settings.json` as a retired hook.

**3. Brevity is stated four times.** Output Style section, Reader Contract section, Simply Stated Doctrine's conversational clause, and the block re-injected every turn by the hook. Only the hook fires. **A rule about being concise, restated four times inside a 697-line file, is the clearest evidence available that the file fails its own Simply Stated gate.**

---

## Part 4 — The replacement

Drafted at [`CLAUDE-global-draft.md`](CLAUDE-global-draft.md). **~185 lines, down from 697.**

Organizing principle: **the file holds only what a human is the sole source of** — facts the model cannot know, preferences that are genuinely arbitrary, and stop-signs whose violation is irreversible.

Sections, ordered by consequence because salience decays down the page:

| # | Section | ~Lines | Earns its place because |
|---|---|---|---|
| 1 | **Stop signs** | 25 | Irreversible consequences. Nothing may sit above these. Compressed from ~90 with no policy change. |
| 2 | **How I want output** | 15 | Genuinely arbitrary preference. Stated **once**, not four times. |
| 3 | **Working with Opus 5** *(new)* | 15 | The brakes |
| 4 | **How work runs** | 20 | Autonomy, phase flow, banner, effort units |
| 5 | **Enforced by machine** | 25 | Replaces ~212 lines with a pointer table |
| 6 | **Doctrines** | 20 | Policy here, detail in the contract |
| 7 | **Things you cannot infer** | 35 | Worktrees, env registry, versioning, casing, integer PK, API docs, E2E |
| 8 | **Standing don'ts** | 12 | The short list that survives |
| 9 | **Before adding to this file** *(new)* | 8 | The subtraction rule |

**Five new Opus 5 rules, none of which exist today:** scope discipline · subagent cap · corrections rule · effort policy · deliverable length. All brakes.

**The structural fix — a subtraction rule.** Before adding anything: does a mechanism enforce it → pointer, not text. Would Claude do it by default → nothing. Neither → add it, and delete something that now fails these tests. The file reached 697 lines because every milestone appended a doctrine and nothing was ever removed. Without this, it regrows.

---

## Part 5 — Test 1 results: the mechanisms were proven to fire

**Run 2026-08-06 22:42–23:10 PDT. Every guard was fed the exact input that should make it block, and its decision was read.**

| Mechanism | Input | Result | Cut safe? |
|---|---|---|---|
| `gsd-t-date-guard.js` | Write containing `- 2020-01-01 09:00:` | **BLOCKS** — exit 2, named the stale stamp and the live clock | ✅ |
| `gsd-t-date-guard.js` | Write with a correct current timestamp | Passes silently — no false blocking | ✅ |
| `gsd-t-worktree-guard.js` | Write in main tree with a second live session | **BLOCKS** — `permissionDecision: "deny"` plus the exact `git worktree add` recovery commands | ✅ |
| `gsd-t-worktree-guard.js` | Write in main tree, alone | Silent — documented correct behavior | ✅ |
| `gsd-t-pseudocode-style.cjs` | Doc with `loadStore(path):`, `throw`, `→ 409` | **BLOCKS** — exit 4, itemized violations | ✅ |
| `gsd-t-guard-map.cjs` | (invoked in verify workflow) | FAIL-blocking, halts before the triad | ✅ |
| `gsd-t-verify-gate.cjs` | — | 13 check definitions present | ✅ |
| `gsd-t-architect-oversight-guard.js` | Write containing `catch(e) { return defaultValue }` | **Reminds only** — always exits 0, never blocks | ❌ prose stays |

**All wired hook paths resolve.** Audited every `PreToolUse` / `PostToolUse` / `UserPromptSubmit` entry in `settings.json`: 7 distinct scripts, all present.

### A correction worth recording

A first pass reported the worktree guard **missing**. It was not. The test invoked `~/.claude/scripts/gsd-t-worktree-guard.js`; the guard actually ships inside the npm package and the hook correctly points at `$(npm root -g)/@tekyzinc/gsd-t/scripts/`. The file is present at v5.8.10, matching the repo.

**The test was wrong, not the system.** Retested at the real path, it blocks exactly as designed. Recorded here because the false finding nearly triggered a rebuild of working code — which is precisely the waste the Architect doctrine exists to prevent.

### The one rule that stays as full prose — and gets stronger

**No-Fallback-Ever.** Its guard runs and injects a reminder, but always exits 0 — it never blocks. That is deliberate: a static pattern-match can find `catch`, but cannot judge whether a given case is warranted. A guard that blocks legitimate cases trains bypassing, and then protects nothing.

**The doctrine's framing was wrong and has been corrected.** Both the old text and this document's first draft described fallbacks as *hiding* failures. The user's own cases are a worse class:

| Case | What it produced |
|---|---|
| **Binvoice capture** — author not found | Attributed the post to Marla. Posts recorded as written by someone who never wrote them. **It did not hide a missing author — it invented one.** Plausible, so nothing looked broken. |
| **PayPal invoice** — 1 of 5 line items fails | A real invoice, wrong amount, sent to a customer. The trace says "one item failed"; the invoice says "this is what you owe." The invoice wins. |

**Fabricated data is not the same as a hidden error.** A hidden failure is recoverable once found. Fabricated data is indistinguishable from correct data — there is nothing to search for and no way to bound the damage. This is what cost days of debugging, repeatedly.

Three corrections now in the rule:

1. **Writing a trace and continuing is still a fallback.** It relocates the failure to a file nobody reads while the wrong output ships anyway. The trace was never a mitigation.
2. **Do not add one unless asked.** These were not judgment calls made badly — they were unrequested code guarding cases nobody had established could happen.
3. **A missing value is a bug in whatever should have produced it.** Not-finding an author is a defect in the author finder; substituting a value guarantees nobody looks for that defect.

The warranted case is narrower than previously written: the outside condition must be **likely** (not merely conceivable), its cause outside our control, **and** it must have a *correct* handling that differs from the normal path — not a guessed value, not a partial result.

The doctrine keeps its full text in the new file. It is load-bearing and unenforced **by design**, not by oversight.

**Test 2 — canary (not yet run).** Propagation is all-or-nothing by design (`mergeGsdtSection` replaces the marked block wholesale, and all 33 registered projects inherit it). So the canary is manual: run the new file in this worktree only, with the old one preserved in git, and judge whether the ignoring improves. The user detected the problem in the first place, so the user is a legitimate instrument.

**Test 3 — the compliance ledger (not yet built).** Nothing currently records whether a rule was followed. Log every guard fire — date-guard blocks, worktree-guard blocks, verify-gate failures — to `.gsd-t/metrics/guard-events.jsonl`. Rule compliance becomes a measured rate instead of an impression.

This would also have caught the false finding above in seconds: a guard with zero recorded fires is either never tripped or never running, and today those two states look identical.

**The honest limit:** Tests 2 and 3 measure mechanism-backed rules well and prose-only rules poorly. There is no instrument for "did it respect the Destructive Action Guard" beyond the absence of disasters. **That asymmetry is itself the argument for building mechanism #1** — a prose-only rule is not merely unenforced, it is unmeasurable.

---

## Part 6 — The triad claim stays unproven

`.gsd-t/metrics/` contains `compactions.jsonl` and `m46-iter-proof.json`. **Zero validator data.** There is no basis for resizing the three-validator triad, and none is proposed.

**Proposed instead — "Triad Attribution Ledger", 1 domain, small.** The verify synthesis stage already merges the three validators' findings without collapsing categories. Add a write: each finding appended to `.gsd-t/metrics/triad-findings.jsonl` as `{ts, milestone, validator, severity, category, fingerprint, blocked}`.

**The fingerprint is the whole design** — a normalized `file:symbol:category` key. Two validators reporting the same defect produce the same fingerprint, which makes "unique contribution" computable rather than a judgment call.

After ~10 milestones it answers, per validator: findings contributed, findings *uniquely* contributed, and how many uniquely blocked completion. A validator whose unique-blocking count is near zero across 10 milestones is the one to question. Not before.

It reuses the existing synthesis stage, so marginal cost is one append per finding — and it produces the data Test 3 needs at no extra cost.

---

## Open items

| Item | Status |
|---|---|
| **33 project `CLAUDE.md` files never update** | `initClaudeMd` uses flag `"wx"` — written once at init, never again. A global rule and a project rule can now disagree, and only the global one changes. Out of scope by decision; needs scheduling. |
| **Global vs project split** | The global file loads into all 33 projects, carrying GSD-T methodology weight whether used or not. The draft *sections* them so a future split is a cut, not a rewrite. |
| **Dead file** | `scripts/gsd-t-brevity-guard.js` — safe to delete |
| **Red Team severity framing** | In `red-team-subagent.md`, depresses recall on Opus 5. Separate fix. |

## What was not done

- **Nothing installed.** `~/.claude/CLAUDE.md` is untouched; the draft lives in this worktree only.
- **No hook executed** to watch it block — that is Test 1, and it runs before any deletion.
- **No graph query** — `.gsd-t/graphDB/` absent here, so reuse findings are grep-grade.
- **No triad change** — unproven, by decision.
- **33 project files not audited** — out of scope this pass.
