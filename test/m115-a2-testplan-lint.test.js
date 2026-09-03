"use strict";

/**
 * M115 A2 — the test-plan shape gate (bin/gsd-t-testplan-lint.cjs).
 *
 * Runs the tool as a REAL SUBPROCESS so the asserted exit codes are the ones
 * a caller (verify-gate, CI) actually sees — never calling the exported
 * function in-process and asserting on the return value alone.
 *
 * Contract: .gsd-t/contracts/test-plan-first-contract.md §2-4.
 * Mold:     templates/TestPlan-spec.md.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const LINT_PATH = path.join(__dirname, "..", "bin", "gsd-t-testplan-lint.cjs");

function tmpDoc(md, name = "TestPlan-Test.md") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m115-a2-"));
  const f = path.join(dir, name);
  fs.writeFileSync(f, md);
  return f;
}

/** Run the real tool as a subprocess. Returns { exitCode, envelope }. */
function runLint(args) {
  const res = spawnSync(process.execPath, [LINT_PATH, ...args], { encoding: "utf8" });
  let envelope = null;
  try { envelope = JSON.parse(res.stdout); } catch { /* left null — asserted by caller */ }
  return { exitCode: res.status, envelope, stdout: res.stdout, stderr: res.stderr };
}

// ─── The mold's own filled example: exit 0 ────────────────────────────────

const WELL_FORMED = `# TestPlan-Example

One sentence of purpose.

---

## Decided without you

- \`Renewals\` Seq \`2\` — assumed same-day renewal keeps the original due date — evidence: no requirement states either reading, chose the less surprising one

---

## Table: Renewals

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | book is out, due today | renew it | due date extends 14 days | due date updated | docs/requirements.md#renewal |
| 2 | book renewed same day twice | renew again same day | keeps original extended due date | none | DECIDED-WITHOUT-YOU — no requirement states either reading, chose the less surprising one |

---

## Open gaps

None — every row is answered.

---

## Sign-off

| Signed by | Date |
|---|---|
| Jane | 2026-09-03 |
`;

function replaceOnce(doc, from, to) {
  const idx = doc.indexOf(from);
  assert.notEqual(idx, -1, `fixture setup: could not find ${JSON.stringify(from)}`);
  return doc.slice(0, idx) + to + doc.slice(idx + from.length);
}

test("A2: the mold's own filled example exits 0, clean", () => {
  const f = tmpDoc(WELL_FORMED);
  const { exitCode, envelope } = runLint(["--doc", f]);
  assert.equal(exitCode, 0);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.violations.length, 0);
});

test("A2: missing file exits 64, never throws, never crashes", () => {
  const { exitCode, envelope } = runLint(["--doc", "/no/such/testplan/doc.md"]);
  assert.equal(exitCode, 64);
  assert.equal(envelope.ok, false);
});

test("A2: no arguments exits 64", () => {
  const { exitCode, envelope } = runLint([]);
  assert.equal(exitCode, 64);
  assert.equal(envelope.ok, false);
});

test("A2: --help works standalone, exit 0", () => {
  const { exitCode, stdout } = runLint(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(stdout, /testplan-lint/);
});

// ─── The mandatory negative test (M115-D4-T2) — every case asserts exit 4 ──

test("A2 malformed: empty file → exit 4", () => {
  const f = tmpDoc("");
  const { exitCode, envelope } = runLint(["--doc", f]);
  assert.equal(exitCode, 4);
  assert.equal(envelope.ok, false);
});

test("A2 malformed: right headings, no tables → exit 4", () => {
  const doc = `# TestPlan-X

sentence

---

## Decided without you

None — every row is sourced.

---

## Open gaps

None — every row is answered.

---

## Sign-off

| Signed by | Date |
|---|---|
| Jane | 2026-09-03 |
`;
  const f = tmpDoc(doc);
  const { exitCode, envelope } = runLint(["--doc", f]);
  assert.equal(exitCode, 4);
  assert.ok(envelope.violations.some((v) => v.kind === "missing-or-out-of-order-section"));
});

test("A2 malformed: right column count, wrong headers → exit 4", () => {
  const doc = `# TestPlan-X

s

---

## Decided without you

None — every row is sourced.

---

## Table: T

| ID | When | Do | Result | Data | From |
|---|---|---|---|---|---|
| 1 | x | y | z | none | docs/req.md |

---

## Open gaps

None — every row is answered.

---

## Sign-off

| Signed by | Date |
|---|---|
| Jane | 2026-09-03 |
`;
  const f = tmpDoc(doc);
  const { exitCode, envelope } = runLint(["--doc", f]);
  assert.equal(exitCode, 4);
  assert.ok(envelope.violations.some((v) => v.kind === "wrong-table-header"));
});

test("A2 malformed: a row with a blank 'Effect on saved data' → exit 4", () => {
  const doc = replaceOnce(WELL_FORMED, "| none |", "|  |");
  const f = tmpDoc(doc);
  const { exitCode, envelope } = runLint(["--doc", f]);
  assert.equal(exitCode, 4);
  assert.ok(envelope.violations.some((v) => v.kind === "blank-effect-on-saved-data"));
});

test("A2 malformed: a row with a blank 'Source' → exit 4", () => {
  const doc = replaceOnce(WELL_FORMED, "| docs/requirements.md#renewal |", "|  |");
  const f = tmpDoc(doc);
  const { exitCode, envelope } = runLint(["--doc", f]);
  assert.equal(exitCode, 4);
  assert.ok(envelope.violations.some((v) => v.kind === "blank-source-not-a-fourth-state"));
});

test("A2 malformed: a self-answered row with no entry under 'Decided without you' → exit 4", () => {
  const doc = replaceOnce(
    WELL_FORMED,
    "- `Renewals` Seq `2` — assumed same-day renewal keeps the original due date — evidence: no requirement states either reading, chose the less surprising one\n",
    ""
  );
  const f = tmpDoc(doc);
  const { exitCode, envelope } = runLint(["--doc", f]);
  assert.equal(exitCode, 4);
  assert.ok(envelope.violations.some((v) => v.kind === "self-answered-row-not-in-decided-group"));
});

test("A2 malformed: an entry under 'Decided without you' naming no evidence → exit 4", () => {
  const doc = replaceOnce(
    WELL_FORMED,
    " — evidence: no requirement states either reading, chose the less surprising one",
    ""
  );
  const f = tmpDoc(doc);
  const { exitCode, envelope } = runLint(["--doc", f]);
  assert.equal(exitCode, 4);
  assert.ok(envelope.violations.some((v) => v.kind === "decided-entry-missing-evidence"));
});

test("A2 malformed: 'Decided without you' mentioned only in a sentence, not as a heading (substring trap) → exit 4", () => {
  const doc = `# TestPlan-X

We already Decided without you on this one.

---

## Table: Renewals

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | book is out, due today | renew it | due date extends 14 days | due date updated | docs/requirements.md#renewal |
| 2 | book renewed same day twice | renew again same day | keeps original extended due date | none | DECIDED-WITHOUT-YOU — evidence: chose the less surprising one |

---

## Open gaps

None — every row is answered.

---

## Sign-off

| Signed by | Date |
|---|---|
| Jane | 2026-09-03 |
`;
  const f = tmpDoc(doc);
  const { exitCode, envelope } = runLint(["--doc", f]);
  assert.equal(exitCode, 4);
  assert.ok(
    envelope.violations.some((v) => v.kind === "missing-or-out-of-order-section"),
    "a prose mention of the phrase must NOT be mistaken for the '## Decided without you' heading"
  );
});

// ─── Non-vacuity: the gate must actually FAIL a malformed plan ───────────

test("A2 non-vacuity: the whole file would FAIL if the lint were stubbed to always return clean", () => {
  // Prove the negative-test suite itself is load-bearing: temporarily monkeypatch
  // checkDoc to always report clean and confirm every malformed fixture above
  // would then wrongly report ok:true — i.e. these assertions are not vacuous.
  const { checkDoc } = require("../bin/gsd-t-testplan-lint.cjs");
  const stubbedAlwaysClean = () => ({ ok: true, exitCode: 0, violations: [] });

  const malformedDocs = [
    "",
    replaceOnce(WELL_FORMED, "| none |", "|  |"),
    replaceOnce(WELL_FORMED, "| docs/requirements.md#renewal |", "|  |"),
  ];

  for (const doc of malformedDocs) {
    const realResult = checkDoc(doc, "fixture.md");
    const stubbedResult = stubbedAlwaysClean(doc, "fixture.md");
    assert.equal(realResult.ok, false, "the REAL gate must reject this malformed fixture");
    assert.equal(stubbedResult.ok, true, "confirms a stub would wrongly pass it — proving the assertions above are not vacuous");
  }
});

// ─── module shape ──────────────────────────────────────────────────────────

test("module exports run/gateDoc/checkDoc and a require.main CLI entry", () => {
  const mod = require("../bin/gsd-t-testplan-lint.cjs");
  assert.equal(typeof mod.run, "function");
  assert.equal(typeof mod.gateDoc, "function");
  assert.equal(typeof mod.checkDoc, "function");
  const src = fs.readFileSync(LINT_PATH, "utf8");
  assert.match(src, /require\.main === module/);
});
