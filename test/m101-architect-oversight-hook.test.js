"use strict";
/**
 * M101 — Architect's Oversight hook (gsd-t-architect-oversight-guard.js).
 *
 * The hook is the TRIGGER layer of the doctrine: a PreToolUse Write|Edit reminder.
 * Non-negotiable properties under test:
 *   - fires for CODE writes inside a GSD-T project
 *   - stays SILENT for prose / pseudocode / docs / non-GSD-T dirs
 *   - fails OPEN (garbage/empty stdin → exit 0, no output) — never blocks a write
 *
 * The hook lives at ~/.claude/scripts (installed location), so we resolve it there.
 * If absent (fresh checkout without install), the suite skips loudly rather than
 * false-failing — the source-of-truth is the installed hook.
 */

const { test } = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const HOOK = path.join(os.homedir(), ".claude", "scripts", "gsd-t-architect-oversight-guard.js");
const INSTALLED = fs.existsSync(HOOK);

// A real GSD-T project dir on disk (this repo) — has .gsd-t/.
const GSDT_PROJECT = path.resolve(__dirname, "..");

function runHook(payloadObj) {
  const res = spawnSync("node", [HOOK], {
    input: JSON.stringify(payloadObj),
    encoding: "utf8",
    timeout: 10000,
  });
  return { stdout: res.stdout || "", code: res.status };
}

function runHookRaw(raw) {
  const res = spawnSync("node", [HOOK], { input: raw, encoding: "utf8", timeout: 10000 });
  return { stdout: res.stdout || "", code: res.status };
}

test("M101 hook: reminds for a CODE write in a GSD-T project", { skip: !INSTALLED && "hook not installed" }, () => {
  const { stdout, code } = runHook({
    tool_name: "Write",
    tool_input: { file_path: path.join(GSDT_PROJECT, "bin", "some-new.js") },
    cwd: GSDT_PROJECT,
  });
  assert.strictEqual(code, 0, "exit 0");
  assert.match(stdout, /\[GSD-T ARCHITECT\]/, "emits the architect reminder");
  assert.match(stdout, /Six-Stage Pass/, "names the six-stage pass");
});

test("M101 hook: SILENT for a markdown write (prose)", { skip: !INSTALLED && "hook not installed" }, () => {
  const { stdout, code } = runHook({
    tool_name: "Write",
    tool_input: { file_path: path.join(GSDT_PROJECT, "docs", "x.md") },
    cwd: GSDT_PROJECT,
  });
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), "", "no reminder for prose");
});

test("M101 hook: SILENT for a pseudocode-dir write even if code-extensioned", { skip: !INSTALLED && "hook not installed" }, () => {
  const { stdout } = runHook({
    tool_name: "Edit",
    tool_input: { file_path: path.join(GSDT_PROJECT, ".gsd-t", "pseudocode", "foo.js") },
    cwd: GSDT_PROJECT,
  });
  assert.strictEqual(stdout.trim(), "", "no reminder inside pseudocode/");
});

test("M101 hook: SILENT outside a GSD-T project", { skip: !INSTALLED && "hook not installed" }, () => {
  const { stdout } = runHook({
    tool_name: "Write",
    tool_input: { file_path: "/tmp/foo.js" },
    cwd: os.tmpdir(),
  });
  assert.strictEqual(stdout.trim(), "", "no reminder outside a GSD-T project");
});

test("M101 hook: fails OPEN on garbage stdin (exit 0, no output)", { skip: !INSTALLED && "hook not installed" }, () => {
  const { stdout, code } = runHookRaw("not json at all");
  assert.strictEqual(code, 0, "never non-zero — must not block the write");
  assert.strictEqual(stdout.trim(), "", "no output on garbage");
});

test("M101 hook: fails OPEN on empty stdin", { skip: !INSTALLED && "hook not installed" }, () => {
  const { stdout, code } = runHookRaw("");
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), "");
});

test("M101 hook: module export shouldRemind is pure + total", { skip: !INSTALLED && "hook not installed" }, () => {
  const { shouldRemind } = require(HOOK);
  assert.strictEqual(shouldRemind(GSDT_PROJECT, path.join(GSDT_PROJECT, "bin", "x.ts")), true);
  assert.strictEqual(shouldRemind(GSDT_PROJECT, path.join(GSDT_PROJECT, "a.md")), false);
  assert.strictEqual(shouldRemind("/tmp", "/tmp/a.js"), false);
  assert.strictEqual(shouldRemind(null, null), false, "null-safe");
  assert.strictEqual(shouldRemind(GSDT_PROJECT, ""), false, "empty path → silent");
});

test("M101: doctrine + contract + template are present and agree", () => {
  const contract = path.join(GSDT_PROJECT, ".gsd-t", "contracts", "architects-oversight-contract.md");
  const template = path.join(GSDT_PROJECT, "templates", "CLAUDE-global.md");
  const pseudocode = path.join(GSDT_PROJECT, ".gsd-t", "pseudocode", "PseudoCode-ArchitectsOversight.md");
  assert.ok(fs.existsSync(contract), "contract exists");
  assert.ok(fs.existsSync(pseudocode), "self-obedience pseudocode exists (A-FAIL-1)");
  const tpl = fs.readFileSync(template, "utf8");
  assert.match(tpl, /Architect's Oversight Doctrine/, "template carries the doctrine (doc-ripple G-1)");
  assert.match(tpl, /Six-Stage Pass/, "template names the six-stage pass");
});

test("M101: phase workflow injects the architect pass for plan/milestone", () => {
  const wf = fs.readFileSync(
    path.join(GSDT_PROJECT, "templates", "workflows", "gsd-t-phase.workflow.js"), "utf8");
  assert.match(wf, /phase-workflow-injects-architect-pass/, "[RULE] marker present");
  assert.match(wf, /ARCHITECT'S OVERSIGHT/, "directive text present");
  assert.match(wf, /_ARCHITECT_PHASES = new Set\(\["plan", "milestone"\]\)/, "gated to plan/milestone");
});
