#!/usr/bin/env node
"use strict";

/**
 * gsd-t-worktree-guard.js — PreToolUse(Write|Edit)
 *
 * Stops two sessions from editing the SAME working tree at the same time.
 *
 * The problem it solves: a session opened in the main project folder edits files
 * there; a second session opens in the same folder and does the same. Their
 * uncommitted work interleaves in one tree, on one branch, and neither can commit
 * or merge without dragging in the other's half-finished milestone. Telling each
 * session "use a worktree" does not prevent it — nothing enforces the instruction.
 *
 * How it detects a live session, and why: every GSD-T session writes
 * `.gsd-t/heartbeat-<session-id>.jsonl` INSIDE the tree it is working in, via the
 * SessionStart/Stop/SessionEnd hooks. The file's location IS the claim (a session
 * in a worktree writes into that worktree's own .gsd-t/), and its modification
 * time is the liveness signal. No new bookkeeping — the file already exists.
 *
 * Liveness is a SHORT window (default 5 min). A working session writes constantly;
 * one silent for longer is idle or closed. This matters more than it looks: a
 * 2-hour window reads three closed sessions as live and fires on a user working
 * alone, which trains them to disable the guard.
 *
 * Behaviour:
 *   - alone in any tree               → silent, no guard (working in main alone is allowed)
 *   - main tree, another session live → BLOCK with the exact worktree command to run
 *   - inside a worktree               → silent (already isolated)
 *
 * Fail-open by design: a guard that cannot read its inputs must not block edits.
 * It is a collision detector, not a correctness gate — a crash here would stop
 * legitimate work for no safety benefit.
 *
 * Opt out per project: .gsd-t/worktree-guard-config.json {"enabled": false}
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const LIVE_WINDOW_MS = 5 * 60 * 1000;

// Returns null when the hook payload cannot be read or parsed.
//
// This must NOT fall back to an empty object: `cwd` would then default to
// process.cwd() and the guard would judge whatever directory it happened to be
// launched from — deciding about the wrong repository entirely. Caught by the
// fail-open test, which saw a deny emitted for garbage input.
// Unreadable input means NO DECISION, never a decision about the wrong tree.
function readHookInput() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    if (!raw || !raw.trim()) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch (_) {
    return null;
  }
}

// The MAIN working tree is the one whose .git is a directory. A linked worktree's
// .git is a FILE containing a gitdir: pointer — that is the distinction git itself
// uses, so it needs no parsing of `git worktree list` output.
function isMainWorktree(root) {
  try {
    return fs.statSync(path.join(root, ".git")).isDirectory();
  } catch (_) {
    return false;
  }
}

function guardEnabled(root) {
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(root, ".gsd-t", "worktree-guard-config.json"), "utf8")
    );
    return cfg.enabled !== false;
  } catch (_) {
    return true; // absent/invalid config → guard on
  }
}

// Sessions whose heartbeat is fresh, excluding this one.
function liveSessions(root, selfSid, now) {
  const dir = path.join(root, ".gsd-t");
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
  const live = [];
  for (const f of names) {
    if (!f.startsWith("heartbeat-") || !f.endsWith(".jsonl")) continue;
    const sid = f.slice("heartbeat-".length, -".jsonl".length);
    if (selfSid && sid === selfSid) continue;
    try {
      const age = now - fs.statSync(path.join(dir, f)).mtimeMs;
      if (age < LIVE_WINDOW_MS) live.push({ sid, ageMs: age });
    } catch (_) { /* unreadable → not evidence of a live session */ }
  }
  return live.sort((a, b) => a.ageMs - b.ageMs);
}

function suggestWorktreeName(branch) {
  const base = (branch || "work").replace(/[^A-Za-z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return base || "work";
}

function main() {
  const hook = readHookInput();
  if (!hook) return; // no readable payload → no decision (see readHookInput)
  const cwd = hook.cwd;
  if (!cwd || typeof cwd !== "string") return; // no stated directory → nothing to judge

  const root = git(["rev-parse", "--show-toplevel"], cwd);
  if (!root) return; // not a git repo → nothing to guard

  if (!isMainWorktree(root)) return; // already isolated in a worktree
  if (!guardEnabled(root)) return;

  const selfSid = hook.session_id || hook.sessionId || null;
  const others = liveSessions(root, selfSid, Date.now());
  if (others.length === 0) return; // alone → working in main is allowed

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], root) || "HEAD";
  const project = path.basename(root);
  const name = suggestWorktreeName(branch);
  const wt = `${process.env.HOME}/Worktrees/${project}/${name}`;
  const mins = Math.max(1, Math.round(others[0].ageMs / 60000));
  const plural = others.length === 1 ? "session" : "sessions";

  const reason = [
    `Another GSD-T ${plural} (${others.length}) is working in this same folder right now — the most recent wrote ${mins} minute(s) ago.`,
    ``,
    `Editing here means two sessions share one working tree and one branch. Their uncommitted changes interleave, and neither can commit or merge without dragging in the other's half-finished work.`,
    ``,
    `Move to your own worktree first:`,
    ``,
    `  mkdir -p ${process.env.HOME}/Worktrees/${project}`,
    `  git worktree add ${wt} -b ${name}-$(date +%H%M)`,
    `  cd ${wt}`,
    ``,
    `If you already have uncommitted work in this folder, carry it across:`,
    ``,
    `  git stash push -u -m "moving to a worktree"`,
    `  git worktree add ${wt} -b ${name}-$(date +%H%M)`,
    `  cd ${wt} && git stash pop`,
    ``,
    `Working alone in the main folder is fine — this only fires when a second session is live.`,
    `To turn it off for this project: .gsd-t/worktree-guard-config.json {"enabled": false}`,
  ].join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }) + "\n"
  );
}

try {
  main();
} catch (_) {
  // Fail open — never block an edit because the guard itself broke.
}
