#!/usr/bin/env node
"use strict";

/**
 * gsd-t-auto-worktree.js — SessionStart
 *
 * Puts every terminal session in its own worktree, so two sessions never share
 * one working tree and interleave their uncommitted work.
 *
 * A SessionStart hook cannot change the shell's directory — it runs in its own
 * process. What it CAN do is hand the model a note. So it hands over a `cd`
 * instruction and the model runs it as its first action. That is the whole
 * mechanism.
 *
 * The note has to be JSON. Claude Code discards a SessionStart hook's plain
 * stdout and reads only `hookSpecificOutput.additionalContext`, so printing the
 * instruction as prose reaches nobody — the first version of this script did
 * exactly that and every session silently stayed in the main tree.
 *
 * Reuse before create. Most sessions are the same person coming back to the same
 * project, so the most recent worktree nobody is sitting in is the right home.
 * Creating one per session start is what filled ~/Worktrees with a dozen empty
 * branches in fifteen minutes.
 *
 * "Nobody is sitting in it" means no interactive claude has it as its working
 * directory. Interactive = the process owns a terminal. Subagents and `claude -p`
 * runs do not, which is why the retired heartbeat guard miscounted one session
 * with helpers as several colliding sessions.
 *
 * Silent when: not a git repo, not a GSD-T project, already inside a worktree,
 * resuming a session, or switched off in
 * .gsd-t/auto-worktree-config.json {"enabled": false}.
 *
 * When anything needed to pick a worktree cannot be read, this stops: it prints
 * what failed and leaves the session in the main tree. It never moves a session
 * on a guess, and it never continues past a failure with a partial answer.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function main() {
  let input = "";
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    let data;
    try {
      data = JSON.parse(input);
    } catch (e) {
      // No payload means no cwd and no session source to act on. There is no
      // decision to make and nothing to warn about, so stay quiet.
      process.exit(0);
    }
    route(data);
  };

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => { input += c; });
  process.stdin.on("end", finish);
  process.stdin.on("error", finish);
  const t = setTimeout(finish, 8000);
  if (t.unref) t.unref();
}

// Hand the model a note and stop. Everything this script says to the model goes
// through here, because `additionalContext` is the only channel it reads.
function tell(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: message,
    },
  }));
  process.exit(0);
}

// Say why this session is staying put, and stop. Used for every condition where
// the right worktree cannot be determined.
function halt(message) {
  tell(`[GSD-T WORKTREE] ${message} Staying in the current directory.`);
}

function route(data) {
  const cwd = typeof data.cwd === "string" && data.cwd ? data.cwd : process.cwd();

  // Only a brand-new session needs a home. Every other start ("resume",
  // "clear", "compact", "fork") is a session that already has one and is
  // carrying work in it — re-routing those would strand that work.
  if (data.source !== "startup") process.exit(0);

  if (!isGitRepo(cwd)) process.exit(0);
  if (isInsideWorktree(cwd)) process.exit(0);
  if (!fs.existsSync(path.join(cwd, ".gsd-t"))) process.exit(0);
  if (isSwitchedOff(cwd)) process.exit(0);

  const project = path.basename(cwd);
  const home = path.join(process.env.HOME, "Worktrees", project);
  const occupied = interactiveClaudeDirs();

  const free = worktreesNewestFirst(home).find((w) => !occupied.has(w.path));
  const target = free || create(cwd, home);

  const verb = free ? "Reusing" : "Created";
  tell(
    `[GSD-T WORKTREE] This session belongs in its own worktree, not the main ` +
    `project folder. ${verb} ${target.path} (branch ${target.branch}).\n\n` +
    `Before any other work, run this and stay there for the rest of the session:\n` +
    `  cd "${target.path}"\n\n` +
    `Do not edit files in ${cwd}.`
  );
}

function isSwitchedOff(cwd) {
  const p = path.join(cwd, ".gsd-t", "auto-worktree-config.json");
  if (!fs.existsSync(p)) return false;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    // Treating an unreadable config as either "on" or "off" is a guess.
    halt(`${p} is not valid JSON (${e.message}) — fix or delete it.`);
  }
  return cfg.enabled === false;
}

// Not being in a git repo is the normal case for most directories, not a failure.
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
// be inspected stops the run: skipping it could hide the very worktree this
// session belongs in, and creating a second one for the same work is the
// collision being prevented.
function worktreesNewestFirst(home) {
  if (!fs.existsSync(home)) return [];
  const out = [];
  for (const name of fs.readdirSync(home)) {
    const p = path.join(home, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch (e) {
      halt(`Cannot inspect ${p} (${e.message}), so an existing worktree can't be ruled out.`);
    }
    if (!st.isDirectory()) continue;
    if (!fs.existsSync(path.join(p, ".git"))) continue;
    out.push({ path: p, branch: branchOf(p, name), mtime: st.mtimeMs });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

// The branch name appears in the message and decides nothing. A worktree on a
// detached HEAD has no branch to report, so the folder name identifies it.
function branchOf(dir, folderName) {
  const r = spawnSync("git", ["branch", "--show-current"], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) return folderName;
  return String(r.stdout).trim() || folderName;
}

function create(repo, home) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const branch = `session-${stamp}`;
  const dest = path.join(home, branch);

  fs.mkdirSync(home, { recursive: true });

  const r = spawnSync("git", ["worktree", "add", dest, "-b", branch], {
    cwd: repo, encoding: "utf8",
  });

  // git writes progress to stderr on success, so the exit code and the folder
  // existing are what actually prove it worked.
  if (r.status !== 0 || !fs.existsSync(dest)) {
    halt(
      `Could not create a worktree: ${String(r.stderr).trim() || "unknown error"}. ` +
      `Fix the cause, or switch this off with ` +
      `.gsd-t/auto-worktree-config.json {"enabled": false}.`
    );
  }
  return { path: dest, branch };
}

/**
 * Directories that an interactive claude currently has open.
 *
 * `ps` prints a terminal name for processes attached to one and `??` for those
 * that are not. Subagents and `claude -p` runs are not, so filtering on that
 * column leaves only real terminal sessions.
 */
function interactiveClaudeDirs() {
  const ps = spawnSync("ps", ["-eo", "pid=,tty=,comm="], { encoding: "utf8" });
  if (ps.status !== 0) {
    halt(
      `Cannot read the process list (${String(ps.stderr).trim() || "ps failed"}), ` +
      `so a worktree already in use can't be ruled out.`
    );
  }

  const dirs = new Set();
  const mine = String(process.pid);
  for (const line of String(ps.stdout).split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const [, pid, tty, comm] = m;
    if (tty === "??" || tty === "?") continue;     // no terminal — not a session
    if (!/claude/i.test(comm)) continue;
    if (pid === mine) continue;
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
