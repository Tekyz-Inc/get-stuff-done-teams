#!/usr/bin/env node
/**
 * gsd-t-compaction-scanner.js
 *
 * Historical backfill for compaction events.
 *
 * Claude Code writes one JSONL file per session under
 * `~/.claude/projects/<cwd-slug>/`. Each auto-compaction emits a single row
 * of shape:
 *
 *   { "type": "system", "subtype": "compact_boundary",
 *     "timestamp": "…", "sessionId": "…", "cwd": "…",
 *     "compactMetadata": { "trigger": "auto",
 *                          "preTokens": …, "postTokens": …,
 *                          "durationMs": … } }
 *
 * This tool scans those session files, extracts the boundaries, dedups
 * against the existing `<projectDir>/.gsd-t/metrics/compactions.jsonl`, and
 * — only when `--write` is passed — appends the missing rows with
 * `source: "compact-backfill"`.
 *
 * Defaults to DRY-RUN. The `--write` flag is required to mutate state.
 *
 * Contract: .gsd-t/contracts/compaction-events-contract.md
 *
 * Usage:
 *   node scripts/gsd-t-compaction-scanner.js [--write] [--project-dir DIR]
 *                                            [--sessions-root DIR]
 *                                            [--limit N]
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const SCHEMA_VERSION = 1;

/* ───────────────────────── arg parsing ───────────────────────── */

function parseArgs(argv) {
  const args = { write: false, projectDir: process.cwd(), sessionsRoot: null, limit: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") args.write = true;
    else if (a === "--project-dir") args.projectDir = argv[++i];
    else if (a === "--sessions-root") args.sessionsRoot = argv[++i];
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10) || null;
    else if (a === "-h" || a === "--help") args.help = true;
  }
  return args;
}

function printHelp() {
  process.stdout.write(
    [
      "gsd-t-compaction-scanner — backfill .gsd-t/metrics/compactions.jsonl",
      "",
      "Usage: node scripts/gsd-t-compaction-scanner.js [flags]",
      "",
      "  --write                  Actually write. Default is dry-run.",
      "  --project-dir DIR        Project root (default: cwd).",
      "  --sessions-root DIR      Override sessions root (default: derive from",
      "                           ~/.claude/projects/<slug-of-project-dir>).",
      "  --limit N                Stop after scanning N files (diagnostic).",
      "  -h, --help               Show this help.",
      "",
      "Default is DRY-RUN. Pass --write to mutate compactions.jsonl.",
      "",
    ].join("\n")
  );
}

/* ───────────────── sessions-root slug helper ───────────────── */

/**
 * Claude Code encodes project directories in `~/.claude/projects/` by
 * replacing `/` with `-`. For `/Users/david/projects/GSD-T` → slug is
 * `-Users-david-projects-GSD-T`. Leading dash is intentional.
 */
function deriveSessionsRoot(projectDir) {
  const abs = path.resolve(projectDir);
  const slug = abs.replace(/\//g, "-");
  return path.join(os.homedir(), ".claude", "projects", slug);
}

/* ───────────────── scanner ───────────────── */

/**
 * Scan one session JSONL file and yield compact_boundary rows. Returns an
 * array (sessions rarely exceed tens of MB of NDJSON; a synchronous pass
 * would still be fine but we use streaming to be safe on huge files).
 *
 * Silent-fail on any read/parse error per line (the goal is best-effort
 * historical extraction, not validation of Claude Code's archive format).
 *
 * @returns {Promise<Array<object>>}
 */
async function scanSessionFile(filePath) {
  const out = [];
  if (!fs.existsSync(filePath)) return out;

  let stream;
  try {
    stream = fs.createReadStream(filePath, { encoding: "utf8" });
  } catch {
    return out;
  }

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line || line.length < 2) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj && obj.type === "system" && obj.subtype === "compact_boundary") {
      out.push(obj);
    }
  }
  return out;
}

/**
 * Convert a compact_boundary JSONL row into our canonical compaction row.
 */
function boundaryToRow(b) {
  const row = {
    ts: typeof b.timestamp === "string" ? b.timestamp : new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    session_id: typeof b.sessionId === "string" ? b.sessionId : null,
    // `logicalParentUuid` is the last message in the pre-compact window — as
    // close as the archive gets to a "prior session id" for in-place
    // compactions. It's NOT a true session id, but it's a stable boundary
    // anchor that consumers can join on.
    prior_session_id:
      typeof b.logicalParentUuid === "string" ? b.logicalParentUuid : null,
    source: "compact-backfill",
    cwd: typeof b.cwd === "string" ? b.cwd : null,
    hook: "SessionStart",
  };

  const meta = b.compactMetadata || {};
  if (typeof meta.trigger === "string") row.trigger = meta.trigger;
  if (Number.isFinite(meta.preTokens)) row.preTokens = meta.preTokens;
  if (Number.isFinite(meta.postTokens)) row.postTokens = meta.postTokens;
  if (Number.isFinite(meta.durationMs)) row.durationMs = meta.durationMs;

  return row;
}

/**
 * Load existing compactions.jsonl (if any) and build a dedup key set.
 * Key = `${ts}\t${session_id}`.
 */
function loadExistingKeys(compactionsPath) {
  const keys = new Set();
  if (!fs.existsSync(compactionsPath)) return keys;
  let raw;
  try {
    raw = fs.readFileSync(compactionsPath, "utf8");
  } catch {
    return keys;
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      keys.add(`${obj.ts || ""}\t${obj.session_id || ""}`);
    } catch {
      /* ignore malformed historical rows */
    }
  }
  return keys;
}

function rowKey(row) {
  return `${row.ts}\t${row.session_id || ""}`;
}

/* ───────────────── orchestrator ───────────────── */

async function run({ write, projectDir, sessionsRoot, limit, _sessionFiles, _scanSessionFile, _stdout }) {
  const root = sessionsRoot || deriveSessionsRoot(projectDir);
  const stdout = _stdout || ((s) => process.stdout.write(s));
  const scan = _scanSessionFile || scanSessionFile;

  let files;
  if (Array.isArray(_sessionFiles)) {
    files = _sessionFiles;
  } else if (!fs.existsSync(root)) {
    stdout(`Sessions root does not exist: ${root}\nNothing to do.\n`);
    return { scanned: 0, found: 0, newRows: 0, wrote: 0 };
  } else {
    try {
      files = fs
        .readdirSync(root)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => path.join(root, f));
    } catch {
      files = [];
    }
  }
  if (limit && files.length > limit) files = files.slice(0, limit);

  const metricsDir = path.join(projectDir, ".gsd-t", "metrics");
  const outPath = path.join(metricsDir, "compactions.jsonl");
  const existing = loadExistingKeys(outPath);

  stdout(`Scanning ${files.length} session file(s) from ${root}\n`);
  stdout(`Target sink: ${outPath} (${existing.size} existing row(s))\n`);
  stdout(write ? "Mode: WRITE\n\n" : "Mode: DRY-RUN (pass --write to mutate)\n\n");

  const newRows = [];
  let scanned = 0;
  let found = 0;

  for (const file of files) {
    scanned++;
    let boundaries;
    try {
      boundaries = await scan(file);
    } catch {
      boundaries = [];
    }
    for (const b of boundaries) {
      found++;
      const row = boundaryToRow(b);
      const key = rowKey(row);
      if (existing.has(key)) continue;
      existing.add(key);
      newRows.push(row);
    }
  }

  // Sort by ts ascending for a stable, chronologically-ordered append.
  newRows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

  stdout(`Scanned: ${scanned} file(s)\n`);
  stdout(`Compact boundaries found: ${found}\n`);
  stdout(`New rows (post-dedup): ${newRows.length}\n\n`);

  if (newRows.length > 0) {
    stdout("Sample (first up to 5):\n");
    for (const r of newRows.slice(0, 5)) {
      stdout(`  ${r.ts}  session=${r.session_id || "?"}  ` +
             `trigger=${r.trigger || "?"}  ` +
             `pre=${r.preTokens ?? "?"} post=${r.postTokens ?? "?"}\n`);
    }
    stdout("\n");
  }

  let wrote = 0;
  if (write && newRows.length > 0) {
    try {
      fs.mkdirSync(metricsDir, { recursive: true });
      const payload = newRows.map((r) => JSON.stringify(r)).join("\n") + "\n";
      fs.appendFileSync(outPath, payload, "utf8");
      wrote = newRows.length;
      stdout(`Wrote ${wrote} row(s) to ${outPath}\n`);
    } catch (e) {
      stdout(`Write failed: ${e && e.message ? e.message : e}\n`);
    }
  } else if (!write) {
    stdout("Dry-run — no changes made. Re-run with --write to persist.\n");
  }

  return { scanned, found, newRows: newRows.length, wrote };
}

/* ───────────────── CLI ───────────────── */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  try {
    const result = await run(args);
    // Success even when nothing new — exit 0. Exit 1 only on catastrophic
    // error (caught below).
    process.exit(0);
    return result;
  } catch (e) {
    process.stderr.write(`scanner error: ${e && e.message ? e.message : e}\n`);
    process.exit(1);
  }
}

module.exports = {
  run,
  scanSessionFile,
  boundaryToRow,
  deriveSessionsRoot,
  loadExistingKeys,
  rowKey,
};

if (require.main === module) {
  main();
}
