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
 * Applies D4 dep-graph + D5 disjointness + D6 economics gates, then the
 * mode-aware headroom/split gate, and returns the resolved worker plan.
 *
 * Does not spawn. The caller (M40 orchestrator) owns actual worker launch.
 */
function runParallel(opts) {
  const projectDir = (opts && opts.projectDir) || process.cwd();
  const mode = detectMode(opts, opts && opts.env);
  const milestone = (opts && opts.milestone) || null;
  const domain = (opts && opts.domain) || null;
  const dryRun = !!(opts && opts.dryRun);
  const summarySize = Number.isFinite(opts && opts.summarySize)
    ? opts.summarySize
    : require(path.join(__dirname, "gsd-t-orchestrator-config.cjs")).DEFAULT_SUMMARY_SIZE_PCT;

  const graph = buildTaskGraph({ projectDir });
  let candidates = getReadyTasks(graph);

  // Optional filtering by milestone / domain.
  if (domain) candidates = candidates.filter((t) => t.domain === domain);
  if (milestone) {
    // Milestone id prefixes task ids in this codebase (M44-D2-T1 → M44).
    const prefix = String(milestone).toUpperCase();
    candidates = candidates.filter((t) => String(t.id).toUpperCase().startsWith(prefix + "-"));
  }

  // ── D4 depgraph gate ──
  const depResult = validateDepGraph({ graph: { ...graph, ready: candidates.map((t) => t.id) }, projectDir });
  const depReady = depResult.ready;
  const depVetoed = depResult.vetoed || [];
  for (const v of depVetoed) {
    appendEvent(projectDir, {
      type: "gate_veto",
      task_id: v.task && v.task.id,
      gate: "depgraph",
      reason: `unmet_deps:${(v.unmet_deps || []).join(",")}`,
      ts: new Date().toISOString(),
    });
  }

  // ── D5 disjointness gate ──
  const disj = proveDisjointness({ tasks: depReady, projectDir });
  const disjointTaskIds = new Set();
  for (const group of disj.parallel || []) {
    for (const t of group) disjointTaskIds.add(t.id);
  }
  // Sequential groups + unprovable are NOT candidates for parallel fan-out
  // but still allowed as single-worker (sequential) — surfaced as gate_veto
  // events so "why wasn't this parallelized?" is observable.
  const sequentialFallback = new Set();
  for (const group of disj.sequential || []) {
    for (const t of group) {
      sequentialFallback.add(t.id);
      appendEvent(projectDir, {
        type: "gate_veto",
        task_id: t.id,
        gate: "disjointness",
        reason: "write-target-overlap-or-unprovable",
        ts: new Date().toISOString(),
      });
    }
  }

  // ── D6 economics gate (per-task estimate) ──
  const perTask = new Map();
  for (const t of depReady) {
    let est;
    try {
      est = estimateTaskFootprint({ taskNode: t, mode, projectDir });
    } catch {
      est = { estimatedCwPct: 0, parallelOk: true, split: false, workerCount: 1, confidence: "low" };
    }
    perTask.set(t.id, est);
  }

  // ── Mode-aware gating math ──
  let finalParallelTasks = [];
  let reducedCount = null;
  let ctxPctObserved = null;
  if (mode === "unattended") {
    // Each parallel-candidate task gets an unattended gate check.
    for (const t of depReady) {
      const est = perTask.get(t.id);
      if (!disjointTaskIds.has(t.id)) continue; // already sequential
      const gate = computeUnattendedGate({ estimatedCwPct: est.estimatedCwPct, threshold: 60 });
      if (gate.split) {
        appendEvent(projectDir, {
          type: "task_split",
          task_id: t.id,
          estimatedCwPct: est.estimatedCwPct,
          ts: new Date().toISOString(),
        });
        // Actual slicing is the caller's responsibility — the task stays in
        // the parallel set; the orchestrator (or caller) treats it as
        // "needs split". Per D2-T2 acceptance: emitting the event and
        // returning the plan is sufficient.
      }
      finalParallelTasks.push(t);
    }
  } else {
    // in-session path
    const tb = loadTokenBudget();
    let status;
    try { status = tb.getSessionStatus(projectDir); } catch { status = { pct: 0 }; }
    const ctxPct = Number.isFinite(status && status.pct) ? status.pct : 0;
    ctxPctObserved = ctxPct;
    const parallelCandidates = depReady.filter((t) => disjointTaskIds.has(t.id));
    const requested = parallelCandidates.length;
    const headroom = computeInSessionHeadroom({ ctxPct, workerCount: requested, summarySize });
    reducedCount = headroom.reducedCount;
    if (reducedCount < requested) {
      appendEvent(projectDir, {
        type: "parallelism_reduced",
        original_count: requested,
        reduced_count: reducedCount,
        reason: "in_session_headroom",
        ts: new Date().toISOString(),
      });
    }
    finalParallelTasks = parallelCandidates.slice(0, reducedCount);
  }

  // Build the plan table rows (all ready tasks, labeled by decision).
  const plan = depReady.map((t) => {
    const est = perTask.get(t.id) || {};
    const disjointOk = disjointTaskIds.has(t.id);
    const isFinalParallel = finalParallelTasks.some((x) => x.id === t.id);
    let decision;
    if (isFinalParallel) {
      decision = mode === "unattended" && est.split ? "parallel-split" : "parallel";
    } else if (sequentialFallback.has(t.id)) {
      decision = "sequential";
    } else {
      decision = "sequential";
    }
    return {
      task_id: t.id,
      domain: t.domain,
      estimatedCwPct: Number.isFinite(est.estimatedCwPct) ? est.estimatedCwPct : null,
      disjoint: disjointOk,
      depsOk: true,
      decision,
    };
  });
  // Also show dep-vetoed tasks so the dry-run table is complete.
  for (const v of depVetoed) {
    if (!v.task) continue;
    plan.push({
      task_id: v.task.id,
      domain: v.task.domain,
      estimatedCwPct: null,
      disjoint: null,
      depsOk: false,
      decision: "veto-deps",
    });
  }

  return {
    mode,
    milestone,
    domain,
    dryRun,
    projectDir,
    plan,
    workerCount: finalParallelTasks.length || (plan.length ? 1 : 0),
    parallelTasks: finalParallelTasks.map((t) => t.id),
    reducedCount,
    ctxPct: ctxPctObserved,
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
