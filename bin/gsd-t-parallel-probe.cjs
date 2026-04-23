"use strict";

/**
 * gsd-t-parallel-probe — M44 D9 Step 3
 *
 * Deterministic in-session probe that runs the parallel planner in dry-run mode
 * and emits a single JSON line to stdout. Command files (execute / quick /
 * debug / integrate) invoke this as a bash shim to get a mechanical answer —
 * replacing LLM prose judgment with a JSON shape that branching logic can read.
 *
 * Per user memory `feedback_deterministic_orchestration.md`:
 *   "prompt-based blocking doesn't work; use JS orchestrators for gates/waits"
 *
 * Contract: wave-join-contract.md v1.1.0; unattended-supervisor-contract.md v1.5.0
 *
 * Output shape (stdout, one line):
 *   {"workerCount":N,"parallelTasks":["M44-D9-T1",...],"mode":"in-session",
 *    "reducedCount":null|N,"warnings":[...],"ok":true}
 *
 * On unexpected error (planner throw, missing repo state, etc.), emits a safe
 * fallback shape so shell callers never have to parse stderr:
 *   {"workerCount":1,"parallelTasks":[],"mode":"in-session","ok":false,"error":"..."}
 *
 * Exit code 0 on both success and safe-fallback. This is intentional: the shim
 * is a decision probe, not a command; non-zero would force command files to
 * defensively wrap it and add LLM noise.
 *
 * Hard rules:
 *   - Zero external runtime deps
 *   - Never writes to stderr by default (shell shim relies on quiet)
 *   - Never writes to `.gsd-t/events/*` — that's runParallel's job
 */

const path = require("node:path");

function parseArgv(argv) {
  const out = { milestone: null, domain: null, mode: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--milestone" && argv[i + 1]) {
      out.milestone = argv[++i];
    } else if (a === "--domain" && argv[i + 1]) {
      out.domain = argv[++i];
    } else if (a === "--mode" && argv[i + 1]) {
      out.mode = argv[++i];
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    }
  }
  return out;
}

const HELP = `gsd-t-parallel-probe — deterministic planner probe (JSON out)

Usage:
  node bin/gsd-t-parallel-probe.cjs [--milestone Mxx] [--domain name] [--mode in-session|unattended]

Output: one JSON line to stdout with keys workerCount, parallelTasks, mode,
reducedCount, warnings, ok. Exit 0 always. Use with in-session command files
(execute, quick, debug, integrate) to replace prose-based parallel dispatch
decisions with a mechanical branch on workerCount.
`;

function probe(argv, env) {
  const args = parseArgv(argv || []);
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  let runParallel;
  try {
    ({ runParallel } = require(path.join(__dirname, "gsd-t-parallel.cjs")));
  } catch (e) {
    process.stdout.write(
      JSON.stringify({
        workerCount: 1,
        parallelTasks: [],
        mode: args.mode || "in-session",
        reducedCount: null,
        warnings: [],
        ok: false,
        error: `planner_load:${(e && e.message) || "unknown"}`,
      }) + "\n",
    );
    return 0;
  }

  let result;
  try {
    result = runParallel({
      projectDir: process.cwd(),
      mode: args.mode || undefined,
      milestone: args.milestone || undefined,
      domain: args.domain || undefined,
      dryRun: true,
      env: env || process.env,
    });
  } catch (e) {
    process.stdout.write(
      JSON.stringify({
        workerCount: 1,
        parallelTasks: [],
        mode: args.mode || "in-session",
        reducedCount: null,
        warnings: [],
        ok: false,
        error: `planner_error:${(e && e.message) || "unknown"}`,
      }) + "\n",
    );
    return 0;
  }

  process.stdout.write(
    JSON.stringify({
      workerCount: Number(result.workerCount) || 0,
      parallelTasks: Array.isArray(result.parallelTasks) ? result.parallelTasks : [],
      mode: result.mode || args.mode || "in-session",
      reducedCount: typeof result.reducedCount === "number" ? result.reducedCount : null,
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      ok: true,
    }) + "\n",
  );
  return 0;
}

module.exports = { probe, _parseArgv: parseArgv, _HELP: HELP };

if (require.main === module) {
  const code = probe(process.argv.slice(2), process.env);
  process.exit(code);
}
