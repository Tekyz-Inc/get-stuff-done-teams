#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { loadConfig } = require('./gsd-t-orchestrator-config.cjs');
const { readAllTasks, groupByWave, validateNoForwardDeps } = require('./gsd-t-orchestrator-queue.cjs');
const { runWorker } = require('./gsd-t-orchestrator-worker.cjs');
const { buildTaskBrief } = require('./gsd-t-task-brief.js');

const STATE_DIR = '.gsd-t/orchestrator';
const STATE_FILE = 'state.json';

function nowIso() { return new Date().toISOString(); }

function parseCliArgs(argv) {
  const args = {
    milestone: null,
    maxParallel: null,
    workerTimeoutMs: null,
    projectDir: process.cwd(),
    resume: false,
    help: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { args.help = true; }
    else if (a === '--milestone') { args.milestone = argv[++i]; }
    else if (a === '--max-parallel') { args.maxParallel = argv[++i]; }
    else if (a === '--worker-timeout') { args.workerTimeoutMs = argv[++i]; }
    else if (a === '--project-dir') { args.projectDir = path.resolve(argv[++i]); }
    else if (a === '--resume') { args.resume = true; }
  }
  return args;
}

function printHelp() {
  process.stdout.write([
    'Usage: gsd-t orchestrate --milestone <id> [options]',
    '',
    'Options:',
    '  --milestone <id>         Milestone id (e.g. M40). Required.',
    '  --max-parallel <n>       Max concurrent workers (default 3, max 15).',
    '  --worker-timeout <ms>    Per-worker timeout in ms (default 270000).',
    '  --project-dir <path>     Project directory (default cwd).',
    '  --resume                 Resume from .gsd-t/orchestrator/state.json.',
    '  -h, --help               Show this help.',
    ''
  ].join('\n'));
}

function atomicWriteJson(fp, obj) {
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = fp + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, fp);
}

function appendEventLine(projectDir, event) {
  const dayStr = nowIso().slice(0, 10);
  const eventsDir = path.join(projectDir, '.gsd-t', 'events');
  if (!fs.existsSync(eventsDir)) fs.mkdirSync(eventsDir, { recursive: true });
  const fp = path.join(eventsDir, dayStr + '.jsonl');
  fs.appendFileSync(fp, JSON.stringify(event) + '\n');
}

function writeEvent(projectDir, eventType, extra) {
  const event = {
    ts: nowIso(),
    command: 'orchestrate',
    phase: null,
    trace_id: null,
    event_type: eventType,
    agent_id: process.env.GSD_T_AGENT_ID || null,
    parent_agent_id: process.env.GSD_T_PARENT_AGENT_ID || null,
    reasoning: null,
    outcome: null,
    ...(extra || {})
  };
  try { appendEventLine(projectDir, event); } catch (_) { /* best effort */ }
}

function makeState(projectDir) {
  const fp = path.join(projectDir, STATE_DIR, STATE_FILE);
  const defaults = {
    startedAt: nowIso(),
    status: 'running',
    currentWave: null,
    tasks: {}
  };
  return {
    fp,
    data: defaults,
    save(patch) {
      if (patch) Object.assign(this.data, patch);
      atomicWriteJson(this.fp, this.data);
    },
    patchTask(id, fields) {
      this.data.tasks[id] = { ...(this.data.tasks[id] || {}), ...fields };
      atomicWriteJson(this.fp, this.data);
    }
  };
}

function filterTasksByMilestone(tasks, milestone) {
  // M40 tasks don't yet carry a milestone field in tasks.md — for now,
  // the milestone context is global. This function is a placeholder for
  // when tasks.md entries include an explicit milestone marker.
  return tasks;
}

async function runWaveTasks({ tasks, config, state, logger, spawnImpl, runWorkerImpl = runWorker }) {
  const queue = [...tasks];
  const running = new Set();
  const results = [];
  let haltRequested = false;

  const launch = async (task) => {
    const started = nowIso();
    state.patchTask(task.id, { status: 'running', startedAt: started, retryCount: 0 });
    writeEvent(config.projectDir, 'task_start', { task_id: task.id, wave: task.wave, domain: task.domain });

    const attempt = async (retryCount) => {
      let brief;
      try {
        brief = buildTaskBrief({
          milestone: config.milestone,
          domain: task.domain,
          taskId: task.id.includes(':T')
            ? `${task.domain}-t${task.id.split(':T')[1]}`
            : task.id,
          projectDir: config.projectDir,
          expectedBranch: config.expectedBranch || 'main'
        });
      } catch (err) {
        logger.log(`[orchestrator] brief build failed for ${task.id}: ${err.message}`);
        return {
          result: { ok: false, missing: ['brief_build_error'], details: { error: String(err) } },
          exitCode: -1,
          durationMs: 0,
          timedOut: false
        };
      }
      if (retryCount > 0) {
        brief += `\n\n## Retry Note\nPrevious attempt failed. Try again, paying attention to the Done Signal checklist.\n`;
      }
      return runWorkerImpl({
        task,
        brief,
        config,
        onFrame: () => {},
        env: process.env,
        spawnImpl
      });
    };

    let outcome = await attempt(0);
    if (!outcome.result.ok && config.retryOnFail) {
      state.patchTask(task.id, { retryCount: 1 });
      outcome = await attempt(1);
    }

    const endedAt = nowIso();
    state.patchTask(task.id, {
      status: outcome.result.ok ? 'done' : 'failed',
      endedAt,
      exitCode: outcome.exitCode,
      durationMs: outcome.durationMs,
      missing: outcome.result.missing || []
    });
    writeEvent(config.projectDir, outcome.result.ok ? 'task_done' : 'task_failed', {
      task_id: task.id,
      wave: task.wave,
      domain: task.domain,
      exit_code: outcome.exitCode,
      duration_ms: outcome.durationMs
    });

    results.push({ task, outcome });
    if (!outcome.result.ok && config.haltOnSecondFail) {
      haltRequested = true;
    }
    return outcome;
  };

  const pump = async () => {
    while (queue.length && running.size < config.maxParallel && !haltRequested) {
      const task = queue.shift();
      const p = launch(task).finally(() => running.delete(p));
      running.add(p);
    }
  };

  await pump();
  while (running.size) {
    await Promise.race(running);
    if (!haltRequested) await pump();
  }

  return { results, halted: haltRequested };
}

async function runOrchestrator(opts) {
  const {
    projectDir,
    milestone,
    maxParallel,
    workerTimeoutMs,
    logger = console,
    spawnImpl,
    runWorkerImpl
  } = opts;

  const config = loadConfig({
    projectDir,
    cliFlags: {
      ...(maxParallel != null ? { maxParallel } : {}),
      ...(workerTimeoutMs != null ? { workerTimeoutMs } : {})
    },
    env: process.env
  });
  config.milestone = milestone || 'unknown';

  const allTasks = readAllTasks(projectDir);
  const scopedTasks = filterTasksByMilestone(allTasks, milestone);
  if (!scopedTasks.length) {
    logger.log(`[orchestrator] no tasks found under ${projectDir}/.gsd-t/domains/*/tasks.md`);
    return { status: 'empty', waves: [] };
  }

  validateNoForwardDeps(scopedTasks);
  const waves = groupByWave(scopedTasks);

  const state = makeState(projectDir);
  state.save({ milestone: config.milestone, totalTasks: scopedTasks.length, waves: [...waves.keys()] });
  writeEvent(projectDir, 'orchestrator_start', { milestone: config.milestone, total_tasks: scopedTasks.length });

  const waveResults = [];
  for (const [waveNum, waveTasks] of waves) {
    state.save({ currentWave: waveNum, status: 'running' });
    writeEvent(projectDir, 'wave_start', { wave: waveNum, task_count: waveTasks.length });

    const { results, halted } = await runWaveTasks({
      tasks: waveTasks,
      config,
      state,
      logger,
      spawnImpl,
      runWorkerImpl
    });

    const failed = results.filter((r) => !r.outcome.result.ok);
    waveResults.push({ wave: waveNum, total: waveTasks.length, done: results.length - failed.length, failed: failed.length });
    writeEvent(projectDir, failed.length ? 'wave_failed' : 'wave_done', {
      wave: waveNum,
      failed_count: failed.length
    });

    if (halted || failed.length) {
      state.save({ status: 'failed' });
      logger.log(`[wave_halt] wave=${waveNum} failed_tasks=${failed.length}`);
      writeEvent(projectDir, 'orchestrator_halt', { wave: waveNum, failed_count: failed.length });
      return { status: 'failed', waves: waveResults, failedWave: waveNum };
    }
  }

  state.save({ status: 'done', endedAt: nowIso() });
  writeEvent(projectDir, 'orchestrator_done', { waves: waveResults.length });
  return { status: 'done', waves: waveResults };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) { printHelp(); process.exit(0); }
  if (!args.milestone) {
    process.stderr.write('Error: --milestone is required\n\n');
    printHelp();
    process.exit(2);
  }
  try {
    const res = await runOrchestrator({
      projectDir: args.projectDir,
      milestone: args.milestone,
      maxParallel: args.maxParallel,
      workerTimeoutMs: args.workerTimeoutMs
    });
    if (res.status === 'failed') {
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[orchestrator] ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runOrchestrator,
  runWaveTasks,
  parseCliArgs,
  atomicWriteJson
};
