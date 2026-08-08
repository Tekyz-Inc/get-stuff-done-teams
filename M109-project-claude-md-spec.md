# M109 — Rewrite a project's CLAUDE.md from what actually happened

**Status:** spec · **Date:** 2026-08-07

---

Read the project's history, mine every rule it can find, and let David tick which ones can never be broken. One tick-list is his only input.

## The flow

```
Read the project — no questions yet
  Read git, the decision log, and what David typed in past sessions
  Find every rule already stated anywhere in the project
  Work out which files are dangerous, where the repo misleads, which branch
  Was there any history to read:
    Yes: Show the rules found, ranked, with where each came from
      David ticks the ones that can never be broken
      Show him the new file next to the old one
      Does he approve:
        Yes: Write it
        No:  Change nothing
    No:  Stop and say so — never write a thinner file and call it done
```

## Extend, don't add

`/gsd-t-setup` already scans the project, sorts existing sections, shows a diff and waits for a yes. Its defect is one step: it fills in a generic template.

| Step | Fate |
|---|---|
| 1 Read global context | unchanged |
| 2 Scan the project | extended — six rule sources |
| 3 Check existing CLAUDE.md | unchanged |
| **3.5 Read the history** | **new** |
| 4 Ask questions | **replaced** — four questions become one tick-list |
| 5 Generate | **rewritten** — new mold |
| 6 Present and confirm | unchanged |
| 7 Write | unchanged |

No second command. Nothing new to maintain.

---

## Reading the history

Binvoice has 315 MB across 27 sessions. That cannot be read.

**It doesn't need to be.** Strip everything except what David typed:

| Step | Result | Time |
|---|---|---|
| Raw sessions | 315 MB | — |
| Keep only his turns | 2.9 MB | 1.4s |
| Drop pasted logs (over 2000 characters) | 645 KB | 0.1s |
| Keep only complaint-shaped lines | **94 turns, 7.4K tokens** | 0.01s |

**Two seconds. No subagents. Read directly.**

35 giant pasted lines held 78% of the bytes — they were logs, not typing.

### What to search for

The obvious guesses fail. Measured against real transcripts:

| Guessed | Hits |
|---|---|
| "I never asked you to" | **0** |
| "that's the third time" | **0** |
| "you were supposed to" | **0** |
| "still not / still doesn't" | **17** |
| "why did/didn't you" | **4** |
| "you keep" | **3** |

**David doesn't accuse — he restates the requirement.** The working pattern:

```
still (not|doesn't|broken|failing) | you keep | why (did|didn't|do) you
| keeps (happening|coming up) | hard rule | third (time|attempt)
| same (result|issue|problem) | revert | that's wrong | without asking
| never (do|again|clear|change) | don't (just|ever|keep)
```

Read order — cheapest first: git, then the decision log, then transcripts. Each source is optional but **named**: if one is missing, say so. Never skip in silence.

---

## The rule pick-list

**Six sources, best evidence first:**

| Source | Why it counts |
|---|---|
| Contracts (`.gsd-t/contracts/`) | Already written as rules, with reasons |
| Complaints in transcripts | The things that keep going wrong |
| Project-local hooks in `.claude/settings.json` | A rule someone already enforced in code |
| The existing CLAUDE.md | Minus anything restating a global rule |
| `[RULE]` markers in pseudocode | Machine-findable |
| Files fixed the same way repeatedly (git) | Works when there are no transcripts |

**Deduplicate** by what the rule claims, not how it's worded. Keep the clearest version, merge where it came from. A rule found in three places ranks top — repetition is the evidence.

**Cap the screen at 12.** Anything below goes to a file, never dropped.

```
12 candidate rules for binvoice. Tick the ones that must NEVER be broken.

     RULE                                                    SEEN IN
 1 [ ] Never touch facebook.com — no permissions, requests,   contract HC-001
       or DOM writes. Ever.                                   + a hook
 2 [ ] Reloading the extension must never clear the top       3 sessions
       section. Only "Clear" clears.
 3 [ ] Never query the production database without reading    4 sessions
       the Environments registry first.

Tick numbers (e.g. 1,3,4) or 'all':
```

The right-hand column is what makes it fast — he's confirming, not recalling.

---

## What the generated file holds

**40–70 lines.** Every section may be left out, with the reason written down.

| Section | Earns its place because | Lines |
|---|---|---|
| Title + pointer to the global file | Stops the file restating global rules | 3 |
| What this is | Two or three sentences of intent | 4 |
| **Rules that can never be broken** | The one thing nothing else carries | 5–25 |
| Where the repo misleads you | Only when reading it gives a confident wrong answer | 0–6 |
| Overrides of a global default | Autonomy, naming, branch | 3–8 |
| Danger map | Files where a change is riskier than it looks | 0–10 |
| Domain words | Only vocabulary that isn't in `docs/` | 0–15 |
| Pointers | progress, contracts, docs | 4 |

**Worked example — NiceNote, 94 lines → about 45.**

Keeps: the five things it refuses to be (its whole identity), the invariants (dotfiles visible, Markdown rendered by default), the note that switching editors is a re-architecture, its branch, "no API so the Swagger rule doesn't apply."

Drops: 15 lines of Destructive Action Guard pasted verbatim from the global file, and a build-state narration that went stale the day it was written.

---

## The new template

`templates/CLAUDE-project.md` today **is GSD-T's own CLAUDE.md.** It byte-copied into the adhd project, substituting the project name into GSD-T's own prose — 127 lines describing an npm CLI installer that project wasn't.

Replace with a real mold, ~45 lines:

```markdown
# {PROJECT_NAME}

{ONE_LINE_WHAT_THIS_IS}

## Rules that can never be broken
<!-- Ticked by David. Nothing else goes here. -->
{RULE_LIST}

## Where the repo misleads you
<!-- Determined by reading. Leave out if none. -->
{MISLEAD_LIST}

## Danger map
{DANGER_LIST}

## Overrides of global defaults
| Global default | This project | Why |
{OVERRIDE_TABLE}

## Stack and commands
{STACK} · Build `{BUILD_CMD}` · Test `{TEST_CMD}` · Branch `{BRANCH}`

## Environments
{ENV_POINTER}
```

**Rules of the mold:** no section restates a global rule · a section may be left out with a reason, never padded · the three gates that shipped in v5.9.10 are enforced by code, so no project file mentions them.

David approved this rewrite. It changes what every future `gsd-t-init` writes.

---

## When there is no history

**Halt and ask. Never write a thinner file and call it normal.**

```
Sources found: git 67 commits ✓ | decision log 1 line | transcripts 0 | contracts 0

Only git is available, and its commits are by other people.
I can mine 0 rules from history.

  a) Write stack and commands only — the rules section left out, with
     the reason written into the file. Not a normal CLAUDE.md.
  b) You dictate the rules now.
  c) Stop.
```

Whichever he picks, the gap is written **into the file itself** — "Rules: none derivable, no project history" — so the thinness stays visible instead of reading as "this project has no rules."

---

## What it must never do

1. Never write without showing a diff and getting a yes.
2. Never drop a section it couldn't classify — keep it, flag it.
3. Never remove a rule without naming the global section that replaces it.
4. Never run when CLAUDE.md has uncommitted changes. Git is the only undo.
5. Never invent a rule. They come from David or from something recorded.
6. Never assume the branch — gmail-spam is `master`, binvoice forbids `main`.
7. Never copy GSD-T's own CLAUDE.md into another project.

---

## What it does not fix

**Project CLAUDE.md is written once and never updated** — `initClaudeMd()` writes only if the file is absent. A fresh file starts going stale immediately.

Two cheap mitigations inside this milestone:
- **Write nothing that dates.** Version numbers, line counts, "currently in progress" — those belong in `progress.md`. Binvoice hardcodes "~46.6k source LOC".
- **Stamp the generation date** so the next reader can judge its age.

The real fix — giving project files the same marker-block treatment the global file has, so a machine-owned part updates while the human-owned rules are never touched — is a **separate milestone**.

---

## Build order

1. The history reader — the four-stage funnel, the corrected search pattern
2. The rule miner — six sources, dedupe, rank
3. The new template
4. Rewire `/gsd-t-setup` steps 2, 3.5, 4, 5

Two domains. One wave.
