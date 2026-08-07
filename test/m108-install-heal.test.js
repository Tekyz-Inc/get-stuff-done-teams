"use strict";

/**
 * M108 — Install self-check and repair.
 *
 * The problem this exists for was real: binvoice ran for weeks with 20 of 38
 * tools, and every update reported success because a missing file was silently
 * skipped. Across all 33 projects the verify gate was stale.
 *
 * This is NOT a fallback. A fallback continues past a failure with a worse
 * answer. This one fixes the failure, then the work proceeds correctly.
 */

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");

const CHECK = path.join(__dirname, "..", "bin", "gsd-t-install-check.cjs");
const HEAL = path.join(__dirname, "..", "scripts", "gsd-t-install-heal.js");
const PKG = path.join(__dirname, "..");

const lib = require(CHECK);

/** A throwaway project with a bin/ holding the named tools. */
function fakeProject(tools) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m108-"));
  fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
  fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
  for (const t of tools) {
    const src = path.join(PKG, "bin", t);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, "bin", t));
  }
  return dir;
}

function check(dir, extra = []) {
  const r = spawnSync(process.execPath, [CHECK, "--project", dir, "--json", ...extra], { encoding: "utf8" });
  return JSON.parse(r.stdout);
}

test("a missing tool is found", () => {
  const dir = fakeProject(["cli-preflight.cjs"]);
  const r = check(dir, ["--check"]);
  assert.strictEqual(r.ok, false);
  assert.ok(r.missing.length > 0, "a project with one tool must be reported as incomplete");
});

test("a missing tool is restored, and the work can continue", () => {
  const dir = fakeProject(["cli-preflight.cjs"]);
  const before = check(dir, ["--check"]);
  const r = check(dir);
  assert.ok(r.repaired.length > 0, "the missing tools must actually be copied in");
  const after = check(dir, ["--check"]);
  assert.strictEqual(after.ok, true, "after repair the install must be complete");
  assert.ok(after.present > before.present);
});

test("a complete install reports clean and changes nothing", () => {
  const dir = fakeProject(["cli-preflight.cjs"]);
  check(dir); // repair once
  const r = check(dir);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.repaired.length, 0, "a second run must find nothing to do");
});

test("a stale tool — present but different — is refreshed", () => {
  const dir = fakeProject(["cli-preflight.cjs"]);
  check(dir);
  const victim = path.join(dir, "bin", "cli-preflight.cjs");
  fs.writeFileSync(victim, "// an old version\n");
  const stale = check(dir, ["--check"]);
  assert.ok(stale.stale.length > 0, "a file that differs from the package must be spotted");
  check(dir);
  assert.notStrictEqual(fs.readFileSync(victim, "utf8"), "// an old version\n");
});

test("a folder that is not a GSD-T project is left entirely alone", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m108-plain-"));
  const r = spawnSync(process.execPath, [CHECK, "--project", dir, "--json"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0);
});

test("every repair is written to the shared log", () => {
  const dir = fakeProject(["cli-preflight.cjs"]);
  const before = lib.readLog().entries.length;
  check(dir);
  const after = lib.readLog().entries.length;
  assert.ok(after > before, "a repair nobody can see is how this stayed hidden for weeks");
});

test("a tool missing in several projects is named as an installer problem", () => {
  const entries = [
    { project: "a", repaired: ["shared-tool.cjs", "only-in-a.cjs"] },
    { project: "b", repaired: ["shared-tool.cjs"] },
    { project: "c", repaired: ["shared-tool.cjs"] },
  ];
  const suspects = lib.installerSuspects({}, entries);
  assert.strictEqual(suspects[0].tool, "shared-tool.cjs");
  assert.strictEqual(suspects[0].projects.length, 3);
  assert.ok(!suspects.some((s) => s.tool === "only-in-a.cjs"),
    "a tool missing in one project is that project's problem, not the installer's");
});

test("the expected tool list is read from the installer, never hardcoded", () => {
  const tools = lib.expectedTools(PKG);
  assert.ok(tools.length > 30, "the list should hold every tool a project needs");
  assert.ok(tools.includes("gsd-t-verify-gate.cjs"));
  assert.ok(tools.includes("gsd-t-install-check.cjs"), "the checker must ship with every project");
});

test("HOOK: a healthy project says nothing", () => {
  const dir = fakeProject(["cli-preflight.cjs"]);
  check(dir); // make it complete
  const r = spawnSync(process.execPath, [HEAL], {
    encoding: "utf8",
    input: JSON.stringify({ hook_event_name: "SessionStart", cwd: dir }),
  });
  assert.strictEqual(r.stdout.trim(), "", "no news is good news");
});

test("HOOK: a broken project is repaired and says so", () => {
  const dir = fakeProject(["cli-preflight.cjs"]);
  const r = spawnSync(process.execPath, [HEAL], {
    encoding: "utf8",
    input: JSON.stringify({ hook_event_name: "SessionStart", cwd: dir }),
  });
  assert.match(r.stdout, /was missing/);
  assert.strictEqual(check(dir, ["--check"]).ok, true, "the session must start with a complete install");
});

test("HOOK: a folder that is not a GSD-T project says nothing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m108-plain-"));
  const r = spawnSync(process.execPath, [HEAL], {
    encoding: "utf8",
    input: JSON.stringify({ hook_event_name: "SessionStart", cwd: dir }),
  });
  assert.strictEqual(r.stdout.trim(), "");
});

test("the installer no longer skips a missing tool in silence", () => {
  const src = fs.readFileSync(path.join(PKG, "bin", "gsd-t.js"), "utf8");
  assert.ok(!/if \(!fs\.existsSync\(src\)\) continue;/.test(src),
    "the silent skip is what let binvoice run on half an install");
  assert.ok(/notDelivered/.test(src), "undelivered tools must be counted and reported");
});
