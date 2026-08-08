"use strict";

/**
 * M111 — auto-worktree router.
 *
 * The bug these tests exist for: the first version printed its `cd` instruction
 * as plain text. Claude Code discards a SessionStart hook's plain stdout and
 * reads only `hookSpecificOutput.additionalContext`, so the instruction reached
 * nobody and every session silently stayed in the main tree. It looked like it
 * worked — the worktree appeared, the message printed on a manual run — which is
 * why it survived a round of hand-testing. The shape of the output is therefore
 * asserted, not just its presence.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "gsd-t-auto-worktree.js");

// Run the hook the way Claude Code does: payload on stdin, read stdout.
function run(payload, env) {
  const r = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { stdout: r.stdout, status: r.status };
}

// A throwaway git repo that looks like a GSD-T project.
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m111-"));
  const repo = path.join(dir, "proj");
  fs.mkdirSync(repo);
  fs.mkdirSync(path.join(repo, ".gsd-t"));
  const git = (...args) => spawnSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  fs.writeFileSync(path.join(repo, "f.txt"), "x");
  git("add", "-A");
  git("commit", "-qm", "init");
  return { home: dir, repo };
}

function cleanup(home) {
  fs.rmSync(home, { recursive: true, force: true });
}

test("M111: speaks through additionalContext, not plain stdout", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));

  const { stdout, status } = run({ cwd: repo, source: "startup" }, { HOME: home });

  assert.strictEqual(status, 0, "must exit 0 or the output is not processed");
  assert.ok(stdout.trim(), "must produce output for a new session in a main tree");

  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(stdout); },
    "stdout must be JSON — plain text is discarded by Claude Code");

  const out = parsed.hookSpecificOutput;
  assert.ok(out, "must carry hookSpecificOutput");
  assert.strictEqual(out.hookEventName, "SessionStart");
  assert.ok(typeof out.additionalContext === "string" && out.additionalContext,
    "the instruction must live in additionalContext — the only field the model reads");
  assert.match(out.additionalContext, /cd "/,
    "must tell the model the exact cd command to run");
});

test("M111: reuses a free worktree instead of creating another", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));

  const first = JSON.parse(run({ cwd: repo, source: "startup" }, { HOME: home })
    .stdout).hookSpecificOutput.additionalContext;
  const second = JSON.parse(run({ cwd: repo, source: "startup" }, { HOME: home })
    .stdout).hookSpecificOutput.additionalContext;

  const pathOf = (s) => s.match(/cd "([^"]+)"/)[1];
  assert.strictEqual(pathOf(second), pathOf(first),
    "a second start must reuse the first worktree, not pile up new ones");
  assert.match(second, /Reusing/);

  const made = fs.readdirSync(path.join(home, "Worktrees", "proj"));
  assert.strictEqual(made.length, 1, `expected 1 worktree, found ${made.length}`);
});

// Every start that is not "startup" carries work already in progress. Re-routing
// one would strand that work in the directory it was left in.
for (const source of ["resume", "clear", "compact", "fork"]) {
  test(`M111: silent on source="${source}"`, (t) => {
    const { home, repo } = makeProject();
    t.after(() => cleanup(home));
    const { stdout } = run({ cwd: repo, source }, { HOME: home });
    assert.strictEqual(stdout.trim(), "", `must not re-route a "${source}" start`);
  });
}

test("M111: silent outside a git repo", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "m111-"));
  t.after(() => cleanup(home));
  const plain = path.join(home, "nothing");
  fs.mkdirSync(plain);
  const { stdout } = run({ cwd: plain, source: "startup" }, { HOME: home });
  assert.strictEqual(stdout.trim(), "");
});

test("M111: silent in a git repo that is not a GSD-T project", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));
  fs.rmSync(path.join(repo, ".gsd-t"), { recursive: true });
  const { stdout } = run({ cwd: repo, source: "startup" }, { HOME: home });
  assert.strictEqual(stdout.trim(), "");
});

test("M111: silent when already inside a worktree", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));

  const wt = JSON.parse(run({ cwd: repo, source: "startup" }, { HOME: home })
    .stdout).hookSpecificOutput.additionalContext.match(/cd "([^"]+)"/)[1];
  fs.mkdirSync(path.join(wt, ".gsd-t"), { recursive: true });

  const { stdout } = run({ cwd: wt, source: "startup" }, { HOME: home });
  assert.strictEqual(stdout.trim(), "", "a session already isolated needs no move");
});

test("M111: switched off by config", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));
  fs.writeFileSync(path.join(repo, ".gsd-t", "auto-worktree-config.json"),
    JSON.stringify({ enabled: false }));
  const { stdout } = run({ cwd: repo, source: "startup" }, { HOME: home });
  assert.strictEqual(stdout.trim(), "");
});

test("M111: an unreadable config halts and says why", (t) => {
  const { home, repo } = makeProject();
  t.after(() => cleanup(home));
  fs.writeFileSync(path.join(repo, ".gsd-t", "auto-worktree-config.json"), "{ not json");

  const { stdout } = run({ cwd: repo, source: "startup" }, { HOME: home });
  const ctx = JSON.parse(stdout).hookSpecificOutput.additionalContext;

  assert.match(ctx, /not valid JSON/, "must name the problem");
  assert.match(ctx, /Staying in the current directory/, "must not move on a guess");
  assert.doesNotMatch(ctx, /cd "/, "must not hand out a worktree it could not verify");
});

test("M111: the retired heartbeat guard is gone", () => {
  const gone = path.join(__dirname, "..", "scripts", "gsd-t-worktree-guard.js");
  assert.ok(!fs.existsSync(gone),
    "the M105 guard read heartbeat files that subagents also write, so it " +
    "counted one session with helpers as several colliding sessions");
});
