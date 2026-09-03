"use strict";

/**
 * M115 A7 — traceability widened: an acceptance line may ALSO clear via a
 * plan-row binding (bin/gsd-t-traceability-gate.cjs `assessTask`).
 *
 * Contract: .gsd-t/contracts/test-plan-first-contract.md §2 (row identity:
 * plan document + table name + Seq) and §7 (additive widening — the old
 * Files+Test binding must keep working unchanged for every milestone with no
 * test plan).
 *
 * Two halves, per the task spec:
 *  1. THE NEW BEHAVIOR — a citation that resolves clears; one that doesn't
 *     resolve, or is malformed, does NOT clear.
 *  2. THE PRESERVATION (load-bearing) — the M83/M87 tests are byte-identical
 *     (asserted mechanically, not claimed) and still pass; a milestone with
 *     no test plan produces the identical verdict as before this change.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const {
  runGate,
  assessTask,
  parsePlanRowCitation,
  loadTestPlanRowIdentities,
} = require("../bin/gsd-t-traceability-gate.cjs");

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m115-a7-"));
  fs.mkdirSync(path.join(dir, ".gsd-t", "domains", "example"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".gsd-t", "pseudocode"), { recursive: true });
  return dir;
}

function writeTasks(dir, md) {
  fs.writeFileSync(path.join(dir, ".gsd-t", "domains", "example", "tasks.md"), md);
}

function writeTestPlan(dir, title, md) {
  fs.writeFileSync(path.join(dir, ".gsd-t", "pseudocode", `TestPlan-${title}.md`), md);
}

const SAMPLE_PLAN = `# TestPlan-Renewals

One sentence.

---

## Decided without you

None — every row is sourced.

---

## Table: Renewals

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | book is out | renew it | due date extends | due date updated | docs/requirements.md#renewal |
| 2 | book overdue | renew it | refused | none | docs/requirements.md#refusal |

---

## Open gaps

None — every row is answered.

---

## Sign-off

| Signed by | Date |
|---|---|
| Jane | 2026-09-03 |
`;

// ─── parsePlanRowCitation: structured, path-as-path ──────────────────────

test("A7 parse: a well-formed Plan-Row citation parses into doc/table/seq", () => {
  const c = parsePlanRowCitation(["**Plan-Row**: Renewals#Renewals/Seq-1"]);
  assert.deepEqual(c, { doc: "Renewals", table: "Renewals", seq: "1", raw: "Renewals#Renewals/Seq-1", malformed: false });
});

test("A7 parse: colon-inside-bold form also parses", () => {
  const c = parsePlanRowCitation(["**Plan-Row:** Renewals#Renewals/Seq-2"]);
  assert.equal(c.malformed, false);
  assert.equal(c.seq, "2");
});

test("A7 parse: no Plan-Row field → null", () => {
  assert.equal(parsePlanRowCitation(["**Files**: a.js"]), null);
});

test("A7 parse: malformed citation shapes are flagged malformed, never throw", () => {
  assert.equal(parsePlanRowCitation(["**Plan-Row**: no-hash-here"]).malformed, true);
  assert.equal(parsePlanRowCitation(["**Plan-Row**: Doc#NoSlash"]).malformed, true);
  assert.equal(parsePlanRowCitation(["**Plan-Row**: Doc#Table/NotASeq"]).malformed, true);
});

// ─── loadTestPlanRowIdentities: structural, positional ───────────────────

test("A7 load: reads real Seq identities from a TestPlan doc, keyed by table::seq", () => {
  const dir = tmpProject();
  writeTestPlan(dir, "Renewals", SAMPLE_PLAN);
  const ids = loadTestPlanRowIdentities(path.join(dir, ".gsd-t", "pseudocode"), "Renewals");
  assert.ok(ids.has("Renewals::1"));
  assert.ok(ids.has("Renewals::2"));
  assert.equal(ids.size, 2);
});

test("A7 load: a missing doc returns null (never throws, never an empty-but-truthy set)", () => {
  const dir = tmpProject();
  const ids = loadTestPlanRowIdentities(path.join(dir, ".gsd-t", "pseudocode"), "NoSuchDoc");
  assert.equal(ids, null);
});

// ─── HALF 1: the new behavior ─────────────────────────────────────────────

test("A7 new behavior: an AC bound to a plan row (and nothing else) CLEARS", () => {
  const dir = tmpProject();
  writeTestPlan(dir, "Renewals", SAMPLE_PLAN);
  writeTasks(dir, `# Tasks
### Task 1 — renew a book
- **Plan-Row**: Renewals#Renewals/Seq-1
- **Acceptance criteria**:
  - due date extends by the renewal period
`);
  const r = runGate({ projectDir: dir });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  const t = r.tasks.find((x) => /Task 1/.test(x.title));
  assert.equal(t.planRowClears, true);
});

test("A7 new behavior: a citation to a plan row that does NOT exist does NOT clear", () => {
  const dir = tmpProject();
  writeTestPlan(dir, "Renewals", SAMPLE_PLAN);
  writeTasks(dir, `# Tasks
### Task 1 — renew a book
- **Plan-Row**: Renewals#Renewals/Seq-99
- **Acceptance criteria**:
  - due date extends by the renewal period
`);
  const r = runGate({ projectDir: dir });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.kind === "ac-without-path"));
  assert.ok(r.violations.some((v) => v.kind === "ac-without-test"));
  const t = r.tasks.find((x) => /Task 1/.test(x.title));
  assert.equal(t.planRowClears, false);
});

test("A7 new behavior: a citation to a doc that doesn't exist does NOT clear", () => {
  const dir = tmpProject();
  // No TestPlan doc written at all.
  writeTasks(dir, `# Tasks
### Task 1 — renew a book
- **Plan-Row**: NoSuchPlan#Renewals/Seq-1
- **Acceptance criteria**:
  - due date extends by the renewal period
`);
  const r = runGate({ projectDir: dir });
  assert.equal(r.ok, false);
  const t = r.tasks.find((x) => /Task 1/.test(x.title));
  assert.equal(t.planRowClears, false);
});

test("A7 new behavior: a malformed citation does NOT clear", () => {
  const dir = tmpProject();
  writeTestPlan(dir, "Renewals", SAMPLE_PLAN);
  writeTasks(dir, `# Tasks
### Task 1 — renew a book
- **Plan-Row**: Renewals-no-hash-or-seq
- **Acceptance criteria**:
  - due date extends by the renewal period
`);
  const r = runGate({ projectDir: dir });
  assert.equal(r.ok, false);
  const t = r.tasks.find((x) => /Task 1/.test(x.title));
  assert.equal(t.planRowClears, false);
  assert.equal(t.planRowCitation.malformed, true);
});

test("A7 new behavior: the old Files+Test binding still clears on its own, untouched", () => {
  const dir = tmpProject();
  writeTasks(dir, `# Tasks
### Task 1
- **Files**: src/x.js, src/x.test.js
- **Acceptance criteria**:
  - does the thing
`);
  const r = runGate({ projectDir: dir });
  assert.equal(r.ok, true);
});

test("A7 new behavior: a plan-row citation is captured on non-behavioral tasks too (no AC), same as section citations", () => {
  const dir = tmpProject();
  writeTasks(dir, `# Tasks
### Task 1 — scaffolding only
- **Plan-Row**: Renewals#Renewals/Seq-1
`);
  const r = runGate({ projectDir: dir });
  const t = r.tasks.find((x) => /Task 1/.test(x.title));
  assert.equal(t.behavioral, false);
  assert.ok(t.planRowCitation);
  assert.equal(t.planRowCitation.doc, "Renewals");
});

// ─── HALF 2: preservation (the load-bearing half) ────────────────────────

test("A7 preservation: a milestone with NO test plan produces the identical verdict as before A7 — real recorded output, not assumption", () => {
  // Same fixture shape as the pre-A7 M83 "unbacked promise" case, run with NO
  // pseudocode/testplan dir present at all (a milestone that never had a plan).
  const dir = tmpProject();
  fs.rmSync(path.join(dir, ".gsd-t", "pseudocode"), { recursive: true, force: true });
  writeTasks(dir, `# Tasks
### Task 1 — feature
- **Acceptance criteria**:
  - does the thing
`);
  const r = runGate({ projectDir: dir });
  // Recorded output from bin/gsd-t-traceability-gate.cjs BEFORE the A7 change:
  // no Files and no Test on an AC-bearing task independently raises BOTH
  // ac-without-path AND ac-without-test (see M83's "FAILs an AC with no
  // implementing Files path" fixture — it asserts `some(...ac-without-path)`
  // over this exact same task body, which also always carried ac-without-test).
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 4);
  assert.equal(r.violations.length, 2);
  assert.deepEqual(
    r.violations.map((v) => v.kind).sort(),
    ["ac-without-path", "ac-without-test"]
  );
  assert.equal(r.summary.behavioral, 1);
});

test("A7 preservation: assessTask() called bare (no opts, the pre-A7 call shape) behaves identically", () => {
  // The exact pre-A7 invocation shape (bin/gsd-t-traceability-gate.cjs's own
  // pre-A7 call site was `assessTask(t)` with no second argument).
  const r1 = assessTask({ title: "x", lines: ["**Files**: a.js", "**Acceptance criteria**:", "does it"] });
  const r2 = assessTask({ title: "x", lines: ["**Files**: a.js", "**Acceptance criteria**:", "does it"] }, {});
  assert.deepEqual(r1.violations, r2.violations);
  assert.equal(r1.planRowClears, false);
});

test("A7 preservation: existing violation `kind` strings are UNCHANGED (no renamed/added kind on the old path)", () => {
  const f = assessTask({ title: "x", lines: ["**Headline**: true", "**Acceptance criteria**:", "does it"] });
  const kinds = f.violations.map((v) => v.kind).sort();
  assert.deepEqual(kinds, ["ac-without-path", "ac-without-test", "headline-without-impl", "headline-without-test"]);
});

test("A7 preservation: M83 and M87 gate test files are BYTE-IDENTICAL — mechanical hash check, not a claim", () => {
  const repoRoot = path.join(__dirname, "..");
  const protectedFiles = [
    "test/m83-traceability-gate.test.js",
    "test/m87-docripple-presence-lint.test.js",
    "test/m87-gate-milestone-scoping.test.js",
    "test/m87-guard-map-bridge.test.js",
    "test/m87-milestone-flow.test.js",
    "test/m87-traceability-section-coverage.test.js",
    "test/m87-verify-guardmap-wiring.test.js",
  ];

  // Mechanical: `git diff --stat` against HEAD must be EMPTY for every one of
  // these files — the actual assertion the task spec names, not a substitute.
  let diffStat;
  try {
    diffStat = execFileSync("git", ["diff", "--stat", "--", ...protectedFiles], {
      cwd: repoRoot, encoding: "utf8",
    }).trim();
  } catch (e) {
    assert.fail(`git diff --stat failed to run: ${e && e.message}`);
  }
  assert.equal(diffStat, "", `these files must be byte-identical to HEAD (no domain may edit them):\n${diffStat}`);

  // Belt-and-suspenders: a content hash of each file against HEAD's blob, so
  // this test still catches a divergence even in a working tree with no git
  // available for --stat (never trust a single check for a load-bearing proof).
  for (const rel of protectedFiles) {
    const working = fs.readFileSync(path.join(repoRoot, rel), "utf8");
    const workingHash = crypto.createHash("sha256").update(working).digest("hex");
    let headBlob;
    try {
      headBlob = execFileSync("git", ["show", `HEAD:${rel}`], { cwd: repoRoot, encoding: "utf8" });
    } catch (e) {
      assert.fail(`could not read HEAD:${rel}: ${e && e.message}`);
    }
    const headHash = crypto.createHash("sha256").update(headBlob).digest("hex");
    assert.equal(workingHash, headHash, `${rel} content hash diverged from HEAD`);
  }
});

test("A7 preservation: the M83 and M87 suites still PASS, unmodified", () => {
  const repoRoot = path.join(__dirname, "..");
  const files = [
    "test/m83-traceability-gate.test.js",
    "test/m87-docripple-presence-lint.test.js",
    "test/m87-gate-milestone-scoping.test.js",
    "test/m87-guard-map-bridge.test.js",
    "test/m87-milestone-flow.test.js",
    "test/m87-traceability-section-coverage.test.js",
    "test/m87-verify-guardmap-wiring.test.js",
  ];
  // Run each file as a plain script (node:test's `test()` runs standalone) —
  // NOT via `node --test`, which node:test refuses to nest when this very
  // file is itself already running under `--test` (a harness limitation, not
  // a real failure: it would silently skip and report an empty pass, which
  // must never read as "verified"). `--test-reporter=tap` plus dropping the
  // inherited NODE_TEST_CONTEXT env var are both required: when THIS file is
  // itself invoked under `node --test` (as `npm test` does), Node sets
  // NODE_TEST_CONTEXT and the child inherits it, which forces node:test's
  // internal binary IPC reporter on the CHILD regardless of the
  // --test-reporter flag — verified directly (a child spawned with the flag
  // alone still emits the binary format; deleting the env var is what fixes
  // it). Exit code is the primary signal; the TAP summary line the secondary.
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  for (const rel of files) {
    const res = require("node:child_process").spawnSync(
      process.execPath, ["--test-reporter=tap", rel], { cwd: repoRoot, encoding: "utf8", env: childEnv }
    );
    assert.equal(res.status, 0, `${rel} must exit 0 (unmodified, still passing):\n${res.stdout}\n${res.stderr}`);
    assert.match(res.stdout, /^# fail 0$/m, `${rel}: expected zero failures:\n${res.stdout}`);
  }
});
