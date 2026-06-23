"use strict";

/**
 * gsd-t-shrink-metric — M92 D2 (shrink-verdict, the keystone move)
 *
 * A deterministic leanness readout for a change. Today verify's `overallVerdict`
 * is a pure AND of additive gates — the schema literally CANNOT say "we made it
 * smaller." This module measures the change's net size from a `git diff --numstat`
 * envelope so a NET-NEGATIVE (leaner) change becomes a first-class, ORTHOGONAL
 * success dimension surfaced ALONGSIDE the pass/fail enum (never folded into it).
 *
 * MEASURED, not attested ([[feedback_measure_dont_claim]]): leanness comes from
 * `git diff --numstat`, never an LLM judgment.
 *
 * Output: { filesAdded, filesRemoved, filesModified, insertions, deletions, netLoc, leaner }
 *   netLoc = insertions - deletions
 *   leaner = netLoc <= 0   (removed at least as much as it added)
 *
 * Input — EITHER:
 *   --numstat <path|->   parse a PRE-CAPTURED `git diff --numstat` string (testable
 *                        with no repo; `-` reads stdin).
 *   --range <base>..<head> --project-dir <p>   compute LIVE (runs git itself).
 *
 * numstat grammar (porcelain `git diff --numstat`): one line per path,
 *   <insertions>\t<deletions>\t<path>
 * where a BINARY file emits `-\t-\t<path>` (no textual LOC — counted as a modified
 * file with 0 loc contribution). File add/remove/modify is inferred from the
 * `--numstat` line alone WITHOUT a name-status pass:
 *   - deletions>0 AND insertions==0  → a file with only removals  → filesRemoved
 *   - insertions>0 AND deletions==0  → a file with only additions → filesAdded
 *   - both>0, OR a binary line       → filesModified
 * (This is a heuristic over numstat: a wholly-new file shows insertions/0, a wholly-
 * deleted file shows 0/deletions. It is deterministic and sufficient for the leanness
 * readout; netLoc/leaner — the load-bearing signal — are EXACT regardless of the
 * add/remove/modify split.)
 *
 * Hard engineering bar (mirror gsd-t-guard-map.cjs): zero deps (Node built-ins
 * only), never throws (bad input → exitCode 64, never an uncaught throw),
 * pure parsing. Deterministic — ZERO LLM judgment.
 *
 * Exit: 0 metric computed · 64 bad input.
 */

const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

// ─── numstat parsing (pure) ────────────────────────────────────────────────

/**
 * Parse a `git diff --numstat` string into the shrink metric. Pure; never throws.
 * @param {string} numstat - raw numstat text
 * @returns {{ filesAdded, filesRemoved, filesModified, insertions, deletions, netLoc, leaner, files }}
 */
function parseNumstat(numstat) {
  const text = String(numstat == null ? "" : numstat);
  const lines = text.split(/\r?\n/);

  let filesAdded = 0;
  let filesRemoved = 0;
  let filesModified = 0;
  let insertions = 0;
  let deletions = 0;
  let files = 0;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "") continue;
    // numstat columns are TAB-separated: <ins>\t<del>\t<path>. Be tolerant of
    // runs of whitespace (git uses a single tab, but stay robust).
    const m = line.match(/^\s*(-|\d+)\s+(-|\d+)\s+(.+)$/);
    if (!m) {
      // A non-empty line that is not a numstat row → malformed input.
      return { _malformed: true, badLine: line.slice(0, 200) };
    }
    files += 1;
    const insTok = m[1];
    const delTok = m[2];
    const binary = insTok === "-" || delTok === "-";

    if (binary) {
      // A binary change: counted as a modified file, 0 textual loc contribution.
      filesModified += 1;
      continue;
    }

    const ins = Number(insTok);
    const del = Number(delTok);
    // Number() of a \d+ token is always a finite non-negative integer here.
    insertions += ins;
    deletions += del;

    if (del > 0 && ins === 0) filesRemoved += 1;
    else if (ins > 0 && del === 0) filesAdded += 1;
    else filesModified += 1; // both>0, or 0/0 (an empty/mode-only change)
  }

  const netLoc = insertions - deletions;
  return {
    filesAdded,
    filesRemoved,
    filesModified,
    insertions,
    deletions,
    netLoc,
    leaner: netLoc <= 0,
    files,
  };
}

// ─── live git (only on the --range path) ───────────────────────────────────

/**
 * Capture `git diff --numstat <range>` for a project. Returns { ok, numstat } or
 * { ok:false, reason }. Never throws.
 * @param {string} range - e.g. "<base>..HEAD"
 * @param {string} projectDir
 */
function captureNumstat(range, projectDir) {
  // SECURITY (M92 Red Team BUG-1, [[feedback_defense_in_depth_at_adapters]]):
  // `execFileSync` blocks SHELL injection but NOT git-ARGUMENT injection — a range
  // beginning with `-` is parsed by git as an OPTION (e.g. `--output=<path>` makes
  // git OVERWRITE an arbitrary file). The range is LLM-derived upstream (verify
  // computes the base via a haiku agent), so it is untrusted. Reject any
  // dash-leading / non-string / empty range BEFORE the git call. The trailing `--`
  // is defense-in-depth (NOT sufficient alone — `--output` is honored before `--`).
  if (typeof range !== "string" || range === "" || range.startsWith("-")) {
    return { ok: false, reason: `invalid range (refused: must be a non-empty, non-option string): ${JSON.stringify(range)}` };
  }
  try {
    const out = execFileSync("git", ["diff", "--numstat", range, "--"], {
      cwd: projectDir || ".",
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, numstat: out };
  } catch (e) {
    return { ok: false, reason: `git diff failed: ${(e && e.message) || "unknown"}` };
  }
}

function readNumstatFile(p) {
  // `-` → stdin (fd 0). Otherwise a path.
  if (p === "-") return fs.readFileSync(0, "utf8");
  return fs.readFileSync(p, "utf8");
}

// ─── driver ─────────────────────────────────────────────────────────────────

/**
 * Compute the shrink metric from options. Never throws — bad input → exitCode 64.
 * @param {{ numstat?:string, range?:string, projectDir?:string }} o
 * @returns {{ ok, exitCode, ... }}
 */
function runMetric(o) {
  const opt = (o && typeof o === "object") ? o : {};
  const hasNumstat = typeof opt.numstat === "string" && opt.numstat.length > 0;
  const hasRange = typeof opt.range === "string" && opt.range.length > 0;

  if (!hasNumstat && !hasRange) {
    return { ok: false, exitCode: 64, reason: "need --numstat <path|-> OR --range <base>..<head>" };
  }
  if (hasNumstat && hasRange) {
    return { ok: false, exitCode: 64, reason: "give EITHER --numstat OR --range, not both" };
  }

  let numstatText;
  let source;
  if (hasNumstat) {
    source = `numstat:${opt.numstat}`;
    try {
      numstatText = readNumstatFile(opt.numstat);
    } catch (e) {
      return { ok: false, exitCode: 64, reason: `cannot read --numstat input: ${(e && e.message) || "unknown"}`, source };
    }
  } else {
    source = `range:${opt.range}`;
    const cap = captureNumstat(opt.range, opt.projectDir);
    if (!cap.ok) {
      // A git failure on the live path is BAD INPUT (unresolvable range / not a repo)
      // → exit 64. The verify workflow turns this into a logged skip-with-reason,
      // never a fabricated metric.
      return { ok: false, exitCode: 64, reason: cap.reason, source };
    }
    numstatText = cap.numstat;
  }

  const parsed = parseNumstat(numstatText);
  if (parsed._malformed) {
    return { ok: false, exitCode: 64, reason: `malformed numstat line: "${parsed.badLine}"`, source };
  }

  return {
    ok: true,
    exitCode: 0,
    source,
    filesAdded: parsed.filesAdded,
    filesRemoved: parsed.filesRemoved,
    filesModified: parsed.filesModified,
    insertions: parsed.insertions,
    deletions: parsed.deletions,
    netLoc: parsed.netLoc,
    leaner: parsed.leaner,
    files: parsed.files,
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const o = { numstat: null, range: null, projectDir: ".", help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--numstat") o.numstat = argv[++i];
    else if (a === "--range") o.range = argv[++i];
    else if (a === "--project-dir" || a === "--projectDir") o.projectDir = argv[++i];
    else if (a === "--json") {/* default output is JSON */}
  }
  return o;
}

const HELP = `Usage:
  gsd-t shrink-metric --numstat <path|->            [--json]
  gsd-t shrink-metric --range <base>..<head> --project-dir <p> [--json]

The M92 shrink-metric (D2). Computes a deterministic leanness readout from a
\`git diff --numstat\` envelope: { filesAdded, filesRemoved, filesModified,
insertions, deletions, netLoc, leaner } where netLoc = insertions - deletions and
leaner = netLoc <= 0. MEASURED, zero LLM judgment.

  --numstat PATH   parse a pre-captured \`git diff --numstat\` string (\`-\` = stdin).
  --range R        compute live: runs \`git diff --numstat <R>\` in --project-dir.
  --project-dir P  cwd for the live --range git call (default ".").

Exit: 0 metric computed · 64 bad input (no source, both sources, unreadable, or
malformed numstat / unresolvable range).`;

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { process.stdout.write(HELP + "\n"); process.exit(0); }
  let res;
  try {
    res = runMetric(o);
  } catch (e) {
    // Defense in depth — runMetric is written never to throw, but the contract
    // mandates the module never throws, so any escape maps to 64.
    res = { ok: false, exitCode: 64, reason: `metric-error: ${e && e.message}` };
  }
  process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  process.exit(res.exitCode);
}

if (require.main === module) main();

module.exports = { runMetric, parseNumstat, captureNumstat };
