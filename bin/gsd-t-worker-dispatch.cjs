#!/usr/bin/env node
'use strict';

/**
 * GSD-T Worker Sub-Dispatch (M46 D2 T2)
 *
 * Thin adapter that lets an unattended supervisor worker fan out its own
 * file-disjoint tasks by reusing the M44-verified `runDispatch` instrument.
 * This module is a new CONSUMER of `bin/gsd-t-parallel.cjs::runDispatch` —
 * not a modifier. The in-session dispatch path is byte-identical post-D2.
 *
 * Contract: .gsd-t/contracts/headless-default-contract.md v2.1.0 §Worker Sub-Dispatch
 *
 * Public API:
 *   dispatchWorkerTasks({projectDir, parentSessionId, tasks, maxParallel})
 *     → { parallel, taskResults, wallClockMs, reason }
 *
 * Triggers sub-dispatch when all hold:
 *   - tasks.length > 1
 *   - tasks are file-disjoint (pairwise no overlap on `task.files`)
 * Otherwise returns `{parallel: false, …}` and the caller falls through to
 * its current serial behavior.
 */

const path = require('path');

const SPAWN_PLAN_KIND = 'unattended-worker-sub';
const DEFAULT_MAX_PARALLEL = 4;

/**
 * Pairwise file-disjointness across a task set. Returns true iff no two
 * tasks share any file in their `files` arrays. Tasks without a `files`
 * array (or empty) are treated as having no declared file scope and
 * therefore never overlap with anyone — callers upstream should not
 * pass such tasks to sub-dispatch, but we remain conservative: a task
 * with no `files` is considered disjoint from every other task only
 * when every counterpart also has files declared. When both sides lack
 * `files`, we conservatively report NOT disjoint so the caller falls
 * back to serial — an undeclared scope is an unknown scope.
 */
function _areFileDisjoint(tasks) {
  if (!Array.isArray(tasks) || tasks.length < 2) return true;
  for (let i = 0; i < tasks.length; i++) {
    const a = tasks[i];
    const aFiles = (a && Array.isArray(a.files)) ? a.files : null;
    for (let j = i + 1; j < tasks.length; j++) {
      const b = tasks[j];
      const bFiles = (b && Array.isArray(b.files)) ? b.files : null;
      if (!aFiles || !bFiles) return false;
      const set = new Set(aFiles);
      for (const f of bFiles) {
        if (set.has(f)) return false;
      }
    }
  }
  return true;
}

/**
 * Emit a spawn-plan frame for this sub-dispatch. Best-effort; writer
 * failures never propagate (per spawn-plan-writer.cjs §Hard rules).
 */
function _writeSubDispatchSpawnPlan({ projectDir, parentSessionId, tasks }) {
  try {
    const writer = require(path.join(__dirname, 'spawn-plan-writer.cjs'));
    const spawnId = `worker-sub-${parentSessionId}-${Date.now()}`;
    const planTasks = tasks.map((t) => ({
      id: (t && typeof t.taskId === 'string') ? t.taskId : String((t && t.taskId) || ''),
      title: (t && typeof t.title === 'string') ? t.title : '',
      status: 'pending',
    }));
    writer.writeSpawnPlan({
      spawnId,
      kind: SPAWN_PLAN_KIND,
      projectDir,
      tasks: planTasks,
    });
  } catch (_e) {
    /* best-effort; never block dispatch */
  }
}

/**
 * dispatchWorkerTasks — the M46 D2 sub-dispatch entry point.
 *
 * @param {object}   opts
 * @param {string}   opts.projectDir        absolute project root
 * @param {string}   opts.parentSessionId   $GSD_T_PARENT_AGENT_ID from worker env
 * @param {Array}    opts.tasks             [{taskId, files, command, ...}]
 * @param {number}   [opts.maxParallel=4]   concurrency cap (default matches M44)
 * @returns {Promise<{parallel: boolean, taskResults: Array, wallClockMs: number, reason: string}>}
 */
async function dispatchWorkerTasks(opts) {
  const projectDir = (opts && opts.projectDir) || process.cwd();
  const parentSessionId = (opts && opts.parentSessionId) || '';
  const tasks = (opts && Array.isArray(opts.tasks)) ? opts.tasks : [];
  const maxParallel = Number.isFinite(opts && opts.maxParallel) && opts.maxParallel > 0
    ? Math.floor(opts.maxParallel)
    : DEFAULT_MAX_PARALLEL;

  if (tasks.length === 0) {
    return { parallel: false, taskResults: [], wallClockMs: 0, reason: 'no-tasks' };
  }
  if (tasks.length === 1) {
    return { parallel: false, taskResults: [], wallClockMs: 0, reason: 'single-task' };
  }
  if (!_areFileDisjoint(tasks)) {
    return { parallel: false, taskResults: [], wallClockMs: 0, reason: 'file-overlap' };
  }

  _writeSubDispatchSpawnPlan({ projectDir, parentSessionId, tasks });

  const startedAt = Date.now();
  try {
    const parallel = require(path.join(__dirname, 'gsd-t-parallel.cjs'));
    const result = await parallel.runDispatch({
      projectDir,
      tasks,
      maxWorkers: maxParallel,
      mode: 'worker-subdispatch',
    });
    const wallClockMs = Date.now() - startedAt;
    const taskResults = (result && Array.isArray(result.workerResults))
      ? result.workerResults
      : (result && Array.isArray(result.taskResults) ? result.taskResults : []);
    return {
      parallel: true,
      taskResults,
      wallClockMs,
      reason: 'dispatched',
    };
  } catch (e) {
    const wallClockMs = Date.now() - startedAt;
    const msg = (e && e.message) ? e.message : String(e);
    return {
      parallel: false,
      taskResults: [],
      wallClockMs,
      reason: `dispatch-error: ${msg}`,
    };
  }
}

module.exports = {
  dispatchWorkerTasks,
  _areFileDisjoint,
  SPAWN_PLAN_KIND,
};

if (require.main === module) {
  (async () => {
    const fs = require('fs');
    const argv = process.argv.slice(2);
    let parentSessionId = null;
    let tasksPath = null;
    let maxParallel = DEFAULT_MAX_PARALLEL;
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--parent-session') {
        parentSessionId = argv[++i];
      } else if (a === '--tasks') {
        tasksPath = argv[++i];
      } else if (a === '--max-parallel') {
        const n = parseInt(argv[++i], 10);
        if (Number.isFinite(n) && n > 0) maxParallel = n;
      }
    }
    if (!parentSessionId) {
      process.stderr.write('error: --parent-session required\n');
      process.exit(2);
    }
    if (!tasksPath) {
      process.stderr.write('error: --tasks required\n');
      process.exit(2);
    }
    let raw;
    try {
      raw = fs.readFileSync(tasksPath, 'utf8');
    } catch (e) {
      process.stderr.write(`error: cannot read tasks file ${tasksPath}: ${(e && e.message) || e}\n`);
      process.exit(2);
    }
    let tasks;
    try {
      tasks = JSON.parse(raw);
    } catch (e) {
      process.stderr.write(`error: malformed tasks JSON: ${(e && e.message) || e}\n`);
      process.exit(2);
    }
    if (!Array.isArray(tasks)) {
      process.stderr.write('error: tasks JSON must be an array\n');
      process.exit(2);
    }
    const projectDir = process.cwd();
    try {
      const result = await dispatchWorkerTasks({
        projectDir,
        parentSessionId,
        tasks,
        maxParallel,
      });
      process.stdout.write(JSON.stringify(result) + '\n');
      const anyFailed = Array.isArray(result && result.taskResults)
        && result.taskResults.some((r) => r && (r.exitCode !== 0 && r.exitCode != null));
      process.exit(anyFailed ? 1 : 0);
    } catch (e) {
      process.stderr.write(`error: dispatch threw: ${(e && e.message) || e}\n`);
      process.exit(1);
    }
  })();
}
