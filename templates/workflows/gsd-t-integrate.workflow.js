// templates/workflows/gsd-t-integrate.workflow.js
//
// Runtime: Anthropic native Workflow tool only.
// Integrate phase — runs after parallel domains have committed their work.
// Cross-domain wire-up + lightweight verify-gate sanity check.
//
// args: { milestone, domains: [...], projectDir? }

export const meta = {
  name: "gsd-t-integrate",
  description: "Cross-domain integration after parallel workers complete",
  phases: [
    { title: "Preflight",   detail: "preflight + brief" },
    { title: "Integrate",   detail: "cross-domain wire-up" },
    { title: "Verify-Gate", detail: "quick verify-gate" },
  ],
};

const lib = require("./_lib.js");

const projectDir = (args && args.projectDir) || ".";
const milestone  = (args && args.milestone) || null;
const domains    = (args && args.domains) || [];

const INTEGRATE_SCHEMA = {
  type: "object",
  required: ["status", "crossDomainEdits"],
  properties: {
    status:           { type: "string", enum: ["green", "warnings", "failed"] },
    crossDomainEdits: { type: "array", items: { type: "string" } },
    notes:            { type: "string" },
  },
};

if (!milestone || !domains.length) {
  log("integrate: args.milestone and args.domains required");
  return { status: "failed", reason: "missing-args" };
}

phase("Preflight");
const pre = lib.runPreflight({ projectDir });
if (!pre.ok) return { status: "failed", reason: "preflight-failed", preflight: pre.envelope };
const brief = lib.generateBrief({ kind: "execute", milestone, projectDir });

phase("Integrate");
const integrate = await agent(
  [
    `You are the integration agent for milestone \`${milestone}\`. Domains complete: ${domains.join(", ")}.`,
    `**Brief:** ${brief.briefPath || "(no brief — re-walk repo)"}`,
    ``,
    `Read .gsd-t/contracts/${milestone ? milestone.toLowerCase() : ""}-integration-points.md if present.`,
    `Resolve any shared-file edits sequenced at integrate (per "Cross-Domain File Contention Matrix").`,
    `Update cross-domain contracts as needed.`,
    `Commit cross-domain edits with a clear "m61(integrate)" prefix.`,
    ``,
    `Return JSON per the schema.`,
  ].join("\n"),
  { label: "integrate", phase: "Integrate", schema: INTEGRATE_SCHEMA, model: "sonnet" }
).catch((e) => ({ status: "failed", crossDomainEdits: [], notes: `agent error: ${e && e.message}` }));

if (integrate.status === "failed") {
  return { status: "failed", reason: "integrate-failed", integrate };
}

phase("Verify-Gate");
const vg = lib.runVerifyGate({ projectDir });
return {
  status: vg.ok ? "complete" : "verify-failed",
  integrate,
  verifyGate: vg.envelope,
};
