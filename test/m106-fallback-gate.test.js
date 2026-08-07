"use strict";

/**
 * M106 — Fallback Gate tests.
 *
 * The two acceptance cases come from real damage:
 *   - Marla:  an author lookup failed, so the code substituted the last known
 *             seller. Posts were recorded as written by someone who never
 *             wrote them.
 *   - PayPal: one of five line items failed, so the code traced it and created
 *             the invoice with four. A real invoice, wrong amount, sent out.
 *
 * If either escapes detection, the gate is worthless.
 */

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");

const DETECT = path.join(__dirname, "..", "bin", "gsd-t-fallback-detect.cjs");
const GUARD = path.join(__dirname, "..", "scripts", "gsd-t-fallback-guard.js");

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m106-"));
  return dir;
}

function detect(source, file, projectDir) {
  const r = spawnSync(process.execPath,
    [DETECT, "--text", source, "--file", file, "--project", projectDir, "--json"],
    { encoding: "utf8" });
  return JSON.parse(r.stdout);
}

function guard(payload) {
  const r = spawnSync(process.execPath, [GUARD],
    { encoding: "utf8", input: JSON.stringify(payload) });
  if (!r.stdout.trim()) return { decision: "allow" };
  const o = JSON.parse(r.stdout);
  return { decision: o.hookSpecificOutput.permissionDecision, reason: o.hookSpecificOutput.permissionDecisionReason };
}

test("ACCEPTANCE: the Marla substitution is caught", () => {
  const dir = tmpProject();
  const src = `function resolveAuthor(post) {
  const author = findAuthorInHeader(post);
  if (!author) {
    return lastKnownSeller;
  }
  return author;
}`;
  const r = detect(src, path.join(dir, "author.js"), dir);
  assert.strictEqual(r.ok, false, "a substituted author must be caught");
  assert.strictEqual(r.unapproved, 1);
  assert.strictEqual(r.findings[0].rule, "substituted-value");
});

test("ACCEPTANCE: the PayPal partial invoice is caught", () => {
  const dir = tmpProject();
  const src = `async function createInvoice(items) {
  const created = [];
  for (const item of items) {
    try {
      created.push(await api.addLineItem(item));
    } catch (e) {
      trace.warn('line item failed', item.id);
    }
  }
  return api.finalize(created);
}`;
  const r = detect(src, path.join(dir, "invoice.js"), dir);
  assert.strictEqual(r.ok, false, "tracing a failure then continuing must be caught");
  assert.ok(r.findings.some((f) => f.rule === "trace-then-continue"));
});

test("a halt is not a fallback", () => {
  const dir = tmpProject();
  const src = `function resolveAuthor(post) {
  const author = findAuthorInHeader(post);
  if (!author) {
    throw new Error('author not found');
  }
  return author;
}`;
  assert.strictEqual(detect(src, path.join(dir, "a.js"), dir).ok, true);
});

test("returning nothing is a halt, not a substitution", () => {
  const dir = tmpProject();
  const src = `function f(post) {
  const a = lookup(post);
  if (!a) { return null; }
  return a;
}`;
  assert.strictEqual(detect(src, path.join(dir, "a.js"), dir).ok, true);
});

test("every shape of the substitution is caught", () => {
  const dir = tmpProject();
  const shapes = [
    `function a(p){ const x=find(p); if(!x){ return lastSeller; } return x; }`,
    `function b(p){ let x=find(p); if(x===null){ x=defaultSeller; } return x; }`,
    `function c(p){ return find(p) || lastKnownSeller; }`,
  ];
  for (const src of shapes) {
    assert.strictEqual(detect(src, path.join(dir, "x.js"), dir).ok, false, `missed: ${src}`);
  }
});

test("reading an optional setting is not a fallback", () => {
  const dir = tmpProject();
  const src = `function f(opts){ const dir = opts.projectDir || '.'; return dir; }`;
  assert.strictEqual(detect(src, path.join(dir, "a.js"), dir).ok, true,
    "an absent option is not a failure — flagging it would train bypassing");
});

test("a plan that describes a fallback is caught", () => {
  const dir = tmpProject();
  const plan = path.join(dir, "plan.md");
  fs.writeFileSync(plan, "# Plan\nFetch the author.\nIf it fails, we default to the last known seller.\n");
  const r = spawnSync(process.execPath, [DETECT, "--plan", plan, "--project", dir, "--json"], { encoding: "utf8" });
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.ok, false, "a fallback buried in a plan must surface before approval");
});

test("an approved fallback passes", () => {
  const dir = tmpProject();
  fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".gsd-t", "fallbacks.json"), JSON.stringify([{
    id: "author", location: "author.js#resolveAuthor", rule: "substituted-value",
    whatFails: "x", howLikely: "x", whyNotHalt: "x", whatItDoesInstead: "x", approvedBy: "david",
  }]));
  const src = `function resolveAuthor(p){ const a=find(p); if(!a){ return lastSeller; } return a; }`;
  const r = detect(src, path.join(dir, "author.js"), dir);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.approved, 1);
});

test("an unreadable approval file HALTS — it never passes", () => {
  const dir = tmpProject();
  fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".gsd-t", "fallbacks.json"), "{ broken");
  const src = `function f(p){ const a=find(p); if(!a){ return b; } return a; }`;
  const r = detect(src, path.join(dir, "a.js"), dir);
  assert.strictEqual(r.exitCode, 64);
  assert.ok(r.halt, "an undecidable check must halt, never report clean");
});

test("the baseline is seeded once and never re-seeded", () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, "a.js"), `function f(p){ const a=find(p); if(!a){ return b; } return a; }`);
  const first = spawnSync(process.execPath, [DETECT, "--scan", "--baseline", "--project", dir, "--json"], { encoding: "utf8" });
  assert.strictEqual(JSON.parse(first.stdout).ok, true);
  const second = spawnSync(process.execPath, [DETECT, "--scan", "--baseline", "--project", dir, "--json"], { encoding: "utf8" });
  const out = JSON.parse(second.stdout);
  assert.strictEqual(out.exitCode, 64, "re-seeding would let a new fallback hide behind the baseline");
});

test("HOOK: a write adding the Marla fallback is denied", () => {
  const dir = tmpProject();
  const d = guard({
    tool_name: "Write", cwd: dir,
    tool_input: {
      file_path: path.join(dir, "src", "author.js"),
      content: `function r(p){ const a=find(p); if(!a){ return lastSeller; } return a; }`,
    },
  });
  assert.strictEqual(d.decision, "deny");
  assert.match(d.reason, /never approved/);
});

test("HOOK: the halt version is allowed", () => {
  const dir = tmpProject();
  const d = guard({
    tool_name: "Write", cwd: dir,
    tool_input: {
      file_path: path.join(dir, "src", "author.js"),
      content: `function r(p){ const a=find(p); if(!a){ throw new Error('no author'); } return a; }`,
    },
  });
  assert.strictEqual(d.decision, "allow");
});

test("HOOK: test files are exempt", () => {
  const dir = tmpProject();
  const d = guard({
    tool_name: "Write", cwd: dir,
    tool_input: {
      file_path: path.join(dir, "test", "a.test.js"),
      content: `try { setup(); } catch (e) { return []; }`,
    },
  });
  assert.strictEqual(d.decision, "allow");
});

test("HOOK: a switched-off project is allowed", () => {
  const dir = tmpProject();
  fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".gsd-t", "fallback-gate.json"), JSON.stringify({ enabled: false }));
  const d = guard({
    tool_name: "Write", cwd: dir,
    tool_input: {
      file_path: path.join(dir, "src", "a.js"),
      content: `function r(p){ const a=find(p); if(!a){ return lastSeller; } return a; }`,
    },
  });
  assert.strictEqual(d.decision, "allow");
});
