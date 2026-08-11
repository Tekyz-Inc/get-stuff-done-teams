# Pausing a Scan and Picking It Back Up

A stopped scan keeps the work it already finished, and refuses to reuse any of it that the code has since changed under.

```text
A scan of a project starts
  Work out the fingerprint of this run — what would make a later run "the same scan"
    The project folder
    The version of GSD-T doing the scanning
    The exact instructions the readers will be given
    Whether the code map (our searchable index of the codebase) is helping or not
  Note the fingerprint down in the scan's own folder, and start

  After the codebase is cut into pieces
    Write down the pieces, and for every file in every piece, a fingerprint of its contents
    Say the cutting is finished

  As each piece is read
    Write down that piece's findings the moment they come back
    Alongside them, write the content fingerprints of the files those findings came from
    Say that piece is finished
    # One piece at a time. A scan stopped here keeps every piece already finished.

  When every piece has been read
    Say the reading is finished

  After the findings are merged, ranked and numbered
    Write down the merged list
    Say the merge is finished

  When the register is written and the documents are done
    Delete the saved work — the scan finished, there is nothing to pick up
```

```text
Somebody asks to pick up a stopped scan
  Is there saved work for this project:
    No:  Say so, and offer to start a fresh scan instead
    Yes: Does its fingerprint match a scan started the way this one would be:
      No:  STOP — say which part differs (different GSD-T version, different
           instructions, different code-map help) and offer a fresh scan.
           Never mix findings produced under two different sets of instructions.
      Yes: Which of the three ways to pick up was asked for:

        Carry on from where it stopped:
          Take every piece that was finished
          Re-fingerprint the files each of those pieces read
            Is every one of them unchanged since it was read:
              Yes: Keep that piece's findings
              No:  Discard that piece's findings and put the piece back in the queue
                   # Its findings point at line numbers that have moved.
          Take every piece never finished, and put it in the queue too
          Read everything in the queue, exactly as a fresh scan would
          Then merge, rank, number, and write, exactly as a fresh scan would

        Read the code again, keep the way it was cut up:
          Discard every finding from every piece
          Re-fingerprint every file in the saved cutting
            Have any files been added or deleted since the cutting:
              Yes: STOP — the cutting no longer covers the project.
                   Say which files are new or gone, and offer a fresh scan.
                   # Keeping a stale cutting is how a file goes unread.
              No:  Put every piece in the queue and read them all again

        Just redo the merge and the write-up:
          Are all the pieces finished:
            No:  STOP — say how many were never read. Merging a partial set
                 produces a register that looks finished and is not.
            Yes: Re-fingerprint the files behind every saved finding
              Is every one of them unchanged:
                Yes: Merge, rank, number and write from the saved findings
                No:  STOP — name the changed files and say that some findings
                     now point at code that has moved. Offer "carry on" instead,
                     which re-reads exactly those pieces.

  Whichever way it went, before writing anything
    Count the pieces that produced findings against the pieces the cutting defined
    Is every piece accounted for:
      Yes: Write the register
      No:  STOP and name the missing pieces, exactly as a fresh scan does
```

---

## What it does today

```text
A scan runs from start to finish in one go
  It cuts the codebase into pieces
  It reads every piece, holding the findings in memory
  It merges them, and writes the register at the very end
  The only thing it ever saves along the way is whether the code map helped

  Does something stop it before the end — the session is closed, the machine sleeps:
    Every finding is gone
    # Last night a run that had found 297 problems left nothing behind.

  Do some pieces fail to come back:
    Retry each of them once, slowly, on their own
    Still failing:
      STOP, write nothing, and print "re-run to scan only the failed areas"
      # That offer cannot be taken up. Nothing records which areas failed,
      # so a re-run starts over from the beginning.
```

## What changes

```text
The scan writes down its work as it goes
  The cutting, once decided
  Each piece's findings, as each piece finishes
  The merged list, once merged
  And with every finding, the content fingerprints of the files behind it

A stopped scan can be picked up in one of three ways
  Carry on          — keep the pieces that finished, read the rest
  Read again        — keep the cutting, discard the findings, re-read
  Redo the write-up — keep every finding, redo the merge and the documents

Any saved work resting on code that has since changed is refused, never reused
  Findings whose files changed are thrown away and those pieces are read again
  A cutting that no longer covers the project stops the resume
  Saved work from a different GSD-T version or different instructions stops the resume

Pausing needs no new button
  Stopping the session is the pause — the saved work is already on disk
```

---

## The rules

```text
Saved work is refused unless the run fingerprint matches exactly     [RULE] resume-requires-identical-fingerprint
A finding is reusable only while every file behind it is byte-identical [RULE] finding-dies-with-its-file
Changed files send their piece back to be read, never patched up      [RULE] stale-piece-reread-never-adjusted
The coverage count runs on a resumed scan exactly as on a fresh one   [RULE] resume-counts-coverage-like-a-fresh-run
A resume that cannot be done safely stops and names the remedy        [RULE] unsafe-resume-halts-with-named-remedy
Redoing the write-up over a partial set of pieces is refused          [RULE] no-writeup-over-partial-pieces
Saved work is deleted the moment the scan finishes                    [RULE] saved-work-dies-on-completion
Saved work older than the agreed shelf life is refused, not resumed   [RULE] expired-saved-work-refused
Every piece's findings are saved the moment that piece finishes       [RULE] piece-saved-on-completion-not-at-end
```

The one thing that must never happen: a picked-up scan writing a register that
mixes fresh findings with findings describing code that has since changed, while
the register says it is current. Every step here can be repeated harmlessly —
re-reading a piece that was already read produces the same findings, and
throwing away saved work only costs the reading again.

---

## ⚠ Divergence

⚠ Divergence: `## What changes` — supersedes the shipped message "Nothing has
been written. Re-run to scan only the failed areas." That offer describes
behavior that does not exist: nothing records which areas failed, so a re-run
always starts from the beginning. Reason: the message should either be true or
not be printed, and with the saved work it becomes true.

Nothing else is superseded. The cutting, the reading, the retry, the after-run
sweep, the coverage stop, the merge, and the register format all stay exactly as
they are. This adds writing-down and picking-up around them.

---

## Why this shape

- **The objective** — a scan that is stopped should not throw away correct work,
  and must never present old findings as current ones. Both halves matter; the
  second is the one that can do damage.

- **What it conflicts with** — the design for cutting the codebase up using the
  code map ("graph-driven slicing") is agreed but not built. Saved work records
  whatever cutting the run actually used, so it does not care which of the two
  ways produced it. The one place they touch: that design stops a scan when the
  code map is stale, and this one refuses saved work whose files have changed —
  the same instinct, applied to two different stored things, so neither has to
  know about the other.

- **What already exists that we reuse** — the way GSD-T decides whether its code
  map has gone out of date is exactly the test needed here: a fingerprint of each
  file's contents, compared against the fingerprint stored when it was read. That
  is reused rather than reinvented, and it is the reason this can be decided per
  piece instead of refusing the whole scan. The way the debug loop saves its state
  between runs — write to a temporary file then rename, and refuse to read
  anything that comes back damaged — is copied as-is. The coverage count, the
  retry, and the after-run sweep are untouched and simply run again.

- **Why this is the simplest version** — there is no pause button, no signal to
  listen for, no new command to stop a scan. Stopping the session is the pause,
  because the work is already written down by then. What is added is writing
  findings down as they arrive instead of holding them all to the end, and one
  check on the way back in.

- **Will it be reused** — the saved-work file itself, no: it holds a scan's
  pieces and findings, and nothing else produces those. The two pieces inside it
  will be: "is this file still what it was" and "is this the same run", both of
  which every long workflow will want. So those two are built as their own small
  shared things from the start, and the scan is their first user.

- **What could go wrong** — three things. Saved work from an abandoned run being
  picked up months later: prevented by refusing anything past its shelf life and
  by refusing a fingerprint that does not match. A register quietly written from
  half a scan: prevented by running the same coverage count on the way out that a
  fresh scan runs. And the file growing large enough to be a nuisance in the
  project's history: it is kept out of the project's history entirely, alongside
  the other working files GSD-T writes as it runs.

- **What I would not build** — of the three ways to pick up, "just redo the
  write-up" is the one that can produce a dishonest register, because it is the
  only one that writes a register without re-reading any code. It is kept, but
  only in the narrow case where it is provably honest: every piece finished, and
  every file behind every finding unchanged. In every other case it stops and
  points at "carry on", which does the same job and re-reads what it must. A
  version of it that continued anyway would be the worst feature in this
  document.

---

## Where it lives

| Step in the flow | File |
|------------------|------|
| Writing the cutting and each piece's findings down | `templates/workflows/gsd-t-scan.workflow.js` (Probe + Deep Scan phases) |
| Reading saved work back and deciding the three ways | `templates/workflows/gsd-t-scan.workflow.js` (new Resume phase, before Probe) |
| The saved-work file itself | `.gsd-t/scan/.resume-state.json` (kept out of git) |
| Is this file still what it was | `bin/gsd-t-graph-freshness.cjs` (`hashFileContent`, reused) |
| Is this the same run, and is the saved work still good | `bin/gsd-t-scan-resume.cjs` (new) |
| Writing to disk from inside the workflow | an agent's Bash, per the sandbox rule — never direct file access |
