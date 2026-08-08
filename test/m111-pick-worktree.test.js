"use strict";

/**
 * M111 — worktree picker.
 *
 * The shell runs this before launching claude and cd's to whatever it prints.
 * Three earlier attempts failed because they tried to move a session from
 * inside it: a SessionStart hook can only ask the model to move (it declined),
 * the hook's own `cd` moves only its own process, and `cd` in a Claude Code
 * Bash call lasts exactly one call. Only the launching shell can decide where a
 * session starts, so the contract here is narrow and mechanical:
 *
 *   prints a path  → the shell moves there
 *   prints nothing → the shell stays put   (exit 0)
 *   exit non-zero  → the shell stays put, reason on stderr
 *
 * Printing anything but a bare path on stdout would make the shell cd into
 * garbage, so stdout cleanliness is asserted, not assumed.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const PICKER = path.join(__dirname, "..", "bin", "gsd-t-pick-worktree.cjs");

// Run it the way the shell does: from a directory, capturing stdout separately.
function run(cwd, env) {
  const r = spawnSync(process.execPath, [PICKER], {
    cwd, encoding: "utf8", env: { ...process.env, ...env },
  });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

function makeProject() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "m111-"));
  const repo = path.join(home, "proj");
  fs.mkdirSync(repo);
  fs.mkdirSync(path.join(repo, ".gsd-t"));
  const git = (...a) => spawnSync("git", a, { cwd: repo, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  fs.writeFileSync(path.join(repo, "f.txt"), "x");
  git("add", "-A");
  git("commit", "-qm", "init");
  return { home, repo };
}

const cleanup = (home) => fs.rmSync(home, { recursive: true, force: true });

test("M111: prints a usable directory and nothing else", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));

  const { stdout, status } = run(repo, { HOME: home });

  assert.strictEqual(status, 0);
  const printed = stdout.trim();
  assert.ok(printed, "must name a worktree for a session starting in a main tree");
  assert.ok(fs.existsSync(printed), `must print a directory that exists: ${printed}`);
  assert.strictEqual(stdout.split("\n").filter(Boolean).length, 1,
    "exactly one line — the shell cd's into whatever this prints");
  assert.doesNotMatch(stdout, /GSD-T|worktree:|\[/,
    "no commentary on stdout — it would be treated as part of the path");
});

test("M111: reuses a free worktree instead of stacking new ones", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));

  const first = run(repo, { HOME: home }).stdout.trim();
  const second = run(repo, { HOME: home }).stdout.trim();

  assert.strictEqual(second, first, "a second start must reuse the first worktree");
  assert.strictEqual(fs.readdirSync(path.join(home, "Worktrees", "proj")).length, 1,
    "one worktree, not one per launch");
});

test("M111: silent inside a worktree — already isolated", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));

  const wt = run(repo, { HOME: home }).stdout.trim();
  fs.mkdirSync(path.join(wt, ".gsd-t"), { recursive: true });

  const { stdout, status } = run(wt, { HOME: home });
  assert.strictEqual(status, 0);
  assert.strictEqual(stdout.trim(), "");
});

test("M111: silent outside a git repo", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "m111-"));
  t.after(() => cleanup(home));
  const plain = path.join(home, "nothing");
  fs.mkdirSync(plain);

  const { stdout, status } = run(plain, { HOME: home });
  assert.strictEqual(status, 0);
  assert.strictEqual(stdout.trim(), "");
});

test("M111: silent in a git repo that is not a GSD-T project", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));
  fs.rmSync(path.join(repo, ".gsd-t"), { recursive: true });

  const { stdout, status } = run(repo, { HOME: home });
  assert.strictEqual(status, 0);
  assert.strictEqual(stdout.trim(), "");
});

test("M111: silent when switched off", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));
  fs.writeFileSync(path.join(repo, ".gsd-t", "auto-worktree-config.json"),
    JSON.stringify({ enabled: false }));

  const { stdout, status } = run(repo, { HOME: home });
  assert.strictEqual(status, 0);
  assert.strictEqual(stdout.trim(), "");
});

test("M111: an unreadable config fails loudly and prints no path", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));
  fs.writeFileSync(path.join(repo, ".gsd-t", "auto-worktree-config.json"), "{ not json");

  const { stdout, stderr, status } = run(repo, { HOME: home });

  assert.notStrictEqual(status, 0, "the shell must not move on an undecided answer");
  assert.strictEqual(stdout.trim(), "", "a path here would be a guess");
  assert.match(stderr, /not valid JSON/, "must say what is wrong");
});

test("M111: the retired SessionStart hook is gone", () => {
  const gone = path.join(__dirname, "..", "scripts", "gsd-t-auto-worktree.js");
  assert.ok(!fs.existsSync(gone),
    "a hook can only ask the model to move; the shell moves it. Keeping both " +
    "means two mechanisms racing to place the same session.");
});

test("M111: the retired heartbeat collision guard is gone", () => {
  const gone = path.join(__dirname, "..", "scripts", "gsd-t-worktree-guard.js");
  assert.ok(!fs.existsSync(gone),
    "it read heartbeat files that subagents also write, so one session with " +
    "helpers looked like several colliding sessions");
});
