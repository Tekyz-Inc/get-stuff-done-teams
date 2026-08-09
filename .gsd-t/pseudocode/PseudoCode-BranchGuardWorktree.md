# Branch Guard Reads the Real Rule and Respects Worktrees

The branch check should notice the branch rule however the project wrote it down, and stop demanding you be on the main branch when you are deliberately working in a side copy of the repo.

```text
A GSD-T command runs its pre-flight checks
  Open the project's own CLAUDE.md (the file that carries the project's rules)
    The file is not there:
      Pass, and say "no CLAUDE.md here, nothing to check against"
    The file is there but cannot be read:
      STOP — say the rules file is unreadable and needs a human
    The file is there and readable:
      Look for the project's branch rule, written either way:
        As a sentence — "Expected branch: main"
        As a row in a small table — the label "Expected branch" beside the name
      No rule written anywhere:
        Pass, and say "NOT CHECKED — this project declares no expected branch"
      A rule is written:
        Are we in a side copy of the repo (a worktree — a second folder checked
        out from the same repository, used for one fix at a time):
          Yes: Ask git which branch this side copy is on
            It names a branch:
              Pass, and say which branch, and that the rule was skipped
              because side copies are meant to be on their own branch
            It names nothing — the copy is parked on a bare commit
            (a detached HEAD, meaning commits here belong to no branch):
              FAIL — "not on a branch here, so commits made here will be lost"
          No: Ask git which branch the main folder is on
            Git refuses to answer:
              FAIL — say git could not report the branch, and why
            It names nothing — parked on a bare commit:
              FAIL — "not on a branch, expected <the declared name>"
            It names the declared branch:
              Pass, and say we are on it
            It names a different branch:
              FAIL — "on <this one>, expected <the declared name>"
```

---

## What it does today

```text
A GSD-T command runs its pre-flight checks
  Open the project's own CLAUDE.md (the file carrying the project's rules)
    Not there:
      Pass — "no CLAUDE.md found, skipping"
    There but unreadable:
      Pass — pretends the file was never there at all
      # A permissions problem or a broken disk reads as "no rules to enforce"
    There and readable:
      Search for the exact phrase "Expected branch:" and nothing else
        Phrase absent:
          Pass — "no expected-branch rule set"
          # This is the silent hole. The project starter file writes the rule
          # as a table row labelled "Branch", so the phrase is never present
          # and the check quietly approves every branch, forever.
        Phrase found:
          Ask git which branch we are on
            Nothing named — parked on a bare commit:
              FAIL
            Same name:
              Pass
            Different name:
              FAIL
              # This also fires inside a side copy of the repo, where being on
              # a feature branch is exactly what the house rules demand.
```

## What changes

```text
Reading the rule
  Accept the sentence form, exactly as today
  Also accept a two-column table row whose left cell says "Expected branch"
  # Nothing fills that row automatically — a person or an assistant types it —
  # so both shapes have to land rather than one silently missing.

The project starter file
  Rename the row label from "Branch" to "Expected branch"
  # Today the label and the reader disagree, so a freshly started project
  # ships with a check that can never fire.

Saying nothing was checked
  When no rule is written, still pass
  But word it as a gap — "NOT CHECKED — this project declares no expected branch"
  # A pass that reads like approval is how the hole stayed invisible.

Side copies of the repo
  Before comparing branch names, ask whether this folder is a side copy
  It is a side copy:
    On a named branch:  pass and say the rule was deliberately skipped here
    On no branch:       FAIL — commits here would be lost
  It is the main folder:
    Compare against the declared name, exactly as today

An unreadable rules file
  Stop instead of passing
  # A file we cannot read is a real failure. Treating it as "no rules"
  # is the same hiding place the missing phrase gave us.
```

---

## The rules

```text
The branch rule is honoured in sentence form and table-row form alike   [RULE] branch-rule-read-in-both-shapes
The starter file's label and the reader's label are the same words      [RULE] template-label-matches-reader
No rule written means "not checked", never "approved"                   [RULE] undeclared-branch-named-not-implied
A side copy on its own named branch passes the branch check             [RULE] worktree-on-a-branch-passes
A side copy on no branch fails, because commits there are lost          [RULE] detached-head-always-fails
An unreadable rules file stops the run instead of passing it            [RULE] unreadable-rules-file-halts
One shared test decides "is this a side copy", used by every caller     [RULE] one-worktree-detector
```

The one thing that must never happen: the check reporting a clean pass when it
in fact compared nothing. Every step here can be repeated harmlessly — asking
git the same question twice gives the same answer, and reading the rules file
again changes nothing on disk.

---

## ⚠ Divergence

⚠ Divergence: `## The rules`#undeclared-branch-named-not-implied — supersedes the
shipped message `no expected-branch rule set`, which the pre-flight contract
records word for word. Reason: the old wording reads as approval when the check
in fact compared nothing, which is how the hole stayed hidden. The contract row
and the one test matching that phrase both change in the same pass.

⚠ Divergence: `## The rules`#worktree-on-a-branch-passes — supersedes the shipped
behaviour where any branch other than the declared one fails. Reason: the house
rules require new work to happen in a side copy on its own branch, so today the
check blocks the correct way of working.

⚠ Divergence: `## The rules`#unreadable-rules-file-halts — supersedes the shipped
behaviour of treating an unreadable rules file as an absent one. Reason: that is
a real failure being hidden behind a pass.

---

## Why this shape

- **The objective** — a project that writes down which branch it expects should
  actually have that expectation enforced, and a person following the house rule
  to work in a side copy should not be blocked for following it. Right now
  neither holds: in a freshly started project the check compares nothing, and in
  a side copy it blocks correct work.

- **What it conflicts with** — three things were checked. The end-to-end test
  that proves the gate blocks a wrong branch builds a plain temporary repository
  and never a side copy, so the new side-copy pass cannot reach it and the test
  still fails the way it is meant to. The pre-flight contract quotes the old
  "no rule set" message word for word, so that line changes with the code. The
  recent session-routing work that sends each session into its own side copy is
  the very reason the side-copy conflict exists — this change finishes that
  thought rather than fighting it.

- **What already exists that we reuse** — the repository already knows how to
  tell a side copy from the main folder, in the tool that routes a session into
  a worktree. We reuse that idea and share one copy of it rather than writing a
  second one. Its current version looks at whether the folder's `.git` is a file
  or a directory; asking git directly — comparing the folder's own git directory
  against the repository's shared one — is the sturdier test, because it is
  git's own answer rather than an inference from how git happens to store
  things, and it keeps working for unusual setups where that storage differs.
  The check already asks git one question, so asking a second is nothing new.

- **Why this is the simplest version** — every part of the change is in one file
  plus one line of the starter template. Reading the rule gains one extra shape.
  The comparison gains one question asked before it. The "nothing declared"
  message gains different words. Nothing new is invented: no configuration file,
  no per-side-copy declaration, no new pass or fail vocabulary. Deliberately not
  built: a way for each side copy to declare its own expected branch (side
  copies here are disposable, one per fix, so the paperwork buys nothing); a
  general rewrite of how any check reads a declaration; and any change to the
  five sibling checks, which are reported on separately and touched only with
  the user's say-so.

- **Will it be reused** — the side-copy test, yes: it already has one caller and
  this makes two, and every future check that cares where it is running wants
  the same answer. So it moves into one small shared piece both callers use, and
  the existing caller's behaviour is unchanged because the answer it gets is the
  same in every case it can encounter. The widened rule reader, no: it serves
  this one check and stays inside it.

- **What could go wrong** — the smallest real risk is the side-copy pass being
  read as a loophole: someone works in a side copy on the wrong branch and
  nothing complains. That is accepted deliberately, because the house rule says
  a side copy exists precisely to be on its own branch, and the one genuinely
  dangerous case in a side copy — being parked on no branch at all, where the
  work would be lost — still fails loudly. The second risk is that asking git a
  second question can hang the same way the first one can, on a slow or
  network-mounted repository, because none of these git calls has a time limit.
  That flaw is already recorded as known debt covering three checks; this change
  should not spread it further, so the new question carries a time limit even
  though fixing the three existing ones stays a separate job.

---

## What I confirmed with you

- **The current behaviour**, signed off as fact, not guess: read the rules file;
  missing file passes; look for the exact phrase; phrase absent passes; phrase
  found compares against the current branch and fails on a mismatch.
- **Side copies** — pass when on a named branch, fail when on no branch. Not
  chosen: always passing (silent on the dangerous case), or making each side
  copy declare its own branch (friction with no return, since they are
  disposable).
- **Where the rule is declared** — fix both sides. Rename the starter file's row
  label, *and* widen the reader to accept the table-row shape, because nothing
  fills that row automatically and a hand-written variant must still land.
- **A project with no rule** — still passes, but the wording changes so it reads
  as a gap rather than as approval. Not chosen: blocking, which would break
  every project that exists today.
- **The five sibling checks** — reported on separately, changed only with your
  say-so. Not touched here.
- **No code map** — this repository has no built code map, so everything above
  came from reading and searching files by hand. The reuse findings are
  therefore not exhaustive: there may be another copy of the side-copy test, or
  another check reading a declaration nothing writes, that a hand search missed.

---

## Where it lives

| Step in the flow | File |
|------------------|------|
| Reading the rules file and the branch rule | `bin/cli-preflight-checks/branch-guard.cjs` |
| The starter file's branch row | `templates/CLAUDE-project.md` |
| The existing side-copy test to share | `bin/gsd-t-pick-worktree.cjs` |
| The recorded behaviour that must change with it | `.gsd-t/contracts/cli-preflight-contract.md` |
| The unit tests for this check | `test/m55-d1-cli-preflight-checks/branch-guard.test.js` |
| The end-to-end proof the gate still blocks | `e2e/journeys/verify-gate-blocks-wrong-branch.spec.ts` |
| The known time-limit debt on git calls | `.gsd-t/techdebt.md` (TD-182) |
