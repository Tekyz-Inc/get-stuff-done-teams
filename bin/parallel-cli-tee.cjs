'use strict';

/**
 * GSD-T parallel-cli tee helper (M55 D2)
 *
 * Streams stdout/stderr from a child process to NDJSON files under a tee
 * directory, OR captures into a 1 MB-capped in-memory buffer that rotates
 * to a tmp file on overflow.
 *
 * Contract: .gsd-t/contracts/parallel-cli-contract.md v1.0.0 § Tee Paths.
 *
 * Hard rules:
 *   1. Zero external runtime deps.
 *   2. NDJSON line shape: {"t": isoTs, "stream": "stdout"|"stderr", "data": line}.
 *   3. Mid-stream binary fragments tolerated — bytes copied verbatim into `data`.
 *   4. In-memory cap: 1 MB per stream. On overflow → rotate to os.tmpdir().
 *   5. fs writes use append-mode + flushSync on close.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const IN_MEMORY_CAP_BYTES = 1024 * 1024;

const VALID_ID_RE = /^[A-Za-z0-9._-]+$/;

function _now() {
  return new Date().toISOString();
}

function _ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function _writeNdjsonLine(fd, streamName, data) {
  const line = JSON.stringify({ t: _now(), stream: streamName, data }) + '\n';
  fs.writeSync(fd, line);
}

/**
 * Attach a tee to a child process's stdout + stderr.
 *
 * @param {object} child  child_process.ChildProcess
 * @param {object} opts
 * @param {string} opts.workerId
 * @param {string|null} opts.teeDir  if null/undefined, in-memory mode
 * @returns {{
 *   stdoutPath: string|null,
 *   stderrPath: string|null,
 *   stdoutBytes: () => number,
 *   stderrBytes: () => number,
 *   stdoutTruncatedToTemp: () => boolean,
 *   stderrTruncatedToTemp: () => boolean,
 *   close: () => Promise<void>,
 * }}
 */
function attachTee(child, opts) {
  if (!opts || typeof opts.workerId !== 'string') {
    throw new Error('attachTee: opts.workerId is required');
  }
  if (!VALID_ID_RE.test(opts.workerId)) {
    throw new Error('attachTee: workerId contains illegal characters: ' + opts.workerId);
  }

  const teeDir = opts.teeDir || null;

  if (teeDir) {
    return _attachFileMode(child, opts.workerId, teeDir);
  }
  return _attachMemoryMode(child, opts.workerId);
}

// ── File-mode tee ───────────────────────────────────────────────────────────

function _attachFileMode(child, workerId, teeDir) {
  _ensureDir(teeDir);
  const stdoutPath = path.join(teeDir, workerId + '.stdout.ndjson');
  const stderrPath = path.join(teeDir, workerId + '.stderr.ndjson');
  const stdoutFd = fs.openSync(stdoutPath, 'a');
  const stderrFd = fs.openSync(stderrPath, 'a');

  const counters = { stdoutBytes: 0, stderrBytes: 0 };

  function onChunk(streamName, fd, chunk) {
    if (!chunk) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    counters[streamName + 'Bytes'] += buf.length;
    // Split on newlines to keep NDJSON line-delimited even when multiple
    // lines arrive in a single chunk; trailing partial line goes through as-is.
    const text = buf.toString('utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const isLast = i === lines.length - 1;
      const piece = lines[i];
      if (isLast && piece === '') continue; // trailing newline handled
      _writeNdjsonLine(fd, streamName, piece);
    }
  }

  if (child.stdout) child.stdout.on('data', (c) => onChunk('stdout', stdoutFd, c));
  if (child.stderr) child.stderr.on('data', (c) => onChunk('stderr', stderrFd, c));

  let closed = false;
  function close() {
    if (closed) return Promise.resolve();
    closed = true;
    try { fs.fsyncSync(stdoutFd); } catch (_) { /* ignore */ }
    try { fs.fsyncSync(stderrFd); } catch (_) { /* ignore */ }
    try { fs.closeSync(stdoutFd); } catch (_) { /* ignore */ }
    try { fs.closeSync(stderrFd); } catch (_) { /* ignore */ }
    return Promise.resolve();
  }

  return {
    stdoutPath,
    stderrPath,
    stdoutBytes: () => counters.stdoutBytes,
    stderrBytes: () => counters.stderrBytes,
    stdoutTruncatedToTemp: () => false,
    stderrTruncatedToTemp: () => false,
    close,
  };
}

// ── Memory-mode tee ────────────────────────────────────────────────────────

function _attachMemoryMode(child, workerId) {
  const buffers = {
    stdout: { chunks: [], bytes: 0, rotatedPath: null },
    stderr: { chunks: [], bytes: 0, rotatedPath: null },
  };

  function rotate(streamName) {
    const slot = buffers[streamName];
    if (slot.rotatedPath) return slot.rotatedPath;
    const ts = Date.now();
    const tmpPath = path.join(
      os.tmpdir(),
      'parallel-cli-' + workerId + '-' + streamName + '-' + ts + '.tmp'
    );
    try {
      const fd = fs.openSync(tmpPath, 'a');
      for (const ch of slot.chunks) {
        fs.writeSync(fd, ch);
      }
      fs.closeSync(fd);
      slot.rotatedPath = tmpPath;
      slot.chunks = []; // free memory
    } catch (_) {
      // best-effort; if rotate fails we keep the buffer
    }
    return slot.rotatedPath;
  }

  function appendToTemp(streamName, chunk) {
    const slot = buffers[streamName];
    try {
      const fd = fs.openSync(slot.rotatedPath, 'a');
      fs.writeSync(fd, chunk);
      fs.closeSync(fd);
    } catch (_) { /* best-effort */ }
  }

  function onChunk(streamName, chunk) {
    if (!chunk) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    const slot = buffers[streamName];
    slot.bytes += buf.length;
    if (slot.rotatedPath) {
      appendToTemp(streamName, buf);
      return;
    }
    slot.chunks.push(buf);
    if (slot.bytes >= IN_MEMORY_CAP_BYTES) {
      rotate(streamName);
    }
  }

  if (child.stdout) child.stdout.on('data', (c) => onChunk('stdout', c));
  if (child.stderr) child.stderr.on('data', (c) => onChunk('stderr', c));

  let closed = false;
  function close() {
    if (closed) return Promise.resolve();
    closed = true;
    return Promise.resolve();
  }

  return {
    stdoutPath: null,
    stderrPath: null,
    stdoutBytes: () => buffers.stdout.bytes,
    stderrBytes: () => buffers.stderr.bytes,
    stdoutTruncatedToTemp: () => buffers.stdout.rotatedPath !== null,
    stderrTruncatedToTemp: () => buffers.stderr.rotatedPath !== null,
    rotatedPath: (streamName) => buffers[streamName] && buffers[streamName].rotatedPath,
    close,
  };
}

module.exports = {
  attachTee,
  IN_MEMORY_CAP_BYTES,
  VALID_ID_RE,
};
