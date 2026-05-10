'use strict';

/**
 * M55 D2 — parallel-cli substrate: library + tee + CLI surface.
 *
 * Test plan (per task T4 + parallel-cli-contract.md § Test Surface):
 *  1. happy parallel — 3 workers, all succeed
 *  2. exceeds-cap throttling — 5 workers maxConcurrency=2, peak in-flight ≤ 2
 *  3. single fail-fast — first non-zero exit cancels siblings
 *  4. per-worker timeout — kills only that worker
 *  5. tee paths valid — NDJSON files exist + parse
 *  6. captureSpawn invariant — token-log row written for every worker
 *  7. validation — bad workers / dup ids / missing maxConcurrency reject
 *  8. determinism — results sorted by id ASC regardless of finish order
 *  9. CLI thin — `node bin/parallel-cli.cjs --plan FILE --json` produces envelope
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const LIB_PATH = path.resolve(__dirname, '..', 'bin', 'parallel-cli.cjs');
const TEE_PATH = path.resolve(__dirname, '..', 'bin', 'parallel-cli-tee.cjs');
const { runParallel } = require(LIB_PATH);

function makeTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m55-d2-'));
}
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function nodeWorker(id, ms, exitCode = 0) {
  return {
    id,
    cmd: process.execPath,
    args: ['-e', `setTimeout(() => process.exit(${exitCode}), ${ms})`],
  };
}

// ── 1. Happy parallel ──────────────────────────────────────────────────────

test('runParallel: 3 workers, all succeed → ok=true, results sorted by id', async () => {
  const dir = makeTmpProject();
  try {
    const r = await runParallel({
      workers: [nodeWorker('c', 50), nodeWorker('a', 50), nodeWorker('b', 50)],
      maxConcurrency: 3,
      projectDir: dir,
    });
    assert.equal(r.schemaVersion, '1.0.0');
    assert.equal(r.ok, true);
    assert.equal(r.results.length, 3);
    assert.deepEqual(r.results.map((x) => x.id), ['a', 'b', 'c']);
    for (const w of r.results) {
      assert.equal(w.exitCode, 0);
      assert.equal(w.cancelled, false);
      assert.equal(w.timedOut, false);
      assert.equal(typeof w.durationMs, 'number');
    }
    assert.equal(typeof r.wallClockMs, 'number');
    assert.equal(r.maxConcurrencyApplied, 3);
  } finally { cleanup(dir); }
});

// ── 2. Exceeds-cap throttling ──────────────────────────────────────────────

test('runParallel: 5 workers @ maxConcurrency=2 → peak in-flight ≤ 2 (observed)', async () => {
  // Use start/end marker files so the test asserts on observed peak concurrency
  // rather than wall-clock timing — robust under loaded CI / shared hosts.
  const dir = makeTmpProject();
  const markersDir = path.join(dir, 'markers');
  fs.mkdirSync(markersDir, { recursive: true });
  try {
    const dur = 80;
    function markerWorker(id, sleepMs) {
      const code = [
        `const fs = require("fs");`,
        `const dir = ${JSON.stringify(markersDir)};`,
        `fs.writeFileSync(dir + "/${id}.start", Date.now().toString());`,
        `setTimeout(() => {`,
        `  fs.writeFileSync(dir + "/${id}.end", Date.now().toString());`,
        `  process.exit(0);`,
        `}, ${sleepMs});`,
      ].join('');
      return { id, cmd: process.execPath, args: ['-e', code] };
    }
    const r = await runParallel({
      workers: [
        markerWorker('w1', dur), markerWorker('w2', dur), markerWorker('w3', dur),
        markerWorker('w4', dur), markerWorker('w5', dur),
      ],
      maxConcurrency: 2,
      projectDir: dir,
    });
    assert.equal(r.ok, true);
    assert.equal(r.results.length, 5);

    // Walk the (start,end) intervals and count peak overlap.
    const events = [];
    for (let i = 1; i <= 5; i++) {
      const startMs = parseInt(fs.readFileSync(path.join(markersDir, `w${i}.start`), 'utf8'), 10);
      const endMs   = parseInt(fs.readFileSync(path.join(markersDir, `w${i}.end`),   'utf8'), 10);
      events.push({ t: startMs, d: +1 });
      events.push({ t: endMs,   d: -1 });
    }
    events.sort((a, b) => (a.t - b.t) || (a.d - b.d));
    let inFlight = 0;
    let peak = 0;
    for (const ev of events) {
      inFlight += ev.d;
      if (inFlight > peak) peak = inFlight;
    }
    assert.ok(peak <= 2,
      `peak observed in-flight should be ≤ maxConcurrency=2, got peak=${peak}`);
  } finally { cleanup(dir); }
});

// ── 3. failFast — first non-zero exit cancels siblings ─────────────────────

test('runParallel: failFast=true cancels in-flight siblings via SIGTERM', async () => {
  const dir = makeTmpProject();
  try {
    const r = await runParallel({
      workers: [
        // a fails fast (50ms), b+c run for 5s → should be cancelled
        nodeWorker('a', 50, 1),
        nodeWorker('b', 5000),
        nodeWorker('c', 5000),
      ],
      maxConcurrency: 3,
      failFast: true,
      projectDir: dir,
    });
    assert.equal(r.ok, false);
    const a = r.results.find((x) => x.id === 'a');
    const b = r.results.find((x) => x.id === 'b');
    const c = r.results.find((x) => x.id === 'c');
    assert.equal(a.exitCode, 1);
    assert.equal(a.cancelled, false);
    assert.ok(b.cancelled || b.signal != null, 'b should be cancelled or signaled');
    assert.ok(c.cancelled || c.signal != null, 'c should be cancelled or signaled');
    // wall-clock should be FAR less than 5s — siblings were killed immediately on a's failure
    assert.ok(r.wallClockMs < 3000,
      `failFast should kill siblings quickly, wallClockMs=${r.wallClockMs}`);
  } finally { cleanup(dir); }
});

// ── 4. Per-worker timeout — kills only that worker ─────────────────────────

test('runParallel: per-worker timeout kills only that worker; siblings finish', async () => {
  const dir = makeTmpProject();
  try {
    const r = await runParallel({
      workers: [
        // a: 5s, but timeoutMs=300 → killed
        { ...nodeWorker('a', 5000), timeoutMs: 300 },
        // b: 500ms normal completion
        nodeWorker('b', 500),
      ],
      maxConcurrency: 2,
      projectDir: dir,
    });
    const a = r.results.find((x) => x.id === 'a');
    const b = r.results.find((x) => x.id === 'b');
    assert.equal(a.timedOut, true);
    assert.equal(a.cancelled, true);
    assert.equal(a.ok, false);
    assert.equal(b.ok, true);
    assert.equal(b.exitCode, 0);
    assert.equal(r.ok, false);
  } finally { cleanup(dir); }
});

// ── 5. Tee paths valid — NDJSON files exist + parse ────────────────────────

test('runParallel: with teeDir, per-worker NDJSON files exist and parse', async () => {
  const dir = makeTmpProject();
  const teeDir = path.join(dir, 'tee');
  try {
    const r = await runParallel({
      workers: [
        {
          id: 'echo1',
          cmd: process.execPath,
          args: ['-e', 'console.log("hello-out"); console.error("hello-err"); process.exit(0)'],
        },
        {
          id: 'echo2',
          cmd: process.execPath,
          args: ['-e', 'console.log("line-A"); console.log("line-B"); process.exit(0)'],
        },
      ],
      maxConcurrency: 2,
      teeDir,
      projectDir: dir,
    });
    assert.equal(r.ok, true);
    for (const w of r.results) {
      assert.ok(w.stdoutPath, `${w.id} should have stdoutPath`);
      assert.ok(w.stderrPath, `${w.id} should have stderrPath`);
      assert.ok(fs.existsSync(w.stdoutPath));
      assert.ok(fs.existsSync(w.stderrPath));
      const stdoutText = fs.readFileSync(w.stdoutPath, 'utf8');
      const lines = stdoutText.trim().split('\n').filter(Boolean);
      // Must be parseable NDJSON
      for (const ln of lines) {
        const obj = JSON.parse(ln);
        assert.equal(obj.stream, 'stdout');
        assert.equal(typeof obj.t, 'string');
        assert.equal(typeof obj.data, 'string');
      }
    }
  } finally { cleanup(dir); }
});

// ── 6. captureSpawn invariant — token-log row written ──────────────────────

test('runParallel: every worker writes a token-log row (captureSpawn invariant)', async () => {
  const dir = makeTmpProject();
  try {
    fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
    const r = await runParallel({
      workers: [nodeWorker('alpha', 50), nodeWorker('beta', 50)],
      maxConcurrency: 2,
      projectDir: dir,
      command: 'parallel-cli-test',
      step: 'unit',
      domain: 'm55-d2',
      task: 'T4',
    });
    assert.equal(r.ok, true);
    const tokenLogPath = path.join(dir, '.gsd-t', 'token-log.md');
    assert.ok(fs.existsSync(tokenLogPath), 'token-log.md should be created');
    const text = fs.readFileSync(tokenLogPath, 'utf8');
    // canonical header present
    assert.ok(text.includes('| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Tokens |'));
    // 2 worker rows, both with `—` in the Tokens column (CLIs are zero-token)
    const dataLines = text.split('\n').filter((l) =>
      l.startsWith('|') && l.includes('parallel-cli-test') && !l.includes('Datetime-start')
    );
    assert.equal(dataLines.length, 2, 'expected 2 token-log rows, got ' + dataLines.length);
    for (const line of dataLines) {
      // The Tokens cell is the 7th `|`-delimited column (index 6 after the leading empty)
      // Format: `| s | e | cmd | step | model | dur | TOKENS | notes | dom | task | ctx |`
      const cols = line.split('|').map((c) => c.trim());
      // cols[0] is empty (leading |), cols[1..] are columns
      assert.equal(cols[7], '—',
        `expected '—' in Tokens column, got '${cols[7]}' (full line: ${line})`);
    }
    // metrics jsonl also emitted
    const jsonlPath = path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl');
    assert.ok(fs.existsSync(jsonlPath));
    const jsonlLines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
    assert.equal(jsonlLines.length, 2);
    for (const ln of jsonlLines) {
      const rec = JSON.parse(ln);
      assert.equal(rec.command, 'parallel-cli-test');
      assert.equal(rec.hasUsage, false, 'CLI workers must not fabricate usage');
    }
  } finally { cleanup(dir); }
});

// ── 7. Validation — bad opts reject ────────────────────────────────────────

test('runParallel: validates required opts', async () => {
  await assert.rejects(
    () => runParallel({}),
    /workers must be a non-empty array/,
  );
  await assert.rejects(
    () => runParallel({ workers: [nodeWorker('a', 10)] }),
    /maxConcurrency must be a positive integer/,
  );
  await assert.rejects(
    () => runParallel({ workers: [nodeWorker('a', 10), nodeWorker('a', 10)], maxConcurrency: 1 }),
    /duplicate worker.id/,
  );
  await assert.rejects(
    () => runParallel({ workers: [{ id: 'has space', cmd: 'x', args: [] }], maxConcurrency: 1 }),
    /illegal characters/,
  );
  await assert.rejects(
    () => runParallel({ workers: [{ id: 'ok', cmd: '', args: [] }], maxConcurrency: 1 }),
    /worker.cmd is required/,
  );
});

// ── 8. Determinism — results sorted by id ASC ──────────────────────────────

test('runParallel: results sorted by id ASC regardless of completion order', async () => {
  const dir = makeTmpProject();
  try {
    // Reverse durations so 'z' finishes first, 'a' finishes last
    const r = await runParallel({
      workers: [
        { ...nodeWorker('a', 200) },
        { ...nodeWorker('m', 100) },
        { ...nodeWorker('z', 30) },
      ],
      maxConcurrency: 3,
      projectDir: dir,
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.results.map((x) => x.id), ['a', 'm', 'z']);
  } finally { cleanup(dir); }
});

// ── 9. CLI thin layer ──────────────────────────────────────────────────────

test('CLI: --plan + --max-concurrency + --json produces envelope', () => {
  const dir = makeTmpProject();
  try {
    const plan = {
      workers: [
        { id: 'p1', cmd: process.execPath, args: ['-e', 'process.exit(0)'] },
        { id: 'p2', cmd: process.execPath, args: ['-e', 'process.exit(0)'] },
      ],
    };
    const planPath = path.join(dir, 'plan.json');
    fs.writeFileSync(planPath, JSON.stringify(plan));
    const out = execFileSync(process.execPath, [
      LIB_PATH, '--plan', planPath, '--max-concurrency', '2', '--json',
    ], { cwd: dir, encoding: 'utf8' });
    // Strip captureSpawn banner lines (lines starting with ⚙) before parsing JSON
    const lines = out.split('\n');
    const jsonStart = lines.findIndex((l) => l.startsWith('{'));
    assert.ok(jsonStart >= 0, 'expected JSON envelope after banners; got: ' + out);
    const envelope = JSON.parse(lines.slice(jsonStart).join('\n'));
    assert.equal(envelope.schemaVersion, '1.0.0');
    assert.equal(envelope.ok, true);
    assert.equal(envelope.results.length, 2);
    assert.deepEqual(envelope.results.map((x) => x.id), ['p1', 'p2']);
  } finally { cleanup(dir); }
});

test('CLI: missing --max-concurrency exits 2', () => {
  let caught;
  try {
    execFileSync(process.execPath, [LIB_PATH, '--plan', '/dev/null'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) { caught = e; }
  assert.ok(caught, 'CLI should have failed without --max-concurrency');
  assert.equal(caught.status, 2);
});

// ── 10. Tee helper — in-memory mode ─────────────────────────────────────────

test('attachTee: in-memory mode rotates to tmp on >1MB overflow', async () => {
  const { IN_MEMORY_CAP_BYTES } = require(TEE_PATH);
  // Run a worker that emits >1MB to stdout (built inside the child to dodge
  // arg-list E2BIG). Confirm rotatedPath is set on overflow.
  const dir = makeTmpProject();
  try {
    const r = await runParallel({
      workers: [{
        id: 'big',
        cmd: process.execPath,
        args: ['-e', [
          'const n = ' + (IN_MEMORY_CAP_BYTES * 2) + ';',
          'const chunk = "x".repeat(64 * 1024);',
          'let written = 0;',
          'function flush() {',
          '  while (written < n) {',
          '    const left = n - written;',
          '    const c = left < chunk.length ? chunk.slice(0, left) : chunk;',
          '    if (!process.stdout.write(c)) return process.stdout.once("drain", flush);',
          '    written += c.length;',
          '  }',
          '  process.exit(0);',
          '}',
          'flush();',
        ].join('')],
      }],
      maxConcurrency: 1,
      projectDir: dir,
      // teeDir omitted → memory mode
    });
    assert.equal(r.ok, true);
    const w = r.results[0];
    assert.equal(w.stdoutPath, null, 'memory mode should leave stdoutPath null');
    assert.ok(w.stdoutBytes >= IN_MEMORY_CAP_BYTES,
      `expected stdoutBytes ≥ ${IN_MEMORY_CAP_BYTES}, got ${w.stdoutBytes}`);
    assert.equal(w.stdoutTruncatedToTemp, true,
      'overflow >1MB should rotate to temp; got: ' + JSON.stringify(w));
  } finally { cleanup(dir); }
});
