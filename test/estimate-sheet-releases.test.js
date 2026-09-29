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
