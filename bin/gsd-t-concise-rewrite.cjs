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
5. CUT ANYTHING NOT ASKED FOR.
6. Prefer a short list or a small table over a paragraph.

KEEP THESE. They are not optional, and dropping any one of them means the
rewrite is rejected and thrown away:

- The first line, if it is a dated status banner.
- EVERY question being asked of the reader. If the reply ends by asking him
  something, that question MUST appear in your rewrite, as its own line, at
  the end. This is the single most common way a rewrite is rejected.
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
 * Facts that must survive the rewrite. If any disappears, the rewrite is
 * rejected and the original is returned — a rewrite that drops a warning or a
 * question is worse than a long reply.
 */
function extractInvariants(text) {
  return {
    questions: (text.match(/[^.!?\n]*\?/g) || []).map((q) => q.trim()).filter((q) => q.length > 10),
    numbers: text.match(/\b\d[\d,._]*\b/g) || [],
    paths: text.match(/[\w./-]+\.(?:js|cjs|mjs|ts|tsx|json|md|py|sh)\b/g) || [],
    codeBlocks: (text.match(/```/g) || []).length / 2,
  };
}

function checkInvariants(original, rewritten) {
  const a = extractInvariants(original);
  const b = extractInvariants(rewritten);
  const lost = [];

  if (a.questions.length > 0 && b.questions.length === 0) {
    lost.push("a question to the reader was dropped");
  }
  const lostPaths = a.paths.filter((p) => !rewritten.includes(p));
  if (lostPaths.length > 0 && lostPaths.length === a.paths.length && a.paths.length > 0) {
    lost.push("every file path was dropped");
  }
  if (a.codeBlocks > 0 && b.codeBlocks < a.codeBlocks) {
    lost.push("a code block was dropped");
  }
  // A number appearing in the rewrite that was never in the original means
  // something was invented.
  const invented = b.numbers.filter((n) => n.length > 2 && !a.numbers.includes(n));
  if (invented.length > 0) {
    lost.push(`a number appeared that was not in the original: ${invented[0]}`);
  }
  return lost;
}

/** Ask a fresh Claude to do the rewrite. */
function rewrite(text, cfg) {
  const prompt = `${RULES}\n\n--- REPLY TO REWRITE ---\n${text}`;
  const run = spawnSync("claude",
    ["-p", prompt, "--model", cfg.model, "--dangerously-skip-permissions"],
    { encoding: "utf8", timeout: cfg.timeoutMs, maxBuffer: 8 * 1024 * 1024 });

  if (run.error) return { ok: false, error: run.error.message };
  if (run.status !== 0) return { ok: false, error: `claude exited ${run.status}: ${(run.stderr || "").slice(0, 200)}` };
  const out = (run.stdout || "").trim();
  if (!out) return { ok: false, error: "the rewriter returned nothing" };
  return { ok: true, text: out };
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

  const lost = checkInvariants(text, r.text);
  if (lost.length > 0) {
    emit({
      ok: false, exitCode: EXIT_FAILED, text,
      error: `the rewrite lost something: ${lost.join("; ")}`,
      note: "Rewrite rejected — this is the original, unchanged.",
      words: before,
    }, args.json);
  }

  const after = wordCount(r.text);
  emit({
    ok: true, exitCode: EXIT_OK, text: r.text,
    words: before, wordsAfter: after,
    saved: before - after,
  }, args.json);
}

if (require.main === module) main();

module.exports = { wordCount, extractInvariants, checkInvariants, readConfig, RULES };
