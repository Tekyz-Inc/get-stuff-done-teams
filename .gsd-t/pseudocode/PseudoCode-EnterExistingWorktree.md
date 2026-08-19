# Naming an Existing Worktree Walks You Into It

Typing the name of a side copy of the repo (a worktree) that already exists should take you there, unless another session is already working in it.

```text
You start a session and type a worktree name
  Is the name the repo's own main branch:
    Yes: Stay in the main folder, say so — no side copy made
    No:  Is there already a folder with that name:
      No:  Make the side copy, carry the local config and dependencies across,
           go there
      Yes: Does git know that folder as a side copy of THIS repo, sitting on
           THAT branch:
        No:  STOP — "a different folder is at that path"
             # A stray folder, or another branch's work. Walking in would put
             # this session on top of it.
        Yes: Is an interactive session already open in that folder:
          Yes: STOP — name the folder, say a session is working there now
          No:  Go there
```

---

## What it does today

```text
You type a worktree name
  Is the name the repo's main branch:
    Yes: Stay in the main folder, say so
    No:  Is there already a folder with that name:
      No:  Make the side copy, set it up, go there
      Yes: STOP — "already exists. Pick a different name, or start there
           directly."
           # Refuses every time the folder is there, including the ordinary
           # case: your own side copy, from yesterday, with nobody in it. The
           # only way back in is to leave the session and start another one
           # by hand, which is the thing the picker exists to spare you.
```

## What changes

```text
When the folder is already there
  Ask git for its list of side copies of this repo
    Git refuses to answer:
      STOP — say git could not report its side copies, and why
      # Guessing "it is probably fine" is how a session lands on top of work.
    Git answers:
      Is our folder in that list, on the branch we asked for:
        No:  STOP — "a different folder is at that path"
        Yes: Is an interactive session already open there:
          Yes: STOP — "another session is working there right now"
          No:  Print the folder — the shell goes there

Asking what exists (a new question the picker can answer)
  List every side copy of this repo, newest first
    For each one, say whether a session is open in it
  # So the prompt can show them before you type, instead of asking you to
  # remember a name.
```

## The rules

- `[RULE]` A folder that exists is entered only when git names it as a side copy of THIS repo **on the branch that was asked for**. Existence alone is never enough — a stray directory at that path is a stop.
- `[RULE]` A side copy with an interactive session already open in it is refused, and the refusal names the folder. Two sessions in one working tree interleave uncommitted work, which is the collision the worktree rule exists to prevent.
- `[RULE]` "Interactive session" means a `claude` process attached to a terminal. Subagents and `claude -p` runs have no terminal and never count as occupancy.
- `[RULE]` Git failing to report its side copies is a stop, not an assumption. Continuing past that failure would be a fallback around an unknown, and the unknown is exactly "is someone's work already here".
- `[RULE]` Standard output carries a bare path and nothing else. The shell reads it with `d=$(gsd-t pick-worktree)` and moves there, so any other text becomes a directory it tries to enter. Notes go to standard error.

## ⚠ Divergence

None. This extends the refusal into two outcomes — enter, or stop — and keeps every case the old refusal was actually protecting.

## Why this shape

- **The objective** — continue work in a side copy you already made. Today the picker can only create; the one thing you cannot do through it is go back to something.
- **What it conflicts with** — the one-session-per-working-tree rule. It does not: that rule bars two sessions from sharing a tree, not one session from returning to a tree nobody is in. The refusal stays exactly where the rule bites.
- **What we reuse** — the occupancy check the picker already runs when it hunts for a free side copy. The question "is anyone in there" was already answered; it was simply never asked on the naming path. No new mechanism.
- **The simplest version** — one question added where the old code stopped: "does git know this folder, and is it free". Everything else is untouched.
- **Will it be reused** — yes, twice over: the occupancy check now serves both paths, and the new listing question feeds the shell prompt.
- **The risk** — entering a folder someone is working in. That is the one thing the old refusal genuinely protected, and it is still refused; what is dropped is the refusal of the empty case, which protected nothing.

## Where it lives

- `bin/gsd-t-pick-worktree.cjs` — `create()` splits into enter-or-create; new `--list`.
- `test/m111-pick-worktree.test.js` — the "refuses to reuse a directory that already exists" test narrows to the two cases that still refuse.
- `~/.zshrc` `cc()` — shows the free side copies above the prompt.
