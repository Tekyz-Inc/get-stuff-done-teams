"use strict";

/**
 * M107 — Concise Rewrite tests.
 *
 * The rewriter shortens a reply. The one thing it must never do is lose
 * something: a question, a warning, a number, a path, a code block. A long
 * reply is a poor outcome; a silently mangled one is a wrong outcome.
 *
 * The safety checks are tested without calling the model, so these run fast
 * and offline. The live end-to-end path is exercised by GSDT_SLOW_TESTS=1.
 */

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");

const REWRITE = path.join(__dirname, "..", "bin", "gsd-t-concise-rewrite.cjs");
const HOOK = path.join(__dirname, "..", "scripts", "gsd-t-concise-hook.js");

const lib = require(REWRITE);
const hooklib = require(HOOK);

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "m107-")); }

// ── The second pass replaced the keyword check (M112) ───────────────────────
//
// A keyword check used to count question marks, paths and numbers and throw the
// whole rewrite away if a count dropped. It discarded 4 of every 6 rewrites,
// almost always because the writer had asked HIMSELF a question ("Now the
// proof: does it fire?") which the rewrite correctly cut as narration. Counting
// punctuation cannot tell an ask from thinking out loud; a reader can. The same
// model now reads its short version back and FIXES it, returning text rather
// than a verdict — so there is no path on which the work is discarded.

test("M112: the discarding check is gone", () => {
  assert.strictEqual(lib.checkInvariants, undefined, "the keyword check must not come back");
  assert.strictEqual(lib.extractInvariants, undefined, "nor its punctuation counter");
});

test("M112: a second pass exists and reviews the short version", () => {
  assert.strictEqual(typeof lib.review, "function", "the review pass is what replaced the check");
  assert.match(lib.REVIEW, /only what he needs/i, "it asks whether this is what he needs");
  assert.match(lib.REVIEW, /concise/i, "and whether it is as short as his rules demand");
});

test("M112: the review protects a real ask but not thinking out loud", () => {
  assert.match(lib.REVIEW, /question he is meant to ANSWER/i, "a real ask must survive");
  assert.match(lib.REVIEW, /asked himself is narration/i, "a rhetorical one must not be protected");
});

test("M112: the review returns text, never a verdict", () => {
  // A reviewer that could say "rejected" would reintroduce the discard.
  assert.match(lib.REVIEW, /Return the final reply and nothing else/i);
  assert.match(lib.REVIEW, /Never return commentary, never return an empty response/i);
});

test("M112: a failed review keeps pass 1's rewrite rather than losing it", () => {
  const src = fs.readFileSync(REWRITE, "utf8");
  const fn = src.slice(src.indexOf("function review("), src.indexOf("function parseArgs("));
  assert.match(fn, /r\.ok \? r\.text : shortened/,
    "if the second opinion never arrives, the first improvement still stands");
});

test("M112: the rewrite rules carry the relevance instruction", () => {
  assert.match(lib.RULES, /ONLY WHAT IS RELEVANT TO HIM/i);
  // The phrase wraps across lines in the prompt, so match it whitespace-loosely.
  assert.match(lib.RULES.replace(/\s+/g, " "), /would he type an answer to it/i,
    "the test that separates a real question from narration");
});

test("a short reply is left alone", () => {
  const dir = tmpDir();
  const r = spawnSync(process.execPath,
    [REWRITE, "--text", "Yes. It is in memory.", "--project", dir, "--json"],
    { encoding: "utf8" });
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.skipped, "already short");
});

test("a switched-off project is left alone", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".gsd-t", "concise.json"), JSON.stringify({ enabled: false }));
  const long = "word ".repeat(200);
  const r = spawnSync(process.execPath, [REWRITE, "--text", long, "--project", dir, "--json"], { encoding: "utf8" });
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.skipped, "switched off");
});

test("empty input is a bad-input halt, not a silent pass", () => {
  const dir = tmpDir();
  const r = spawnSync(process.execPath, [REWRITE, "--text", "  ", "--project", dir, "--json"], { encoding: "utf8" });
  assert.strictEqual(JSON.parse(r.stdout).exitCode, 64);
});

test("HOOK: a re-entry never loops", () => {
  const r = spawnSync(process.execPath, [HOOK], {
    encoding: "utf8",
    input: JSON.stringify({ stop_hook_active: true, transcript_path: "/x", cwd: process.cwd() }),
  });
  assert.strictEqual(r.stdout.trim(), "", "a second block on the same turn would loop forever");
});

test("HOOK: a transcript outside the projects directory is refused", () => {
  assert.strictEqual(hooklib.safeTranscriptPath("/etc/passwd"), null);
  assert.strictEqual(hooklib.safeTranscriptPath("relative/path.jsonl"), null);
});

test("HOOK: an unreadable payload allows the reply through", () => {
  const r = spawnSync(process.execPath, [HOOK], { encoding: "utf8", input: "not json" });
  assert.strictEqual(r.stdout.trim(), "", "readability is not truth — never gag a correct answer");
});

test("word counting matches what a reader sees", () => {
  assert.strictEqual(lib.wordCount("one two three"), 3);
  assert.strictEqual(lib.wordCount("  spaced   out  "), 2);
  assert.strictEqual(lib.wordCount(""), 0);
});

test("the rules tell the rewriter to keep questions", () => {
  assert.match(lib.RULES, /EVERY question/,
    "dropping the closing question was the first real failure — the rule must be explicit");
});

// Live end-to-end. Calls the model, so it is slow and opt-in.
test("live: a long reply gets shorter and keeps its question", { skip: !process.env.GSDT_SLOW_TESTS }, () => {
  const dir = tmpDir();
  const long = [
    "The scan found three problems in the code.",
    "The first was in the parser, which failed on empty input.",
    "The second was in the writer, which did not close its file handle.",
    "The third was in the reader, which assumed the file existed.",
    "All three are now fixed and the tests pass.",
    "",
    "Want me to commit this?",
  ].join("\n");
  const r = spawnSync(process.execPath, [REWRITE, "--text", long, "--project", dir, "--json"],
    { encoding: "utf8", timeout: 90000 });
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.ok, true, out.error || "");
  assert.ok(out.text.includes("?"), "the question must survive");
});

// ── The trigger (M112) ───────────────────────────────────────────────────────
//
// The rewriter worked from the day it shipped and never ran once, because the
// hook that feeds it looked only at the LAST record of a turn. A turn almost
// always ends with a tool call, so it saw no prose and gave up every time.
// Nothing tested the trigger, so a hook that never fired looked like a hook
// that had nothing to do.

function writeTranscript(records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m112-tx-"));
  const file = path.join(dir, "transcript.jsonl");
  fs.writeFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return { dir, file };
}
const userSays = (t) => ({ type: "user", message: { role: "user", content: [{ type: "text", text: t }] } });
const assistantSays = (t) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: t }] } });
const assistantRuns = () => ({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }] } });
const toolReturns = () => ({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } });

test("M112: a turn ending in a tool call still yields its prose", () => {
  const { dir, file } = writeTranscript([
    userSays("do the thing"),
    assistantSays("Here is what I found, at some length."),
    assistantRuns(),
    toolReturns(),
    assistantRuns(),
    toolReturns(),
  ]);
  try {
    const got = hooklib.lastAssistantText(file);
    assert.ok(got, "must find the turn");
    assert.strictEqual(got.toolOnly, false, "a turn with prose is not tool-only");
    assert.match(got.text, /Here is what I found/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("M112: prose written in pieces around tool calls is joined", () => {
  const { dir, file } = writeTranscript([
    userSays("go"),
    assistantSays("First part."),
    assistantRuns(),
    toolReturns(),
    assistantSays("Second part."),
    assistantRuns(),
    toolReturns(),
  ]);
  try {
    const got = hooklib.lastAssistantText(file);
    assert.match(got.text, /First part/);
    assert.match(got.text, /Second part/, "every text block in the turn counts");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("M112: the walk stops at the user, never reaching the previous turn", () => {
  // Rewriting a reply the user already read would replace the wrong thing.
  const { dir, file } = writeTranscript([
    userSays("first question"),
    assistantSays("ANSWER-TO-FIRST-QUESTION"),
    userSays("second question"),
    assistantSays("answer to second."),
    assistantRuns(),
    toolReturns(),
  ]);
  try {
    const got = hooklib.lastAssistantText(file);
    assert.match(got.text, /answer to second/);
    assert.ok(!/ANSWER-TO-FIRST-QUESTION/.test(got.text), "the previous turn must not leak in");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("M112: a tool result is not mistaken for the user speaking", () => {
  // A tool result carries role "user". Treating it as the turn boundary stops
  // the walk at the first tool call and finds nothing at all.
  const { dir, file } = writeTranscript([
    userSays("go"),
    assistantSays("the prose that must be found"),
    assistantRuns(),
    toolReturns(),
  ]);
  try {
    const got = hooklib.lastAssistantText(file);
    assert.match(got.text, /the prose that must be found/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("M112: a turn that really is only tool calls reports tool-only", () => {
  const { dir, file } = writeTranscript([
    userSays("go"),
    assistantRuns(),
    toolReturns(),
  ]);
  try {
    const got = hooklib.lastAssistantText(file);
    assert.strictEqual(got.toolOnly, true, "no prose means nothing to shorten");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── The recursion (M112) ─────────────────────────────────────────────────────
//
// The shortener shortened itself. A child started with the personal settings
// inherits the very Stop hook that spawned it: it answers in ~4s, its own hook
// then sees an answer over the 60-word threshold and spawns a THIRD Claude, and
// the outer call waits ~46s for work it caused — past its own 45s limit, so it
// was killed and returned nothing, every turn since it shipped.

test("M112: the child is started without the personal settings", () => {
  const src = fs.readFileSync(REWRITE, "utf8");
  assert.match(
    src,
    /--setting-sources["\s,]+.*project/,
    "the child must not inherit the personal settings — that is where its own Stop hook lives"
  );
});

test("M112: not --bare, and not an empty settings object", () => {
  const src = fs.readFileSync(REWRITE, "utf8");
  const spawnCall = src.slice(src.indexOf('spawnSync("claude"'), src.indexOf('spawnSync("claude"') + 400);
  // --bare skips the keychain too: the child answers "Not logged in" in 0.7s.
  assert.ok(!/["']--bare["']/.test(spawnCall), "--bare also skips login");
  // Settings layers merge, so a lower layer cannot remove a higher layer's hook.
  assert.ok(!/--settings["\s,]+["']\{\}["']/.test(spawnCall), "an empty settings object does not remove an inherited hook");
});

test("M112: the hook lets the rewriter's warnings reach the screen", () => {
  // Captured into a pipe and never read, a warning reaches nobody — which is
  // why the timeouts stayed invisible even after a loud message was added.
  const src = fs.readFileSync(HOOK, "utf8");
  assert.match(src, /stdio:\s*\[[^\]]*"inherit"/, "the child's stderr must be inherited, not piped into a void");
});
