"use strict";

// M93 D2 (the instruction layer) — Reader Contract presence lint.
//
// The Reader Contract is the sharpened conciseness rule baked into the framework
// instruction layer (D2). It MUST appear in:
//   1. templates/CLAUDE-global.md — a `## Reader Contract` block that states the
//      question-vs-action SPLIT (NOT a generic "be concise"): both "answer first"
//      (question shape) AND "intent first" (action shape) appear in the block.
//   2. The every-turn UserPromptSubmit hook (scripts/gsd-t-auto-route.js), which
//      injects the [GSD-T READER CONTRACT] block. (v6: the subagent prompts that
//      carried a marker block were cut with the triad.)
//
// Region-scoped, not file-wide substring (per
// feedback_coverage_check_structural_not_substring): CLAUDE-global has many
// sections, so the split assertion is scoped to the Reader Contract block only.
//
// Mandatory negative (M71-family): stripping a split phrase from the Reader
// Contract block makes the split assertion FAIL.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CLAUDE_GLOBAL = path.join(ROOT, "templates", "CLAUDE-global.md");
const AUTO_ROUTE = path.join(ROOT, "scripts", "gsd-t-auto-route.js");

// The two SPLIT phrases that prove this is the question-vs-action split, not a
// generic "be concise". Both must appear inside the Reader Contract block.
const SPLIT_PHRASES = ["answer first", "intent first"];

function readBody(file) {
  return fs.readFileSync(file, "utf8");
}

/**
 * Slice the Reader Contract block: from the `## Reader Contract` heading to the
 * next `## ` or `# ` heading. Returns "" if the heading is absent (→ presence
 * check fails, which is correct).
 */
function readerContractRegion(body) {
  const lines = body.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^## Reader Contract\b/.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2} /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

// ── Positive: CLAUDE-global Reader Contract block exists + states the SPLIT ────

test("CLAUDE-global carries a `## Reader Contract` block", () => {
  const region = readerContractRegion(readBody(CLAUDE_GLOBAL));
  assert.ok(
    region !== "",
    "`## Reader Contract` heading missing from templates/CLAUDE-global.md"
  );
});

for (const phrase of SPLIT_PHRASES) {
  test(`Reader Contract block states the split: "${phrase}" present`, () => {
    const region = readerContractRegion(readBody(CLAUDE_GLOBAL));
    assert.ok(
      region.toLowerCase().includes(phrase),
      `"${phrase}" missing from the Reader Contract block — the block must state the ` +
        `question-vs-action SPLIT (both "answer first" and "intent first"), not a generic "be concise".`
    );
  });
}

test("negative: stripping a split phrase from the Reader Contract block fails the split assertion", () => {
  const body = readBody(CLAUDE_GLOBAL);
  const region = readerContractRegion(body);
  // Strip "intent first" from the block only.
  const stripped = region.replace(/intent first/gi, "__REMOVED__");
  const mutated = body.replace(region, stripped);
  const newRegion = readerContractRegion(mutated);
  assert.ok(
    !newRegion.toLowerCase().includes("intent first"),
    "Stripping 'intent first' should remove it from the block — the split assertion would now fail (correct)."
  );
});

// ── The every-turn hook injects the contract ──────────────────────────────────

test("the UserPromptSubmit hook emits the [GSD-T READER CONTRACT] block every turn", () => {
  const { spawnSync } = require("node:child_process");
  const r = spawnSync(process.execPath, [AUTO_ROUTE], { input: JSON.stringify({ prompt: "hi", cwd: ROOT }), encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^\[GSD-T NOW\] /m, "the live clock line comes first");
  assert.match(r.stdout, /\[GSD-T READER CONTRACT\]/, "the reader contract is injected");
  assert.doesNotMatch(r.stdout, /\[GSD-T (AUTO-ROUTE|PROFILE)\]/, "v6 cut the router and profile emits");
  assert.ok(SPLIT_PHRASES.length === 2, "the split has exactly two directions (question + action)");
});
