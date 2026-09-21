"use strict";

/**
 * gsd-t-estimate-sheet — the deterministic estimate-sheet writer.
 *
 * Every rule here is a correction David had to make by hand on a shipped
 * estimate (templates/estimate-sheet-spec.md). The tests pin the pure math, the
 * exact formulas the live template uses, and — the load-bearing one — that the
 * writer's own output satisfies the writer's own read-back audit, while each
 * historical defect makes that audit FAIL.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const W = require("../bin/gsd-t-estimate-sheet.cjs");
const { COLOR, TAB_TSHIRT } = W.constants;

// ───────────── fixtures ─────────────

function plan(overrides = {}) {
  return {
    title: "Test — Estimate",
    tshirt: {
      mode: "items",
      sections: [
        { heading: "A. AUTH", items: [
          { id: "GA-1", module: "Ingest API", userType: "System", functionality: "HMAC contract", requirement: "Align signing.", phase: "MVP", fe: "", be: "M" },
          { id: "GA-2", module: "Ingest API", userType: "System", functionality: "Credential scope", requirement: "Tenancy-wide.", phase: "MVP", fe: "S", be: "XL" },
        ] },
        { heading: "B. STATUS", items: [
          { id: "GA-3", module: "Ingest API", userType: "System", functionality: "422 on partial", requirement: "Return 422.", phase: "Phase 1", fe: "", be: "L" },
        ] },
      ],
    },
    teamMix: { fte: { backend: 1.5, frontend: 0.4, qa: 0.4, pm: 0.25, ba: 0.1 } },
    techStack: [
      { category: "Frontend", description: "Next.js 16" },
      { category: "Backend", description: "Hono on Node" },
      { category: "Data Store", description: "Neon PostgreSQL" },
    ],
    ...overrides,
  };
}

const MF = [
  { label: "QA", value: 0.3 }, { label: "PM", value: 0.1 }, { label: "Analysis", value: 0.1 },
  { label: "Deployment", value: 0.05 }, { label: "StdUps/Mtgs", value: 0.15 }, { label: "Buffer", value: 0.2 },
];
const LEGEND = { XS: 0.25, S: 0.5, M: 1, L: 3, XL: 5, XXL: 7 };
const LAYOUT = { legend: LEGEND, mf: MF, mfTotal: 0.9, highFactor: 1.3, rate: 50, firstItemRow: 13, rollupRows: [3, 4, 5, 6] };

/** Build a Sheets-API-shaped grid from rows of cell specs. */
function mkGrid(rows) {
  const rowData = rows.map((cells) => ({
    values: cells.map((spec) => {
      if (spec == null || spec === "") return {};
      const s = typeof spec === "object" ? spec : { v: spec };
      const cell = {};
      if (s.f != null) cell.userEnteredValue = { formulaValue: s.f };
      else if (typeof s.v === "number") cell.userEnteredValue = { numberValue: s.v };
      else if (s.v != null) cell.userEnteredValue = { stringValue: String(s.v) };
      if (s.n != null) cell.effectiveValue = { numberValue: s.n };
      else if (typeof s.v === "number") cell.effectiveValue = { numberValue: s.v };
      const fmt = {};
      if (s.bg) fmt.backgroundColor = W.hexToColor(s.bg);
      if (s.font || s.bold) fmt.textFormat = { fontFamily: s.font, bold: !!s.bold };
      if (s.nf) fmt.numberFormat = { type: s.nf, pattern: s.nf === "CURRENCY" ? "$#,##0.00" : "0.00" };
      if (Object.keys(fmt).length) cell.userEnteredFormat = fmt;
      if (s.dv) cell.dataValidation = { condition: { type: "ONE_OF_LIST", values: [{ userEnteredValue: "MVP" }] } };
      return cell;
    }),
  }));
  return { properties: { sheetId: 1, title: "x" }, data: [{ rowData }] };
}

/** The T-Shirt template header block (rows 1–13), as the live ATP sheet has it. */
function tshirtHeaderRows() {
  const rows = [];
  for (let r = 0; r < 13; r++) rows.push(Array(12).fill(""));
  rows[0][0] = "Date Submitted";
  const legend = [["XS - Extra Small", 0.25], ["S - Small", 0.5], ["M - Medium", 1], ["L - Large", 3], ["XL - Extra Large", 5], ["XXL - Extra Extra Large", 7]];
  legend.forEach(([l, v], i) => { rows[3 + i][0] = l; rows[3 + i][1] = v; });
  rows[2][4] = "Multiplication Factor";
  MF.forEach((f, i) => { rows[3 + i][4] = f.label; rows[3 + i][5] = f.value; });
  rows[9][4] = "Total MF"; rows[9][5] = { f: "=sum(F4:F9)", n: 0.9 };
  rows[3][6] = 1.3; rows[3][7] = 50;
  ["MVP", "Phase 1", "Phase 2", "Phase 3"].forEach((p, i) => { rows[3 + i][9] = p; });
  rows[12][0] = "Module/Functionality";
  return rows;
}

/** What the writer would produce for `p`, rendered as an audit-ready grid (formats included). */
function writtenTshirtGrid(p, mutate = (x) => x) {
  const rows = tshirtHeaderRows();
  const built = W.tshirtRows(p, 13);
  const first1 = built.firstItem1, last1 = built.lastItem1;
  for (const rr of LAYOUT.rollupRows) {
    const f = W.rollupFormulas(rr + 1, first1, last1);
    rows[rr][10] = { f: f[0], n: 0 }; rows[rr][11] = { f: f[1], n: 0 }; rows[rr][12] = { f: f[2], n: 0 }; rows[rr][13] = { f: f[3], n: 0 };
  }
  let rawTotal = 0;
  const phaseRaw = {};
  for (const row of built.rows) {
    const cells = row.values.map((v) => (v === "" ? "" : (String(v).startsWith("=") ? { f: v, n: 0 } : { v })));
    if (row.kind === "section") cells[0] = { v: row.values[0], bg: COLOR.sectionBg, font: "Arial", bold: true };
    if (row.kind === "item") {
      cells[4] = { v: row.values[4], dv: true };
      const days = (LEGEND[row.values[5]] || 0) + (LEGEND[row.values[6]] || 0);
      rawTotal += days;
      phaseRaw[row.values[4]] = (phaseRaw[row.values[4]] || 0) + days;
      cells[7] = { f: row.values[7], n: days }; cells[9] = { f: row.values[9], n: days * 1.9 };
    }
    if (row.kind === "total") {
      for (let c = 0; c < 12; c++) cells[c] = { ...(cells[c] === "" ? {} : cells[c]), bg: COLOR.tshirtTotalBg, bold: true };
      cells[9] = { ...cells[9], n: Math.round(rawTotal * 1.9 * 100) / 100 };
    }
    if (row.kind === "summary" || row.kind === "summary-cost") {
      cells[9] = { v: row.values[9], bold: true };
      if (row.kind === "summary-cost") { cells[10] = { f: row.values[10], n: 0, nf: "CURRENCY" }; cells[11] = { f: row.values[11], n: 0, nf: "CURRENCY" }; }
    }
    rows[row.row1 - 1] = cells;
  }
  // phase rollups: L = Low Hrs for the phase (effective value), so the audit can derive phase days
  ["MVP", "Phase 1", "Phase 2", "Phase 3"].forEach((ph, i) => { rows[3 + i][11] = { ...rows[3 + i][11], n: Math.round((phaseRaw[ph] || 0) * 1.9 * 8 * 100) / 100 }; });
  return mkGrid(mutate(rows));
}

/** What writeTeamMix would produce: one grid per roster, 2 blank rows between, formats included. */
function writtenTeamMixGrid(p, rosters, mutate = (x) => x) {
  const list = Array.isArray(rosters) ? rosters : [{ phase: "MVP", roster: rosters }];
  const rows = [];
  let top = 0;
  for (const r of list) {
    const roster = r.roster;
    const v = W.teamMixValues(p, roster, r.phase, top);
    v.rows.forEach((row, ri) => {
      const abs = top + ri;
      const isPerson = ri >= 2 && ri < 2 + roster.people.length;
      const person = isPerson ? roster.people[ri - 2] : null;
      rows[abs] = row.map((cell, ci) => {
        const spec = {};
        if (typeof cell === "string" && cell.startsWith("=")) {
          spec.f = cell;
          if (person) {
            if (ci === 4) spec.n = person.days;
            else if (ci === 5) spec.n = person.hours;
            else if (ci === v.totalC) spec.n = person.hours;
            else if (ci >= v.firstMonthC) spec.n = Math.round((person.hours - person.monthHours.slice(0, -1).reduce((a, b) => a + b, 0)) * 10) / 10;
          } else if (abs === v.totalR - 1 && ci === 4) spec.n = roster.sumDays;
          else if (abs === v.totalR - 1 && ci === 1) spec.n = roster.sumCount;
          else spec.n = 0;
        } else if (cell !== "") spec.v = cell;
        if (ri >= 1) spec.font = "Arial";
        if (ri === 0) { spec.bg = COLOR.teamTitleBg; spec.font = "Montserrat"; }
        if (ri === 1 && ci !== 2 && ci !== 6) spec.bg = COLOR.teamHeaderBg;
        if (person && (ci === 4 || ci === 5 || ci === v.totalC)) { spec.bg = COLOR.sage; spec.bold = true; }
        if (abs === v.totalR - 1 && ci !== 2 && ci !== 6) spec.bg = COLOR.totalBg;
        if (abs === v.totalR && ci >= 7) spec.bg = COLOR.totalDaysBg;
        return Object.keys(spec).length ? spec : "";
      });
    });
    top = v.bottom + 2;
    for (let g = v.bottom; g < top; g++) rows[g] = [];
  }
  return mkGrid(mutate(rows));
}

/** phaseDays the audit would read from the T-Shirt rollups for plan `p`. */
function phaseDaysOf(p) {
  return Object.fromEntries(W.phaseTotals(p, LAYOUT).map((x) => [x.phase, x.totalDays]));
}

const failing = (checks) => checks.filter((c) => !c.ok).map((c) => c.check);

// ───────────── plan validation ─────────────

test("validatePlan: a well-formed plan has no errors", () => {
  assert.deepStrictEqual(W.validatePlan(plan()), []);
});

test("validatePlan: legend text in a size cell is rejected (the 'XS - Extra Small' defect)", () => {
  const p = plan();
  p.tshirt.sections[0].items[0].be = "XS - Extra Small";
  const errs = W.validatePlan(p);
  assert.ok(errs.some((e) => /not a bare size code/.test(e)), errs.join("\n"));
});

test("validatePlan: unknown discipline, TBD tech-stack, empty tech-stack, and an unsized item are rejected", () => {
  const p = plan({ techStack: [{ category: "Frontend", description: "TBD" }] });
  p.teamMix.fte.designer = 0.5;
  p.tshirt.sections[0].items[0].be = "";
  const errs = W.validatePlan(p);
  assert.ok(errs.some((e) => /unknown discipline/.test(e)));
  assert.ok(errs.some((e) => /'TBD'/.test(e)));
  assert.ok(errs.some((e) => /both fe and be are blank/.test(e)));
  assert.ok(W.validatePlan(plan({ techStack: [] })).some((e) => /empty Technology Stack/.test(e)));
});

// ───────────── roster math ─────────────

test("splitRoster: saturate at 1.00 then spill — 1.5 backend is 1.00 + 0.50, never three part-timers", () => {
  const people = W.splitRoster({ backend: 1.5, qa: 0.4 });
  assert.deepStrictEqual(people.map((p) => [p.label, p.count]), [
    ["Backend / API Engineer 1", 1], ["Backend / API Engineer 2", 0.5], ["QA Engineer", 0.4],
  ]);
  assert.deepStrictEqual(W.rosterViolations(people), []);
});

test("rosterViolations: Count 1.40 on one row and a smeared 0.42/0.56/0.23 roster are both violations", () => {
  assert.ok(W.rosterViolations([{ discipline: "backend", label: "Backend", count: 1.4 }]).some((v) => /> 1.00/.test(v)));
  const smeared = [0.42, 0.56, 0.23].map((c, i) => ({ discipline: "backend", label: `Backend ${i + 1}`, count: c }));
  assert.ok(W.rosterViolations(smeared).some((v) => /saturate then spill/.test(v)));
});

test("mfCoverageViolations: PM and Analysis factors need a person; Deployment/Standups/Buffer are absorbed; no MF list is a halt", () => {
  const noPm = [{ discipline: "backend" }, { discipline: "qa" }, { discipline: "ba" }];
  const v = W.mfCoverageViolations(MF, noPm);
  assert.strictEqual(v.length, 1);
  assert.match(v[0], /'PM'.*Project Manager/);
  assert.deepStrictEqual(W.mfCoverageViolations(MF, [...noPm, { discipline: "pm" }]), []);
  assert.throws(() => W.mfCoverageViolations([], noPm), W.Halt);
});

test("monthPlan: months = totalDays / (ΣCount × 20); a tail under 0.1 month folds instead of opening a column", () => {
  const people = W.splitRoster({ backend: 1.5, frontend: 0.4, qa: 0.4, pm: 0.25, ba: 0.1 }); // 2.65 FTE
  const mp = W.monthPlan(154.76, people);
  assert.strictEqual(Math.round(mp.months * 100) / 100, 2.92);
  assert.strictEqual(mp.sumCount, 2.65);
  assert.strictEqual(mp.n, 3);
  assert.strictEqual(Math.round(W.monthPlan(161.5, people).months * 100) / 100, 3.05); // frac .05 < .1 → folds into month 3
  assert.strictEqual(W.monthPlan(161.5, people).n, 3);
  assert.strictEqual(W.monthPlan(170, people).n, 4);      // 3.21 → 4
});

test("rampHours: QA back-loads, frontend front-loads, PM is flat, the total is preserved, nothing exceeds 172", () => {
  const qa = W.rampHours(187, "qa", 3);
  assert.ok(qa[0] < qa[1] && qa[1] < qa[2], `qa ${qa}`);
  const fe = W.rampHours(187, "frontend", 3);
  assert.ok(fe[0] > fe[1] && fe[1] > fe[2], `fe ${fe}`);
  assert.deepStrictEqual(W.rampHours(120, "pm", 3), [40, 40, 40]);
  const be = W.rampHours(467.2, "backend", 3); // a full-time person over 2.92 months
  assert.ok(be.every((h) => h <= 172), `backend ${be}`);
  assert.ok(Math.abs(be.reduce((a, b) => a + b, 0) - 467.2) < 0.2);
  assert.throws(() => W.rampHours(600, "backend", 3), /cannot fit/);
  assert.throws(() => W.rampHours(10, "designer", 3), /unknown discipline/);
});

test("buildRoster: the ATP shape — 2.65 FTE, 2.92 months, 3 columns, Σ Days equals the T-Shirt total", () => {
  const r = W.buildRoster(plan(), 154.76, MF);
  assert.strictEqual(r.people.length, 6);
  assert.strictEqual(r.n, 3);
  assert.ok(Math.abs(r.sumDays - 154.76) < 0.15, `sumDays ${r.sumDays}`);
  assert.throws(() => W.buildRoster(plan({ teamMix: { fte: { backend: 1 } } }), 100, MF), /roster violations/);
});

// ───────────── T-Shirt formulas + totals ─────────────

test("itemFormulas/rollupFormulas: byte-identical to the live ATP template", () => {
  const f = W.itemFormulas(15);
  assert.strictEqual(f.H, '=(IF(F15="",0,SUMIF($A$4:$A$9,LEFT(F15,2)&"*",$B$4:$B$9))+IF(G15="",0,SUMIF($A$4:$A$9,LEFT(G15,2)&"*",$B$4:$B$9)))');
  assert.strictEqual(f.I, "=H15*$F$10");
  assert.strictEqual(f.K, "=J15*8*$H$4");
  assert.strictEqual(f.L, "=K15*$G$4");
  assert.deepStrictEqual(W.rollupFormulas(4, 14, 81), [
    "=SUMIF($E$14:$E$81,$J4,$K$14:$K$81)", "=SUMIF($E$14:$E$81,$J4,$J$14:$J$81)*8", "=SUMIF($E$14:$E$81,$J4,$L$14:$L$81)", "=IF($H$4=0,0,M4/$H$4)",
  ]);
});

test("tshirtTotals: raw sizes × (1 + MF); dollars from the sheet's rate and high factor", () => {
  const t = W.tshirtTotals(plan(), LAYOUT); // M + S + XL + L = 1 + 0.5 + 5 + 3 = 9.5
  assert.strictEqual(t.rawDays, 9.5);
  assert.strictEqual(t.totalDays, 18.05);
  assert.strictEqual(t.lowDollars, 7220);
  assert.strictEqual(t.highDollars, 9386);
});

test("tshirtRows: section heading rows, items with the id in column C, a blank, the totals row, then the summary BELOW it", () => {
  const b = W.tshirtRows(plan(), 13);
  const kinds = b.rows.map((r) => r.kind);
  assert.deepStrictEqual(kinds, ["section", "item", "item", "section", "item", "total", "summary", "summary", "summary-cost"], "no blank rows around the totals row");
  assert.strictEqual(b.rows[1].values[2], "HMAC contract (GA-1)");
  assert.strictEqual(b.rows[1].values[5], "");
  assert.strictEqual(b.rows[1].values[6], "M");
  assert.strictEqual(b.firstItem1, 14);
  assert.strictEqual(b.lastItem1, 18);
  assert.strictEqual(b.totalRow1, 19);
  assert.strictEqual(b.rows[5].values[9], "=SUM(J14:J18)");
  assert.strictEqual(b.rows[6].values[10], "=J19");
  assert.strictEqual(b.rows[8].values[9], "Total Cost");
});

// ───────────── Team Mix values ─────────────

test("teamMixValues: header row 2, Mon 1..N then Total Hrs at I+N, chained formulas, remainder last month, Total Days right-half only", () => {
  const roster = W.buildRoster(plan(), 154.76, MF);
  const v = W.teamMixValues(plan(), roster, "MVP", 0);
  assert.strictEqual(v.rows[0][0], "Test — Estimate — MVP");
  assert.deepStrictEqual(v.rows[1], ["Skill set", "Count", "", "Mths", "Days", "Hrs", "", "Resource", "Mon 1", "Mon 2", "Mon 3", "Total Hrs"]);
  assert.strictEqual(v.totalC, 11);
  const r3 = v.rows[2];
  assert.strictEqual(r3[4], "=D3*20*B3");
  assert.strictEqual(r3[5], "=E3*8");
  assert.strictEqual(r3[10], "=F3-SUM(I3:J3)");
  assert.strictEqual(r3[11], "=SUM(I3:K3)");
  assert.strictEqual(typeof r3[8], "number");
  const total = v.rows[v.rows.length - 2];
  assert.strictEqual(total[0], "Total");
  assert.strictEqual(total[1], "=SUM(B3:B8)");
  const totalDays = v.rows[v.rows.length - 1];
  assert.deepStrictEqual(totalDays.slice(0, 8), ["", "", "", "", "", "", "", "Total Days"]);
  assert.strictEqual(totalDays[8], `=I${v.totalR}/8`);
  // a second grid at an offset uses absolute rows
  const v2 = W.teamMixValues(plan(), roster, "Phase 1", v.bottom + 2);
  assert.strictEqual(v2.firstP, v.bottom + 2 + 3);
  assert.strictEqual(v2.rows[2][4], `=D${v2.firstP}*20*B${v2.firstP}`);
});

test("remainderFormula: 1 month = the total, 2 months = `=F-I` (Google rewrites SUM(I3:I3) to SUM(I3)), 3+ = SUM range", () => {
  assert.strictEqual(W.remainderFormula(3, 8, 1), "=F3");
  assert.strictEqual(W.remainderFormula(3, 8, 2), "=F3-I3");
  assert.strictEqual(W.remainderFormula(3, 8, 3), "=F3-SUM(I3:J3)");
  assert.strictEqual(W.remainderFormula(5, 8, 4), "=F5-SUM(I5:K5)");
  const roster = W.buildRoster(plan(), 109.73, MF); // 2.07 months → 2 columns (the E2E case)
  assert.strictEqual(roster.n, 2);
  const v = W.teamMixValues(plan(), roster, "MVP", 0);
  assert.strictEqual(v.rows[2][9], "=F3-I3");
  assert.deepStrictEqual(failing(W.auditTeamMix(writtenTeamMixGrid(plan(), roster), MF, 109.73, { MVP: 109.73 }).checks), []);
});

// ───────────── the audit closes the loop ─────────────

test("audit: the writer's own T-Shirt output passes every T-Shirt check", () => {
  const a = W.auditTshirt(writtenTshirtGrid(plan()));
  assert.deepStrictEqual(failing(a.checks), []);
  assert.strictEqual(a.totalDays, 18.05);
});

test("audit: each historical T-Shirt defect fails its named check", () => {
  const legendText = W.auditTshirt(writtenTshirtGrid(plan(), (rows) => { rows[14][6] = { v: "XS - Extra Small" }; return rows; }));
  assert.ok(failing(legendText.checks).includes("T-Shirt: size cells are bare codes (no legend text)"));
  const noDropdown = W.auditTshirt(writtenTshirtGrid(plan(), (rows) => { rows[14][4] = { v: "MVP" }; return rows; }));
  assert.ok(failing(noDropdown.checks).includes("T-Shirt: every item row has the Phase dropdown"));
  const staleTotal = W.auditTshirt(writtenTshirtGrid(plan(), (rows) => { rows[18][9] = { ...rows[18][9], f: "=SUM(J14:J15)", n: 1 }; return rows; }));
  assert.ok(failing(staleTotal.checks).includes("T-Shirt: totals row sums the full item range"));
  const staleRollup = W.auditTshirt(writtenTshirtGrid(plan(), (rows) => { rows[3][10] = { f: "=SUMIF($E$14:$E$15,$J4,$K$14:$K$15)", n: 0 }; return rows; }));
  assert.ok(failing(staleRollup.checks).includes("T-Shirt: phase rollups (K4:N7) reference the full item range"));
  const unstyledSection = W.auditTshirt(writtenTshirtGrid(plan(), (rows) => { rows[13][0] = { v: "A. AUTH" }; return rows; }));
  assert.ok(failing(unstyledSection.checks).includes("T-Shirt: section rows are styled (bg #1C4F8B)"));
});

test("audit: the writer's own Team Mix output passes every Team Mix check (single grid)", () => {
  const roster = W.buildRoster(plan(), 154.76, MF);
  const a = W.auditTeamMix(writtenTeamMixGrid(plan(), roster), MF, 154.76, { MVP: 154.76 });
  assert.deepStrictEqual(failing(a.checks), []);
  assert.strictEqual(a.grids, 1);
});

test("per-phase grids: one Team Mix grid per phase with hours, 2 blank rows apart, each reconciling to its phase", () => {
  const p = plan(); // MVP: M + S+XL = 6.5 raw; Phase 1: L = 3 raw
  const phases = W.phaseTotals(p, LAYOUT);
  assert.deepStrictEqual(phases.map((x) => [x.phase, x.rawDays, x.totalDays]), [["MVP", 6.5, 12.35], ["Phase 1", 3, 5.7]]);
  const rosters = W.buildRosters(p, LAYOUT);
  assert.strictEqual(rosters.length, 2);
  assert.strictEqual(rosters[1].roster.people.length, 6);
  const grid = writtenTeamMixGrid(p, rosters);
  const a = W.auditTeamMix(grid, MF, 18.05, phaseDaysOf(p));
  assert.deepStrictEqual(failing(a.checks), []);
  assert.strictEqual(a.grids, 2);
  // a missing grid, a wrong gap, and a grid that does not reconcile all fail
  const onlyOne = W.auditTeamMix(writtenTeamMixGrid(p, [rosters[0]]), MF, 18.05, phaseDaysOf(p));
  assert.ok(failing(onlyOne.checks).includes("Team Mix: one grid per phase with hours"));
  const badGap = W.auditTeamMix(writtenTeamMixGrid(p, rosters, (rows) => { rows.splice(rosters[0].roster.people.length + 4, 1); return rows; }), MF, 18.05, phaseDaysOf(p));
  assert.ok(failing(badGap.checks).some((c) => /exactly 2 blank rows/.test(c)));
  const wrongPhase = W.auditTeamMix(writtenTeamMixGrid(p, rosters), MF, 18.05, { MVP: 12.35, "Phase 1": 99 });
  assert.ok(failing(wrongPhase.checks).some((c) => /Σ Days == that phase/.test(c)));
});

test("per-phase FTE override: teamMix.phases[<phase>].fte replaces the shared mix for that grid only", () => {
  const p = plan({ teamMix: { fte: { backend: 1.5, frontend: 0.4, qa: 0.4, pm: 0.25, ba: 0.1 }, phases: { "Phase 1": { fte: { backend: 1, qa: 0.3, pm: 0.2, ba: 0.1 } } } } });
  const rosters = W.buildRosters(p, LAYOUT);
  assert.strictEqual(rosters[0].roster.people.length, 6);
  assert.strictEqual(rosters[1].roster.people.length, 4);
});

test("audit: each historical Team Mix defect fails its named check", () => {
  const roster = W.buildRoster(plan(), 154.76, MF);
  const run = (mutate) => failing(W.auditTeamMix(writtenTeamMixGrid(plan(), roster, mutate), MF, 154.76, { MVP: 154.76 }).checks);
  assert.ok(run((rows) => { rows.splice(2, 0, rows[1].slice()); return rows; }).some((c) => /row after the header is a person, not a second header/.test(c)));
  assert.ok(run((rows) => { rows[1][10] = { v: "Mon ...", bg: COLOR.teamHeaderBg, font: "Arial" }; return rows; }).includes("Team Mix: month headers are Mon 1..N, contiguous, then Total Hrs"));
  assert.ok(run((rows) => { rows[2][1] = { v: 1.4, font: "Arial" }; return rows; }).includes("Team Mix: no Count > 1.00"));
  assert.ok(run((rows) => { rows[2][1] = { v: 0.42, font: "Arial" }; return rows; }).includes("Team Mix: per discipline, all rows but the last are 1.00 (saturate then spill)"));
  assert.ok(run((rows) => { rows[3][3] = { v: 2.92, font: "Calibri" }; return rows; }).includes("Team Mix: body font is Arial (never Calibri)"));
  assert.ok(run((rows) => { rows[3][4] = { ...rows[3][4], bg: COLOR.white }; return rows; }).includes("Team Mix: sage on exactly Days, Hrs, Total Hrs of role rows"));
  assert.ok(run((rows) => { rows[3][9] = { ...rows[3][9], bg: "#00FF00" }; return rows; }).includes("Team Mix: sage on exactly Days, Hrs, Total Hrs of role rows"));
  assert.ok(run((rows) => { rows[2][10] = { f: "=F3-SUM(I3:J3)", n: -12.8, font: "Arial" }; return rows; }).includes("Team Mix: no negative or non-numeric month"));
  assert.ok(run((rows) => { rows[8][11] = { ...rows[8][11], bg: COLOR.white }; return rows; }).includes("Team Mix: Total (#E5E5E5) and Total Days (#9EC1EF) bands span every month + Total Hrs"));
  assert.ok(run((rows) => { rows[20] = Array(12).fill(""); rows[20][3] = { bg: "#00FF00" }; return rows; }).includes("Team Mix: nothing formatted below the last grid"));
  assert.ok(run((rows) => { rows[3][14] = { bg: "#00FF00" }; return rows; }).includes("Team Mix: nothing formatted right of the grid"));
  assert.ok(run((rows) => { rows[7] = rows[8]; rows[8] = rows[9]; rows.length = 9; return rows; }).includes("Team Mix: every non-zero MF factor has a person"));
  assert.ok(run((rows) => { for (let r = 2; r < 8; r++) for (const c of [8, 9, 10]) rows[r][c] = { v: 50, font: "Arial" }; return rows; }).includes("Team Mix: ramp applied (roles are not all flat)"));
});

test("audit: Technology Stack must be filled; Overview cells must point at the T-Shirt tab", () => {
  const empty = W.auditTechStack(mkGrid([["Technology Stack"]]));
  assert.ok(failing(empty.checks).includes("Technology Stack: at least 3 category rows filled"));
  const full = W.auditTechStack(mkGrid([["Technology Stack"], ["Frontend", "Next"], ["Backend", "Hono"], ["Data", "Neon"]]));
  assert.deepStrictEqual(failing(full.checks), []);
  const ov = W.auditOverview(mkGrid([["Estimate"], ["Low", "Project Hours", { f: `='${TAB_TSHIRT}'!L8`, n: 1 }, 50, { f: `='${TAB_TSHIRT}'!K8`, n: 1 }], ["High", "Project Hours", { f: `='${TAB_TSHIRT}'!N8`, n: 1 }, 50, { f: `='${TAB_TSHIRT}'!M8`, n: 1 }]]));
  assert.deepStrictEqual(failing(ov.checks), []);
});

test("locateTshirt: halts when the tab is not the template", () => {
  assert.throws(() => W.locateTshirt(mkGrid([["nothing"]])), /Module\/Functionality/);
});

test("sheetIdFromArg: accepts a bare id or a full URL", () => {
  assert.strictEqual(W.sheetIdFromArg("https://docs.google.com/spreadsheets/d/1abc_DEF-9/edit#gid=0"), "1abc_DEF-9");
  assert.strictEqual(W.sheetIdFromArg("1abc"), "1abc");
});

// ───────────── propagation + dispatch ─────────────

test("the writer ships in GLOBAL_BIN_TOOLS and PROJECT_BIN_TOOLS and has a dispatch case", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "bin", "gsd-t.js"), "utf8");
  const block = (name) => { const s = src.indexOf(`const ${name}`); return src.slice(s, src.indexOf("];", s)); };
  assert.ok(block("GLOBAL_BIN_TOOLS").includes('"gsd-t-estimate-sheet.cjs"'), "GLOBAL_BIN_TOOLS");
  assert.ok(block("PROJECT_BIN_TOOLS").includes('"gsd-t-estimate-sheet.cjs"'), "PROJECT_BIN_TOOLS");
  assert.ok(src.includes('case "estimate-sheet":'), "dispatch case");
  assert.ok(src.includes('"estimate-sheet-spec.md"'), "SHARED_TEMPLATES carries the spec");
});
