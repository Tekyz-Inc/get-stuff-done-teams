'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { runWorker, buildArgs } = require('../bin/gsd-t-orchestrator-worker.cjs');

function mkProj() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm40-worker-'));
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.gsd-t', 'progress.md'), '# Progress\n');
  return dir;
}

function writeMockClaude(mockDir, behavior) {
  const scriptPath = path.join(mockDir, 'claude-mock.sh');
  let body = '#!/bin/sh\n';
  switch (behavior) {
    case 'happy':
      body += `echo '{"type":"assistant","content":"ok"}'\n`;
      body += `echo '{"type":"result","ok":true}'\n`;
      body += `exit 0\n`;
      break;
    case 'fail':
      body += `echo '{"type":"assistant","content":"bad"}'\n`;
      body += `exit 2\n`;
      break;
    case 'hang':
      body += `sleep 30\n`;
      break;
    case 'invalid-json':
      body += `echo 'not json at all'\n`;
      body += `echo '{"type":"result","ok":true}'\n`;
      body += `exit 0\n`;
      break;
    default:
      body += `exit 0\n`;
  }
  fs.writeFileSync(scriptPath, body, { mode: 0o755 });
  return scriptPath;
}

test('buildArgs: default model sonnet', () => {
  const args = buildArgs({ id: 't1' });
  assert.ok(args.includes('--model'));
  assert.equal(args[args.indexOf('--model') + 1], 'sonnet');
  assert.ok(args.includes('--dangerously-skip-permissions'));
  assert.ok(args.includes('stream-json'));
});

test('buildArgs: explicit model honored', () => {
  const args = buildArgs({ id: 't1', model: 'opus' });
  assert.equal(args[args.indexOf('--model') + 1], 'opus');
});

test('runWorker: happy path — frames emitted, completion check runs, ok=false (no commit)', async () => {
  const dir = mkProj();
  const mock = writeMockClaude(dir, 'happy');
  const frames = [];
  const result = await runWorker({
    task: { id: 'm40-t', domain: 'd-x', wave: 0 },
    brief: 'do a thing',
    config: { projectDir: dir, workerTimeoutMs: 5000 },
    onFrame: (f) => frames.push(f),
    env: { ...process.env, GSD_T_CLAUDE_BIN: mock }
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, false);
  assert.ok(result.durationMs >= 0);

  const boundaries = frames.filter(f => f.type === 'task-boundary');
  assert.equal(boundaries[0].state, 'start');
  assert.equal(boundaries[boundaries.length - 1].state, 'failed');

  const native = frames.filter(f => f.type === 'assistant' || f.type === 'result');
  assert.equal(native.length, 2);

  assert.equal(result.result.ok, false);
  assert.ok(result.result.missing.includes('no_commit_on_branch'));
});

test('runWorker: non-zero exit → missing includes worker_exit_nonzero', async () => {
  const dir = mkProj();
  const mock = writeMockClaude(dir, 'fail');
  const result = await runWorker({
    task: { id: 'm40-fail', domain: 'd-x', wave: 0 },
    brief: 'fail me',
    config: { projectDir: dir, workerTimeoutMs: 5000 },
    onFrame: () => {},
    env: { ...process.env, GSD_T_CLAUDE_BIN: mock }
  });

  assert.equal(result.exitCode, 2);
  assert.equal(result.timedOut, false);
  assert.equal(result.result.ok, false);
  assert.equal(result.result.missing[0], 'worker_exit_nonzero');
});

test('runWorker: timeout triggers SIGTERM and missing worker_exited_via_timeout', async () => {
  const dir = mkProj();
  const mock = writeMockClaude(dir, 'hang');
  const logs = [];
  const t0 = Date.now();
  const result = await runWorker({
    task: { id: 'm40-hang', domain: 'd-x', wave: 0 },
    brief: 'never finishes',
    config: {
      projectDir: dir,
      workerTimeoutMs: 1200,
      logger: { log: (m) => logs.push(m) }
    },
    onFrame: () => {},
    env: { ...process.env, GSD_T_CLAUDE_BIN: mock }
  });

  const elapsed = Date.now() - t0;
  assert.equal(result.timedOut, true);
  assert.ok(result.result.missing.includes('worker_exited_via_timeout'));
  assert.ok(logs.some(m => /\[worker_timeout\]/.test(m)));
  assert.ok(elapsed < 10000, 'timeout must not wait for 30s sleep');
});

test('runWorker: spawn error → result includes spawn_error', async () => {
  const dir = mkProj();
  const result = await runWorker({
    task: { id: 'm40-bad-bin', domain: 'd-x', wave: 0 },
    brief: 'whatever',
    config: { projectDir: dir, workerTimeoutMs: 5000 },
    onFrame: () => {},
    env: { ...process.env, GSD_T_CLAUDE_BIN: '/definitely/not/a/binary' }
  });

  assert.equal(result.exitCode, -1);
  assert.ok(
    result.result.missing.includes('spawn_error') || result.result.missing.includes('worker_exit_nonzero'),
    'missing should include spawn_error or nonzero: ' + JSON.stringify(result.result.missing)
  );
});

test('runWorker: invalid json lines wrapped as {type:"raw"}', async () => {
  const dir = mkProj();
  const mock = writeMockClaude(dir, 'invalid-json');
  const frames = [];
  await runWorker({
    task: { id: 'm40-raw', domain: 'd-x', wave: 0 },
    brief: 'garbled',
    config: { projectDir: dir, workerTimeoutMs: 5000 },
    onFrame: (f) => frames.push(f),
    env: { ...process.env, GSD_T_CLAUDE_BIN: mock }
  });
  const raw = frames.filter(f => f.type === 'raw');
  assert.equal(raw.length, 1);
  assert.equal(raw[0].line, 'not json at all');
});

test('runWorker: worker cwd = config.projectDir, env has GSD_T_PROJECT_DIR', async () => {
  const dir = mkProj();
  const scriptPath = path.join(dir, 'claude-mock.sh');
  const outPath = path.join(dir, 'mock.out');
  fs.writeFileSync(scriptPath, `#!/bin/sh
pwd > ${outPath}
echo GSD_T_PROJECT_DIR=$GSD_T_PROJECT_DIR >> ${outPath}
echo '{"type":"result","ok":true}'
exit 0
`, { mode: 0o755 });

  await runWorker({
    task: { id: 'm40-env', domain: 'd-x', wave: 0 },
    brief: 'check env',
    config: { projectDir: dir, workerTimeoutMs: 5000 },
    onFrame: () => {},
    env: { ...process.env, GSD_T_CLAUDE_BIN: scriptPath }
  });

  const out = fs.readFileSync(outPath, 'utf8');
  const lines = out.trim().split('\n');
  assert.equal(fs.realpathSync(lines[0]), fs.realpathSync(dir));
  assert.equal(lines[1], `GSD_T_PROJECT_DIR=${dir}`);
});

test('runWorker: validates required args', async () => {
  await assert.rejects(async () => {
    await runWorker({ task: null, brief: 'x', config: { projectDir: '/tmp', workerTimeoutMs: 1000 } });
  });
  await assert.rejects(async () => {
    await runWorker({ task: { id: 't' }, brief: '', config: { projectDir: '/tmp', workerTimeoutMs: 1000 } });
  });
  await assert.rejects(async () => {
    await runWorker({ task: { id: 't' }, brief: 'x', config: { workerTimeoutMs: 1000 } });
  });
  await assert.rejects(async () => {
    await runWorker({ task: { id: 't' }, brief: 'x', config: { projectDir: '/tmp' } });
  });
});
