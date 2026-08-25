# Judge Every Requirement Against The Code That Exists

Take a document describing what a system should do, decide for each item whether it is actually built, and land the answer on the estimating sheet so the cost of the missing work can be worked out next.

```text
Someone asks what is missing between the promise and the product
  Gather everything the tracker project holds — the requirements are not
  written down yet, they are being worked out from this
    The files attached to the project, not just its description
      # The description is often empty and the real documents are attachments.
      # One attached statement of work carried the whole specification.
    Every task, and every task beneath a task
      # The top-level ones are summaries. The detail, and the pointers to real
      # files, sit one level down.
    Every comment left on a task
    A specification file in the code, when the person names one
    Nothing at all can be reached — no permission, a refused download:
      STOP — name the source that could not be read
    The project looks empty:
      Check the attachments before believing it
  The person says to ignore a source:
    Leave it out, and say which sources were used
  Whatever the tracker says about a thing being finished:
    Treat it as a claim to be checked later, never as the answer
    # Half the finished-looking items were not finished, and some marked
    # unfinished had already shipped.

Make sure the map of the code can be trusted, before trusting it
  Is there a map:
    No:  Build one
    Yes: Is it current: No: Rebuild the parts that moved
  Does the map look wrong — pointing at things that are not there:
    Yes: Repair it, then re-check anything already judged using it
  It cannot be built at all:
    STOP — say so. Never answer a question about how code connects by
    searching for words in it.
  Sort every item into two piles:
    Building it would add or change code, or something stored:
      Keep it
    It would not:
      Drop it — and keep a list of what was dropped, with the reason
      # A rollout policy, a planning step, a decision about how to run the
      # trial: real work, but nobody writes code for it, so it cannot be
      # judged built or unbuilt and cannot be priced.
  Group what remains into features a person would name
    Each feature is one row
    Its individual items become bullets inside that row, not rows of their own
  For each feature, write what it is for, in one sentence
  For each feature, write what it must do, as bullets
    Say it as an instruction — "Work out the student's required hours"
    Never as a statement of fact — "Resolves the student's required hours"
    # Present tense reads as a description of working code. On a row that
    # turns out to be unbuilt, the row contradicts itself.
  For each feature, look at the actual code and decide:
    Everything is built:
      Mark it built
    Nothing is built:
      Mark it absent
    Some is built:
      Mark it partly built, and list WHICH bullets are missing
      # "Partly built" with no list is not an answer anyone can act on.
  For each feature, write what works today and what does not
  For each feature, record where the claim came from
    The source document, the tracker item, the pull request
    Each one a short clickable name, never a wall of file paths
  For each feature, note the known problems that would hit it
    Judge by the code each problem names, never by matching words

Checking the result — done by people who did not write it
  Tell each checker plainly: this sheet contains false claims, find them
  Give each checker a clean start, with none of the reasoning that made the cell
  Split the checking by how expensive one check is:
    Reading a sentence or following a link:
      Check every single one
    Proving a piece of code is absent:
      Check a batch of twenty
      Three or more wrong in the batch:
        Check every one — the batch proved the column cannot be trusted
  One checker does nothing but look for the sheet disagreeing with itself
    # A row saying a thing works, next to the same row listing that thing as
    # its main gap.
  Every checker returns a verdict:
    Found defects: say what and where
    Found none: say plainly that it searched and found none
  Nobody found anything anywhere:
    Say so, and run the checking again with sharper instructions
    # One clean column out of six is the normal shape. All clean means the
    # checkers were too gentle, not that the work was perfect.

Fixing what the checkers found
  Correct the cells they named
  Hand the corrected cells to a NEW set of checkers, fresh again
    They pass: Done
    They fail: Correct once more, check once more
      Still failing after the second round:
        STOP — hand it to the person, say what will not settle
        # Two rounds that cannot converge is a sign the underlying idea is
        # wrong, not that a third round would land it.

Writing it out
  Put it on the estimating sheet, in the columns for what and whether
  Leave the columns for size and money empty
    # A different instruction fills those, reading what this one wrote.
```

---

## What it does today

```text
Someone asks what is missing between the promise and the product
  A person does it by hand, over many hours, in a chat session
  The steps exist only in that session's history
  # The AI Scheduling sheet took 38 rounds of back-and-forth. Every judgment
  # about what counts as a requirement was made live and never written down.

Checking the result
  A sample of seven rows is looked at and approved
  Later, a harder look at all of them finds most are wrong
  # Forty-five of sixty-four sentences were defective in a column already
  # signed off. The sample was too small and the reviewer too agreeable.

Doing it again for the next project
  Start over, from memory, and hope the same judgment calls get made
```

## What changes

```text
The steps become an instruction anyone can run
  The same sources, the same sorting, the same grouping, every time

The sorting rule is written down, not remembered
  Would building it add or change code, or something stored?
  # This is the step that removed most of the original list, and the step a
  # machine gets wrong without being told the rule plainly.

Checking becomes adversarial and sized to the work
  Checkers are told to find false claims, not to confirm the sheet
  Cheap checks cover everything; expensive checks cover a batch that widens
  when the batch fails

A fix is treated as a new claim
  Corrections get checked by people who did not make them

Sizing moves out
  This instruction stops at what-and-whether; a second one prices it
```

## The rules

- `[RULE]` An item stays only if building it would add or change code or stored data. Everything else is dropped, and the dropped list is kept with a reason for each.
- `[RULE]` A feature marked partly built MUST list which of its own bullets are missing. "Partly built" alone is not an answer.
- `[RULE]` Requirement bullets are written as instructions, never as statements of current fact. A statement of fact on an unbuilt row makes the row contradict itself.
- `[RULE]` Checkers are told the sheet contains false claims and are asked to produce them. A checker asked whether something looks right will say yes.
- `[RULE]` Every checker starts fresh, without the reasoning that produced the thing it checks.
- `[RULE]` Checks that cost only reading — a sentence, a link, a bullet against its source — cover EVERY item. Checks that require proving code is absent cover a batch of twenty, widening to every item when three or more in the batch are wrong.
- `[RULE]` One checker looks only for the sheet disagreeing with itself across columns. No checker confined to one column can see that.
- `[RULE]` All checkers returning nothing is a failed check, not a clean sheet. Run again with sharper instructions.
- `[RULE]` A correction is an unverified claim: fresh checkers must attack the corrected cells. Two rounds without settling is a STOP, not a third round.
- `[RULE]` The size and money columns are left untouched. A separate instruction fills them from what this one wrote.

## ⚠ Divergence

None. This writes down a process that until now lived only in one session's history.

## Why this shape

- **The objective** — say what is missing between a requirements document and the running product, in a form that can be priced.
- **Why the sorting step leads** — it removed most of the original list. Rollout policy, planning steps and trial design are real work but produce no code, so they can be neither judged built nor priced. Getting this wrong poisons everything after it.
- **Why bullets live inside a row** — one hundred and forty-one item-rows are unreadable; thirty-three feature-rows with bullets inside are the shape a person can review. Measured on the real sheet: 33 rows carrying 241 bullets.
- **Why the checking is adversarial** — the friendly version was run and passed a column that was seventy percent wrong. The adversarial version, on the same sheet, found it.
- **Why coverage splits by cost** — the sheet holds 595 checkable claims. Reading all 382 cheap ones costs little; proving absence 212 times costs a code search each. A batch that widens on failure spends effort where the errors actually are.
- **What we reuse** — the estimating sheet, its service-account write path, and the sizing instruction that already exists. Only the judging half is new.
- **The risk** — writing wrong answers into a live client sheet. Answered by leaving the money columns alone, and by the fix-then-recheck loop stopping rather than looping.
- **The trade accepted** — sampled columns can still hide a wrong claim. Widening on failure bounds how much, and the cross-column checker catches the contradictions that matter most.

## Where it lives

- `commands/gsd-t-gap-analysis.md` — the instruction.
- `commands/gsd-t-estimate.md` — the sizing instruction that reads what this one wrote.
- `templates/playbooks/tekyz-estimation-and-prd-playbook.md` — the sheet layout and the money sums.
