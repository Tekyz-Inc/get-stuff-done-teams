#!/usr/bin/env node
/**
 * gsd-t-rule-mine.cjs
 *
 * M109-D2 — Finds every rule already stated in a project, so David can tick the
 * ones that can never be broken instead of trying to recall them.
 *
 * [RULE] rule-mine-never-invents-a-rule
 * [RULE] rule-mine-shows-where-each-came-from
 * [RULE] rule-mine-keeps-what-it-cannot-rank
 *
 * Six sources, best evidence first. A rule found in three places ranks top —
 * repetition IS the evidence.
 *
 * Every rule carries where it came from. That column is what makes the list
 * fast to read: David is confirming something he already said, not recalling it.
 *
 * ─── Usage ──────────────────────────────────────────────────────────────────
 *   node gsd-t-rule-mine.cjs --project <dir> [--json] [--top N]
 *
 * ─── Exit codes ─────────────────────────────────────────────────────────────
 *   0  found rules
 *   4  found none — the caller must ask, never write a rules section anyway
 *   64 a source exists but could not be read
 *
 * Zero dependencies.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const EXIT_OK = 0;
const EXIT_NONE = 4;
const EXIT_UNREADABLE = 64;

const DEFAULT_TOP = 12;   // more than this on screen has already failed

/** Thrown when a source exists but cannot be read. Never treated as absent. */
class Unreadable extends Error {}

/**
 * Lines that state a rule. Deliberately broad — a rule wrongly included costs
 * one glance, a rule missed costs a broken build.
 */
const RULE_SHAPE = new RegExp([
  "\\bnever\\b",
  "\\balways\\b",
  "\\bmust (not |never )?\\b",
  "\\bdo not\\b|\\bdon'?t\\b",
  "\\bforbidden\\b|\\bbanned\\b|\\bprohibited\\b",
  "\\brequired\\b|\\bmandatory\\b",
  "\\bonly ever\\b|\\bunder no circumstances\\b",
  "\\bread-?only\\b",
  "\\bno-?fallback\\b",
].join("|"), "i");

// Prose that mentions a rule without being one.
const NOT_A_RULE = [
  /^#{1,6}\s/,                     // a heading
  /^\|.*\|.*\|/,                   // a table row
  /^\s*```/,
  /^\s*[-*]\s*\[[ x]\]/i,          // a checklist item
  /\bfor example\b|\be\.g\.\b/i,
  /^\s*<!--/,
];

function clean(line) {
  return line
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+\.\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

/**
 * The claim a rule makes, stripped of wording, so the same rule stated three
 * different ways collapses to one entry.
 */
function claimKey(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w))
    .sort()
    .slice(0, 8)
    .join(" ");
}

const STOP = new Set([
  "never", "always", "must", "should", "would", "could", "does", "this", "that",
  "with", "from", "into", "when", "what", "which", "have", "been", "will",
  "they", "them", "then", "than", "your", "yours", "make", "made", "only",
  "ever", "under", "unless", "because", "there", "their", "these", "those",
]);

/**
 * A fragment is a piece of a sentence torn out of a paragraph — "domain never
 * opens orders.ts.", "empty/flagged), never javascript:/data:.". It reads as a
 * rule to a pattern but tells a human nothing they can act on, and it buries
 * the real rules. A rule must start like a sentence and stand on its own.
 */
function isFragment(t) {
  if (/^[a-z]/.test(t)) return true;               // starts mid-sentence
  if (/^[>)\]}]/.test(t)) return true;             // a quote or a stray bracket
  if (/^(and|but|or|so|then|which|that|where|when)\b/i.test(t)) return true;
  if (/[([{]/.test(t) && !/[)\]}]/.test(t)) return true;  // an unclosed bracket
  if (/:$/.test(t)) return true;                   // a label, not a rule
  const words = t.split(/\s+/).length;
  return words < 4;
}

function push(out, text, source, detail) {
  const t = clean(text);
  if (t.length < 15 || t.length > 300) return;
  if (!RULE_SHAPE.test(t)) return;
  if (NOT_A_RULE.some((re) => re.test(text))) return;
  if (isFragment(t)) return;
  out.push({ text: t, source, detail: detail || "" });
}

/** Read a file, or throw. An unreadable source is never reported as absent. */
function readOr(p, label) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch (e) {
    throw new Unreadable(`${label} exists but could not be read: ${e.message}`);
  }
}

/** 1. Contracts — already written as rules, with their reasons. */
function fromContracts(projectDir, found) {
  const dir = path.join(projectDir, ".gsd-t", "contracts");
  if (!fs.existsSync(dir)) return { present: false };
  let names;
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch (e) {
    throw new Unreadable(`${dir} exists but could not be listed: ${e.message}`);
  }
  let n = 0;
  for (const name of names) {
    const text = readOr(path.join(dir, name), name);
    for (const line of text.split("\n")) {
      const before = found.length;
      push(found, line, "contract", name.replace(/\.md$/, ""));
      if (found.length > before) n++;
    }
  }
  return { present: true, count: n, files: names.length };
}

/**
 * A rule announced by its own heading — "## The Inviolable Rule (HC-005) —
 * NEVER scan the whole page". These are the rules that matter most, and reading
 * line-by-line misses them entirely: the heading states the rule and the
 * paragraph beneath explains it.
 */
const RULE_HEADING = /^#{2,4}\s+(.*(?:inviolable|hard rule|hc-\d+|never|must not|forbidden|non-goal|do not).*)$/i;

function fromHeadings(text, found, source, detail) {
  let n = 0;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(RULE_HEADING);
    if (!m) continue;
    // The heading is the rule. Strip the section marker and any id in brackets,
    // then keep the part that states the requirement.
    let t = clean(m[1]).replace(/^The Inviolable Rule\s*/i, "").replace(/^\(([^)]+)\)\s*[—-]?\s*/, "");
    const id = (m[1].match(/HC-\d+/i) || [])[0] || "";
    if (t.length < 8) {
      // The heading is only an id — the rule is the first real line beneath it.
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const c = clean(lines[j]);
        if (c.length > 20 && !/^#{1,6}\s/.test(lines[j])) { t = c; break; }
      }
    }
    if (t.length < 15) continue;
    found.push({
      text: t.length > 200 ? t.slice(0, 200) + "…" : t,
      source,
      detail: id || detail || "",
      heading: true,
    });
    n++;
  }
  return n;
}

/** 2. The existing CLAUDE.md, minus anything restating a global rule. */
function fromClaudeMd(projectDir, found, globalText) {
  const p = path.join(projectDir, "CLAUDE.md");
  if (!fs.existsSync(p)) return { present: false };
  const text = readOr(p, "CLAUDE.md");

  // Headed rules first — these are the ones that matter.
  let n = fromHeadings(text, found, "existing CLAUDE.md", "");

  let restated = 0;
  for (const line of text.split("\n")) {
    const t = clean(line);
    if (globalText && t.length > 40 && globalText.includes(t)) { restated++; continue; }
    const before = found.length;
    push(found, line, "existing CLAUDE.md", "");
    if (found.length > before) n++;
  }
  return { present: true, count: n, restatedFromGlobal: restated };
}

/** 3. [RULE] markers in the pseudocode docs — machine-findable by design. */
function fromPseudocode(projectDir, found) {
  const dir = path.join(projectDir, ".gsd-t", "pseudocode");
  if (!fs.existsSync(dir)) return { present: false };
  let names;
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch (e) {
    throw new Unreadable(`${dir} exists but could not be listed: ${e.message}`);
  }
  let n = 0;
  for (const name of names) {
    const text = readOr(path.join(dir, name), name);
    for (const line of text.split("\n")) {
      if (!/\[RULE\]/.test(line)) continue;
      const t = clean(line.replace(/\[RULE\]\s*/, "").replace(/-/g, " "));
      if (t.length < 10) continue;
      found.push({ text: t, source: "pseudocode", detail: name.replace(/^PseudoCode-|\.md$/g, "") });
      n++;
    }
  }
  return { present: true, count: n };
}

/** 4. A project-local hook is a rule somebody already enforced in code. */
function fromHooks(projectDir, found) {
  const p = path.join(projectDir, ".claude", "settings.json");
  if (!fs.existsSync(p)) return { present: false };
  const raw = readOr(p, ".claude/settings.json");
  let settings;
  try {
    settings = JSON.parse(raw);
  } catch (e) {
    throw new Unreadable(`.claude/settings.json exists but is not valid JSON: ${e.message}`);
  }
  let n = 0;
  for (const [event, arr] of Object.entries((settings && settings.hooks) || {})) {
    for (const m of arr || []) {
      for (const h of (m.hooks || [])) {
        const cmd = h.command || "";
        const script = (cmd.match(/([\w-]+)\.(?:js|cjs|sh)/) || [])[1];
        if (!script) continue;
        // A project-local guard names the rule it enforces; only its own count.
        if (!cmd.includes(projectDir) && !cmd.includes("./")) continue;
        found.push({
          text: `Enforced by a hook on ${event}: ${script.replace(/-/g, " ")}`,
          source: "project hook",
          detail: script,
        });
        n++;
      }
    }
  }
  return { present: true, count: n };
}

/** 5. Decision-log entries recording a directive from the user. */
function fromDecisionLog(projectDir, found) {
  const p = path.join(projectDir, ".gsd-t", "progress.md");
  if (!fs.existsSync(p)) return { present: false };
  const text = readOr(p, "progress.md");
  const start = text.indexOf("## Decision Log");
  if (start === -1) return { present: false };
  let n = 0;
  for (const line of text.slice(start).split("\n")) {
    if (!/^-\s+\d{4}-\d{2}-\d{2}/.test(line)) continue;
    if (!/USER DIRECTIVE|hard rule|David'?s (call|ruling|decision)|never again/i.test(line)) continue;
    // Take the sentence that states the rule, not the whole entry.
    const sentences = line.split(/(?<=[.!?])\s+/);
    for (const s of sentences) {
      const before = found.length;
      push(found, s, "decision log", (line.match(/^-\s+(\d{4}-\d{2}-\d{2})/) || [])[1] || "");
      if (found.length > before) { n++; break; }
    }
  }
  return { present: true, count: n };
}

/** 6. Files fixed the same way repeatedly — a rule nobody wrote down. */
function fromGit(projectDir, found) {
  if (!fs.existsSync(path.join(projectDir, ".git"))) return { present: false };
  let out;
  try {
    out = execFileSync("git", ["-C", projectDir, "log", "-i", "--name-only",
      "--pretty=format:", "--grep=fix", "-n", "300"],
      { encoding: "utf8", timeout: 20000, maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    throw new Unreadable(`.git exists but git log failed: ${e.message}`);
  }
  const counts = {};
  for (const f of out.split("\n")) {
    const name = f.trim();
    if (!name) continue;
    counts[name] = (counts[name] || 0) + 1;
  }
  const hot = Object.entries(counts).filter(([, n]) => n >= 5)
    .sort((a, b) => b[1] - a[1]).slice(0, 6);
  for (const [file, fixes] of hot) {
    found.push({
      text: `Changes to ${file} are riskier than they look — fixed ${fixes} times`,
      source: "git",
      detail: `${fixes} fixes`,
    });
  }
  return { present: true, count: hot.length };
}

/**
 * Collapse the same rule stated in several places into one entry, keeping the
 * clearest wording and merging where it came from. Rank by how many DIFFERENT
 * sources agree — repetition is the evidence.
 */
function merge(found) {
  const byClaim = new Map();
  for (const r of found) {
    const key = claimKey(r.text);
    if (!key) continue;
    if (!byClaim.has(key)) {
      byClaim.set(key, { text: r.text, sources: new Map() });
    }
    const entry = byClaim.get(key);
    // A rule that had its own heading is the authoritative wording — it beats a
    // sentence found mid-paragraph, whatever the lengths.
    if (r.heading && !entry.heading) { entry.text = r.text; entry.heading = true; }
    else if (!entry.heading && r.text.length < entry.text.length && r.text.length > 25) entry.text = r.text;

    if (!entry.sources.has(r.source)) entry.sources.set(r.source, []);
    const list = entry.sources.get(r.source);
    if (r.detail && !list.includes(r.detail)) list.push(r.detail);
  }

  return [...byClaim.values()]
    .map((e) => ({
      text: e.text,
      seenIn: [...e.sources.entries()].map(([s, d]) => (d.length ? `${s} (${d.slice(0, 2).join(", ")})` : s)),
      sourceCount: e.sources.size,
      heading: !!e.heading,
      // A rule stated as a whole sentence beats a fragment. "Consumers
      // (read-only):" is a table header, not a rule anybody can act on.
      wellFormed: /\s(never|always|must|do not|don't|only|no)\s/i.test(e.text) && !/:$/.test(e.text),
    }))
    .sort((a, b) =>
      (Number(b.heading) - Number(a.heading)) ||
      (Number(b.wellFormed) - Number(a.wellFormed)) ||
      (b.sourceCount - a.sourceCount) ||
      (a.text.length - b.text.length));
}

function parseArgs(argv) {
  const args = { project: process.cwd(), top: DEFAULT_TOP };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--project") args.project = argv[++i];
    else if (a === "--top") args.top = parseInt(argv[++i], 10) || DEFAULT_TOP;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const projectDir = path.resolve(args.project);
  const asJson = args.json || !process.stdout.isTTY;

  let globalText = "";
  const globalPath = path.join(process.env.HOME || "", ".claude", "CLAUDE.md");
  if (fs.existsSync(globalPath)) {
    try { globalText = fs.readFileSync(globalPath, "utf8"); } catch (e) {
      // The global file decides which project rules are mere restatements.
      // Without it every restated rule would be listed as project-specific.
      process.stdout.write(JSON.stringify({
        ok: false, exitCode: EXIT_UNREADABLE,
        halt: `The global CLAUDE.md exists at ${globalPath} but could not be read: ${e.message}. ` +
              `Without it, rules copied from the global file would be listed as if this project invented them.`,
      }, null, 2) + "\n");
      process.exit(EXIT_UNREADABLE);
    }
  }

  const found = [];
  let sources;
  try {
    sources = {
      contracts: fromContracts(projectDir, found),
      claudeMd: fromClaudeMd(projectDir, found, globalText),
      pseudocode: fromPseudocode(projectDir, found),
      hooks: fromHooks(projectDir, found),
      decisionLog: fromDecisionLog(projectDir, found),
      git: fromGit(projectDir, found),
    };
  } catch (e) {
    if (e instanceof Unreadable) {
      const msg = `${e.message}\n\nThis source exists, so the rules in it belong in the list. ` +
                  `Continuing would offer a list that looks complete but isn't.`;
      if (asJson) process.stdout.write(JSON.stringify({ ok: false, exitCode: EXIT_UNREADABLE, halt: msg }, null, 2) + "\n");
      else process.stderr.write(`[gsd-t] ${msg}\n`);
      process.exit(EXIT_UNREADABLE);
    }
    throw e;
  }

  const rules = merge(found);
  const shown = rules.slice(0, args.top);
  const rest = rules.slice(args.top);

  const result = {
    ok: rules.length > 0,
    exitCode: rules.length > 0 ? EXIT_OK : EXIT_NONE,
    project: path.basename(projectDir),
    sources: Object.fromEntries(Object.entries(sources).map(([k, v]) =>
      [k, v.present ? `${v.count} found` : "none"])),
    total: rules.length,
    shown: shown.map((r, i) => ({ n: i + 1, ...r })),
    remainder: rest.length,
    remainderRules: rest,
  };

  if (!rules.length) {
    result.halt = "No rules found anywhere in this project. Do not write a rules section — ask the user.";
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (!rules.length) {
    process.stdout.write(`No rules found in ${result.project}.\n`);
  } else {
    process.stdout.write(`\n${shown.length} candidate rules for ${result.project}. `);
    process.stdout.write(`Tick the ones that must NEVER be broken.\n\n`);
    process.stdout.write(`     RULE${" ".repeat(62)}SEEN IN\n`);
    shown.forEach((r, i) => {
      const words = r.text.split(" ");
      const lines = [];
      let cur = "";
      for (const w of words) {
        if ((cur + " " + w).trim().length > 60) { lines.push(cur.trim()); cur = w; }
        else cur += " " + w;
      }
      if (cur.trim()) lines.push(cur.trim());
      const seen = r.seenIn.join(" + ");
      process.stdout.write(`${String(i + 1).padStart(2)} [ ] ${lines[0].padEnd(62)}${seen}\n`);
      for (const l of lines.slice(1)) process.stdout.write(`       ${l}\n`);
    });
    if (rest.length) {
      process.stdout.write(`\n  (${rest.length} more written to .gsd-t/setup-rules-full.md — none dropped)\n`);
    }
    process.stdout.write(`\nTick numbers (e.g. 1,3,4) or 'all':\n`);
  }
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = { merge, claimKey, RULE_SHAPE, clean, Unreadable };
