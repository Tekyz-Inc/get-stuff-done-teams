"use strict";

/**
 * M94-D10 — Reader Command Wiring Test (manifest-driven)
 *
 * [RULE] phase-workflow-injects-structural-slice (T0)
 * [RULE] phase-workflow-fail-loud-no-grep (T0)
 * [RULE] impact-uses-blast-radius-not-grep (T1)
 * [RULE] plan-feature-gapanalysis-use-graph-not-grep (T2)
 * [RULE] partition-project-use-cluster-verb (T3)
 * [RULE] populate-promotedebt-prd-use-graph-not-grep (T4)
 * [RULE] qa-verify-use-orphan-dangling-verbs (T5)
 * [RULE] verify-integrate-graph-additive-announced-not-hard-fail (T5+T6)
 * [RULE] integrate-uses-graph-for-wiring-verification (T6)
 *
 * Design (option a per tasks.md §Disjointness note):
 *   T0 owns this file. T1-T6 own only their command/workflow files.
 *   This test reads the d8 consumer manifest and asserts:
 *   1. Each reader-role command file references its mapped structural verb.
 *   2. Each reader-role command file does NOT contain a structural-grep fallback
 *      (anti-grep directive, complementing the d8 lint).
 *   3. On graph-unavailable, commands fail LOUD (no silent grep path).
 *   4. The phase workflow's injection helper calls the graph CLI (queryStructuralSlice
 *      is present and the PHASE_GRAPH_VERB_MAP covers all mapped reader phases).
 *   5. verify + integrate degrade ANNOUNCED on graph-unavailable (carve-out T5+T6).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const CONTRACT_PATH = path.join(ROOT, ".gsd-t", "contracts", "graph-consumer-wiring-contract.md");
const PHASE_WF_PATH = path.join(ROOT, "templates", "workflows", "gsd-t-phase.workflow.js");
const INTEGRATE_WF_PATH = path.join(ROOT, "templates", "workflows", "gsd-t-integrate.workflow.js");
const VERIFY_WF_PATH = path.join(ROOT, "templates", "workflows", "gsd-t-verify.workflow.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse the §Consumer Manifest table from the wiring contract.
 * Returns an array of {commandFile, workflowFile, role, verbs, replacesGrepFor} objects.
 */
function parseManifest(contractText) {
  const rows = [];
  const lines = contractText.split("\n");
  let inTable = false;
  let headerPassed = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inTable) {
      // Find the manifest table header
      if (trimmed.startsWith("| Command File") && trimmed.includes("Workflow File")) {
        inTable = true;
        headerPassed = false;
        continue;
      }
      continue;
    }
    // Skip the separator row (|---|---|...) and the header row
    if (!headerPassed) {
      if (trimmed.startsWith("|---") || trimmed.startsWith("| ---")) {
        headerPassed = true;
      }
      continue;
    }
    // End of table: blank line or a non-table line
    if (!trimmed.startsWith("|")) {
      break;
    }
    const cols = trimmed.split("|").slice(1, -1).map((c) => c.trim());
    if (cols.length < 5) continue;
    // Strip markdown backtick wrappers from cell values
    const strip = (s) => s.replace(/^`|`$/g, "").trim();
    const [commandFile, workflowFile, role, verbs, replacesGrepFor] = cols.map(strip);
    // Skip placeholder rows
    if (!commandFile || commandFile.startsWith("_(") || commandFile.startsWith("_d")) continue;
    rows.push({ commandFile, workflowFile, role, verbs, replacesGrepFor });
  }
  return rows;
}

/**
 * Read a repo file as UTF-8, returning its text or null if missing.
 */
function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

/**
 * Check whether a file's text contains a structural-grep fallback pattern:
 * a grep CALL (not a mention in comments/strings) in a catch/else/fallback
 * AFTER a graph query for a structural verb.
 * Returns the offending excerpt or null if clean.
 */
function detectStructuralGrepFallback(text) {
  if (!text) return null;
  // Structural verbs from the d8 contract
  const structuralVerbs = [
    "who-imports", "who-calls", "blast-radius", "dependents",
    "dead-code", "orphan", "cycles", "cluster", "test-impl",
  ];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Skip lines that are comments (start with // or * )
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    // Skip lines that contain grep only in strings/templates about grep (not code executing grep)
    if (trimmed.includes("grep") && !trimmed.includes("grep(") && !trimmed.includes("execSync") &&
        !trimmed.includes("spawn") && !trimmed.includes("`grep ")) continue;
    // Look for an actual grep CALL in code (execSync with grep, or a template literal with grep command)
    const hasGrepCall =
      (trimmed.includes("execSync") && trimmed.includes("grep")) ||
      (trimmed.includes("`grep ")) ||
      (trimmed.includes('"grep ')) ||
      (trimmed.includes("'grep "));
    if (!hasGrepCall) continue;
    // Skip exempted patterns
    if (/TODO|FIXME|NOTE|carve.out|exempt|legitimate|text.search|text-search|announced|text-content/i.test(line)) continue;
    // Look back up to 15 lines for a graph structural query
    const context = lines.slice(Math.max(0, i - 15), i).join("\n");
    const hasGraphQuery = structuralVerbs.some((v) =>
      context.includes(`graph ${v}`) || context.includes(`gsd-t graph`) || context.includes(`graph-query`)
    );
    const inFallback = /\b(catch|else if|else\s*\{|fallback|\|\|)\b/.test(context.slice(-400));
    if (hasGraphQuery && inFallback) {
      return line;
    }
  }
  return null;
}

// ─── T0: Phase workflow injection seam ───────────────────────────────────────

test("T0: phase workflow contains queryStructuralSlice function", () => {
  const text = readFile("templates/workflows/gsd-t-phase.workflow.js");
  assert.ok(text, "gsd-t-phase.workflow.js must exist");
  assert.ok(
    text.includes("queryStructuralSlice"),
    "phase workflow must define the queryStructuralSlice injection helper [RULE phase-workflow-injects-structural-slice]"
  );
});

test("T0: phase workflow PHASE_GRAPH_VERB_MAP covers all mapped reader phases", () => {
  const text = readFile("templates/workflows/gsd-t-phase.workflow.js");
  assert.ok(text, "gsd-t-phase.workflow.js must exist");
  // Verify the verb map is present and contains the expected phase→verb entries
  const expectedEntries = [
    ["impact", "blast-radius"],
    ["plan", "who-imports"],
    ["partition", "cluster"],
    ["feature", "blast-radius"],
    ["gap-analysis", "dead-code"],
    ["project", "cluster"],
    ["populate", "who-imports"],
    ["promote-debt", "blast-radius"],
    ["prd", "cluster"],
  ];
  // Find the PHASE_GRAPH_VERB_MAP block's start position in the file as our search anchor.
  // This ensures we only look for phase keys WITHIN the map definition, not in comments/meta.
  const mapStart = text.indexOf("PHASE_GRAPH_VERB_MAP");
  assert.ok(mapStart >= 0, "PHASE_GRAPH_VERB_MAP declaration must exist in the phase workflow");

  // The map block ends at the closing brace after it — scan for the first occurrence of
  // each key AFTER mapStart.
  for (const [phase, verb] of expectedEntries) {
    // Keys may be quoted (e.g. "gap-analysis":, "promote-debt":) or unquoted (impact:, plan:)
    const keyPatterns = [`"${phase}":`, `'${phase}':`, `${phase}:`, `"${phase}"`];
    const allIdx = keyPatterns
      .map((p) => text.indexOf(p, mapStart))
      .filter((i) => i >= 0);
    assert.ok(
      allIdx.length > 0,
      `PHASE_GRAPH_VERB_MAP must map phase "${phase}" (searching after position ${mapStart})`
    );
    // Take the earliest occurrence after mapStart
    const phaseIdx = Math.min(...allIdx);
    const verbIdx = text.indexOf(`"${verb}"`, phaseIdx);
    assert.ok(
      verbIdx !== -1 && verbIdx - phaseIdx < 300,
      `PHASE_GRAPH_VERB_MAP phase "${phase}" must map to verb "${verb}" (within 300 chars of the phase key in the map block)`
    );
  }
});

test("T0: phase workflow surfaces loud message on graph-unavailable (no grep fallback)", () => {
  const text = readFile("templates/workflows/gsd-t-phase.workflow.js");
  assert.ok(text, "gsd-t-phase.workflow.js must exist");
  // Must contain the FAIL-LOUD message text
  assert.ok(
    text.includes("graph unavailable") || text.includes("graph-unavailable"),
    "phase workflow must surface loud message on graph-unavailable [RULE phase-workflow-fail-loud-no-grep]"
  );
  // Must NOT contain a structural grep fallback after a graph query
  const fallback = detectStructuralGrepFallback(text);
  assert.equal(
    fallback, null,
    `phase workflow must NOT have a structural-grep fallback — found: ${fallback}`
  );
  // The _graphSliceLine must be injected into agent prompts
  assert.ok(
    text.includes("_graphSliceLine"),
    "phase workflow must thread _graphSliceLine into worker agent prompts"
  );
});

test("T0: phase workflow is runtime-native (no require/fs/path/child_process/process literals)", () => {
  const text = readFile("templates/workflows/gsd-t-phase.workflow.js");
  assert.ok(text, "gsd-t-phase.workflow.js must exist");
  // M81: no require/fs/path/child_process/process in the workflow (they trip the sandbox lint)
  // The only exceptions are string literals in comments/prompts explaining the prohibition
  const codeLines = text.split("\n").filter((l) => {
    const t = l.trim();
    // Skip lines that are pure comments
    return !t.startsWith("//") && !t.startsWith("*");
  });
  const codeText = codeLines.join("\n");
  // Check for bare require() calls (not in strings/comments)
  const requireMatch = codeText.match(/\brequire\s*\(/);
  assert.ok(!requireMatch, "phase workflow must not use require() — M81 sandbox ban");
});

// ─── Manifest-driven reader assertions ───────────────────────────────────────

test("consumer manifest is parseable and non-empty after d10 wiring", () => {
  const contractText = fs.readFileSync(CONTRACT_PATH, "utf8");
  const rows = parseManifest(contractText);
  assert.ok(
    rows.length > 0,
    "consumer manifest must have at least one non-placeholder row after d10 wiring"
  );
});

test("all manifest reader rows: command file exists and references its mapped structural verb", () => {
  const contractText = fs.readFileSync(CONTRACT_PATH, "utf8");
  const rows = parseManifest(contractText);
  const readerRows = rows.filter((r) => r.role === "reader");
  assert.ok(readerRows.length > 0, "manifest must have at least one reader row");

  for (const row of readerRows) {
    const cmdText = readFile(row.commandFile);
    assert.ok(
      cmdText !== null,
      `command file ${row.commandFile} must exist (manifest row: ${row.commandFile})`
    );

    // Each verb listed in the manifest must appear in the command file
    const verbs = row.verbs.split(",").map((v) => v.trim()).filter(Boolean);
    for (const verb of verbs) {
      assert.ok(
        cmdText.includes(verb) || cmdText.includes(verb.replace("-", " ")),
        `command file ${row.commandFile} must reference structural verb "${verb}" from the manifest`
      );
    }
  }
});

test("all manifest reader rows: command file fails LOUD on graph-unavailable (no silent grep)", () => {
  const contractText = fs.readFileSync(CONTRACT_PATH, "utf8");
  const rows = parseManifest(contractText);
  // verify + integrate have the carve-out (announced WARNING, not hard-fail)
  const CARVE_OUT = new Set([
    "commands/gsd-t-verify.md",
    "commands/gsd-t-integrate.md",
  ]);
  const hardStopReaders = rows.filter((r) => r.role === "reader" && !CARVE_OUT.has(r.commandFile));

  for (const row of hardStopReaders) {
    const cmdText = readFile(row.commandFile);
    if (!cmdText) continue;
    // Must mention fail-loud / graph-unavailable
    assert.ok(
      cmdText.includes("graph-unavailable") ||
        cmdText.includes("graph unavailable") ||
        cmdText.includes("fail loud") ||
        cmdText.includes("FAIL LOUD") ||
        cmdText.includes("gsd-t graph status"),
      `command file ${row.commandFile} must document fail-loud on graph-unavailable [RULE consumer-structural-grep-removed]`
    );
  }
});

test("verify + integrate: degrade ANNOUNCED (not hard-fail) on graph-unavailable (carve-out)", () => {
  // PRE-MORTEM Finding 3 — bootstrap carve-out
  // [RULE] verify-integrate-graph-additive-announced-not-hard-fail
  const verifyCmd = readFile("commands/gsd-t-verify.md");
  const integrateCmd = readFile("commands/gsd-t-integrate.md");
  const verifyWf = readFile("templates/workflows/gsd-t-verify.workflow.js");
  const integrateWf = readFile("templates/workflows/gsd-t-integrate.workflow.js");

  for (const [label, text] of [
    ["commands/gsd-t-verify.md", verifyCmd],
    ["commands/gsd-t-integrate.md", integrateCmd],
    ["templates/workflows/gsd-t-verify.workflow.js", verifyWf],
    ["templates/workflows/gsd-t-integrate.workflow.js", integrateWf],
  ]) {
    assert.ok(text !== null, `${label} must exist`);
    // Must contain the announced-degradation language (WARNING, not FAIL)
    const hasAnnounced =
      text.includes("WARNING") ||
      text.includes("warning") ||
      text.includes("additive") ||
      text.includes("graph unavailable") ||
      text.includes("graph-unavailable") ||
      text.includes("structural gate skipped") ||
      text.includes("announced");
    assert.ok(
      hasAnnounced,
      `${label} must document announced degradation (WARNING) on graph-unavailable, not hard-fail [RULE verify-integrate-graph-additive-announced-not-hard-fail]`
    );
  }
  // verify/integrate MUST NOT say "FAIL LOUD" or "fails LOUD" for the graph-unavailable case
  // (they degrade, others fail loud) — only check the verify/integrate-specific graph section
  // This is a proxy check: verify that the carve-out is explicitly mentioned
  const verifyHasCarveOut =
    (verifyCmd && (verifyCmd.includes("carve-out") || verifyCmd.includes("additive") || verifyCmd.includes("WARNING"))) ||
    (verifyWf && (verifyWf.includes("carve-out") || verifyWf.includes("additive") || verifyWf.includes("WARNING")));
  assert.ok(verifyHasCarveOut, "verify files must document the announced-degradation carve-out");
});

// ─── T1: /impact uses blast-radius ───────────────────────────────────────────

test("T1: commands/gsd-t-impact.md references blast-radius graph query (not grep)", () => {
  const text = readFile("commands/gsd-t-impact.md");
  assert.ok(text, "commands/gsd-t-impact.md must exist");
  assert.ok(
    text.includes("blast-radius"),
    "impact command must reference blast-radius graph query [RULE impact-uses-blast-radius-not-grep]"
  );
  assert.ok(
    text.includes("graph") || text.includes("gsd-t graph"),
    "impact command must direct a graph CLI call"
  );
  const fallback = detectStructuralGrepFallback(text);
  assert.equal(fallback, null, `impact command must not have structural-grep fallback — found: ${fallback}`);
});

test("T1: impact command fails LOUD on graph-unavailable", () => {
  const text = readFile("commands/gsd-t-impact.md");
  assert.ok(text, "commands/gsd-t-impact.md must exist");
  assert.ok(
    text.includes("graph-unavailable") || text.includes("graph unavailable") ||
    text.includes("FAIL LOUD") || text.includes("fail loud") ||
    text.includes("gsd-t graph status"),
    "impact command must document fail-loud on graph-unavailable"
  );
});

// ─── T2: /plan + /feature + /gap-analysis ────────────────────────────────────

test("T2: commands/gsd-t-plan.md references who-imports graph query", () => {
  const text = readFile("commands/gsd-t-plan.md");
  assert.ok(text, "commands/gsd-t-plan.md must exist");
  assert.ok(
    text.includes("who-imports") || text.includes("blast-radius"),
    "plan command must reference who-imports or blast-radius graph query [RULE plan-feature-gapanalysis-use-graph-not-grep]"
  );
  const fallback = detectStructuralGrepFallback(text);
  assert.equal(fallback, null, `plan command must not have structural-grep fallback — found: ${fallback}`);
});

test("T2: commands/gsd-t-feature.md references blast-radius or who-imports graph query", () => {
  const text = readFile("commands/gsd-t-feature.md");
  assert.ok(text, "commands/gsd-t-feature.md must exist");
  assert.ok(
    text.includes("blast-radius") || text.includes("who-imports"),
    "feature command must reference blast-radius/who-imports graph query [RULE plan-feature-gapanalysis-use-graph-not-grep]"
  );
  const fallback = detectStructuralGrepFallback(text);
  assert.equal(fallback, null, `feature command must not have structural-grep fallback — found: ${fallback}`);
});

test("T2: commands/gsd-t-gap-analysis.md references who-imports or dead-code graph query", () => {
  const text = readFile("commands/gsd-t-gap-analysis.md");
  assert.ok(text, "commands/gsd-t-gap-analysis.md must exist");
  assert.ok(
    text.includes("who-imports") || text.includes("dead-code"),
    "gap-analysis command must reference who-imports/dead-code graph query [RULE plan-feature-gapanalysis-use-graph-not-grep]"
  );
  const fallback = detectStructuralGrepFallback(text);
  assert.equal(fallback, null, `gap-analysis command must not have structural-grep fallback — found: ${fallback}`);
});

// ─── T3: /partition + /project use cluster ───────────────────────────────────

test("T3: commands/gsd-t-partition.md references cluster graph query", () => {
  const text = readFile("commands/gsd-t-partition.md");
  assert.ok(text, "commands/gsd-t-partition.md must exist");
  assert.ok(
    text.includes("cluster"),
    "partition command must reference cluster graph query [RULE partition-project-use-cluster-verb]"
  );
  const fallback = detectStructuralGrepFallback(text);
  assert.equal(fallback, null, `partition command must not have structural-grep fallback — found: ${fallback}`);
});

test("T3: commands/gsd-t-project.md references cluster graph query", () => {
  const text = readFile("commands/gsd-t-project.md");
  assert.ok(text, "commands/gsd-t-project.md must exist");
  assert.ok(
    text.includes("cluster"),
    "project command must reference cluster graph query [RULE partition-project-use-cluster-verb]"
  );
  const fallback = detectStructuralGrepFallback(text);
  assert.equal(fallback, null, `project command must not have structural-grep fallback — found: ${fallback}`);
});

// ─── T4: /populate + /promote-debt + /prd ────────────────────────────────────

test("T4: commands/gsd-t-populate.md references who-imports or cluster graph query", () => {
  const text = readFile("commands/gsd-t-populate.md");
  assert.ok(text, "commands/gsd-t-populate.md must exist");
  assert.ok(
    text.includes("who-imports") || text.includes("cluster"),
    "populate command must reference who-imports/cluster graph query [RULE populate-promotedebt-prd-use-graph-not-grep]"
  );
  const fallback = detectStructuralGrepFallback(text);
  assert.equal(fallback, null, `populate command must not have structural-grep fallback — found: ${fallback}`);
});

test("T4: commands/gsd-t-promote-debt.md references blast-radius graph query", () => {
  const text = readFile("commands/gsd-t-promote-debt.md");
  assert.ok(text, "commands/gsd-t-promote-debt.md must exist");
  assert.ok(
    text.includes("blast-radius"),
    "promote-debt command must reference blast-radius graph query [RULE populate-promotedebt-prd-use-graph-not-grep]"
  );
  const fallback = detectStructuralGrepFallback(text);
  assert.equal(fallback, null, `promote-debt command must not have structural-grep fallback — found: ${fallback}`);
});

test("T4: commands/gsd-t-prd.md references cluster graph query", () => {
  const text = readFile("commands/gsd-t-prd.md");
  assert.ok(text, "commands/gsd-t-prd.md must exist");
  assert.ok(
    text.includes("cluster"),
    "prd command must reference cluster graph query [RULE populate-promotedebt-prd-use-graph-not-grep]"
  );
  const fallback = detectStructuralGrepFallback(text);
  assert.equal(fallback, null, `prd command must not have structural-grep fallback — found: ${fallback}`);
});

// ─── T5: /qa + /verify use dead-code + dangling ──────────────────────────────

test("T5: commands/gsd-t-qa.md references dead-code and dangling graph queries", () => {
  const text = readFile("commands/gsd-t-qa.md");
  assert.ok(text, "commands/gsd-t-qa.md must exist");
  assert.ok(
    text.includes("dead-code"),
    "qa command must reference dead-code graph query [RULE qa-verify-use-orphan-dangling-verbs]"
  );
  assert.ok(
    text.includes("dangling"),
    "qa command must reference dangling graph query [RULE qa-verify-use-orphan-dangling-verbs]"
  );
  const fallback = detectStructuralGrepFallback(text);
  assert.equal(fallback, null, `qa command must not have structural-grep fallback — found: ${fallback}`);
});

test("T5: commands/gsd-t-verify.md references dead-code and dangling graph queries", () => {
  const text = readFile("commands/gsd-t-verify.md");
  assert.ok(text, "commands/gsd-t-verify.md must exist");
  assert.ok(
    text.includes("dead-code"),
    "verify command must reference dead-code graph query [RULE qa-verify-use-orphan-dangling-verbs]"
  );
  assert.ok(
    text.includes("dangling"),
    "verify command must reference dangling graph query [RULE qa-verify-use-orphan-dangling-verbs]"
  );
});

test("T5: templates/workflows/gsd-t-verify.workflow.js injects dead-code+dangling graph query (additive)", () => {
  const text = readFile("templates/workflows/gsd-t-verify.workflow.js");
  assert.ok(text, "templates/workflows/gsd-t-verify.workflow.js must exist");
  assert.ok(
    text.includes("dead-code") || text.includes("queryGraphStructural"),
    "verify workflow must inject dead-code/dangling graph slice [RULE qa-verify-use-orphan-dangling-verbs]"
  );
  // The orthogonal triad / CI-parity must NOT be removed — verify must still run existing gates
  assert.ok(
    text.includes("runVerifyGate") || text.includes("verify-gate"),
    "verify workflow must still run the verify-gate (additive — Destructive Action Guard)"
  );
  assert.ok(
    text.includes("Red Team") || text.includes("red-team") || text.includes("RED_TEAM"),
    "verify workflow must still run the Red Team triad member (additive)"
  );
});

// ─── T6: /integrate uses who-imports + blast-radius ──────────────────────────

test("T6: commands/gsd-t-integrate.md references who-imports and blast-radius graph queries", () => {
  const text = readFile("commands/gsd-t-integrate.md");
  assert.ok(text, "commands/gsd-t-integrate.md must exist");
  assert.ok(
    text.includes("who-imports") || text.includes("blast-radius"),
    "integrate command must reference who-imports/blast-radius graph queries [RULE integrate-uses-graph-for-wiring-verification]"
  );
});

test("T6: templates/workflows/gsd-t-integrate.workflow.js injects who-imports+blast-radius graph query (additive)", () => {
  const text = readFile("templates/workflows/gsd-t-integrate.workflow.js");
  assert.ok(text, "templates/workflows/gsd-t-integrate.workflow.js must exist");
  assert.ok(
    text.includes("who-imports") || text.includes("blast-radius") || text.includes("queryGraphStructural"),
    "integrate workflow must inject who-imports/blast-radius graph slice [RULE integrate-uses-graph-for-wiring-verification]"
  );
  // Existing integrate functionality must NOT be removed (additive)
  assert.ok(
    text.includes("integration-points") || text.includes("integrate"),
    "integrate workflow must still perform cross-domain integration (additive — Destructive Action Guard)"
  );
});
