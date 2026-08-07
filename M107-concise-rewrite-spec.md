# M107 — Concise Rewrite

**Status:** spec · **Date:** 2026-08-06

---

A second Claude rewrites every reply before David sees it.

## The flow

```
Claude finishes a reply
  Is the reply short already:
    Yes: Show it unchanged
    No:  Send it to a fresh Claude with David's rules
      Did the rewrite come back clean:
        Yes: Show the short version
        No:  Show the original, say the rewrite failed
```

## The rules the rewriter applies

- Answer first
- No preambles
- No history, no causes, no "why it didn't work"
- No jargon — plain words only
- Cut anything not asked for
- Keep: the banner, verdicts, warnings, file links, code

## What it must never do

- Change a fact
- Drop a warning or a failure
- Drop a question David was asked
- Invent anything

## Where it runs

A Stop hook — after Claude writes, before David reads.

## Settings

`.gsd-t/concise.json`

| Setting | Default |
|---|---|
| `enabled` | true |
| `skipUnder` | 60 words |
| `model` | sonnet |

## Cost

One extra call per reply over 60 words. A few seconds.

## When the rewriter fails

Show the original and say so. Never show nothing, never guess.

## Proving it works

| Measure | Now | Target |
|---|---|---|
| Words per reading turn | 429 | 200 |
| Worst 10% of turns | 1,167 | 400 |
| Times David asks for re-explanation | 7.7% of turns | under 3% |
| Replies with undecoded terms | 42% | under 10% |

Re-measure after two weeks.

## Build order

1. The rewriter — takes text, returns text
2. The hook — wires it to replies
3. Settings + measurement

Two domains. One wave.
