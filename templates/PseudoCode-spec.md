# {Title}

{One sentence: what happens, in plain words. Two max. Usually one is enough.}

```text
{Where it starts — a screen, an arriving message, a scheduled moment}
  {The first thing that happens}
  {Is <the question being decided>}:
    Yes: {what happens}
      {Is <the next question>}:
        Yes: {what happens}
        No:  {what happens instead}
    No:  {what happens instead}
```

---

<!--
  ─────────────────────────────────────────────────────────────────────────────
  HOW TO WRITE THIS  (delete this comment block in the real instance)
  ─────────────────────────────────────────────────────────────────────────────

  THE FLOW IS THE DOCUMENT. Everything else is an appendix below the divider
  that the reader never has to open. Do not put explanation above the flow.

  ── SHAPE ───────────────────────────────────────────────────────────────────
  • A nested decision tree, indented 2 spaces per level. Not prose. Not code.
  • Each line is one thing that happens, or one question being decided.
  • A question line ends with a colon and is answered by indented
    `Yes:` / `No:` lines directly beneath it (or named outcomes when there are
    more than two — `Found:` / `Expired:` / `Never seen:`).
  • NO function-call syntax. Write `Save it against the client's record`, never
    `saveForClient(clientId, record)`. No `if`/`return`/`throw`/`tx:`/`→`.
  • NO paragraphs inside the flow block. If a line needs a paragraph, the flow
    is wrong — split it into more lines.

  ── WORDS ───────────────────────────────────────────────────────────────────
  Plain English carries the sentence; the technical name rides ALONGSIDE it in
  parentheses. The reader must never have to translate a line in their head.

      GOOD: Zoom's webhook (its automatic ping to us) arrives at /zoom/events
      GOOD: Read the message it sent (the payload) — pull out the meeting id
      GOOD: Save it in the invoices table
      BAD:  A webhook fires                       (which webhook? whose?)
      BAD:  Parse the payload                     (untranslated jargon)
      BAD:  Return 401                            (means nothing on its own)

  • Name the REAL thing. "Zoom", "the Save button", "the invoices table",
    "/zoom/events" are concrete and welcome. Bare category-nouns — webhook,
    payload, endpoint, handler, token, cache — are not, unless glossed.
  • GLOSS ONCE PER SECTION. First use in a section carries the plain
    explanation in parentheses; later lines in that same section use it bare.
    A new `##` section re-glosses, so a reader landing mid-file still follows.
  • Plain FIRST, term in parentheses SECOND. Not the reverse.

  ── FILE STRUCTURE ──────────────────────────────────────────────────────────
      # Title
      One-sentence purpose.
      The flow.
      ---
      Everything else.

  Below the divider, in any order, only what this subject actually has:
    • `## What it does today` / `## What changes` — the before/after, each as
      its own flow in the same style.
    • `## The rules` — the guard map. Every invariant as a one-line `[RULE]`
      (grammar owned by the contract §2 — do not re-derive it here).
    • `## ⚠ Divergence` — flags wherever this supersedes shipped behavior.
      Keeping existing behavior = no flag. (Contract §4.)
    • `## Why this shape` — the Architect's Six-Stage answers, in plain words.
    • `## Where it lives` — file and function pointers, if useful. These belong
      HERE, not in the flow.

  ── NAMING + CITATION ───────────────────────────────────────────────────────
  • Name the file `PseudoCode-[Title].md` where [Title] is the SUBJECT
    (`PseudoCode-ProfileUrlSave.md`), never a milestone id. Only this blank
    mold keeps the `-spec` suffix.
  • A milestone may produce several files — one per coherent subject.
  • Plan tasks cite a section back with:
        **PseudoCode-Section**: {Title}#<github-slug-of-the-## heading>
  • Grammars live in `.gsd-t/contracts/pseudocode-source-of-truth-contract.md`
    (§1.1 flow style · §2 guard-map · §3 citation · §4 divergence). Do NOT
    re-derive them here.
  ─────────────────────────────────────────────────────────────────────────────
-->

## What it does today

```text
{The current flow, same nested style. Delete this section for new behavior
 that has no "today".}
```

## What changes

```text
{The new flow, same nested style. The reader should be able to diff this
 against the section above by eye.}
```

---

## The rules

```text
{invariant in one line}                          [RULE] {the invariant}
{what can never happen}                          [RULE] {the prohibition}
{what happens on failure}                        [RULE] {the safe-failure invariant}
```

{One short paragraph, plain words: the one thing that must never happen, and
why repeating any step is harmless.}

---

## ⚠ Divergence

{`⚠ Divergence: <section or RULE-ID> — supersedes shipped <what>. Reason: <the
intention>.` for each supersede. Delete this whole section if nothing is
superseded.}

---

## Why this shape

{The Architect's Six-Stage answers, in plain jargon-free sentences. What the
objective is · what it conflicts with · what already exists that we reuse ·
why this is the simplest version · whether it will be reused again · what
could go wrong.}

---

## Where it lives

| Step in the flow | File |
|------------------|------|
| {the flow line} | `{path}` |
