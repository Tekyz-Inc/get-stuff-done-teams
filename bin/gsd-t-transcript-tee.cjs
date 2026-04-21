'use strict';
/**
 * GSD-T Transcript Tee (M42 D1)
 *
 * Captures raw stream-json frames from every unattended spawn to
 * `.gsd-t/transcripts/{spawn-id}.ndjson` + maintains a registry at
 * `.gsd-t/transcripts/.index.json` used by the dashboard sidebar.
 *
 * Zero external deps. Append-only. Does not parse the frames — that's the
 * renderer's job. One frame per line; lines that fail JSON parse are still
 * tee'd so nothing is silently dropped.
 *
 * Contracts:
 *   - .gsd-t/contracts/stream-json-sink-contract.md v1.1.0 (frame shape)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TRANSCRIPTS_DIRNAME = path.join('.gsd-t', 'transcripts');
const INDEX_FILENAME = '.index.json';

function _transcriptsDir(projectDir) {
  return path.join(projectDir || '.', TRANSCRIPTS_DIRNAME);
}

function _indexPath(projectDir) {
  return path.join(_transcriptsDir(projectDir), INDEX_FILENAME);
}

function _ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/**
 * Allocate a hierarchical spawn-id. Shape: `{parent-prefix}-{short}` where
 * `short` is an 8-char hex from a random UUID. Root spawns get no prefix.
 *
 * @param {object} [opts]
 * @param {string|null} [opts.parentId]
 * @returns {string}
 */
function allocateSpawnId(opts) {
  const parentId = opts && opts.parentId ? String(opts.parentId) : null;
  const short = crypto.randomBytes(4).toString('hex');
  return parentId ? `${parentId}.${short}` : `s-${short}`;
}

function _readIndex(projectDir) {
  const p = _indexPath(projectDir);
  if (!fs.existsSync(p)) return { spawns: [] };
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.spawns)) return { spawns: [] };
    return parsed;
  } catch (_) {
    return { spawns: [] };
  }
}

function _writeIndex(projectDir, idx) {
  const p = _indexPath(projectDir);
  _ensureDir(path.dirname(p));
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(idx, null, 2));
  fs.renameSync(tmp, p);
}

/**
 * Register a new transcript + create the ndjson file.
 *
 * @param {object} opts
 * @param {string} opts.spawnId
 * @param {string} [opts.projectDir='.']
 * @param {object} [opts.meta]           { parentId?, command?, description?, workerPid?, model? }
 * @returns {{spawnId, transcriptPath, startedAt}}
 */
function openTranscript(opts) {
  if (!opts || !opts.spawnId) throw new Error('openTranscript: spawnId required');
  const projectDir = opts.projectDir || '.';
  const meta = opts.meta || {};
  const dir = _transcriptsDir(projectDir);
  _ensureDir(dir);

  const transcriptPath = path.join(dir, `${opts.spawnId}.ndjson`);
  if (!fs.existsSync(transcriptPath)) {
    fs.writeFileSync(transcriptPath, '');
  }

  const startedAt = new Date().toISOString();
  const entry = {
    spawnId: opts.spawnId,
    parentId: meta.parentId || null,
    command: meta.command || null,
    description: meta.description || null,
    model: meta.model || null,
    workerPid: meta.workerPid || null,
    startedAt,
    endedAt: null,
    status: 'running',
  };

  const idx = _readIndex(projectDir);
  const existing = idx.spawns.findIndex((s) => s.spawnId === opts.spawnId);
  if (existing >= 0) {
    idx.spawns[existing] = { ...idx.spawns[existing], ...entry };
  } else {
    idx.spawns.push(entry);
  }
  _writeIndex(projectDir, idx);

  return { spawnId: opts.spawnId, transcriptPath, startedAt };
}

/**
 * Append a single frame (already JSON-serializable) to the transcript.
 * `frame` may be a parsed object OR a raw string line — strings are wrapped
 * as `{type:"raw",line}` so the ndjson shape stays uniform.
 *
 * @param {object} opts
 * @param {string} opts.spawnId
 * @param {string} [opts.projectDir='.']
 * @param {object|string} opts.frame
 */
function appendFrame(opts) {
  if (!opts || !opts.spawnId) throw new Error('appendFrame: spawnId required');
  if (opts.frame === undefined || opts.frame === null) return;
  const projectDir = opts.projectDir || '.';
  const p = path.join(_transcriptsDir(projectDir), `${opts.spawnId}.ndjson`);
  _ensureDir(path.dirname(p));

  let line;
  if (typeof opts.frame === 'string') {
    const trimmed = opts.frame.trim();
    if (!trimmed) return;
    try {
      JSON.parse(trimmed);
      line = trimmed;
    } catch (_) {
      line = JSON.stringify({ type: 'raw', line: opts.frame });
    }
  } else {
    try {
      line = JSON.stringify(opts.frame);
    } catch (_) {
      line = JSON.stringify({ type: 'raw', line: String(opts.frame) });
    }
  }
  fs.appendFileSync(p, line + '\n');
}

/**
 * Mark a transcript as ended. Idempotent — subsequent calls update endedAt.
 *
 * @param {object} opts
 * @param {string} opts.spawnId
 * @param {string} [opts.projectDir='.']
 * @param {'done'|'failed'|'stopped'|'ended'} [opts.status='ended']
 */
function closeTranscript(opts) {
  if (!opts || !opts.spawnId) throw new Error('closeTranscript: spawnId required');
  const projectDir = opts.projectDir || '.';
  const idx = _readIndex(projectDir);
  const i = idx.spawns.findIndex((s) => s.spawnId === opts.spawnId);
  if (i < 0) return false;
  idx.spawns[i].endedAt = new Date().toISOString();
  idx.spawns[i].status = opts.status || 'ended';
  _writeIndex(projectDir, idx);
  return true;
}

/**
 * List registered spawns (most recent first).
 *
 * @param {string} [projectDir='.']
 * @returns {Array<object>}
 */
function listTranscripts(projectDir) {
  const idx = _readIndex(projectDir || '.');
  return idx.spawns.slice().sort((a, b) => {
    const ta = Date.parse(a.startedAt) || 0;
    const tb = Date.parse(b.startedAt) || 0;
    return tb - ta;
  });
}

function readTranscriptMeta(projectDir, spawnId) {
  const idx = _readIndex(projectDir || '.');
  return idx.spawns.find((s) => s.spawnId === spawnId) || null;
}

/**
 * Tee a stream-json stdout stream. Returns an `onChunk(buffer)` callback that
 * you feed chunks to (typed as Buffer or string). Frames are split at `\n`
 * and each complete line is written to the transcript ndjson. Incomplete
 * tails are buffered until the next chunk.
 *
 * Returns also a `flush()` to call on child exit — writes any stranded tail
 * as a single `{type:"raw"}` line so nothing is dropped.
 *
 * @param {object} opts
 * @param {string} opts.spawnId
 * @param {string} [opts.projectDir='.']
 * @returns {{onChunk: (chunk) => void, flush: () => void}}
 */
function makeStreamTee(opts) {
  if (!opts || !opts.spawnId) throw new Error('makeStreamTee: spawnId required');
  const projectDir = opts.projectDir || '.';
  const spawnId = opts.spawnId;
  let buf = '';

  return {
    onChunk(chunk) {
      if (chunk == null) return;
      buf += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.length > 0) appendFrame({ spawnId, projectDir, frame: line });
      }
    },
    flush() {
      if (buf.length > 0) {
        appendFrame({ spawnId, projectDir, frame: buf });
        buf = '';
      }
    },
  };
}

module.exports = {
  allocateSpawnId,
  openTranscript,
  appendFrame,
  closeTranscript,
  listTranscripts,
  readTranscriptMeta,
  makeStreamTee,
  _readIndex,
  _writeIndex,
  TRANSCRIPTS_DIRNAME,
  INDEX_FILENAME,
};
