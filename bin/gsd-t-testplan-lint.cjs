#!/usr/bin/env node
/**
 * gsd-t-testplan-lint — the A2 test-plan shape gate.
 *
 * Contract: .gsd-t/contracts/test-plan-first-contract.md §2–§4
 * Mold:     templates/TestPlan-spec.md
 *
 * WHY THIS EXISTS
 * ---------------
 * A test plan (`TestPlan-[FeatureArea].md`) is what a reviewer approves BEFORE
 * any test exists — the row schema and the self-answered-visibility rule are
 * the whole reason it can be trusted at a glance. This gate checks a plan
 * against that schema BEFORE the reviewer ever sees it
 * (`[RULE] plan-gated-before-presentation`): the required section set in
 * order, the six-column table header exactly, every row in exactly one of
 * the three states, `Effect on saved data` and `Source` never blank, and the
 * `## Decided without you` group present and exactly matching the set of
 * self-answered rows.
 *
 * Modelled on the proven shape of `bin/gsd-t-pseudocode-style.cjs`: zero deps,
 * deterministic, never throws, one JSON envelope, the 0/4/64 exit triple
 * frozen by the contract §4. The `main()` catch→exit-64 wrapper below is that
 * SAME frozen halt shape (contract §4: "a gate that cannot decide exits `64`
 * ... never exits `0` by default") — a HALT, not a fallback: it stops and
 * reports rather than continuing past a failure with a guessed result.
 *
 * Input:  --doc <path> [--json]   |   --dir <dir of TestPlan-*.md> [--json]
 * Output: JSON envelope { ok, exitCode, violations: [ {kind, detail} ] }
 * Exit:   0 clean · 4 shape violations · 64 bad input
 */

"use strict";

const fs = require("fs");
const { walkSections, parseRows } = require("./gsd-t-testplan-rows.cjs");
const path = require("path");

// ─── frozen literals (contract §2–§3) ─────────────────────────────────────

const HEADING_DECIDED = "## Decided without you";
const MARKER_SELF_ANSWERED = "DECIDED-WITHOUT-YOU";
const MARKER_GAP = "GAP";
const MARKER_CONTRADICTION = "GAP:CONTRADICTION";
const NONE_SOURCED_SENTENCE = "None — every row is sourced.";

// The frozen six-column header, exact text (contract §2.1).
const REQUIRED_COLUMNS = [
  "Seq",
  "Setup / date",
  "Action",
  "Expected result",
  "Effect on saved data",
  "Source",
];

// Required top-level sections, in order (mold §"Section order below is FIXED"):
// Decided without you, at least one Table, Open gaps, Sign-off.
const REQUIRED_SECTIONS_IN_ORDER = [
  { key: "decided-without-you", test: (h) => h === HEADING_DECIDED },
  { key: "table", test: (h) => /^## Table:\s*\S/.test(h), repeatable: true },
  { key: "open-gaps", test: (h) => h === "## Open gaps" },
  { key: "sign-off", test: (h) => h === "## Sign-off" },
];

// ─── parsing (structural, positional — never a substring scan) ────────────

/**
 * Split a document into an ordered list of `##`-heading sections, each
 * carrying its raw text and starting line number. Fenced code blocks are
 * tracked so a `##` INSIDE a fence is never mistaken for a section boundary.
 * @returns {Array<{heading: string, lines: string[], startLine: number}>}
 */
function splitSections(text) {
  // Shared, fence-aware for ``` AND ~~~ (Red Team M115 run 4: tilde-fenced fake
  // headings satisfied the required-section walk).
  return walkSections(text);
}

/**
 * Parse the Markdown table rows out of a section's lines, by POSITION (never
 * a substring search). Skips the header row and the `---` separator row.
 * @returns {Array<{cells: string[], line: number, raw: string}>}
 */
function parseTableRows(sectionLines, sectionStartLine) {
  return parseRows(sectionLines, sectionStartLine);
}

/**
 * Find the table's own header row (the `| Seq | ... |` line) inside a
 * `## Table:` section, so its exact column text can be checked.
 * @returns {{cells: string[], line: number}|null}
 */
function findTableHeader(sectionLines, sectionStartLine) {
  for (let i = 0; i < sectionLines.length; i++) {
    const trimmed = sectionLines[i].trim();
    if (!trimmed.startsWith("|")) continue;
    const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
    const cells = inner.split("|").map((c) => c.trim());
    // The first table-shaped line in the section IS the header row, whatever its
    // text — "missing" means no table-shaped line at all; a wrong-but-present
    // header text is a separate violation (wrong-table-header), never conflated.
    return { cells, line: sectionStartLine + i };
  }
  return null;
}

/** Read the row's column-6 state (contract §2.1) from its Source cell text. */
function classifyRowState(sourceCell) {
  const t = (sourceCell || "").trim();
  if (t === "") return "empty";
  if (t.startsWith(MARKER_CONTRADICTION)) return "open";
  if (t.startsWith(MARKER_GAP)) return "open";
  if (t.startsWith(MARKER_SELF_ANSWERED)) return "self-answered";
  return "sourced";
}

/**
 * Parse the `## Decided without you` group into its bullet entries.
 * @returns {Array<{table: string|null, seq: string|null, evidencePresent: boolean, raw: string}>}
 */
function parseDecidedGroup(sectionLines) {
  const entries = [];
  for (const line of sectionLines) {
    const t = line.trim();
    if (t === "---" || !/^-\s+\S/.test(t)) continue;
    if (t === `> ${NONE_SOURCED_SENTENCE}` || t === NONE_SOURCED_SENTENCE) continue;
    const m = t.match(/^-\s+`([^`]+)`\s+Seq\s+`([^`]+)`\s+—\s+(.*)$/);
    if (m) {
      const [, table, seq, rest] = m;
      entries.push({ table, seq, evidencePresent: /evidence:\s*\S/.test(rest), raw: t });
    } else {
      entries.push({ table: null, seq: null, evidencePresent: false, raw: t });
    }
  }
  return entries;
}

/** True when the Decided group's only content is the "None" sentence (or is empty of bullets). */
function decidedGroupIsExplicitlyEmpty(sectionLines) {
  // Positional: the group's ONLY content line is the "None" sentence (bare or
  // as a blockquote). A "None" buried among real bullets is not an empty group.
  const content = sectionLines.map((l) => l.trim()).filter((l) => l && !l.startsWith("## "));
  return content.length === 1 && (content[0] === NONE_SOURCED_SENTENCE || content[0] === `> ${NONE_SOURCED_SENTENCE}`);
}

// ─── the gate ──────────────────────────────────────────────────────────────

/**
 * Gate one test-plan doc. Pure, structural, never throws — caller wraps in
 * try/catch for I/O.
 * @returns {{ok: boolean, exitCode: 0|4, violations: Array<{kind:string, detail:string}>}}
 */
function checkDoc(text, docPath) {
  const violations = [];
  const v = (kind, detail) => violations.push({ kind, detail, doc: docPath });

  const sections = splitSections(text);

  // ── Required section set, present and in order ──
  // The required set must appear in RELATIVE order; sections the mold does not
  // name (e.g. the contract-mandated `## HALT — case-space bound reached`) are
  // skipped, never counted as a break in the order. The first shipped walker
  // stalled on the first unknown heading and then reported every later required
  // section missing — failing the milestone's own correctly-halted cold run
  // (code-review M115, important).
  let cursor = 0;
  const foundByKey = {};
  for (const req of REQUIRED_SECTIONS_IN_ORDER) {
    let matchedAtLeastOnce = false;
    for (let i = cursor; i < sections.length; i++) {
      if (!req.test(sections[i].heading)) continue;
      matchedAtLeastOnce = true;
      foundByKey[req.key] = foundByKey[req.key] || [];
      foundByKey[req.key].push(sections[i]);
      cursor = i + 1;
      if (!req.repeatable) break;
    }
    if (!matchedAtLeastOnce) {
      v("missing-or-out-of-order-section", `required section "${req.key}" is missing, out of order, or empty — the mold's fixed section order is Decided without you, one or more Table sections, Open gaps, Sign-off.`);
    }
  }

  const tableSections = foundByKey["table"] || [];
  const decidedSections = foundByKey["decided-without-you"] || [];

  // ── Every sequence table: exact six-column header, row states, blanks ──
  const allSelfAnsweredRows = []; // {table, seq}
  for (const tsec of tableSections) {
    const tableName = tsec.heading.replace(/^##\s+Table:\s*/, "").trim();
    const header = findTableHeader(tsec.lines, tsec.startLine);
    if (!header) {
      v("missing-table-header", `table "${tableName}" has no \`| Seq | ... |\` header row.`);
      continue;
    }
    const headerOk = header.cells.length === REQUIRED_COLUMNS.length
      && REQUIRED_COLUMNS.every((c, idx) => header.cells[idx] === c);
    if (!headerOk) {
      v("wrong-table-header", `table "${tableName}" header is "${header.cells.join(" | ")}" — must be exactly "${REQUIRED_COLUMNS.join(" | ")}".`);
      continue; // column positions are meaningless if the header doesn't match
    }

    const rows = parseTableRows(tsec.lines, tsec.startLine);
    if (rows.length === 0) {
      v("empty-table", `table "${tableName}" declares the header but has no data rows.`);
    }
    for (const row of rows) {
      // EXACT width. A row with extra cells used to pass and every consumer then
      // read the wrong cell as column 6 — the state column (code-review M115 run 4).
      if (row.cells.length !== REQUIRED_COLUMNS.length) {
        v("row-column-count-mismatch", `table "${tableName}" row "${row.raw.slice(0, 80)}" has ${row.cells.length} columns, expected ${REQUIRED_COLUMNS.length}.`);
        continue;
      }
      const seq = row.cells[0];
      const effectOnSavedData = row.cells[4];
      const source = row.cells[5];

      if (effectOnSavedData.trim() === "") {
        v("blank-effect-on-saved-data", `table "${tableName}" Seq "${seq}" has a blank "Effect on saved data" — write "none" explicitly.`);
      }

      const state = classifyRowState(source);
      if (state === "empty") {
        v("blank-source-not-a-fourth-state", `table "${tableName}" Seq "${seq}" has a blank "Source" — every row must be sourced, self-answered, or a gap; there is no empty fourth state.`);
        continue;
      }
      if (state === "self-answered") {
        allSelfAnsweredRows.push({ table: tableName, seq });
      }
    }
  }

  // ── `## Decided without you`: present, before the first table, exact match ──
  const decidedHeadingCount = sections.filter((sec) => sec.heading === HEADING_DECIDED).length;
  if (decidedHeadingCount > 1) {
    v("duplicate-decided-group", `"${HEADING_DECIDED}" appears ${decidedHeadingCount} times — the group is ONE heading whose entries match the self-answered rows exactly; a second heading hides its entries from that rule.`);
  }
  if (decidedSections.length > 0) {
    const decidedSection = decidedSections[0];
    const firstTableSection = tableSections[0];
    if (firstTableSection && decidedSection.startLine > firstTableSection.startLine) {
      v("decided-group-after-first-table", `"${HEADING_DECIDED}" must appear before the first Table section.`);
    }

    const explicitlyEmpty = decidedGroupIsExplicitlyEmpty(decidedSection.lines);
    const entries = parseDecidedGroup(decidedSection.lines);

    if (allSelfAnsweredRows.length === 0 && !explicitlyEmpty) {
      v("decided-group-missing-none-sentence", `no self-answered rows exist, but "${HEADING_DECIDED}" does not carry the required "${NONE_SOURCED_SENTENCE}" line.`);
    }

    // Every self-answered row must have exactly one matching, evidenced entry.
    for (const r of allSelfAnsweredRows) {
      const match = entries.find((e) => e.table === r.table && e.seq === r.seq);
      if (!match) {
        v("self-answered-row-not-in-decided-group", `table "${r.table}" Seq "${r.seq}" is self-answered but has no entry under "${HEADING_DECIDED}".`);
      } else if (!match.evidencePresent) {
        v("decided-entry-missing-evidence", `table "${r.table}" Seq "${r.seq}" appears under "${HEADING_DECIDED}" but names no evidence.`);
      }
    }

    // Every entry under the heading must correspond to a real self-answered row —
    // the group is EXACTLY the set, no extras.
    for (const e of entries) {
      if (e.table === null && e.seq === null) {
        v("decided-group-has-unparsable-entry", `an entry under "${HEADING_DECIDED}" does not match the required "\`table\` Seq \`n\` — decision — evidence: ..." shape: "${e.raw.slice(0, 100)}"`);
        continue;
      }
      const isReal = allSelfAnsweredRows.some((r) => r.table === e.table && r.seq === e.seq);
      if (!isReal) {
        v("decided-group-has-extra-entry", `"${HEADING_DECIDED}" cites table "${e.table}" Seq "${e.seq}", which is not a self-answered row in any table.`);
      }
    }
  }
  // (If the heading itself is missing, that was already raised as
  // missing-or-out-of-order-section above — not duplicated here.)

  return {
    ok: violations.length === 0,
    exitCode: violations.length === 0 ? 0 : 4,
    violations,
  };
}

/**
 * Gate one file on disk.
 *
 * NOT A FALLBACK: an unreadable doc HALTS at exit 64 (never treated as clean,
 * never guessed) — the frozen contract §4 shape ("a gate that cannot decide
 * exits 64 ... never exits 0 by default"), identical to gsd-t-pseudocode-style.cjs.
 * @returns {{ok:boolean, exitCode:0|4|64, doc:string, violations:Array, reason?:string}}
 */
function gateDoc(docPath) {
  let text;
  try {
    text = fs.readFileSync(docPath, "utf8");
  } catch (e) {
    return { ok: false, exitCode: 64, doc: docPath, reason: `cannot read doc: ${e && e.message}`, violations: [] };
  }
  const result = checkDoc(text, docPath);
  return { ...result, doc: docPath };
}

/**
 * Run the gate over one doc or a whole directory.
 * @returns {object} envelope. I/O failures HALT at exit 64 (see gateDoc) — never
 * silently degrade to a clean pass.
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
      if (/^TestPlan-.*\.md$/.test(e) && e !== "TestPlan-spec.md") docs.push(path.join(dir, e));
    }
    if (docs.length === 0) {
      return { ok: true, exitCode: 0, docsChecked: 0, skips: [{ reason: "no-testplan-docs" }], violations: [] };
    }
  }

  const results = [];
  const violations = [];
  let worstExit = 0;
  for (const d of docs) {
    const r = gateDoc(d);
    results.push({ doc: d, ok: r.ok, exitCode: r.exitCode, reason: r.reason });
    for (const v of r.violations) violations.push(v);
    if (r.exitCode > worstExit) worstExit = r.exitCode;
  }

  return {
    ok: worstExit === 0,
    exitCode: worstExit,
    docsChecked: docs.length,
    results,
    violations,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────

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

const HELP = `Usage: gsd-t testplan-lint (--doc <TestPlan-[FeatureArea].md> | --dir <dir>) [--json]

Gates a test plan's structural shape against the frozen contract
(.gsd-t/contracts/test-plan-first-contract.md §2-4): the required section set
in order, the exact six-column sequence-table header, every row in exactly
one of the three row states, "Effect on saved data" and "Source" never
blank, and the "## Decided without you" group present and exactly matching
the set of self-answered rows.

  --doc PATH   gate one plan.
  --dir PATH   gate every TestPlan-*.md in a directory.

Exit: 0 clean · 4 shape violations · 64 bad input.`;

/**
 * NOT A FALLBACK: this catch is the frozen never-throws HALT wrapper required
 * by contract §4 ("never throws ... exits 64 and says why") — identical in
 * shape to bin/gsd-t-pseudocode-style.cjs and bin/gsd-t-traceability-gate.cjs.
 * It stops and REPORTS an unexpected internal error rather than continuing
 * past it or masking it as a clean pass.
 */
function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { process.stdout.write(HELP + "\n"); process.exit(0); }
  let res;
  try {
    res = run(o);
  } catch (e) {
    // A gate that cannot run HALTS with the bad-input envelope — exit 64 is a
    // failure, never a pass. Written as an explicit halt so the fallback guard
    // reads it as one (an assignment-then-fall-through looks like a continue).
    process.stdout.write(JSON.stringify({ ok: false, exitCode: 64, reason: `gate-error: ${e && e.message}`, violations: [] }, null, 2) + "\n");
    process.exit(64);
  }
  process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  process.exit(res.exitCode);
}

if (require.main === module) main();

module.exports = {
  run, gateDoc, checkDoc, splitSections, parseTableRows, findTableHeader,
  classifyRowState, parseDecidedGroup, REQUIRED_COLUMNS,
};
