"use strict";

// M92 D2-T4 — verdict-vocabulary test (THE KEYSTONE PROOF)
// (test/m92-verdict-vocabulary.test.js)
//
// M92's whole point: today verify's `overallVerdict` is a 3-enum where VERIFIED =
// AND of additive gates. The schema literally CANNOT say "we made it smaller." This
// test proves the schema can NOW express leanness — WITHOUT replacing the enum (the
// exact additive-trap M92 fixes; replacing it would also break every existing verify
// test). Three load-bearing proofs, asserted STRUCTURALLY against the workflow source
// the same way M87's wiring test (test/m87-verify-guardmap-wiring.test.js) does:
//
//   (a) VERDICT_SCHEMA includes the `shrink` field with `netLoc` + `leaner`
//       (NON-VACUOUS: a schema that still can't express leanness FAILS here).
//   (b) the existing `overallVerdict` enum is UNCHANGED (additive-not-replace).
//   (c) the workflow WIRES the shrink-metric via runCli BEFORE synthesis, M71-clean
//       (a workflow that DROPPED the shrink wiring FAILS).
//
// The verify workflow runs only in the Anthropic Workflow sandbox (no standalone
// Node), so — like the M87 wiring test — these are STATIC assertions over the source.

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const VERIFY_WF = path.resolve(__dirname, "..", "templates", "workflows", "gsd-t-verify.workflow.js");
const src = fs.readFileSync(VERIFY_WF, "utf8");

// Slice the VERDICT_SCHEMA object literal out of the source (from its declaration to
// the matching close), so assertions target the verdict schema specifically.
function verdictSchemaBlock(source) {
  const start = source.indexOf("const VERDICT_SCHEMA = {");
  assert.ok(start >= 0, "VERDICT_SCHEMA must be declared in the verify workflow");
  // Find the end: the next "};" at column 0 after the declaration.
  const end = source.indexOf("\n};", start);
  assert.ok(end > start, "VERDICT_SCHEMA must be a closed object literal");
  return source.slice(start, end + 3);
}

const SCHEMA_BLOCK = verdictSchemaBlock(src);

// ─── (a) the schema can now SAY "smaller" — shrink with netLoc + leaner ─────

describe("(a) VERDICT_SCHEMA expresses leanness — the `shrink` field with netLoc + leaner (non-vacuous)", () => {
  test("VERDICT_SCHEMA declares a `shrink` field", () => {
    assert.ok(
      /\bshrink\s*:\s*\{/.test(SCHEMA_BLOCK),
      "VERDICT_SCHEMA must declare a `shrink` object field — without it the verdict still cannot express leanness (the whole point of M92)"
    );
  });

  test("the `shrink` field carries `netLoc` AND `leaner` (the two leanness signals)", () => {
    // Scope to the shrink sub-object so we don't match netLoc/leaner from elsewhere.
    const sStart = SCHEMA_BLOCK.indexOf("shrink:");
    assert.ok(sStart >= 0, "shrink field must exist");
    const shrinkBlock = SCHEMA_BLOCK.slice(sStart);
    assert.ok(/\bnetLoc\b/.test(shrinkBlock), "shrink must carry `netLoc` (the measured net LOC)");
    assert.ok(/\bleaner\b/.test(shrinkBlock), "shrink must carry `leaner` (the boolean 'did it get smaller')");
    // leaner must be a boolean, netLoc a number — the leanness vocabulary.
    assert.ok(/leaner\s*:\s*\{\s*type\s*:\s*"boolean"/.test(shrinkBlock), "shrink.leaner must be typed boolean");
    assert.ok(/netLoc\s*:\s*\{\s*type\s*:\s*"number"/.test(shrinkBlock), "shrink.netLoc must be typed number");
  });

  test("NON-VACUITY: a schema WITHOUT a leanness field would FAIL this test", () => {
    // Prove the (a) assertion is non-vacuous: a hypothetical pre-M92 schema (enum only,
    // no shrink) must NOT satisfy the leanness check.
    const preM92 = `const VERDICT_SCHEMA = {
  type: "object",
  required: ["overallVerdict", "summary"],
  properties: {
    overallVerdict: { type: "string", enum: ["VERIFIED", "VERIFIED-WITH-WARNINGS", "VERIFY-FAILED"] },
    summary: { type: "string" },
  },
};`;
    assert.ok(!/\bshrink\s*:\s*\{/.test(preM92), "the pre-M92 schema has no shrink field");
    assert.ok(!/\bleaner\b/.test(preM92), "the pre-M92 schema cannot say 'leaner' — so (a) is a real, non-vacuous gate");
  });
});

// ─── (b) the existing enum is UNCHANGED — additive-not-replace ─────────────

describe("(b) the `overallVerdict` 3-enum is UNCHANGED (additive-not-replace proof)", () => {
  test("overallVerdict still enumerates exactly VERIFIED | VERIFIED-WITH-WARNINGS | VERIFY-FAILED", () => {
    assert.ok(
      /overallVerdict:\s*\{\s*type:\s*"string",\s*enum:\s*\[\s*"VERIFIED",\s*"VERIFIED-WITH-WARNINGS",\s*"VERIFY-FAILED"\s*\]\s*\}/.test(SCHEMA_BLOCK),
      "the overallVerdict enum must be untouched — M92 ADDS shrink, it does NOT replace or repurpose the correctness enum"
    );
  });

  test("required still includes overallVerdict + summary (shrink is OPTIONAL/additive, not required)", () => {
    assert.ok(/required:\s*\["overallVerdict",\s*"summary"\]/.test(SCHEMA_BLOCK), "required keys must stay overallVerdict + summary");
    // shrink must NOT be in the required list — making it required would break the
    // skip-when-base-unavailable path AND every existing verdict that has no shrink.
    const requiredMatch = SCHEMA_BLOCK.match(/required:\s*\[([^\]]*)\]/);
    assert.ok(requiredMatch, "VERDICT_SCHEMA must have a required array");
    assert.ok(!/shrink/.test(requiredMatch[1]), "shrink must be OPTIONAL (not in required) — additive, never mandatory");
  });

  test("the three correctness verdicts are all still present (none removed/renamed)", () => {
    for (const v of ["VERIFIED", "VERIFIED-WITH-WARNINGS", "VERIFY-FAILED"]) {
      assert.ok(SCHEMA_BLOCK.includes(`"${v}"`), `correctness verdict "${v}" must remain in the enum`);
    }
  });
});

// ─── (c) the workflow WIRES the shrink-metric via runCli BEFORE synthesis ──
// M91/M87 wiring-test style: a workflow that DROPPED the shrink wiring FAILS.

describe("(c) verify.workflow.js wires the shrink-metric via runCli, M71-clean, before synthesis", () => {
  test("the workflow invokes bin/gsd-t-shrink-metric.cjs via runCli (M71-clean — not require/fs/child_process)", () => {
    assert.ok(/runCli\([^)]*"shrink-metric"/s.test(src), "must call runCli for the shrink-metric subcommand (the git diff runs in the agent's Bash, M71-clean)");
    assert.ok(/gsd-t-shrink-metric\.cjs/.test(src), "must reference the local bin gsd-t-shrink-metric.cjs");
    assert.ok(/"--range"/.test(src), "must pass --range to the shrink-metric CLI");
  });

  test("the shrink-metric is computed BEFORE synthesis (so the verdict can surface it)", () => {
    const metricIdx = src.indexOf('"shrink-metric"');
    const synthIdx = src.indexOf('phase("Synthesis")');
    assert.ok(metricIdx >= 0, "must reference the shrink-metric subcommand");
    assert.ok(synthIdx >= 0, "must call phase('Synthesis')");
    assert.ok(metricIdx < synthIdx, "the shrink-metric MUST be computed before synthesis so the verdict can surface leanness");
  });

  test("the measured shrink is passed INTO the synthesis prompt (surfaced, not dropped)", () => {
    // The synthesis prompt must reference the `shrink` variable so leanness reaches the verdict.
    const synthStart = src.indexOf("const synthesisPrompt = [");
    assert.ok(synthStart >= 0, "must build a synthesisPrompt");
    const synthBlock = src.slice(synthStart, src.indexOf("].join(\"\\n\");", synthStart) + 20);
    assert.ok(/\bshrink\b/.test(synthBlock), "the synthesis prompt must reference `shrink` — a workflow that DROPPED the wiring (never threads shrink into synthesis) FAILS this assertion");
  });

  test("absent diff base → a logged SKIP-with-reason, never a fabricated metric", () => {
    assert.ok(/shrinkSkipReason/.test(src), "must track a skip reason when the base is unavailable");
    assert.ok(/SKIP/.test(src) && /never fabricat|not fabricated|NEVER fabricat/i.test(src), "the skip path must be logged with a reason and must NOT fabricate a metric");
  });

  test("the shrink-metric call uses model: 'haiku' (M85 deterministic-gate tier)", () => {
    // Locate the runShrinkMetric helper / call block and confirm it is haiku, like the
    // other deterministic-gate runCli calls (which all hardcode model: "haiku").
    const helperIdx = src.indexOf("async function runShrinkMetric");
    assert.ok(helperIdx >= 0, "must define a runShrinkMetric helper");
    // runShrinkMetric delegates to runCli, which is hardcoded model: "haiku". Assert the
    // helper does NOT introduce a non-haiku tier of its own.
    const helperBlock = src.slice(helperIdx, helperIdx + 600);
    assert.ok(!/model:\s*"(opus|fable|sonnet)"/.test(helperBlock), "the shrink-metric helper must not introduce a non-haiku tier (it runs on haiku via runCli)");
  });
});

// ─── orthogonality: shrink and the enum are INDEPENDENT (no collapse) ──────

describe("orthogonality — shrink is a SEPARATE dimension, not folded into the enum", () => {
  test("the synthesis prompt frames shrink as ORTHOGONAL to the correctness verdict (no collapse)", () => {
    const synthStart = src.indexOf("const synthesisPrompt = [");
    const synthBlock = src.slice(synthStart, src.indexOf("].join(\"\\n\");", synthStart) + 20);
    assert.ok(/ORTHOGONAL|orthogonal|do NOT fold|not.*fold/i.test(synthBlock), "the synthesis must frame shrink as orthogonal to pass/fail — leanness is rewarded ALONGSIDE the verdict, never collapsed into it");
  });

  test("the workflow return surfaces shrink alongside the verdict", () => {
    // The final return object must include a top-level shrink key (surfaced to callers).
    const tail = src.slice(src.lastIndexOf("return {"));
    assert.ok(/shrink:\s*shrink\s*\|\|/.test(tail) || /shrink:/.test(tail), "the workflow return must surface the shrink dimension alongside the verdict");
  });
});
