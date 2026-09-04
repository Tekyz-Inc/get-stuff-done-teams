#!/usr/bin/env node
"use strict";
/**
 * gsd-t-testplan-rows.cjs — the ONE reader of a test-plan document's shape.
 *
 * Three consumers read `TestPlan-*.md` (contract test-plan-first-contract.md §2):
 * the shape lint (bin/gsd-t-testplan-lint.cjs), the convergence halt
 * (bin/gsd-t-testplan-halt.cjs) and the traceability gate's plan-row binding
 * (bin/gsd-t-traceability-gate.cjs). M115 verify run 4 found them drifting:
 * one tracked backtick fences but not tilde fences, one tracked none, and all
 * three accepted a row with EXTRA cells and then read the wrong cell as column
 * 6 — the state column the whole contract rests on. A GAP row with one extra
 * cell passed the lint, cleared an acceptance criterion, and was invisible to
 * the halt. Same defect, three places. This module is where it is fixed once.
 *
 * Rules pinned here:
 *   - a fenced block opened by ``` or ~~~ (three or more) hides every line
 *     inside it: a `##` there is text, not a heading; a `|` there is not a row
 *   - a row has EXACTLY six cells; anything else is `width` !== 6 and the
 *     consumer decides what a malformed row means for ITS job (the lint: a
 *     violation; the gate: never clears; the halt: still open)
 *   - a row's state is read from cell 6 alone: empty | gap | decided | sourced
 */

const REQUIRED_COLUMN_COUNT = 6;
const HEADER_CELLS = ["Seq", "Setup / date", "Action", "Expected result", "Effect on saved data", "Source"];

// \x60 is the backtick, kept out of the source text so no scanner mistakes
// this regex for a template literal (TD-299).
const FENCE_RE = /^\s*(?:\x60{3,}|~{3,})/;

function isFenceToggle(line) { return FENCE_RE.test(line); }

/**
 * Split a document into `##` sections, fence-aware for BOTH fence styles.
 * @returns {Array<{heading: string, lines: string[], startLine: number}>}
 *   startLine is the 1-based line number of the first line AFTER the heading.
 */
function walkSections(text) {
  const lines = String(text).split(/\r?\n/);
  const sections = [];
  let cur = null;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFenceToggle(line)) { inFence = !inFence; if (cur) cur.lines.push(line); continue; }
    if (!inFence && /^##\s+\S/.test(line)) {
      if (cur) sections.push(cur);
      cur = { heading: line.trim(), lines: [], startLine: i + 2 };
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  if (cur) sections.push(cur);
  return sections;
}

function splitCells(line) {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
}
function isHeaderRow(cells) { return cells[0] === "Seq"; }
function isSeparatorRow(cells) { return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c)); }

/**
 * Data rows of a section, by position, fence-aware. Header and separator rows
 * are skipped. Every row carries its `width` so a consumer can refuse a
 * malformed one instead of reading the wrong cell.
 * @returns {Array<{cells: string[], width: number, line: number, raw: string}>}
 */
function parseRows(sectionLines, sectionStartLine) {
  const rows = [];
  let inFence = false;
  for (let i = 0; i < sectionLines.length; i++) {
    const raw = sectionLines[i];
    if (isFenceToggle(raw)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const trimmed = raw.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = splitCells(trimmed);
    if (isHeaderRow(cells)) continue;
    if (isSeparatorRow(cells)) continue;
    rows.push({ cells, width: cells.length, line: (sectionStartLine || 0) + i, raw: trimmed });
  }
  return rows;
}

/** `## Table: <name>` — the ONE heading pattern every consumer uses (the lint once
 *  required exactly one space while the others accepted any whitespace). */
const TABLE_HEADING_RE = /^##\s+Table:\s*(.+?)\s*$/;
function tableName(heading) { const m = String(heading || "").match(TABLE_HEADING_RE); return m ? m[1].trim() : null; }

/**
 * The row state, read from cell 6 ALONE — the ONE classifier (Red Team M115 run 6:
 * the gate matched `GAP\b`, the lint and halt matched `startsWith("GAP")`, and a
 * `GAPX:` cell was a gap to two tools and a sourced answer to the third, which
 * cleared an acceptance criterion). Markers are exact tokens, case-insensitive
 * (project rule: domain values compare case-insensitively):
 *   empty     — nothing written
 *   gap       — `GAP` / `GAP: …` / `GAP:CONTRADICTION …`
 *   decided   — `DECIDED-WITHOUT-YOU …`
 *   malformed — looks like a marker but is not one (`GAPX`, `GAP-ish`, `DECIDED …`)
 *   sourced   — anything else: a citation
 */
function rowState(sourceCell) {
  const s = String(sourceCell == null ? "" : sourceCell).trim();
  if (s === "") return "empty";
  if (/^gap(?::|\s|$)/i.test(s)) return "gap";
  if (/^decided-without-you(?::|\s|$)/i.test(s)) return "decided";
  if (/^(?:gap|decided)/i.test(s)) return "malformed";
  return "sourced";
}

module.exports = { REQUIRED_COLUMN_COUNT, HEADER_CELLS, TABLE_HEADING_RE, tableName, isFenceToggle, walkSections, splitCells, isHeaderRow, isSeparatorRow, parseRows, rowState };
