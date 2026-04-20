'use strict';
/**
 * GSD-T Stream Feed Client (M40 D4-T3)
 *
 * Orchestrator/worker-side push helper. Opens a single keep-alive chunked
 * HTTP POST to /ingest?workerPid=&taskId=; each pushFrame writes one JSON line.
 * On server unreachable: spools to .gsd-t/stream-feed/spool-{pid}.jsonl and
 * stays in spool mode. close() flushes + ends the HTTP stream.
 *
 * Contract: .gsd-t/contracts/stream-json-sink-contract.md
 * Zero external deps — node http + fs only.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = 7842;

function createStreamFeedClient(opts = {}) {
  const port = Number(opts.port || process.env.GSD_T_STREAM_FEED_PORT || DEFAULT_PORT);
  const host = opts.host || '127.0.0.1';
  const projectDir = opts.projectDir || process.cwd();
  const workerPid = opts.workerPid || process.pid;
  const taskId = opts.taskId || '';
  const spoolDir = path.join(projectDir, '.gsd-t', 'stream-feed');
  const spoolPath = path.join(spoolDir, `spool-${workerPid}.jsonl`);
  const httpImpl = opts.httpImpl || http;

  let req = null;
  let spooling = false;
  let closed = false;
  let spoolStream = null;
  const pendingLines = []; // lines written to req before confirmed delivery
  const stats = { pushed: 0, spooled: 0, dropped: 0 };

  function ensureSpoolDir() {
    try { fs.mkdirSync(spoolDir, { recursive: true }); } catch { /* exists */ }
  }

  function switchToSpool(reason) {
    if (spooling) return;
    spooling = true;
    ensureSpoolDir();
    try {
      spoolStream = fs.createWriteStream(spoolPath, { flags: 'a' });
    } catch (e) {
      spoolStream = null;
    }
    try { process.stderr.write(`[stream-feed-client] switching to spool mode (${reason}) → ${spoolPath}\n`); } catch { /* noop */ }
    // Flush any pending lines (written to req but never ack'd) into spool.
    while (pendingLines.length > 0) {
      writeToSpool(pendingLines.shift());
      if (stats.pushed > 0) stats.pushed -= 1;
    }
    if (req) {
      try { req.destroy(); } catch { /* noop */ }
      req = null;
    }
  }

  function openRequest() {
    if (closed || spooling) return;
    try {
      req = httpImpl.request({
        host, port,
        method: 'POST',
        path: `/ingest?workerPid=${encodeURIComponent(String(workerPid))}&taskId=${encodeURIComponent(String(taskId))}`,
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Transfer-Encoding': 'chunked',
          'Connection': 'keep-alive',
        },
      });
      req.on('error', (err) => {
        switchToSpool(err.code || err.message || 'http-error');
      });
      req.on('socket', (sock) => {
        // Clear pending once the socket is actually usable (connected).
        sock.once('connect', () => { pendingLines.length = 0; });
      });
      req.on('response', (res) => {
        pendingLines.length = 0; // response means server accepted delivery
        res.resume();
      });
    } catch (e) {
      switchToSpool('request-ctor-error');
    }
  }

  function writeToSpool(line) {
    ensureSpoolDir();
    if (!spoolStream) {
      try { spoolStream = fs.createWriteStream(spoolPath, { flags: 'a' }); }
      catch { stats.dropped += 1; return; }
    }
    try { spoolStream.write(line + '\n'); stats.spooled += 1; }
    catch { stats.dropped += 1; }
  }

  function pushFrame(frame) {
    if (closed) return;
    let line;
    if (typeof frame === 'string') line = frame;
    else {
      try { line = JSON.stringify(frame); }
      catch { stats.dropped += 1; return; }
    }
    if (spooling) { writeToSpool(line); return; }
    if (!req) openRequest();
    if (spooling) { writeToSpool(line); return; }
    try {
      pendingLines.push(line);
      const ok = req.write(line + '\n');
      if (!ok) {
        // Drain if needed; we don't backpressure the caller.
      }
      stats.pushed += 1;
    } catch (e) {
      switchToSpool('write-error');
      writeToSpool(line);
    }
  }

  function close() {
    if (closed) return Promise.resolve();
    closed = true;
    return new Promise((resolve) => {
      const done = () => resolve();
      if (req && !spooling) {
        try { req.end(done); }
        catch { done(); }
      } else if (spoolStream) {
        try { spoolStream.end(done); }
        catch { done(); }
      } else {
        done();
      }
    });
  }

  return {
    pushFrame,
    close,
    get mode() { return closed ? 'closed' : (spooling ? 'spool' : 'http'); },
    get stats() { return { ...stats }; },
    get spoolPath() { return spoolPath; },
    _internal: { switchToSpool },
  };
}

module.exports = { createStreamFeedClient };
