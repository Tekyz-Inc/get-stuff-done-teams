#!/usr/bin/env node
/**
 * gsd-t-concise-hook.js
 *
 * M107-D2 — Stop hook. Sends a long reply to a fresh Claude for a shorter
 * rewrite, then blocks the stop so the short version is what David reads.
 *
 * [RULE] concise-hook-never-loops
 * [RULE] concise-hook-fails-open-on-rewrite-failure
 *
 * A Stop hook cannot edit a reply that is already written. It can only block
 * the stop and hand back an instruction. So: read the reply from the
 * transcript, get the short version, and block once with "replace your last
 * reply with this". The model then emits the short version and stops.
 *
 * ─── Stdin (Claude Code Stop payload) ───────────────────────────────────────
 *   { "transcript_path": "...", "stop_hook_active": true|false, "cwd": "..." }
 *
 * ─── Loop guard ─────────────────────────────────────────────────────────────
 *   stop_hook_active === true means this Stop is already a re-entry from our
 *   own block. Exit 0 immediately. One rewrite per turn, never two.
 *
 * ─── Fail-open, deliberately ────────────────────────────────────────────────
 *   Unlike the fallback guard, this one ALLOWS on failure. It governs how a
 *   reply READS, not whether it is true. A broken rewriter must never gag a
 *   correct answer — showing a long reply is a poor outcome, showing none is a
 *   wrong one. The rewriter itself returns the original when it cannot do
 *   better, so no content is ever lost.
 *
 * Zero dependencies.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_SKIP_UNDER = 60; // words

function allow() { process.exit(0); }

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: "block", reason }) + "\n");
  process.exit(0);
}

/** Only read transcripts from the Claude projects directory. */
function safeTranscriptPath(p) {
  if (typeof p !== "string" || !p) return null;
  if (!path.isAbsolute(p)) return null;
  const home = process.env.HOME || os.homedir();
  if (!home) return null;
  const root = path.resolve(home, ".claude", "projects") + path.sep;
  const resolved = path.resolve(p);
  return resolved.startsWith(root) ? resolved : null;
}

function readTail(filePath, bytes) {
  let fd = -1;
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile() || st.size === 0) return "";
    const want = Math.min(bytes, st.size);
    const start = st.size - want;
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(want);
    fs.readSync(fd, buf, 0, want, start);
    let s = buf.toString("utf8");
    if (start > 0) {
      const nl = s.indexOf("\n");
      if (nl >= 0) s = s.slice(nl + 1);
    }
    return s;
  } catch (_) {
    return "";
  } finally {
    if (fd >= 0) { try { fs.closeSync(fd); } catch (_) { /* already closed */ } }
  }
}

/**
 * Pull the last assistant turn's visible text from the transcript.
 * Returns { text, toolOnly } — a tool-only turn has no prose to shorten.
 */
function lastAssistantText(transcriptPath) {
  const tail = readTail(transcriptPath, 512 * 1024);
  if (!tail) return null;
  const lines = tail.split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let rec;
    try { rec = JSON.parse(lines[i]); } catch (_) { continue; }
    const msg = rec && rec.message;
    if (!msg || msg.role !== "assistant") continue;
    const content = Array.isArray(msg.content) ? msg.content : [];
    const text = content.filter((b) => b && b.type === "text")
      .map((b) => b.text || "").join("\n").trim();
    const hasTool = content.some((b) => b && b.type === "tool_use");
    return { text, toolOnly: !text && hasTool };
  }
  return null;
}

function wordCount(s) {
  return (String(s).trim().match(/\S+/g) || []).length;
}

function readConfig(projectDir) {
  const p = path.join(projectDir, ".gsd-t", "concise.json");
  if (!fs.existsSync(p)) return { enabled: true, skipUnder: DEFAULT_SKIP_UNDER };
  try {
    const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
    return {
      enabled: cfg.enabled !== false,
      skipUnder: Number.isFinite(cfg.skipUnder) ? cfg.skipUnder : DEFAULT_SKIP_UNDER,
    };
  } catch (_) {
    return { enabled: true, skipUnder: DEFAULT_SKIP_UNDER };
  }
}

/**
 * Locate the rewriter. Every project carries its own copy; if it does not, the
 * install is broken and the SessionStart heal hook repairs it. Two exact
 * locations, no hunting.
 */
function findRewriter(projectDir) {
  const inProject = path.join(projectDir, "bin", "gsd-t-concise-rewrite.cjs");
  if (fs.existsSync(inProject)) return inProject;
  const inPackage = path.join(__dirname, "..", "bin", "gsd-t-concise-rewrite.cjs");
  if (fs.existsSync(inPackage)) return inPackage;
  return null; // the caller lets the reply through — see the note on main()
}

function main() {
  let input = "";
  let done = false;

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => { input += c; });

  const finish = () => {
    if (done) return;
    done = true;

    let data;
    try { data = JSON.parse(input); } catch (_) { return allow(); }
    if (!data || typeof data !== "object") return allow();

    // One rewrite per turn. This Stop is our own re-entry — let it through.
    if (data.stop_hook_active === true) return allow();

    const cwd = (typeof data.cwd === "string" && data.cwd) ? data.cwd : process.cwd();
    const cfg = readConfig(cwd);
    if (!cfg.enabled) return allow();

    const tPath = safeTranscriptPath(data.transcript_path);
    if (!tPath) return allow();

    const last = lastAssistantText(tPath);
    if (!last || last.toolOnly || !last.text) return allow();
    if (wordCount(last.text) < cfg.skipUnder) return allow();

    const rewriter = findRewriter(cwd);
    if (!rewriter) return allow();

    const run = spawnSync(process.execPath,
      [rewriter, "--text", last.text, "--project", cwd, "--json"],
      { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });

    if (run.error || !run.stdout) return allow();

    let result;
    try { result = JSON.parse(run.stdout); } catch (_) { return allow(); }

    // The rewriter returns the original when it cannot do better. Nothing was
    // lost, so there is nothing to replace.
    if (!result.ok || !result.text || result.skipped) return allow();
    if (result.text.trim() === last.text.trim()) return allow();

    const saved = (result.words || 0) - (result.wordsAfter || 0);
    if (saved < 15) return allow(); // not worth the extra turn

    block(
      "Your last reply was longer than it needed to be. Replace it with this " +
      "shorter version, exactly as written, and add nothing:\n\n" +
      result.text
    );
  };

  process.stdin.on("end", finish);
  process.stdin.on("error", finish);
  const wd = setTimeout(finish, 70000);
  if (wd.unref) wd.unref();
}

if (require.main === module) main();

module.exports = { lastAssistantText, wordCount, readConfig, findRewriter, safeTranscriptPath };
