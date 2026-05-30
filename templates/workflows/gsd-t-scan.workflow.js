// templates/workflows/gsd-t-scan.workflow.js
//
// Runtime: Anthropic native Workflow tool only (not standalone-Node parseable).
// Globals provided by runtime: agent, parallel, pipeline, log, phase, budget, args.
// Top-level await + return are runtime-legal in that context.
//
// Canonical native-Workflow implementation of the GSD-T scan phase.
//
// WHY THIS EXISTS (M66): the legacy commands/gsd-t-scan.md was the ONLY major
// phase never migrated to a Workflow. It hard-coded exactly 5 teammates (one per
// DIMENSION: architecture/business-rules/security/quality/contracts) with ZERO
// volume scaling — a 5-file repo and a 1,809-file repo both got 5 agents. A single
// `quality` agent asked to cover dead-code+dup+complexity+errors+perf+test-gaps
// across the whole codebase samples ~5 issues and stops. That produced a cursory
// 16-item register on a codebase whose deep scan surfaced 117 findings.
// It also referenced a retired `autoSpawnHeadless()` + `headless-default-contract
// v2.0.0` that no longer exist post-M61/M65.
//
// THE FIX: fan out by codebase VOLUME, not by a fixed dimension count.
//   preflight → volume-probe (derive per-AREA slice list) →
//   pipeline( slice → deep-finder "enumerate, do not sample" → single verify ) →
//   archive prior register → synthesis (dedup/merge/re-rank, continue TD numbering) →
//   deterministic bin/scan-*.js stages (schema / diagrams / HTML report).
//
// The number of finders scales with the slice list the probe derives, and slice
// DEPTH scales with budget.total when a turn target is set. KEEPS the brains:
// preflight + the deterministic bin/scan-*.js renderers.
//
// args shape:
//   {
//     projectDir: ".",          // optional — the project to scan
//     scanNumber: 12,           // optional — for the register header
//     maxSlicesHint: 40,        // optional — soft cap on derived slices
//     verify: "single",         // optional — "single" (default) | "none"
//   }

export const meta = {
  name: "gsd-t-scan",
  description:
    "GSD-T scan phase: preflight → volume-probe → pipeline(deep-finder per slice → single verify) → archive → synthesis → deterministic schema/diagram/HTML stages. Fans out by codebase volume, not a fixed 5-teammate dimension count.",
  phases: [
    { title: "Preflight",   detail: "preflight + load prior register" },
    { title: "Probe",       detail: "volume probe → derive per-area slice list", model: "haiku" },
    { title: "Deep Scan",   detail: "pipeline: per-slice deep finder → single verify" },
    { title: "Synthesis",   detail: "dedup / merge / re-rank into techdebt.md", model: "opus" },
    { title: "Render",      detail: "schema extraction + diagrams + HTML report" },
  ],
};

const lib = require("./_lib.js");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectDir   = (args && args.projectDir) || ".";
const scanNumber   = (args && args.scanNumber) || null;
const maxSlicesHint = (args && args.maxSlicesHint) || 40;
const verifyMode   = (args && args.verify) || "single"; // "single" | "none"

// ───── Schemas ──────────────────────────────────────────────────────────────

// Probe output: a list of slices to fan out over. Each slice is one narrow area
// of the codebase a single deep-finder agent can exhaustively own.
const PROBE_SCHEMA = {
  type: "object",
  required: ["totals", "slices"],
  additionalProperties: false,
  properties: {
    totals: {
      type: "object",
      additionalProperties: true,
      description: "Headline counts: files, routes, tables, components, testFiles, topLevelDirs.",
    },
    slices: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["key", "paths", "dimension"],
        additionalProperties: false,
        properties: {
          key:       { type: "string", description: "kebab slice id, e.g. 'lib-billing' or 'routes-tenant-scoping'" },
          paths:     { type: "array", items: { type: "string" }, description: "globs/dirs this slice exhaustively owns" },
          dimension: {
            type: "string",
            enum: ["architecture", "business-rules", "security", "quality", "contracts", "feature-domain", "data-layer", "api-surface", "testing"],
          },
          why:       { type: "string", description: "what makes this slice worth a dedicated deep finder" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const FINDER_SCHEMA = {
  type: "object",
  required: ["slice", "findings"],
  additionalProperties: false,
  properties: {
    slice: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "severity", "area", "files", "detail", "recommendation"],
        additionalProperties: false,
        properties: {
          title:          { type: "string" },
          severity:       { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
          area:           { type: "string", description: "human area label, e.g. 'Multi-tenant isolation'" },
          files:          { type: "array", items: { type: "string" } },
          detail:         { type: "string" },
          impact:         { type: "string" },
          recommendation: { type: "string" },
          confidence:     { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    notes: { type: "string" },
  },
};

const VERIFY_SCHEMA = {
  type: "object",
  required: ["confirmed", "verdict"],
  additionalProperties: false,
  properties: {
    confirmed: { type: "boolean", description: "true if the finding is real after checking the actual code" },
    verdict:   { type: "string", enum: ["confirmed", "false-positive", "needs-detail"] },
    note:      { type: "string" },
    correctedSeverity: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
  },
};

const SYNTHESIS_SCHEMA = {
  type: "object",
  required: ["status", "registerPath", "counts"],
  additionalProperties: false,
  properties: {
    status:       { type: "string", enum: ["written", "failed"] },
    registerPath: { type: "string" },
    counts: {
      type: "object",
      required: ["critical", "high", "medium", "low"],
      properties: {
        critical: { type: "integer" },
        high:     { type: "integer" },
        medium:   { type: "integer" },
        low:      { type: "integer" },
        total:    { type: "integer" },
      },
    },
    archivePath:  { type: "string" },
    notes:        { type: "string" },
  },
};

// ───── Local-bin resolution for the deterministic bin/scan-*.js renderers ─────
// Mirrors verify.workflow.js::_runJsonCli — prefer project-local bin/, the scan
// renderers live in the GSD-T package bin/ which is the project root here.
function _runNode(scriptRelPath, evalExpr, argv = []) {
  const local = path.join(projectDir, scriptRelPath);
  if (!fs.existsSync(local)) return { ok: false, exitCode: 127, stderr: `missing ${scriptRelPath}` };
  const r = spawnSync(process.execPath, ["-e", evalExpr, ...argv], { cwd: projectDir, stdio: "pipe" });
  return {
    ok: r.status === 0,
    exitCode: r.status,
    stdout: r.stdout && r.stdout.toString(),
    stderr: r.stderr && r.stderr.toString(),
  };
}

// ───── Script body ────────────────────────────────────────────────────────────

phase("Preflight");
const pre = lib.runPreflight({ projectDir });
if (!pre.ok) {
  log(`preflight FAIL exitCode=${pre.exitCode} — halting scan`);
  return { status: "failed", reason: "preflight-failed", preflight: pre.envelope };
}
log("preflight OK");

// Load prior register (for dedup + TD-numbering continuation) — read-only here;
// the synthesis stage performs the archive + rewrite.
let priorRegister = null;
const registerPath = path.join(projectDir, ".gsd-t", "techdebt.md");
if (fs.existsSync(registerPath)) {
  priorRegister = fs.readFileSync(registerPath, "utf8");
  log(`prior register found (${priorRegister.length} bytes) — will dedup + continue TD numbering`);
}

// ─── Volume probe — derive the slice list (this is the fix for the 5-teammate cap) ───
phase("Probe");
const probePrompt = [
  `You are the VOLUME PROBE for a GSD-T deep codebase scan of \`${projectDir}\`.`,
  ``,
  `Your job: measure the codebase's volume, then carve it into NARROW SLICES — one`,
  `slice per area that a single deep-finder agent can EXHAUSTIVELY own. The number`,
  `of slices MUST scale with volume: a tiny repo yields 1-3 slices; a large repo`,
  `(thousands of files, hundreds of routes/tables, many feature domains) yields`,
  `15-40. Do NOT default to a fixed 5 — that under-scaling is exactly the bug M66 fixes.`,
  ``,
  `How to slice (combine these axes — prefer FEATURE-DOMAIN slicing for large apps):`,
  `- By feature domain: each major business area (e.g. billing, scheduling, dispatch,`,
  `  work-orders, LMS, maintenance, integrations) is its own slice, owned end-to-end.`,
  `- By layer where a layer is huge: routes/API surface, data/schema layer, the`,
  `  largest component trees, async jobs/queues.`,
  `- By cross-cutting concern: tenant-isolation, secrets/config, auth, rate-limiting.`,
  `Each slice names the concrete \`paths\` (dirs/globs) it owns and a \`dimension\`.`,
  ``,
  `Use real tooling to measure: count files by extension, count route modules,`,
  `count ORM table definitions (e.g. pgTable/Entity/model), count components, list`,
  `top-level source dirs and their subdirs. Read package.json for the stack. If a`,
  `single dir (e.g. src/lib/) has many independent subdirs, each substantial subdir`,
  `is a candidate slice.`,
  ``,
  `Soft cap: aim for ≤ ${maxSlicesHint} slices. If volume genuinely exceeds that,`,
  `merge the smallest related areas but state in notes what you merged so depth loss`,
  `is visible (no silent truncation).`,
  ``,
  `Return JSON per the schema: totals (headline counts) + slices (the fan-out list).`,
].join("\n");

const probe = await agent(probePrompt, {
  label: "volume-probe",
  phase: "Probe",
  schema: PROBE_SCHEMA,
  model: "haiku",
});

const slices = (probe && Array.isArray(probe.slices) && probe.slices) || [];
if (!slices.length) {
  log("probe returned no slices — halting (cannot scan with an empty slice list)");
  return { status: "failed", reason: "no-slices", probe };
}
log(`probe derived ${slices.length} slice(s) from totals=${JSON.stringify(probe.totals)}`);

// budget-aware depth hint: with a larger turn target, finders are told to dig deeper.
const deep = budget && budget.total && budget.total > 300000 ? "MAXIMUM" : "thorough";

// ─── Deep scan — pipeline: per-slice deep finder → single verify (no barrier) ───
// pipeline() runs each slice through both stages independently: slice A can be in
// verify while slice B is still finding. Wall-clock = slowest single chain.
phase("Deep Scan");
const sliceResults = await pipeline(
  slices,
  // Stage 1 — deep finder. One agent OWNS one slice and enumerates exhaustively.
  (slice) => agent(
    [
      `You are a DEEP tech-debt finder for ONE slice of a GSD-T scan: \`${slice.key}\`.`,
      `Dimension: ${slice.dimension}. Owned paths: ${JSON.stringify(slice.paths)}.`,
      slice.why ? `Why this slice matters: ${slice.why}` : ``,
      ``,
      `MANDATE: ENUMERATE, do NOT sample. Walk EVERY file under your owned paths.`,
      `The legacy scan failed because one agent sampled the top ~5 issues across the`,
      `whole repo and stopped. You own only this slice, so go to the bottom of it —`,
      `${deep} depth. Surface every real defect: bugs, security holes, missing`,
      `validation, broken invariants, race conditions, dead/duplicated code, N+1s,`,
      `untested critical paths, contract drift, and domain-specific correctness flaws`,
      `(e.g. money math, state-machine gaps, timezone bugs, idempotency holes).`,
      ``,
      `For each finding give: title, severity (CRITICAL/HIGH/MEDIUM/LOW), a human area`,
      `label, concrete file:line refs, the detail, the impact, and a remediation.`,
      `Set confidence honestly. Prefer specificity over volume — but do not stop`,
      `early. If the slice is genuinely clean, return an empty findings array.`,
      ``,
      `Return JSON per the schema.`,
    ].filter(Boolean).join("\n"),
    { label: `find:${slice.key}`, phase: "Deep Scan", schema: FINDER_SCHEMA, model: "sonnet" }
  ),
  // Stage 2 — single verify pass (per user decision: single, not 3-vote).
  // Confirms each finding against the ACTUAL code; drops false positives.
  async (finderResult, slice) => {
    if (!finderResult || !Array.isArray(finderResult.findings)) {
      return { slice: slice.key, findings: [] };
    }
    if (verifyMode === "none" || finderResult.findings.length === 0) {
      return { slice: slice.key, findings: finderResult.findings || [] };
    }
    const verified = await parallel(
      finderResult.findings.map((f) => async () => {
        try {
          const v = await agent(
            [
              `You are a VERIFIER for one tech-debt finding. Confirm it against the ACTUAL code — do not trust the finder.`,
              `Open the referenced files and check the claim is real and correctly characterized.`,
              ``,
              `Finding: ${JSON.stringify(f)}`,
              ``,
              `Set confirmed=true only if the defect genuinely exists. If the finder`,
              `misread the code, return verdict="false-positive". If real but the`,
              `severity is wrong, set correctedSeverity. If real but underspecified,`,
              `verdict="needs-detail" (still kept). Return JSON per the schema.`,
            ].join("\n"),
            { label: `verify:${slice.key}`, phase: "Deep Scan", schema: VERIFY_SCHEMA, model: "sonnet" }
          );
          if (!v || v.verdict === "false-positive" || v.confirmed === false) return null;
          return { ...f, severity: v.correctedSeverity || f.severity, _verify: v.verdict };
        } catch (e) {
          // verify errored — keep the finding flagged rather than silently drop it
          return { ...f, _verify: "verify-errored" };
        }
      })
    );
    return { slice: slice.key, findings: verified.filter(Boolean), notes: finderResult.notes };
  }
);

const allFindings = sliceResults
  .filter(Boolean)
  .flatMap((r) => (r.findings || []).map((f) => ({ ...f, slice: r.slice })));
log(`deep scan complete: ${allFindings.length} verified findings across ${sliceResults.filter(Boolean).length} slices`);

// ─── Synthesis — archive prior register, dedup/merge/re-rank, write fresh register ───
phase("Synthesis");
const synthesisPrompt = [
  `You are the SYNTHESIS agent for a GSD-T deep scan of \`${projectDir}\`.`,
  `${slices.length} slices ran; ${allFindings.length} verified findings came back.`,
  ``,
  priorRegister
    ? [
        `A prior register exists at \`.gsd-t/techdebt.md\`. FIRST archive it:`,
        `determine its scan date from the header (fallback: today), rename to`,
        `\`.gsd-t/techdebt_YYYY-MM-DD.md\` (append _2, _3 on same-day collision),`,
        `then find the highest existing TD-NNN and CONTINUE numbering from there.`,
        `DEDUPLICATE: do not re-add a finding already represented in the prior register;`,
        `cross-reference instead.`,
      ].join("\n")
    : `No prior register — start TD numbering at TD-01.`,
  ``,
  `Verified findings:`,
  "```json",
  JSON.stringify(allFindings, null, 2),
  "```",
  ``,
  `Write a FRESH \`.gsd-t/techdebt.md\` (use the Write tool). Structure per the GSD-T`,
  `register format: a Summary table (CRITICAL/HIGH/MEDIUM/LOW counts), then sections`,
  `Critical → High → Medium → Low, each finding as \`### TD-NNN — {title}\` with`,
  `Area / Severity / Status: OPEN / Location (file:line) / Description / Impact /`,
  `Remediation / Milestone candidate fields. Re-rank globally by true severity, not`,
  `by slice order. De-duplicate findings that multiple slices surfaced (e.g. a`,
  `cross-cutting tenant-scoping gap) into one item that lists all locations.`,
  ``,
  `Do NOT express effort in human-hours/days/sprints — GSD-T units only (domain/`,
  `wave/spawn/token-spend) per the effort-estimates rule. Then commit the new`,
  `register + any archive via git. Return JSON per the schema with the final counts.`,
].join("\n");

const synthesis = await agent(synthesisPrompt, {
  label: "synthesis",
  phase: "Synthesis",
  schema: SYNTHESIS_SCHEMA,
  model: "opus",
});

if (!synthesis || synthesis.status !== "written") {
  log("synthesis did not write the register — halting before render");
  return { status: "failed", reason: "synthesis-failed", synthesis, findingCount: allFindings.length };
}
log(`register written: ${JSON.stringify(synthesis.counts)}`);

// ─── Render — deterministic schema extraction + diagrams + HTML report ───
// These bin/scan-*.js renderers are KEPT verbatim (M66 does not touch them).
phase("Render");
const renderExpr = `
const {collectScanData}=require('./bin/scan-data-collector.js');
const {extractSchema}=require('./bin/scan-schema.js');
const {generateDiagrams}=require('./bin/scan-diagrams.js');
const {generateReport}=require('./bin/scan-report.js');
const root=process.argv[1];
const analysisData=collectScanData(root);
const schemaData=extractSchema(root);
const diagrams=generateDiagrams(analysisData, schemaData, {projectRoot:root});
const r=generateReport(analysisData, schemaData, diagrams, {projectRoot:root});
if (r.outputPath) console.log(JSON.stringify({outputPath:r.outputPath, diagramsRendered:r.diagramsRendered}));
else console.error('report-failed:', r.error);
`;
const render = _runNode("bin/scan-report.js", renderExpr, [projectDir]);
if (render.ok) {
  log(`HTML report: ${render.stdout && render.stdout.trim()}`);
} else {
  // Non-fatal — the register is the primary artifact; the report is a nicety.
  log(`render stage non-fatal failure (exitCode=${render.exitCode}): ${render.stderr || render.stdout}`);
}

return {
  status: "complete",
  slices: slices.length,
  findings: allFindings.length,
  counts: synthesis.counts,
  registerPath: synthesis.registerPath || registerPath,
  archivePath: synthesis.archivePath || null,
  htmlReport: render.ok ? (render.stdout || "").trim() : null,
  probeTotals: probe.totals,
};
