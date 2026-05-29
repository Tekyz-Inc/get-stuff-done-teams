// templates/workflows/gsd-t-quick.workflow.js
//
// Runtime: Anthropic native Workflow tool only.
// Quick — small one-shot task with contract awareness.
// preflight + brief + agent(task) + verify-gate (light)
//
// args: { task, projectDir?, model? }

export const meta = {
  name: "gsd-t-quick",
  description: "Fast single-task execution with brief, preflight, and verify-gate",
  phases: [
    { title: "Preflight", detail: "preflight + brief" },
    { title: "Execute",   detail: "single-agent task" },
    { title: "Verify",    detail: "verify-gate" },
  ],
};

const lib = require("./_lib.js");

const projectDir = (args && args.projectDir) || ".";
const task = (args && args.task) || null;
const model = (args && args.model) || "sonnet";

const QUICK_SCHEMA = {
  type: "object",
  required: ["status", "filesEdited"],
  properties: {
    status:      { type: "string", enum: ["complete", "partial", "blocked", "failed"] },
    filesEdited: { type: "array", items: { type: "string" } },
    summary:     { type: "string" },
  },
};

if (!task) {
  log("quick: args.task required");
  return { status: "failed", reason: "no-task" };
}

phase("Preflight");
const pre = lib.runPreflight({ projectDir });
if (!pre.ok) return { status: "failed", reason: "preflight-failed", preflight: pre.envelope };
const brief = lib.generateBrief({ kind: "execute", projectDir });

phase("Execute");
const result = await agent(
  [
    `Quick task: ${task}`,
    `**Brief:** ${brief.briefPath || "(no brief)"}`,
    ``,
    `Constraints from CLAUDE.md:`,
    `- SIMPLICITY ABOVE ALL — minimal change`,
    `- Check downstream effects before changing existing code`,
    `- Run affected tests before reporting done`,
    `- Update relevant docs in the same commit`,
    ``,
    `Commit with prefix "m61(quick)". Return JSON per the schema.`,
  ].join("\n"),
  { label: "quick", phase: "Execute", schema: QUICK_SCHEMA, model }
).catch((e) => ({ status: "failed", filesEdited: [], summary: `agent error: ${e && e.message}` }));

if (result.status === "failed" || result.status === "blocked") {
  return { status: result.status, result };
}

phase("Verify");
const vg = lib.runVerifyGate({ projectDir });
return {
  status: vg.ok ? "complete" : "verify-failed",
  result,
  verifyGate: vg.envelope,
};
