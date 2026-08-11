# Reachability Exclusion

Code that nothing in the running app can reach is separated out and read on its own, labelled as unreached — it is never dropped from the scan.

```text
The scan has its list of mapped files and is about to cut them into pieces
  Work out which files the running app can actually get to

  First, find the starting points — the files something outside the code opens
    Read the project's own settings for the places it names by hand
      The list of runnable commands (package.json scripts, bin, main)
      The build settings and their path shortcuts (tsconfig paths)
      The test runner's settings, and the settings of any job runner in the repo
    Find the files the framework opens by where they sit, not by being imported
      A Next.js app opens a file by its name and position alone
        The gatekeeper called middleware (every request passes through it first)
        The page, layout and route files, wherever they sit under the app folder
      Match those names against the framework the project actually declares
    Treat every test file as a starting point of its own
    Is a file named as a starting point by any of those:
      Yes: Mark it a starting point, and record WHICH source named it
      No:  Carry on

  Are there zero starting points:
    Yes: STOP — we found no way into this app, so every file would look unreached
         Tell the user which frameworks we looked for and which we found
    No:  Carry on

  Walk outwards from every starting point, following imports
    Each file reached is marked reached, and so is everything it imports
    Keep walking until nothing new is reached

  Before trusting the walk, check the map can see imports at all
    Count the links that point at a real file in this project
    Count the ones that point at a shortcut the map could not expand
    Is the map failing to expand a meaningful share of them:
      Yes: STOP — the walk would call live files unreached because the map is
           half-blind, not because the code is dead
           Tell the user which shortcut style it could not follow
      No:  Carry on

  Sort every mapped file into reached or not-reached
    Reached:
      It goes into the normal cut, exactly as before

    Not reached:
      Is anything at all in the project mentioning this file by name —
      a test that stands in for it, a job runner, a settings file, a comment:
        Yes: Treat it as reached, and record it as reached-only-by-mention
             We are not sure, so we keep it in
        No:  It is unreached
             It still goes into the scan, in its own group with its neighbours
             It is labelled "nothing reaches this" so the reader knows
             It is also written down as a finding in its own right

  Check the arithmetic before reading anything
    Add up the reached files and the unreached files
    Does that equal every mapped file, each appearing exactly once:
      Yes: Carry on
      No:  STOP — a file fell between the two piles

  Report what the split found, before the reading starts
    How many files nothing reaches, and which folders they sit in
    Which folders are entirely unreached — a whole folder nothing touches is
      the strongest signal, and the most likely to be the real finding
    How many were kept in only because something mentioned them by name
    Which starting-point sources were found, and which were looked for and missing

  Read every group, reached and unreached alike
    An unreached group is read with the same care as a reached one
    Its reader is told: nothing reaches this code, so ask whether it should exist
```

---

## What it does today

```text
The scan cuts up every mapped file with no notion of what the app can reach
  A folder of design-tool output nothing imports is cut and read like live code
  Its 1,538 files compete for attention with the 2,782 files that actually run
  Nobody is told the difference

Separately, there is a "dead code" question the map can already answer
  It looks at one named piece of code at a time
  Does anything call this piece:
    No:  Is it in a file whose path looks like an entry point:
           Yes: Skip it — the path list is bin/, main.*, index.*, cli.*, app.*, server.*
           No:  Is its name capitalised, or does it look exported:
                  Yes: Skip it
                  No:  Report it, marked "candidate" when the map is approximate
    Yes: Ignore it

  # That path list is hand-written and matches nothing in a Next.js app.
  # It never asks what the whole app can reach — only what calls one function.
```

## What changes

```text
The question changes from "does anything call this" to "can the app get here"
  One unused piece of code inside a live file is not the same as a whole
    folder the app has no route to, and only the second is worth acting on

The starting points are found, not typed out
  Today: a fixed list of six path shapes, written by hand, matching nothing here
  Now:   read the project's own settings, and the conventions of the framework
         it declares, and record which source named each starting point

Unreached code is separated and labelled, never removed
  It becomes its own group, read with the same care, and reported as a finding

Uncertainty keeps a file in, and says so
  A file only mentioned in a test stand-in or a settings string stays reached
  and is counted separately, so the doubt is visible rather than resolved silently

The split reports itself before any reading begins
  Counts, folders, and which starting-point sources were missing
```

---

## The rules

```text
A file is unreached only if no walk from a starting point arrives  [RULE] unreached-means-no-path-from-any-root
Starting points are read from the project, never hand-listed       [RULE] entry-points-detected-never-listed
Finding no starting points at all stops the scan                   [RULE] zero-roots-halts
A map that cannot expand import shortcuts stops the scan           [RULE] unresolved-import-share-halts
Unreached files are read, grouped and labelled, never dropped      [RULE] unreached-files-read-not-dropped
Nothing reaching a file is itself reported as a finding            [RULE] unreached-is-a-finding-not-a-filter
Doubt keeps a file in the reached pile, and is counted             [RULE] unsure-includes-and-says-so
Reached plus unreached equals every mapped file, once each         [RULE] reachability-split-reconciles
Every run reports which starting-point sources it found and missed [RULE] root-sources-named-every-run
A file the map only half-sees is never called unreached            [RULE] approximate-map-never-proves-absence
Every stop names both the reason and what to do about it           [RULE] every-halt-names-its-remedy
```

The one thing that must never happen: live code disappearing from the scan
because the map could not see the one link that reaches it. Every step here can
be repeated harmlessly — walking the same links twice reaches the same files,
and stopping twice is still just stopped.

---

## ⚠ Divergence

⚠ Divergence: `entry-points-detected-never-listed` — supersedes shipped behavior.
The dead-code question today skips any file whose path looks like `bin/`,
`main.*`, `index.*`, `cli.*`, `app.*` or `server.*`. That hand-written list is
replaced by reading the project's own settings and its framework's conventions.
Reason: on the real project measured, not one of those six shapes is how the app
starts, so the list protects nothing and hides its own failure.

⚠ Divergence: `unreached-is-a-finding-not-a-filter` — supersedes the intent
behind the original instruction. The instruction was "if nothing calls it,
exclude it." What is built instead separates and labels rather than excludes.
Reason: the 1,879 committed files nothing imports ARE the duplicate-and-dead-code
problem the scan exists to find. Filtering them out would delete the finding.

---

## Why this shape

- **The objective** — stop 1,538 files of design-tool output from drowning the
  2,782 files that actually run, so attention lands where the app lives. The
  objective is attention, not removal. Once that is said plainly, filtering is
  obviously the wrong tool: you do not find dead code by hiding it.

- **What it conflicts with** — two things, and I am not smoothing either over.

  The scan's own agreement says the scan still opens and reads every file,
  because finding a logic mistake inside a file requires reading that file, and
  a map of what-calls-what holds no logic. Any version of this that reads fewer
  files breaks that agreement. This version reads exactly as many files as
  before; it only changes which ones are grouped together and what the reader is
  told about them. There is also a standing rule that a query never returns a
  quietly shortened answer — anything left out must be reported as left out.
  Labelling and counting satisfies it; filtering would not.

  The second conflict is with your own instruction, and it is a real one. You
  said exclude it, and I am proposing to keep it and label it. I think excluding
  is wrong for the reason above, but the call is yours and it is flagged rather
  than quietly reinterpreted.

- **What already exists that we reuse** — the map, the walk, and the existing
  dead-code answer's honesty habits. The existing answer marks a result
  "candidate" whenever the map is approximate, precisely because a missed link
  can make live code look dead; this design inherits that habit wholesale rather
  than inventing a second one. What it does not reuse is that answer's machinery,
  because it asks a different question — it looks at one function and asks who
  calls it, where this asks whether the whole app has any route to a file. The
  same word, two questions. Building a second function-level detector would be
  the duplication to avoid; this is a file-level walk that sits above it.

- **Why this is the simplest version** — following import links out from a set of
  starting points is one plain operation with no opinion in it. The only
  judgement anywhere is what counts as a starting point, and that is read from
  the project's own settings rather than decided.

- **Will it be reused** — yes. "What can this app actually reach" is the same
  question impact analysis asks before a change, and the same one the planner
  wants when sizing a job. It is built as one shared piece.

- **What could go wrong** — the whole risk is in one place, and it is measured,
  not feared.

  On the real project, the map could not expand 5,703 import shortcuts — the
  `@/…` style this project uses for four of every ten internal imports. Judged on
  the map as it stands, 2,668 of 4,927 files look unreached, including 1,919
  under the live source folder. Teaching the walk that shortcut drops it to
  2,167. Walking outwards from detected starting points instead of asking "does
  anything import this" drops it to 346 in the live source folder, and isolates
  the design-tool folder cleanly at all 1,538. Those three numbers are the whole
  argument for this shape: the naive version of your rule would have deleted most
  of a working application from its own scan, and it would have looked principled
  while doing it.

  The residue is honest and it is why doubt keeps a file in. Six files on this
  project are reached only by a test's stand-in declaration — a string in a test
  file, not an import. There are 307 such strings. There are also seven places
  using deferred loading, where the link is a value the map cannot follow. None
  of those are import links, so no walk will ever find them; only the
  mentioned-by-name check keeps them in.

  And the one thing I cannot detect, stated plainly rather than smoothed over: a
  file reached only by a name assembled at run time — a path built from a
  variable, a plug-in list read from a database, a route table written by a build
  step that has not run. Nothing in the map or the settings shows that link. Such
  a file will be labelled unreached. That is the honest limit of this rule, and it
  is exactly why the answer is a label and a finding rather than a deletion: a
  wrong label costs a reader thirty seconds, where a wrong deletion costs the
  scan its point.

- **How a wrong call gets caught** — three ways, all cheap. Every run names which
  starting-point sources it found and which it looked for and did not find, so a
  project whose framework we do not yet understand announces itself instead of
  reporting everything dead. Every run reports the share of import shortcuts the
  map could not expand, and stops rather than guessing when that share is
  meaningful. And whole-folder results are reported separately from scattered
  ones, because a single unreached file is usually noise while an entirely
  unreached folder is usually the real finding — the design-tool folder here, and
  nothing else on this project.

---

## What I confirmed with you

- **Separate and label, not drop — ANSWERED YES (2026-08-10).** The proposal was
  put to David against his own words ("exclude it") and he chose labelling:
  unreached code is read with the same care, marked as unreached, and written up
  as a finding. Those 1,879 files are the dead-code report he is scanning for, so
  filtering them would have deleted the answer.
- **A file reached only by a test counts as REACHED — ANSWERED (2026-08-10).**
  Six files on this project are reached only by a test standing in for them. A
  file a test loads is live code someone maintains; it is marked "reached only by
  tests" so it stays visible, and is not called dead.
- **A whole unreached folder is its own headline finding — ANSWERED (2026-08-10).**
  One scattered unreached file is usually noise; an entire unreached folder is the
  thing to act on. Reporting 1,538 individual entries would bury the register.
- Excluding by name was rejected, and nothing here reintroduces a name list. The
  starting points are read from the project's own settings and its framework's
  conventions, and each one records where it came from.
- Thoroughness is the requirement. Nothing here reads fewer files; the same files
  are read, grouped differently, with unreached code called out.

Still open, and worth your answer before this is built:

- When a file is reached only because a test stands in for it, this keeps it in
  the reached pile and counts it. The alternative is to call it unreached, since
  nothing in the running app touches it — only the tests do. Six files on the
  real project turn on this choice.
- Whether an entirely unreached folder should be its own headline finding
  separate from scattered unreached files. I have written it that way because the
  design-tool folder is the case that started this, but it is your call whether
  that deserves its own line in the report.

---

## Where it lives

| Step in the flow | File |
|------------------|------|
| Ask the map for its files and import links | `bin/gsd-t-graph-query-cli.cjs` |
| Expand the project's import shortcuts | `bin/gsd-t-graph-query-cli.cjs` — extend the resolver |
| Read the project's settings for starting points | new — root detector |
| Walk outwards from the starting points | new — reachability walk |
| The existing one-function-at-a-time dead-code answer | `bin/gsd-t-graph-query-cli.cjs` |
| The cut, and the reading phases | `templates/workflows/gsd-t-scan.workflow.js` |
| Where the reached/unreached split is reconciled | new — alongside the git reconciliation step |
