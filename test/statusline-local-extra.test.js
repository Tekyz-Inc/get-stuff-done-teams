"use strict";

// The status bar adds a last line from ~/.claude/statusline-local.sh when the user
// keeps one (personal extras survive `gsd-t update`, which rewrites the shipped script).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "statusline-command.sh");
const INPUT = JSON.stringify({ model: { id: "claude-opus-5-5" }, workspace: { current_dir: os.tmpdir() } });

function run(extra) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "gsdt-sl-"));
  try {
    fs.mkdirSync(path.join(home, ".claude"));
    if (extra !== undefined) fs.writeFileSync(path.join(home, ".claude", "statusline-local.sh"), extra);
    const r = spawnSync("bash", [SCRIPT], { input: INPUT, env: { ...process.env, HOME: home }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.split("\n");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test("no local extra → the bar is unchanged (one line)", () => {
  const lines = run();
  assert.equal(lines.length, 1);
  assert.match(lines[0], /claude-opus-5-5/);
});

test("a local extra gets the same input and prints as the last line", () => {
  const lines = run('m=$(jq -r .model.id); echo "acct line for $m"\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[1], "acct line for claude-opus-5-5");
});

test("a failing local extra says so instead of vanishing", () => {
  const lines = run("exit 3\n");
  assert.equal(lines[lines.length - 1], "statusline-local.sh failed (exit 3)");
});
