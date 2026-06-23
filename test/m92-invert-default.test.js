"use strict";

// M92 D3 — Invert the default altitude (smallest change is the recommendation;
// ceremony is opt-in).
//
// Deterministic, STRUCTURAL/POSITIONAL test for the framing flip (M91-D3 precedent:
// index-comparison, never bare substring-presence). It proves three things:
//
//   (a) templates/workflows/gsd-t-quick.workflow.js — the crux-first block is PRESENT
//       and its first-occurrence INDEX PRECEDES the general "Constraints from CLAUDE.md"
//       block. The old lone buried `- SIMPLICITY ABOVE ALL — minimal change` line is
//       GONE (a workflow where the smallest/crux framing is absent, or buried BELOW the
//       old constraint line, FAILS — non-vacuous).
//   (b) commands/gsd-t-milestone.md + commands/gsd-t-quick.md — the smallest-option
//       framing appears BEFORE the ceremony/plan→execute/partition framing (positional),
//       proving the DEFAULT was inverted, not just a sentence appended after the old
//       heavy default.
//   (c) regression — the existing functional step anchors are still present (the framing
//       flip kept the machinery; it removed no functional step).
//
// Spec: .gsd-t/domains/m92-invert-default/{tasks,scope,constraints}.md (M92-D3-T1..T3).

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..");
const QUICK_WF = path.join(REPO, "templates", "workflows", "gsd-t-quick.workflow.js");
const MILESTONE_CMD = path.join(REPO, "commands", "gsd-t-milestone.md");
const QUICK_CMD = path.join(REPO, "commands", "gsd-t-quick.md");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

// First index where ANY of the alternative markers appears; -1 if none. We assert
// ORDER by comparing first-occurrence indices, not by substring presence alone.
function firstIndexOfAny(text, markers) {
  let best = -1;
  for (const m of markers) {
    const i = text.indexOf(m);
    if (i !== -1 && (best === -1 || i < best)) best = i;
  }
  return best;
}

// ─── (a) quick.workflow: crux-first block precedes the general constraints ─────────

describe("M92-D3 quick.workflow crux-first block (smallest/crux framing leads the constraints)", () => {
  const text = read(QUICK_WF);

  test("the crux-first block is PRESENT and PRECEDES the general constraints block", () => {
    // The crux-first framing — multiple alternative anchors so a wording tweak does not
    // make the test brittle, while the ORDER assertion stays structural.
    const cruxIdx = firstIndexOfAny(text, [
      "CRUX-FIRST — START HERE",
      "smallest change is the default",
      "CRUX: state the crux",
    ]);
    // The general constraints block (where the old buried minimality line lived).
    const constraintsIdx = firstIndexOfAny(text, ["Constraints from CLAUDE.md:"]);

    assert.notEqual(cruxIdx, -1, "the crux-first block must be present in the framing");
    assert.notEqual(constraintsIdx, -1, "the general constraints block must still be present");
    assert.ok(
      cruxIdx < constraintsIdx,
      `crux-first block (idx ${cruxIdx}) must PRECEDE the general constraints (idx ${constraintsIdx}) — leading, not buried`
    );
  });

  test("the 'edit inward at the source, not outward at the N consumers' directive is explicit", () => {
    // The load-bearing instruction of the inversion — the smallest change edits inward.
    assert.match(
      text,
      /edit\s+INWARD at the[\s\S]{0,80}not\s+OUTWARD at the N consumers/i,
      "must instruct editing inward at the source, not outward at the N consumers"
    );
    assert.match(text, /SMALLEST change/i, "must direct the SMALLEST change that hits the crux");
  });

  test("the old lone buried minimality line is GONE (the flip replaced it, not appended to it)", () => {
    // Non-vacuity: if the heavy default's toothless one-liner survived as a peer bullet,
    // the inversion did not happen. The crux-first block supersedes it.
    assert.ok(
      text.indexOf("- SIMPLICITY ABOVE ALL — minimal change") === -1,
      "the lone buried `- SIMPLICITY ABOVE ALL — minimal change` constraint line must be removed"
    );
  });

  test("M71/M85 invariants: the crux-first prose block adds no banned sandbox globals; tier literals unchanged", () => {
    // M71 sandbox-clean: scope the check to the prose block THIS flip added (the crux-first
    // framing through to the constraints), proving the edit introduced no require/fs/path/
    // child_process/process. (The whole-file M71 lint — test/m71-workflow-runtime-native-
    // lint.test.js — is the authoritative gate; here we prove the new block specifically is
    // clean and is plain prose, not code.)
    const startIdx = text.indexOf("CRUX-FIRST — START HERE");
    const endIdx = text.indexOf("Commit with prefix");
    assert.ok(startIdx !== -1 && endIdx > startIdx, "crux-first prose block must be locatable");
    const block = text.slice(startIdx, endIdx);
    for (const banned of ["require(", "child_process", "process.env", "fs.", "path.", "spawnSync"]) {
      assert.ok(
        !block.includes(banned),
        `the crux-first prose block must stay M71 sandbox-clean — must not contain ${banned}`
      );
    }
    // M85 tier literal for the quick agent stays as resolved `model` (unchanged by this flip).
    assert.match(text, /label: "quick", phase: "Execute", schema: QUICK_SCHEMA, model/, "the quick agent model wiring must be unchanged");
  });
});

// ─── (b) command files: smallest-option framing precedes the ceremony framing ──────

describe("M92-D3 milestone command (smallest path leads; ceremony is opt-in)", () => {
  const text = read(MILESTONE_CMD);

  test("smallest-change framing PRECEDES the ceremony/partition framing", () => {
    const smallestIdx = firstIndexOfAny(text, [
      "Default altitude: smallest change that hits the crux",
      "the SMALLEST change that hits the crux",
      "the smaller path IS the recommendation",
    ]);
    // Ceremony anchors: partition / plan→execute / Competition Mode framing.
    const ceremonyIdx = firstIndexOfAny(text, [
      "## Step 3: Invoke the phase Workflow",
      "Competition Mode (automatic)",
      "## Step 1: Load context",
    ]);

    assert.notEqual(smallestIdx, -1, "the smallest-change default framing must be present");
    assert.notEqual(ceremonyIdx, -1, "the ceremony/partition machinery must still be present");
    assert.ok(
      smallestIdx < ceremonyIdx,
      `smallest-change framing (idx ${smallestIdx}) must PRECEDE the ceremony framing (idx ${ceremonyIdx}) — default inverted`
    );
  });

  test("ceremony is presented as crux-justified opt-in (not the implied default)", () => {
    assert.match(text, /opt-in escalation/i, "milestone ceremony must be framed as the opt-in escalation");
    assert.match(text, /cross-domain coordination|real uncertainty/i, "escalation must be justified by the crux (coordination / uncertainty)");
  });

  test("regression: existing functional step anchors are still present", () => {
    for (const anchor of [
      "## Step 1: Load context",
      "## Step 3: Invoke the phase Workflow",
      "## Step 4: Interpret the result",
      "## Document Ripple",
      "## Two-Altitude Intention-First Flow",
    ]) {
      assert.ok(text.includes(anchor), `milestone command must keep functional anchor: ${anchor}`);
    }
  });
});

describe("M92-D3 quick command (smallest path leads; full-execute is opt-in)", () => {
  const text = read(QUICK_CMD);

  test("smallest-change framing PRECEDES the ceremony / full-execute-escalation framing", () => {
    const smallestIdx = firstIndexOfAny(text, [
      "Default altitude: smallest change that hits the crux",
      "the SMALLEST change that hits the crux",
      "smallest change IS the answer",
    ]);
    // Ceremony anchors: the full-execute escalation + parallel/plan machinery.
    const ceremonyIdx = firstIndexOfAny(text, [
      "## Step 3: Execute",
      "Parallel Dispatch",
      "escalate to the full execute workflow",
    ]);

    assert.notEqual(smallestIdx, -1, "the smallest-change default framing must be present");
    assert.notEqual(ceremonyIdx, -1, "the ceremony/full-execute machinery must still be present");
    assert.ok(
      smallestIdx < ceremonyIdx,
      `smallest-change framing (idx ${smallestIdx}) must PRECEDE the ceremony framing (idx ${ceremonyIdx}) — default inverted`
    );
  });

  test("full-execute is presented as crux-justified opt-in (not a co-equal default)", () => {
    assert.match(text, /opt-in escalation/i, "full execute must be framed as the opt-in escalation");
    // The escalation is gated on the crux needing it (cross-domain / contract / uncertainty).
    assert.match(
      text,
      /does not contain the crux|cross-domain coordination|real uncertainty/i,
      "escalation must be justified by the crux"
    );
  });

  test("regression: existing functional step anchors are still present", () => {
    for (const anchor of [
      "## Step 0.1: Launch via Subagent",
      "## Step 1: Load Context (Fast)",
      "## Step 2: Scope Check",
      "## Step 3: Execute",
      "## Step 5: Test & Verify (MANDATORY)",
      "## Step 5.5: Red Team",
      "## Step 6: Doc-Ripple (Automated)",
    ]) {
      assert.ok(text.includes(anchor), `quick command must keep functional anchor: ${anchor}`);
    }
  });
});
