"use strict";

/**
 * gsd-t-parallel — M44 D2
 *
 * `gsd-t parallel` subcommand. Wraps the M40 orchestrator with task-level
 * (not just domain-level) parallelism and mode-aware gating math.
 *
 * Consumes:
 *   - D1 task graph           (bin/gsd-t-task-graph.cjs)
 *   - D4 depgraph validation  (bin/gsd-t-depgraph-validate.cjs)
 *   - D5 file-disjointness    (bin/gsd-t-file-disjointness.cjs)
 *   - D6 economics estimator  (bin/gsd-t-economics.cjs)
 *   - token-budget            (bin/token-budget.cjs) — in-session ctxPct
 *   - mode-aware gating math  (bin/gsd-t-orchestrator-config.cjs)
 *
 * Does NOT replace `bin/gsd-t-orchestrator.js`. `runParallel` prepares the
 * validated ready-task set and plan; the existing orchestrator machinery
 * owns the actual worker spawn. In T2 this module emits the plan;
 * the downstream orchestrator consumes it.
 *
 * Contract: `.gsd-t/contracts/wave-join-contract.md` v1.1.0 (§Mode-Aware Gating Math).
 *
 * Hard rules (from constraints.md):
 *   - Zero external runtime deps (Node built-ins only)
 *   - Never throws pause/resume prompts under any condition
 *   - All three invariants (disjointness, auto-merge, economics) apply to both modes
 *   - `--dry-run` MUST be supported; prints plan without spawning
 *   - `--mode` auto-detect fallback: `GSD_T_UNATTENDED=1` → `unattended`, else `in-session`
 */

const fs = require("node:fs");
const path = require("node:path");

const { buildTaskGraph, getReadyTasks } = require(path.join(__dirname, "gsd-t-task-graph.cjs"));
const { validateDepGraph } = require(path.join(__dirname, "gsd-t-depgraph-validate.cjs"));
const { proveDisjointness } = require(path.join(__dirname, "gsd-t-file-disjointness.cjs"));
const { estimateTaskFootprint } = require(path.join(__dirname, "gsd-t-economics.cjs"));
const {
  computeInSessionHeadroom,
  computeUnattendedGate,
} = require(path.join(__dirname, "gsd-t-orchestrator-config.cjs"));

// token-budget is optional at require-time so unit tests can stub via dependency injection.
let _tokenBudget = null;
function loadTokenBudget() {
  if (_tokenBudget) return _tokenBudget;
  try {
    _tokenBudget = require(path.join(__dirname, "token-budget.cjs"));
  } catch {
    _tokenBudget = { getSessionStatus: () => ({ pct: 0 }) };
  }
  return _tokenBudget;
}

// ─── event stream writer ──────────────────────────────────────────────────

function appendEvent(projectDir, event) {
  try {
    const eventsDir = path.join(projectDir, ".gsd-t", "events");
    fs.mkdirSync(eventsDir, { recursive: true });
    const day = (event.ts || new Date().toISOString()).slice(0, 10);
    const file = path.join(eventsDir, `${day}.jsonl`);
    fs.appendFileSync(file, JSON.stringify(event) + "\n");
  } catch {
    // Best-effort; event-log failures must not break control flow.
  }
}

// ─── mode detection ───────────────────────────────────────────────────────

function detectMode(opts, env) {
  if (opts && typeof opts.mode === "string" && opts.mode) return opts.mode;
  const e = env || process.env;
  if (e.GSD_T_UNATTENDED === "1") return "unattended";
  return "in-session";
}

// ─── CLI arg parsing ──────────────────────────────────────────────────────

function parseArgv(argv) {
  const out = { help: false, dryRun: false, mode: null, milestone: null, domain: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--mode") out.mode = argv[++i] || null;
    else if (a.startsWith("--mode=")) out.mode = a.slice("--mode=".length);
    else if (a === "--milestone") out.milestone = argv[++i] || null;
    else if (a.startsWith("--milestone=")) out.milestone = a.slice("--milestone=".length);
    else if (a === "--domain") out.domain = argv[++i] || null;
    else if (a.startsWith("--domain=")) out.domain = a.slice("--domain=".length);
  }
  return out;
}

const HELP_TEXT = `Usage: gsd-t parallel [options]

Dispatch M44 task-level parallelism through the M40 orchestrator with
mode-aware gating math. Extends — does not replace — the orchestrator.

Options:
  --mode <in-session|unattended>   Explicit mode. Auto-detects from
                                   GSD_T_UNATTENDED=1 env when omitted;
                                   defaults to in-session otherwise.
  --milestone <Mxx>                Limit planning to a single milestone.
  --domain <name>                  Limit planning to a single domain.
  --dry-run                        Print the proposed worker plan table
                                   and exit without spawning any workers.
  --help, -h                       Show this message and exit 0.

Gates applied before any fan-out (in order):
  1. D4 depgraph validation — any task with unmet deps is vetoed.
  2. D5 file-disjointness prover — overlap → sequential fallback.
  3. D6 economics estimator — per-task CW% footprint.

Modes:
  in-session   Never throws pause/resume prompts. Before fan-out,
               computes ctxPct + N × summarySize ≤ 85. If not, reduces
               N until it fits; final floor is N=1 (sequential).
  unattended   Per-worker CW headroom is the binding gate. Tasks whose
               estimated CW% > 60 emit a task_split signal.

Contract: .gsd-t/contracts/wave-join-contract.md v1.1.0
`;

// ─── runParallel — the exported entrypoint ────────────────────────────────

/**
 * runParallel({projectDir, mode, milestone, domain, dryRun}) → plan object
 *
 * T1 scaffold: returns the ready-task set from D1 and echoes mode. T2
 * layers in the gating math + event emission; T3 wires dry-run output
 * and the three-gate sequence.
 */
function runParallel(opts) {
  const projectDir = (opts && opts.projectDir) || process.cwd();
  const mode = detectMode(opts, opts && opts.env);
  const milestone = (opts && opts.milestone) || null;
  const domain = (opts && opts.domain) || null;
  const dryRun = !!(opts && opts.dryRun);

  const graph = buildTaskGraph({ projectDir });
  const ready = getReadyTasks(graph);

  // T2+ gating math is implemented below by later commits. In the scaffold
  // we simply return the pre-gate ready set so tests can assert the shape.
  return {
    mode,
    milestone,
    domain,
    dryRun,
    projectDir,
    plan: ready.map((t) => ({
      task_id: t.id,
      domain: t.domain,
      estimatedCwPct: null,
      disjoint: null,
      depsOk: true,
      decision: "pending",
    })),
    workerCount: ready.length,
    warnings: graph.warnings || [],
  };
}

// ─── CLI entry ────────────────────────────────────────────────────────────

function runCli(argv, env) {
  const args = parseArgv(argv || []);
  if (args.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }
  const mode = args.mode || detectMode({}, env);
  const plan = runParallel({
    projectDir: process.cwd(),
    mode,
    milestone: args.milestone,
    domain: args.domain,
    dryRun: args.dryRun,
    env,
  });
  // T3 implements the full dry-run table; T1 scaffold prints a minimal line.
  process.stdout.write(
    `gsd-t parallel — mode=${plan.mode} workers=${plan.workerCount}` +
      (plan.dryRun ? " (dry-run)\n" : "\n"),
  );
  return 0;
}

module.exports = {
  runParallel,
  runCli,
  // Exposed for tests:
  _parseArgv: parseArgv,
  _detectMode: detectMode,
  _appendEvent: appendEvent,
  _HELP_TEXT: HELP_TEXT,
};

if (require.main === module) {
  const code = runCli(process.argv.slice(2), process.env);
  process.exit(code);
}
