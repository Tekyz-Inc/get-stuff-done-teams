# Prove Every File Was Read, Then Read It Twice From Different Angles

The scan promises it leaves nothing out but never checks, so first make it prove which files it read, and only then add a second cut of the same code from a different angle.

```text
A deep scan of a codebase starts
  Take the complete list of source files from the project itself
    (git's own file list — the one thing that cannot miss a file)
  Hold that list as THE MANIFEST for the whole run — every later step answers to it

  Cut the codebase into slices by BUSINESS FEATURE, and read them
    Every reviewer reports back two separate things:
      The problems it found
      The list of files it actually opened
    Compare the files opened against the manifest:
      Every file was opened:
        Carry on
      Some files were never opened by anyone:
        Give the leftovers to fresh reviewers, in small batches
        Compare again:
          Everything now opened: Carry on
          Still some never opened:
            STOP the whole scan
            Say exactly which files nobody read
            Write nothing

  Cut the SAME codebase again, this time by TECHNICAL LAYER, and read it
    (the routes together, the screens together, the database code together)
    Same two reports back: problems found, and files actually opened
    Same leftovers check, and the same stop for anyone still unread

  Now bring the two sets of problems together
    For each problem from the second cut:
      Is it the same defect as one already found in the first cut:
        Yes: Keep one entry, and record that both cuts found it
        No:  Keep it as its own entry
    Never drop a problem just because only one cut found it
    Never mark a file "clean" because a reviewer read it and said nothing

  Write the register
    Say how many files were read, out of how many exist
    Say which problems both cuts found, and which only one did
```

---

## What it does today

```text
A deep scan of a codebase starts
  A single reviewer measures the code and carves it into slices
    It is TOLD "every file must land in exactly one slice"
    Nobody ever checks whether it did
  Each slice goes to one reviewer, which reports the problems it found
    It is TOLD "read every file, do not sample"
    Nobody ever checks whether it did
  Did any reviewer fail outright and hand back nothing:
    Yes: Retry it, then retry again slowly on its own
      Still failing: STOP, write nothing
    No:  Carry on
  Merge problems that look like duplicates
  Write the register, and call the coverage FULL
```

The gap, in one line: **"full coverage" today means "no reviewer crashed", not "every file was read".** Two things are asked for in words and never verified — that the slices between them cover the whole codebase, and that each reviewer opened every file it owned. A reviewer that quietly reads a third of its files reports a short list of problems and is indistinguishable from a reviewer that read everything and found little.

Measured on the real project (HiloAviation, both registers still on disk):

```text
The run that cut by technical layer
  Reported 297 problems, and named 265 distinct files
The run that cut by business feature
  Reported 42 problems, and named 56 distinct files
Files named by both: 33
Files named only by the layer cut: 232
Files named only by the feature cut: 23
Files in the project: 4,785
Files named by either run: 288
```

Both runs were logged as FULL coverage.

## What changes

```text
Three things are added, in this order of importance

  First — the manifest and the proof
    The list of files comes from the project, not from a reviewer's judgement
    Every reviewer hands back the files it opened, alongside what it found
    Anything nobody opened is re-assigned to fresh reviewers
    Anything still unopened after that STOPS the scan

  Second — the second angle
    The same code is cut a second time, by technical layer instead of by feature
    It runs through the same reviewers, the same proof, the same stop

  Third — the merge that keeps disagreements
    Two write-ups are the same defect only when they are the same defect
      in the same place, not merely similar in wording
    A problem found by one cut and not the other is KEPT
    Silence from a reviewer is never recorded as "this code is fine"
```

---

## The rules

```text
The file list comes from the project, never from a reviewer   [RULE] manifest-is-mechanical-not-judged
A reviewer reports which files it opened, not only what it found [RULE] reviewers-report-files-read
Files nobody opened are re-assigned, then STOP if still unread [RULE] unread-files-halt-never-shrug
Coverage means files read, never "no reviewer crashed"        [RULE] coverage-counts-files-not-failures
A file read with nothing found is never recorded as verified clean [RULE] silence-is-not-a-clean-bill
A problem only one cut found is kept, never voted away        [RULE] single-pass-findings-survive-merge
Two write-ups merge only on same defect AND same place        [RULE] merge-on-defect-and-place
The second cut uses a different angle, never a different size [RULE] second-pass-varies-angle-not-size
```

The one thing that must never happen: the scan reporting FULL coverage over code no reviewer opened — because every later decision treats that register as the complete picture of the debt. Every step here can be repeated harmlessly: re-reading a file finds the same problems, re-running the leftovers check on a complete manifest finds no leftovers, and stopping twice is still just stopped.

---

## ⚠ Divergence

⚠ Divergence: `What changes` — supersedes the shipped meaning of "Coverage: FULL" in the register header. Today it means no reviewer crashed; it will mean every file was opened. Reason: the current wording states something the scan does not check, and it is the sentence a reader most relies on.

⚠ Divergence: `[RULE] second-pass-varies-angle-not-size` — supersedes v5.11.22, which pinned slicing to by-feature only. Reason: pinning one angle guarantees that angle's blind spot permanently. The pin is not removed but demoted — by-feature stays the first cut; by-layer is added as the second.

---

## Why this shape

- **The objective** — not "find every defect", which cannot be checked, but the one thing that can: **never report code as examined when nobody looked at it.** A wrong register is worse than a short one, because a short one invites another look and a wrong one closes the question.

- **What it conflicts with** — two things I changed earlier today, both of which this partly reverses. Pinning the cut to by-feature (v5.11.22) was aimed at a real problem (a defect spanning two layers is invisible when the layers sit in different slices) but the fix made that angle's blind spot permanent. Sizing slices to ~120 files (v5.11.23) is right and stays. Registers from different angles cannot be compared item by item, so the register records which cut found each problem.

- **What already exists that we reuse** — most of it. The duplicate-merging step already takes findings from many reviewers and groups the ones that are the same issue; the second cut's findings go through that same step rather than a new one. The stop-on-failure path, the retry, the unhurried second sweep, and the crowding gate all work unchanged and now protect two cuts instead of one. Nothing new is built for merging.

- **Why this is the simplest version** — the expensive part (a second reading of the whole codebase) is deliberately the *second* thing added, not the first. The proof-of-reading is a file list compared against another file list: no judgement, nothing to get wrong, and it is what turns "we think we read everything" into a fact. If the proof shows the first cut genuinely reads everything, the second cut is buying a different *perspective* on fully-read code — which is worth having, but is a different purchase, and worth knowing you are making.

- **What I am NOT building** — a third "leftover sweep" pass as a separate stage (it is a step inside each cut, not a pass of its own); a size-varied pass (see below); a new merger; a confidence score derived from how many cuts agreed; any rule that drops a finding for being unconfirmed.

- **Size versus angle** — the evidence says angle, not size, and they are not two halves of one thing. The two runs differed in both size and angle at once, so the raw comparison cannot separate them; but the *kind* of miss tells them apart. Files missed by the feature cut were compliance exporters and scheduled jobs — code that belongs to no feature, so no slice claimed it. Making slices smaller does not help, because a smaller slice of a feature is still a slice of a feature and the exporter still belongs to none. That is an angle miss. The other kind — components inside a large feature going unread — looks like a size miss, but the fix for it already shipped this morning (~120 files per slice) and the proof-of-reading now *detects* it directly rather than inferring it. So: vary the angle, keep size fixed at the limit a reviewer can honestly read.

- **Will it be reused** — the proof-of-reading is the reusable piece and is built as its own shared step from the start. Anything that fans work across reviewers and then claims completeness needs the same "prove you covered it" check.

- **What could go wrong** — the register doubling in length without doubling in truth. Two cuts over one codebase produce two write-ups of the same defect in different words, and a merge that misses the match reads as two problems. That is why the merge matches on defect *and* place, why every entry records which cuts found it, and why the header reports files-read as well as problems-found: a reader can see whether a bigger number means more debt or just more looking.

- **Is multi-pass right at all** — partly. It is the right answer to the blind-spot evidence and the wrong answer to the coverage problem, and the coverage problem is much the larger one. One pass that proves what it read beats two passes that do not. Do the proof first; it is small, it is mechanical, and it is what tells you whether the second pass is finding new code or re-finding the same 6%.

---

## What I confirmed with you

Settled before this pass, treated as fixed, not re-argued: nothing may be left out of a scan; nothing continues past a failure in a degraded state; failures recover by re-running or they stop the run; cost and time are not constraints on this decision; accuracy counts equally with thoroughness.

Open question, and the reason the second cut is staged after the proof: whether the layer cut is worth its cost *once the proof-of-reading is in place*. Tonight's two runs cannot answer it, because neither knows what it actually read. Run the proof on one cut first; if it shows most of the codebase going unread, the fix is coverage, not a second angle.

A note on the evidence itself: "the file was named in a finding" is the only record either run left behind, and it is a poor stand-in for "the file was read". A file can be read carefully and be clean. So the 288-of-4,785 figure is a floor on unread code, not a measurement of it — nobody can currently tell those apart, which is precisely the gap the first change closes.

---

## Where it lives

| Step in the flow | File |
|------------------|------|
| The whole scan sequence | `templates/workflows/gsd-t-scan.workflow.js` |
| Cutting the code into slices | `templates/workflows/gsd-t-scan.workflow.js` (the Probe phase) |
| One reviewer reading one slice | `templates/workflows/gsd-t-scan.workflow.js` (`finderPrompt`, `scanSlice`) |
| Re-running reviewers that failed | `templates/workflows/gsd-t-scan.workflow.js` (the final sweep) |
| Merging duplicate problems | `templates/workflows/gsd-t-scan.workflow.js` (`synthesis:dedup`) |
| The manifest + proof-of-reading check | new, shared — not yet written |
