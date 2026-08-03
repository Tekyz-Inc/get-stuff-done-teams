"use strict";

// M105 — the worktree guard: stop two sessions editing the SAME working tree.
//
// Origin: David ran several sessions on binvoice and told each to use its own
// worktree. Three did. One worked directly in the main project folder, and its
// uncommitted work interleaved with another session's — ~12 files spanning four
// different areas, on one branch, neither side able to merge without dragging in
// or losing the other's half-finished milestone. The instruction was given and
// nothing enforced it.
//
// The detection signal is the per-session heartbeat file that already exists
// (`.gsd-t/heartbeat-<sid>.jsonl`, written by the SessionStart/Stop/SessionEnd
// hooks INSIDE the tree the session works in). Its location is the claim; its
// mtime is liveness. No new bookkeeping.
//
// The liveness WINDOW is the load-bearing detail. While designing this, a 2-hour
// window read three long-closed sessions as live and would have fired on a user
// working alone — the exact false positive that teaches someone to disable a
// guard. The window is 5 minutes: a working session writes constantly.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const GUARD = path.join(ROOT, "scripts", "gsd-t-worktree-guard.js");

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function mkRepo(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `m105-${label}-`));
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "t@example.com"], dir);
  git(["config", "user.name", "t"], dir);
  fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
  fs.writeFileSync(path.join(dir, "seed.txt"), "seed\n");
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "seed"], dir);
  return dir;
}

// Write a heartbeat file with a controlled age (minutes ago).
function heartbeat(root, sid, minutesAgo) {
  const f = path.join(root, ".gsd-t", `heartbeat-${sid}.jsonl`);
  fs.writeFileSync(f, JSON.stringify({ sid, evt: "session_start" }) + "\n");
  if (minutesAgo > 0) {
    const when = new Date(Date.now() - minutesAgo * 60 * 1000);
    fs.utimesSync(f, when, when);
  }
  return f;
}

// Run the guard as the harness does: hook JSON on stdin, decision JSON on stdout.
function runGuard(cwd, sessionId) {
  const r = spawnSync("node", [GUARD], {
    input: JSON.stringify({ cwd, session_id: sessionId, tool_name: "Edit" }),
    encoding: "utf8",
  });
  const out = (r.stdout || "").trim();
  if (!out) return { blocked: false, reason: null, raw: "" };
  let parsed;
  try { parsed = JSON.parse(out); } catch (_) { return { blocked: false, reason: null, raw: out }; }
  const d = parsed.hookSpecificOutput || {};
  return { blocked: d.permissionDecision === "deny", reason: d.permissionDecisionReason || null, raw: out };
}

test("M105: a session ALONE in the main tree is not blocked", () => {
  // David works in main by himself regularly. A guard that fires here would be
  // turned off, and then it protects nothing.
  const repo = mkRepo("alone");
  try {
    heartbeat(repo, "self", 0);
    const r = runGuard(repo, "self");
    assert.equal(r.blocked, false, `a lone session must not be blocked (got: ${r.raw})`);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("M105: a SECOND live session in the main tree IS blocked", () => {
  const repo = mkRepo("collide");
  try {
    heartbeat(repo, "self", 0);
    heartbeat(repo, "other", 0); // another session, writing right now
    const r = runGuard(repo, "self");
    assert.equal(r.blocked, true, "a real collision must block");
    assert.match(r.reason, /same folder/i, "the reason must say what is wrong");
    assert.match(r.reason, /git worktree add/, "the reason must give the command to run");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("M105: a STALE heartbeat does not count as a live session", () => {
  // The false positive that would have shipped: three sessions closed 96-111
  // minutes earlier read as "live" under a 2-hour window.
  const repo = mkRepo("stale");
  try {
    heartbeat(repo, "self", 0);
    heartbeat(repo, "closed-a", 96);
    heartbeat(repo, "closed-b", 111);
    const r = runGuard(repo, "self");
    assert.equal(r.blocked, false, `closed sessions must not block (got: ${r.raw})`);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("M105: a heartbeat just outside the window is stale; just inside is live", () => {
  const repo = mkRepo("boundary");
  try {
    heartbeat(repo, "self", 0);
    heartbeat(repo, "other", 6); // > 5 min window
    assert.equal(runGuard(repo, "self").blocked, false, "6 minutes silent = not live");

    heartbeat(repo, "other", 1); // < 5 min window
    assert.equal(runGuard(repo, "self").blocked, true, "1 minute ago = live");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("M105: a session INSIDE a worktree is never blocked", () => {
  // It is already isolated — that is the state the guard exists to produce.
  const repo = mkRepo("wt");
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), "m105-wt-linked-"));
  fs.rmSync(wt, { recursive: true, force: true }); // git wants a non-existent path
  try {
    git(["worktree", "add", "-q", "-b", "feature", wt], repo);
    fs.mkdirSync(path.join(wt, ".gsd-t"), { recursive: true });
    heartbeat(repo, "other", 0); // main tree busy
    heartbeat(wt, "self", 0);
    const r = runGuard(wt, "self");
    assert.equal(r.blocked, false, `a worktree session must never be blocked (got: ${r.raw})`);
  } finally {
    try { git(["worktree", "remove", "--force", wt], repo); } catch (_) { /* best effort */ }
    fs.rmSync(wt, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("M105: the guard can be turned off per project", () => {
  const repo = mkRepo("optout");
  try {
    heartbeat(repo, "self", 0);
    heartbeat(repo, "other", 0);
    assert.equal(runGuard(repo, "self").blocked, true, "blocks by default");

    fs.writeFileSync(
      path.join(repo, ".gsd-t", "worktree-guard-config.json"),
      JSON.stringify({ enabled: false })
    );
    assert.equal(runGuard(repo, "self").blocked, false, "opt-out is honoured");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("M105: an invalid opt-out config leaves the guard ON (no silent relax)", () => {
  const repo = mkRepo("badcfg");
  try {
    heartbeat(repo, "self", 0);
    heartbeat(repo, "other", 0);
    fs.writeFileSync(path.join(repo, ".gsd-t", "worktree-guard-config.json"), "{ not json");
    assert.equal(runGuard(repo, "self").blocked, true, "a broken config must not disable the guard");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("M105: outside a git repo the guard is silent", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m105-nogit-"));
  try {
    assert.equal(runGuard(dir, "self").blocked, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("M105: the guard FAILS OPEN — a broken environment never blocks an edit", () => {
  // It detects a collision; it does not gate correctness. Blocking edits because
  // the guard itself failed would cost real work for zero safety.
  const r = spawnSync("node", [GUARD], { input: "not json at all", encoding: "utf8" });
  assert.equal(r.status, 0, "must exit 0 on garbage input");
  assert.equal((r.stdout || "").trim(), "", "must emit no deny decision");
});

// ─── Wiring ──────────────────────────────────────────────────────────────────
//
// A guard that exists but was never registered is the failure class that has hit
// this repo four times (the schema-id gate, the research gate, the graph store
// resolver, the pseudocode style gate — each shipped with its caller and without
// itself). These assert the guard is actually reachable.

test("M105 wiring: the guard is registered as a Write|Edit PreToolUse hook", () => {
  const cli = fs.readFileSync(path.join(ROOT, "bin", "gsd-t.js"), "utf8");
  assert.match(cli, /WORKTREE_HOOK_MARKER = "gsd-t-worktree-guard"/, "marker must be declared");
  assert.match(
    cli,
    /WORKTREE_HOOK_COMMAND[\s\S]{0,300}scripts\/gsd-t-worktree-guard\.js/,
    "the command must point at the shipped script"
  );
  assert.match(cli, /configureWorktreeGuardHook\(SETTINGS_JSON\)/, "install must CALL the registrar");
});

test("M105 wiring: uninstall removes the guard hook", () => {
  const cli = fs.readFileSync(path.join(ROOT, "bin", "gsd-t.js"), "utf8");
  assert.match(
    cli,
    /preMarkers = \[ARCHITECT_HOOK_MARKER, WORKTREE_HOOK_MARKER\]/,
    "uninstall must strip the guard, not orphan it in settings.json"
  );
});

test("M105 wiring: the script ships in the published package", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const files = pkg.files || [];
  assert.ok(
    files.some((f) => f === "scripts" || f.startsWith("scripts/")),
    "package.json `files` must include scripts/ or the hook is absent after install"
  );
  assert.ok(
    fs.existsSync(path.join(ROOT, "scripts", "gsd-t-worktree-guard.js")),
    "the guard script must exist at the path the hook command references"
  );
});

test("M105: the block message names the branch-derived worktree path", () => {
  const repo = mkRepo("msg");
  try {
    git(["checkout", "-q", "-b", "ux-redesign"], repo);
    heartbeat(repo, "self", 0);
    heartbeat(repo, "other", 0);
    const r = runGuard(repo, "self");
    assert.equal(r.blocked, true);
    assert.match(r.reason, /Worktrees\//, "must point at the ~/Worktrees home");
    assert.match(r.reason, /ux-redesign/, "must derive the worktree name from the branch");
    assert.match(r.reason, /git stash push -u/, "must tell the user how to carry existing work across");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
