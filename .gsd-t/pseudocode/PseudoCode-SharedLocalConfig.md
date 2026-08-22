# One Home For Your Keys, Linked Into Every Folder

Your local settings file (a .env — the file holding keys and passwords, deliberately kept out of git) lives in one place per project, and every copy of that project points at it, so a value set anywhere is set everywhere.

```text
You need a key while working
  Where does the project's settings file really live:
    In one place, with the main folder and every side copy pointing at it:
      Edit it from anywhere — the main folder, any side copy
      Every other folder already has the change, because it is one file
    In each folder separately, as today:
      Fill in a key while working in a side copy
      No other folder learns it, so you copy it by hand, forever

You cannot remember where a key is
  Ask for it by name, across every project at once
    Found: Say which project holds it, and whether it has a value yet
      Want to see or change the value: open that file
    Not found anywhere: Say so plainly, rather than an empty answer that
      reads like "no keys exist"

Two kinds of key, kept apart on purpose
  A key that means something different in each project (its database address):
    Lives with that project, and only that project
    # These genuinely collide: four projects here each have their own
    # DATABASE_URL. One shared value would send three of them to the wrong
    # database, quietly, because the setting exists and looks fine.
  One token (the long sign-in string proving it is you) used everywhere:
    Lives in the shared place that every project reads
  Both define the same name:
    The project's own value wins
    # The narrower answer is the deliberate one.

Taking a project to this arrangement (once per project)
  Gather the settings files from the main folder and every side copy
  For each setting:
    Only one folder has a value: Take it
    Several folders agree: Take it
    Several folders DISAGREE:
      STOP — show which folder holds which value, ask which is right
      # Choosing silently would discard a key you may not be able to get back.
  Show what will happen, and ask before touching anything
  Write the gathered settings to the project's one file
  Replace each folder's file with a pointer to it, keeping a dated backup

Making a new side copy of the project
  The project has one file already:
    Point the new copy at it — the keys are there before you start
  It does not:
    Copy the settings across, exactly as today
```

---

## What it does today

```text
Making a new side copy of the project
  Copy the settings files across, from a fixed list of names
  # A copy is a photograph. From that moment, the two drift apart.

Filling in a key while working in a side copy
  The side copy has the key
  No other folder has it
  # Merging the branch does not carry it either: git never tracked the file,
  # so the merge has nothing to carry.

Finding a key you cannot place
  Open folders one at a time and read each file
  # Which is how a key ends up typed into the source code instead.
```

## What changes

```text
Where a project's settings file lives
  In one place outside every copy of the project, under your home folder
  Never inside git, exactly as today

Each folder's settings file
  Becomes a pointer to that one file rather than a copy of it
  Reading it reads the one file; writing it writes the one file
  # Tools that read a settings file do not know or care that it is a pointer.

The shared place
  Holds only credentials that are the same for all your work
  Every project reads it, and its own file wins any disagreement

Asking where a key is
  A new instruction: name a key, get back every project that defines it and
  whether each has a value

Making a new side copy
  The project has one file: Point at it
  It does not: Copy across, exactly as today
  # An untouched project keeps behaving the way it always has.
```

## The rules

- `[RULE]` A project's file lives outside every copy of the project, so no copy can commit it and no side copy can take it away.
- `[RULE]` Two folders holding DIFFERENT non-empty values for one setting is a STOP, never an automatic choice. A silently discarded key may be unrecoverable.
- `[RULE]` An empty setting never overwrites a filled-in one. Empty means "not filled in yet", not "deliberately blank".
- `[RULE]` When the shared place and a project both define a name, the project's value wins. The narrower answer is the deliberate one.
- `[RULE]` Nothing is replaced without a dated backup, and nothing is replaced before showing what will happen and getting an answer.
- `[RULE]` A project that has not adopted this behaves exactly as it does today. Adoption is per project, never automatic.
- `[RULE]` The one file keeps the strict permissions of the file it came from — readable by you alone. A key that becomes world-readable is a leak this feature introduced.
- `[RULE]` Pointing a new side copy at a file that has gone missing is a STOP, not a quiet copy instead. A setup that no longer holds must be visible.
- `[RULE]` Asking where a key is reports the file and whether a value is set, and never prints the value. Seeing it means opening the file, which is a deliberate act.
- `[RULE]` A search that finds nothing says so in those words. An empty list reads as "no keys anywhere", which is a different and wrong answer.

## ⚠ Divergence

None. Copying stays exactly as it is for any project that has not adopted this.

## Why this shape

- **The objective** — set a key once and have it apply everywhere, both directions, without hand-copying; and never lose track of where a key is.
- **Why not carry it through git** — the file is deliberately untracked, so a merge has nothing to carry. Making it travel through branches means committing keys, the one thing that must not happen.
- **Why not one file for everything** — measured, not assumed: six settings on this machine share a name and hold different values across projects, `DATABASE_URL` across four. One file cannot hold four values for one name, and the failure would be silent — the setting exists, looks valid, and points at the wrong database.
- **Why a shared place as well** — the key that started this was one Asana credential wanted by every project. Per-project storage alone would mean copying it into each, which is the problem restated.
- **Why the project wins a clash** — a project that names a setting has said something specific about itself; the shared value is a default for everything that has not.
- **What we reuse** — the provisioner already finds and classifies these files. Only its final step changes, from copying to pointing.
- **The risk** — one file per project is one blast radius: a bad edit is bad everywhere at once, and deleting it empties every folder. Answered with backups at adoption and a stop, rather than a quiet copy, when the file has gone missing.
- **The trade accepted** — a side copy can no longer hold a different value for the same setting. Different environments become differently-named settings in the one file, which is how they are told apart anyway.

## Where it lives

- `bin/gsd-t-shared-config.cjs` — where the files live, gather, merge, link, search.
- `bin/gsd-t-worktree-provision.cjs` — points at the project's file when one exists, copies when none does.
- `bin/gsd-t.js` — the `env adopt`, `env status` and `env find` instructions.
