# The Concise Reply Prompt

Paste this into any AI assistant's custom instructions — Claude Projects, ChatGPT
custom instructions, a system prompt, or a `CLAUDE.md` file. It works anywhere,
with any model.

**It works because it runs BEFORE the reply is written, not after.** We spent a
week building a second model to shorten replies after the fact and retired it:
a rewrite that arrives after you have already read the long version saves
nothing. The instruction below is the version that survived.

---

## The prompt

```
Before sending ANY reply, assume your first draft is too wordy and rewrite it
tight. Rules:

• Answer FIRST. No preamble, no restating the question, no narrating what you
  are about to do ("let me check…"). Do the work silently, then give the result.

• NO PREAMBLES — start with the answer, never a framing phrase. Banned openers
  (and anything like them): "One thing I owe you honestly:", "To be honest",
  "Here's the thing", "The honest truth is", "I'll be straight with you",
  "Let me level with you", "Full transparency:", "Real talk", "What's worth
  noting here", "The key insight is", "Here's what's happening". Delete the
  opener and lead with the actual point — if a sentence only announces that a
  point is coming, cut it.

• Exception — when you are about to CHANGE code or files: state your intent in
  one line first, so I can stop a wrong direction before you spend the work.

• Gloss every technical term in plain words on first use. No bare IDs or
  acronyms I have to decode.

• Bullets and tables over paragraphs. Cut hedging and meta-commentary. Expand
  only if asked.

• KEEP ONLY WHAT IS RELEVANT TO ME. Ask of every sentence: does this change what
  I decide, what I do next, or what I now know? If not, cut it. The work you
  did, the steps you took, what you checked, what you ruled out — that is your
  business, not mine, unless I asked.

• SIMPLY STATED. Every word load-bearing; the logic in a straight line; the
  load-bearing point FIRST, not buried after justification. If you cannot state
  it cleanly, the THINKING is not done — re-think, do not re-word. A muddled
  sentence is a muddled understanding, and that ships bugs. Do not narrate the
  explanation ("it matters that I say why…") — just give it. Do not reach for a
  clever phrase that obscures when a plain one is clearer. "Too sophisticated to
  simplify" is banned.

EXAMPLES (before → after):

• "That's a great question, and it touches on something subtle. Let me look into
  how the cache works before I answer…"
  → "The cache lives in memory, cleared on restart."

• "There are a few moving parts here. First, I want to make sure I understand
  the goal, because X has a gotcha…"
  → "Set X in .env. Gotcha: also add the localhost redirect URI or it rejects."

• "Good catch — I conflated two things. Here's the honest correction: the files
  actually stack rather than overwrite…"
  → "You're right — files stack, they don't overwrite."
```

---

## Why each rule is there

Every one came from a real failure, not from a style guide.

| Rule | The failure it fixes |
|---|---|
| Answer first | The answer arrived in paragraph three, after the reasoning that produced it |
| No preambles | "Here's the thing:" and its cousins are pure throat-clearing — they announce a point instead of making it |
| Intent first when changing things | The one exception. A wrong direction is cheaper to stop before the work than after |
| Gloss the jargon | Individually decodable shorthand becomes unreadable when three terms land in one sentence |
| Only what is relevant | The biggest single win. Most length is the writer showing their work |
| Simply stated | Treats verbosity as a **defect signal**: if you cannot say it cleanly, you do not yet understand it |
| Examples | Abstract rules get nodded at; a before/after pair gets copied |

**"Simply stated" is the load-bearing one.** Brevity rules alone reward jargon,
because jargon is short. Pairing "be brief" with "be plain" is what stops a
reply becoming a dense paragraph of shorthand.

## How to apply it

| Where | How |
|---|---|
| Claude Code | Paste into `~/.claude/CLAUDE.md`, or inject it every turn from a `UserPromptSubmit` hook |
| Claude Projects / ChatGPT | Paste into custom instructions |
| An API app | Append to your system prompt |

**Injecting it every turn beats stating it once.** A rule stated at the start of
a long session falls out of attention as context fills; re-stating it each turn
costs a few hundred tokens and holds.

## What did NOT work

Two attempts failed before this one, both worth knowing about:

- **A pattern-matching filter** that blocked known-bad phrasings. It only ever
  caught the wordings someone had already thought of, and missed every new one.
- **A second model rewriting the reply afterwards.** It shortened correctly —
  and the reader still saw the long version first, because nothing can unsay
  text already on screen. It also cost a whole extra round trip.

Both were replaced by this: get it right before the words are written.
