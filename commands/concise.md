# Concise — Rewrite the Last Reply Short

Take the reply you just gave and say it again in as little of David's reading
time as possible. He asked for this one; there is no guessing about whether it
was wanted.

`$ARGUMENTS` may name what to keep or drop ("just the numbers", "drop the
background"). Empty is the normal case.

## Step 1: Find what to rewrite

Your own last reply is already in this conversation — read it there. Do NOT
shell out, do not read the transcript file, do not spawn another model. You
wrote it; you have it.

Rewrite **the prose of your last reply only**: not the tool calls, not this
command, not anything from an earlier turn. If your last turn was nothing but
tool calls with no prose, say "nothing to shorten — the last turn was all tool
work" and stop.

## Step 2: Rewrite it

Apply these rules exactly. They are the standing Reader Contract, which is why
the rewrite should read like the reply you should have written the first time.

1. **ANSWER FIRST.** The answer is the first thing. Nothing before it.
2. **NO PREAMBLE.** Cut any sentence that announces a point instead of making
   it.
3. **NO BACKSTORY.** Cut what failed before, what cannot work, how it works
   today, what was rejected — unless he asked about exactly that.
4. **NO JARGON.** Plain words. A technical term rides alongside the plain
   meaning, never instead of it.
5. **KEEP ONLY WHAT IS RELEVANT TO HIM.** Of every sentence: does this change
   what he decides, what he does next, or what he now knows? If not, cut it.
   The work you did, the steps you took, what you checked and ruled out — your
   business, not his, unless he asked.
6. **Prefer a short list or a small table** over a paragraph.

**Keep these — dropping one makes the rewrite worse than the original:**

- The dated status banner, if the reply had one.
- **Every question he is meant to ANSWER**, as its own line at the end. A
  question you asked yourself ("Now the proof: does it fire?") is narration —
  cut it like any other narration. The test: would he type an answer to it?
- Any warning, failure, or thing that went wrong. Never soften a bad outcome.
- File paths, links and code blocks, exactly as written.
- Specific numbers and names, unchanged. Never invent one that was not there.

## Step 3: Check it before sending

Read your own rewrite once and ask the two questions that matter:

- Is this ONLY what he needs?
- Is it truly concise by the rules above?

Fix what fails.

## Step 4: Output the rewrite and NOTHING else

**Your entire message is the rewritten reply.** Not a word before it, not a word
after it.

Banned, every one of them:

- a heading like "Concise version" or "Shortened:"
- an opener like "Here's the shorter version"
- a closing note about what you cut, how many words you saved, or why
- any explanation that a rewrite happened at all

He asked for the reply to be shorter. A commentary wrapper makes it longer,
which is the one thing this command exists to prevent. If you find yourself
writing a sentence *about* the rewrite, delete it — that sentence is the bug.

## What this command will not do

- **It cannot unsay the original.** The long version stays above the short one
  in the scrollback; nothing can retract printed text. That is the accepted
  cost of asking after the fact, and it is why the automatic version of this
  (the M107 Stop hook) was retired in v5.11.15 — it imposed that cost on every
  turn, unasked. Here you chose it.
- **It never changes a fact to save words.** A shorter reply that says something
  untrue is a wrong outcome; a long reply is only a poor one.
- **It does not re-do the work.** If the original was wrong, `/concise` gives you
  the same wrong answer, shorter. Ask for a correction instead.

## Document Ripple

None. This command produces a message, and touches no file.
