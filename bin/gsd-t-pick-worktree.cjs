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
 * Three modes:
 *
 *     (no flags)        pick a worktree, creating one if none is free
 *     --suggest         say what WOULD happen, create nothing. Prints
 *                       "reuse:<path>", "create", or nothing at all.
 *     --name <name>     create a worktree on a branch called <name>
 *
 * --suggest exists so the shell can ask for a name BEFORE anything is created.
 * A branch named at session start, before the work is known, can only be a
 * timestamp — and a timestamp describes nothing, which is how this repo
 * accumulated twenty `session-2026-08-08T23-10-16` branches. The person
 * launching the session knows what they are about to do; the machine does not,
 * so it asks.
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
const { isLinkedWorktree } = require("./gsd-t-worktree-detect.cjs");

function stay() {           // nothing to change — the caller keeps its directory
  process.exit(0);
}

function fail(message) {    // could not decide — say why, change nothing
  process.stderr.write(`[GSD-T WORKTREE] ${message}\n`);
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  const suggest = argv.includes("--suggest");
  const nameAt = argv.indexOf("--name");
  const wanted = nameAt >= 0 ? argv[nameAt + 1] : null;

  if (nameAt >= 0 && !wanted) fail("--name needs a branch name after it.");

  const cwd = process.cwd();

  if (!isGitRepo(cwd)) stay();
  if (isInsideWorktree(cwd)) stay();
  if (!fs.existsSync(path.join(cwd, ".gsd-t"))) stay();
  if (isSwitchedOff(cwd)) stay();

  const home = path.join(process.env.HOME, "Worktrees", path.basename(cwd));

  if (wanted) {
    // Asking for the repo's own default branch means "work here, in the main
    // checkout" — not "make a worktree called main", which git refuses anyway
    // because that branch is already checked out. Rare, but it is a real
    // choice, and the only way to express it is to name it.
    if (isDefaultBranch(cwd, branchNameFrom(wanted))) {
      // Said out loud on stderr: every other path here is silent, but this one
      // is a deliberate choice to work somewhere the house rules steer away
      // from, and silence would read as "the name was ignored". stdout stays
      // empty because the shell reads it as the directory to move to.
      process.stderr.write(
        `[GSD-T WORKTREE] staying in the main checkout on ${branchNameFrom(wanted)} — ` +
        `no worktree created.\n`
      );
      stay();
    }
    process.stdout.write(create(cwd, home, branchNameFrom(wanted)).path + "\n");
    return;
  }

  const occupied = interactiveClaudeDirs();
  const free = worktreesNewestFirst(home).find((w) => !occupied.has(w.path));

  if (suggest) {
    // Report only. Creating here would defeat the point of asking first.
    process.stdout.write(free ? `reuse:${free.path}\n` : "create\n");
    return;
  }

  // No name to work with: reuse if something is free, otherwise say nothing and
  // let the caller stay put. Inventing a name here is what --suggest exists to
  // prevent.
  if (!free) stay();
  process.stdout.write(free.path + "\n");
}

/**
 * Is this the repo's own default branch — the one the main checkout sits on?
 *
 * Asked of git rather than matched against a list: a repo may use `master`,
 * `trunk` or anything else, and a hardcoded list would send those repos into a
 * worktree named after their own main branch. The branch currently checked out
 * in the main tree IS the answer, since that is the thing being opted into.
 *
 * A repo git cannot answer for is not the default-branch case — it falls
 * through to the ordinary worktree path, which fails loudly on its own if git
 * is genuinely broken.
 */
function isDefaultBranch(repo, name) {
  const r = spawnSync("git", ["branch", "--show-current"], {
    cwd: repo, encoding: "utf8", timeout: 10000,
  });
  if (r.status !== 0) return false;
  // Both sides lowercased: a branch name typed at a prompt is a value the user
  // types, and "Main" must mean main.
  return String(r.stdout || "").trim().toLowerCase() === String(name).toLowerCase();
}

// Turn what the user typed into a name git will accept, without silently
// becoming a different branch than they asked for.
function branchNameFrom(input) {
  const clean = String(input).trim().toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")   // spaces and punctuation → dashes
    .replace(/^[-.\/]+|[-.\/]+$/g, "") // git rejects these at either end
    .replace(/-{2,}/g, "-")
    .slice(0, 60);

  if (!clean) fail(`"${input}" leaves nothing usable as a branch name.`);
  return clean;
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

// Shared with branch-guard so the two cannot drift apart — see
// bin/gsd-t-worktree-detect.cjs for why git's own answer beats inferring from
// whether .git is a file or a directory.
function isInsideWorktree(dir) {
  return isLinkedWorktree(dir);
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

// A branch is only ever created with a name someone chose. There is no
// generated default: naming a branch before the work is known produces a
// timestamp, and a timestamp describes nothing — which is how this repo
// collected twenty `session-2026-08-08T23-10-16` branches. Callers with no name
// get "create" from --suggest and must come back with --name.
function create(repo, home, branch) {
  if (!branch) {
    fail("A worktree needs a branch name — run with --name <name>.");
  }
  const dest = path.join(home, branch);

  // Reusing a directory that already holds a different branch's work would put
  // this session on top of it. Say so instead.
  if (fs.existsSync(dest)) {
    fail(`${dest} already exists. Pick a different name, or start there directly.`);
  }

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

  provisionNewWorktree(repo, dest);

  return { path: dest };
}

/**
 * A worktree holds only what git tracks, so the secrets and the installed
 * dependencies stay behind and the new folder is born unable to run. Carry the
 * local config across and rebuild the dependencies.
 *
 * Notes go to stderr: stdout carries the chosen path and nothing else, because
 * the shell reads it with `d=$(gsd-t-pick-worktree)`.
 *
 * A worktree that came up short says so rather than looking ready.
 */
function provisionNewWorktree(repo, dest) {
  const { provision } = require("./gsd-t-worktree-provision.cjs");

  let result;
  try {
    result = provision(repo, dest);
  } catch (err) {
    fail(
      `The worktree was created at ${dest} but could not be set up ` +
      `(${(err && err.message) || err}). It is missing its local config and ` +
      `dependencies, so treat it as unfinished.`
    );
    return;
  }

  const { config, deps } = result;

  if (config.carried.length > 0) {
    process.stderr.write(`Carried ${config.carried.length} config file(s): ${config.carried.join(", ")}\n`);
  }
  for (const p of config.problems) {
    process.stderr.write(`Could not carry ${p}\n`);
  }
  if (deps.ran || deps.manager) {
    process.stderr.write(`${deps.msg}\n`);
  }

  // Missing dependencies are not cosmetic — every test in the new tree fails on
  // a missing module, which reads as broken code rather than a setup gap.
  if (deps.ok === false) {
    fail(
      `The worktree was created at ${dest} but its dependencies did not install ` +
      `(${deps.msg}). Install them there before working, or the tests will fail ` +
      `for reasons that have nothing to do with your changes.`
    );
  }
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
