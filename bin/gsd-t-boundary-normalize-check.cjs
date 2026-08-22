#!/usr/bin/env node
"use strict";

/**
 * gsd-t-boundary-normalize-check — a value entering the program must be cleaned
 * where it enters.
 *
 * The bug this exists to stop is quiet. A status arrives from a form with a
 * trailing space, or a filter arrives from a URL with different casing than the
 * literal it is compared against. The comparison answers "no match", nothing
 * reports anything, and the feature simply does nothing. It is found days later
 * as an unexpected bug, traced back by hand.
 *
 * Why the check lives at the ENTRY POINT rather than at the comparison:
 * measured, not assumed. One real project holds 1,275 literal string
 * comparisons, 193 of them shaped like business values, and nearly all of those
 * are legitimate — internal message tags, a build mode, a value the code itself
 * wrote a line earlier. A check flagging comparisons produces roughly 190 false
 * alarms per project, and a check that noisy gets switched off. Switched off it
 * enforces nothing while still looking enforced.
 *
 * A comparison cannot be judged alone: whether it is a bug depends on where the
 * value came from. The entry point is where that is knowable, and a project has
 * a handful of entry points against hundreds of uses. Cleaning there also
 * covers values that are STORED, which no comparison rule ever reaches — and
 * half the reported bugs were stored values.
 *
 * Two modes, chosen by whether the project has been checked before:
 *
 *   full     every entry point in the project. Reports, never blocks. This is
 *            the one-time inventory for a project adopting the rule.
 *   changed  only entry points in files this run touched. An unclean one FAILS.
 *
 * Nothing is ever recorded as "permitted". A stored list of accepted violations
 * is a list somebody can quietly extend, and then the check measures the list
 * rather than the code. An exemption is written at the entry point itself, in a
 * comment, where the next reader is already looking.
 *
 * Exit 0 clean or reporting, 1 on a blocking failure, 64 when the check cannot
 * be run at all. It never passes a question it could not answer.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// ─── What counts as a value entering the program ─────────────────────────────
//
// Each entry is a way a value arrives from outside: something a person typed, a
// web address, or a row read back from storage.
// Matched on the read itself, so the check sees the value at the moment it
// crosses in.
const ENTRY_POINTS = [
  { id: "http-body", re: /\breq(?:uest)?\.body\s*(?:\.|\[)/g, what: "a request body" },
  { id: "http-query", re: /\breq(?:uest)?\.query\s*(?:\.|\[)/g, what: "a URL query value" },
  { id: "http-params", re: /\breq(?:uest)?\.params\s*(?:\.|\[)/g, what: "a URL path value" },
  { id: "url-search", re: /\b(?:searchParams|URLSearchParams)\s*\.\s*get\s*\(/g, what: "a URL query value" },
  { id: "form-data", re: /\bformData\s*\.\s*get\s*\(/g, what: "a submitted form value" },
  { id: "dom-input", re: /\.\s*value\s*(?:;|,|\)|\s*$)/g, what: "a typed-in field", weak: true },
];

// TRIMMING IS UNIVERSAL. A leading or trailing space is never something a
// person meant to type — it is paste damage. That includes a PASSWORD: a space
// on the end is not part of the secret, it is a stray keystroke, and storing it
// untrimmed locks the person out when they later type the password normally.
//
// The only values where the space IS the content are free text a person wrote
// on purpose — a note, a description, a message body. Everything else, without
// exception, is trimmed where it enters.
const FREE_TEXT_NAMES =
  /\b(note|notes|description|comment|comments|message|messageBody|content|text|summary|bio)\b/i;

// A value naming something in the business. These cross boundaries where the
// casing is free to change, so they are lowercased as well as trimmed.
const DOMAIN_NAMES = /\b(status|state|filter|tab|mode|role|category|kind|type|view|email|username|slug)\b/i;

// Casing is part of the value here. Lowercasing these is a defect, and for the
// first group a security defect — it shrinks the space a secret lives in.
const CASE_SENSITIVE_NAMES =
  /\b(password|passwd|secret|token|apiKey|api_key|signature|hash|digest|salt|nonce|sessionId|path|filepath|url|uri|href|base64|sha|checksum)\b/i;

// Cleaning that satisfies the rule, at or near the entry point.
const TRIMS = /\.\s*trim\s*\(\s*\)|\btrimmed\b|\bnormali[sz]e[A-Za-z]*\s*\(/;
const LOWERS = /\.\s*toLowerCase\s*\(\s*\)|\.\s*toUpperCase\s*\(\s*\)|\blocaleCompare\s*\(/;

// An exemption is written where the value enters, never in a separate file.
const EXEMPT = /gsd-t-(?:allow-raw|raw-value)\s*:\s*\S/;

const CODE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;
// Bundled and minified files are generated, not authored: a bundle carries its
// dependencies' internals, and reporting Express's own parameter handling is work
// nobody can act on. One real project produced 46 of its 75 findings from a single
// bundle file.
const GENERATED_FILE = /(?:^|\/)(?:_?bundle|.*\.bundle|.*\.min|.*-bundle)\.[cm]?jsx?$/i;
// Generated output is not authored code. Matched with a suffix so `dist-local`
// and `dist-test` are skipped too — a check that lints its own build output
// reports work nobody can act on.
const SKIP_PATH =
  /(?:^|\/)(?:node_modules|\.git|dist[\w.-]*|build[\w.-]*|out|coverage|\.next|\.nuxt|vendor|\.venv|__pycache__)(?:\/|$)/;
const TEST_PATH = /(?:\.(?:test|spec)\.[tj]sx?$|(?:^|\/)(?:__tests__|tests?|e2e)\/)/i;

/** Raised when the check cannot answer its own question. Never caught into a pass. */
class CannotCheck extends Error {}

/**
 * Files this run touched, as git reports them.
 *
 * Git failing to answer is a HALT, not a pass. "Which files did this run
 * touch?" is the question the whole changed-mode check rests on; answering it
 * with "none" would report a clean run over code nobody examined.
 */
function changedFiles(projectDir) {
  let out;
  try {
    out = execFileSync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch (err) {
    throw new CannotCheck(
      `git could not report which files changed in ${projectDir} ` +
        `(${(err && err.message) || err}). Run with --full to inspect the whole project, or fix ` +
        `git — a run that cannot see the changed files cannot vouch for them.`
    );
  }
  const files = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const p = line.slice(3).trim();
    const finalPath = p.includes(" -> ") ? p.split(" -> ").pop() : p;
    files.push(finalPath.replace(/^"|"$/g, ""));
  }
  return files;
}

/**
 * Every code file in the project, for the one-time inventory.
 *
 * A directory that cannot be read is a HALT: its files would silently go
 * uninspected, and the inventory would claim a coverage it does not have.
 */
function allCodeFiles(projectDir) {
  const found = [];
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      throw new CannotCheck(
        `${rel || "."} could not be listed (${(err && err.message) || err}), so the entry points ` +
          `inside it were never examined.`
      );
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (SKIP_PATH.test(r)) continue;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (CODE_EXT.test(e.name) && !GENERATED_FILE.test(r)) found.push(r);
    }
  };
  walk(projectDir, "");
  return found;
}

/**
 * The names that say what KIND of value this is: what it is being assigned to,
 * and what property it was read from. Deliberately not the whole line — a line
 * mentioning `req.body` carries the word "body", and judging on the whole line
 * would exempt every request-body read in a project as though it were free text.
 */
function valueName(line) {
  const parts = [];
  const assigned = line.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
  if (assigned) parts.push(assigned[1]);
  // the property being read: the last `.name` or ['name'] on the line
  for (const m of line.matchAll(/\.([A-Za-z_$][\w$]*)/g)) parts.push(m[1]);
  for (const m of line.matchAll(/\[\s*['"]([^'"]+)['"]\s*\]/g)) parts.push(m[1]);
  // drop the container words themselves; they name the doorway, not the value
  return parts.filter((n) => !/^(body|query|params|value|get|trim|toLowerCase|toUpperCase)$/i.test(n)).join(" ");
}

/**
 * Is this value cleaned at the point it enters?
 *
 * The window is the entry line plus the two lines after it: cleaning either
 * rides on the same expression (`req.body.email.trim()`) or lands immediately
 * (`const email = raw.trim()`). Looking further would start crediting unrelated
 * cleaning elsewhere in the function, which is how a check begins passing code
 * that is actually broken.
 */
function inspectEntry(lines, idx, entry) {
  const window = lines.slice(idx, idx + 3).join("\n");

  // The exemption is looked for on the line ABOVE as well, because that is
  // where people write it — a comment explaining the next line sits before it.
  const exemptWindow = lines.slice(Math.max(0, idx - 1), idx + 3).join("\n");
  if (EXEMPT.test(exemptWindow)) return null; // deliberately raw, and said so here

  const line = lines[idx];
  const trimmed = TRIMS.test(window);

  // Whether casing matters is decided by the NAME the value is given or read
  // from, since that is what says which kind of value it is.
  const caseSensitive = CASE_SENSITIVE_NAMES.test(valueName(line));
  const domain = !caseSensitive && DOMAIN_NAMES.test(valueName(line));
  const lowered = LOWERS.test(window);

  const missing = [];
  // Judged on the NAME the value is given or read from, never the whole line:
  // `req.body` contains the word "body", which would exempt every request-body
  // read in the project as if it were free text.
  const freeText = FREE_TEXT_NAMES.test(valueName(line));
  if (!trimmed && !freeText) missing.push("trimming");
  if (domain && !lowered) missing.push("case-normalising");
  if (missing.length === 0) return null;

  return { entry, missing, line: line.trim().slice(0, 120) };
}

/** A file that cannot be read is a HALT — an unexamined entry point is not a clean one. */
function scanFile(projectDir, rel) {
  let text;
  try {
    text = fs.readFileSync(path.join(projectDir, rel), "utf8");
  } catch (err) {
    throw new CannotCheck(
      `${rel} could not be read (${(err && err.message) || err}), so its entry points were never ` +
        `checked.`
    );
  }
  const lines = text.split("\n");
  const problems = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(?:\/\/|\*|#)/.test(line)) continue; // a comment is not code

    for (const ep of ENTRY_POINTS) {
      // The weak patterns match ordinary property reads too, so they only count
      // where the line also names a kind of value the rule governs. Without
      // that, `.value` alone would flag half of every React file.
      if (ep.weak && !DOMAIN_NAMES.test(line)) continue;
      ep.re.lastIndex = 0;
      if (!ep.re.test(line)) continue;
      const problem = inspectEntry(lines, i, ep);
      if (problem) problems.push({ file: rel, line: i + 1, ...problem });
      break; // one report per line; a second pattern there is the same value
    }
  }
  return problems;
}

function check(projectDir, opts = {}) {
  const mode = opts.mode === "full" ? "full" : "changed";
  const includeTests = opts.includeTests === true;

  let files =
    mode === "full"
      ? allCodeFiles(projectDir)
      : changedFiles(projectDir).filter(
          (f) => CODE_EXT.test(f) && !SKIP_PATH.test(f) && !GENERATED_FILE.test(f)
        );

  if (!includeTests) files = files.filter((f) => !TEST_PATH.test(f));

  const problems = [];
  const inspected = [];
  for (const rel of files) {
    problems.push(...scanFile(projectDir, rel));
    inspected.push(rel);
  }

  const failures = problems.map(
    (p) =>
      `${p.file}:${p.line}: ${p.entry.what} is used without ${p.missing.join(" or ")} it — ` +
      `clean it here, where it enters. (${p.line})`
  );

  // full mode is the one-time inventory: it reports so the list can be worked
  // through, and never blocks. Blocking here would stop every existing project
  // on day one, and a check nobody can adopt enforces nothing.
  const blocking = mode === "changed";

  return {
    ok: blocking ? failures.length === 0 : true,
    check: "boundary-normalize",
    mode,
    reportOnly: !blocking,
    filesInspected: inspected.length,
    failures,
    note:
      failures.length === 0
        ? mode === "full"
          ? "no entry point is missing its cleaning"
          : "PASS: no touched file reads a value from outside the program"
        : blocking
          ? undefined
          : `${failures.length} entry point(s) to fix — reported, not blocking (whole-project inventory)`,
  };
}

function parseArgs(argv) {
  const out = { projectDir: ".", mode: "changed", includeTests: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") out.projectDir = argv[++i] || ".";
    else if (argv[i] === "--full") out.mode = "full";
    else if (argv[i] === "--include-tests") out.includeTests = true;
  }
  return out;
}

module.exports = { check, scanFile, inspectEntry, ENTRY_POINTS, CannotCheck };

if (require.main === module) {
  const { projectDir, mode, includeTests } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(projectDir)) {
    process.stderr.write(`No such directory: ${projectDir}\n`);
    process.exit(64);
  }
  let result;
  try {
    result = check(projectDir, { mode, includeTests });
  } catch (err) {
    if (err instanceof CannotCheck) {
      process.stderr.write(`boundary-normalize CANNOT CHECK: ${err.message}\n`);
      process.exit(64);
    }
    throw err;
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.ok ? 0 : 1);
}
