# The Environment Map Fills Itself and Accepts the Truth

The written-down map of how to reach each environment is never filled in, and when a human does fill it in by hand it gets rejected for saying true things — so the whole map is fixed at the moment a human is asked for a connection detail.

```text
Someone working in a project needs to reach something that is not on this machine
  Look in the written-down map of environments (docs/infrastructure.md)
  Is there a row for the thing being reached:
    Yes: Use the command in that row — done, nobody is asked anything
    No:  Stop. Do not guess a connection string
      Read what the project itself reveals about where it is deployed
      Show the human what was found and ask them to confirm or correct it
      Did the human answer:
        Yes: Write the row, then continue the original work
        No:  Stay stopped — an unanswered question is not permission to guess

A human writes a row by hand, or the map is written for them
  Check every cell against the kind of thing that column is allowed to hold
  Does the cell look like a password or key:
    Yes: Refuse the whole row and say which cell and why
    No:  Does the checker recognise the cell:
      Yes: Accept it
      No:  Does the row say where the value came from:
        Yes: Accept it — the source is what vouches for it
        No:  Refuse it, and say a source would make it acceptable

The project is checked for quality (verify)
  Does this project reach anything that is not on this machine:
    No:  Nothing to check — pass, and say the project is local-only
    Yes: Is there a map with a row for it:
      Yes: Check the cells, as above
      No:  FAIL — a project with a remote environment and no map is not done
```

---

## What it does today

The map (the `## Environments` table in `docs/infrastructure.md`) is a committed, secret-free list of every environment — where it lives, how you sign in, which vault (the place a password is really kept) holds the secret, the NAME of the environment variable, and a command that refers to the secret by `$NAME` rather than spelling it out. It exists so nobody has to rediscover a connection every session.

```text
A project is created or updated
  An empty map is put in docs/infrastructure.md
  A written instruction tells the model: "record a row whenever you build an environment"
  Does anything actually run when an environment gets built:
    No: The instruction is words in a document — there is no moment it fires on
    # So the map stays empty, in 31 of 33 projects.

Someone needs to reach something remote
  Look in the map
  Is there a row:
    No: Stop and ask the human
      The human answers
      Is the answer written into the map:
        No: The answer is used once and forgotten
        # So the same question gets asked again next session. This is the pain.

The quality check runs
  Does this project have a map, or the access rule in its own CLAUDE.md:
    Neither: Pass, and note "has not adopted the registry"
    # The access rule lives only in the global CLAUDE.md, never a project one,
    # so "neither" is the state of every project that has not been hand-filled.
    # An empty map is certified as fine.
  Is there a map:
    Yes: Check each cell against the shape its column may hold
      Is the cell one of the true-but-unknown values (see below):
        Yes: Reject it as a suspected password
        # So a truthful hand-written map FAILS while an empty one PASSES.
```

**Is this a "got complicated over time" accretion?** Partly, and the complicated part is the checker, not the map. The map's schema is one clean decision made once. The checker went through nine rounds of adversarial review, each round chasing a password that had slipped through the previous round's filter. Each round tightened the filter. The tightening is what now rejects `n/a` in the port column, `cli-session` as a sign-in method, lowercase `yes`, and a plain-English note about needing a VPN. Nothing about those is a password. They are just values nobody thought to teach the checker about, and the ninth round ended in a reluctant pass rather than a confident one.

## What changes

```text
Teach the checker the true values it does not yet know
  For the columns that cannot carry a password anyway
    (the port, the database name, the name of the setting that holds the
     secret, the sign-in method, the access notes, the read-only flag)
    Accept "not applicable" as a real answer
    Accept the read-only flag whatever way it is capitalised
    Accept a sign-in method the enumerated list has not heard of, so long as
      it is short, lowercase, hyphenated words — the shape of a label, not a key
    Accept plain-English judgment in the access notes, word by word
  Leave every password-carrying column exactly as strict as it is today
  Re-run the existing leak tests
    Did any of them break:
      Yes: The loosening went too far — undo it and reconsider
      No:  The loosening is safe

Allow the row to say where a value came from
  A vendor's name for one of its own projects looks exactly like a key
    (winter-frog-54927244) — no amount of pattern-matching tells them apart
  Add one more column to the table, for the source
  Is a cell something the checker cannot recognise:
    Yes: Does the row name where it came from:
      Yes: Accept the value — the source is the proof the shape cannot give
        Is the source itself a real command, or a file in the project:
          Yes: Good
          No:  Refuse it — free text here would undo the whole column
      No:  Refuse the value, and say that naming a source would fix it
    No:  Nothing to explain — leave the source empty
  Does the cell look like a key, whatever the row claims:
    Yes: Refuse it — a source vouches for the unrecognised, never for a key

Stop certifying an empty map as fine
  Look at what the project itself reveals about where it is deployed
    (a Vercel or Neon or Google Secret Manager marker, a hosted database name)
  Did it reveal anything that is not on this machine:
    No:  Pass, and say plainly "local-only — nothing to map"
    Yes: Is there a row for it:
      Yes: Pass
      No:  FAIL — say which remote thing was found and has no row

Fill the map at the one moment a human is present anyway
  A session needs a connection detail and there is no row
  Stop and ask, exactly as today
  Show the human what the project revealed, so they correct rather than compose
  The human answers
  Write the row down first, before the answer is used for any other purpose
  Then continue the original work
```

---

## The rules

```text
A row never holds a password or key, only the NAME of one   [RULE] env-registry-map-only
A missing row stops the work; it never guesses a connection [RULE] env-registry-halt-not-fallback
A true value is never rejected as a suspected password      [RULE] env-registry-truth-accepted
A named source vouches for a value the shape cannot         [RULE] env-registry-source-vouches
A remote environment with no row fails the quality check    [RULE] env-registry-empty-is-not-pass
A local-only project passes, and is told it is local-only   [RULE] env-registry-local-only-named
An answered question is written down before it is used      [RULE] env-registry-answer-recorded
Loosening the checker must leave every leak test passing    [RULE] env-registry-loosening-proven
```

The one thing that must never happen: a password reaching a committed file, because a committed file goes to a shared remote and cannot be truly taken back. The second thing that must never happen is the one that already happened — a checker so strict that the human writes something false to get past it.

---

## ⚠ Divergence

Yes — one piece of shipped behaviour is superseded. Today a project with no map and no access rule PASSES the quality check with the note "has not adopted the registry". After this change, a project that reveals a remote environment and has no row FAILS. This is deliberate: the passing state was certifying the exact emptiness the map exists to prevent. Projects that are genuinely local-only keep passing, and are now told so by name instead of being lumped in with the unfilled ones.

The table gains ONE column — the source — used only where a value needs vouching. The password-carrying columns' strictness is unchanged.

Two things in this document were planned and then NOT built, both killed by evidence during the build:

**A check that a recorded command runs as written.** Built, then reverted. It failed rows that were perfectly safe, because "will this run" is not a question about secrets and does not belong in the leak checker. Worse, the rule it encoded was not universally true: the bare Neon command resolves fine for someone with one project and only stops to ask when the account holds several. Three existing tests caught it. The requirement survives as guidance where a human recording a row can judge their own account.

**A rule that guessed project ids by their spelling.** Proposed, and replaced by the source column after the user pointed out that where a value came from already proves what it is. Guessing from a pattern would have been the same mistake the nine cycles kept making.

---

## Why this shape

- **The objective** — a human should be asked for a connection detail at most once per environment, ever. Not "make the map fill itself" — the map is only worth having because it ends the asking. Every part of this is judged against that.

- **What it conflicts with** — loosening the checker sits directly against the rule that no password ever reaches a committed file, which took nine adversarial rounds to get right. The conflict is resolved by only loosening columns that structurally cannot carry a password (a port is digits or nothing; a read-only flag is yes or no), and by proving it with the 274 tests that already exist. The password-carrying columns — the host, the database name, the two commands — are not touched.

- **What already exists that we reuse** — nearly all of it. The reading of what a project reveals about its deployment already works today and returns useful answers for every project tried. The writing of a row already works. The stop-and-ask rule already exists in the global instructions. The 274 tests already encode what a password looks like. What is missing is not capability; it is that nothing calls the capability.

- **Why this is the simplest version** — the original plan had four parts, one of which was a new tool to go find deployed environments. That tool already exists and works. Removing it leaves three changes, and only two of them are code: teach the checker some true values, and stop passing an empty map. The third is wiring the existing pieces to the moment a human is already being asked.

- **Will it be reused** — the checker's per-column shapes, yes; every project runs them on every quality check. The wiring at the ask-the-human moment, yes; it is the only moment that reliably has both a human and a real answer in the same place.

- **What could go wrong** — loosening too far and letting a password through, which is unrecoverable once pushed. That is why the loosening is confined to columns that cannot hold one and is proven against the existing tests. The opposite risk is real too and has already happened once: a checker that rejects the truth teaches people to write something false to get past it, which is worse than having no checker at all.

- **Why the answer is written down before it is used** — this is not continuing past a failure. The stop already happened and the human already answered it. Writing the answer down is what completes the stop; using the answer without recording it is what guarantees the same stop happens again next session.

---

## Where it lives

| Step in the flow | File |
|------------------|------|
| The map itself | `docs/infrastructure.md`, between the `gsd-t-env-registry` markers |
| Writing a row | `bin/gsd-t-env-registry.cjs` — `recordEnvironment` |
| Reading what a project reveals | `bin/gsd-t-env-registry.cjs` — `detectEnvConfig` |
| The quality check | `bin/gsd-t-env-registry-check.cjs` — `cellMatchesColumnShape`, `check` |
| The leak tests | `test/m102-env-registry.test.js` |
| The stop-and-ask rule | `~/.claude/CLAUDE.md`, mirrored in `templates/CLAUDE-global.md` |
| The already-written backfill steps | `commands/gsd-t-populate.md` |
