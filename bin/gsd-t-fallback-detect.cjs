#!/usr/bin/env node
/**
 * gsd-t-fallback-detect.cjs
 *
 * M106-D1 — Fallback detector (stages 1 + 2: detect, then check approval).
 *
 * [RULE] fallback-detect-halts-never-allows-on-error
 * [RULE] fallback-detect-matches-by-shape-not-line
 * [RULE] fallback-detect-trace-then-continue-is-a-fallback
 *
 * A fallback is anything that CONTINUES AFTER A FAILURE. This tool finds those
 * branches and checks each against the project's approval file
 * (.gsd-t/fallbacks.json). It makes no judgement about whether a fallback is
 * warranted — that is stage 3 (the judge), and ultimately the user's call.
 *
 * ─── Usage ──────────────────────────────────────────────────────────────────
 *   node gsd-t-fallback-detect.cjs --text "<source>" --file <path> [--project <dir>]
 *   node gsd-t-fallback-detect.cjs --file <path> [--project <dir>]
 *   node gsd-t-fallback-detect.cjs --scan [--project <dir>]      # whole codebase
 *   node gsd-t-fallback-detect.cjs --plan <path> [--project <dir>]  # plan/contract prose
 *
 * ─── Exit codes ─────────────────────────────────────────────────────────────
 *   0  clean — no unapproved fallbacks
 *   4  unapproved fallback(s) found
 *   64 bad input (unreadable file, malformed approval file)
 *
 * Exit 64 is a HALT, not a pass. A detector that cannot decide must never
 * report "clean" — that would itself be the banned pattern.
 *
 * Zero dependencies. Deterministic. No LLM.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const EXIT_CLEAN = 0;
const EXIT_FOUND = 4;
const EXIT_BAD_INPUT = 64;

const SOURCE_EXT = new Set([".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx"]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "coverage", ".next",
  ".claude", "vendor", "__pycache__", ".venv",
]);

// Test files are exempt. A swallowed error in a test is deliberate setup or
// teardown; it never ships and never feeds a wrong value to a user. Flagging
// them buries the real findings.
const TEST_PATH_RE = /(?:^|[\\/])(?:test|tests|__tests__|spec|e2e|fixtures?)[\\/]|\.(?:test|spec)\.[cm]?[jt]sx?$/i;

// ─── Detection rules ────────────────────────────────────────────────────────
//
// Each rule names a SHAPE, not a phrasing. A shape cannot be evaded by
// rewording; that is the whole point. Every rule errs toward flagging — a
// false flag costs one approval, a missed one costs days of debugging.

const RULES = [
  {
    id: "catch-continues",
    what: "a catch block that does not rethrow, exit, or return a failure",
    // Handled structurally in scanCatchBlocks (needs brace matching).
    structural: true,
  },
  {
    id: "or-default",
    what: "a default supplied where the left side can FAIL (not merely be absent)",
    // Only a CALL on the left counts — `find()`, `get()`, `parse()` can fail.
    // `opts.dir || '.'` is reading an optional property, which is not a failure
    // and must not be flagged; over-flagging trains bypassing.
    // Calls that cannot fail meaningfully (string/array/number helpers, and
    // reading a caught error's message) are excluded by CALL_NOT_A_FAILURE.
    re: /\b(\w+(?:\.\w+)*)\s*\(([^()\n]*)\)\s*(?:\|\||\?\?)\s*(?!\s*(?:$|;))(?:['"`]|\{|\[|\d|\w+\b)/,
    guard: (m) => !CALL_NOT_A_FAILURE.test(m[1]),
  },
  {
    id: "shell-or-true",
    what: "|| true swallowing a command failure",
    re: /\|\|\s*true\b/,
  },
  {
    id: "trace-then-continue",
    what: "a failure written to a log or trace, then execution continues",
    // console.error / logger.warn / trace(...) NOT followed by throw/return/exit.
    structural: true,
  },
  {
    id: "substituted-value",
    what: "a stand-in value used when a lookup found nothing",
    // The Marla shape: `if (!author) { return lastKnownSeller; }` — a missing
    // value replaced by a guess. Covers return, assignment, and the ternary
    // form. Returning null/undefined/false is a halt, not a substitution.
    structural: true,
  },
  {
    id: "retry-then-proceed",
    what: "a retry loop that gives up and carries on",
    structural: true,
  },
];

// Shapes that are HALTS, not fallbacks — these end the failing path.
// `deny(...)`, `halt(...)`, `fail(...)`, `block(...)` and `abort(...)` are the
// named form of the same thing: the caller stops and says why. Treating those
// as fallbacks would flag the very code that enforces this rule.
const HALT_RE = /\b(?:throw\b|process\.exit\b|return\s+(?:null|false|undefined|\{\s*ok\s*:\s*false)|reject\(|assert\b|exitCode\s*=\s*[1-9]|(?:deny|halt|fail|block|abort|bail)\s*\()/;

// Calls whose "empty" result is a normal value, not a failure. A default after
// one of these is not a fallback — `str.trim() || "none"` hides nothing.
// `match` returns null on no-match by design, `includes`/`indexOf` return a
// plain boolean/number — none of these is a failure, so a default after them
// hides nothing.
const CALL_NOT_A_FAILURE =
  /(?:^|\.)(?:trim|toString|String|Number|parseInt|parseFloat|join|slice|substring|substr|replace|replaceAll|toLowerCase|toUpperCase|padStart|padEnd|concat|filter|map|split|charAt|repeat|normalize|valueOf|toFixed|keys|values|entries|basename|dirname|extname|relative|resolve|now|match|matchAll|includes|indexOf|lastIndexOf|search|test|exec|closest|querySelector|querySelectorAll|getAttribute|trimStart|trimEnd|flat|flatMap|at|pop|shift)$/;

// `return allow()` / `return skip()` hand back a DECISION, not a stand-in
// value. A hook that decides "this write is not mine to judge" has invented
// nothing — flagging it would bury the real findings.
const DECISION_CALL_RE = /\breturn\s+(?:allow|skip|proceed|next|noop|pass)\s*\(\s*\)/;

// A `catch` that only cleans up or reports, in a place where continuing IS the
// correct behavior, still needs approval — but these host shapes are where the
// process is ALREADY ending, so continuing cannot hide anything downstream.
const CATCH_IN_TEARDOWN = /\b(?:process\.on|addEventListener|finally|beforeExit|SIGINT|SIGTERM|unref)\b/;

// ─── Approval file ──────────────────────────────────────────────────────────

/**
 * Read .gsd-t/fallbacks.json. Absent file = no approvals (the normal state).
 * A malformed file is a HALT — we must never treat "unreadable" as "approved",
 * and never as "empty" either, since both would silently change the verdict.
 *
 * @returns {{ ok: true, entries: object[] } | { ok: false, error: string }}
 */
function readApprovals(projectDir) {
  const p = path.join(projectDir, ".gsd-t", "fallbacks.json");
  if (!fs.existsSync(p)) return { ok: true, entries: [] };
  let raw;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch (e) {
    return { ok: false, error: `cannot read ${p}: ${e.message}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `${p} is not valid JSON: ${e.message}` };
  }
  const entries = Array.isArray(parsed) ? parsed : parsed && parsed.fallbacks;
  if (!Array.isArray(entries)) {
    return { ok: false, error: `${p} must be an array, or an object with a "fallbacks" array` };
  }
  const required = ["id", "location", "whatFails", "whyNotHalt", "whatItDoesInstead", "approvedBy"];
  for (const e of entries) {
    if (!e || typeof e !== "object") {
      return { ok: false, error: `${p} contains a non-object entry` };
    }
    const missing = required.filter((k) => !e[k]);
    if (missing.length) {
      return { ok: false, error: `${p} entry "${e.id || "(no id)"}" is missing: ${missing.join(", ")}` };
    }
  }
  return { ok: true, entries };
}

/**
 * Read the one-time baseline of fallbacks that already existed when the gate
 * was adopted. Absent = no baseline (the correct state for a new project).
 * Unreadable is treated as EMPTY, deliberately: that makes the gate STRICTER
 * (pre-existing findings become live), never more permissive.
 */
function readBaseline(projectDir) {
  const p = path.join(projectDir, ".gsd-t", "fallbacks-baseline.json");
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(parsed) ? parsed : (parsed.entries || []);
  } catch (_) {
    return [];
  }
}

/**
 * Match a finding to an approval by LOCATION + SHAPE, never by line number —
 * an ordinary edit above the fallback must not re-trigger it. Moving the
 * fallback to a different file DOES re-trigger, deliberately.
 */
function isApproved(finding, entries) {
  const rel = finding.file.replace(/\\/g, "/");
  return entries.some((e) => {
    const loc = String(e.location || "").replace(/\\/g, "/");
    if (!loc) return false;
    const [locFile, locSymbol] = loc.split("#");
    if (!rel.endsWith(locFile)) return false;
    if (e.rule && e.rule !== finding.rule) return false;
    if (locSymbol && finding.symbol && locSymbol !== finding.symbol) return false;
    return true;
  });
}

// ─── Source scanning ────────────────────────────────────────────────────────

function stripCommentsAndStrings(src) {
  // Blank out comments and string bodies so their text can't produce a match.
  // Length is preserved so line numbers stay correct.
  let out = "";
  let i = 0;
  const n = src.length;
  let state = null; // "line" | "block" | "'" | '"' | "`"
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === null) {
      if (c === "/" && c2 === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && c2 === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === "'" || c === '"' || c === "`") { state = c; out += c; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = null; out += "\n"; } else { out += " "; }
      i += 1; continue;
    }
    if (state === "block") {
      if (c === "*" && c2 === "/") { state = null; out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i += 1; continue;
    }
    // inside a string
    if (c === "\\") { out += "  "; i += 2; continue; }
    if (c === state) { state = null; out += c; i += 1; continue; }
    out += c === "\n" ? "\n" : " "; i += 1;
  }
  return out;
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

/**
 * Name of the function that ENCLOSES the given index.
 *
 * Walks brace depth backwards so a finding is attributed to the function it is
 * actually inside, not merely the last one declared above it. The naive
 * "nearest declaration above" reading attributes everything to whichever small
 * helper happens to sit closest, which would bind an approval to the wrong
 * place and silently approve a fallback somewhere else.
 */
function symbolAt(src, index) {
  let depth = 0;
  for (let i = index; i >= 0; i--) {
    const c = src[i];
    if (c === "}") depth++;
    else if (c === "{") {
      if (depth > 0) { depth--; continue; }
      // An unmatched `{` going backwards — this opens our enclosing block.
      const head = src.slice(Math.max(0, i - 400), i);
      const m =
        head.match(/function\s*\*?\s*(\w+)\s*\([^)]*\)\s*$/) ||
        head.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function\s*\*?\s*)?\([^)]*\)\s*(?:=>\s*)?$/) ||
        head.match(/(?:async\s+)?(\w+)\s*\([^)]*\)\s*$/);
      if (m && !["if", "for", "while", "switch", "catch", "try", "else", "do"].includes(m[1])) {
        return m[1];
      }
      // A block that is not a function (if/for/try) — keep walking outwards.
    }
  }
  return "";
}

/** Extract the body of a block starting at the given brace index. */
function blockBody(src, braceIndex) {
  let depth = 0;
  for (let i = braceIndex; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(braceIndex + 1, i);
    }
  }
  return src.slice(braceIndex + 1);
}

/**
 * Find catch blocks that swallow the failure, and log-then-continue shapes.
 * Both need brace matching, so they can't be plain regexes.
 */
function scanStructural(clean, file, findings) {
  // catch (e) { ... } with no halt inside
  const catchRe = /\bcatch\s*(?:\([^)]*\))?\s*\{/g;
  let m;
  while ((m = catchRe.exec(clean)) !== null) {
    const braceIdx = clean.indexOf("{", m.index);
    if (braceIdx === -1) continue;
    const body = blockBody(clean, braceIdx);
    if (HALT_RE.test(body)) continue; // it halts — allowed

    // Teardown/shutdown handlers: the process is already ending, so continuing
    // cannot feed a wrong value to anything downstream.
    const around = clean.slice(Math.max(0, m.index - 200), m.index);
    if (CATCH_IN_TEARDOWN.test(around)) continue;

    if (!body.trim()) {
      findings.push({
        rule: "catch-continues",
        what: "an empty catch block — the failure disappears entirely",
        file, line: lineOf(clean, m.index), symbol: symbolAt(clean, m.index),
        snippet: "catch { }",
      });
      continue;
    }

    // The dangerous shape is a catch that HANDS BACK A VALUE the caller will
    // trust. A bare `return;` / `continue;` / `break;` abandons the work — it
    // fabricates nothing, so it is not flagged.
    // Recording the failure so it gets reported is the OPPOSITE of hiding it.
    // A push onto a list literally named for undelivered/failed/missing items
    // is how a loud report gets built.
    const recordsTheFailure =
      /\b(?:notDelivered|failures?|errors?|missing|unrepairable|problems?|skipped)\b[^;\n]*\.push\s*\(/i.test(body);

    const producesValue = !recordsTheFailure && (
      (/\breturn\s+(?!;)[\w'"`[{(]/.test(body) && !DECISION_CALL_RE.test(body)) || // return <something>
      /\b\w+(?:\.\w+)*\s*=\s*(?!null\b|undefined\b)[\w'"`[{(]/.test(body) || // assigns a stand-in
      /\b\w+\.push\s*\(/.test(body));                      // appends a stand-in
    const logs = /\b(?:console\.\w+|logger?\.\w+|trace\w*|warn|debug)\s*\(/.test(body);

    if (!producesValue && !logs) continue; // abandons the work, invents nothing

    findings.push({
      rule: logs && !producesValue ? "trace-then-continue" : "catch-continues",
      what: logs && !producesValue
        ? "the failure is written to a log, then execution continues"
        : "a catch block that hands back a value instead of failing",
      file, line: lineOf(clean, m.index), symbol: symbolAt(clean, m.index),
      snippet: body.trim().split("\n")[0].slice(0, 80),
    });
  }

  // The Marla shape: a missing value replaced by a guess.
  //   if (!author)              { return lastKnownSeller; }
  //   if (author === null)      { author = defaultSeller; }
  //   const a = findAuthor() || lastKnownSeller;   (covered by or-default)
  // Returning null/undefined/false/throwing is a HALT — not flagged.
  const emptyCheckRe = /\bif\s*\(\s*(?:!\s*(\w+(?:\.\w+)*)|(\w+(?:\.\w+)*)\s*={2,3}\s*(?:null|undefined)|typeof\s+(\w+)\s*={2,3}\s*['"]undefined['"])\s*\)\s*\{/g;
  while ((m = emptyCheckRe.exec(clean)) !== null) {
    const varName = m[1] || m[2] || m[3] || "";
    const braceIdx = clean.indexOf("{", m.index);
    if (braceIdx === -1) continue;
    const body = blockBody(clean, braceIdx);
    if (HALT_RE.test(body)) continue; // stops loudly — allowed

    // A substitution stands in for THE MISSING THING. It is either returned, or
    // assigned to the very variable that was found empty. Anything else in the
    // block — logging, an early return of nothing, unrelated work — is a guard
    // clause, not a fallback.
    const returnsValue = /\breturn\s+(?!null\b|undefined\b|false\b|\[\s*\]|\{\s*\})[\w'"`[{]/.test(body);
    const assignsValue = varName
      ? new RegExp(`\\b${varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(?!=)\\s*(?!null\\b|undefined\\b)[\\w'"\`[{]`).test(body)
      : false; // with no named variable we cannot tell a substitution from ordinary work
    if (!returnsValue && !assignsValue) continue;

    findings.push({
      rule: "substituted-value",
      what: varName
        ? `"${varName}" was missing, so a stand-in value is used instead`
        : "a stand-in value is used when a lookup found nothing",
      file, line: lineOf(clean, m.index), symbol: symbolAt(clean, m.index),
      snippet: body.trim().split("\n")[0].slice(0, 80),
    });
  }

  // retry loop that gives up and proceeds
  // `\b` before the alternation is not enough: "entries" ends in "tries", so
  // `for (const e of entries)` matched — a plain iteration read as a retry loop.
  // Requiring a word boundary on BOTH sides keeps the real shapes (attempt,
  // retry, retries, tries) and drops words that merely end in one.
  const retryRe = /\b(?:for|while)\s*\([^)]*\b(?:attempt|retry|retries|tries)\b[^)]*\)\s*\{/gi;
  while ((m = retryRe.exec(clean)) !== null) {
    const braceIdx = clean.indexOf("{", m.index);
    if (braceIdx === -1) continue;
    const body = blockBody(clean, braceIdx);
    const after = clean.slice(braceIdx + body.length, braceIdx + body.length + 200);
    if (HALT_RE.test(after)) continue; // gives up loudly — allowed
    findings.push({
      rule: "retry-then-proceed",
      what: "a retry loop that gives up and carries on",
      file, line: lineOf(clean, m.index), symbol: symbolAt(clean, m.index),
      snippet: clean.slice(m.index, m.index + 60).replace(/\s+/g, " "),
    });
  }
}

/** Run every rule over one file's source. */
function scanText(src, file) {
  const findings = [];
  if (TEST_PATH_RE.test(String(file).replace(/\\/g, "/"))) return findings;
  const clean = stripCommentsAndStrings(src);
  scanStructural(clean, file, findings);

  for (const rule of RULES) {
    if (rule.structural || !rule.re) continue;
    const re = new RegExp(rule.re.source, rule.re.flags.includes("g") ? rule.re.flags : rule.re.flags + "g");
    let m;
    while ((m = re.exec(clean)) !== null) {
      if (typeof rule.guard === "function" && !rule.guard(m)) continue;
      const line = lineOf(clean, m.index);
      // Don't double-report the same line from two rules.
      if (findings.some((f) => f.line === line && f.file === file)) continue;
      findings.push({
        rule: rule.id,
        what: rule.what,
        file,
        line,
        symbol: symbolAt(clean, m.index),
        snippet: m[0].replace(/\s+/g, " ").slice(0, 80),
      });
    }
  }
  return findings;
}

// ─── Plan / contract prose scanning ─────────────────────────────────────────

const PROSE_RE = [
  { re: /\bfall(?:ing)?[ -]?back\b/i, what: "the plan describes a fallback" },
  { re: /\bif (?:it |this )?fails?,? (?:then )?(?:we |just )?(?:use|try|default|substitute|assume|continue|proceed)\b/i, what: "the plan continues after a failure" },
  { re: /\bdefaults? (?:to|back to)\b/i, what: "the plan substitutes a default" },
  { re: /\botherwise,? (?:use|assume|default|substitute)\b/i, what: "the plan substitutes a value" },
  { re: /\bgracefully degrad\w+/i, what: "the plan degrades instead of stopping" },
  { re: /\bbest[ -]effort\b/i, what: "the plan accepts a partial result" },
  { re: /\bskip(?:s|ping)? (?:the |that )?(?:failed|missing|bad)\b/i, what: "the plan skips failed items and continues" },
  { re: /\bpartial (?:result|success|invoice|record)\b/i, what: "the plan returns a partial result" },
  { re: /\blog (?:it |the error )?and continue\b/i, what: "the plan logs a failure and continues" },
];

function scanPlan(text, file) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const p of PROSE_RE) {
      if (p.re.test(line)) {
        findings.push({
          rule: "plan-describes-fallback",
          what: p.what,
          file,
          line: i + 1,
          symbol: "",
          snippet: line.trim().slice(0, 100),
        });
        break;
      }
    }
  });
  return findings;
}

// ─── Directory walk ─────────────────────────────────────────────────────────

function walk(dir, out, root) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".gsd-t") {
      if (SKIP_DIRS.has(e.name)) continue;
    }
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out, root);
    else if (SOURCE_EXT.has(path.extname(e.name))) out.push(full);
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { project: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--scan") args.scan = true;
    else if (a === "--json") args.json = true;
    else if (a === "--baseline") args.baseline = true;
    else if (a === "--text") args.text = argv[++i];
    else if (a === "--file") args.file = argv[++i];
    else if (a === "--plan") args.plan = argv[++i];
    else if (a === "--project") args.project = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const projectDir = path.resolve(args.project);

  const approvals = readApprovals(projectDir);
  if (!approvals.ok) {
    // A malformed approval file is a HALT. Never assume "empty" or "approved".
    process.stdout.write(JSON.stringify({
      ok: false, exitCode: EXIT_BAD_INPUT, error: approvals.error,
      halt: "Cannot determine which fallbacks are approved. Fix .gsd-t/fallbacks.json.",
    }, null, 2) + "\n");
    process.exit(EXIT_BAD_INPUT);
  }

  let findings = [];
  let scanned = 0;

  try {
    if (args.plan) {
      const p = path.resolve(args.plan);
      findings = scanPlan(fs.readFileSync(p, "utf8"), path.relative(projectDir, p));
      scanned = 1;
    } else if (args.scan) {
      const files = [];
      walk(projectDir, files, projectDir);
      for (const f of files) {
        try {
          findings.push(...scanText(fs.readFileSync(f, "utf8"), path.relative(projectDir, f)));
          scanned++;
        } catch (_) { /* unreadable single file — counted below as not scanned */ }
      }
    } else if (typeof args.text === "string") {
      const rel = args.file ? path.relative(projectDir, path.resolve(args.file)) : "(stdin)";
      const ext = path.extname(rel);
      findings = (ext === ".md" ? scanPlan : scanText)(args.text, rel);
      scanned = 1;
    } else if (args.file) {
      const p = path.resolve(args.file);
      const rel = path.relative(projectDir, p);
      const src = fs.readFileSync(p, "utf8");
      findings = (path.extname(p) === ".md" ? scanPlan : scanText)(src, rel);
      scanned = 1;
    } else {
      process.stdout.write(JSON.stringify({
        ok: false, exitCode: EXIT_BAD_INPUT,
        error: "nothing to check — pass --file, --text, --plan, or --scan",
      }, null, 2) + "\n");
      process.exit(EXIT_BAD_INPUT);
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({
      ok: false, exitCode: EXIT_BAD_INPUT, error: e.message,
      halt: "Could not read the input. Not reporting clean — that would hide a real finding.",
    }, null, 2) + "\n");
    process.exit(EXIT_BAD_INPUT);
  }

  // --baseline: record everything already in the codebase as pre-existing, so
  // the gate governs NEW work only. Seeded ONCE — a re-seed would let a fresh
  // fallback slip in under cover of the baseline, which is the very thing this
  // tool exists to stop.
  if (args.baseline) {
    const outPath = path.join(projectDir, ".gsd-t", "fallbacks-baseline.json");
    if (fs.existsSync(outPath)) {
      process.stdout.write(JSON.stringify({
        ok: false, exitCode: EXIT_BAD_INPUT,
        error: `${outPath} already exists`,
        halt: "The baseline is seeded once, never re-seeded. Delete it deliberately if you truly mean to reset.",
      }, null, 2) + "\n");
      process.exit(EXIT_BAD_INPUT);
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({
      seededAt: new Date().toISOString(),
      note: "Fallbacks already present when the gate was adopted. Not approved — merely pre-existing. Fix them over time; the gate blocks NEW ones.",
      entries: findings.map((f) => ({ file: f.file, rule: f.rule, symbol: f.symbol, snippet: f.snippet })),
    }, null, 2) + "\n");
    process.stdout.write(JSON.stringify({
      ok: true, exitCode: EXIT_CLEAN, baselineWritten: outPath, recorded: findings.length,
    }, null, 2) + "\n");
    process.exit(EXIT_CLEAN);
  }

  // Pre-existing findings are excluded from the verdict but still counted, so
  // the debt stays visible instead of disappearing.
  // Pre-existing findings are matched on file + rule + the code itself, NOT on
  // the enclosing function name. A function rename, or an improvement to how
  // the name is derived, must not resurrect 500 old findings as if they were
  // new work — that would bury the handful that actually are.
  const baseline = readBaseline(projectDir);
  const isPreExisting = (f) => baseline.some(
    (b) => b.file === f.file && b.rule === f.rule && b.snippet === f.snippet
  );

  const preExisting = findings.filter(isPreExisting).length;
  const live = findings.filter((f) => !isPreExisting(f));
  const unapproved = live.filter((f) => !isApproved(f, approvals.entries));
  const approved = live.length - unapproved.length;

  const result = {
    ok: unapproved.length === 0,
    exitCode: unapproved.length === 0 ? EXIT_CLEAN : EXIT_FOUND,
    filesScanned: scanned,
    found: findings.length,
    preExisting,
    approved,
    unapproved: unapproved.length,
    findings: unapproved,
  };

  if (args.json || !process.stdout.isTTY) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    if (result.ok) {
      process.stdout.write(`No unapproved fallbacks (${scanned} file(s) checked).\n`);
    } else {
      process.stdout.write(`${unapproved.length} unapproved fallback(s):\n\n`);
      for (const f of unapproved) {
        process.stdout.write(`  ${f.file}:${f.line}${f.symbol ? ` in ${f.symbol}` : ""}\n`);
        process.stdout.write(`    ${f.what}\n`);
        process.stdout.write(`    ${f.snippet}\n\n`);
      }
    }
  }
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = { scanText, scanPlan, readApprovals, isApproved, stripCommentsAndStrings };
