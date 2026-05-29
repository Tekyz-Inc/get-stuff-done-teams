// templates/workflows/gsd-t-verify.workflow.js
//
// Runtime: Anthropic native Workflow tool only (not standalone-Node parseable).
// Globals provided by runtime: agent, parallel, pipeline, log, phase, budget, args.
//
// Canonical verify-phase Workflow. Replaces the gsd-t-verify command shell with
// a deterministic pipeline:
//   preflight → brief → verify-gate (deterministic, hard-fail) →
//   parallel( /code-review ultra cooperative, Red Team adversarial, QA mechanics ) →
//   synthesis ( merge findings WITHOUT collapsing categories — see orthogonal-validation-contract.md )
//
// args shape:
//   {
//     milestone: "M61",
//     projectDir: ".",     // optional
//     skipUltra:  false,   // optional — skip /code-review ultra if rate-limited
//   }

export const meta = {
  name: "gsd-t-verify",
  description:
    "GSD-T verify phase: preflight → brief → verify-gate → CI-parity gate (M57) → test-data purge gate (M58) → parallel(code-review-ultra, Red Team, QA) → synthesis",
  phases: [
    { title: "Preflight",          detail: "preflight + brief" },
    { title: "Verify-Gate",        detail: "deterministic two-track verify-gate" },
    { title: "CI-Parity",          detail: "M57 build-coverage + ci-parity (FAIL-blocking)" },
    { title: "Test-Data Purge",    detail: "M58 test-data --purge (FAIL-blocking)" },
    { title: "Orthogonal Triad",   detail: "code-review ultra ∥ Red Team ∥ QA" },
    { title: "Synthesis",          detail: "merge without collapsing categories" },
  ],
};

const lib = require("./_lib.js");

const projectDir = (args && args.projectDir) || ".";
const milestone  = (args && args.milestone)  || null;
const skipUltra  = (args && args.skipUltra)  || false;
const skipUltraReason = (args && args.skipUltraReason) || null;

// 4.8-audit fix: skipUltra requires a recorded reason per
// orthogonal-validation-contract.md Rule #2. Refuse without one.
if (skipUltra && !skipUltraReason) {
  log("verify: args.skipUltra=true requires args.skipUltraReason: string (per contract Rule #2)");
  return { status: "failed", reason: "skipUltra-without-reason" };
}

// ───── Schemas ─────

const REVIEW_ULTRA_SCHEMA = {
  type: "object",
  required: ["category", "findings"],
  additionalProperties: false,
  properties: {
    category: { const: "correctness-and-cleanup" },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "file", "summary"],
        properties: {
          severity:    { type: "string", enum: ["important", "nit", "pre-existing"] },
          file:        { type: "string" },
          line:        { type: "integer" },
          summary:     { type: "string" },
          suggestion:  { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const RED_TEAM_SCHEMA = {
  type: "object",
  required: ["category", "verdict", "bugs"],
  additionalProperties: false,
  properties: {
    category: { const: "adversarial-security-boundaries" },
    verdict:  { type: "string", enum: ["FAIL", "GRUDGING-PASS"] },
    bugs: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "title", "lens"],
        properties: {
          severity: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
          title:    { type: "string" },
          lens:     { type: "string" },
          file:     { type: "string" },
          repro:    { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const QA_SCHEMA = {
  type: "object",
  required: ["category", "suiteResult", "shallowTests", "contractCompliance"],
  additionalProperties: false,
  properties: {
    category:    { const: "test-mechanics-and-compliance" },
    suiteResult: {
      type: "object",
      required: ["pass", "fail"],
      properties: {
        pass:    { type: "integer" },
        fail:    { type: "integer" },
        skipped: { type: "integer" },
      },
    },
    shallowTests: {
      type: "array",
      items: {
        type: "object",
        required: ["file", "test", "reason"],
        properties: {
          file:   { type: "string" },
          test:   { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    contractCompliance: {
      type: "object",
      required: ["compliant", "violations"],
      properties: {
        compliant:  { type: "boolean" },
        violations: { type: "array", items: { type: "string" } },
      },
    },
    notes: { type: "string" },
  },
};

const VERDICT_SCHEMA = {
  type: "object",
  required: ["overallVerdict", "summary"],
  additionalProperties: false,
  properties: {
    overallVerdict: { type: "string", enum: ["VERIFIED", "VERIFIED-WITH-WARNINGS", "VERIFY-FAILED"] },
    summary:        { type: "string" },
    blockingFindings: { type: "array", items: { type: "string" } },
  },
};

// ───── Script body ─────

if (!milestone) {
  log("verify: args.milestone required");
  return { status: "failed", reason: "missing-milestone" };
}

phase("Preflight");
const pre = lib.runPreflight({ projectDir });
if (!pre.ok) {
  log(`preflight FAIL — halting verify`);
  return { status: "failed", reason: "preflight-failed", preflight: pre.envelope };
}
const brief = lib.generateBrief({ kind: "verify", milestone, projectDir });

phase("Verify-Gate");
const vg = lib.runVerifyGate({ projectDir });
if (!vg.ok) {
  log(`verify-gate FAIL exitCode=${vg.exitCode} — halting before triad`);
  return {
    status: "verify-gate-failed",
    overallVerdict: "VERIFY-FAILED",
    verifyGate: vg.envelope,
  };
}
log(`verify-gate green`);

// ─── M57 CI-Parity Gate (FAIL-blocking) ───────────────────────────────────
// Per commands/gsd-t-verify.md Step 2.6 + cli-build-coverage-contract.md +
// ci-parity-contract.md. NEITHER track is currently inside verify-gate.cjs.
// Origin: TimeTracking v1.10.12 shipped VERIFIED+tagged with a new dir absent
// from Dockerfile COPY — silent CI-divergence regression. M57 made this gate
// mandatory; Workflow MUST preserve it or we re-introduce that exact failure.
// Detected by user/worker in parallel session 2026-05-29 13:00.
phase("CI-Parity");
const { spawnSync } = require("child_process");
function _runJsonCli(subcmd, argv = []) {
  // Use _lib-style resolution — prefer project-local bin/<tool>.cjs
  const fsMod = require("fs");
  const pMod = require("path");
  const localMap = {
    "build-coverage": "gsd-t-build-coverage.cjs",
    "ci-parity":      "gsd-t-ci-parity.cjs",
    "test-data":      "gsd-t-test-data-ledger.cjs",
  };
  const local = pMod.join(projectDir, "bin", localMap[subcmd] || "");
  const cmd = fsMod.existsSync(local) ? process.execPath : "gsd-t";
  const args = fsMod.existsSync(local) ? [local, ...argv] : [subcmd, ...argv];
  const r = spawnSync(cmd, args, { cwd: projectDir, stdio: "pipe" });
  let envelope = null;
  try { envelope = r.stdout ? JSON.parse(r.stdout.toString()) : null; } catch (_) {}
  return {
    ok: r.status === 0,
    exitCode: r.status,
    envelope,
    stderr: r.stderr && r.stderr.toString(),
  };
}
const bc = _runJsonCli("build-coverage", ["--json"]);
if (!bc.ok) {
  log(`M57 build-coverage FAIL exitCode=${bc.exitCode} — halting (FAIL-blocking)`);
  return { status: "ci-parity-failed", overallVerdict: "VERIFY-FAILED", buildCoverage: bc.envelope };
}
const cip = _runJsonCli("ci-parity", ["--json"]);
if (!cip.ok) {
  log(`M57 ci-parity FAIL exitCode=${cip.exitCode} — halting (FAIL-blocking)`);
  return { status: "ci-parity-failed", overallVerdict: "VERIFY-FAILED", ciParity: cip.envelope };
}
log(`M57 CI-parity gate green`);

// ─── M58 Test-Data Purge Gate (FAIL-blocking) ─────────────────────────────
// Per commands/gsd-t-verify.md Step 4.5 + test-data-tagging-contract.md v1.1.0.
// Origin: GSD-T-Board v0.1.10 shipped VERIFIED with 2442 E2E_TEST_* orphans
// live in production data. M58 made post-E2E purge mandatory; M60 hardened
// the adapters against empty-prefix bypass. Workflow MUST preserve.
phase("Test-Data Purge");
const verifyRunId = `verify-${milestone || "M??"}-${Date.now().toString(36)}`;
const td = _runJsonCli("test-data", ["--purge", "--run", verifyRunId, "--json"]);
if (!td.ok) {
  log(`M58 test-data purge FAIL exitCode=${td.exitCode} — halting (FAIL-blocking)`);
  return { status: "test-data-purge-failed", overallVerdict: "VERIFY-FAILED", testDataPurge: td.envelope };
}
log(`M58 test-data purge green — proceeding to orthogonal triad`);

phase("Orthogonal Triad");

const briefRef = brief.briefPath || "(brief generation failed — re-walk repo)";

// Load the methodology protocols KEPT in templates/prompts/. The protocol body
// IS the methodology — Workflow just hosts the agent() call.
const redTeamProtocol = lib.loadProtocol("red-team");
const qaProtocol = lib.loadProtocol("qa");

const stages = [
  // Stage A — /code-review ultra (cooperative correctness + cleanup)
  // Per orthogonal-validation-contract.md: this finds bugs+cleanups in the
  // "build it right" lens. NEVER substitutes for Red Team.
  !skipUltra && (() => agent(
    [
      `You are running a /code-review ultra cooperative pass for milestone \`${milestone}\`.`,
      ``,
      `**Brief (REQUIRED):** ${briefRef}`,
      ``,
      `Per .gsd-t/contracts/orthogonal-validation-contract.md, your scope is`,
      `**correctness + cleanup** — reuse, simplification, efficiency, altitude cleanups.`,
      `You are COOPERATIVE — assume the code is being built in good faith. You are`,
      `NOT looking for adversarial security bugs (Red Team's job) or test-mechanics`,
      `issues (QA's job). Report only findings in your category.`,
      ``,
      `Severity: "important" (must-fix bugs), "nit" (style/clarity), "pre-existing"`,
      `(out of milestone scope but worth flagging).`,
      ``,
      `Return JSON per the schema.`,
    ].join("\n"),
    { label: "code-review-ultra", phase: "Orthogonal Triad", schema: REVIEW_ULTRA_SCHEMA, model: "opus" }
  )),

  // Stage B — Red Team (adversarial / security / boundaries)
  () => agent(
    [
      `You are the Red Team adversarial validator for milestone \`${milestone}\`.`,
      ``,
      `**Brief (REQUIRED):** ${briefRef}`,
      ``,
      `Per .gsd-t/contracts/orthogonal-validation-contract.md, your scope is`,
      `**adversarial / security / boundaries**. You are NOT cooperative — your`,
      `success is measured in bugs FOUND, not tests passed. Try to break the code.`,
      ``,
      `Run the Red Team protocol:`,
      "----- BEGIN RED TEAM PROTOCOL -----",
      redTeamProtocol.slice(0, 8000),
      "----- END RED TEAM PROTOCOL -----",
      ``,
      `Verdict is FAIL if you found any CRITICAL or HIGH severity bug; GRUDGING-PASS`,
      `if you searched exhaustively and found nothing. Return JSON per the schema.`,
    ].join("\n"),
    { label: "red-team", phase: "Orthogonal Triad", schema: RED_TEAM_SCHEMA, model: "opus" }
  ),

  // Stage C — QA (test execution + shallow-test detection + contract compliance)
  () => agent(
    [
      `You are the QA validator for milestone \`${milestone}\`.`,
      ``,
      `**Brief (REQUIRED):** ${briefRef}`,
      ``,
      `Per .gsd-t/contracts/orthogonal-validation-contract.md, your scope is`,
      `**test mechanics + contract compliance**. Run the test suite. Report pass/fail/skip`,
      `counts. Detect shallow tests (layout-only assertions that pass on an empty HTML page).`,
      `Verify contract compliance against .gsd-t/contracts/.`,
      ``,
      `Run the QA protocol:`,
      "----- BEGIN QA PROTOCOL -----",
      qaProtocol.slice(0, 8000),
      "----- END QA PROTOCOL -----",
      ``,
      `Return JSON per the schema.`,
    ].join("\n"),
    { label: "qa", phase: "Orthogonal Triad", schema: QA_SCHEMA, model: "sonnet" }
  ),
].filter(Boolean);

const triadResults = await parallel(stages);

phase("Synthesis");
const synthesisPrompt = [
  `You are the synthesis agent. Three orthogonal validators have run.`,
  `**Do NOT collapse categories**: a Red Team CRITICAL is not the same as a`,
  `/code-review ultra "important" finding. Per orthogonal-validation-contract.md,`,
  `they're declared orthogonal objective functions and must stay distinct in the report.`,
  ``,
  `Validator results:`,
  "```json",
  JSON.stringify(triadResults, null, 2),
  "```",
  ``,
  `Compute the overall verdict per orthogonal-validation-contract.md v1.0.0:`,
  `- VERIFIED iff: Red Team verdict=GRUDGING-PASS AND QA suiteResult.fail=0 AND QA shallowTests=[] AND QA contractCompliance.compliant=true AND code-review ultra ran AND has no "important" findings. **skipUltra=${skipUltra} → ${skipUltra ? "INELIGIBLE for VERIFIED (skipUltra=true downgrades to VERIFIED-WITH-WARNINGS at best per Rule #2)" : "eligible"}.**`,
  `- VERIFIED-WITH-WARNINGS if: Red Team GRUDGING-PASS, QA suite green, contracts compliant, AND any of: code-review ultra has "important" findings, OR skipUltra=true (reason: ${skipUltraReason || "(none — would have failed above)"}), OR QA shallowTests.length === 1 (single non-core).`,
  `- VERIFY-FAILED otherwise (Red Team FAIL, QA fail>0, contract violations>0, shallowTests ≥ 2 or in core paths).`,
  ``,
  `Return JSON per VERDICT_SCHEMA with blockingFindings listing concrete things that must fix.`,
].join("\n");

const verdict = await agent(synthesisPrompt, {
  label: "synthesis",
  phase: "Synthesis",
  schema: VERDICT_SCHEMA,
  model: "opus",
});

return {
  status: verdict.overallVerdict === "VERIFY-FAILED" ? "failed" : "complete",
  overallVerdict: verdict.overallVerdict,
  verifyGate: vg.envelope,
  buildCoverage: bc.envelope,
  ciParity: cip.envelope,
  testDataPurge: td.envelope,
  triad: triadResults,
  verdict,
};
