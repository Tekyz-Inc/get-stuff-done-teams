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
 * Four modes:
 *
 *     (no flags)        pick a worktree, creating one if none is free
 *     --suggest         say what WOULD happen, create nothing. Prints
 *                       "reuse:<path>", "create", or nothing at all.
 *     --name <name>     go to the worktree on a branch called <name>, creating
 *                       it if it isn't there yet
 *     --list            list this project's worktrees, one per line, as
 *                       "<free|busy>\t<path>". Creates nothing.
 *
 * --name naming a worktree that already exists ENTERS it. Refusing that was the
 * old behaviour and it refused the ordinary case — your own worktree, from
 * yesterday, with nobody in it — leaving no way back in except quitting and
 * starting a session by hand, which is the thing this script exists to spare
 * you. What the refusal genuinely protected is narrower: another live session
 * sitting in that folder, or a directory git does not know as this branch's
 * worktree. Both still stop.
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
  const wantsList = argv.includes("--list");
  const nameAt = argv.indexOf("--name");
  const wanted = nameAt >= 0 ? argv[nameAt + 1] : null;

  if (nameAt >= 0 && !wanted) fail("--name needs a branch name after it.");

  const cwd = process.cwd();

  if (!isGitRepo(cwd)) stay();
  if (isInsideWorktree(cwd)) stay();
  if (!fs.existsSync(path.join(cwd, ".gsd-t"))) stay();
  if (isSwitchedOff(cwd)) stay();

  const home = path.join(process.env.HOME, "Worktrees", path.basename(cwd));

  // Report what is there so the prompt can show it before a name is typed.
  // Nothing here is a path for the shell to cd into, so each line is labelled;
  // the caller reads this one deliberately rather than as a bare directory.
  if (wantsList) {
    const busy = interactiveClaudeDirs();
    for (const w of worktreesNewestFirst(home)) {
      process.stdout.write(`${busy.has(w.path) ? "busy" : "free"}\t${w.path}\n`);
    }
    return;
  }

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
    process.stdout.write(enterOrCreate(cwd, home, branchNameFrom(wanted)).path + "\n");
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
function enterOrCreate(repo, home, branch) {
  if (!branch) {
    fail("A worktree needs a branch name — run with --name <name>.");
  }
  const dest = path.join(home, branch);

  // Already there: go in, provided it is genuinely this branch's worktree and
  // nobody is working in it. Both conditions are checked before entering, since
  // each is a way of landing on top of somebody's uncommitted work.
  if (fs.existsSync(dest)) {
    if (!isWorktreeOf(repo, dest, branch)) {
      fail(
        `${dest} exists but git does not know it as this repo's worktree for ` +
        `"${branch}". Working there would sit on top of whatever is in it — ` +
        `move it aside, or pick a different name.`
      );
    }
    if (interactiveClaudeDirs().has(dest)) {
      fail(
        `Another session is working in ${dest} right now. Two sessions in one ` +
        `folder interleave each other's uncommitted work — pick a different name.`
      );
    }
    return { path: dest };
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
 * Does THIS repo know `dest` as its worktree for `branch`?
 *
 * Asked of the main repo rather than of the directory: a folder can be a
 * perfectly valid git checkout of something else entirely, and it would answer
 * "yes, I am a worktree on that branch" while belonging to another project.
 * The repo's own register is the only place that settles ownership.
 *
 * A git that cannot answer is a stop, not a "probably fine" — the unanswered
 * question is precisely whether somebody's work is already there.
 */
function isWorktreeOf(repo, dest, branch) {
  const r = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd: repo, encoding: "utf8", timeout: 10000,
  });
  if (r.status !== 0) {
    fail(
      `Cannot read this repo's worktree list ` +
      `(${String(r.stderr).trim() || "git failed"}), so it can't be confirmed ` +
      `that ${dest} is yours to work in.`
    );
  }

  // Entries are blank-line separated; the lines that matter are "worktree
  // <path>" and "branch refs/heads/<name>".
  const target = realPath(dest);
  for (const block of String(r.stdout).split(/\n\s*\n/)) {
    const at = block.match(/^worktree (.+)$/m);
    if (!at) continue;
    if (realPath(at[1].trim()) !== target) continue;
    const on = block.match(/^branch refs\/heads\/(.+)$/m);
    return Boolean(on) && on[1].trim() === branch;
  }
  return false;
}

/**
 * The path with every symlink followed, so two spellings of one directory
 * compare equal. git reports resolved paths; ours are as typed, and on macOS
 * /var is a symlink to /private/var — so the same folder arrives under two
 * names and a plain string compare calls them different places.
 *
 * A path that cannot be resolved stops the run. The comparison it feeds decides
 * whether a directory is safe to work in, and an unresolvable path leaves that
 * unanswered rather than answered "no".
 */
function realPath(p) {
  try {
    return fs.realpathSync(p);
  } catch (e) {
    fail(`Cannot resolve ${p} (${e.message}), so it can't be told apart from another directory.`);
  }
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
