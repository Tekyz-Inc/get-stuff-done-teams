'use strict';
/**
 * M43 D2-T7 — performance gate.
 *
 * Synthesizes 30k events + 3k turns, asserts that
 * joinTurnsAndEvents + aggregateByTool completes in < 3s on a dev laptop.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const {
  joinTurnsAndEvents,
  aggregateByTool,
} = require('../bin/gsd-t-tool-attribution.cjs');

function writeJsonl(p, rows) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

test('perf gate: 3k turns × 30k events — join + aggregate in < 3s', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m43-d2-perf-'));
  try {
    const turns = [];
    const events = [];
    const tools = ['Bash', 'Read', 'Edit', 'Grep', 'Task', 'WebFetch', 'Glob', 'Write', 'ToolSearch'];
    const sessions = 30; // 3000 turns / 30 sessions = 100 turns per session
    const turnsPerSession = 100;
    const eventsPerTurn = 10; // 30000 events total
    const baseMs = Date.parse('2026-04-21T00:00:00.000Z');

    for (let s = 0; s < sessions; s++) {
      const sid = `sess-${s}`;
      for (let t = 0; t < turnsPerSession; t++) {
        const turnMs = baseMs + ((s * turnsPerSession + t) * 60_000); // 1 minute apart
        const iso = new Date(turnMs).toISOString();
        turns.push({
          schemaVersion: 2,
          ts: iso,
          source: 'live',
          command: 'in-session',
          step: 'turn',
          model: 'sonnet',
          startedAt: iso.slice(0, 16).replace('T', ' '),
          endedAt:   iso.slice(0, 16).replace('T', ' '),
          durationMs: 0,
          inputTokens: 10,
          outputTokens: 100,
          cacheReadInputTokens: 5000,
          cacheCreationInputTokens: 200,
          costUSD: 0.01,
          domain: (s % 2 === 0) ? 'auth' : 'payments',
          task: null,
          milestone: 'M43',
          ctxPct: null,
          notes: null,
          hasUsage: true,
          session_id: sid,
          turn_id: `t-${t}`,
          sessionType: 'in-session',
        });
        for (let e = 0; e < eventsPerTurn; e++) {
          const evMs = turnMs + 1000 + (e * 500); // after turn, before next
          events.push({
            ts: new Date(evMs).toISOString(),
            event_type: 'tool_call',
            command: null,
            phase: null,
            trace_id: null,
            agent_id: sid,
            parent_agent_id: null,
            reasoning: tools[(s + t + e) % tools.length],
            outcome: null,
          });
        }
      }
    }
    assert.equal(turns.length, 3000);
    assert.equal(events.length, 30000);

    const turnsPath  = path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl');
    const eventsPath = path.join(dir, '.gsd-t', 'events', '2026-04-21.jsonl');
    writeJsonl(turnsPath, turns);
    writeJsonl(eventsPath, events);

    const t0 = performance.now();
    const joined = joinTurnsAndEvents({
      turnsPath,
      eventsGlob: path.join(dir, '.gsd-t', 'events'),
    });
    const agg = aggregateByTool(joined);
    const t1 = performance.now();
    const elapsed = t1 - t0;

    // Functional assertions.
    assert.equal(joined.length, 3000);
    assert.ok(agg.length >= 2, `expected multiple tool keys, got ${agg.length}`);

    // Perf assertion.
    assert.ok(elapsed < 3000, `perf gate failed: ${elapsed.toFixed(0)}ms > 3000ms`);

    // Sanity: log wall-clock (helpful when gate drifts in CI).
    process.stdout.write(`[perf-gate] 3k turns × 30k events joined+aggregated in ${elapsed.toFixed(0)}ms\n`);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
});
