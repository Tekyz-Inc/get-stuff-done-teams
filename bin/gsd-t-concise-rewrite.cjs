#!/usr/bin/env node
/**
 * gsd-t-concise-rewrite.cjs
 *
 * M107-D1 — Rewrites a reply into its shortest honest form.
 *
 * [RULE] concise-rewrite-never-changes-a-fact
 * [RULE] concise-rewrite-halts-never-silently-degrades
 * [RULE] concise-rewrite-preserves-questions-and-warnings
 *
 * A fresh Claude, given only the text and the rules, cuts what the writer is
 * attached to. It has no memory of the work, so it has nothing to defend.
 *
 * ─── Usage ──────────────────────────────────────────────────────────────────
 *   node gsd-t-concise-rewrite.cjs --text "<reply>" [--project <dir>] [--json]
 *   echo "<reply>" | node gsd-t-concise-rewrite.cjs --stdin
 *
 * ─── Exit codes ─────────────────────────────────────────────────────────────
 *   0  rewritten (or skipped because it was already short)
 *   4  the rewrite could not be done — the ORIGINAL is returned, marked
 *   64 bad input
 *
 * On failure it returns the ORIGINAL text and says so. It never returns
 * nothing, never truncates, never guesses. Showing a long reply is a poor
 * outcome; showing a silently mangled one is a wrong one.
 *
 * Zero dependencies beyond the `claude` CLI on PATH.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const EXIT_OK = 0;
const EXIT_FAILED = 4;
const EXIT_BAD_INPUT = 64;

const DEFAULTS = {
  enabled: true,
  skipUnder: 60,      // words — below this, rewriting buys nothing
  model: "sonnet",
  timeoutMs: 45000,
};

const RULES = `You rewrite a reply so it can be read in as little time as possible.

The reader is a slow reader. Every extra line costs him real time. Jargon costs
him more than length — he has to stop and translate it, and then ask for it
again in plain words.

Rewrite the reply below following these rules exactly:

1. ANSWER FIRST. The answer is the first thing. Nothing before it.
2. NO PREAMBLE. Cut any sentence that announces a point instead of making it.
3. NO BACKSTORY. Cut every explanation of why something failed before, what
   cannot work, how it works today, or what was rejected — unless the reply is
   answering a direct question about that. He asks when he wants it.
4. NO JARGON. Plain words. If a technical term is genuinely needed, put the
   plain meaning first and the term in brackets after it.
5. KEEP ONLY WHAT IS RELEVANT TO HIM. Ask of every sentence: does this change
   what he decides, what he does next, or what he now knows? If not, cut it.
   Work the writer did, steps taken, what was checked, what was ruled out — all
   of that is the writer's business, not his, unless he asked.
6. Prefer a short list or a small table over a paragraph.

KEEP THESE. They are not optional, and dropping any one of them means the
rewrite is rejected and thrown away:

- The first line, if it is a dated status banner.
- EVERY question being asked OF THE READER — one he is meant to answer. If the
  reply ends by asking him something, that question MUST appear in your rewrite,
  as its own line, at the end. This is the single most common way a rewrite is
  rejected.
  A question the writer asks HIMSELF is not one of these. "Is that the cause?",
  "Now the proof: does the hook fire?", "So what is slow here?" are thinking out
  loud — cut them like any other narration. The test is simple: would he type an
  answer to it? If not, it is not a question.
- Any warning, failure, or thing that went wrong.
- File paths and links, exactly as written.
- Code blocks, exactly as written.
- Specific numbers and names.

Never:
- change a fact or a number
- drop a warning, a failure, or a question
- add anything that was not in the original
- soften a bad outcome

Return ONLY the rewritten reply. No commentary about what you changed.`;

function readConfig(projectDir) {
  const p = path.join(projectDir, ".gsd-t", "concise.json");
  if (!fs.existsSync(p)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(p, "utf8")) };
  } catch (_) {
    // Unreadable config → defaults. Rewriting with defaults is the safe
    // direction; it cannot lose content, only shorten it.
    return { ...DEFAULTS };
  }
}

function wordCount(s) {
  return (String(s).trim().match(/\S+/g) || []).length;
}

/**
 * The second pass — the rewrite reviewed before it is delivered.
 *
 * A keyword check used to sit here: it counted question marks, file paths and
 * numbers, and threw the whole rewrite away if a count dropped. It discarded
 * 4 of every 6 rewrites, almost always because the writer had asked HIMSELF a
 * question ("Now the proof: does it fire?") which the rewrite correctly cut as
 * narration. Counting punctuation cannot tell an ask from thinking out loud.
 *
 * A reader can. So the same model that wrote the short version now reads it
 * back against one question — is this what David needs, and is it as short as
 * his rules demand — and fixes it. The reviewer returns text, never a verdict,
 * so there is no path on which the work is discarded.
 */
const REVIEW = `You are checking a shortened reply before it reaches David.

He is a slow reader. Every extra line costs him real time.

Two questions, both about the SHORT version:

1. Is this ONLY what he needs? Cut anything that does not change what he
   decides, what he does next, or what he now knows. The work someone did,
   steps taken, what was checked, what was ruled out — his business only if he
   asked.

2. Is it truly concise by his rules? Answer first, nothing before it. No
   preamble, no backstory, no jargon standing in for a plain word. Lists and
   small tables over paragraphs.

Then check nothing was lost that he needs:
- a question he is meant to ANSWER must still be there, as its own line at the
  end. A question the writer asked himself is narration — it should be gone.
- warnings, failures, and things that went wrong stay.
- file paths, links, code blocks and specific numbers stay exactly as written.
- no fact, number or name may change, and nothing may be added.

Return the final reply and nothing else. If it is already right, return it
unchanged. Never return commentary, never return an empty response.`;

/** One call to a fresh Claude. Used by both passes. */
function askClaude(prompt, cfg) {
  // `--setting-sources project` is what stops the shortener shortening itself.
  //
  // A child started with the personal settings inherits the very Stop hook that
  // spawned it: it answers in about 4 seconds, its own hook then sees an answer
  // over the 60-word threshold and spawns a THIRD Claude, and the outer call
  // waits ~46s for work it caused — past the 45s limit, so it was killed and
  // returned nothing, every turn since it shipped. Measured: 54.2s/54.5s with
  // the personal settings, 7.9s/6.2s with only the project's.
  //
  // The trigger was always the CHILD'S OWN REPLY crossing 60 words, never the
  // input: a 63-character prompt that produces a long answer is just as slow
  // (57.2s on, 11.7s off).
  //
  // Not `--bare`, the documented skip-hooks flag: it also skips the keychain, so
  // the child returns "Not logged in" in 0.7s. Not `--settings '{}'` either —
  // settings layers merge, so a lower layer cannot remove a higher layer's hook
  // (54.5s/56.1s, unchanged).
  const run = spawnSync("claude",
    ["-p", prompt, "--model", cfg.model, "--dangerously-skip-permissions",
     "--setting-sources", "project"],
    { encoding: "utf8", timeout: cfg.timeoutMs, maxBuffer: 8 * 1024 * 1024 });

  if (run.error) {
    // A timeout is the failure that hid for two days: every turn paid the full
    // wait, produced nothing, and said nothing. Write it to stderr so the cost
    // is visible even though the reply still goes through untouched.
    const timedOut = run.error.code === "ETIMEDOUT";
    if (timedOut) {
      process.stderr.write(
        `[gsd-t] the concise rewriter timed out after ${Math.round(cfg.timeoutMs / 1000)}s ` +
        `and produced nothing — every turn is paying that wait. Switch it off with ` +
        `.gsd-t/concise.json {"enabled": false} until it is fixed.\n`
      );
    }
    return { ok: false, error: run.error.message, timedOut };
  }
  if (run.status !== 0) return { ok: false, error: `claude exited ${run.status}: ${(run.stderr || "").slice(0, 200)}` };
  const out = (run.stdout || "").trim();
  if (!out) return { ok: false, error: "the rewriter returned nothing" };
  return { ok: true, text: out };
}

/** Pass 1 — shorten it. */
function rewrite(text, cfg) {
  return askClaude(`${RULES}\n\n--- REPLY TO REWRITE ---\n${text}`, cfg);
}

/**
 * Pass 2 — read the short version back and fix what pass 1 got wrong.
 *
 * Returns text, never a verdict, so the work is never discarded. If the review
 * itself fails, pass 1's rewrite stands: it was already an improvement, and
 * losing it because a second opinion did not arrive would be the old bug in a
 * new place.
 */
function review(original, shortened, cfg) {
  const prompt = `${REVIEW}\n\n--- WHAT HE ORIGINALLY WROTE (for reference only) ---\n${original}\n\n--- THE SHORT VERSION TO CHECK AND RETURN ---\n${shortened}`;
  const r = askClaude(prompt, cfg);
  return r.ok ? r.text : shortened;
}

function parseArgs(argv) {
  const args = { project: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--stdin") args.stdin = true;
    else if (a === "--text") args.text = argv[++i];
    else if (a === "--project") args.project = argv[++i];
  }
  return args;
}

function emit(result, asJson) {
  if (asJson) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else process.stdout.write(result.text + "\n");
  process.exit(result.exitCode);
}

function main() {
  const args = parseArgs(process.argv);
  const projectDir = path.resolve(args.project);
  const cfg = readConfig(projectDir);

  let text = args.text;
  if (args.stdin) {
    try { text = fs.readFileSync(0, "utf8"); } catch (_) { text = ""; }
  }
  if (typeof text !== "string" || !text.trim()) {
    emit({ ok: false, exitCode: EXIT_BAD_INPUT, text: "", error: "no text given" }, true);
  }

  const before = wordCount(text);

  if (!cfg.enabled) {
    emit({ ok: true, exitCode: EXIT_OK, text, skipped: "switched off", words: before }, args.json);
  }
  if (before < cfg.skipUnder) {
    emit({ ok: true, exitCode: EXIT_OK, text, skipped: "already short", words: before }, args.json);
  }

  const r = rewrite(text, cfg);
  if (!r.ok) {
    emit({
      ok: false, exitCode: EXIT_FAILED, text,
      error: r.error,
      note: "Rewrite failed — this is the original, unchanged.",
      words: before,
    }, args.json);
  }

  // Second pass: the same model reads its own short version back, against the
  // only two questions that matter — is this what David needs, and is it as
  // short as his rules demand. It returns text, so nothing is ever discarded.
  const finalText = review(text, r.text, cfg);

  const after = wordCount(finalText);
  emit({
    ok: true, exitCode: EXIT_OK, text: finalText,
    words: before, wordsAfter: after,
    saved: before - after,
  }, args.json);
}

if (require.main === module) main();

module.exports = { wordCount, readConfig, rewrite, review, askClaude, RULES, REVIEW };
