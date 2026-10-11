// templates/workflows/gsd-t-debug.workflow.js
//
// Runtime: Anthropic native Workflow tool only.
// Debug phase — up to 2 fix cycles per CLAUDE.md Prime Rule. If still failing
// after 2 cycles, exit with `needs-human` so the human operator can step in.
// The 2-cycle cap IS the loop below; there is no third cycle.
//
// M94-D11 WRITER pattern (graph-consumer-wiring-contract.md §WRITER Pattern):
// READER half: before the fix agent, query blast-radius + who-calls to localize the
// bug's call chain (where does this symptom reach / what calls the failing function) —
// replaces grep-reconstructed call-chain discovery. The graph slice is injected into
// the debug cycle agent's context so it doesn't need to grep.
// WRITER half: after the fix lands (filesEdited), trigger a re-index of the touched
// set — the freshness_check_on_query (graph-freshness-contract.md D4) re-indexes any
// content-hash-dirty file before answering the next structural query, so downstream
// consumers see fresh edges after the debug fix.
// FAIL-LOUD invariant: on graph-unavailable the graph-query step surfaces the message
// "graph unavailable — fix it (gsd-t graph status)" and halts — it does NOT fall back
// to grep for the structural question. The existing 2-cycle debug logic is NOT disrupted.
// [RULE] debug-reader-and-writer-both
//
// args: { symptom, projectDir? }

export const meta = {
  name: "gsd-t-debug",
  description: "Diagnose and fix a failing test or runtime error (up to 2 attempts)",
  phases: [
    { title: "Graph",      detail: "localize the call chain" },
    { title: "Cycle 1",    detail: "diagnose + propose + apply + verify" },
    { title: "Cycle 2",    detail: "if cycle 1 didn't resolve" },
  ],
};

// M81: runtime-native helpers (sandbox bans require/fs/child_process/process — the old
// require("./_lib.js") crashed this workflow on first eval, TD-113). Delegate CLI calls
// to an agent's Bash; args arrives as a JSON STRING in this runtime. See gsd-t-scan.workflow.js.
const _args = (typeof args === "string") ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : (args || {});
const _CLI_ENVELOPE_SCHEMA = {
  type: "object", required: ["ok", "exitCode"], additionalProperties: true,
  properties: { ok: { type: "boolean" }, exitCode: { type: "integer" }, envelope: { type: ["object", "null"], description: "stdout PARSED as JSON — an object, never the raw text" }, stdout: { type: "string" }, stderr: { type: "string" }, via: { type: "string" } },
};
// ─── Normalize a helper-agent CLI result (M104) ──────────────────────────────
//
// runCli asks a haiku helper to run a command and hand back the parsed JSON in
// `envelope`. A model doing that job is not perfectly reliable, and two broken
// shapes both read `env.ok === undefined` — which every caller treats as failure,
// so a HEALTHY CLI reports as broken:
//   (a) `envelope` holds the raw JSON TEXT rather than the parsed object
//   (b) `envelope` is absent and the JSON only reached `stdout`
// Observed live 2026-08-02: a partition/plan halted four times on "graph BROKEN"
// while the graph was fine (exit 0, ok:true).
//
// NOT a fallback: it continues past no failure and substitutes no guess — it reads
// the result the CLI actually returned. A failing CLI still returns ok:false and
// still fails; non-JSON stdout is left alone.
function _coerceCliResult(x) {
  if (!x) return x;
  if (typeof x.envelope === "string") {
    try { x.envelope = JSON.parse(x.envelope); } catch (_) { /* genuinely not JSON */ }
  }
  if ((x.envelope === undefined || x.envelope === null) &&
      typeof x.stdout === "string" && x.stdout.trim().startsWith("{")) {
    try { x.envelope = JSON.parse(x.stdout); } catch (_) { /* not JSON */ }
  }
  return x;
}

async function runCli(projectDir, subcmd, argv, localBin, label, parseJson = true, phaseName) {
  const argStr = (argv || []).map((a) => `'${String(a).replace(/'/g, "'\\''")}'`).join(" ");
  const prompt = [
    `Run a GSD-T CLI command for the project at \`${projectDir}\` and report the result. Steps:`,
    `1. If \`${projectDir}/bin/${localBin}\` exists, run: \`node ${projectDir}/bin/${localBin} ${argStr}\` (set via="local"). Otherwise run: \`gsd-t ${subcmd} ${argStr}\` (set via="global"). Use cwd \`${projectDir}\`.`,
    `2. Capture exit code (ok = exitCode 0) and stdout/stderr.`,
    parseJson ? `3. Parse stdout as JSON into \`envelope\` (null if not JSON). Return JSON per the schema.` : `3. Put stdout (trimmed, ≤4000 chars) in \`stdout\`. Return JSON per the schema.`,
    `Do NOT do any other work. ONLY run this one command and report.`,
  ].join("\n");
  const opts = { label, schema: _CLI_ENVELOPE_SCHEMA, model: "haiku" };
  if (phaseName) opts.phase = phaseName;
  const r = await agent(prompt, opts).catch((e) => ({ ok: false, exitCode: -1, envelope: null, stderr: String(e && e.message), via: "error" }));
  return _coerceCliResult(r) || { ok: false, exitCode: -1, envelope: null, via: "error" };
}
// Broken-Graph-Halts: route a failing graph envelope's reason through the ONE shared
// classifier via Bash (sandbox bans require). Returns "ABSENT" | "BROKEN" (fail-closed).
// [RULE] one-availability-classifier [RULE] unknown-reason-fails-closed-to-broken
async function classifyGraphFailure(projectDir, reason, detail, phaseName) {
  const r = await runCli(
    projectDir, "graph-availability",
    ["classify", String(reason || ""), String(detail || "")],
    "gsd-t-graph-availability.cjs", "graph-classify", true, phaseName
  ).catch(() => null);
  const env = r && r.envelope;
  if (env && (env.state === "ABSENT" || env.state === "BROKEN")) return env.state;
  return "BROKEN";
}
// [RULE] absent-graph-auto-builds-once — build the index once via the existing path.
async function buildGraphIndex(projectDir, phaseName) {
  const r = await runCli(
    projectDir, "graph index", ["build", "--repo", projectDir],
    "gsd-t-graph-index.cjs", "graph-index", false, phaseName
  ).catch(() => null);
  return !!(r && r.ok);
}

const projectDir = _args.projectDir || ".";
const symptom = _args.symptom || null;

// M99 D2: persist a kind:'wiring' ledger line. M81 sandbox: all I/O through agent() Bash.
// Uses the `gsd-t graph wiring-log --auto` CLI shim (avoids embedding require() in strings).
// [RULE] wiring-mode-three-states / [RULE] consumer-label-from-context-not-setenv
async function persistWiringMode(phaseName) {
  const consumer = "debug";
  await agent(
    [
      `Persist one graph-wiring-mode ledger line for the debug workflow.`,
      `Run: \`gsd-t graph wiring-log --consumer ${consumer} --auto --project '${projectDir}'\``,
      `(--auto detects WIRED if the graph store exists, else fallback-announced)`,
      `If the command is not found, exit 0 (ledger write is optional).`,
      `Return ONLY: {"ok": true} or {"ok": false, "reason": "<short reason>"}.`,
    ].join("\n"),
    { label: "debug:wiring-ledger", phase: phaseName, model: "haiku", schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" }, reason: { type: "string" } } } }
  ).catch(() => null);
}

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

// M94-D11 §READER: Query blast-radius + who-calls to localize the bug's call chain.
// Returns a short text snippet injected into the debug cycle agent context.
// On graph-unavailable: surfaces the message and returns null (agent proceeds without
// the structural slice — the fail-loud requirement is met by the logged message;
// the agent is NOT given a grep fallback to find the call chain).
// [RULE] debug-reader-and-writer-both
async function queryGraphForDebug(projectDir, symptom, phaseName, _rebuilt) {
  // Derive a plausible target hint from the symptom text (the file or function name)
  // to pass to blast-radius. This is heuristic — the agent reads the full slice.
  const targetHint = (symptom || "").slice(0, 80).replace(/['"]/g, "").trim();
  if (!targetHint) return { line: null, halt: false };

  const blastResult = await runCli(
    projectDir,
    "graph",
    ["blast-radius", targetHint],
    "gsd-t-graph-query-cli.cjs",
    "graph-blast-radius",
    true,
    phaseName
  );
  const env = blastResult.envelope;
  if (!env) return { line: null, halt: false };
  if (!env.ok) {
    const state = await classifyGraphFailure(projectDir, env.reason, env.detail, phaseName);
    if (state === "ABSENT" && !_rebuilt) {
      log(`M94-D11 READER: graph ABSENT — building index once, then re-querying.`);
      await buildGraphIndex(projectDir, phaseName);
      return queryGraphForDebug(projectDir, symptom, phaseName, true);
    }
    const haltMessage = `graph BROKEN (reason=${env.reason || "?"}) — debug HALTED. Fix it: run gsd-t graph status. No grep fallback.`;
    log(`M94-D11 READER: ${haltMessage}`);
    return { line: null, halt: true, haltMessage };
  }
  if (Array.isArray(env.results)) {
    return { line: `## Graph structural slice (blast-radius for "${targetHint}"):\n${JSON.stringify(env.results.slice(0, 20), null, 2)}`, halt: false };
  }
  return { line: null, halt: false };
}

// M94-D11 §WRITER: Trigger a freshness pass over the touched set after the fix lands.
// Calls gsd-t graph freshness (or who-imports) over each touched file so the next
// structural query sees fresh edges (graph-freshness-contract.md D4 surface).
// Best-effort (non-blocking) — failure is logged, not fatal.
// [RULE] debug-reader-and-writer-both
async function reindexTouchedFiles(projectDir, filesEdited, phaseName) {
  if (!Array.isArray(filesEdited) || filesEdited.length === 0) return;
  for (const f of filesEdited.slice(0, 10)) {
    // who-imports triggers freshness_check_on_query on the file before answering —
    // the side-effect is the re-index of f if it is content-hash-dirty.
    await runCli(
      projectDir,
      "graph",
      ["who-imports", f],
      "gsd-t-graph-query-cli.cjs",
      `graph-reindex-touched:${f.slice(-30)}`,
      true,
      phaseName
    ).catch(() => {}); // best-effort; don't halt debug on re-index failure
  }
  log(`M94-D11 WRITER: re-indexed ${Math.min(filesEdited.length, 10)} touched file(s) after fix`);
}

if (!symptom) {
  log("debug: args.symptom required (description of failing test or error)");
  return { status: "failed", reason: "no-symptom" };
}

phase("Graph");
// M99 D2: persist graphWiringMode for the debug consumer. [RULE] wiring-mode-three-states
await persistWiringMode("Graph");

// M94-D11 §READER: query graph ONCE before cycles (the structural slice is the same
// for all cycles — same symptom). Injected into each cycle's prompt.
// [RULE] broken-graph-halts-never-greps — a BROKEN graph HALTS debug (no grep fallback).
const _graphRead = await queryGraphForDebug(projectDir, symptom, "Graph");
if (_graphRead && _graphRead.halt) {
  return { status: "blocked-needs-human", reason: "graph-broken", detail: _graphRead.haltMessage };
}
const _graphSliceLine = (_graphRead && _graphRead.line) || "";

let lastResult = null;
for (let cycle = 1; cycle <= 2; cycle++) {
  phase(`Cycle ${cycle}`);
  const prompt = [
    `Debug cycle ${cycle} of 2. Symptom: ${symptom}`,
    _graphSliceLine ? `\n**Graph structural slice (M94-D11 READER — blast-radius/who-calls localization):**\n${_graphSliceLine}\nUse this slice to localize the call chain — do NOT grep for structural relationships.` : "",
    cycle > 1 && lastResult
      ? `\nPREVIOUS CYCLE'S ROOT CAUSE HYPOTHESIS (did not resolve the issue):\n${lastResult.rootCause}\nFiles edited: ${lastResult.filesEdited.join(", ")}\nIf the hypothesis was right, the fix was incomplete. If wrong, formulate a different hypothesis.`
      : "",
    ``,
    `Steps: (1) read the relevant code, (2) form a hypothesis, (3) apply a fix, (4) run the affected test(s), (5) report.`,
    `Commit the fix with prefix "m61(debug-cycle${cycle})".`,
    ``,
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

  // M94-D11 §WRITER: re-index touched files after fix lands (freshness trigger).
  // If the fix edited files, trigger a freshness pass so the next graph query sees fresh edges.
  if (Array.isArray(lastResult.filesEdited) && lastResult.filesEdited.length > 0) {
    await reindexTouchedFiles(projectDir, lastResult.filesEdited, `Cycle ${cycle}`);
  }

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
