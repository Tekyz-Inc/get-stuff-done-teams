/**
 * test/unattended-watch.test.js
 *
 * Snapshot tests for bin/unattended-watch-format.cjs (M38 ES-T3).
 * Contract: `.gsd-t/contracts/unattended-event-stream-contract.md` §4.
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { formatWatchTick, formatTerminalBlock } = require("../bin/unattended-watch-format.cjs");

const FIXED_NOW = Date.parse("2026-04-16T14:40:30.000Z");
const STARTED_AT = "2026-04-16T14:31:00.000Z"; // 9m30s before FIXED_NOW

// ── Snapshot 1: active iteration with full lifecycle ────────────────────────

test("formatWatchTick — active iteration with files, tests, verdict, completion", () => {
  const events = [
    { ts: "2026-04-16T14:32:01Z", iter: 14, type: "task_start", source: "worker", milestone: "M38", wave: "wave-1", task: "m38-h1-T3" },
    { ts: "2026-04-16T14:32:05Z", iter: 14, type: "file_changed", source: "worker", path: "commands/gsd-t-execute.md", op: "modify" },
    { ts: "2026-04-16T14:32:06Z", iter: 14, type: "file_changed", source: "worker", path: "commands/gsd-t-wave.md", op: "modify" },
    { ts: "2026-04-16T14:34:12Z", iter: 14, type: "test_result", source: "worker", suite: "unit", pass: 1228, fail: 0, total: 1228 },
    { ts: "2026-04-16T14:36:00Z", iter: 14, type: "subagent_verdict", source: "subagent", agent: "qa", verdict: "pass", findings_count: 0 },
    { ts: "2026-04-16T14:40:13Z", iter: 14, type: "task_complete", source: "worker", task: "m38-h1-T3", verdict: "pass", duration_s: 492 },
  ];
  const out = formatWatchTick({ events, state: { iter: 14, startedAt: STARTED_AT }, now: FIXED_NOW });
  const expected = [
    "[unattended supervisor — iter 14, +9m elapsed]",
    "  ▶  task: m38-h1-T3 (wave wave-1)",
    "  📝  2 files modified (commands/gsd-t-execute.md, commands/gsd-t-wave.md)",
    "  ✅  test_result: unit 1228/1228 pass",
    "  ✅  subagent_verdict: qa pass (0 findings)",
    "  ⏱  duration: 8m 12s · verdict: pass",
  ].join("\n");
  assert.equal(out, expected);
});

// ── Snapshot 2: no events ────────────────────────────────────────────────────

test("formatWatchTick — no events → 'no new activity' marker", () => {
  const out = formatWatchTick({ events: [], state: { iter: 15, startedAt: STARTED_AT }, now: FIXED_NOW });
  assert.equal(out, "[unattended supervisor — iter 15, +9m elapsed] (no new activity since last tick)");
});

// ── Snapshot 3: terminal status block ───────────────────────────────────────

test("formatTerminalBlock — done/failed/stopped/crashed render distinct messages", () => {
  assert.match(formatTerminalBlock({ status: "done", milestone: "M38", iter: 14 }), /COMPLETED the milestone \(M38, iter 14\)/);
  assert.match(formatTerminalBlock({ status: "failed", lastExit: 4, iter: 7 }), /HALTED.*last exit 4.*iter 7/);
  assert.match(formatTerminalBlock({ status: "stopped", iter: 3 }), /STOPPED by user \(iter 3\)/);
  assert.match(formatTerminalBlock({ status: "crashed", iter: 9 }), /CRASHED \(iter 9\)/);
  assert.equal(formatTerminalBlock({ status: "running" }), null);
});

// ── Extra: file truncation > 5, multi-iteration, error+retry events ─────────

test("formatWatchTick — >5 files shows first 5 + 'and N more'", () => {
  const paths = ["a.js", "b.js", "c.js", "d.js", "e.js", "f.js", "g.js"];
  const events = paths.map((p, i) => ({
    ts: `2026-04-16T14:32:0${i}Z`, iter: 20, type: "file_changed", source: "worker", path: p, op: "modify",
  }));
  const out = formatWatchTick({ events, state: { iter: 20, startedAt: STARTED_AT }, now: FIXED_NOW });
  assert.match(out, /7 files modified/);
  assert.match(out, /a\.js, b\.js, c\.js, d\.js, e\.js … and 2 more/);
});

test("formatWatchTick — multi-iteration groups events by iter with sub-headers", () => {
  const events = [
    { ts: "2026-04-16T14:32:01Z", iter: 14, type: "task_start", source: "worker", task: "T14" },
    { ts: "2026-04-16T14:40:13Z", iter: 14, type: "task_complete", source: "worker", task: "T14", verdict: "pass", duration_s: 60 },
    { ts: "2026-04-16T14:41:00Z", iter: 15, type: "task_start", source: "worker", task: "T15" },
  ];
  const out = formatWatchTick({ events, state: { iter: 15, startedAt: STARTED_AT }, now: FIXED_NOW });
  assert.match(out, /\[iter 14\]/);
  assert.match(out, /\[iter 15\]/);
  assert.match(out, /task: T14/);
  assert.match(out, /task: T15/);
});

test("formatWatchTick — error + retry events render with distinct glyphs", () => {
  const events = [
    { ts: "2026-04-16T14:32:00Z", iter: 5, type: "error", source: "supervisor", error: "worker exit 3", recoverable: true },
    { ts: "2026-04-16T14:32:01Z", iter: 5, type: "retry", source: "supervisor", attempt: 5, reason: "exit_3" },
  ];
  const out = formatWatchTick({ events, state: { iter: 5, startedAt: STARTED_AT }, now: FIXED_NOW });
  assert.match(out, /❌ {2}error: worker exit 3 \[recoverable\]/);
  assert.match(out, /🔁 {2}retry: attempt 5 — exit_3/);
});
