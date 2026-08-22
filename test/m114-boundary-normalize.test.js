"use strict";

/**
 * M114 — a value entering the program must be cleaned where it enters.
 *
 * The check earns its place only if it fails on real defects and stays quiet on
 * correct code. A check that never fires is indistinguishable from no check, so
 * the negative cases here are as load-bearing as the positive ones.
 *
 * The design decision under test: the entry point is inspected, NOT the
 * comparison. Measured on a live project, a comparison-based check produced ~190
 * false alarms; this one produced 9, all genuine. The tests below pin both
 * halves of that — it must catch the real shapes, and must stay silent on the
 * legitimate ones that made the other approach unusable.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const CHECK = path.join(__dirname, "..", "bin", "gsd-t-boundary-normalize-check.cjs");
const { check, CannotCheck } = require(CHECK);

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m114-"));
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return dir;
}

const cleanup = (d) => fs.rmSync(d, { recursive: true, force: true });

function full(dir) {
  return check(dir, { mode: "full" });
}

// ─── It catches the real defects ─────────────────────────────────────────────

test("M114: an untrimmed request-body value is caught", (t) => {
  const dir = project({ "src/a.ts": "const slug = req.body.slug;\n" });
  t.after(() => cleanup(dir));
  const r = full(dir);
  assert.strictEqual(r.failures.length, 1);
  assert.match(r.failures[0], /trimming|case-normalis/);
});

// The live defect this was built from: someone remembered trim() and forgot
// casing, so two spellings of one email become two accounts.
test("M114: a trimmed-but-not-lowercased email is caught", (t) => {
  const dir = project({ "src/signup.ts": "const email = req.body.email?.trim();\n" });
  t.after(() => cleanup(dir));
  const r = full(dir);
  assert.strictEqual(r.failures.length, 1);
  assert.match(r.failures[0], /case-normalis/);
  assert.doesNotMatch(r.failures[0], /trimming/, "it IS trimmed — only the casing is missing");
});

test("M114: a URL query value read raw is caught", (t) => {
  const dir = project({ "src/r.ts": "const token = req.query.token;\n" });
  t.after(() => cleanup(dir));
  assert.strictEqual(full(dir).failures.length, 1);
});

// ─── It stays quiet on correct code ──────────────────────────────────────────

test("M114: cleaning on the same expression passes", (t) => {
  const dir = project({
    "src/ok.ts": "const email = (req.body.email ?? '').trim().toLowerCase();\n",
  });
  t.after(() => cleanup(dir));
  assert.deepStrictEqual(full(dir).failures, []);
});

test("M114: cleaning on the next line passes", (t) => {
  const dir = project({
    "src/ok2.ts": "const raw = req.body.status;\nconst status = raw.trim().toLowerCase();\n",
  });
  t.after(() => cleanup(dir));
  assert.deepStrictEqual(full(dir).failures, []);
});

// Case-sensitivity is not a blanket rule. Lowercasing a secret shrinks the
// space it lives in — a security defect, so the check must never ask for it.
// Trimming it, however, IS required: a space on the end of a password is a
// stray keystroke, and storing it untrimmed locks the person out when they
// later type the password normally.
test("M114: a password must be trimmed, and must NEVER be lowercased", (t) => {
  const dir = project({ "src/auth.ts": "const password = req.body.password.trim();\n" });
  t.after(() => cleanup(dir));
  assert.deepStrictEqual(full(dir).failures, [],
    "trimmed and not lowercased is exactly right for a secret");
});

test("M114: an UNTRIMMED password is caught", (t) => {
  const dir = project({ "src/auth2.ts": "const password = req.body.password;\n" });
  t.after(() => cleanup(dir));
  const r = full(dir);
  assert.strictEqual(r.failures.length, 1, "a space on a stored password locks the person out");
  assert.match(r.failures[0], /trimming/);
  assert.doesNotMatch(r.failures[0], /case-normalis/, "lowercasing a secret would weaken it");
});

test("M114: a token, hash, path and URL are never asked to be lowercased", (t) => {
  const dir = project({
    "src/s.ts":
      "const token = req.body.token.trim();\n" +
      "const filepath = req.body.filepath.trim();\n" +
      "const href = req.query.href.trim();\n" +
      "const signature = req.body.signature.trim();\n",
  });
  t.after(() => cleanup(dir));
  assert.deepStrictEqual(full(dir).failures, []);
});

// Generated output is not authored code; flagging it reports work nobody can
// act on. This fired on a real project (dist-local, dist-test) before the fix.
test("M114: build output is not inspected, including suffixed dist dirs", (t) => {
  const dir = project({
    "dist/x.js": "const a = req.body.slug;\n",
    "dist-local/y.js": "const b = req.body.slug;\n",
    "dist-test/z.js": "const c = req.body.slug;\n",
    "node_modules/p/i.js": "const d = req.body.slug;\n",
  });
  t.after(() => cleanup(dir));
  const r = full(dir);
  assert.deepStrictEqual(r.failures, []);
  assert.strictEqual(r.filesInspected, 0);
});

test("M114: an exemption written at the entry point is honoured", (t) => {
  const dir = project({
    "src/e.ts": "// gsd-t-allow-raw: the signature must keep its exact bytes\nconst sig = req.body.rawSignature;\n",
  });
  t.after(() => cleanup(dir));
  assert.deepStrictEqual(full(dir).failures, []);
});

// ─── The two modes behave differently, on purpose ────────────────────────────

test("M114: full mode reports without blocking", (t) => {
  const dir = project({ "src/a.ts": "const slug = req.body.slug;\n" });
  t.after(() => cleanup(dir));
  const r = full(dir);
  assert.strictEqual(r.ok, true, "the one-time inventory must not block adoption");
  assert.strictEqual(r.reportOnly, true);
  assert.strictEqual(r.failures.length, 1, "and it still reports the finding");
});

test("M114: changed mode BLOCKS on a touched file — the check can actually fail", (t) => {
  const dir = project({ "src/a.ts": "const slug = req.body.slug;\n" });
  t.after(() => cleanup(dir));
  const git = (...a) => spawnSync("git", a, { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");

  const r = check(dir, { mode: "changed" });
  assert.strictEqual(r.ok, false, "an untouched-by-cleaning entry point must fail the gate");
  assert.strictEqual(r.reportOnly, false);
});

test("M114: changed mode ignores a file this run did not touch", (t) => {
  const dir = project({ "src/a.ts": "const slug = req.body.slug;\n" });
  t.after(() => cleanup(dir));
  const git = (...a) => spawnSync("git", a, { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  git("add", "-A");
  git("commit", "-qm", "existing debt, committed");

  const r = check(dir, { mode: "changed" });
  assert.strictEqual(r.ok, true, "legacy code must not block a project adopting the rule");
});

// ─── It halts rather than passing a question it could not answer ─────────────

test("M114: git unable to answer is a HALT, never a quiet pass", (t) => {
  const dir = project({ "src/a.ts": "const slug = req.body.slug;\n" }); // no git init
  t.after(() => cleanup(dir));
  assert.throws(() => check(dir, { mode: "changed" }), CannotCheck,
    "reporting 'no changed files' here would vouch for code nobody examined");
});

test("M114: the CLI exits 1 on a blocking failure", (t) => {
  const dir = project({ "src/a.ts": "const slug = req.body.slug;\n" });
  t.after(() => cleanup(dir));
  const git = (...a) => spawnSync("git", a, { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");

  const r = spawnSync(process.execPath, [CHECK, "--project", dir], { encoding: "utf8" });
  assert.strictEqual(r.status, 1);
  assert.strictEqual(JSON.parse(r.stdout).ok, false);
});

test("M114: the CLI exits 64 when it cannot check at all", (t) => {
  const dir = project({ "src/a.ts": "const slug = req.body.slug;\n" });
  t.after(() => cleanup(dir));
  const r = spawnSync(process.execPath, [CHECK, "--project", dir], { encoding: "utf8" });
  assert.strictEqual(r.status, 64, "no git repo: cannot tell what changed");
  assert.match(r.stderr, /CANNOT CHECK/);
});

// ─── It is wired where it can actually run ───────────────────────────────────

test("M114: the verify gate runs it, and projects receive it", () => {
  const gate = fs.readFileSync(
    path.join(__dirname, "..", "bin", "gsd-t-verify-gate.cjs"), "utf8");
  assert.match(gate, /boundary-normalize/,
    "a check the gate never runs enforces nothing");

  const cli = fs.readFileSync(path.join(__dirname, "..", "bin", "gsd-t.js"), "utf8");
  const copies = (cli.match(/gsd-t-boundary-normalize-check\.cjs/g) || []).length;
  assert.ok(copies >= 2,
    "must be in BOTH propagation lists, or it is dead in every project it never reaches");
});

test("M114: the rule is written down where authors read it", () => {
  const doc = fs.readFileSync(
    path.join(__dirname, "..", "templates", "stacks", "_comparison.md"), "utf8");
  assert.match(doc, /Clean The Value Where It Enters/);
  assert.match(doc, /gsd-t-allow-raw/, "the exemption form must be documented");
});
