#!/usr/bin/env node
/**
 * gsd-t-pseudocode-style — the §1.1 flow-line style gate.
 *
 * Contract: .gsd-t/contracts/pseudocode-source-of-truth-contract.md §1.1
 *
 * WHY THIS EXISTS
 * ---------------
 * §1 governed what a PseudoCode doc CONTAINS; nothing governed how it READS.
 * The corpus drifted into transliterated source code (`loadStore(storePath):`,
 * `spawnSync`, `MODULE_NOT_FOUND`, `→ 409`) wrapped in paragraphs of preamble —
 * a document the reader has to translate line-by-line, which defeats its only
 * purpose (approving DIRECTION before code). This gate holds the readable half:
 * the flow reads as a nested decision tree in plain English, and a technical
 * term rides ALONGSIDE plain words in parentheses instead of replacing them.
 *
 * SCOPE — the flow block only (§1.1.5)
 * ------------------------------------
 * Checks fenced blocks ABOVE the first `---` divider, plus the flow blocks under
 * `## What it does today` / `## What changes`. Everything below the divider is
 * exempt: that is where the §2 `[RULE]` guard map, divergence flags, Six-Stage
 * answers, and file/function pointers legitimately live. So this gate can never
 * fight the §2 grammar.
 *
 * Deterministic code, zero LLM judgment (same split as §2: an LLM may PRODUCE a
 * doc, code GATES it). Never throws — bad input returns exitCode 64.
 *
 * Input:  --doc <path> [--json]   |   --dir <pseudocode dir> [--json]
 * Output: JSON envelope { ok, exitCode, violations: [...] }
 * Exit:   0 clean · 4 style violations · 64 bad input
 */

"use strict";

const fs = require("fs");
const path = require("path");

/** Basename-per-line opt-out list for docs authored before contract v1.2.0. */
const GRANDFATHER_FILE = ".style-grandfathered";

/**
 * Category-nouns that force a mental translation when they appear bare.
 * A term here must carry a parenthetical gloss on FIRST use within its `##`
 * section (§1.1.3). Concrete real names (Zoom, /zoom/events, the invoices
 * table) are deliberately absent — they are specific, so nothing must be
 * decoded.
 */
const JARGON_TERMS = [
  "webhook", "payload", "endpoint", "handler", "middleware", "token",
  "cache", "mutex", "idempotent", "serialize", "deserialize", "marshal",
  "envelope", "socket", "daemon", "cron", "regex", "schema", "hash",
];

/** Code keywords that mean the author transliterated source instead of behavior. */
const CODE_KEYWORDS = [
  "return", "throw", "catch", "finally", "await", "async", "yield",
  "const", "let", "var", "function", "class", "import", "export",
  "elif", "endif", "null", "undefined", "void",
];

/**
 * Split a doc into the region the gate checks and the exempt region.
 * @param {string} text
 * @returns {{ flowRegion: string, flowStartLine: number, extraRegions: Array<{text:string,startLine:number,section:string}> }}
 */
function splitRegions(text) {
  const lines = text.split("\n");

  // The header region ends at the first `---` divider that sits OUTSIDE a fence.
  let inFence = false;
  let dividerIdx = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*```/.test(l)) { inFence = !inFence; continue; }
    if (!inFence && /^---\s*$/.test(l)) { dividerIdx = i; break; }
  }

  const flowRegion = lines.slice(0, dividerIdx).join("\n");

  // Below the divider, only the two named before/after flow sections are checked.
  const extraRegions = [];
  const FLOW_SECTION = /^##\s+(What it does today|What changes)\s*$/i;
  let cur = null;
  inFence = false;
  for (let i = dividerIdx; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*```/.test(l)) { inFence = !inFence; if (cur) cur.lines.push(l); continue; }
    if (!inFence && /^##\s+/.test(l)) {
      if (cur) extraRegions.push({ text: cur.lines.join("\n"), startLine: cur.startLine, section: cur.section });
      const m = l.match(FLOW_SECTION);
      cur = m ? { lines: [], startLine: i + 2, section: m[1] } : null;
      continue;
    }
    if (cur) cur.lines.push(l);
  }
  if (cur) extraRegions.push({ text: cur.lines.join("\n"), startLine: cur.startLine, section: cur.section });

  return { flowRegion, flowStartLine: 1, extraRegions };
}

/**
 * Pull the fenced code blocks out of a region — the flow lines live inside them.
 * @returns {Array<{lines: string[], startLine: number}>}
 */
function fencedBlocks(regionText, regionStartLine) {
  const out = [];
  const lines = regionText.split("\n");
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) {
      if (cur) { out.push(cur); cur = null; }
      else cur = { lines: [], startLine: regionStartLine + i + 1 };
      continue;
    }
    if (cur) cur.lines.push(lines[i]);
  }
  if (cur) out.push(cur); // unterminated fence — still check what we got
  return out;
}

/** Strip parenthetical glosses and trailing `# comment` before keyword scanning. */
function stripGlosses(line) {
  return line.replace(/\([^)]*\)/g, " ").replace(/#.*$/, " ");
}

/**
 * Check one flow line for the §1.1.2 banned forms.
 * @returns {string[]} rule names broken
 */
function checkLine(rawLine, glossedTerms) {
  const broken = [];
  const line = rawLine.trimEnd();
  if (!line.trim()) return broken;

  const bare = stripGlosses(line);

  // Function-call syntax: `name(...)` or `obj.method(...)`.
  if (/[A-Za-z_][A-Za-z0-9_.]*\s*\([^)]*\)\s*:?/.test(line.replace(/\([^)]*\)/g, (m, off) => {
    // A parenthetical gloss follows a space and starts with a lowercase word or
    // "the"/"its" — that is prose, not a call. Keep call-shaped ones for the test.
    const before = line.slice(0, off);
    return /[A-Za-z0-9_.]$/.test(before) ? m : " ";
  }))) {
    broken.push("no-function-call-syntax");
  }

  // Code keywords as standalone words.
  for (const kw of CODE_KEYWORDS) {
    if (new RegExp(`(^|[^A-Za-z0-9_])${kw}([^A-Za-z0-9_]|$)`, "i").test(bare)) {
      broken.push(`no-code-keyword:${kw}`);
      break;
    }
  }
  // `if`/`else` only count when they open a clause — "Is it valid:" is the form we want.
  if (/(^|[^A-Za-z0-9_])(if|else)\s/i.test(bare)) broken.push("no-code-keyword:if/else");
  if (/(^|\s)tx\s*:/i.test(bare)) broken.push("no-code-keyword:tx");

  // Arrow-to-status and SCREAMING_SNAKE error constants, unless glossed.
  if (/→\s*\d{3}\b/.test(bare) || /\b(?:HTTP\s*)?\b[45]\d\d\b(?=\s*$)/.test(bare.trim())) {
    broken.push("no-bare-status-code");
  }
  if (/\b[A-Z][A-Z0-9]*_[A-Z0-9_]{2,}\b/.test(bare)) broken.push("no-bare-error-constant");

  // Un-glossed category-noun on first use in this section.
  for (const term of JARGON_TERMS) {
    const re = new RegExp(`(^|[^A-Za-z])${term}s?([^A-Za-z]|$)`, "i");
    if (!re.test(line)) continue;
    const hasGloss = new RegExp(`${term}s?\\s*\\([^)]+\\)`, "i").test(line);
    if (hasGloss) { glossedTerms.add(term); continue; }
    if (!glossedTerms.has(term)) broken.push(`gloss-on-first-use:${term}`);
  }

  return broken;
}

/**
 * Prose-paragraph detection: a flow line with no question colon, no outcome
 * prefix, and sentence-length wording is a paragraph the user asked to remove.
 */
function looksLikeParagraph(line) {
  const t = line.trim();
  if (t.length < 90) return false;
  if (/:\s*$/.test(t)) return false;                       // question line
  if (/^(Yes|No|[A-Z][A-Za-z ]{0,20}):/.test(t)) return false; // outcome line
  return /[.!?]\s+[A-Z]/.test(t);                          // 2+ sentences
}

/**
 * Gate one doc.
 * @returns {{ ok, exitCode, doc, violations, skipped?, reason? }}
 */
function gateDoc(docPath, grandfathered) {
  let text;
  try {
    text = fs.readFileSync(docPath, "utf8");
  } catch (e) {
    return { ok: false, exitCode: 64, doc: docPath, reason: `cannot read doc: ${e && e.message}`, violations: [] };
  }

  const base = path.basename(docPath);
  if (grandfathered.has(base)) {
    // A logged skip WITH A REASON — never a silent pass (feedback_no_silent_degradation).
    return { ok: true, exitCode: 0, doc: docPath, skipped: true, reason: "grandfathered", violations: [] };
  }

  const { flowRegion, flowStartLine, extraRegions } = splitRegions(text);
  const violations = [];

  const regions = [
    { blocks: fencedBlocks(flowRegion, flowStartLine - 1), section: "(flow)" },
    ...extraRegions.map((r) => ({ blocks: fencedBlocks(r.text, r.startLine - 1), section: r.section })),
  ];

  let sawAnyFlowLine = false;
  for (const region of regions) {
    // Gloss scope is the `##` section (§1.1.3) — reset per region.
    const glossedTerms = new Set();
    for (const block of region.blocks) {
      for (let i = 0; i < block.lines.length; i++) {
        const raw = block.lines[i];
        const lineNo = block.startLine + i;
        if (raw.trim()) sawAnyFlowLine = true;
        for (const rule of checkLine(raw, glossedTerms)) {
          violations.push({ doc: docPath, line: lineNo, section: region.section, rule, text: raw.trim().slice(0, 120) });
        }
        if (looksLikeParagraph(raw)) {
          violations.push({ doc: docPath, line: lineNo, section: region.section, rule: "no-paragraph-in-flow", text: raw.trim().slice(0, 120) });
        }
      }
    }
  }

  // Non-vacuity: a doc with no flow lines at all cannot pass by having nothing
  // to check (the §2/§3 vacuous-pass class).
  if (!sawAnyFlowLine) {
    return {
      ok: false, exitCode: 4, doc: docPath, violations: [
        { doc: docPath, line: 1, section: "(flow)", rule: "no-flow-block", text: "no fenced flow block found above the first --- divider" },
      ],
    };
  }

  return { ok: violations.length === 0, exitCode: violations.length === 0 ? 0 : 4, doc: docPath, violations };
}

/** Read the grandfather list from the doc's own directory. */
function loadGrandfathered(dir) {
  const out = new Set();
  try {
    const raw = fs.readFileSync(path.join(dir, GRANDFATHER_FILE), "utf8");
    for (const l of raw.split("\n")) {
      const t = l.trim();
      if (t && !t.startsWith("#")) out.add(t);
    }
  } catch { /* absent list = nothing grandfathered */ }
  return out;
}

/**
 * Run the gate over one doc or a whole directory (§7 discovery glob).
 * Never throws.
 */
function run({ doc, dir }) {
  if (!doc && !dir) {
    return { ok: false, exitCode: 64, reason: "missing --doc and/or --dir", violations: [] };
  }

  const docs = [];
  if (doc) docs.push(doc);
  if (dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch (e) {
      return { ok: false, exitCode: 64, reason: `cannot read dir: ${e && e.message}`, violations: [] };
    }
    for (const e of entries) {
      if (/^PseudoCode-.*\.md$/.test(e) && e !== "PseudoCode-spec.md") docs.push(path.join(dir, e));
    }
    if (docs.length === 0) {
      // Legitimately nothing to gate — surfaced, not silent (§7 pairing outcomes).
      return { ok: true, exitCode: 0, docsChecked: 0, skips: [{ reason: "no-pseudocode-docs" }], violations: [] };
    }
  }

  const results = [];
  const violations = [];
  const skips = [];
  let worstExit = 0;
  for (const d of docs) {
    const r = gateDoc(d, loadGrandfathered(path.dirname(d)));
    results.push({ doc: d, ok: r.ok, exitCode: r.exitCode, skipped: !!r.skipped, reason: r.reason });
    if (r.skipped) skips.push({ doc: d, reason: r.reason });
    for (const v of r.violations) violations.push(v);
    if (r.exitCode > worstExit) worstExit = r.exitCode;
  }

  return {
    ok: worstExit === 0,
    exitCode: worstExit,
    docsChecked: docs.length,
    results,
    skips,
    violations,
  };
}

function parseArgs(argv) {
  const o = { doc: null, dir: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--doc") o.doc = argv[++i];
    else if (a === "--dir") o.dir = argv[++i];
    else if (a === "--json") { /* JSON is the only output */ }
  }
  return o;
}

const HELP = `Usage: gsd-t pseudocode-style (--doc <PseudoCode-[Title].md> | --dir <dir>) [--json]

Gates the §1.1 flow-line style of a PseudoCode doc: the flow reads as a nested
decision tree in plain English, technical terms ride alongside plain words in
parentheses, and code identifiers stay below the first --- divider.

  --doc PATH   gate one doc.
  --dir PATH   gate every PseudoCode-*.md in a directory (§7 discovery).

Exit: 0 clean · 4 style violations · 64 bad input.
Pre-v1.2.0 docs listed in <dir>/${GRANDFATHER_FILE} are skipped WITH a reason.`;

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { process.stdout.write(HELP + "\n"); process.exit(0); }
  let res;
  try {
    res = run(o);
  } catch (e) {
    res = { ok: false, exitCode: 64, reason: `gate-error: ${e && e.message}`, violations: [] };
  }
  process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  process.exit(res.exitCode);
}

if (require.main === module) main();

module.exports = { run, gateDoc, checkLine, splitRegions, fencedBlocks, looksLikeParagraph, JARGON_TERMS, CODE_KEYWORDS };
