#!/usr/bin/env node
"use strict";

/**
 * gsd-t-pick-worktree.cjs
 *
 * Prints the directory this session should work in. Prints nothing when the
 * current directory is already right.
 *
 * Meant to be used by the shell BEFORE claude launches:
 *
 *     d=$(gsd-t-pick-worktree) && [ -n "$d" ] && cd "$d"
 *     claude
 *
 * Why the shell and not a hook: a SessionStart hook can only ask the model to
 * move, and a request can be declined — it was, repeatedly. `cd` inside Claude
 * Code does not move the session either, because each Bash call runs in its own
 * shell. Only the shell that launches claude can decide where it starts, so the
 * decision belongs there.
 *
 * Picking: reuse the newest worktree nobody is sitting in, else make one.
 * "Nobody is sitting in it" means no interactive claude has it open — a terminal
 * session owns a tty, while subagents and `claude -p` runs do not. That is the
 * signal the retired heartbeat guard got wrong, counting one session's helpers
 * as several colliding sessions.
 *
 * Silent (prints nothing, exit 0) when there is nothing to change: not a git
 * repo, not a GSD-T project, already inside a worktree, or switched off in
 * .gsd-t/auto-worktree-config.json {"enabled": false}.
 *
 * Exit 1 with a message on stderr when the right directory cannot be
 * determined. The shell then leaves you where you are, having told you why —
 * it never moves you to a guessed directory.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function stay() {           // nothing to change — the caller keeps its directory
  process.exit(0);
}

function fail(message) {    // could not decide — say why, change nothing
  process.stderr.write(`[GSD-T WORKTREE] ${message}\n`);
  process.exit(1);
}

function main() {
  const cwd = process.cwd();

  if (!isGitRepo(cwd)) stay();
  if (isInsideWorktree(cwd)) stay();
  if (!fs.existsSync(path.join(cwd, ".gsd-t"))) stay();
  if (isSwitchedOff(cwd)) stay();

  const home = path.join(process.env.HOME, "Worktrees", path.basename(cwd));
  const occupied = interactiveClaudeDirs();
  const free = worktreesNewestFirst(home).find((w) => !occupied.has(w.path));
  const target = free || create(cwd, home);

  process.stdout.write(target.path + "\n");
}

function isSwitchedOff(cwd) {
  const p = path.join(cwd, ".gsd-t", "auto-worktree-config.json");
  if (!fs.existsSync(p)) return false;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    // Reading an unreadable config as either "on" or "off" is a guess.
    fail(`${p} is not valid JSON (${e.message}) — fix or delete it.`);
  }
  return cfg.enabled === false;
}

// Most directories are not git repos. That is ordinary, not a failure.
function isGitRepo(dir) {
  return spawnSync("git", ["rev-parse", "--git-dir"], { cwd: dir, stdio: "pipe" }).status === 0;
}

// A worktree's .git is a file pointing at the main repo; the main tree's is a
// directory. That difference is the whole test.
function isInsideWorktree(dir) {
  const g = path.join(dir, ".git");
  if (!fs.existsSync(g)) return false;
  return fs.lstatSync(g).isFile();
}

// Worktrees for this project, most recently touched first. An entry that cannot
// be inspected stops the run: skipping it could hide the worktree this session
// belongs in, and a second worktree for the same work is the collision being
// prevented.
function worktreesNewestFirst(home) {
  if (!fs.existsSync(home)) return [];
  const out = [];
  for (const name of fs.readdirSync(home)) {
    const p = path.join(home, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch (e) {
      fail(`Cannot inspect ${p} (${e.message}), so an existing worktree can't be ruled out.`);
    }
    if (!st.isDirectory()) continue;
    if (!fs.existsSync(path.join(p, ".git"))) continue;
    out.push({ path: p, mtime: st.mtimeMs });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

function create(repo, home) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const branch = `session-${stamp}`;
  const dest = path.join(home, branch);

  fs.mkdirSync(home, { recursive: true });

  const r = spawnSync("git", ["worktree", "add", dest, "-b", branch], {
    cwd: repo, encoding: "utf8",
  });

  // git writes progress to stderr even when it succeeds, so the exit code and
  // the directory existing are what actually prove it worked.
  if (r.status !== 0 || !fs.existsSync(dest)) {
    fail(
      `Could not create a worktree: ${String(r.stderr).trim() || "unknown error"}. ` +
      `Fix the cause, or switch this off with ` +
      `.gsd-t/auto-worktree-config.json {"enabled": false}.`
    );
  }
  return { path: dest };
}

/**
 * Directories an interactive claude currently has open.
 *
 * `ps` prints a terminal name for a process attached to one and `??` for one
 * that is not. Subagents and `claude -p` runs have no terminal, so filtering on
 * that column leaves only real sessions.
 */
function interactiveClaudeDirs() {
  const ps = spawnSync("ps", ["-eo", "pid=,tty=,comm="], { encoding: "utf8" });
  if (ps.status !== 0) {
    fail(
      `Cannot read the process list (${String(ps.stderr).trim() || "ps failed"}), ` +
      `so a worktree already in use can't be ruled out.`
    );
  }

  const dirs = new Set();
  for (const line of String(ps.stdout).split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const [, pid, tty, comm] = m;
    if (tty === "??" || tty === "?") continue;   // no terminal — not a session
    if (!/claude/i.test(comm)) continue;
    const d = cwdOfPid(pid);
    if (d) dirs.add(d);
  }
  return dirs;
}

// A process that exited between listing and inspection occupies nothing, so a
// pid lsof cannot report on is genuinely absent rather than unknown.
function cwdOfPid(pid) {
  const r = spawnSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], { encoding: "utf8" });
  if (r.status !== 0) return null;
  for (const line of String(r.stdout).split("\n")) {
    if (line.startsWith("n/")) return line.slice(1);
  }
  return null;
}

main();
