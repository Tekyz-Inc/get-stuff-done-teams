// templates/workflows/gsd-t-debug.workflow.js
//
// Runtime: Anthropic native Workflow tool only.
// Debug phase — up to 2 fix cycles per CLAUDE.md Prime Rule. If still failing
// after 2 cycles, exit with `needs-human` so the human operator can step in.
//
// args: { symptom, projectDir? }

export const meta = {
  name: "gsd-t-debug",
  description: "Diagnose and fix a failing test or runtime error (up to 2 attempts)",
  phases: [
    { title: "Preflight",  detail: "preflight + brief" },
    { title: "Cycle 1",    detail: "diagnose + propose + apply + verify" },
    { title: "Cycle 2",    detail: "if cycle 1 didn't resolve" },
  ],
};

const lib = require("./_lib.js");

const projectDir = (args && args.projectDir) || ".";
const symptom = (args && args.symptom) || null;

const DEBUG_CYCLE_SCHEMA = {
  type: "object",
  required: ["resolved", "rootCause", "filesEdited"],
  properties: {
    resolved:     { type: "boolean" },
    rootCause:    { type: "string" },
    filesEdited:  { type: "array", items: { type: "string" } },
    testRunResult: {
      type: "object",
      properties: { pass: { type: "integer" }, fail: { type: "integer" } },
    },
    nextStepsIfNotResolved: { type: "string" },
  },
};

if (!symptom) {
  log("debug: args.symptom required (description of failing test or error)");
  return { status: "failed", reason: "no-symptom" };
}

phase("Preflight");
const pre = lib.runPreflight({ projectDir });
if (!pre.ok) return { status: "failed", reason: "preflight-failed", preflight: pre.envelope };
const brief = lib.generateBrief({ kind: "execute", projectDir });

let lastResult = null;
for (let cycle = 1; cycle <= 2; cycle++) {
  phase(`Cycle ${cycle}`);
  const prompt = [
    `Debug cycle ${cycle} of 2. Symptom: ${symptom}`,
    `**Brief:** ${brief.briefPath || "(no brief)"}`,
    cycle > 1 && lastResult
      ? `\nPREVIOUS CYCLE'S ROOT CAUSE HYPOTHESIS (did not resolve the issue):\n${lastResult.rootCause}\nFiles edited: ${lastResult.filesEdited.join(", ")}\nIf the hypothesis was right, the fix was incomplete. If wrong, formulate a different hypothesis.`
      : "",
    ``,
    `Steps: (1) read the relevant code, (2) form a hypothesis, (3) apply a fix, (4) run the affected test(s), (5) report.`,
    `Commit the fix with prefix "m61(debug-cycle${cycle})".`,
    `Return JSON per the schema.`,
  ].filter(Boolean).join("\n");

  lastResult = await agent(prompt, {
    label: `debug-cycle-${cycle}`,
    phase: `Cycle ${cycle}`,
    schema: DEBUG_CYCLE_SCHEMA,
    model: "opus",
  }).catch((e) => ({
    resolved: false,
    rootCause: `agent error: ${e && e.message}`,
    filesEdited: [],
    nextStepsIfNotResolved: "agent threw — investigate directly",
  }));

  if (lastResult.resolved) {
    return { status: "complete", cyclesUsed: cycle, finalResult: lastResult };
  }
}

return {
  status: "needs-human",
  cyclesUsed: 2,
  finalResult: lastResult,
  nextSteps: lastResult.nextStepsIfNotResolved || "Two fix cycles exhausted; human review required.",
};
