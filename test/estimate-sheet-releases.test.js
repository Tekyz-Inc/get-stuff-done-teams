"use strict";

/**
 * gsd-t-estimate-sheet — several releases in one workbook (v5.24.10).
 *
 * The writer used fixed tab names, so a workbook could hold one estimate. `--release <name>` points
 * every verb at "<name> - T-Shirt" / "<name> - Team Mix" (created from the template pair). These
 * tests pin the naming, the one-time copy, and that a missing template HALTS instead of guessing.
 */

const test = require("node:test");
const assert = require("node:assert");

const W = require("../bin/gsd-t-estimate-sheet.cjs");

test("releaseTabs names the pair and rejects text that would break a formula", () => {
  assert.deepStrictEqual(W.releaseTabs("2 Light"), { tshirt: "2 Light - T-Shirt", team: "2 Light - Team Mix" });
  assert.throws(() => W.releaseTabs(""), W.Halt);
  assert.throws(() => W.releaseTabs("Bob's"), W.Halt);
  assert.throws(() => W.releaseTabs("A!B"), W.Halt);
});

function fakeApi(titles) {
  const sheets = titles.map((t, i) => ({ properties: { title: t, sheetId: 100 + i, index: i } }));
  const sent = [];
  return {
    sent,
    async meta() { return { properties: { title: "wb" }, sheets }; },
    async batch(reqs) {
      for (const r of reqs) {
        sent.push(r);
        if (r.duplicateSheet) sheets.push({ properties: { title: r.duplicateSheet.newSheetName, sheetId: 900 + sheets.length, index: sheets.length } });
      }
      return reqs.length;
    },
  };
}

test("ensureReleaseTabs copies the template pair once, and leaves an existing pair alone", async () => {
  try {
    W.useRelease("3 Pro");
    const api = fakeApi(["Overview", "T-Shirt Size Estimate", "Team Mix", "Technology Stack"]);
    const r1 = await W.ensureReleaseTabs(api);
    assert.deepStrictEqual(r1.created, ["3 Pro - T-Shirt", "3 Pro - Team Mix"]);
    assert.strictEqual(api.sent[0].duplicateSheet.sourceSheetId, 101);
    assert.strictEqual(api.sent[1].duplicateSheet.sourceSheetId, 102);
    const r2 = await W.ensureReleaseTabs(api);
    assert.deepStrictEqual(r2.created, []);
  } finally {
    W.useRelease === undefined; // module state is per process; later tests set their own release
  }
});

test("ensureReleaseTabs halts when the template tab to copy from is missing", async () => {
  W.useRelease("4 Enterprise");
  await assert.rejects(() => W.ensureReleaseTabs(fakeApi(["Overview", "Technology Stack"])), /template tab 'T-Shirt Size Estimate' to copy it from is missing/);
});

test("tshirtRows with a located layout builds formulas at the sheet's real rows (XXS legend, header on row 14)", () => {
  const layout = { legendFirst1: 4, legendLast1: 10, legendExact: true, cols: { phase: 4, sizes: [5, 6], days: 7, mfactor: 8, total: 9, low: 10, high: 11, highFactor: { r: 4, c: 6 }, rate: { r: 4, c: 7 }, mfTotal: { r: 10, c: 5 } } };
  const plan = { tshirt: { sections: [{ heading: "A. X", items: [{ id: "F-1", module: "m", userType: "u", functionality: "f", requirement: "r", phase: "MVP", fe: "M", be: "L" }] }] } };
  const b = W.tshirtRows(plan, 14, layout);
  const item = b.rows.find((r) => r.kind === "item");
  assert.strictEqual(item.row1, 16);
  assert.strictEqual(item.values[7], '=(IF(F16="",0,SUMIF($A$4:$A$10,F16&" -*",$B$4:$B$10))+IF(G16="",0,SUMIF($A$4:$A$10,G16&" -*",$B$4:$B$10)))');
  assert.strictEqual(item.values[8], "=H16*$F$11");
  assert.strictEqual(item.values[10], "=J16*8*$H$5");
  assert.strictEqual(item.values[11], "=K16*$G$5");
  assert.strictEqual(b.rows.find((r) => r.kind === "summary").values[11], "=J17*$G$5");
  // no layout → the standard template, unchanged
  assert.strictEqual(W.tshirtRows(plan, 13).rows.find((r) => r.kind === "item").values[11], "=K15*$G$4");
});

test("fillHours: a full-time person works full 160-hr months; only the last month is short", () => {
  assert.deepStrictEqual(W.fillHours(245.12, 2), [160, 85.1]);
  assert.deepStrictEqual(W.fillHours(150, 1), [150]);
  assert.throws(() => W.fillHours(400, 2), /cannot fit/);
});
