#!/usr/bin/env node
/**
 * gsd-t-graph-use-report.js
 *
 * M117 - A Stop hook. At the end of a turn it compares the structural work the
 * session did against the graph queries it issued, and says so when the two do
 * not match.
 *
 * [RULE] use-report-measures-behaviour-not-code-shape
 * [RULE] use-report-never-blocks-it-reports
 *
 * WHY A SECOND MECHANISM
 *   The PreToolUse guard (gsd-t-graph-search-guard.js) blocks structural
 *   SEARCHES. It governs tool calls, which is all a pattern-matcher can see.
 *   It cannot see a session that read six files end to end and worked out the
 *   call graph by eye - there is no grep to catch, and no code shape a static
 *   scan could find. That is the same blind spot gsd-t-graph-use-gate.cjs was
 *   built for, and for the same reason: only the runtime ledger records what a
 *   session actually did.
 *
 *   This is the conversational counterpart of that gate. The gate runs inside
 *   `gsd-t verify`, so it only ever sees workflow runs; most work is a plain
 *   conversation, which nothing was measuring.
 *
 * WHAT IT DOES NOT DO
 *   It does not block, and it is not a gate. A Stop hook fires after the work
 *   is finished, so blocking there would punish work already done rather than
 *   redirect it. It reports - into the ledger always, and to the session when
 *   the mismatch is worth saying out loud. Prevention is the guard's job.
 *
 * --- Stdin (Claude Code Stop payload) --------------------------------------
 *   { "cwd": "...", "session_id": "...", ... }
 *
 * --- Output ----------------------------------------------------------------
 *   Exit 0 always. When there is something to say, one line on stdout.
 *
 * Zero dependencies.
 */

"use strict";

const fs = require("fs");
const path = require("path");

// How far back a "this turn" window reaches. A turn is minutes, not hours.
const WINDOW_MS = 30 * 60 * 1000;

function quiet() { process.exit(0); }

function say(message) {
  process.stdout.write(message + "\n");
  process.exit(0);
}

function ledgerPath(projectDir) {
  const dir = path.join(projectDir, ".gsd-t", "graphDB", "logs");
  if (!fs.existsSync(dir)) return null;
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.startsWith("graph-events-") && n.endsWith(".jsonl"));
  } catch {
    return null;
  }
  if (names.length === 0) return null;
  names.sort();
  return path.join(dir, names[names.length - 1]);
}

/**
 * Read the tail of a file without loading all of it. The graph ledger reaches
 * tens of megabytes, and a Stop hook must not stall a turn.
 */
function tailLines(file, maxBytes) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    return null;
  }
  try {
    const size = fs.fstatSync(fd).size;
    const start = size > maxBytes ? size - maxBytes : 0;
    const len = size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    const text = buf.toString("utf8");
    const lines = text.split("\n");
    if (start > 0) lines.shift(); // the first line is probably cut in half
    return lines;
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Count what happened inside the window: graph queries issued, and structural
 * searches the guard blocked.
 */
function readRecentActivity(file, sinceMs) {
  const lines = tailLines(file, 2 * 1024 * 1024);
  if (lines === null) return null;

  let queries = 0;
  let blockedStructural = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let ev;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      continue; // a half-written line at the tail; the next run reads it whole
    }
    const ts = Date.parse(ev.ts);
    if (!Number.isFinite(ts)) continue;
    if (ts < sinceMs) continue;

    if (ev.kind === "query") queries++;
    if (ev.kind === "search-blocked") blockedStructural++;
  }

  return { queries, blockedStructural };
}

function main() {
  let input = "";
  let done = false;

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => { input += c; });
  process.stdin.on("end", () => {
    if (done) return;
    done = true;
    report(input);
  });

  setTimeout(() => {
    if (done) return;
    done = true;
    report(input);
  }, 3000);
}

function report(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    quiet();
    return;
  }

  const projectDir = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
  if (!fs.existsSync(path.join(projectDir, ".gsd-t"))) { quiet(); return; }

  const file = ledgerPath(projectDir);
  if (file === null) { quiet(); return; }

  const activity = readRecentActivity(file, Date.now() - WINDOW_MS);
  if (activity === null) { quiet(); return; }

  // The guard stopped structural searches this turn and the graph was never
  // asked. Something structural was wanted and answered another way.
  if (activity.blockedStructural > 0 && activity.queries === 0) {
    say(
      "[GSD-T GRAPH] " + activity.blockedStructural + " structural search(es) were blocked this " +
      "turn and the graph was never queried. A structural question answered by reading files " +
      "is the blind spot the guard cannot see - ask the graph: gsd-t graph who-calls <symbol>."
    );
    return;
  }

  quiet();
}

main();
