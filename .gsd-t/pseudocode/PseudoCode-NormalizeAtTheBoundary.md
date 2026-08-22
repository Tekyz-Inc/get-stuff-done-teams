# Clean The Value Where It Enters, Once

Every value arriving from outside the program is stripped of stray spaces and put into one agreed casing at the moment it arrives, so nothing downstream has to remember to do it.

```text
A value arrives from outside the program
  Where did it come from:
    A form the person typed into, a web address, a message from another
    service, or a row read out of the database:
      Clean it here, at the doorway, before the program uses it
        Strip the spaces off both ends — always
        Is it a name for something in the business (a status, a role, a
        category, an email address, a filter):
          Yes: Put it into one agreed casing as well
          No:  Leave the casing exactly as it came
             # A password, a signing key, a file path, a web address: the
             # casing IS part of the value, and changing it breaks it.
      Everything downstream now compares and stores it plainly, and is right
    A value the program itself produced a few lines earlier:
      Nothing to clean — it never left the program

Checking a project follows this
  Has this project been checked before:
    No:  Look at every doorway in the whole project, once
      Report every doorway that does not clean what it takes in
      Write the report where the person will read it — do NOT record it as
      permitted
      # A recorded list of allowed violations is a list somebody can quietly
      # add to. The report is for fixing, not for excusing.
    Yes: Look only at the doorways in the files this run touched
      A touched doorway that does not clean what it takes in:
        STOP — name the file, the doorway, and what it failed to clean
      A doorway nobody touched:
        Leave it alone — the first report already named it

A requirement genuinely needs the raw, uncleaned value
  Say so at the doorway, in one line, with the reason
  The check reads that line and passes it by
  # Written down at the doorway, where the next reader is looking, never in a
  # separate list far away from the code.
```

---

## What it does today

```text
A value arrives from outside the program
  Nothing cleans it
  It travels onward carrying whatever spaces and casing it arrived with

Somebody compares it later
  They remember to clean it: The comparison works
  They forget:
    The comparison quietly answers "no match"
    Nothing reports anything — the feature simply does nothing
    # This is how it is found: an unexpected bug, days later, traced back by
    # hand.

Somebody saves it
  It is stored with the stray spaces still attached
  Every later comparison against it fails, including correct ones
  # And the bad value is now in the database, so fixing the code is no longer
  # enough.

The written rule
  A page of standards describes the casing rule
  Nothing checks it
  # Which is why the same bug keeps arriving in project after project.
```

## What changes

```text
Cleaning moves to the doorway
  One place per kind of arrival, rather than every place the value is used
  # Sixty comparisons downstream cannot each be remembered. Four doorways can.

Saving is covered too
  A value is cleaned before it is stored, not only before it is compared
  # Half the reported bugs are stored values, which no comparison rule
  # reaches.

A check that can fail the build
  First run on a project: report every unclean doorway, whole project
  Afterwards: only the doorways in files this run touched, and an unclean one
  STOPS the run
```

## The rules

- `[RULE]` Every value entering from a form, a web address, another service, or the database is stripped of leading and trailing spaces at the point of entry. No exceptions without a written reason at that spot.
- `[RULE]` A value naming something in the business — status, role, category, filter, mode, email address — is ALSO put into one agreed casing at entry.
- `[RULE]` Casing is NEVER changed for a password, a signing key, a hash, an encoded value, a file path, a web address, an object property name, or an environment variable name. Changing it there is a defect, and for the first group a security defect.
- `[RULE]` Cleaning happens at the doorway, never scattered across the places a value is later used. A rule that must be remembered in sixty places is a rule that will be forgotten in one.
- `[RULE]` A value is cleaned before it is STORED, not only before it is compared. A stored value carrying stray spaces breaks every later comparison, including correct ones, and outlives the code fix.
- `[RULE]` The first run on a project reports every unclean doorway and records NOTHING as permitted. A stored list of accepted violations is a list that can be quietly extended.
- `[RULE]` After the first run, only doorways in touched files are checked, and an unclean one STOPS the run rather than warning.
- `[RULE]` An exemption is written at the doorway itself, in one line, with its reason. An exemption living in a separate file is invisible to the next person reading the code.

## ⚠ Divergence

None. This adds a check where there was only prose; no existing behavior is replaced.

## Why this shape

- **The objective** — stop the same class of bug arriving in project after project: a comparison that silently answers "no match", or a value stored with spaces still on it.
- **Why not a lint on comparisons** — measured, not assumed: one project holds 1,275 literal string comparisons, 193 of them shaped like business values, and nearly all of those are legitimate (internal message tags, a build mode, a value the code itself just wrote). A check flagging them produces about 190 false alarms per project, and a check that noisy gets switched off. Switched off, it enforces nothing while still looking enforced.
- **Why the doorway is the right place** — a comparison cannot be judged in isolation; whether it is a bug depends on where the value came from. The doorway is where that is knowable, and there are a handful of doorways against hundreds of uses.
- **Why it also covers saving** — half of what was reported is stored values, and no comparison rule ever reaches those.
- **What we reuse** — the shape of the existing integer-identity check: a small program run by the verify gate, failing closed, already wired and proven.
- **The simplest version** — one check, two modes, no stored list of exceptions.
- **Will it be reused** — yes: every project gets it, and the doorway inventory it builds is the same inventory a later audit would need.
- **The risk** — normalizing something that must not be normalized (a password, a path). Answered by naming those kinds explicitly and never touching casing outside the business-value list.

## Where it lives

- `bin/gsd-t-boundary-normalize-check.cjs` — finds doorways, judges whether each cleans its input.
- `bin/gsd-t-verify-gate.cjs` — runs it, fails closed.
- `templates/stacks/_comparison.md` — gains the trimming rule alongside the casing rule.
