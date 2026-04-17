/**
 * test/event-stream-m38.test.js
 *
 * Unit tests for bin/event-stream.cjs (M38 ES).
 * Contract: `.gsd-t/contracts/unattended-event-stream-contract.md` v1.0.0.
 *
 * NOTE: filename is `-m38` to avoid collision with the pre-existing
 * `test/event-stream.test.js` which covers the unrelated M14
 * `scripts/gsd-t-event-writer.js` heartbeat stream.
 */

"use strict";

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const {
  appendEvent,
  readSinceCursor,
  advanceCursor,
  _internal,
} = require("../bin/event-stream.cjs");

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-es-"));
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
});

function eventsFileForToday(dir) {
  const d = new Date();
  const today = _internal.todayFileDate(d);
  return path.join(dir, ".gsd-t", "events", `${today}.jsonl`);
}

function cursorFile(dir) {
  return path.join(dir, ".gsd-t", ".unattended", "event-cursor");
}

// ── appendEvent ──────────────────────────────────────────────────────────────

test("appendEvent — auto-creates dir/file and writes one JSONL line", () => {
  const ok = appendEvent(tmp, { type: "task_start", iter: 1, source: "worker", task: "T1" });
  assert.equal(ok, true);
  const file = eventsFileForToday(tmp);
  assert.ok(fs.existsSync(file));
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  const ev = JSON.parse(lines[0]);
  assert.equal(ev.type, "task_start");
  assert.equal(ev.task, "T1");
});

test("appendEvent — auto-sets ts if missing", () => {
  appendEvent(tmp, { type: "retry", iter: 2, source: "supervisor", attempt: 1, reason: "timeout" });
  const lines = fs.readFileSync(eventsFileForToday(tmp), "utf8").trim().split("\n");
  const ev = JSON.parse(lines[0]);
  assert.ok(typeof ev.ts === "string" && ev.ts.length > 0);
  assert.equal(new Date(ev.ts).toISOString(), ev.ts);
});

test("appendEvent — preserves explicit ts and routes file by ts date", () => {
  const ts = "2026-04-16T14:32:01.000Z";
  appendEvent(tmp, { ts, type: "task_complete", iter: 3, source: "worker", task: "T1", verdict: "pass", duration_s: 10 });
  const file = path.join(tmp, ".gsd-t", "events", "2026-04-16.jsonl");
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  const ev = JSON.parse(lines[0]);
  assert.equal(ev.ts, ts);
});

test("appendEvent — multiple events accumulate", () => {
  appendEvent(tmp, { type: "task_start", iter: 1, source: "worker", task: "A" });
  appendEvent(tmp, { type: "file_changed", iter: 1, source: "worker", path: "x.js", op: "modify" });
  appendEvent(tmp, { type: "task_complete", iter: 1, source: "worker", task: "A", verdict: "pass", duration_s: 5 });
  const lines = fs.readFileSync(eventsFileForToday(tmp), "utf8").trim().split("\n");
  assert.equal(lines.length, 3);
});

test("appendEvent — null/invalid input returns false silently", () => {
  assert.equal(appendEvent(tmp, null), false);
  assert.equal(appendEvent(tmp, undefined), false);
  assert.equal(appendEvent(tmp, "not-an-object"), false);
});

// ── readSinceCursor — initial cursor ────────────────────────────────────────

test("readSinceCursor — no events file, no cursor → initializes cursor to EOF 0, returns empty", () => {
  const { events, newCursor } = readSinceCursor(tmp);
  assert.deepEqual(events, []);
  assert.equal(newCursor.offset, 0);
  assert.ok(fs.existsSync(cursorFile(tmp)));
});

test("readSinceCursor — existing events, no cursor → surfaces NO backlog; cursor initialized at EOF", () => {
  appendEvent(tmp, { type: "task_start", iter: 1, source: "worker", task: "old-1" });
  appendEvent(tmp, { type: "task_complete", iter: 1, source: "worker", task: "old-1", verdict: "pass", duration_s: 2 });
  try { fs.rmSync(cursorFile(tmp), { force: true }); } catch (_) { /* ignore */ }
  const { events, newCursor } = readSinceCursor(tmp);
  assert.deepEqual(events, [], "initial cursor must NOT surface pre-existing events");
  assert.ok(newCursor.offset > 0, "cursor should advance to EOF");
});

// ── readSinceCursor — steady-state ──────────────────────────────────────────

test("readSinceCursor — reads new events since cursor", () => {
  readSinceCursor(tmp);
  appendEvent(tmp, { type: "task_start", iter: 5, source: "worker", task: "T5" });
  appendEvent(tmp, { type: "test_result", iter: 5, source: "worker", suite: "unit", pass: 100, fail: 0, total: 100 });
  appendEvent(tmp, { type: "task_complete", iter: 5, source: "worker", task: "T5", verdict: "pass", duration_s: 30 });
  const { events, newCursor } = readSinceCursor(tmp);
  assert.equal(events.length, 3);
  assert.equal(events[0].type, "task_start");
  assert.equal(events[2].type, "task_complete");
  advanceCursor(tmp, newCursor);
  const second = readSinceCursor(tmp);
  assert.deepEqual(second.events, [], "second read with no new events must return empty");
});

test("readSinceCursor — advanceCursor persists so subsequent reads resume correctly", () => {
  readSinceCursor(tmp);
  appendEvent(tmp, { type: "task_start", iter: 1, source: "worker", task: "A" });
  const r1 = readSinceCursor(tmp);
  assert.equal(r1.events.length, 1);
  advanceCursor(tmp, r1.newCursor);

  appendEvent(tmp, { type: "task_complete", iter: 1, source: "worker", task: "A", verdict: "pass", duration_s: 1 });
  const r2 = readSinceCursor(tmp);
  assert.equal(r2.events.length, 1, "only new event after cursor advance");
  assert.equal(r2.events[0].type, "task_complete");
});

// ── readSinceCursor — partial-last-line handling ─────────────────────────────

test("readSinceCursor — partial last line (no trailing newline) is NOT consumed", () => {
  readSinceCursor(tmp);
  const file = eventsFileForToday(tmp);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{"type":"task_start","iter":1,"source":"worker","task":"A"}\n{"type":"task_comple', "utf8");
  const { events, newCursor } = readSinceCursor(tmp);
  assert.equal(events.length, 1, "only the complete line surfaces");
  assert.equal(events[0].type, "task_start");
  const completeLine = '{"type":"task_start","iter":1,"source":"worker","task":"A"}\n';
  assert.equal(newCursor.offset, Buffer.byteLength(completeLine, "utf8"));

  fs.appendFileSync(file, 'te","iter":1,"source":"worker","task":"A","verdict":"pass","duration_s":3}\n', "utf8");
  advanceCursor(tmp, newCursor);
  const r2 = readSinceCursor(tmp);
  assert.equal(r2.events.length, 1);
  assert.equal(r2.events[0].type, "task_complete");
});

// ── readSinceCursor — malformed line skip ───────────────────────────────────

test("readSinceCursor — malformed JSON lines are skipped silently", () => {
  readSinceCursor(tmp);
  const file = eventsFileForToday(tmp);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const content = [
    '{"type":"task_start","iter":1,"source":"worker","task":"A"}',
    '{this-is-not-json',
    '{"type":"task_complete","iter":1,"source":"worker","task":"A","verdict":"pass","duration_s":1}',
  ].join("\n") + "\n";
  fs.writeFileSync(file, content, "utf8");
  const { events } = readSinceCursor(tmp);
  assert.equal(events.length, 2, "malformed middle line skipped");
  assert.equal(events[0].type, "task_start");
  assert.equal(events[1].type, "task_complete");
});

// ── readSinceCursor — day boundary ──────────────────────────────────────────

test("readSinceCursor — day boundary: reads remainder of yesterday + today from 0", () => {
  const eventsDir = path.join(tmp, ".gsd-t", "events");
  fs.mkdirSync(eventsDir, { recursive: true });

  const yesterday = "2026-04-15";
  const today = _internal.todayFileDate(new Date());
  assert.notEqual(yesterday, today);

  const yFile = path.join(eventsDir, `${yesterday}.jsonl`);
  fs.writeFileSync(
    yFile,
    '{"type":"task_start","iter":1,"source":"worker","task":"Y1"}\n{"type":"task_complete","iter":1,"source":"worker","task":"Y1","verdict":"pass","duration_s":1}\n',
    "utf8"
  );

  const firstLineBytes = Buffer.byteLength(
    '{"type":"task_start","iter":1,"source":"worker","task":"Y1"}\n',
    "utf8"
  );
  const cursor = { fileDate: yesterday, offset: firstLineBytes };
  fs.mkdirSync(path.dirname(cursorFile(tmp)), { recursive: true });
  fs.writeFileSync(cursorFile(tmp), JSON.stringify(cursor), "utf8");

  const tFile = path.join(eventsDir, `${today}.jsonl`);
  fs.writeFileSync(
    tFile,
    '{"type":"task_start","iter":2,"source":"worker","task":"T1"}\n',
    "utf8"
  );

  const { events, newCursor } = readSinceCursor(tmp);
  assert.equal(events.length, 2, "remainder of yesterday (1) + all of today (1)");
  assert.equal(events[0].task, "Y1");
  assert.equal(events[0].type, "task_complete");
  assert.equal(events[1].task, "T1");
  assert.equal(newCursor.fileDate, today);
  assert.ok(newCursor.offset > 0);
});

// ── readSinceCursor — missing events file ───────────────────────────────────

test("readSinceCursor — cursor exists but today's file missing → returns empty, cursor unchanged", () => {
  const today = _internal.todayFileDate(new Date());
  const cursor = { fileDate: today, offset: 0 };
  fs.mkdirSync(path.dirname(cursorFile(tmp)), { recursive: true });
  fs.writeFileSync(cursorFile(tmp), JSON.stringify(cursor), "utf8");
  const { events, newCursor } = readSinceCursor(tmp);
  assert.deepEqual(events, []);
  assert.equal(newCursor.fileDate, today);
  assert.equal(newCursor.offset, 0);
});

// ── advanceCursor ────────────────────────────────────────────────────────────

test("advanceCursor — round-trip writes cursor atomically", () => {
  const cursor = { fileDate: "2026-04-16", offset: 1024 };
  const ok = advanceCursor(tmp, cursor);
  assert.equal(ok, true);
  const onDisk = JSON.parse(fs.readFileSync(cursorFile(tmp), "utf8"));
  assert.deepEqual(onDisk, cursor);
});

test("advanceCursor — invalid input returns false", () => {
  assert.equal(advanceCursor(tmp, null), false);
  assert.equal(advanceCursor(tmp, { offset: 10 }), false);
  assert.equal(advanceCursor(tmp, { fileDate: "2026-04-16", offset: "nope" }), false);
});
