#!/usr/bin/env node
/**
 * gsd-t-estimate-sheet — the deterministic writer for Tekyz estimate sheets.
 *
 * Spec: templates/estimate-sheet-spec.md (installed at ~/.claude/templates/).
 *
 * WHY THIS EXISTS
 * ---------------
 * Two shipped Hilo estimates (Sep 2026) each needed ~a dozen hand-corrections,
 * every one on sheet structure or formatting the model had re-derived from prose
 * each run: a second header row, stale month labels, the sage highlight cleared
 * as a "stray fill", Calibri on Team Mix, a roster with no PM/BA, Count 1.40 on
 * one row, 0.42/0.56/0.23 smeared across three part-timers, flat ramps, a
 * negative remainder month, legend text in size cells, Phase dropdowns lost on a
 * values-write, an off-by-one Total Hrs column. Prose rules failed ~25 times.
 * This tool makes them code: the model supplies JUDGMENT ONLY (sizes, team FTE,
 * tech-stack lines) as a JSON plan; everything derived — formulas, roster split,
 * months, ramp, styling, coordinates — is computed here, written, then AUDITED
 * BY READING BACK. Any violation HALTS (exit 4). Nothing continues past a failure:
 * every catch in this file either re-throws a Halt or exits the process.
 *
 * Verbs:
 *   read       --sheet <id|url> [--tab <name>]          dump layout (read-before-write)
 *   plan-check --sheet <id|url> --plan <plan.json>      validate plan, print the roster it WOULD write
 *   write      --sheet <id|url> --plan <plan.json> [--replace]   write T-Shirt + Team Mix + Tech Stack, then audit
 *   teammix    --sheet <id|url> [--fte <json>] [--dry-run] rebuild the Team Mix (one grid per phase) from the sheet's own roster + rollups
 *   format     --sheet <id|url> [--dry-run]              normalise T-Shirt formatting only (section rows, totals band, summary block); values untouched
 *   audit      --sheet <id|url>                          the spec §5 checklist, by read-back
 *   plan-schema                                          print the plan shape
 * Flags: --json (envelope only)  --key <path>  --no-audit (write only; for debugging)
 * Exit:  0 ok · 4 violations / audit failures · 64 bad input, auth, or API error
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// ───────────────────────── constants (spec §1–§3) ─────────────────────────

const TAB_TSHIRT = "T-Shirt Size Estimate";
const TAB_TEAM = "Team Mix";
const TAB_TECH = "Technology Stack";
const TAB_OVERVIEW = "Overview";

const SIZE_CODES = ["XS", "S", "M", "L", "XL", "XXL"];
const PHASES = ["MVP", "Phase 1", "Phase 2", "Phase 3"];

const COLOR = {
  sectionBg: "#1C4F8B",
  teamTitleBg: "#3C78D8",
  teamHeaderBg: "#1C4F8C",
  sage: "#D6E2DD",
  totalBg: "#E5E5E5",
  totalDaysBg: "#9EC1EF",
  tshirtTotalBg: "#D8DDE8",
  white: "#FFFFFF",
};

const TSHIRT_WIDTHS = [150, 120, 300, 430, 122, 90, 90, 61, 53, 76, 81, 81];
const TEAM_WIDTHS_FIXED = [170, 60, 14, 55, 55, 55, 60, 159]; // A..H
const TEAM_MONTH_WIDTH = 48;
const TEAM_TOTAL_WIDTH = 66;
const TECH_WIDTHS = [210, 760];

const SOFT_CEILING = 172; // spec §2.2 — a small tail folds into the prior month
const FOLD_THRESHOLD = 0.1; // month fraction under this folds instead of opening a column

// Ramp profiles (spec §2.5): 3-point weights, resampled to N months.
const RAMP = {
  frontend: [1.35, 1.05, 0.6],
  backend: [0.9, 1.15, 0.95],
  qa: [0.4, 0.9, 1.7],
  ba: [1.75, 0.8, 0.45],
  devops: [0.45, 0.85, 1.7],
  pm: [1, 1, 1],
  techlead: [1.3, 0.8, 0.9],
  design: [1.6, 0.9, 0.5],   // Design / UX: heaviest at the start, a tail for revisions
  mobile: [1.35, 1.05, 0.6], // same shape as frontend
};

const ROLE_LABEL = {
  backend: "Backend / API Engineer",
  frontend: "Frontend Engineer",
  qa: "QA Engineer",
  pm: "Project Manager",
  ba: "Business Analyst",
  devops: "DevOps Engineer",
  techlead: "Tech Lead / Architect",
  design: "Design / UX",
  mobile: "Mobile Engineer",
};

// MF factor label → the discipline that must staff it (spec §2.4). Factors with
// no entry (deployment, standups, buffer) are absorbed across the engineers and
// the lead and need no row of their own — David's rule, confirmed against the
// hand-corrected ATP sheet, which has no DevOps row and is correct.
const MF_COVERAGE = [
  { match: /qa|test/i, disciplines: ["qa"] },
  { match: /^pm$|project/i, disciplines: ["pm"] },
  { match: /analy/i, disciplines: ["ba"] },
];

const DEFAULT_KEY = path.join(os.homedir(), ".claude", "gsd-t-secrets", "gsd-t-sheets-writer-key.json");

// ───────────────────────── small helpers ─────────────────────────

class Halt extends Error {
  constructor(message, exitCode = 4, details = undefined) {
    super(message);
    this.exitCode = exitCode;
    this.details = details;
  }
}

function colLetter(idx0) {
  let s = "";
  let n = idx0 + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function hexToColor(hex) {
  const h = hex.replace("#", "");
  return {
    red: parseInt(h.slice(0, 2), 16) / 255,
    green: parseInt(h.slice(2, 4), 16) / 255,
    blue: parseInt(h.slice(4, 6), 16) / 255,
  };
}

/** Sheets omits a channel that is 0; a cell with NO backgroundColor at all is unset = white. */
function colorToHex(c) {
  if (!c) return COLOR.white;
  const f = (v) => Math.round((v == null ? 0 : v) * 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${f(c.red)}${f(c.green)}${f(c.blue)}`;
}

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

function sheetIdFromArg(arg) {
  if (!arg) throw new Halt("--sheet <id|url> is required", 64);
  const m = String(arg).match(/\/d\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : String(arg).trim();
}

function gridRange(sheetId, r0, r1, c0, c1) {
  return { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 };
}

// ───────────────────────── auth + API (spec §0) ─────────────────────────

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getToken(keyPath, scope = "https://www.googleapis.com/auth/spreadsheets") {
  if (typeof fetch !== "function") throw new Halt("Node 18+ is required (global fetch)", 64);
  const kp = keyPath ? keyPath : DEFAULT_KEY;
  if (!fs.existsSync(kp)) {
    throw new Halt(`service-account key not found at ${kp} — see commands/gsd-t-estimate.md Step 6 to provision it once`, 64);
  }
  const key = JSON.parse(fs.readFileSync(kp, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(key.private_key));
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: `${header}.${claim}.${sig}`,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Halt(`token exchange failed: ${res.status} ${JSON.stringify(json)}`, 64);
  return json.access_token;
}

class SheetsApi {
  constructor(token, sheetId) {
    this.token = token;
    this.id = sheetId;
    this.base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
  }

  async call(method, url, body, attempt = 1) {
    // Spec §0: NEVER send X-Goog-User-Project — on these sheets it CAUSES a 403.
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (res.status === 429 && attempt <= 3) {
      // Rate limit (60 reads/min/user — hit 2026-09-21 auditing 19 sheets in a row). This is
      // flow control, not a masked failure: the same request is re-sent unchanged after the
      // documented wait, and the 4th 429 halts.
      const wait = 20000 * attempt;
      console.error(`  … Sheets API 429 (rate limit) — waiting ${wait / 1000}s, retry ${attempt}/3`);
      await new Promise((r) => setTimeout(r, wait));
      return this.call(method, url, body, attempt + 1);
    }
    if (!res.ok) {
      const short = text.slice(0, 400);
      if (res.status === 403) {
        throw new Halt(`403 from Sheets API: ${short}. The sheet is probably not shared with the service account — share it as Editor and re-run.`, 64);
      }
      throw new Halt(`${method} ${url.replace(this.base, "")} → ${res.status}: ${short}`, 64);
    }
    if (!text) return {};
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Halt(`${method} ${url.replace(this.base, "")} → ${res.status} but the body is not JSON: ${text.slice(0, 200)}`, 64);
    }
    return json;
  }

  async meta() {
    return this.call("GET", `${this.base}?fields=properties.title,sheets.properties`);
  }

  async grid(tab) {
    const rng = encodeURIComponent(`'${tab}'`);
    const fields = "sheets(merges,properties,data(rowData(values(formattedValue,userEnteredValue,effectiveValue,userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,numberFormat),dataValidation)),columnMetadata(pixelSize)))";
    const r = await this.call("GET", `${this.base}?ranges=${rng}&includeGridData=true&fields=${fields}`);
    if (!r.sheets || !r.sheets[0]) throw new Halt(`tab '${tab}' not found`, 64);
    return r.sheets[0];
  }

  async putValues(tab, a1, values) {
    const rng = encodeURIComponent(`'${tab}'!${a1}`);
    return this.call("PUT", `${this.base}/values/${rng}?valueInputOption=USER_ENTERED`, {
      range: `'${tab}'!${a1}`, majorDimension: "ROWS", values,
    });
  }

  async clearValues(tab, a1) {
    const rng = encodeURIComponent(`'${tab}'!${a1}`);
    return this.call("POST", `${this.base}/values/${rng}:clear`, {});
  }

  // Spec §0: small batches. The FIRST failing batch halts — later batches are
  // not sent, and the audit shows exactly what landed. Never continue past a failure.
  async batch(requests, size = 50) {
    let sent = 0;
    for (let i = 0; i < requests.length; i += size) {
      const chunk = requests.slice(i, i + size);
      try {
        await this.call("POST", `${this.base}:batchUpdate`, { requests: chunk });
      } catch (e) {
        throw new Halt(`batchUpdate failed on batch ${i / size + 1} (after ${sent} requests applied; the sheet is now PARTIAL — run 'audit'): ${e.message}`, 64);
      }
      sent += chunk.length;
    }
    return sent;
  }
}

// ───────────────────────── grid reading ─────────────────────────

function rowsOf(grid) {
  return (grid.data && grid.data[0] && grid.data[0].rowData) ? grid.data[0].rowData : [];
}
function cellAt(grid, r, c) {
  const row = rowsOf(grid)[r];
  return row && row.values ? row.values[c] : undefined;
}
function textAt(grid, r, c) {
  const cell = cellAt(grid, r, c);
  if (!cell) return "";
  const uv = cell.userEnteredValue;
  if (uv) {
    if (uv.stringValue != null) return String(uv.stringValue);
    if (uv.numberValue != null) return String(uv.numberValue);
    if (uv.formulaValue != null) return uv.formulaValue;
    if (uv.boolValue != null) return String(uv.boolValue);
  }
  return cell.formattedValue == null ? "" : String(cell.formattedValue);
}
/** NaN when the cell holds no number — callers decide what that means. */
function numAt(grid, r, c) {
  const cell = cellAt(grid, r, c);
  if (!cell) return NaN;
  if (cell.effectiveValue && cell.effectiveValue.numberValue != null) return cell.effectiveValue.numberValue;
  if (cell.userEnteredValue && cell.userEnteredValue.numberValue != null) return cell.userEnteredValue.numberValue;
  return NaN;
}
function formulaAt(grid, r, c) {
  const cell = cellAt(grid, r, c);
  return cell && cell.userEnteredValue && cell.userEnteredValue.formulaValue != null ? cell.userEnteredValue.formulaValue : "";
}
function bgAt(grid, r, c) {
  const cell = cellAt(grid, r, c);
  return colorToHex(cell && cell.userEnteredFormat ? cell.userEnteredFormat.backgroundColor : undefined);
}
function fontAt(grid, r, c) {
  const cell = cellAt(grid, r, c);
  const tf = cell && cell.userEnteredFormat && cell.userEnteredFormat.textFormat ? cell.userEnteredFormat.textFormat : {};
  return { family: tf.fontFamily ? tf.fontFamily : "", size: tf.fontSize ? tf.fontSize : 0, bold: !!tf.bold };
}
function rowCount(grid) { return rowsOf(grid).length; }
function rowIsEmpty(grid, r, cols = 12) {
  for (let c = 0; c < cols; c++) if (textAt(grid, r, c) !== "") return false;
  return true;
}

/** Find the first cell whose text equals `label` (case-insensitive, trimmed) in the top `maxRows` rows. */
function findCell(grid, label, maxRows = 25, maxCols = 20) {
  const want = label.toLowerCase();
  for (let r = 0; r < Math.min(rowCount(grid), maxRows); r++) {
    for (let c = 0; c < maxCols; c++) if (textAt(grid, r, c).trim().toLowerCase() === want) return { r, c };
  }
  return null;
}

/**
 * Locate the T-Shirt tab's header block BY LABEL, not by fixed row (spec §1.1). Two layouts
 * are in the wild: the current template (Date row 1, legend A4:B9, header row 13, two size
 * columns) and an older one (Project/Client/Date rows 3–5, legend A8:B13, header row 17, up
 * to four size columns). Everything the writer and audit need is returned as a column map.
 * HALTS on anything it cannot find — never guesses a coordinate.
 */
function locateTshirt(grid) {
  const hdr = findCell(grid, "Module/Functionality", 40, 3);
  if (!hdr || hdr.c !== 0) throw new Halt(`${TAB_TSHIRT}: column header row ('Module/Functionality' in A) not found — is this the Tekyz template?`);
  const headerRow = hdr.r;
  const headerText = [];
  for (let c = 0; c < 20; c++) headerText.push(textAt(grid, headerRow, c).trim());
  const colOf = (label) => { const c = headerText.findIndex((x) => x.toLowerCase() === label.toLowerCase()); if (c < 0) throw new Halt(`${TAB_TSHIRT}: header row ${headerRow + 1} has no '${label}' column`); return c; };
  const cols = { phase: colOf("Phase"), days: colOf("Days"), mfactor: colOf("MFactor Days"), total: colOf("Total Days"), low: colOf("LOW $"), high: colOf("HIGH $") };
  cols.sizes = [];
  for (let c = cols.phase + 1; c < cols.days; c++) cols.sizes.push(c);
  if (!cols.sizes.length) throw new Halt(`${TAB_TSHIRT}: no size columns between 'Phase' and 'Days'`);
  cols.sizeLabels = cols.sizes.map((c) => headerText[c]);
  // legend: the XS..XXL rows in column A
  const legend = {};
  let legendFirst = -1, legendLast = -1;
  for (let r = 0; r < headerRow; r++) {
    const m = textAt(grid, r, 0).trim().match(/^(XS|S|M|L|XL|XXL)\s*-/);
    if (m) { legend[m[1]] = numAt(grid, r, 1); if (legendFirst < 0) legendFirst = r; legendLast = r; }
  }
  for (const code of SIZE_CODES) {
    if (!(code in legend) || Number.isNaN(legend[code])) throw new Halt(`${TAB_TSHIRT}: size legend missing '${code}' (looked for 'XS - …' labels in column A above the header row)`);
  }
  // MF list: under 'Multiplication Factor' down to 'Total MF'
  const mfHdr = findCell(grid, "Multiplication Factor", headerRow, 12);
  if (!mfHdr) throw new Halt(`${TAB_TSHIRT}: 'Multiplication Factor' header not found`);
  const mf = [];
  let mfTotalCell = null;
  for (let r = mfHdr.r + 1; r < headerRow; r++) {
    const label = textAt(grid, r, mfHdr.c).trim();
    if (!label) continue;
    if (/^Total MF$/i.test(label)) { mfTotalCell = { r, c: mfHdr.c + 1, value: numAt(grid, r, mfHdr.c + 1) }; break; }
    const v = numAt(grid, r, mfHdr.c + 1);
    if (!Number.isNaN(v)) mf.push({ label, value: v, row: r + 1 });
  }
  if (!mf.length) throw new Halt(`${TAB_TSHIRT}: multiplication-factor list under '${colLetter(mfHdr.c)}${mfHdr.r + 1}' is empty`);
  if (!mfTotalCell) throw new Halt(`${TAB_TSHIRT}: 'Total MF' cell not found under the MF list`);
  const mfTotal = mf.reduce((s, f) => s + f.value, 0);
  const hfHdr = findCell(grid, "High $ Factor", headerRow, 14);
  if (!hfHdr) throw new Halt(`${TAB_TSHIRT}: 'High $ Factor' header not found`);
  const highFactor = numAt(grid, hfHdr.r + 1, hfHdr.c);
  if (Number.isNaN(highFactor)) throw new Halt(`${TAB_TSHIRT}: High $ Factor (${colLetter(hfHdr.c)}${hfHdr.r + 2}) is not a number`);
  const rateHdr = findCell(grid, "Avg. Hrly Rate", headerRow, 14);
  if (!rateHdr) throw new Halt(`${TAB_TSHIRT}: 'Avg. Hrly Rate' header not found`);
  const rate = numAt(grid, rateHdr.r + 1, rateHdr.c);
  if (Number.isNaN(rate)) throw new Halt(`${TAB_TSHIRT}: Avg. Hrly Rate (${colLetter(rateHdr.c)}${rateHdr.r + 2}) is not a number`);
  cols.highFactor = { r: hfHdr.r + 1, c: hfHdr.c };
  cols.rate = { r: rateHdr.r + 1, c: rateHdr.c };
  cols.mfTotal = { r: mfTotalCell.r, c: mfTotalCell.c };
  // phase rollups: the column holding 'MVP' above the header; Low/High Hrs columns from their headers
  const mvp = findCell(grid, "MVP", headerRow, 16);
  if (!mvp) throw new Halt(`${TAB_TSHIRT}: phase rollup block ('MVP' label above the header row) not found`);
  const rollupRows = [];
  for (let r = 0; r < headerRow; r++) if (PHASES.includes(textAt(grid, r, mvp.c).trim())) rollupRows.push(r);
  if (rollupRows.length !== 4) throw new Halt(`${TAB_TSHIRT}: expected 4 phase rollup rows in column ${colLetter(mvp.c)} (MVP, Phase 1–3), found ${rollupRows.length}`);
  const lowHrs = findCell(grid, "Low Hrs", headerRow, 20), highHrs = findCell(grid, "High Hrs", headerRow, 20);
  const lowDol = findCell(grid, "Low ($)", headerRow, 20), highDol = findCell(grid, "High ($)", headerRow, 20);
  if (!lowHrs || !highHrs || !lowDol || !highDol) throw new Halt(`${TAB_TSHIRT}: rollup headers 'Low ($)' / 'Low Hrs' / 'High ($)' / 'High Hrs' not all found`);
  cols.rollupPhase = mvp.c; cols.lowHrs = lowHrs.c; cols.highHrs = highHrs.c; cols.lowDol = lowDol.c; cols.highDol = highDol.c;
  return { headerRow, firstItemRow: headerRow + 1, legend, legendFirst1: legendFirst + 1, legendLast1: legendLast + 1, mf, mfTotal, mfTotalCell, highFactor, rate, rollupRows, cols };
}

/** The standard template's column map (what `write` produces). */
const STANDARD_COLS = { phase: 4, sizes: [5, 6], days: 7, mfactor: 8, total: 9, low: 10, high: 11, rollupPhase: 9, lowHrs: 11, highHrs: 13, lowDol: 10, highDol: 12, highFactor: { r: 3, c: 6 }, rate: { r: 3, c: 7 }, mfTotal: { r: 9, c: 5 } };
const STANDARD_LEGEND = { first1: 4, last1: 9 };

/** Row index of a cell in the Phase column with a ONE_OF_LIST validation — the Phase dropdown source; -1 if none. */
function findPhaseSourceIn(grid, fromRow, phaseCol) {
  for (let r = fromRow; r < rowCount(grid); r++) {
    const cell = cellAt(grid, r, phaseCol);
    const dv = cell && cell.dataValidation;
    if (dv && dv.condition && dv.condition.type === "ONE_OF_LIST") return r;
  }
  return -1;
}

/** Row index of a cell in column E with a ONE_OF_LIST validation — the Phase dropdown source; -1 if none. */
function findPhaseSource(grid, fromRow) { return findPhaseSourceIn(grid, fromRow, 4); }

// ───────────────────────── plan validation (pure) ─────────────────────────

const PLAN_SCHEMA = {
  title: "string — Team Mix title, e.g. 'Hilo ATOS — ATP Gap Closure'",
  tshirt: {
    mode: "'items' (write whole rows from row 14) | 'sizes' (rows already exist; fill E:L, matched by the id in column C)",
    sections: [{
      heading: "string — 'A. AUTH & TRANSPORT CONTRACT' (items mode only)",
      items: [{
        id: "string — 'GA-1' / 'TD-12' / 'FR-3' (goes into column C in parentheses; used to match rows in sizes mode)",
        module: "string", userType: "string", functionality: "string", requirement: "string",
        phase: "'MVP' | 'Phase 1' | 'Phase 2' | 'Phase 3'",
        fe: "'' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL'", be: "same",
      }],
    }],
  },
  teamMix: {
    fte: "{ backend: 1.5, frontend: 0.4, qa: 0.4, pm: 0.25, ba: 0.1, techlead?: 0.25, devops?: 0.1 } — the tool splits into people (1.00 + remainder), computes months and the ramp",
    labels: "optional { backend: 'Backend / API Engineer', ... } overrides",
  },
  techStack: [{ category: "Frontend", description: "Next.js 16 / React …" }],
};

function sizeOf(v) { return v == null ? "" : String(v).trim(); }

function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object") return ["plan is not an object"];
  if (!plan.title || typeof plan.title !== "string") errors.push("title: required string");
  const t = plan.tshirt && typeof plan.tshirt === "object" ? plan.tshirt : {};
  if (!["items", "sizes"].includes(t.mode)) errors.push("tshirt.mode: must be 'items' or 'sizes'");
  const sections = Array.isArray(t.sections) ? t.sections : [];
  if (!sections.length) errors.push("tshirt.sections: non-empty array required");
  const ids = new Set();
  sections.forEach((s, si) => {
    if (t.mode === "items" && (!s.heading || typeof s.heading !== "string")) errors.push(`tshirt.sections[${si}].heading: required in items mode`);
    if (!Array.isArray(s.items) || !s.items.length) { errors.push(`tshirt.sections[${si}].items: non-empty array required`); return; }
    s.items.forEach((it, ii) => {
      const where = `tshirt.sections[${si}].items[${ii}]`;
      if (!it.id) errors.push(`${where}.id: required`);
      else if (ids.has(it.id)) errors.push(`${where}.id: duplicate '${it.id}'`);
      else ids.add(it.id);
      if (t.mode === "items") {
        for (const k of ["module", "userType", "functionality", "requirement"]) {
          if (typeof it[k] !== "string" || !it[k].trim()) errors.push(`${where}.${k}: required string`);
        }
      }
      if (!PHASES.includes(it.phase)) errors.push(`${where}.phase: must be one of ${PHASES.join(" | ")}`);
      for (const k of ["fe", "be"]) {
        const v = sizeOf(it[k]);
        if (v !== "" && !SIZE_CODES.includes(v)) {
          errors.push(`${where}.${k}: '${it[k]}' is not a bare size code (${SIZE_CODES.join(" ")}) — legend text like 'XS - Extra Small' is not allowed`);
        }
      }
      if (sizeOf(it.fe) === "" && sizeOf(it.be) === "") errors.push(`${where}: both fe and be are blank — an item with no size is a defect`);
    });
  });
  const tm = plan.teamMix && typeof plan.teamMix === "object" ? plan.teamMix : {};
  if (!tm.fte || typeof tm.fte !== "object" || !Object.keys(tm.fte).length) errors.push("teamMix.fte: object of discipline → FTE required");
  else {
    for (const [d, v] of Object.entries(tm.fte)) {
      if (!RAMP[d]) errors.push(`teamMix.fte.${d}: unknown discipline (known: ${Object.keys(RAMP).join(", ")})`);
      if (typeof v !== "number" || !(v > 0)) errors.push(`teamMix.fte.${d}: must be a positive number`);
    }
  }
  if (!Array.isArray(plan.techStack) || !plan.techStack.length) errors.push("techStack: non-empty array required — an empty Technology Stack tab is a defect");
  else plan.techStack.forEach((row, i) => {
    if (!row || !row.category || !row.description) errors.push(`techStack[${i}]: category and description required`);
    else if (/\bTBD\b/i.test(String(row.description))) errors.push(`techStack[${i}]: 'TBD' is not a description — read it from the repo or say 'not determined from the repo'`);
  });
  return errors;
}

// ───────────────────────── Team Mix math (pure, spec §2) ─────────────────────────

/** Split discipline FTE into people: saturate at 1.00, spill the remainder. */
function splitRoster(fte, labels) {
  const people = [];
  for (const [discipline, total] of Object.entries(fte)) {
    if (!ROLE_LABEL[discipline]) throw new Halt(`teamMix.fte.${discipline}: unknown discipline`);
    const n = Math.ceil(total - 1e-9);
    const label = labels && labels[discipline] ? labels[discipline] : ROLE_LABEL[discipline];
    let left = total;
    for (let i = 1; i <= n; i++) {
      const count = round2(Math.min(1, left));
      left = round2(left - count);
      people.push({ discipline, label: n > 1 ? `${label} ${i}` : label, count });
    }
  }
  return people;
}

/** Roster invariants (spec §2.3): every row ≤ 1.00; per discipline all but the last row are exactly 1.00. */
function rosterViolations(people) {
  const v = [];
  const byD = {};
  people.forEach((p) => { (byD[p.discipline] = byD[p.discipline] ? byD[p.discipline] : []).push(p); });
  for (const p of people) if (p.count > 1 + 1e-9) v.push(`${p.label}: Count ${p.count} > 1.00 — one row per person`);
  for (const [d, rows] of Object.entries(byD)) {
    rows.slice(0, -1).forEach((p) => { if (Math.abs(p.count - 1) > 1e-9) v.push(`${p.label}: ${d} has a later row but this one is ${p.count}, not 1.00 — saturate then spill`); });
  }
  return v;
}

/** Every non-zero MF factor must have a person (spec §2.4). mfList is REQUIRED — no list, no verdict. */
function mfCoverageViolations(mfList, people) {
  if (!Array.isArray(mfList) || !mfList.length) throw new Halt("MF coverage check needs the sheet's multiplication-factor list");
  const have = new Set(people.map((p) => p.discipline));
  const v = [];
  for (const f of mfList) {
    if (!(f.value > 0)) continue;
    const rule = MF_COVERAGE.find((r) => r.match.test(f.label));
    if (!rule) continue; // standups / buffer — absorbed, needs no row
    if (!rule.disciplines.some((d) => have.has(d))) {
      v.push(`MF factor '${f.label}' (${f.value}) has no person — add ${rule.disciplines.map((d) => ROLE_LABEL[d]).join(" or ")} to teamMix.fte`);
    }
  }
  return v;
}

/** months = totalDays / (ΣCount × 20); N columns with the fold rule (spec §2.2). */
function monthPlan(totalDays, people) {
  const sumCount = people.reduce((s, p) => s + p.count, 0);
  if (!(sumCount > 0)) throw new Halt("Team Mix: total Count is 0");
  if (!(totalDays > 0)) throw new Halt(`Team Mix: total days is ${totalDays}`);
  // Full precision: the sheet DISPLAYS Mths as 0.00 but computes with the exact value, so
  // Σ Days reconciles to the T-Shirt total instead of drifting by ΣCount × 20 × 0.005.
  const months = totalDays / (sumCount * 20);
  const whole = Math.floor(months);
  const frac = months - whole;
  // Fold a small tail into the last full month ONLY if a full-time person still fits under the
  // soft ceiling: months × 160 ≤ whole × 172. (Acron, 2026-09-21: 1.098 months folded to one
  // column put Backend 1 at 175.7 hrs — over the ceiling — so the fold must check the hours.)
  const fits = months * 160 <= whole * SOFT_CEILING + 1e-9;
  const n = whole >= 1 && frac < FOLD_THRESHOLD && fits ? whole : Math.ceil(months);
  return { months, sumCount, n: Math.max(1, n) };
}

/** Resample a 3-point profile to n points (linear). */
function resampleWeights(profile, n) {
  if (n === 1) return [1];
  const out = [];
  for (let i = 0; i < n; i++) {
    const pos = (i / (n - 1)) * (profile.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(profile.length - 1, lo + 1);
    out.push(profile[lo] + (profile[hi] - profile[lo]) * (pos - lo));
  }
  return out;
}

/**
 * Ramp one person's total hours across n months (spec §2.5). Returns n values;
 * the caller writes 1..n-1 as values and month n as the remainder FORMULA.
 * Soft ceiling: no month above SOFT_CEILING; excess moves to the lowest month
 * (deterministic). HALTS if the person cannot fit at all or the discipline is unknown.
 */
function rampHours(totalHours, discipline, n) {
  if (!RAMP[discipline]) throw new Halt(`ramp: unknown discipline '${discipline}'`);
  if (totalHours > n * SOFT_CEILING + 1e-9) {
    throw new Halt(`${discipline}: ${round1(totalHours)} hrs cannot fit in ${n} months at ${SOFT_CEILING} hrs/month — add a person`);
  }
  const w = resampleWeights(RAMP[discipline], n);
  const sum = w.reduce((a, b) => a + b, 0);
  const hours = w.map((x) => (totalHours * x) / sum);
  for (let guard = 0; guard < 50; guard++) {
    const over = hours.findIndex((h) => h > SOFT_CEILING + 1e-9);
    if (over < 0) break;
    const excess = hours[over] - SOFT_CEILING;
    hours[over] = SOFT_CEILING;
    let best = -1;
    hours.forEach((h, i) => { if (i !== over && (best < 0 || h < hours[best])) best = i; });
    hours[best] += excess;
  }
  return hours.map(round1);
}

function buildRoster(plan, totalDays, mfList) {
  const people = splitRoster(plan.teamMix.fte, plan.teamMix.labels);
  const violations = [...rosterViolations(people), ...mfCoverageViolations(mfList, people)];
  if (violations.length) throw new Halt(`Team Mix roster violations:\n  - ${violations.join("\n  - ")}`, 4, violations);
  const { months, sumCount, n } = monthPlan(totalDays, people);
  const rows = people.map((p) => {
    const days = round2(months * 20 * p.count);
    const hours = round2(days * 8);
    return { ...p, months: round2(months), monthsExact: months, days, hours, monthHours: rampHours(hours, p.discipline, n) };
  });
  const sumDays = round2(rows.reduce((s, r) => s + r.days, 0));
  return { people: rows, months: round2(months), monthsExact: months, sumCount, n, sumDays };
}

// ───────────────────────── T-Shirt totals (pure) ─────────────────────────

function sizeDays(code, legend) {
  const v = sizeOf(code);
  if (v === "") return 0;
  if (legend[v] == null) throw new Halt(`size '${v}' is not in the sheet's legend`);
  return legend[v];
}

function tshirtTotals(plan, layout) {
  let raw = 0;
  for (const s of plan.tshirt.sections) for (const it of s.items) raw += sizeDays(it.fe, layout.legend) + sizeDays(it.be, layout.legend);
  const total = raw * (1 + layout.mfTotal);
  const lowDollars = total * 8 * layout.rate;
  return { rawDays: round2(raw), totalDays: round2(total), lowDollars: round2(lowDollars), highDollars: round2(lowDollars * layout.highFactor) };
}

// ───────────────────────── T-Shirt formulas (pure, spec §1.2–1.3) ─────────────────────────

/** Item-row formulas for any column map (spec §1.2). Keys are the STANDARD letters H..L; `cells` carries the real columns. */
function itemFormulasFor(r, cols, legend) {
  const L = colLetter;
  const lg = `$A$${legend.first1}:$A$${legend.last1}`, lv = `$B$${legend.first1}:$B$${legend.last1}`;
  const days = "=(" + cols.sizes.map((c) => `IF(${L(c)}${r}="",0,SUMIF(${lg},LEFT(${L(c)}${r},2)&"*",${lv}))`).join("+") + ")";
  const abs = (cell) => `$${L(cell.c)}$${cell.r + 1}`;
  const f = {
    H: days,
    I: `=${L(cols.days)}${r}*${abs(cols.mfTotal)}`,
    J: `=${L(cols.days)}${r}+${L(cols.mfactor)}${r}`,
    K: `=${L(cols.total)}${r}*8*${abs(cols.rate)}`,
    L: `=${L(cols.low)}${r}*${abs(cols.highFactor)}`,
  };
  f.cells = [[cols.days, f.H], [cols.mfactor, f.I], [cols.total, f.J], [cols.low, f.K], [cols.high, f.L]];
  return f;
}

/** The standard template's item formulas (what `write` produces). */
function itemFormulas(r) { return itemFormulasFor(r, STANDARD_COLS, STANDARD_LEGEND); }

function rollupFormulasFor(rollupRow1, firstRow1, lastRow1, cols) {
  const L = colLetter;
  const e = `$${L(cols.phase)}$${firstRow1}:$${L(cols.phase)}$${lastRow1}`;
  const ph = `$${L(cols.rollupPhase)}${rollupRow1}`;
  const rate = `$${L(cols.rate.c)}$${cols.rate.r + 1}`;
  return [
    `=SUMIF(${e},${ph},$${L(cols.low)}$${firstRow1}:$${L(cols.low)}$${lastRow1})`,
    `=SUMIF(${e},${ph},$${L(cols.total)}$${firstRow1}:$${L(cols.total)}$${lastRow1})*8`,
    `=SUMIF(${e},${ph},$${L(cols.high)}$${firstRow1}:$${L(cols.high)}$${lastRow1})`,
    `=IF(${rate}=0,0,${L(cols.highDol)}${rollupRow1}/${rate})`,
  ];
}
function rollupFormulas(rollupRow1, firstRow1, lastRow1) { return rollupFormulasFor(rollupRow1, firstRow1, lastRow1, STANDARD_COLS); }

/** Rows for items mode, starting at firstRow0 (0-based). */
function tshirtRows(plan, firstRow0) {
  const out = [];
  let r1 = firstRow0 + 1;
  for (const s of plan.tshirt.sections) {
    out.push({ kind: "section", row1: r1, values: [s.heading, "", "", "", "", "", "", "", "", "", "", ""] });
    r1++;
    for (const it of s.items) {
      const f = itemFormulas(r1);
      out.push({
        kind: "item", row1: r1, id: it.id,
        values: [it.module, it.userType, `${it.functionality} (${it.id})`, it.requirement, it.phase,
          sizeOf(it.fe), sizeOf(it.be), f.H, f.I, f.J, f.K, f.L],
      });
      r1++;
    }
  }
  const lastItem1 = r1 - 1;
  const totalRow1 = lastItem1 + 1; // directly under the last item — no blank row (David, 2026-09-21)
  const f1 = firstRow0 + 1;
  out.push({
    kind: "total", row1: totalRow1,
    values: ["Total (Days)", "", "", "", "", "", "",
      `=SUM(H${f1}:H${lastItem1})`, `=SUM(I${f1}:I${lastItem1})`, `=SUM(J${f1}:J${lastItem1})`, `=SUM(K${f1}:K${lastItem1})`, `=SUM(L${f1}:L${lastItem1})`],
  });
  // summary block directly under the totals row — no blank row
  out.push({ kind: "summary", row1: totalRow1 + 1, values: ["", "", "", "", "", "", "", "", "", "Total Days", `=J${totalRow1}`, `=J${totalRow1}*$G$4`] });
  out.push({ kind: "summary", row1: totalRow1 + 2, values: ["", "", "", "", "", "", "", "", "", "Total Hrs", `=J${totalRow1}*8`, `=J${totalRow1}*$G$4*8`] });
  out.push({ kind: "summary-cost", row1: totalRow1 + 3, values: ["", "", "", "", "", "", "", "", "", "Total Cost", `=K${totalRow1}`, `=L${totalRow1}`] });
  return { rows: out, firstItem1: f1, lastItem1, totalRow1 };
}

// ───────────────────────── write: T-Shirt ─────────────────────────

function fmtReq(sheetId, r0, r1, c0, c1, format, fields) {
  return { repeatCell: { range: gridRange(sheetId, r0, r1, c0, c1), cell: { userEnteredFormat: format }, fields } };
}
function widthReqs(sheetId, widths) {
  return widths.map((w, i) => ({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 }, properties: { pixelSize: w }, fields: "pixelSize" } }));
}
function copyPhaseReq(sheetId, srcRow0, dstRow0) {
  return { copyPaste: {
    source: gridRange(sheetId, srcRow0, srcRow0 + 1, 4, 5),
    destination: gridRange(sheetId, dstRow0, dstRow0 + 1, 4, 5),
    pasteType: "PASTE_NORMAL", pasteOrientation: "NORMAL",
  } };
}
const FMT_ITEM_TEXT = { textFormat: { fontFamily: "Calibri", fontSize: 10, bold: false }, horizontalAlignment: "LEFT" };
const FMT_ITEM_SIZE = { horizontalAlignment: "CENTER", textFormat: { fontFamily: "Calibri", fontSize: 10 } };
const FMT_ITEM_NUM = { horizontalAlignment: "RIGHT", numberFormat: { type: "NUMBER", pattern: "0.00" }, textFormat: { fontFamily: "Calibri", fontSize: 10 } };
const FMT_ITEM_CUR = { horizontalAlignment: "RIGHT", numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" }, textFormat: { fontFamily: "Calibri", fontSize: 10 } };
const FMT_FIELDS_ALL = "userEnteredFormat(textFormat,horizontalAlignment,numberFormat)";

async function writeTshirt(api, plan, opts) {
  const grid = await api.grid(TAB_TSHIRT);
  const sheetId = grid.properties.sheetId;
  const layout = locateTshirt(grid);
  const std = ["phase", "days", "mfactor", "total", "low", "high"].every((k) => layout.cols[k] === STANDARD_COLS[k]) && layout.cols.sizes.length === 2 && layout.legendFirst1 === 4 && layout.headerRow === 12;
  if (!std) throw new Halt(`${TAB_TSHIRT}: this sheet is not the current template layout (header row ${layout.headerRow + 1}, size columns ${layout.cols.sizeLabels.join("/")}) — 'write' supports the current template only; 'teammix' and 'audit' work on both`);
  const totals = tshirtTotals(plan, layout);
  const phaseSrc = findPhaseSource(grid, 0);
  if (phaseSrc < 0) throw new Halt(`${TAB_TSHIRT}: no Phase dropdown source cell found in column E — add a ONE_OF_LIST validation (MVP / Phase 1 / Phase 2 / Phase 3) to E${layout.firstItemRow + 1} and re-run`);

  if (plan.tshirt.mode === "sizes") return writeTshirtSizes(api, grid, sheetId, layout, plan, totals, phaseSrc);

  const first0 = layout.firstItemRow;
  let occupied = 0;
  for (let r = first0; r < rowCount(grid); r++) if (!rowIsEmpty(grid, r)) occupied++;
  if (occupied && !opts.replace) {
    throw new Halt(`${TAB_TSHIRT}: ${occupied} non-empty row(s) below the header. Pass --replace to overwrite them, or use tshirt.mode 'sizes' to fill existing rows.`);
  }
  const built = tshirtRows(plan, first0);
  const lastWritten1 = built.rows[built.rows.length - 1].row1;

  // 1. clear values + formats + merges in the item area (clear-then-paint)
  const clearTo = Math.max(lastWritten1 + 5, rowCount(grid) + 1);
  await api.clearValues(TAB_TSHIRT, `A${first0 + 1}:L${clearTo}`);
  await api.batch([
    { unmergeCells: { range: gridRange(sheetId, first0, clearTo, 0, 12) } },
    fmtReq(sheetId, first0, clearTo, 0, 12, {}, "userEnteredFormat"),
  ]);
  // 2. values + formulas
  await api.putValues(TAB_TSHIRT, `A${first0 + 1}:L${lastWritten1}`, built.rows.map((r) => r.values));
  // 3. rollups re-pointed to the real item range
  for (const rr of layout.rollupRows) {
    await api.putValues(TAB_TSHIRT, `K${rr + 1}:N${rr + 1}`, [rollupFormulas(rr + 1, built.firstItem1, built.lastItem1)]);
  }
  // 4. formats — item area defaults, then per-row kinds
  const reqs = [];
  const lastItem0 = built.lastItem1; // exclusive end for item-area formats (0-based end = lastItem1)
  reqs.push(fmtReq(sheetId, first0, lastItem0, 0, 12, FMT_ITEM_TEXT, "userEnteredFormat(textFormat,horizontalAlignment)"));
  reqs.push(fmtReq(sheetId, first0, lastItem0, 4, 7, FMT_ITEM_SIZE, "userEnteredFormat(horizontalAlignment,textFormat)"));
  reqs.push(fmtReq(sheetId, first0, lastItem0, 7, 10, FMT_ITEM_NUM, FMT_FIELDS_ALL));
  reqs.push(fmtReq(sheetId, first0, lastItem0, 10, 12, FMT_ITEM_CUR, FMT_FIELDS_ALL));
  for (const row of built.rows) {
    const r0 = row.row1 - 1;
    if (row.kind === "section") {
      reqs.push({ mergeCells: { range: gridRange(sheetId, r0, r0 + 1, 0, 12), mergeType: "MERGE_ALL" } });
      reqs.push(fmtReq(sheetId, r0, r0 + 1, 0, 12,
        { backgroundColor: hexToColor(COLOR.sectionBg), textFormat: { fontFamily: "Arial", fontSize: 10, bold: true, foregroundColor: hexToColor(COLOR.white) }, horizontalAlignment: "LEFT" },
        "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"));
    } else if (row.kind === "total") {
      // the template's totals row: grey band across A:L, bold 10, numbers in General format, right-aligned
      reqs.push(fmtReq(sheetId, r0, r0 + 1, 0, 12, { backgroundColor: hexToColor(COLOR.tshirtTotalBg), textFormat: { fontSize: 10, bold: true }, horizontalAlignment: "LEFT" }, "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"));
      reqs.push(fmtReq(sheetId, r0, r0 + 1, 7, 12, { horizontalAlignment: "RIGHT" }, "userEnteredFormat.horizontalAlignment"));
    } else if (row.kind === "summary" || row.kind === "summary-cost") {
      reqs.push(fmtReq(sheetId, r0, r0 + 1, 9, 12, { textFormat: { fontSize: 10, bold: true } }, "userEnteredFormat.textFormat"));
      reqs.push(fmtReq(sheetId, r0, r0 + 1, 10, 12,
        row.kind === "summary-cost" ? { horizontalAlignment: "RIGHT", numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } } : { horizontalAlignment: "RIGHT", numberFormat: { type: "NUMBER", pattern: "0.00" } },
        "userEnteredFormat(horizontalAlignment,numberFormat)"));
    } else if (row.kind === "item") {
      reqs.push(copyPhaseReq(sheetId, phaseSrc, r0)); // carries validation + chip format; value re-put below
    }
  }
  reqs.push(...widthReqs(sheetId, TSHIRT_WIDTHS));
  await api.batch(reqs);
  // 5. the Phase VALUES again — copyPaste overwrote them with the source cell's value
  const phaseVals = [];
  for (let r1 = built.firstItem1; r1 <= built.lastItem1; r1++) {
    const row = built.rows.find((x) => x.row1 === r1);
    phaseVals.push([row.kind === "item" ? row.values[4] : ""]);
  }
  await api.putValues(TAB_TSHIRT, `E${built.firstItem1}:E${built.lastItem1}`, phaseVals);

  return { layout, totals, firstItem1: built.firstItem1, lastItem1: built.lastItem1, totalRow1: built.totalRow1, itemsWritten: built.rows.filter((r) => r.kind === "item").length };
}

/** sizes mode — rows exist (gap-analysis sheet); fill E:L on rows matched by "(id)" in column C. */
async function writeTshirtSizes(api, grid, sheetId, layout, plan, totals, phaseSrc) {
  const rowsById = new Map();
  for (let r = layout.firstItemRow; r < rowCount(grid); r++) {
    const m = textAt(grid, r, 2).match(/\(([A-Za-z]+-\d+(?:\.\d+)*)\)\s*$/);
    if (m) rowsById.set(m[1], r);
  }
  const missing = [];
  const writes = [];
  let lastItem0 = layout.firstItemRow;
  for (const s of plan.tshirt.sections) for (const it of s.items) {
    const r0 = rowsById.get(it.id);
    if (r0 == null) { missing.push(it.id); continue; }
    lastItem0 = Math.max(lastItem0, r0);
    const f = itemFormulas(r0 + 1);
    writes.push({ r0, phase: it.phase, values: [it.phase, sizeOf(it.fe), sizeOf(it.be), f.H, f.I, f.J, f.K, f.L] });
  }
  if (missing.length) throw new Halt(`${TAB_TSHIRT}: no row carries these ids in column C — ${missing.join(", ")}. Rows are matched BY NAME (the "(id)" suffix), never by position.`, 4, missing);
  let totalRow0 = -1;
  for (let r = lastItem0 + 1; r < rowCount(grid); r++) if (/^Total \(Days\)/i.test(textAt(grid, r, 0))) { totalRow0 = r; break; }
  if (totalRow0 < 0) throw new Halt(`${TAB_TSHIRT}: no 'Total (Days)' row found below the items — add it (spec §1.3) and re-run`);

  for (const w of writes) await api.putValues(TAB_TSHIRT, `E${w.r0 + 1}:L${w.r0 + 1}`, [w.values]);
  const reqs = [];
  for (const w of writes) {
    if (w.r0 !== phaseSrc) reqs.push(copyPhaseReq(sheetId, phaseSrc, w.r0));
    reqs.push(fmtReq(sheetId, w.r0, w.r0 + 1, 4, 7, FMT_ITEM_SIZE, "userEnteredFormat(horizontalAlignment,textFormat)"));
    reqs.push(fmtReq(sheetId, w.r0, w.r0 + 1, 7, 10, FMT_ITEM_NUM, FMT_FIELDS_ALL));
    reqs.push(fmtReq(sheetId, w.r0, w.r0 + 1, 10, 12, FMT_ITEM_CUR, FMT_FIELDS_ALL));
  }
  await api.batch(reqs);
  for (const w of writes) await api.putValues(TAB_TSHIRT, `E${w.r0 + 1}`, [[w.phase]]);
  const first1 = layout.firstItemRow + 1;
  const last1 = lastItem0 + 1;
  await api.putValues(TAB_TSHIRT, `H${totalRow0 + 1}:L${totalRow0 + 1}`, [[`=SUM(H${first1}:H${last1})`, `=SUM(I${first1}:I${last1})`, `=SUM(J${first1}:J${last1})`, `=SUM(K${first1}:K${last1})`, `=SUM(L${first1}:L${last1})`]]);
  for (const rr of layout.rollupRows) await api.putValues(TAB_TSHIRT, `K${rr + 1}:N${rr + 1}`, [rollupFormulas(rr + 1, first1, last1)]);
  return { layout, totals, firstItem1: first1, lastItem1: last1, totalRow1: totalRow0 + 1, itemsWritten: writes.length };
}

// ───────────────────────── write: Team Mix (spec §2) ─────────────────────────

/** Team Mix staffs the MIDPOINT of the Low and High figures (David, 2026-09-21): mid = low × (1 + highFactor) / 2. */
function midDays(lowDays, highFactor) { return round2(lowDays * (1 + highFactor) / 2); }

/** Per-phase T-Shirt totals in PHASES order — only phases with hours > 0 (spec §2.6). `totalDays` is the Low figure; `staffDays` the midpoint the Team Mix staffs. */
function phaseTotals(plan, layout) {
  const raw = {};
  for (const s of plan.tshirt.sections) for (const it of s.items) {
    raw[it.phase] = (raw[it.phase] ? raw[it.phase] : 0) + sizeDays(it.fe, layout.legend) + sizeDays(it.be, layout.legend);
  }
  return PHASES.filter((ph) => raw[ph] > 0).map((ph) => {
    const low = round2(raw[ph] * (1 + layout.mfTotal));
    return { phase: ph, rawDays: round2(raw[ph]), totalDays: low, highDays: round2(low * layout.highFactor), staffDays: midDays(low, layout.highFactor) };
  });
}

/** One roster per phase with hours. FTE comes from teamMix.phases[<phase>].fte when given, else teamMix.fte. */
function buildRosters(plan, layout) {
  const phases = phaseTotals(plan, layout);
  if (!phases.length) throw new Halt("no phase has any hours — nothing to staff");
  return phases.map((ph) => {
    const override = plan.teamMix.phases && plan.teamMix.phases[ph.phase] && plan.teamMix.phases[ph.phase].fte;
    const sub = override ? { ...plan, teamMix: { ...plan.teamMix, fte: override } } : plan;
    return { ...ph, roster: buildRoster(sub, ph.staffDays, layout.mf) };
  });
}

/**
 * The last month's REMAINDER formula (spec §2.1). n=1: the whole total; n=2: `=F-I`
 * (Google rewrites a one-cell range `SUM(I3:I3)` to `SUM(I3)`, so the read-back
 * would never match — write the canonical form); n>2: `=F-SUM(first:second-to-last)`.
 */
function remainderFormula(r1, firstMonthC, n) {
  if (n === 1) return `=F${r1}`;
  if (n === 2) return `=F${r1}-${colLetter(firstMonthC)}${r1}`;
  return `=F${r1}-SUM(${colLetter(firstMonthC)}${r1}:${colLetter(firstMonthC + n - 2)}${r1})`;
}

/**
 * The cell values of ONE Team Mix grid starting at 0-based row `top` (spec §2.1):
 * title, header, one row per person, Total, Total Days. Formulas use absolute rows.
 */
function teamMixValues(plan, roster, phase, top) {
  const n = roster.n;
  const firstMonthC = 8; // I
  const totalC = firstMonthC + n; // Total Hrs column index — derived, never remembered
  const width = totalC + 1;
  const L = colLetter;
  const header = ["Skill set", "Count", "", "Mths", "Days", "Hrs", "", "Resource"];
  for (let m = 1; m <= n; m++) header.push(`Mon ${m}`);
  header.push("Total Hrs");
  const rows = [];
  rows.push([phase ? `${plan.title} — ${phase}` : plan.title, ...Array(width - 1).fill("")]);
  rows.push(header);
  const firstP = top + 3; // 1-based row of the first person
  roster.people.forEach((p, i) => {
    const r1 = firstP + i;
    const row = [p.label, p.count, "", roster.monthsExact, `=D${r1}*20*B${r1}`, `=E${r1}*8`, "", p.label];
    for (let m = 0; m < n - 1; m++) row.push(p.monthHours[m]);
    row.push(remainderFormula(r1, firstMonthC, n));
    row.push(`=SUM(${L(firstMonthC)}${r1}:${L(totalC - 1)}${r1})`);
    rows.push(row);
  });
  const lastP = firstP + roster.people.length - 1;
  const totalR = lastP + 1;
  const total = ["Total", `=SUM(B${firstP}:B${lastP})`, "", "", `=SUM(E${firstP}:E${lastP})`, `=SUM(F${firstP}:F${lastP})`, "", "Total Hours"];
  for (let c = firstMonthC; c <= totalC; c++) total.push(`=SUM(${L(c)}${firstP}:${L(c)}${lastP})`);
  rows.push(total);
  const totalDays = ["", "", "", "", "", "", "", "Total Days"];
  for (let c = firstMonthC; c <= totalC; c++) totalDays.push(`=${L(c)}${totalR}/8`);
  rows.push(totalDays);
  return { rows, width, totalC, firstMonthC, top, titleR: top + 1, headerR: top + 2, firstP, lastP, totalR, totalDaysR: totalR + 1, bottom: totalR + 1 };
}

const GRID_GAP = 2; // blank rows between phase grids (spec §2.6)

/** Format requests for one grid (spec §2.1 styling), computed from the grid's own shape. */
function teamMixFormatReqs(sheetId, v) {
  const W = v.width;
  const arial = (bold) => ({ fontFamily: "Arial", fontSize: 10, bold });
  const white = { backgroundColor: hexToColor(COLOR.white) };
  const reqs = [];
  const t0 = v.titleR - 1, h0 = v.headerR - 1, p0 = v.firstP - 1, p1 = v.lastP, tot0 = v.totalR - 1;
  reqs.push({ mergeCells: { range: gridRange(sheetId, t0, t0 + 1, 0, W), mergeType: "MERGE_ALL" } });
  reqs.push(fmtReq(sheetId, t0, t0 + 1, 0, W, { backgroundColor: hexToColor(COLOR.teamTitleBg), textFormat: { fontFamily: "Montserrat", fontSize: 20, bold: true, foregroundColor: hexToColor(COLOR.white) }, horizontalAlignment: "CENTER" }, "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"));
  reqs.push(fmtReq(sheetId, h0, v.bottom, 0, W, { textFormat: arial(false), horizontalAlignment: "RIGHT", numberFormat: { type: "NUMBER", pattern: "0.00" } }, FMT_FIELDS_ALL));
  reqs.push(fmtReq(sheetId, h0, h0 + 1, 0, W, { backgroundColor: hexToColor(COLOR.teamHeaderBg), textFormat: { ...arial(true), foregroundColor: hexToColor(COLOR.white) } }, "userEnteredFormat(backgroundColor,textFormat)"));
  reqs.push(fmtReq(sheetId, h0, h0 + 1, 2, 3, white, "userEnteredFormat.backgroundColor"));
  reqs.push(fmtReq(sheetId, h0, h0 + 1, 6, 7, white, "userEnteredFormat.backgroundColor"));
  reqs.push(fmtReq(sheetId, h0, v.bottom, 0, 1, { horizontalAlignment: "LEFT" }, "userEnteredFormat.horizontalAlignment"));
  reqs.push(fmtReq(sheetId, h0, v.bottom, 7, 8, { horizontalAlignment: "LEFT" }, "userEnteredFormat.horizontalAlignment"));
  reqs.push(fmtReq(sheetId, h0, h0 + 1, v.totalC, v.totalC + 1, { horizontalAlignment: "LEFT" }, "userEnteredFormat.horizontalAlignment"));
  const sage = { backgroundColor: hexToColor(COLOR.sage), textFormat: arial(true) };
  reqs.push(fmtReq(sheetId, p0, p1, 4, 6, sage, "userEnteredFormat(backgroundColor,textFormat)"));
  reqs.push(fmtReq(sheetId, p0, p1, v.totalC, v.totalC + 1, sage, "userEnteredFormat(backgroundColor,textFormat)"));
  reqs.push(fmtReq(sheetId, tot0, tot0 + 1, 0, W, { backgroundColor: hexToColor(COLOR.totalBg), textFormat: arial(true) }, "userEnteredFormat(backgroundColor,textFormat)"));
  reqs.push(fmtReq(sheetId, tot0, tot0 + 1, 2, 3, white, "userEnteredFormat.backgroundColor"));
  reqs.push(fmtReq(sheetId, tot0, tot0 + 1, 6, 7, white, "userEnteredFormat.backgroundColor"));
  reqs.push(fmtReq(sheetId, tot0 + 1, tot0 + 2, 7, W, { backgroundColor: hexToColor(COLOR.totalDaysBg), textFormat: arial(true) }, "userEnteredFormat(backgroundColor,textFormat)"));
  return reqs;
}

/** Write every phase grid on the one Team Mix tab: clear-then-paint, GRID_GAP blank rows between grids. */
async function writeTeamMix(api, plan, rosters) {
  const grid = await api.grid(TAB_TEAM);
  const sheetId = grid.properties.sheetId;
  const grids = [];
  let top = 0;
  for (const r of rosters) {
    const v = teamMixValues(plan, r.roster, rosters.length > 1 || r.phase ? r.phase : "", top);
    grids.push({ phase: r.phase, v });
    top = v.bottom + GRID_GAP;
  }
  const lastRow = grids[grids.length - 1].v.bottom;
  const clearRows = Math.max(60, rowCount(grid) + 2, lastRow + 10);
  await api.clearValues(TAB_TEAM, `A1:Z${clearRows}`);
  await api.batch([
    { unmergeCells: { range: gridRange(sheetId, 0, clearRows, 0, 26) } },
    fmtReq(sheetId, 0, clearRows, 0, 26, {}, "userEnteredFormat"),
  ]);
  const reqs = [];
  let maxN = 0;
  for (const g of grids) {
    await api.putValues(TAB_TEAM, `A${g.v.titleR}:${colLetter(g.v.width - 1)}${g.v.bottom}`, g.v.rows);
    reqs.push(...teamMixFormatReqs(sheetId, g.v));
    maxN = Math.max(maxN, g.v.totalC - g.v.firstMonthC);
  }
  reqs.push(...widthReqs(sheetId, [...TEAM_WIDTHS_FIXED, ...Array(maxN).fill(TEAM_MONTH_WIDTH), TEAM_TOTAL_WIDTH]));
  await api.batch(reqs);
  return { grids: grids.map((g) => ({ phase: g.phase, titleR: g.v.titleR, bottom: g.v.bottom, rows: g.v.rows.length })), lastRow };
}

// ───────────────────────── write: Technology Stack (spec §3) ─────────────────────────

async function writeTechStack(api, plan) {
  const grid = await api.grid(TAB_TECH);
  const sheetId = grid.properties.sheetId;
  const rows = [["Technology Stack", ""], ...plan.techStack.map((r) => [r.category, r.description])];
  const clearRows = Math.max(40, rowCount(grid) + 2);
  await api.clearValues(TAB_TECH, `A1:B${clearRows}`);
  await api.batch([
    { unmergeCells: { range: gridRange(sheetId, 0, clearRows, 0, 2) } },
    fmtReq(sheetId, 0, clearRows, 0, 2, {}, "userEnteredFormat"),
  ]);
  await api.putValues(TAB_TECH, `A1:B${rows.length}`, rows);
  await api.batch([
    { mergeCells: { range: gridRange(sheetId, 0, 1, 0, 2), mergeType: "MERGE_ALL" } },
    fmtReq(sheetId, 0, 1, 0, 2, { backgroundColor: hexToColor(COLOR.teamHeaderBg), textFormat: { fontSize: 12, bold: true, foregroundColor: hexToColor(COLOR.white) } }, "userEnteredFormat(backgroundColor,textFormat)"),
    fmtReq(sheetId, 1, rows.length, 0, 2, { textFormat: { fontFamily: "Arial", fontSize: 10 }, wrapStrategy: "WRAP" }, "userEnteredFormat(textFormat,wrapStrategy)"),
    ...widthReqs(sheetId, TECH_WIDTHS),
  ]);
  return { rows: rows.length - 1 };
}

// ───────────────────────── audit (spec §5, by read-back) ─────────────────────────

function check(list, name, ok, detail) { list.push({ check: name, ok: !!ok, detail: ok ? "" : String(detail == null ? "" : detail) }); }

/** T-Shirt audit — layout-aware via locateTshirt's column map. HALTS if the header block is missing. */
function auditTshirt(grid) {
  const out = [];
  const layout = locateTshirt(grid);
  const { cols } = layout;
  const legendRows = { first1: layout.legendFirst1, last1: layout.legendLast1 };
  const first0 = layout.firstItemRow;
  const badSizes = [], noDv = [], badFormula = [], sectionsWithSizes = [], badSectionFmt = [];
  let lastItem0 = -1, totalRow0 = -1;
  for (let r = first0; r < rowCount(grid); r++) {
    const a = textAt(grid, r, 0);
    if (/^Total \(Days\)/i.test(a)) { totalRow0 = r; break; }
    if (rowIsEmpty(grid, r, cols.high + 1)) continue;
    const isSection = a !== "" && textAt(grid, r, 2) === "" && textAt(grid, r, cols.days) === "";
    if (isSection) {
      if (cols.sizes.some((c) => textAt(grid, r, c) !== "")) sectionsWithSizes.push(r + 1);
      if (bgAt(grid, r, 0) !== COLOR.sectionBg) badSectionFmt.push(`row ${r + 1} bg ${bgAt(grid, r, 0)}`);
      continue;
    }
    lastItem0 = r;
    for (const c of cols.sizes) {
      const v = textAt(grid, r, c).trim();
      if (v && !SIZE_CODES.includes(v)) badSizes.push(`${colLetter(c)}${r + 1}='${v}'`);
    }
    const cell = cellAt(grid, r, cols.phase);
    if (!(cell && cell.dataValidation && cell.dataValidation.condition && cell.dataValidation.condition.type === "ONE_OF_LIST")) noDv.push(`${colLetter(cols.phase)}${r + 1}`);
    const f = itemFormulasFor(r + 1, cols, legendRows);
    for (const [c, want] of f.cells) if (formulaAt(grid, r, c) !== want) badFormula.push(`${colLetter(c)}${r + 1}`);
  }
  check(out, "T-Shirt: at least one item row", lastItem0 >= 0, "no item rows below the header");
  check(out, "T-Shirt: size cells are bare codes (no legend text, no '-')", !badSizes.length, badSizes.slice(0, 10).join(", "));
  check(out, "T-Shirt: every item row has the Phase dropdown", !noDv.length, noDv.slice(0, 10).join(", "));
  check(out, "T-Shirt: Days..HIGH $ are the spec formulas on every item row", !badFormula.length, badFormula.slice(0, 12).join(", "));
  check(out, "T-Shirt: section rows carry no sizes", !sectionsWithSizes.length, `rows ${sectionsWithSizes.join(", ")}`);
  check(out, "T-Shirt: section rows are styled (bg #1C4F8B)", !badSectionFmt.length, badSectionFmt.slice(0, 6).join(", "));
  check(out, "T-Shirt: 'Total (Days)' row exists below the items", totalRow0 > lastItem0 && lastItem0 >= 0, "not found");
  let totalDaysCell = NaN;
  const phaseDays = {};
  for (const rr of layout.rollupRows) {
    const low = numAt(grid, rr, cols.lowHrs), high = numAt(grid, rr, cols.highHrs);
    phaseDays[textAt(grid, rr, cols.rollupPhase).trim()] = Number.isNaN(low) || Number.isNaN(high) ? NaN : round2((low + high) / 2 / 8);
  }
  if (totalRow0 > lastItem0 && lastItem0 >= 0) {
    check(out, "T-Shirt: totals row sits directly under the last item (no blank row)", totalRow0 === lastItem0 + 1, `last item row ${lastItem0 + 1}, totals row ${totalRow0 + 1}`);
    const totFont = fontAt(grid, totalRow0, 0);
    check(out, "T-Shirt: totals row is the template band (bg #D8DDE8, bold) across the table", [0, cols.phase, cols.total, cols.high].every((c) => bgAt(grid, totalRow0, c) === COLOR.tshirtTotalBg) && totFont.bold, `A bg ${bgAt(grid, totalRow0, 0)}, ${colLetter(cols.high)} bg ${bgAt(grid, totalRow0, cols.high)}, bold ${totFont.bold}`);
    const want = `=SUM(${colLetter(cols.total)}${first0 + 1}:${colLetter(cols.total)}${lastItem0 + 1})`;
    check(out, "T-Shirt: totals row sums the full item range", formulaAt(grid, totalRow0, cols.total) === want, `${colLetter(cols.total)}${totalRow0 + 1} is '${formulaAt(grid, totalRow0, cols.total)}', want '${want}'`);
    totalDaysCell = numAt(grid, totalRow0, cols.total);
    // summary block: the three labels directly under the totals row, anywhere in the row
    const findLabel = (r) => { for (let c = 0; c < cols.high + 1; c++) { const v = textAt(grid, r, c).trim(); if (/^Total (Days|Hrs|Cost)$/i.test(v)) return { c, v }; } return null; };
    const sumRows = [totalRow0 + 1, totalRow0 + 2, totalRow0 + 3];
    const labels = sumRows.map(findLabel);
    check(out, "T-Shirt: summary block (Total Days / Total Hrs / Total Cost) sits directly under the totals row", labels[0] && labels[0].v === "Total Days" && labels[1] && labels[1].v === "Total Hrs" && labels[2] && labels[2].v === "Total Cost", `rows ${sumRows[0] + 1}–${sumRows[2] + 1} = [${labels.map((l) => (l ? l.v : "")).join(", ")}]`);
    check(out, "T-Shirt: summary labels are bold", labels.every((l) => l && fontAt(grid, sumRows[labels.indexOf(l)], l.c).bold), "");
    if (labels[2]) {
      const costCell = cellAt(grid, sumRows[2], labels[2].c + 1);
      const costFmt = costCell && costCell.userEnteredFormat && costCell.userEnteredFormat.numberFormat;
      check(out, "T-Shirt: Total Cost is formatted as dollars", !!costFmt && costFmt.type === "CURRENCY", `${colLetter(labels[2].c + 1)}${sumRows[2] + 1} numberFormat ${JSON.stringify(costFmt)}`);
    } else check(out, "T-Shirt: Total Cost is formatted as dollars", false, "no Total Cost row");
    const badRoll = [];
    for (const rr of layout.rollupRows) {
      if (formulaAt(grid, rr, cols.lowDol) !== rollupFormulasFor(rr + 1, first0 + 1, lastItem0 + 1, cols)[0]) badRoll.push(`${colLetter(cols.lowDol)}${rr + 1}`);
    }
    check(out, "T-Shirt: phase rollups reference the full item range", !badRoll.length, badRoll.join(", "));
    let summaryAbove = false;
    for (let r = first0; r < totalRow0; r++) if (findLabel(r)) summaryAbove = true;
    check(out, "T-Shirt: no summary label inside the summed range", !summaryAbove, "a Total Days/Hrs/Cost label sits inside the summed range");
    let raw = 0;
    for (let r = first0; r <= lastItem0; r++) {
      for (const c of cols.sizes) { const v = textAt(grid, r, c).trim(); if (v && layout.legend[v] != null) raw += layout.legend[v]; }
    }
    const recomputed = round2(raw * (1 + layout.mfTotal));
    check(out, "T-Shirt: Σ raw sizes × (1+MF) == Total Days cell", Math.abs(recomputed - totalDaysCell) < 0.02, `recomputed ${recomputed}, cell ${totalDaysCell}`);
  }
  return { checks: out, layout, totalDays: totalDaysCell, staffDays: Number.isNaN(totalDaysCell) ? NaN : midDays(totalDaysCell, layout.highFactor), lastItem1: lastItem0 + 1, phaseDays };
}

function disciplineOfLabel(label) {
  const l = label.toLowerCase();
  if (/qa|test/.test(l)) return "qa";
  if (/project m|\bpm\b/.test(l)) return "pm";
  if (/analys/.test(l)) return "ba";
  if (/devops/.test(l)) return "devops";
  if (/lead|architect/.test(l)) return "techlead";
  if (/design|\bux\b/.test(l)) return "design";
  if (/mobile|ios|android/.test(l)) return "mobile";
  if (/front/.test(l)) return "frontend";
  if (/back|api|platform/.test(l)) return "backend";
  return "";
}

/**
 * Team Mix audit — one grid per phase with hours (spec §2.6). mfList (from the T-Shirt
 * tab) is REQUIRED. phaseDays = { phase: days } read from the T-Shirt rollups (the
 * independent figure each grid must reconcile to); tshirtTotalDays for the sum.
 */
function auditTeamMix(grid, mfList, tshirtTotalDays, phaseDays) {
  const out = [];
  // locate grids: every row whose A == 'Skill set' is a header; its title is the row above
  const headers = [];
  for (let r = 0; r < rowCount(grid); r++) if (textAt(grid, r, 0) === "Skill set") headers.push(r);
  check(out, "Team Mix: at least one grid (a 'Skill set' header row)", headers.length > 0, "no header row found");
  const expectedPhases = phaseDays ? Object.keys(phaseDays).filter((ph) => phaseDays[ph] > 0) : [];
  if (expectedPhases.length) check(out, "Team Mix: one grid per phase with hours", headers.length === expectedPhases.length, `${headers.length} grid(s) for phases [${expectedPhases.join(", ")}]`);
  let sumDaysAll = 0;
  let tolAll = 0;
  let prevBottom = -1;
  headers.forEach((h, gi) => {
    const label = headers.length > 1 ? `Team Mix grid ${gi + 1}` : "Team Mix";
    const title = textAt(grid, h - 1, 0);
    check(out, `${label}: title row directly above the header`, h >= 1 && title !== "" && title !== "Skill set", `row ${h} above header is '${title}'`);
    if (gi > 0) {
      const gap = h - 1 - (prevBottom + 1);
      check(out, `${label}: exactly ${GRID_GAP} blank rows before it`, gap === GRID_GAP, `${gap} row(s) between the previous grid and this title`);
      let strayGap = [];
      for (let r = prevBottom + 1; r < h - 1; r++) for (let c = 0; c < 26; c++) if (textAt(grid, r, c) !== "" || bgAt(grid, r, c) !== COLOR.white) strayGap.push(`${colLetter(c)}${r + 1}`);
      check(out, `${label}: the gap rows are empty and unformatted`, !strayGap.length, strayGap.slice(0, 6).join(", "));
    }
    const hdr = [];
    for (let c = 0; c < 30; c++) hdr.push(textAt(grid, h, c));
    check(out, `${label}: row after the header is a person, not a second header`, textAt(grid, h + 1, 0) !== "Skill set" && textAt(grid, h + 1, 0) !== "", `A${h + 2}='${textAt(grid, h + 1, 0)}'`);
    const monthCols = [];
    hdr.forEach((x, c) => { if (/^Mon \d+$/.test(x)) monthCols.push(c); });
    const totalC = hdr.indexOf("Total Hrs");
    const lastM = monthCols.length ? monthCols[monthCols.length - 1] : -1;
    check(out, `${label}: month headers are Mon 1..N, contiguous, then Total Hrs`, monthCols.length > 0 && totalC === lastM + 1 && monthCols.every((c, i) => hdr[c] === `Mon ${i + 1}` && c === monthCols[0] + i), `months [${monthCols.map((c) => hdr[c]).join(",")}], Total Hrs at column ${totalC}`);
    check(out, `${label}: header columns are Skill set/Count/Mths/Days/Hrs/Resource`, hdr[1] === "Count" && hdr[3] === "Mths" && hdr[4] === "Days" && hdr[5] === "Hrs" && hdr[7] === "Resource", hdr.slice(0, 8).join("|"));
    const people = [];
    let totalR = -1;
    for (let r = h + 1; r < rowCount(grid); r++) {
      const a = textAt(grid, r, 0);
      if (/^Total$/i.test(a)) { totalR = r; break; }
      if (a === "") break;
      people.push({ r, label: a, count: numAt(grid, r, 1), discipline: disciplineOfLabel(a) });
    }
    check(out, `${label}: a 'Total' row follows the people`, totalR > h, "no Total row");
    check(out, `${label}: every person has a numeric Count`, people.every((p) => !Number.isNaN(p.count)), people.filter((p) => Number.isNaN(p.count)).map((p) => p.label).join(", "));
    check(out, `${label}: no Count > 1.00`, people.every((p) => p.count <= 1 + 1e-9), people.filter((p) => p.count > 1).map((p) => `${p.label}=${p.count}`).join(", "));
    const groups = {};
    people.forEach((p) => { const k = p.label.replace(/\s+\d+$/, ""); (groups[k] = groups[k] ? groups[k] : []).push(p); });
    const smeared = [];
    for (const [k, rows] of Object.entries(groups)) rows.slice(0, -1).forEach((p) => { if (Math.abs(p.count - 1) > 1e-9) smeared.push(`${k}: ${p.count} before a later row`); });
    check(out, `${label}: per discipline, all rows but the last are 1.00 (saturate then spill)`, !smeared.length, smeared.join("; "));
    const cov = mfCoverageViolations(mfList, people.filter((p) => p.discipline));
    check(out, `${label}: every non-zero MF factor has a person`, !cov.length, cov.join("; "));
    const badF = [], negative = [], over = [];
    if (monthCols.length && totalC > 0) {
      const firstM = monthCols[0];
      for (const p of people) {
        const r1 = p.r + 1;
        if (formulaAt(grid, p.r, 4) !== `=D${r1}*20*B${r1}`) badF.push(`E${r1}`);
        if (formulaAt(grid, p.r, 5) !== `=E${r1}*8`) badF.push(`F${r1}`);
        if (monthCols.length > 1 && formulaAt(grid, p.r, lastM) !== remainderFormula(r1, firstM, monthCols.length)) badF.push(`${colLetter(lastM)}${r1} (remainder)`);
        if (!formulaAt(grid, p.r, totalC).startsWith("=")) badF.push(`${colLetter(totalC)}${r1}`);
        for (const c of monthCols) {
          const hv = numAt(grid, p.r, c);
          if (Number.isNaN(hv)) negative.push(`${colLetter(c)}${r1}=not a number`);
          else if (hv < -1e-9) negative.push(`${colLetter(c)}${r1}=${hv}`);
          else if (hv > SOFT_CEILING + 1e-9) over.push(`${colLetter(c)}${r1}=${hv}`);
        }
      }
    }
    check(out, `${label}: Days/Hrs/remainder/Total Hrs are formulas`, !badF.length, badF.join(", "));
    check(out, `${label}: no negative or non-numeric month`, !negative.length, negative.join(", "));
    check(out, `${label}: no month cell above ${SOFT_CEILING} hrs`, !over.length, over.join(", "));
    if (monthCols.length > 1 && people.length) {
      const flat = people.filter((p) => p.discipline !== "pm").every((p) => {
        const vals = monthCols.map((c) => round1(numAt(grid, p.r, c)));
        return vals.every((x) => Math.abs(x - vals[0]) < 0.05);
      });
      check(out, `${label}: ramp applied (roles are not all flat)`, !flat, "every non-PM role has identical hours each month");
    }
    const badFont = [], badSage = [], whiteMissing = [];
    for (const p of people) {
      for (let c = 0; c <= totalC; c++) {
        const f = fontAt(grid, p.r, c);
        if (f.family && f.family !== "Arial") badFont.push(`${colLetter(c)}${p.r + 1}=${f.family}`);
        const bg = bgAt(grid, p.r, c);
        const shouldSage = c === 4 || c === 5 || c === totalC;
        if (shouldSage && bg !== COLOR.sage) badSage.push(`${colLetter(c)}${p.r + 1} bg ${bg}`);
        if (!shouldSage && bg !== COLOR.white) whiteMissing.push(`${colLetter(c)}${p.r + 1} bg ${bg}`);
      }
    }
    check(out, `${label}: body font is Arial (never Calibri)`, !badFont.length, badFont.slice(0, 8).join(", "));
    check(out, `${label}: sage on exactly Days, Hrs, Total Hrs of role rows`, !badSage.length && !whiteMissing.length, [...badSage, ...whiteMissing].slice(0, 8).join(", "));
    if (totalR > 0 && totalC > 0) {
      const bandBad = [];
      for (const c of [...monthCols, totalC, 0, 1]) if (bgAt(grid, totalR, c) !== COLOR.totalBg) bandBad.push(`${colLetter(c)}${totalR + 1}`);
      for (const c of [...monthCols, totalC, 7]) if (bgAt(grid, totalR + 1, c) !== COLOR.totalDaysBg) bandBad.push(`${colLetter(c)}${totalR + 2}`);
      check(out, `${label}: Total (#E5E5E5) and Total Days (#9EC1EF) bands span every month + Total Hrs`, !bandBad.length, bandBad.join(", "));
      const strayRight = [];
      for (let r = h - 1; r <= totalR + 1; r++) for (let c = totalC + 1; c < 26; c++) if (bgAt(grid, r, c) !== COLOR.white) strayRight.push(`${colLetter(c)}${r + 1}`);
      check(out, `${label}: nothing formatted right of the grid`, !strayRight.length, strayRight.slice(0, 8).join(", "));
      const sumDays = numAt(grid, totalR, 4);
      const sumCount = numAt(grid, totalR, 1);
      sumDaysAll += Number.isNaN(sumDays) ? 0 : sumDays;
      // Mths is written to 2 decimals (the sheet convention), so Σ Days can drift by up to
      // ΣCount × 20 × 0.005 from the exact figure — the tolerance follows the roster size.
      const tol = 0.05 + 0.1 * (Number.isNaN(sumCount) ? 1 : sumCount);
      tolAll += tol;
      const phase = expectedPhases.find((ph) => title.endsWith(ph));
      if (expectedPhases.length) {
        check(out, `${label}: title names a phase with hours`, !!phase, `title '${title}' ends with none of [${expectedPhases.join(", ")}]`);
        if (phase) check(out, `${label} (${phase}): Σ Days == midpoint of that phase's Low/High days`, Math.abs(sumDays - phaseDays[phase]) < tol, `Team Mix ${sumDays}, T-Shirt ${phaseDays[phase]} (tolerance ${round2(tol)})`);
      }
      prevBottom = totalR + 1;
    }
  });
  if (prevBottom >= 0) {
    const strayBelow = [];
    for (let r = prevBottom + 1; r < Math.min(rowCount(grid), prevBottom + 40); r++) for (let c = 0; c < 26; c++) if (bgAt(grid, r, c) !== COLOR.white) strayBelow.push(`${colLetter(c)}${r + 1}`);
    check(out, "Team Mix: nothing formatted below the last grid", !strayBelow.length, strayBelow.slice(0, 8).join(", "));
  }
  if (!Number.isNaN(tshirtTotalDays) && headers.length) {
    check(out, "Team Mix: Σ Days over all grids == midpoint of T-Shirt Low/High days", Math.abs(sumDaysAll - tshirtTotalDays) < Math.max(0.15, tolAll), `Team Mix ${round2(sumDaysAll)}, T-Shirt midpoint ${tshirtTotalDays} (tolerance ${round2(Math.max(0.15, tolAll))})`);
  }
  return { checks: out, grids: headers.length };
}

function auditTechStack(grid) {
  const out = [];
  let filled = 0;
  const tbd = [];
  for (let r = 1; r < rowCount(grid); r++) {
    const a = textAt(grid, r, 0), b = textAt(grid, r, 1);
    if (a && b) { filled++; if (/\bTBD\b/i.test(b)) tbd.push(a); }
  }
  check(out, "Technology Stack: A1 header present", /^Technology Stack$/i.test(textAt(grid, 0, 0)), `A1='${textAt(grid, 0, 0)}'`);
  check(out, "Technology Stack: at least 3 category rows filled", filled >= 3, `${filled} filled`);
  check(out, "Technology Stack: no row says TBD", !tbd.length, tbd.join(", "));
  return { checks: out, rows: filled };
}

function auditOverview(grid) {
  const out = [];
  const cells = [[1, 2], [1, 4], [2, 2], [2, 4]];
  const bad = cells.filter(([r, c]) => Number.isNaN(numAt(grid, r, c)) || !formulaAt(grid, r, c).includes(TAB_TSHIRT));
  check(out, "Overview: C2/E2/C3/E3 reference the T-Shirt tab and resolve to numbers", !bad.length, bad.map(([r, c]) => `${colLetter(c)}${r + 1}='${formulaAt(grid, r, c) ? formulaAt(grid, r, c) : textAt(grid, r, c)}'`).join(", "));
  return { checks: out };
}

async function runAudit(api) {
  const meta = await api.meta();
  const tabs = new Set(meta.sheets.map((s) => s.properties.title));
  for (const t of [TAB_TSHIRT, TAB_TEAM, TAB_TECH]) if (!tabs.has(t)) throw new Halt(`tab '${t}' is missing — this is not a Tekyz estimate sheet`);
  const checks = [];
  const tshirt = auditTshirt(await api.grid(TAB_TSHIRT));
  checks.push(...tshirt.checks);
  checks.push(...auditTeamMix(await api.grid(TAB_TEAM), tshirt.layout.mf, tshirt.staffDays, tshirt.phaseDays).checks);
  checks.push(...auditTechStack(await api.grid(TAB_TECH)).checks);
  if (tabs.has(TAB_OVERVIEW)) checks.push(...auditOverview(await api.grid(TAB_OVERVIEW)).checks);
  else check(checks, "Overview tab exists (the estimates index imports its cells)", false, "missing");
  const failed = checks.filter((c) => !c.ok);
  return { title: meta.properties.title, checks, failed: failed.length, ok: failed.length === 0 };
}

// ───────────────────────── verbs ─────────────────────────

function loadPlan(p) {
  if (!p) throw new Halt("--plan <plan.json> is required", 64);
  if (!fs.existsSync(p)) throw new Halt(`plan file not found: ${p}`, 64);
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    throw new Halt(`plan ${p} is not valid JSON: ${e.message}`, 64);
  }
  const errors = validatePlan(plan);
  if (errors.length) throw new Halt(`plan invalid:\n  - ${errors.join("\n  - ")}`, 4, errors);
  return plan;
}

function rosterTable(roster) {
  const lines = [];
  lines.push(["Skill set", "Count", "Mths", "Days", "Hrs", ...Array.from({ length: roster.n }, (_, i) => `Mon ${i + 1}`)].join(" | "));
  for (const p of roster.people) {
    const months = p.monthHours.map((h, i) => (i === roster.n - 1 ? `${round1(p.hours - p.monthHours.slice(0, -1).reduce((a, b) => a + b, 0))} (rem)` : String(h)));
    lines.push([p.label, p.count.toFixed(2), p.months.toFixed(2), p.days.toFixed(2), p.hours.toFixed(2), ...months].join(" | "));
  }
  lines.push(`Σ Count ${roster.sumCount.toFixed(2)} · months ${roster.months} · columns ${roster.n} · Σ Days ${roster.sumDays}`);
  return lines.join("\n");
}

async function verbRead(api, tab) {
  const meta = await api.meta();
  const out = { title: meta.properties.title, tabs: meta.sheets.map((s) => ({ title: s.properties.title, sheetId: s.properties.sheetId })) };
  if (tab) {
    const grid = await api.grid(tab);
    const rows = [];
    for (let r = 0; r < rowCount(grid); r++) {
      if (rowIsEmpty(grid, r, 20)) continue;
      const cells = [];
      for (let c = 0; c < 20; c++) {
        const t = textAt(grid, r, c);
        if (t !== "") cells.push(`${colLetter(c)}${r + 1}=${JSON.stringify(t)}${bgAt(grid, r, c) !== COLOR.white ? `[${bgAt(grid, r, c)}]` : ""}`);
      }
      rows.push(cells.join(" | "));
    }
    out.tab = tab;
    out.rows = rows;
  }
  return out;
}

function rostersTable(rosters) {
  return rosters.map((r) => `── ${r.phase}: low ${r.totalDays} d · high ${r.highDays} d → staffing the midpoint ${r.staffDays} d ──\n${rosterTable(r.roster)}`).join("\n");
}

async function verbPlanCheck(api, plan) {
  const layout = locateTshirt(await api.grid(TAB_TSHIRT));
  const totals = tshirtTotals(plan, layout);
  const rosters = buildRosters(plan, layout);
  return { totals, mf: layout.mf, mfTotal: round2(layout.mfTotal), highFactor: layout.highFactor, rate: layout.rate, rosters, table: rostersTable(rosters) };
}

/**
 * Derive the per-discipline FTE from a sheet's EXISTING Team Mix (first grid): each person
 * row's label → discipline, Count summed per discipline. HALTS on a label it cannot classify
 * or a grid it cannot find — a rebuild must never guess a roster.
 */
function deriveFteFromTeamMix(grid) {
  let header = -1;
  for (let r = 0; r < rowCount(grid); r++) if (textAt(grid, r, 0) === "Skill set") { header = r; break; }
  if (header < 0) throw new Halt(`${TAB_TEAM}: no 'Skill set' header row — cannot derive the roster`);
  // Two roster models exist. Current: Count is an ENTERED FTE → sum per discipline. Older:
  // Count is a FORMULA `=ROUND(MAX(months)/160,2)` (peak-month utilisation), so summing it
  // overstates the team; there, keep the sheet's total FTE and split it by each role's share
  // of Total Hrs. The model is read from the first Count cell, never assumed.
  const firstCount = formulaAt(grid, header + 1, 1);
  const peakModel = /MAX\(/i.test(firstCount);
  let totalHrsCol = -1;
  for (let c = 0; c < 30; c++) if (textAt(grid, header, c).trim() === "Total Hrs") totalHrsCol = c;
  if (peakModel && totalHrsCol < 0) throw new Halt(`${TAB_TEAM}: peak-utilisation roster but no 'Total Hrs' column to split by`);
  const people = [];
  const unknown = [];
  let totalFte = NaN;
  for (let r = header + 1; r < rowCount(grid); r++) {
    const a = textAt(grid, r, 0);
    if (a === "" || /^Total/i.test(a)) break;
    if (/^Tot\b/i.test(a)) { totalFte = numAt(grid, r, 1); continue; } // 'Tot FTE' / 'Tot Dys/Hrs' summary line inside the roster
    const d = disciplineOfLabel(a);
    if (!d) { unknown.push(a); continue; }
    const count = numAt(grid, r, 1);
    const hours = peakModel ? numAt(grid, r, totalHrsCol) : NaN;
    if (Number.isNaN(count)) throw new Halt(`${TAB_TEAM}: '${a}' has no numeric Count in column B`);
    if (peakModel && Number.isNaN(hours)) throw new Halt(`${TAB_TEAM}: '${a}' has no numeric Total Hrs`);
    people.push({ d, count, hours });
  }
  if (unknown.length) throw new Halt(`${TAB_TEAM}: cannot map these roles to a discipline — ${unknown.join(", ")}. Known: ${Object.keys(ROLE_LABEL).join(", ")}`);
  if (!people.length) throw new Halt(`${TAB_TEAM}: no person rows under the header`);
  const fte = {};
  if (peakModel) {
    const sumFte = Number.isNaN(totalFte) ? people.reduce((s, p) => s + p.count, 0) : totalFte;
    const sumHrs = people.reduce((s, p) => s + p.hours, 0);
    if (!(sumHrs > 0)) throw new Halt(`${TAB_TEAM}: Total Hrs sum to 0 — cannot split the roster`);
    for (const p of people) fte[p.d] = round2((fte[p.d] ? fte[p.d] : 0) + sumFte * p.hours / sumHrs);
  } else {
    for (const p of people) fte[p.d] = round2((fte[p.d] ? fte[p.d] : 0) + p.count);
  }
  for (const d of Object.keys(fte)) if (!(fte[d] > 0)) delete fte[d];
  return fte;
}

/** Per-phase Low/High days read from the T-Shirt rollups (phases with hours > 0), in PHASES order. */
function phaseTotalsFromSheet(grid, layout) {
  const out = [];
  for (const rr of layout.rollupRows) {
    const ph = textAt(grid, rr, layout.cols.rollupPhase).trim();
    const low = numAt(grid, rr, layout.cols.lowHrs), high = numAt(grid, rr, layout.cols.highHrs);
    if (Number.isNaN(low) || Number.isNaN(high)) throw new Halt(`${TAB_TSHIRT}: rollup row ${rr + 1} (${ph}) has no Low Hrs / High Hrs values`);
    if (low > 0) out.push({ phase: ph, totalDays: round2(low / 8), highDays: round2(high / 8), staffDays: round2((low + high) / 2 / 8) });
  }
  if (!out.length) throw new Halt(`${TAB_TSHIRT}: no phase has hours — nothing to staff`);
  return PHASES.filter((p) => out.some((o) => o.phase === p)).map((p) => out.find((o) => o.phase === p));
}

/** Rebuild the Team Mix tab (one grid per phase) from the sheet's own roster + rollups. No plan needed. */
async function verbTeamMix(api, opts) {
  const tshirt = await api.grid(TAB_TSHIRT);
  const layout = locateTshirt(tshirt);
  const team = await api.grid(TAB_TEAM);
  const fte = opts.fte ? opts.fte : deriveFteFromTeamMix(team);
  const title = opts.title ? opts.title : textAt(team, 0, 0).replace(/\s+—\s+(MVP|Phase \d)$/, "");
  if (!title) throw new Halt(`${TAB_TEAM}: A1 has no title to carry over — pass --title`);
  const plan = { title, teamMix: { fte } };
  const rosters = phaseTotalsFromSheet(tshirt, layout).map((ph) => ({ ...ph, roster: buildRoster(plan, ph.staffDays, layout.mf) }));
  if (opts.dryRun) return { title, fte, rosters, table: rostersTable(rosters) };
  const tm = await writeTeamMix(api, plan, rosters);
  const result = { title, fte, phases: rosters.map((r) => ({ phase: r.phase, lowDays: r.totalDays, highDays: r.highDays, staffDays: r.staffDays, people: r.roster.people.length, months: r.roster.months, columns: r.roster.n, sumDays: r.roster.sumDays })), table: rostersTable(rosters), grids: tm.grids };
  if (!opts.noAudit) result.audit = await runAudit(api);
  return result;
}

/**
 * Normalise a T-Shirt tab's FORMATTING to the spec without touching any size, phase, item text
 * or formula (spec §1.2 section rows, §1.3 totals row + summary block). Layout-aware via the
 * column map, so it works on both template generations. What it does, in order:
 *   1. section heading rows → merged A:<HIGH $>, bg #1C4F8B, white bold Arial 10
 *   2. blank rows between the last item and the totals row → deleted
 *   3. totals row → bg #D8DDE8, bold 10, across the table
 *   4. summary block (Total Days / Total Hrs / Total Cost) → rewritten directly under the totals
 *      row in the standard shape; blank rows in between deleted; labels bold; Cost in dollars
 * HALTS when the rows under the totals row hold anything other than the old summary block or
 * blanks — it never overwrites content it did not expect.
 */
async function verbFormat(api, opts) {
  const grid = await api.grid(TAB_TSHIRT);
  const sheetId = grid.properties.sheetId;
  const layout = locateTshirt(grid);
  const { cols } = layout;
  const width = cols.high + 1;
  const L = colLetter;
  const first0 = layout.firstItemRow;
  const sections = [];
  let lastItem0 = -1, totalRow0 = -1;
  for (let r = first0; r < rowCount(grid); r++) {
    const a = textAt(grid, r, 0);
    if (/^Total \(Days\)/i.test(a)) { totalRow0 = r; break; }
    if (rowIsEmpty(grid, r, width)) continue;
    if (a !== "" && textAt(grid, r, 2) === "" && textAt(grid, r, cols.days) === "") sections.push(r);
    else lastItem0 = r;
  }
  if (lastItem0 < 0) throw new Halt(`${TAB_TSHIRT}: no item rows`);
  if (totalRow0 < 0) throw new Halt(`${TAB_TSHIRT}: no 'Total (Days)' row below the items — add it first`);
  // the rows under the totals row must be the old summary block or blank
  // Old summary variants seen across the 19 Hilo sheets (2026-09-21): the standard 3 rows;
  // a 'Low | High' header row above them; 'Total Cost (Low)' / '(High)' split rows; nothing at
  // all. Anything else under the totals row (a second table, notes) ends the block and is
  // NEVER touched — the new block goes in the free rows above it, inserting rows if needed.
  const summaryRe = /^(Total (Days|Hrs|Cost)( \((Low|High)\))?|Low|High)$/i;
  const totRef = new RegExp(`\\b[A-Z]{1,2}\\$?${totalRow0 + 1}\\b`);
  let summaryEnd0 = totalRow0; // last row of the old summary block (or the totals row if none)
  let nextContent0 = -1;       // first row of foreign content below the block, if any
  for (let r = totalRow0 + 1; r < Math.min(rowCount(grid), totalRow0 + 10); r++) {
    let rowHas = false, foreign = false;
    for (let c = 0; c < width; c++) {
      const v = textAt(grid, r, c).trim();
      if (v === "") continue;
      rowHas = true;
      const ok = summaryRe.test(v) || (v.startsWith("=") && (totRef.test(v) || new RegExp(`\\b[A-Z]{1,2}(${totalRow0 + 2}|${totalRow0 + 3}|${totalRow0 + 4})\\b`).test(v)));
      if (!ok) foreign = true;
    }
    if (foreign) { nextContent0 = r; break; }
    if (rowHas) summaryEnd0 = r;
  }
  const blankBefore = totalRow0 - lastItem0 - 1;
  const freeAfter = (nextContent0 < 0 ? Infinity : nextContent0 - 1) - totalRow0; // rows available under the totals row
  const plan = { sections: sections.map((r) => r + 1), lastItem1: lastItem0 + 1, totalRow1: totalRow0 + 1, blankRowsBeforeTotals: blankBefore, oldSummaryRows: summaryEnd0 > totalRow0 ? `${totalRow0 + 2}–${summaryEnd0 + 1}` : "none", foreignContentAtRow: nextContent0 < 0 ? null : nextContent0 + 1, rowsToInsertForSummary: Math.max(0, 3 - Math.min(freeAfter, 3)) };
  if (opts.dryRun) return { layout: { headerRow1: layout.headerRow + 1, sizeColumns: cols.sizeLabels, totalCol: L(cols.total) }, plan };

  // 1. section rows (before any row deletion — indices are current)
  const reqs = [];
  const merges = Array.isArray(grid.merges) ? grid.merges : [];
  for (const r0 of sections) {
    // Google only unmerges an EXACT existing range — use the sheet's own merge list (two Hilo
    // sheets had section rows merged wider than the table, and A:<HIGH $> 400'd).
    for (const m of merges) if (m.startRowIndex <= r0 && m.endRowIndex > r0) reqs.push({ unmergeCells: { range: { sheetId, startRowIndex: m.startRowIndex, endRowIndex: m.endRowIndex, startColumnIndex: m.startColumnIndex, endColumnIndex: m.endColumnIndex } } });
    reqs.push({ mergeCells: { range: gridRange(sheetId, r0, r0 + 1, 0, width), mergeType: "MERGE_ALL" } });
    reqs.push(fmtReq(sheetId, r0, r0 + 1, 0, width,
      { backgroundColor: hexToColor(COLOR.sectionBg), textFormat: { fontFamily: "Arial", fontSize: 10, bold: true, foregroundColor: hexToColor(COLOR.white) }, horizontalAlignment: "LEFT" },
      "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"));
  }
  if (reqs.length) await api.batch(reqs);
  // 2. clear the old summary block (values + formats), then delete the blank rows before the totals row
  if (summaryEnd0 > totalRow0) {
    await api.clearValues(TAB_TSHIRT, `A${totalRow0 + 2}:${L(width - 1)}${summaryEnd0 + 1}`);
    await api.batch([fmtReq(sheetId, totalRow0 + 1, summaryEnd0 + 1, 0, width, {}, "userEnteredFormat")]);
  }
  let tot0 = totalRow0;
  if (blankBefore > 0) {
    await api.batch([{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: lastItem0 + 1, endIndex: totalRow0 } } }]);
    tot0 = lastItem0 + 1;
  }
  // make room for the 3 summary rows when other content sits close under the totals row
  if (plan.rowsToInsertForSummary > 0) {
    const at = tot0 + 1 + (freeAfter === Infinity ? 3 : Math.max(0, freeAfter)); // insert right before the foreign content
    await api.batch([{ insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: at, endIndex: at + plan.rowsToInsertForSummary }, inheritFromBefore: false } }]);
  }
  // 3. totals row band
  await api.batch([
    fmtReq(sheetId, tot0, tot0 + 1, 0, width, { backgroundColor: hexToColor(COLOR.tshirtTotalBg), textFormat: { fontSize: 10, bold: true }, horizontalAlignment: "LEFT" }, "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"),
    fmtReq(sheetId, tot0, tot0 + 1, cols.days, width, { horizontalAlignment: "RIGHT" }, "userEnteredFormat.horizontalAlignment"),
  ]);
  // 4. summary block directly under the totals row
  const t1 = tot0 + 1;
  const hf = `$${L(cols.highFactor.c)}$${cols.highFactor.r + 1}`;
  const rows = [
    ["Total Days", `=${L(cols.total)}${t1}`, `=${L(cols.total)}${t1}*${hf}`],
    ["Total Hrs", `=${L(cols.total)}${t1}*8`, `=${L(cols.total)}${t1}*${hf}*8`],
    ["Total Cost", `=${L(cols.low)}${t1}`, `=${L(cols.high)}${t1}`],
  ];
  await api.putValues(TAB_TSHIRT, `${L(cols.total)}${t1 + 1}:${L(cols.total + 2)}${t1 + 3}`, rows);
  await api.batch([
    fmtReq(sheetId, t1, t1 + 3, cols.total, cols.total + 3, { textFormat: { fontSize: 10, bold: true } }, "userEnteredFormat.textFormat"),
    fmtReq(sheetId, t1, t1 + 2, cols.total + 1, cols.total + 3, { horizontalAlignment: "RIGHT", numberFormat: { type: "NUMBER", pattern: "0.00" } }, "userEnteredFormat(horizontalAlignment,numberFormat)"),
    fmtReq(sheetId, t1 + 2, t1 + 3, cols.total + 1, cols.total + 3, { horizontalAlignment: "RIGHT", numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } }, "userEnteredFormat(horizontalAlignment,numberFormat)"),
  ]);
  const result = { plan, totalRow1: t1 };
  if (!opts.noAudit) result.audit = await runAudit(api);
  return result;
}

async function verbWrite(api, plan, opts) {
  const ts = await writeTshirt(api, plan, opts);
  const rosters = buildRosters(plan, ts.layout);
  const tm = await writeTeamMix(api, plan, rosters);
  const tech = await writeTechStack(api, plan);
  const result = {
    tshirt: { mode: plan.tshirt.mode, itemsWritten: ts.itemsWritten, firstItem1: ts.firstItem1, lastItem1: ts.lastItem1, totalRow1: ts.totalRow1, totals: ts.totals },
    teamMix: { grids: tm.grids, phases: rosters.map((r) => ({ phase: r.phase, lowDays: r.totalDays, highDays: r.highDays, staffDays: r.staffDays, people: r.roster.people.length, months: r.roster.months, columns: r.roster.n, sumDays: r.roster.sumDays })), table: rostersTable(rosters), lastRow: tm.lastRow },
    techStack: tech,
  };
  if (!opts.noAudit) result.audit = await runAudit(api);
  return result;
}

// ───────────────────────── CLI ─────────────────────────

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json" || a === "--replace" || a === "--no-audit" || a === "--dry-run") out[a.slice(2)] = true;
    else if (a.startsWith("--")) { out[a.slice(2)] = argv[i + 1]; i++; }
    else out._.push(a);
  }
  return out;
}

function printChecks(audit) {
  for (const c of audit.checks) console.log(`  ${c.ok ? "✓" : "✗"} ${c.check}${c.ok ? "" : ` — ${c.detail}`}`);
  console.log(`${audit.ok ? "AUDIT PASS" : `AUDIT FAIL (${audit.failed})`} — ${audit.title}`);
}

const USAGE = "usage: gsd-t estimate-sheet <read|plan-check|write|teammix|format|audit|plan-schema> --sheet <id|url> [--tab <name>] [--plan <plan.json>] [--replace] [--fte '{\"backend\":1.5}'] [--title <t>] [--dry-run] [--no-audit] [--key <path>] [--json]";

/** Runs a verb; returns the exit code. Throws Halt (or any error) — the runner below turns that into exit 4/64. */
async function main(args) {
  const verb = args._[0];
  const json = !!args.json;
  if (!verb || verb === "help") { console.log(USAGE); return 0; }
  if (verb === "plan-schema") { console.log(JSON.stringify(PLAN_SCHEMA, null, 2)); return 0; }
  const sheetId = sheetIdFromArg(args.sheet);
  const api = new SheetsApi(await getToken(args.key), sheetId);
  if (verb === "read") {
    const r = await verbRead(api, args.tab);
    if (json) console.log(JSON.stringify(r, null, 2));
    else { console.log(r.title); r.tabs.forEach((t) => console.log(`  tab ${JSON.stringify(t.title)} id=${t.sheetId}`)); (r.rows ? r.rows : []).forEach((l) => console.log(l)); }
    return 0;
  }
  if (verb === "teammix") {
    // rebuild the Team Mix from the sheet's own roster + phase rollups (no plan file)
    let fte;
    if (args.fte) { try { fte = JSON.parse(args.fte); } catch (e) { throw new Halt(`--fte must be JSON like {"backend":1.5,"qa":0.4}: ${e.message}`, 64); } }
    const r = await verbTeamMix(api, { fte, title: args.title, dryRun: !!args["dry-run"], noAudit: !!args["no-audit"] });
    const ok = !r.audit || r.audit.ok;
    if (json) console.log(JSON.stringify({ ok, exitCode: ok ? 0 : 4, ...r }, null, 2));
    else {
      console.log(`title: ${r.title}`); console.log(`fte: ${JSON.stringify(r.fte)}`); console.log(r.table);
      if (r.audit) printChecks(r.audit); else if (args["dry-run"]) console.log("(dry run — nothing written)");
    }
    return ok ? 0 : 4;
  }
  if (verb === "format") {
    const r = await verbFormat(api, { dryRun: !!args["dry-run"], noAudit: !!args["no-audit"] });
    const ok = !r.audit || r.audit.ok;
    if (json) console.log(JSON.stringify({ ok, exitCode: ok ? 0 : 4, ...r }, null, 2));
    else { console.log(JSON.stringify(r.plan)); if (r.audit) printChecks(r.audit); else if (args["dry-run"]) console.log("(dry run — nothing written)"); }
    return ok ? 0 : 4;
  }
  if (verb === "audit") {
    const a = await runAudit(api);
    if (json) console.log(JSON.stringify({ ok: a.ok, exitCode: a.ok ? 0 : 4, ...a }, null, 2)); else printChecks(a);
    return a.ok ? 0 : 4;
  }
  const plan = loadPlan(args.plan);
  if (verb === "plan-check") {
    const r = await verbPlanCheck(api, plan);
    if (json) console.log(JSON.stringify({ ok: true, exitCode: 0, ...r }, null, 2));
    else {
      console.log(`MF ${r.mf.map((f) => `${f.label} ${f.value}`).join(" · ")} = ${r.mfTotal} · high ×${r.highFactor} · rate $${r.rate}`);
      console.log(`T-Shirt: raw ${r.totals.rawDays} d → total ${r.totals.totalDays} d → $${r.totals.lowDollars} – $${r.totals.highDollars}`);
      console.log(r.table);
    }
    return 0;
  }
  if (verb === "write") {
    const r = await verbWrite(api, plan, { replace: !!args.replace, noAudit: !!args["no-audit"] });
    const ok = !r.audit || r.audit.ok;
    if (json) console.log(JSON.stringify({ ok, exitCode: ok ? 0 : 4, ...r }, null, 2));
    else {
      console.log(`T-Shirt (${r.tshirt.mode}): ${r.tshirt.itemsWritten} items, rows ${r.tshirt.firstItem1}–${r.tshirt.lastItem1}, totals row ${r.tshirt.totalRow1}; total ${r.tshirt.totals.totalDays} d, $${r.tshirt.totals.lowDollars} – $${r.tshirt.totals.highDollars}`);
      for (const ph of r.teamMix.phases) console.log(`Team Mix — ${ph.phase}: ${ph.people} people, ${ph.months} months, ${ph.columns} columns, Σ Days ${ph.sumDays} (midpoint of ${ph.lowDays}–${ph.highDays})`);
      console.log(r.teamMix.table);
      console.log(`Technology Stack: ${r.techStack.rows} rows`);
      if (r.audit) printChecks(r.audit);
    }
    return ok ? 0 : 4;
  }
  throw new Halt(`unknown verb '${verb}'\n${USAGE}`, 64);
}

/** The frozen halt shape: a rejected main() is printed and exits non-zero. Never returns. */
function haltAndExit(e, json) {
  const code = e instanceof Halt ? e.exitCode : 64;
  if (json) console.log(JSON.stringify({ ok: false, exitCode: code, error: e.message, details: e instanceof Halt ? e.details : undefined }, null, 2));
  else console.error(`HALT (${code}): ${e.message}`);
  process.exit(code);
}

module.exports = {
  validatePlan, splitRoster, rosterViolations, mfCoverageViolations, monthPlan, resampleWeights, rampHours, buildRoster,
  tshirtTotals, phaseTotals, buildRosters, midDays, deriveFteFromTeamMix, phaseTotalsFromSheet, verbTeamMix, itemFormulasFor, rollupFormulasFor, findCell, itemFormulas, rollupFormulas, tshirtRows, teamMixValues, teamMixFormatReqs, remainderFormula, locateTshirt, findPhaseSource,
  auditTshirt, auditTeamMix, auditTechStack, auditOverview, colLetter, hexToColor, colorToHex, sheetIdFromArg,
  constants: { SIZE_CODES, PHASES, COLOR, RAMP, ROLE_LABEL, SOFT_CEILING, FOLD_THRESHOLD, TAB_TSHIRT, TAB_TEAM, TAB_TECH, PLAN_SCHEMA },
  Halt, SheetsApi, getToken, runAudit, main,
};

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  main(args).then((code) => process.exit(code), (e) => haltAndExit(e, !!args.json));
}
