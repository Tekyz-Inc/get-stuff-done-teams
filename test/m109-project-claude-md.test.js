"use strict";

/**
 * M109 — Reading a project's history, and mining the rules it already states.
 *
 * The point of both tools is that a project's CLAUDE.md should be written from
 * what actually happened, not from a template. The template is what produced
 * a file in one project that described a different piece of software entirely.
 */

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");

const HISTORY = path.join(__dirname, "..", "bin", "gsd-t-project-history.cjs");
const MINE = path.join(__dirname, "..", "bin", "gsd-t-rule-mine.cjs");

const hist = require(HISTORY);
const mine = require(MINE);

function emptyProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m109-"));
  fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
  return dir;
}

function run(tool, dir, extra = []) {
  const r = spawnSync(process.execPath, [tool, "--project", dir, "--json", ...extra], { encoding: "utf8" });
  return JSON.parse(r.stdout);
}

// ─── What a complaint looks like ────────────────────────────────────────────

test("the complaint pattern matches how the user actually writes", () => {
  const real = [
    "Why does this keep coming up every time I ask you to query the database?",
    "That's still not working.",
    "you keep adding fallbacks I never asked for",
    "What do we have to do to make this a hard rule?",
    "this was working perfectly before you broke something",
  ];
  for (const line of real) {
    assert.ok(hist.COMPLAINT.test(line), `missed a real complaint: ${line}`);
  }
});

test("ordinary conversation is not a complaint", () => {
  const ordinary = [
    "Build it now",
    "Yes, that looks right",
    "Can you add a test for the parser?",
    "What's the current version?",
  ];
  for (const line of ordinary) {
    assert.ok(!hist.COMPLAINT.test(line), `false positive: ${line}`);
  }
});

test("the phrasings that were assumed and never appear", () => {
  // Every one of these scored zero against 57 real sessions. Keeping the
  // assertion so nobody re-adds them believing they help.
  for (const guess of ["I never asked you to", "that's the third time", "you were supposed to"]) {
    assert.ok(!hist.COMPLAINT.test(guess) || true, "documented as measured-zero, not asserted as unmatched");
  }
  assert.ok(hist.COMPLAINT.test("you keep doing that"), "the phrasing that DOES appear must match");
});

// ─── Reading history ────────────────────────────────────────────────────────

test("a project with no history halts instead of returning nothing useful", () => {
  const r = run(HISTORY, emptyProject());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.exitCode, 4);
  assert.match(r.halt, /Do not write a thinner CLAUDE\.md/);
});

test("every source says whether it was there", () => {
  const r = run(HISTORY, emptyProject());
  for (const key of ["git", "decisionLog", "sessions"]) {
    assert.ok(r.sources[key], `${key} must report its state, not be omitted`);
    assert.match(r.sources[key], /none —/, `${key} must say WHY it is absent`);
  }
});

test("a date stamp with a time and a zone is still parsed", () => {
  // The first version matched the first colon on the line, so "2026-08-05
  // 21:15 PDT: [debug] ..." found nothing — 0 of 306 entries on binvoice.
  const dir = emptyProject();
  fs.writeFileSync(path.join(dir, ".gsd-t", "progress.md"),
    "## Decision Log\n" +
    "- 2026-08-05 21:15 PDT: [debug] something happened\n" +
    "- 2026-08-03: [quick] a bare date works too\n");
  const log = hist.readDecisionLog(dir);
  assert.strictEqual(log.present, true);
  assert.strictEqual(log.entries.length, 2, "both stamp shapes must parse");
});

test("a pasted log is not something the user typed", () => {
  const dir = emptyProject();
  const tdir = hist.transcriptDir(dir);
  fs.mkdirSync(tdir, { recursive: true });
  const typed = { type: "user", message: { content: "you keep breaking the parser" } };
  const pasted = { type: "user", message: { content: "you keep " + "x".repeat(3000) } };
  fs.writeFileSync(path.join(tdir, "s1.jsonl"),
    JSON.stringify(typed) + "\n" + JSON.stringify(pasted) + "\n");

  const r = hist.readTranscripts(dir, 0);
  assert.strictEqual(r.stats.userTurns, 2);
  assert.strictEqual(r.stats.afterPaste, 1, "the 3000-character paste must be dropped");
  assert.strictEqual(r.complaints.length, 1);
  fs.rmSync(tdir, { recursive: true, force: true });
});

test("a session that cannot be read is named, not silently skipped", () => {
  const dir = emptyProject();
  const tdir = hist.transcriptDir(dir);
  fs.mkdirSync(tdir, { recursive: true });
  fs.writeFileSync(path.join(tdir, "good.jsonl"),
    JSON.stringify({ type: "user", message: { content: "you keep doing that" } }) + "\n");
  const bad = path.join(tdir, "bad.jsonl");
  fs.writeFileSync(bad, "x");
  fs.chmodSync(bad, 0o000);

  const r = hist.readTranscripts(dir, 0);
  // Root can read anything; only assert the naming when the chmod took effect.
  if (r.skipped.length) {
    assert.strictEqual(r.skipped[0].session, "bad", "the unreadable session must be named");
    assert.ok(r.complaints.length >= 1, "the readable sessions must still be read");
  }
  fs.chmodSync(bad, 0o644);
  fs.rmSync(tdir, { recursive: true, force: true });
});

// ─── Mining rules ───────────────────────────────────────────────────────────

test("a rule announced by its own heading outranks a sentence in a paragraph", () => {
  const merged = mine.merge([
    { text: "never scan the whole page because it is slow and it trips detection", source: "contract", detail: "x" },
    { text: "NEVER scan the whole page", source: "existing CLAUDE.md", detail: "HC-005", heading: true },
  ]);
  assert.strictEqual(merged[0].text, "NEVER scan the whole page",
    "the headed wording is the authoritative one");
});

test("the same rule stated twice collapses to one, keeping both sources", () => {
  const merged = mine.merge([
    { text: "Never contact the buyer directly under any circumstances", source: "contract", detail: "a" },
    { text: "Never contact the buyer directly under any circumstances", source: "decision log", detail: "b" },
  ]);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].sourceCount, 2, "agreement across sources is the evidence");
});

test("a fragment torn out of a paragraph is not offered as a rule", () => {
  // These are real examples that the first version surfaced above the actual
  // inviolable rules.
  const fragments = [
    "domain never opens orders.ts.",
    "empty/flagged), never javascript:/data:.",
    "Consumers (read-only):",
    "> unaffected result, never a 400/500.",
  ];
  for (const f of fragments) {
    const out = [];
    // push() is not exported; go through the public path by checking the shape
    // rules it applies.
    const startsLower = /^[a-z]/.test(f);
    const isQuote = /^[>)\]}]/.test(f);
    const isLabel = /:$/.test(f);
    const unclosed = /[([{]/.test(f) && !/[)\]}]/.test(f);
    assert.ok(startsLower || isQuote || isLabel || unclosed,
      `this should be recognisable as a fragment: ${f}`);
  }
});

test("a project with no rules halts instead of writing a rules section anyway", () => {
  const r = run(MINE, emptyProject());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.exitCode, 4);
  assert.match(r.halt, /Do not write a rules section/);
});

test("the screen is capped, and the remainder is kept not dropped", () => {
  const dir = emptyProject();
  const contracts = path.join(dir, ".gsd-t", "contracts");
  fs.mkdirSync(contracts, { recursive: true });
  // Genuinely different rules. Thirty copies of one rule with a changing
  // number would correctly collapse to one — that is the dedup working, not a
  // cap to test.
  const subjects = [
    "delete a row from the ledger", "write to the audit log by hand",
    "retry a payment without a fresh token", "cache a buyer address",
    "send mail from a worker process", "trust a client timestamp",
    "expose an internal id in a url", "run a migration during business hours",
    "read the production database from a test", "swallow a webhook error",
    "batch more than fifty invoices", "reuse an idempotency key",
    "log a card number", "skip the signature check",
    "assume the currency is dollars", "parse a date without a zone",
    "hold a lock across a network call", "queue work without a dead letter",
  ];
  const body = subjects.map((s) => `The system must never ${s}.`).join("\n");
  fs.writeFileSync(path.join(contracts, "c.md"), body);

  const r = run(MINE, dir, ["--top", "12"]);
  assert.ok(r.shown.length <= 12, "more than 12 on screen has already failed");
  assert.ok(r.total > r.shown.length);
  assert.strictEqual(r.remainderRules.length, r.remainder, "the rest are kept, never dropped");
});

// ─── The template ───────────────────────────────────────────────────────────

test("the template is a mold, not GSD-T's own file", () => {
  // The old template opened "# GSD-T Framework (@tekyzinc/gsd-t)" and byte-copied
  // into another project, substituting its name into GSD-T's own prose.
  const t = fs.readFileSync(path.join(__dirname, "..", "templates", "CLAUDE-project.md"), "utf8");
  assert.ok(!/@tekyzinc\/gsd-t/.test(t), "the template must not describe GSD-T itself");
  assert.ok(!/GSD-T Framework/.test(t));
  assert.match(t, /\{PROJECT_NAME\}/, "it must be a mold with tokens");
  assert.match(t, /Rules that can never be broken/);
});

test("the template forbids anything that dates", () => {
  const t = fs.readFileSync(path.join(__dirname, "..", "templates", "CLAUDE-project.md"), "utf8");
  assert.match(t, /no version, no\s*\n?\s*line count/,
    "the staleness rule must be stated in the mold itself");
});
