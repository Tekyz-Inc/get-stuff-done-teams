# Graph-Driven Slicing

The code map decides how a scan is cut into readable pieces, and when the map cannot answer, the scan stops instead of guessing.

```text
A scan of a project starts
  Ask the code map (our searchable index of how the code connects) whether it can answer
    Never built:  Build it once, then ask again — still no answer means damaged
    Damaged:      STOP — tell the user to run gsd-t graph status
    Stale:        Refresh the changed files, then ask again — still stale means STOP
    Answers:      Carry on

  Take the full list of files the project actually has, from git
  Take the list of files the code map knows about
  Compare the two lists, and put every file into one of three piles:

    Mapped — git has it and the map knows it:
      These get cut into pieces by the map (below)

    Unmapped — git has it, the map does not know it:
      Config, database scripts, page templates, shell scripts, anything the reader could not parse
      Is every one of these explainable — a kind of file the reader was never built to read:
        Yes: Group them by the folder they sit in and by what kind of file they are
             Each group becomes its own piece, marked "read by hand, no map help"
        No:  STOP — the reader silently skipped a file it should have read
             Tell the user which files, and why that is a reader bug, not a scan decision

    Ghost — the map knows it but git does not:
      Left-over copies in scratch folders, deleted files still in the map, build output
      Drop them, and say how many were dropped and where they came from
      Is the map made mostly of ghosts:
        Yes: STOP — the map is indexing the wrong tree and every answer is polluted
        No:  Carry on

  Cut the mapped files into pieces, using the map
    Start from what the map already computes: groups of files that lean on each other
    Is a group small enough for one reviewer to genuinely read:
      Yes: It is a piece — keep it
      No:  Cut it where the connections between files are thinnest
           Keep cutting at the thinnest seams until each part is readable
           Are the parts still too big and no thin seam is left:
             Yes: STOP — this code has no seams to cut on
                  Tell the user: everything depends on everything, and say which files
             No:  Each part is a piece

    Is a file in no group at all — nothing calls it, it calls nothing:
      Yes: It is still a piece of the scan, on its own or with its folder neighbours
           Never drop it — a compliance exporter nobody calls is exactly where defects hide

  Check the arithmetic before reading anything
    Add up every file in every piece
    Does that equal the full git list, with each file appearing exactly once:
      Yes: Start reading
      No:  STOP — a file was lost or counted twice, and the scan would lie about coverage

  Read every piece
    For each piece, hand the reader both things:
      What the map already knows — what calls this, what a change here breaks, what looks unused
      The instruction to read the actual code for the things a map cannot see:
        Money that rounds the wrong way
        A rule of the business that the code quietly breaks
        A password or key sitting in plain text
        Code that works but reads badly

  After every piece has been read
    Sweep for anything a single piece could not see on its own
      The same code written twice in two different pieces
      A chain of calls that crosses several pieces and goes wrong somewhere along it
    Report what was found, and report the count of files read against the full git list
```

---

## What it does today

```text
A scan starts
  Ask a language model to look at the project and propose how to cut it up
  It answers with a list of pieces and a rough count of files
  Are the pieces too big to read:
    Yes: Ask the same model to cut them smaller
      Did that work:
        Yes: Use the smaller pieces
        No:  Chop each piece into equal chunks by position in the list
    No:  Use them as proposed

  Separately, ask the code map for unused code, broken links, and file groups
  Did the map answer:
    Yes: Remember the answer, and record the scan as "map was used"
    No:  Quietly search the files by hand instead, and say the map was unavailable

  Before handing each piece to a reader, check whether the map was used
    # This check compares against the wrong spelling of the word, so it is never true.
    # The remembered answer is thrown away every single time.
  Read each piece without any map help
  Every piece finished — report "Coverage: FULL"
```

Two separate problems live in that flow.

```text
The spelling mismatch
  The step that records success writes the word in capitals
  The step that checks it looks for the word in lower case
  They never match, so the map's answer is computed and then discarded
  This has been true since the end of June — six weeks of scans read the code blind

What "Coverage: FULL" actually means today
  It means every piece finished without crashing
  It does not mean every file was opened
  A reader handed more files than it can hold reads some of them and reports success
  So the scan can miss most of the codebase and still call itself complete
```

## What changes

```text
The cut comes from the map, not from a model's opinion
  The same project cut twice gives the same pieces both times

The three piles are reconciled against git before anything is read
  Nothing is assumed to be covered; the arithmetic is checked and must balance

Files the reader cannot parse are named and grouped, not silently skipped
  They still get read by a human-style pass, just without map help

Left-over copies in scratch folders are dropped on purpose and counted
  Rather than silently doubling the map and polluting every answer

Every way the map can fail becomes a stop with a named reason and a named remedy
  Nothing continues on a hand-search and calls itself a map-driven scan

"Coverage" changes meaning
  From "every piece finished"
  To "every file in git landed in exactly one piece, and the piece was read"
```

---

## The rules

```text
The cut comes only from the map, never from a guess       [RULE] slices-derive-from-graph-only
Every git-tracked file lands in exactly one piece         [RULE] every-file-exactly-one-slice
The file lists are reconciled before any reading starts   [RULE] reconcile-before-read
An unparseable file is named and grouped, never skipped   [RULE] unindexed-files-named-not-dropped
A file the reader should have read but skipped stops it   [RULE] unexplained-index-gap-halts
Map entries git does not have are dropped and counted     [RULE] ghost-files-dropped-and-counted
A map made mostly of ghosts stops the scan                [RULE] polluted-index-halts
A too-big group is cut at its thinnest connections        [RULE] split-at-weakest-seam-only
A group with no thin seam left stops the scan             [RULE] no-seam-halts-never-chops
A file nothing calls is still its own piece               [RULE] orphans-are-slices-too
Coverage counts files read, not pieces finished           [RULE] coverage-counts-files-not-slices
A damaged or stale map stops the scan, never hand-searches [RULE] graph-failure-halts-never-greps
Every stop names both the reason and what to do about it  [RULE] every-halt-names-its-remedy
The word recorded and the word checked are compared alike [RULE] wiring-mode-compared-case-insensitively
```

The one thing that must never happen: a scan reading a fraction of the code and
reporting that it read all of it. Every step above can be repeated harmlessly —
comparing two file lists twice gives the same three piles, and stopping twice is
still just stopped.

---

## ⚠ Divergence

⚠ Divergence: `slices-derive-from-graph-only` — supersedes shipped behavior. Today a
language model proposes the cut (v5.11.22 pinned that cut to business features, and
v5.11.23 sized the pieces at about 120 files each). Both of those decisions are
retired by this one: the map decides the cut and the size, so there is nothing left
to pin or to size by hand. Reason: the same project cut twice on the same night
produced two cuts with no piece in common, which is not a cut anyone can trust.

⚠ Divergence: `graph-failure-halts-never-greps` — supersedes shipped behavior. Today
a scan whose map is missing or damaged quietly continues by searching files by hand
and announces it did so. Under this directive that mode is removed and becomes a
stop. Reason: a hand-search dressed as a scan hides how much was actually read.

⚠ Divergence: `coverage-counts-files-not-slices` — supersedes shipped behavior.
"Coverage: FULL" currently means every piece finished. It becomes a count of files
read against the full git list. Reason: the current wording reported FULL on runs
that cited fewer than one file in fifteen.

---

## Why this shape

- **The objective** — find real defects everywhere in a codebase, and be able to
  prove nothing was left out. Both halves matter; today the scan can do neither
  reliably, because the cut changes every run and the coverage number is not a
  measure of coverage.

- **What it conflicts with** — two of my own recent decisions. Pinning the cut to
  business features stopped the cut from wobbling between runs; sizing pieces at
  about 120 files stopped readers from being handed more than they can read. Both
  were patches on a cut that came from a guess. If the map makes the cut, the first
  is unnecessary and the second becomes a property of where the seams are rather
  than a number I chose. I am retiring both, deliberately.

  There is a genuine conflict I am not papering over. "Use only the map" and "never
  leave anything out" pull in opposite directions, because the map only knows files
  it could parse. On this repository the map knows 356 of the 361 source files git
  tracks — the five it misses are shell scripts and test fixtures. But git tracks
  3,538 files in total, and the great majority are documents, logs and data that no
  code reader will ever index. Those files can still hold defects, so they cannot be
  dropped. The resolution is that the map decides the cut for code it understands,
  and everything else is grouped by folder and file type and read without map help —
  named as such, counted, never silently absent. Grouping by folder is not a guess
  about what the code means; it is a statement about what is left over.

- **What already exists that we reuse** — nearly all of it. The map is built and
  answering: on this repository it holds 1,522 files, 2,044 functions and 71,964
  call links at the most accurate tier. The step that asks the map for unused code,
  broken links and file groups already exists and already works. The stop-versus-
  build decision-maker exists. The refresh-the-stale-files machinery exists. What is
  missing is small: compare the map's file list against git, cut the big groups at
  their thin seams, count files instead of pieces, and fix a spelling mismatch.

- **Why this is the simplest version** — the alternative is to keep a model in the
  cutting loop and try to make it repeatable, which is the thing that has already
  failed twice. Comparing two lists of file names and splitting a group at its
  weakest connections are both plain, checkable operations with no opinion in them.

- **Will it be reused** — yes, and it already has a second customer. Any step that
  needs to know "what code is there, and how does it group" — impact analysis, the
  planner, the debugger — wants exactly this reconciliation. It is built as one
  shared piece from the start rather than living inside the scan.

- **What could go wrong** — three things, and one of them is measured, not feared.

  First, and worst: the map on this repository is 76 percent junk. Of its 1,522
  files, 1,166 are not tracked by git at all — they are stale duplicate copies
  sitting in scratch worktree folders. Any grouping computed over that map is
  computed mostly over files that do not exist in the project. This is why the
  ghost pile and its stop condition are in the flow and not an afterthought.

  Second: the groups the map produces today are unusable as pieces without cutting.
  Asked for groups, it returns 1,186 of them — one containing 336 files, another
  containing 2, and 1,184 containing exactly one file each. That is not a set of
  readable pieces; it is one enormous blob and a long tail of singletons. So the
  seam-cutting step is load-bearing, not a refinement, and the singleton tail is
  why files that nothing calls must be gathered by folder rather than each becoming
  its own piece.

  Third, the honest cost of this direction. A cut made from call links is a cut
  along how code is wired, and defects that live in how a business behaves are not
  wired that way. A rounding rule and the screen that displays the rounded number
  may sit in pieces far apart. Tonight's feature-shaped cut would put them together;
  a map-shaped cut may not. This is a real trade, and the flow answers it by handing
  every reader the instruction to look for those defects regardless of why its piece
  was drawn — the map chooses what to read together, never what to look for.

---

## What I confirmed with you

- The direction is settled: the map decides, and nothing continues past a failure.
- Thoroughness and accuracy are the requirements. Cost, time and how many readers
  run are not constraints, and I have not treated them as any.
- The spelling mismatch gets fixed; this design assumes a working map.
- Two of your earlier decisions — the feature-shaped cut and the 120-file size — are
  superseded here rather than kept. Flagged above so it is your call, not a silent
  overwrite.

Still open, and worth your answer before this is built:

- Should the scratch worktree folders be excluded when the map is built, or filtered
  out when it is read? Excluding at build time makes every other consumer of the map
  cleaner too, which argues for doing it there.
- When a group has no thin seam left to cut on, the flow stops. On a genuinely
  tangled codebase that stop could fire on the first real scan. Is stopping the
  behavior you want there, or should that one case report the tangle as the finding
  and read the group anyway in folder-sized parts?

---

## Where it lives

| Step in the flow | File |
|------------------|------|
| Ask the map whether it can answer | `bin/gsd-t-graph-query-cli.cjs` |
| Decide never-built versus damaged | `bin/gsd-t-graph-availability.cjs` |
| Refresh the changed files | `bin/gsd-t-graph-freshness.cjs` |
| Find the store on disk | `bin/gsd-t-graph-store-resolver.cjs` |
| Compare the map's file list against git | new — reconciliation step |
| Cut big groups at their thin seams | new — seam splitter |
| The scan's cutting and reading phases | `templates/workflows/gsd-t-scan.workflow.js` |
| The spelling mismatch to fix | `templates/workflows/gsd-t-scan.workflow.js` lines 684 and 924 |
