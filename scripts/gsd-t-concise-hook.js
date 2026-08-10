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
/**
 * Did the user actually type this, or is it a tool result wearing their role?
 *
 * The transcript records a tool's output as a "user" message whose content is
 * tool_result blocks. Only a message with real text is the person speaking.
 */
function _isRealUserMessage(msg) {
  const content = msg.content;
  if (typeof content === "string") return content.trim().length > 0;
  if (!Array.isArray(content)) return false;
  return content.some(
    (b) => b && b.type === "text" && typeof b.text === "string" && b.text.trim().length > 0
  );
}

/**
 * The prose of the reply that just finished.
 *
 * A turn does not end with the words the user reads — it ends with whatever ran
 * last, and that is usually a tool call. Stopping at the FIRST assistant record
 * therefore found `toolOnly` and gave up, every time: the rewriter never ran
 * once in the two days after it shipped. So walk back through the tool calls to
 * the prose, and join every text block in the turn, since a reply is often
 * written in pieces around the tools it uses.
 *
 * The walk stops at the user's own message. Past that lies the PREVIOUS turn,
 * and rewriting a reply the user has already read would replace the wrong thing.
 */
function lastAssistantText(transcriptPath) {
  const tail = readTail(transcriptPath, 512 * 1024);
  if (!tail) return null;
  const lines = tail.split("\n").filter(Boolean);

  const pieces = [];
  let sawAssistant = false;

  for (let i = lines.length - 1; i >= 0; i--) {
    let rec;
    try { rec = JSON.parse(lines[i]); } catch (_) { continue; }
    const msg = rec && rec.message;
    if (!msg) continue;

    // The start of this turn. Anything earlier belongs to a turn already read.
    //
    // A tool RESULT is also recorded with role "user", so the boundary is a user
    // message carrying real text — treating every "user" record as the boundary
    // stops at the first tool result and finds nothing at all.
    if (msg.role === "user") {
      if (_isRealUserMessage(msg)) break;
      continue;
    }
    if (msg.role !== "assistant") continue;

    sawAssistant = true;
    const content = Array.isArray(msg.content) ? msg.content : [];
    const text = content.filter((b) => b && b.type === "text")
      .map((b) => b.text || "").join("\n").trim();
    if (text) pieces.unshift(text);
  }

  if (!sawAssistant) return null;

  const text = pieces.join("\n\n").trim();
  // Every record in the turn was a tool call — there is no prose to shorten.
  return { text, toolOnly: !text };
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

    // The rewriter's own warnings go to stderr. Captured into a pipe and never
    // read, they reach nobody — which is why the timeouts stayed invisible even
    // after a loud message was added for them. Letting the child write straight
    // to this process's stderr is what makes a give-up path visible; these paths
    // are approved passes precisely BECAUSE the reader can see them happen.
    const run = spawnSync(process.execPath,
      [rewriter, "--text", last.text, "--project", cwd, "--json"],
      { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024,
        stdio: ["ignore", "pipe", "inherit"] });

    if (run.error || !run.stdout) return allow();

    let result;
    try { result = JSON.parse(run.stdout); } catch (_) { return allow(); }

    // The rewriter returns the original when it cannot do better. Nothing was
    // lost, so there is nothing to replace.
    if (!result.ok || !result.text || result.skipped) return allow();
    if (result.text.trim() === last.text.trim()) return allow();

    const saved = (result.words || 0) - (result.wordsAfter || 0);
    if (saved < 15) return allow(); // not worth the extra turn

    // "Replace it with this" asks for something the model cannot do — it has no
    // way to unsay a reply, only to write another. Read as an instruction to
    // restate, it re-emitted the long original, so David saw the full reply,
    // then the short one, then the full one again. The instruction has to
    // describe the only real action: emit this text and stop.
    block(
      "STOP. Do not continue your previous reply and do not repeat any part of " +
      "it. Your entire next message is the text below, copied exactly — nothing " +
      "before it, nothing after it, no commentary, no heading, no explanation " +
      "that you shortened anything. Everything from the next line onward IS " +
      "your message:\n\n" +
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
