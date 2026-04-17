/**
 * bin/event-stream.cjs
 *
 * Structured event stream for the unattended supervisor watch-tick (M38 ES).
 * Workers append events to `.gsd-t/events/YYYY-MM-DD.jsonl`; watch tick reads
 * new events since the persisted cursor.
 *
 * Contract: `.gsd-t/contracts/unattended-event-stream-contract.md` v1.0.0.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const EVENTS_DIR_REL = path.join(".gsd-t", "events");
const CURSOR_PATH_REL = path.join(".gsd-t", ".unattended", "event-cursor");

function eventsDir(projectDir) {
  return path.join(projectDir, EVENTS_DIR_REL);
}

function cursorPath(projectDir) {
  return path.join(projectDir, CURSOR_PATH_REL);
}

function todayFileDate(now) {
  const d = now || new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function eventFileFor(projectDir, fileDate) {
  return path.join(eventsDir(projectDir), `${fileDate}.jsonl`);
}

/**
 * Append one event to today's jsonl file. Atomic via append-only write with
 * a newline-terminated record. Never throws — failures are logged to stderr.
 *
 * @param {string} projectDir
 * @param {object} eventObj  — `type`, `iter`, `source`, plus type-specific fields
 * @returns {boolean} true on success, false on failure
 */
function appendEvent(projectDir, eventObj) {
  try {
    if (!eventObj || typeof eventObj !== "object") return false;
    const ev = Object.assign({}, eventObj);
    if (typeof ev.ts !== "string" || !ev.ts) {
      ev.ts = new Date().toISOString();
    }
    const dir = eventsDir(projectDir);
    fs.mkdirSync(dir, { recursive: true });
    const fileDate = todayFileDate(new Date(ev.ts));
    const file = eventFileFor(projectDir, fileDate);
    const line = JSON.stringify(ev) + "\n";
    fs.appendFileSync(file, line, "utf8");
    return true;
  } catch (err) {
    try {
      process.stderr.write(`[event-stream] appendEvent failed: ${err.message}\n`);
    } catch (_) { /* ignore */ }
    return false;
  }
}

function readCursor(projectDir) {
  try {
    const raw = fs.readFileSync(cursorPath(projectDir), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.fileDate === "string" && Number.isFinite(parsed.offset)) {
      return parsed;
    }
  } catch (_) { /* missing or malformed → treated as uninitialized */ }
  return null;
}

function writeCursor(projectDir, cursor) {
  try {
    const p = cursorPath(projectDir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cursor), "utf8");
    fs.renameSync(tmp, p);
    return true;
  } catch (err) {
    try {
      process.stderr.write(`[event-stream] writeCursor failed: ${err.message}\n`);
    } catch (_) { /* ignore */ }
    return false;
  }
}

function fileSize(p) {
  try {
    return fs.statSync(p).size;
  } catch (_) {
    return 0;
  }
}

function parseJsonlSlice(buf) {
  const text = buf.toString("utf8");
  const lines = text.split("\n");
  const hasPartialTail = text.length > 0 && !text.endsWith("\n");
  const consumable = hasPartialTail ? lines.slice(0, -1) : lines;
  const events = [];
  for (const line of consumable) {
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch (_) {
      try {
        process.stderr.write(`[event-stream] skipping malformed line\n`);
      } catch (__) { /* ignore */ }
    }
  }
  const consumedBytes = hasPartialTail
    ? Buffer.byteLength(consumable.join("\n") + (consumable.length ? "\n" : ""), "utf8")
    : buf.length;
  return { events, consumedBytes };
}

function readSlice(filePath, startOffset) {
  const size = fileSize(filePath);
  if (size <= startOffset) return { events: [], consumedBytes: 0, fileSize: size };
  const fd = fs.openSync(filePath, "r");
  try {
    const length = size - startOffset;
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, startOffset);
    const { events, consumedBytes } = parseJsonlSlice(buf);
    return { events, consumedBytes, fileSize: size };
  } finally {
    try { fs.closeSync(fd); } catch (_) { /* ignore */ }
  }
}

/**
 * Read all events from cursor to EOF. Handles day-boundary per contract §3:
 * if cursor points to a past file date, read remaining events from that file,
 * then read today's file from byte 0; advance cursor to today's EOF.
 *
 * If cursor is missing, initialize to today's file at current EOF (no backlog
 * surfaced on first read — matches contract §3 initial-cursor behavior).
 *
 * @param {string} projectDir
 * @returns {{events: object[], newCursor: {fileDate: string, offset: number}}}
 */
function readSinceCursor(projectDir) {
  const today = todayFileDate(new Date());
  let cursor = readCursor(projectDir);
  if (!cursor) {
    const todayFile = eventFileFor(projectDir, today);
    const size = fileSize(todayFile);
    const newCursor = { fileDate: today, offset: size };
    writeCursor(projectDir, newCursor);
    return { events: [], newCursor };
  }

  const result = [];
  let { fileDate, offset } = cursor;

  if (fileDate !== today) {
    const prev = eventFileFor(projectDir, fileDate);
    if (fs.existsSync(prev)) {
      const slice = readSlice(prev, offset);
      result.push(...slice.events);
    }
    fileDate = today;
    offset = 0;
  }

  const todayFile = eventFileFor(projectDir, today);
  if (fs.existsSync(todayFile)) {
    const slice = readSlice(todayFile, offset);
    result.push(...slice.events);
    offset = offset + slice.consumedBytes;
  } else {
    return { events: result, newCursor: { fileDate, offset } };
  }

  return { events: result, newCursor: { fileDate, offset } };
}

/**
 * Persist the cursor returned by readSinceCursor.
 * @param {string} projectDir
 * @param {{fileDate: string, offset: number}} newCursor
 */
function advanceCursor(projectDir, newCursor) {
  if (!newCursor || typeof newCursor.fileDate !== "string" || !Number.isFinite(newCursor.offset)) {
    return false;
  }
  return writeCursor(projectDir, newCursor);
}

module.exports = {
  appendEvent,
  readSinceCursor,
  advanceCursor,
  _internal: { todayFileDate, eventsDir, cursorPath, readCursor, writeCursor },
};
