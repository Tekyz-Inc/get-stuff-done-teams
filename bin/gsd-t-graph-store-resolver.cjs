#!/usr/bin/env node
"use strict";

/**
 * gsd-t-graph-store-resolver — M99 D1 (single path resolver + migration shim + sink)
 *
 * THE ONLY place a graph store path is derived after M99.
 * D2 and D3 import from this module; they never re-derive a path or contain
 * a raw `.gsd-t/graph.db` / `.gsd-t/graphDB/` literal.
 *
 * Prevents the M96-class silent split-brain (two code paths disagreeing on
 * where the store lives).
 *
 * Exports:
 *   resolveGraphDir(projectRoot?)   → abs path to `.gsd-t/graphDB/`
 *   resolveStorePath(projectRoot?)  → abs path to `.gsd-t/graphDB/graph.db`
 *   resolveLogsDir(projectRoot?)    → abs path to `.gsd-t/graphDB/logs/`
 *   deriveProjectRoot(storePath)    → repo root (3-up from graphDB/graph.db; 2-up from JSONL)
 *   migrateGraphStore(projectRoot?) → copy-verify-swap shim (idempotent, interruption-safe)
 *   append_ledger_line(record)      → fail-open ledger append with rotation + toggle
 *
 * [RULE] one-resolver-only
 * [RULE] projectroot-depth-corrected-with-move
 * [RULE] jsonl-branch-depth-preserved
 * [RULE] copy-verify-swap-never-orphan
 * [RULE] migration-real-root-only
 * [RULE] fail-open-telemetry
 * [RULE] layer1-shape-kept
 * [RULE] rollover-boundary-proven
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// ─── Legacy store path constant (migration shim uses this explicitly) ─────────
// ONLY this module is allowed to reference the old path. All producers route
// through resolveStorePath(). Exported so the query-cli discovery loop can
// check for the legacy file without re-deriving the literal.
const LEGACY_DB_SUBPATH = path.join(".gsd-t", "graph.db"); // spike-local-store: legacy path reference; migration shim only

/**
 * Return the absolute legacy store path (pre-M99: .gsd-t/graph.db).
 * Used ONLY for self-heal detection in the discovery loop.
 * @param {string} dir  — the directory to check in
 * @returns {string}
 */
function resolveLegacyStorePath(dir) {
  return path.join(dir, LEGACY_DB_SUBPATH);
}

// ─── New store layout ─────────────────────────────────────────────────────────
const GRAPH_DIR_NAME = "graphDB";
const DB_FILENAME = "graph.db";
const LOGS_DIR_NAME = "logs";

// ─── Rotation defaults (production) ──────────────────────────────────────────
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;   // 50 MB
const DEFAULT_MAX_ENTRIES = 250_000;

// ─── Real-root guard constants ────────────────────────────────────────────────
// Refuse to migrate inside tmp dirs, the filesystem root, or the home dir.
const HOME_DIR = os.homedir();

/**
 * Resolve the project root.
 * When no explicit root is given, walks up from cwd looking for `.gsd-t/`.
 * Falls back to cwd if no `.gsd-t/` is found.
 *
 * @param {string} [explicitRoot]
 * @returns {string}
 */
function _findProjectRoot(explicitRoot) {
  if (explicitRoot) return explicitRoot;
  let dir = process.cwd();
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, ".gsd-t"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

// ─── T1: Core path resolution ─────────────────────────────────────────────────

/**
 * Absolute path to the graphDB directory: `<projectRoot>/.gsd-t/graphDB/`
 * @param {string} [projectRoot]
 * @returns {string}
 */
function resolveGraphDir(projectRoot) {
  return path.join(_findProjectRoot(projectRoot), ".gsd-t", GRAPH_DIR_NAME);
}

/**
 * Absolute path to the SQLite store: `<projectRoot>/.gsd-t/graphDB/graph.db`
 * @param {string} [projectRoot]
 * @returns {string}
 */
function resolveStorePath(projectRoot) {
  return path.join(resolveGraphDir(projectRoot), DB_FILENAME);
}

/**
 * Absolute path to the logs directory: `<projectRoot>/.gsd-t/graphDB/logs/`
 * @param {string} [projectRoot]
 * @returns {string}
 */
function resolveLogsDir(projectRoot) {
  return path.join(resolveGraphDir(projectRoot), LOGS_DIR_NAME);
}

/**
 * Derive the project root from a known store path.
 *
 * Two branches — DIFFERENT depths post-migration:
 *   `.gsd-t/graphDB/graph.db`  → 3 levels up  (graphDB/ adds one level vs. old 2-up)
 *   `.gsd-t/graph-index/`      → 2 levels up  (JSONL branch stays at 2-up)
 *
 * [RULE] projectroot-depth-corrected-with-move
 * [RULE] jsonl-branch-depth-preserved
 *
 * @param {string} storePath  — abs path to store (either `.db` file or `graph-index/` dir)
 * @returns {string}  — absolute path to project root
 */
function deriveProjectRoot(storePath) {
  if (typeof storePath !== "string") return process.cwd();

  // New graphDB branch: .gsd-t/graphDB/graph.db  → 3 levels up
  if (storePath.endsWith(path.join("graphDB", "graph.db")) || storePath.endsWith("graphDB/graph.db")) {
    return path.dirname(path.dirname(path.dirname(storePath)));
  }

  // Legacy SQLite: .gsd-t/graph.db → 2 levels up
  if (storePath.endsWith(".db")) {
    return path.dirname(path.dirname(storePath));
  }

  // JSONL directory branch: .gsd-t/graph-index/ → 2 levels up
  return path.dirname(path.dirname(storePath));
}

// ─── T2: copy-verify-swap migration shim ─────────────────────────────────────

/**
 * Real-root guard — refuse to migrate inside tmp, filesystem root, or home.
 * (M94 lesson: fake root → walkTree walked whole disk → OOM)
 *
 * @param {string} root
 * @returns {boolean}  true if this looks like a safe real project root
 */
function _isRealProjectRoot(root) {
  const abs = path.resolve(root);
  if (abs === "/" || abs === HOME_DIR) return false;
  // Reject well-known temp patterns
  const tmp = os.tmpdir();
  if (abs.startsWith(tmp + path.sep) || abs === tmp) return false;
  // Also reject macOS-style /private/tmp and /var/folders
  if (abs.startsWith("/private/tmp") || abs.startsWith("/var/folders")) return false;
  return true;
}

/**
 * Verify that a SQLite file at `dbPath` is readable (can open + query).
 *
 * @param {string} dbPath
 * @returns {boolean}
 */
function _verifySqliteReadable(dbPath) {
  try {
    const { requireBetterSqlite } = require("./gsd-t-require-store.cjs");
    const Database = requireBetterSqlite();
    const db = new Database(dbPath, { readonly: true });
    // Quick sanity: try to read the schema
    db.prepare("SELECT count(*) FROM sqlite_master").get();
    db.close();
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * WAL-safe copy: copies `src.db`, `src.db-wal`, and `src.db-shm` to the
 * target directory atomically (all three must exist for a consistent snapshot).
 *
 * Strategy: copy all three files. A missing -wal / -shm is fine (WAL may be
 * checkpointed). We copy the triple so any uncommitted WAL entries travel with
 * the main db file (pre-mortem #6: WAL-interruption safety).
 *
 * @param {string} srcDb   — absolute path to source `.db` file
 * @param {string} dstDir  — absolute path to destination directory (must exist)
 * @returns {string}  — absolute path to the copied `.db` file
 */
function _copyDbWithWal(srcDb, dstDir) {
  const basename = path.basename(srcDb);
  const dstDb = path.join(dstDir, basename);
  fs.copyFileSync(srcDb, dstDb);
  for (const suf of ["-wal", "-shm"]) {
    const walSrc = srcDb + suf;
    if (fs.existsSync(walSrc)) {
      fs.copyFileSync(walSrc, path.join(dstDir, basename + suf));
    }
  }
  return dstDb;
}

/**
 * migrateGraphStore — copy-verify-swap from `.gsd-t/graph.db` → `.gsd-t/graphDB/graph.db`
 *
 * Invariants:
 *   1. Idempotent — second run returns `{ migrated: false, reason: 'already-migrated' }`.
 *   2. Interruption-safe — at EVERY point either the old store OR the new store is readable.
 *      We retain the old file until the new one is verified readable, then swap (move).
 *   3. Real-root-only — refuses to run inside tmpdir / home / fs-root when called without
 *      explicit projectRoot (the auto-fire/self-heal case). Callers that pass an explicit
 *      projectRoot (tests, CPUA) opt in to bypass the guard via `{ forceAllow: true }`.
 *   4. No-op when the legacy file does not exist.
 *
 * [RULE] copy-verify-swap-never-orphan
 * [RULE] migration-real-root-only
 * [RULE] discovery-loop-end-to-end
 *
 * @param {string} [projectRoot]
 * @param {{ forceAllow?: boolean }} [opts]  — pass `{ forceAllow: true }` to bypass real-root guard (test opt-in)
 * @returns {{ migrated: boolean, reason: string }}
 */
function migrateGraphStore(projectRoot, opts) {
  const root = _findProjectRoot(projectRoot);
  const forceAllow = opts && opts.forceAllow === true;

  // Real-root guard (M94 lesson): only applies when NOT force-allowed
  if (!forceAllow && !_isRealProjectRoot(root)) {
    return { migrated: false, reason: "real-root-guard: not a real project root" };
  }

  const legacyPath = path.join(root, LEGACY_DB_SUBPATH);
  const targetDir = resolveGraphDir(root);
  const targetPath = resolveStorePath(root);

  // Idempotent: already migrated
  if (fs.existsSync(targetPath) && _verifySqliteReadable(targetPath)) {
    return { migrated: false, reason: "already-migrated" };
  }

  // Nothing to migrate
  if (!fs.existsSync(legacyPath)) {
    return { migrated: false, reason: "no-legacy-store" };
  }

  // Ensure target directory exists
  fs.mkdirSync(targetDir, { recursive: true });

  // STEP 1: Copy legacy store (+ WAL/SHM) to a temp file inside the target dir.
  // We use a temp name so a crash here leaves the legacy store untouched.
  const tmpDb = path.join(targetDir, "graph.db.migrating");
  const tmpWal = tmpDb + "-wal";
  const tmpShm = tmpDb + "-shm";

  // Clean any previous partial migration
  for (const f of [tmpDb, tmpWal, tmpShm]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  }

  // Copy the triple (db + WAL + SHM) for WAL-interruption safety
  fs.copyFileSync(legacyPath, tmpDb);
  for (const suf of ["-wal", "-shm"]) {
    const src = legacyPath + suf;
    if (fs.existsSync(src)) fs.copyFileSync(src, tmpDb + suf);
  }

  // STEP 2: Verify the copy is readable BEFORE committing the rename.
  // If this throws / returns false, the legacy store is still intact.
  if (!_verifySqliteReadable(tmpDb)) {
    // Clean up and bail — old store still intact
    for (const f of [tmpDb, tmpWal, tmpShm]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
    return { migrated: false, reason: "verify-failed: copy not readable" };
  }

  // STEP 3: Atomic rename (swap) — after this, the new path is live.
  // The old store remains for now (we delete it after confirming).
  // Node rename is atomic on most filesystems within the same mountpoint.
  fs.renameSync(tmpDb, targetPath);
  for (const suf of ["-wal", "-shm"]) {
    const tmp = tmpDb + suf;
    if (fs.existsSync(tmp)) {
      try { fs.renameSync(tmp, targetPath + suf); } catch {}
    }
  }

  // STEP 4: Final verify of the swapped-in store
  if (!_verifySqliteReadable(targetPath)) {
    // Undo: move back if possible (the legacy is still there)
    try { fs.renameSync(targetPath, legacyPath + ".restore"); } catch {}
    return { migrated: false, reason: "post-swap-verify-failed" };
  }

  // SUCCESS — old store can be removed (but we leave it for now; a future
  // cleanup pass can remove it once users confirm the migration is stable).
  // We do NOT delete legacyPath here to honour the "never-orphan" invariant
  // in case of any partial filesystem issue. The no-raw-literals test enforces
  // that only the resolver looks at the legacy path.

  return { migrated: true, reason: "copy-verify-swap complete" };
}

// ─── T3: append_ledger_line — Layer-1 telemetry sink ─────────────────────────

/**
 * Find the current ledger file path, handling rotation.
 *
 * File naming: `graph-events-001.jsonl`, `graph-events-002.jsonl`, ...
 *
 * Rotation backstop: when the current file exceeds maxBytes OR maxEntries,
 * we seal it and start the next one. This is a RUNAWAY backstop (a full
 * analysis session should fit in one file); routine rotation does NOT happen.
 *
 * [RULE] rollover-boundary-proven
 *
 * @param {string} logsDir
 * @param {number} maxBytes
 * @param {number} maxEntries
 * @returns {string}  — absolute path to the active ledger file
 */
function _resolveLedgerPath(logsDir, maxBytes, maxEntries) {
  // List existing ledger files, sorted ascending
  let files = [];
  try {
    files = fs.readdirSync(logsDir)
      .filter((f) => /^graph-events-\d+\.jsonl$/.test(f))
      .sort();
  } catch (_e) {
    // logsDir does not exist yet — will be created at write time
  }

  if (files.length === 0) {
    return path.join(logsDir, "graph-events-001.jsonl");
  }

  const current = path.join(logsDir, files[files.length - 1]);

  // Check size and entry count of current file
  let tooBig = false;
  let tooMany = false;
  try {
    const stat = fs.statSync(current);
    if (stat.size >= maxBytes) tooBig = true;
  } catch (_e) { /* not exists yet — ok */ }

  if (!tooBig) {
    try {
      const content = fs.readFileSync(current, "utf8");
      const entryCount = content.split("\n").filter((l) => l.trim().length > 0).length;
      if (entryCount >= maxEntries) tooMany = true;
    } catch (_e) { /* ok */ }
  }

  if (!tooBig && !tooMany) return current;

  // Need a new file: increment the sequence number
  const lastFile = files[files.length - 1];
  const match = lastFile.match(/^graph-events-(\d+)\.jsonl$/);
  const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
  const nextName = `graph-events-${String(nextNum).padStart(3, "0")}.jsonl`;
  return path.join(logsDir, nextName);
}

/**
 * append_ledger_line — fail-open ledger append.
 *
 * Writes one JSON line to `graphDB/logs/graph-events-NNN.jsonl`.
 * Honors `GSDT_GRAPH_TELEMETRY`: default ON; `"0"` → OFF (zero lines written).
 * Sized rotation backstop: 50 MB OR 250,000 entries (test-overridable via env vars).
 * A throw inside the sink is SWALLOWED and never propagates.
 *
 * [RULE] fail-open-telemetry
 * [RULE] rollover-boundary-proven
 *
 * @param {object} record
 * @param {string} [projectRoot]  — optional override for tests
 */
function append_ledger_line(record, projectRoot) {
  // Toggle: default ON; "0" → OFF
  if (process.env.GSDT_GRAPH_TELEMETRY === "0") return;

  try {
    const logsDir = resolveLogsDir(projectRoot);
    fs.mkdirSync(logsDir, { recursive: true });

    // Test-only threshold overrides (pre-mortem #5)
    const maxBytes = process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES
      ? parseInt(process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES, 10)
      : DEFAULT_MAX_BYTES;
    const maxEntries = process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES
      ? parseInt(process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES, 10)
      : DEFAULT_MAX_ENTRIES;

    const ledgerPath = _resolveLedgerPath(logsDir, maxBytes, maxEntries);
    fs.appendFileSync(ledgerPath, JSON.stringify(record) + "\n");
  } catch (_e) {
    // FAIL-OPEN: telemetry must never block or alter any graph/grep/read decision
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  resolveGraphDir,
  resolveStorePath,
  resolveLogsDir,
  resolveLegacyStorePath,
  deriveProjectRoot,
  migrateGraphStore,
  append_ledger_line,
};
