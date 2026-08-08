#!/usr/bin/env node
/**
 * gsd-t-project-history.cjs
 *
 * M109-D1 — Reads what actually happened in a project, so its CLAUDE.md can be
 * written from evidence rather than from a template.
 *
 * [RULE] history-distinguishes-absent-from-unreadable
 * [RULE] history-names-every-session-it-could-not-read
 * [RULE] history-reads-what-the-user-typed-not-what-was-pasted
 *
 * Three sources, cheapest first: git, the decision log, and what the user typed
 * in past sessions. The transcripts are the richest and the largest — binvoice
 * holds 315 MB across 27 sessions — so they are funnelled, not read whole:
 *
 *   315 MB  raw sessions
 *    2.9 MB  keep only the user's own turns
 *    645 KB  drop pasted logs (35 giant lines held 78% of the bytes)
 *    7.4 KB  keep only complaint-shaped lines
 *
 * Two seconds, no subagents, and the result fits in context.
 *
 * ─── Absent is not the same as unreadable ───────────────────────────────────
 * A source that ISN'T THERE is an ordinary fact — a project may have no git
 * history. A source that IS there but cannot be read is a FAILURE, and saying
 * "not available" about it would produce a thinner CLAUDE.md that looks
 * complete. Those two cases are reported differently, and the second one halts.
 *
 * The one sanctioned exception (David's call, 2026-08-07): among many session
 * files, one that cannot be read is skipped and NAMED rather than halting —
 * a single truncated in-progress session should not block the rewrite. Every
 * skipped session is listed in the output and belongs in the generated file.
 *
 * ─── Usage ──────────────────────────────────────────────────────────────────
 *   node gsd-t-project-history.cjs --project <dir> [--json] [--sessions N]
 *
 * ─── Exit codes ─────────────────────────────────────────────────────────────
 *   0  read something
 *   4  no history at all — the caller must halt, never write a thin file
 *   64 a source exists but could not be read, or bad input
 *
 * Zero dependencies.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const EXIT_OK = 0;
const EXIT_NO_HISTORY = 4;
const EXIT_UNREADABLE = 64;

// A pasted log is not something the user typed. 35 such lines held 78% of
// binvoice's post-filter bytes.
const PASTE_THRESHOLD = 2000;

/** Thrown when a source exists but cannot be read. Never treated as absent. */
class Unreadable extends Error {}

/**
 * What a complaint actually looks like — measured against real transcripts,
 * not assumed. The obvious guesses all scored zero:
 *   "I never asked you to"  0 hits
 *   "that's the third time" 0 hits
 *   "you were supposed to"  0 hits
 * The user does not accuse. He restates the requirement.
 */
const COMPLAINT = new RegExp([
  "still (not|isn'?t|doesn'?t|don'?t|broken|failing|wrong|happening)",
  "you keep",
  "why (did|didn'?t|do|does|is|are) (you|it|this)",
  "keeps? (happening|coming up|breaking|failing)",
  "hard rule",
  "(third|3rd|second|2nd) (time|attempt|try)",
  "same (result|issue|problem|error|thing)",
  "revert(ed|ing)?\\b",
  "that'?s (wrong|not right|incorrect)",
  "without asking",
  "never (do|again|clear|change|touch|delete|assume)",
  "don'?t (just|ever|keep|do that)",
  "i (didn'?t|never) (ask|say|want)",
  "stop (doing|adding|using)",
  "you (broke|removed|deleted|changed) ",
  "not what i (asked|wanted|said)",
].join("|"), "i");

// Turns that are machinery, not the user speaking.
const NOT_TYPED = [
  /^<command-name>/,
  /^<local-command/,
  /^\[Request interrupted/,
  /^<system-reminder>/,
  /^Caveat: The messages below/,
  /hook (success|feedback)/i,
];

/** Where Claude Code keeps a project's sessions. */
function transcriptDir(projectDir) {
  const encoded = path.resolve(projectDir).replace(/\//g, "-");
  return path.join(os.homedir(), ".claude", "projects", encoded);
}

/** The text of one turn, whatever shape the record uses. */
function turnText(record) {
  const c = record && record.message && record.message.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c.filter((b) => b && b.type === "text").map((b) => b.text || "").join("\n");
}

/**
 * The funnel. Returns every complaint-shaped thing the user typed, newest
 * session first. A session that cannot be read is skipped and NAMED.
 */
function readTranscripts(projectDir, maxSessions) {
  const dir = transcriptDir(projectDir);
  if (!fs.existsSync(dir)) {
    return { present: false, why: `no session history at ${dir}` };
  }

  let names;
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch (e) {
    throw new Unreadable(`${dir} exists but could not be listed: ${e.message}`);
  }
  if (!names.length) return { present: false, why: `no sessions recorded in ${dir}` };

  let files = names
    .map((f) => {
      const full = path.join(dir, f);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .map((x) => x.full);

  if (maxSessions > 0 && files.length > maxSessions) files = files.slice(0, maxSessions);

  const complaints = [];
  const skipped = [];
  const stats = { sessions: files.length, rawBytes: 0, userTurns: 0, afterPaste: 0, matched: 0 };

  for (const file of files) {
    let raw;
    try {
      stats.rawBytes += fs.statSync(file).size;
      raw = fs.readFileSync(file, "utf8");
    } catch (e) {
      // Sanctioned: one bad session does not block the rewrite, but it is named
      // here and reported to the user. Never silent.
      skipped.push({ session: path.basename(file, ".jsonl"), why: e.message });
      continue;
    }

    const session = path.basename(file, ".jsonl");
    for (const line of raw.split("\n")) {
      if (!line) continue;
      let rec;
      try { rec = JSON.parse(line); } catch (_) { continue; } // a half-written last line
      if (!rec || rec.type !== "user" || rec.isSidechain || rec.isMeta) continue;

      const text = turnText(rec).trim();
      if (!text) continue;
      stats.userTurns++;

      if (text.length > PASTE_THRESHOLD) continue;   // pasted, not typed
      if (NOT_TYPED.some((re) => re.test(text))) continue;
      stats.afterPaste++;

      if (!COMPLAINT.test(text)) continue;
      stats.matched++;

      complaints.push({
        session,
        when: rec.timestamp || null,
        branch: rec.gitBranch || null,
        text: text.length > 600 ? text.slice(0, 600) + "…" : text,
      });
    }
  }

  return { present: true, complaints, skipped, stats };
}

/** Decision-log entries — already curated, much smaller. */
function readDecisionLog(projectDir) {
  const p = path.join(projectDir, ".gsd-t", "progress.md");
  if (!fs.existsSync(p)) return { present: false, why: "no .gsd-t/progress.md" };

  let text;
  try {
    text = fs.readFileSync(p, "utf8");
  } catch (e) {
    throw new Unreadable(`progress.md exists but could not be read: ${e.message}`);
  }

  const start = text.indexOf("## Decision Log");
  if (start === -1) return { present: false, why: "progress.md has no Decision Log section" };

  // A date stamp carries a time and a zone — "2026-08-05 21:15 PDT: [debug] …" —
  // so the colon that ends it is the one AFTER the zone, not the first one on
  // the line. Matching the first colon finds nothing.
  const entries = [];
  for (const line of text.slice(start).split("\n")) {
    const m = line.match(/^-\s+(\d{4}-\d{2}-\d{2}(?:\s+[\d:]+)?(?:\s+[A-Z]{2,5})?)\s*:\s*(.+)$/);
    if (!m) continue;
    entries.push({ when: m[1], text: m[2].length > 400 ? m[2].slice(0, 400) + "…" : m[2] });
  }
  return { present: true, entries };
}

/**
 * Files fixed the same way repeatedly. A file that keeps being fixed is a rule
 * nobody wrote down — and this works when there are no transcripts at all.
 */
function readGit(projectDir) {
  const git = (args) => execFileSync("git", ["-C", projectDir, ...args], {
    encoding: "utf8", timeout: 20000, maxBuffer: 32 * 1024 * 1024,
  });

  if (!fs.existsSync(path.join(projectDir, ".git"))) {
    return { present: false, why: "not a git repository" };
  }

  let commits, branch;
  try {
    commits = parseInt(git(["rev-list", "--count", "HEAD"]).trim(), 10);
    branch = git(["branch", "--show-current"]).trim();
  } catch (e) {
    throw new Unreadable(`.git exists but git could not read it: ${e.message}`);
  }

  // A real revert says so at the start of its subject. Matching "broke" or a
  // bare "revert" anywhere pulled in 20 ordinary commits on binvoice — every
  // one a false positive, which buries the handful that are real.
  let reverts;
  try {
    reverts = git(["log", "--oneline", "-i", "--grep=^revert", "--grep=^chore: revert", "--grep=reverts commit", "-n", "40"])
      .split("\n").filter(Boolean).slice(0, 20);
  } catch (e) {
    throw new Unreadable(`git log failed while looking for reverts: ${e.message}`);
  }

  let hotFiles;
  try {
    const counts = {};
    const out = git(["log", "-i", "--name-only", "--pretty=format:", "--grep=fix", "-n", "300"]);
    for (const f of out.split("\n")) {
      const name = f.trim();
      if (!name) continue;
      counts[name] = (counts[name] || 0) + 1;
    }
    hotFiles = Object.entries(counts)
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([file, fixes]) => ({ file, fixes }));
  } catch (e) {
    throw new Unreadable(`git log failed while looking for repeatedly-fixed files: ${e.message}`);
  }

  return { present: true, commits, branch, reverts, hotFiles };
}

function parseArgs(argv) {
  const args = { project: process.cwd(), sessions: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--project") args.project = argv[++i];
    else if (a === "--sessions") args.sessions = parseInt(argv[++i], 10) || 0;
  }
  return args;
}

function halt(message, asJson) {
  if (asJson) {
    process.stdout.write(JSON.stringify({ ok: false, exitCode: EXIT_UNREADABLE, halt: message }, null, 2) + "\n");
  } else {
    process.stderr.write(`[gsd-t] ${message}\n`);
  }
  process.exit(EXIT_UNREADABLE);
}

function main() {
  const args = parseArgs(process.argv);
  const projectDir = path.resolve(args.project);
  const asJson = args.json || !process.stdout.isTTY;

  if (!fs.existsSync(projectDir)) halt(`No such directory: ${projectDir}`, asJson);

  const started = Date.now();

  // A source that exists but cannot be read HALTS. Reporting it as "not
  // available" would produce a thinner CLAUDE.md that looks complete.
  let git, log, sessions;
  try {
    git = readGit(projectDir);
    log = readDecisionLog(projectDir);
    sessions = readTranscripts(projectDir, args.sessions);
  } catch (e) {
    if (e instanceof Unreadable) {
      halt(
        `${e.message}\n\nThis source exists, so its contents belong in the rewrite. ` +
        `Continuing would produce a CLAUDE.md that looks complete but isn't.`,
        asJson
      );
    }
    throw e;
  }

  // Every source says whether it was there, so a thin result can never be
  // mistaken for "this project has no history."
  const sources = {
    git: git.present ? `${git.commits} commits` : `none — ${git.why}`,
    decisionLog: log.present ? `${log.entries.length} entries` : `none — ${log.why}`,
    sessions: sessions.present
      ? `${sessions.stats.sessions} sessions, ${sessions.stats.matched} things worth reading`
      : `none — ${sessions.why}`,
  };

  const anything = git.present || log.present || sessions.present;

  const result = {
    ok: anything,
    exitCode: anything ? EXIT_OK : EXIT_NO_HISTORY,
    project: path.basename(projectDir),
    sources,
    tookMs: Date.now() - started,
    git: git.present ? git : null,
    decisionLog: log.present ? log.entries.slice(0, 40) : null,
    complaints: sessions.present ? sessions.complaints : null,
    skippedSessions: sessions.present ? sessions.skipped : [],
    funnel: sessions.present ? sessions.stats : null,
  };

  if (!anything) {
    result.halt = "No history at all. Do not write a thinner CLAUDE.md and call it normal — ask the user how to proceed.";
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`History for ${result.project}\n\n`);
    for (const [k, v] of Object.entries(sources)) process.stdout.write(`  ${k.padEnd(13)} ${v}\n`);
    if (result.skippedSessions.length) {
      process.stdout.write(`\n  ${result.skippedSessions.length} session(s) could NOT be read:\n`);
      for (const s of result.skippedSessions) process.stdout.write(`    ${s.session} — ${s.why}\n`);
    }
    if (sessions.present) {
      const s = sessions.stats;
      process.stdout.write(`\n  ${(s.rawBytes / 1e6).toFixed(0)} MB raw → ${s.userTurns} typed → ${s.afterPaste} after dropping pastes → ${s.matched} worth reading\n`);
    }
    if (result.complaints && result.complaints.length) {
      process.stdout.write(`\nWhat kept going wrong:\n\n`);
      for (const c of result.complaints.slice(0, 15)) {
        process.stdout.write(`  ${(c.when || "").slice(0, 10)}  ${c.text.replace(/\s+/g, " ").slice(0, 110)}\n`);
      }
    }
    if (git.present && git.hotFiles.length) {
      process.stdout.write(`\nFiles fixed repeatedly:\n`);
      for (const h of git.hotFiles.slice(0, 8)) process.stdout.write(`  ${h.fixes}×  ${h.file}\n`);
    }
    process.stdout.write(`\n(${result.tookMs} ms)\n`);
  }
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = { readTranscripts, readDecisionLog, readGit, transcriptDir, COMPLAINT, turnText, Unreadable };
