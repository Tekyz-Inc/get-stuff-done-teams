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
function run(cwd, env, args = []) {
  const r = spawnSync(process.execPath, [PICKER, ...args], {
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

test("M111: --name prints a usable directory and nothing else", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));

  const { stdout, status } = run(repo, { HOME: home }, ["--name", "grain-api-tokens"]);

  assert.strictEqual(status, 0);
  const printed = stdout.trim();
  assert.ok(fs.existsSync(printed), `must print a directory that exists: ${printed}`);
  assert.strictEqual(path.basename(printed), "grain-api-tokens",
    "the worktree carries the name that was asked for");
  assert.strictEqual(stdout.split("\n").filter(Boolean).length, 1,
    "exactly one line — the shell cd's into whatever this prints");
  assert.doesNotMatch(stdout, /GSD-T|worktree:|\[/,
    "no commentary on stdout — it would be treated as part of the path");
});

// A timestamp branch describes nothing, and twenty of them describe nothing
// twenty times. Naming happens when the work is known, which is why nothing
// generates a name on its own.
test("M111: never invents a branch name", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));

  const { stdout, status } = run(repo, { HOME: home });

  assert.strictEqual(status, 0);
  assert.strictEqual(stdout.trim(), "",
    "with nothing free and no name given, it must stay put rather than " +
    "create a session-<timestamp> branch");
  assert.ok(!fs.existsSync(path.join(home, "Worktrees", "proj")),
    "nothing may be created without a name");
});

test("M111: --suggest reports without creating anything", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));

  const first = run(repo, { HOME: home }, ["--suggest"]);
  assert.strictEqual(first.stdout.trim(), "create",
    "no worktree exists yet, so the shell must ask for a name");
  assert.ok(!fs.existsSync(path.join(home, "Worktrees", "proj")),
    "--suggest must create nothing — that is the whole point of asking first");

  const made = run(repo, { HOME: home }, ["--name", "prototype-validation"]).stdout.trim();

  const second = run(repo, { HOME: home }, ["--suggest"]);
  assert.strictEqual(second.stdout.trim(), `reuse:${made}`,
    "with one free, it offers reuse so Enter can accept it");
});

test("M111: cleans a typed name into a valid branch", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));

  const out = run(repo, { HOME: home }, ["--name", "  Grain API Tokens!  "]).stdout.trim();
  assert.strictEqual(path.basename(out), "grain-api-tokens");

  const branch = spawnSync("git", ["branch", "--show-current"],
    { cwd: out, encoding: "utf8" }).stdout.trim();
  assert.strictEqual(branch, "grain-api-tokens", "git must accept it as-is");
});

test("M111: refuses to reuse a directory that already exists", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));

  run(repo, { HOME: home }, ["--name", "taken"]);
  const again = run(repo, { HOME: home }, ["--name", "taken"]);

  assert.notStrictEqual(again.status, 0);
  assert.strictEqual(again.stdout.trim(), "",
    "printing the path would drop this session on top of the other's work");
  assert.match(again.stderr, /already exists/);
});

test("M111: silent inside a worktree — already isolated", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));

  const wt = run(repo, { HOME: home }, ["--name", "some-work"]).stdout.trim();
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

// ── Naming the default branch means "work here" (M112) ───────────────────────
//
// Working directly in the main checkout is rare but real. The only way to ask
// for it is to name it, and git refuses a worktree on a branch already checked
// out anyway — so the name has to mean "stay", not "create".

function defaultBranchOf(repo) {
  const r = spawnSync("git", ["branch", "--show-current"], { cwd: repo, encoding: "utf8" });
  return String(r.stdout || "").trim();
}

test("M112: naming the default branch stays in the main checkout", () => {
  const { home, repo } = makeProject();
  try {
    const branch = defaultBranchOf(repo);
    const r = run(repo, { HOME: home }, ["--name", branch]);
    assert.strictEqual(r.stdout.trim(), "", "empty stdout keeps the shell where it is");
    assert.match(r.stderr, /staying in the main checkout/i, "and it must say so, not go silent");
    assert.strictEqual(r.status, 0);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test("M112: the typed name is matched case-insensitively", () => {
  // A branch name typed at a prompt is a value the user types. "Main" is main.
  const { home, repo } = makeProject();
  try {
    const shouty = defaultBranchOf(repo).toUpperCase();
    const r = run(repo, { HOME: home }, ["--name", shouty]);
    assert.strictEqual(r.stdout.trim(), "", `"${shouty}" must behave like its lowercase form`);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test("M112: the default branch is asked of git, never assumed to be 'main'", () => {
  // A repo on `trunk` must treat trunk as its default — and `main` as an
  // ordinary new branch name.
  const { home, repo } = makeProject();
  try {
    spawnSync("git", ["branch", "-m", "trunk"], { cwd: repo, stdio: "pipe" });

    const stays = run(repo, { HOME: home }, ["--name", "trunk"]);
    assert.strictEqual(stays.stdout.trim(), "", "trunk is this repo's default");

    const creates = run(repo, { HOME: home }, ["--name", "main"]);
    assert.match(creates.stdout.trim(), /Worktrees/,
      "main is not special here — it is just another branch name");
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
