/**
 * gsd-t-scip-reader.cjs
 *
 * M95 — Read a SCIP index (`index.scip`, a protobuf emitted by scip-typescript /
 * scip-python) and turn it into the data the graph needs to RESOLVE call edges:
 *
 *   1. symbolToDef : Map<scipSymbol, funcId>      — where each symbol is DEFINED
 *   2. fileRefs    : Map<relPath, Array<{symbol, funcId, line}>>  — every
 *      reference occurrence in that file, already resolved to the def funcId
 *
 * A funcId is the graph's canonical `relPath#funcName` (line-suffix dropped here;
 * the indexer keys call edges on `relPath#name`-style ids — see resolveCallEdges).
 *
 * Why this exists: before M95 the SCIP "upgrade" only RAN scip-typescript and
 * relabelled the tree-sitter edges 'compiler-accurate' without reading the output.
 * This module reads the output so call targets actually resolve across files.
 *
 * The index is read straight from the protobuf wire format (`readFields`), one
 * occurrence at a time. Decoding it whole into objects (scip-typescript's bundled
 * `Index.deserialize(buf).toObject()`) needed ~4.8 GB on a 292 MB index and ran
 * Node out of memory at its 4 GB default; the walk needs ~0.6 GB and gives the
 * same maps. [RULE] scip-read-streamed-never-whole
 *
 * `loadScipProto` (scip-typescript's bundled encoder/decoder) is kept for tests,
 * which build `.scip` fixtures with it — an independent encoder for our reader.
 *
 * [RULE] scip-resolution-reads-real-output  — edges are derived from the .scip
 *        protobuf, never relabelled-in-place.
 * [RULE] scip-symbol-to-funcid-deterministic — same .scip → same funcId map.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// ── Locate scip-typescript's bundled SCIP protobuf decoder ───────────────────
let _scipProto = null;

/**
 * Load the bundled `scip.js` protobuf namespace from scip-typescript.
 * Searches: local node_modules → global npm root → NODE_PATH.
 * @returns {object|null} the `scip` namespace (Index, Document, …) or null.
 */
function loadScipProto() {
  if (_scipProto) return _scipProto;

  const candidates = [];
  // 1. local node_modules (if scip-typescript is a project dep)
  try {
    candidates.push(require.resolve('@sourcegraph/scip-typescript/dist/src/scip.js'));
  } catch { /* not local */ }
  // 2. global npm root
  try {
    const groot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    candidates.push(path.join(groot, '@sourcegraph/scip-typescript/dist/src/scip.js'));
  } catch { /* npm not reachable */ }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        const mod = require(c);
        _scipProto = mod.scip || mod;
        if (_scipProto && _scipProto.Index) return _scipProto;
      }
    } catch { /* try next */ }
  }
  return null;
}

// ── SCIP symbol → function name ──────────────────────────────────────────────
// A SCIP symbol looks like:
//   "scip-typescript npm <pkg> <ver> src/`calc.ts`/computeTotal()."
// The trailing descriptor after the last '/' identifies the entity:
//   "computeTotal()."  → a method/function descriptor (ends with "().")
//   "computeTotal()(x)" → a parameter (we ignore params for call resolution)
// We extract the bare name from a function/method descriptor.

/**
 * Extract the function name from a SCIP symbol, or null if the symbol is not a
 * callable (parameter, type, module, etc.).
 * @param {string} symbol
 * @returns {string|null}
 */
function funcNameFromSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return null;

  // The name is the last descriptor segment. Top-level functions are
  // ".../`file.ts`/name()."; methods are ".../`file.ts`/Class#method()." — so the
  // name follows the LAST '/' OR '#', whichever is later (methods key on '#').
  const cut = Math.max(symbol.lastIndexOf('/'), symbol.lastIndexOf('#'));
  const descriptor = cut === -1 ? symbol : symbol.slice(cut + 1);

  // TWO callable descriptor shapes, and missing the second one silently halved
  // the graph. [RULE] scip-accepts-term-and-method-descriptors
  //
  //   `name().`  — a METHOD descriptor: `export function name() {}`
  //   `name.`    — a TERM descriptor:   `export const name = async () => {}`
  //
  // TypeScript treats an arrow function assigned to a const as a VARIABLE, so
  // SCIP emits a term. Requiring "()." therefore discarded every arrow-function
  // export: on a real server that was 3,584 term symbols dropped against 1,624
  // kept, so `who-calls logAudit` answered "no callers" for a function called
  // throughout the codebase — while `verifyToken`, three lines away but written
  // as `export function`, resolved fine.
  //
  // Non-callable terms (`Array.`, an imported type) are admitted here and cost
  // nothing: a name only resolves when a CALL SITE is looking for that exact
  // name, so a type reference never matches one.
  //
  // Parameters (`name().(p)`) stay excluded — they end in `)`, not `.`.
  let m = descriptor.match(/^([A-Za-z_$][\w$]*)\(\)\.$/);   // function / method
  if (!m) m = descriptor.match(/^([A-Za-z_$][\w$]*)\.$/);   // term (const arrow fn)
  return m ? m[1] : null;
}

// ── Protobuf wire format ─────────────────────────────────────────────────────
// Only what SCIP's Index / Document / Occurrence need. A truncated or malformed
// buffer throws; readScipIndex turns that into { ok:false } — never a partial map.

function readVarint(buf, pos) {
  let value = 0;
  let scale = 1;
  for (;;) {
    if (pos.i >= buf.length) throw new Error('truncated varint');
    const byte = buf[pos.i++];
    value += (byte & 0x7f) * scale;
    if ((byte & 0x80) === 0) return value;
    scale *= 128;
    if (scale > 2 ** 70) throw new Error('varint too long');
  }
}

/**
 * Each field of the message in buf[start, end): { field, wire, value } for a
 * varint, { field, wire, start, end } for a length-delimited one. Fixed-width
 * fields are skipped (SCIP's fields here use neither).
 */
function* readFields(buf, start, end) {
  const pos = { i: start };
  while (pos.i < end) {
    const tag = readVarint(buf, pos);
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 0) { yield { field, wire, value: readVarint(buf, pos) }; continue; }
    if (wire === 2) {
      const len = readVarint(buf, pos);
      const at = pos.i;
      pos.i += len;
      if (pos.i > end) throw new Error('field runs past its message');
      yield { field, wire, start: at, end: pos.i };
      continue;
    }
    if (wire === 1) pos.i += 8;
    else if (wire === 5) pos.i += 4;
    else throw new Error(`unsupported wire type ${wire}`);
    if (pos.i > end) throw new Error('field runs past its message');
  }
}

const utf8 = (buf, f) => buf.toString('utf8', f.start, f.end);

// Index.documents = 2; Document.relative_path = 1, .occurrences = 2;
// Occurrence.range = 1 (packed or not), .symbol = 2, .symbol_roles = 3.
function documentRanges(buf) {
  const docs = [];
  for (const f of readFields(buf, 0, buf.length)) if (f.field === 2 && f.wire === 2) docs.push(f);
  return docs;
}

function documentPath(buf, doc) {
  for (const f of readFields(buf, doc.start, doc.end)) if (f.field === 1 && f.wire === 2) return utf8(buf, f);
  return '';
}

/** Each occurrence of a document: { range: number[], symbol, symbol_roles }. */
function* documentOccurrences(buf, doc) {
  for (const f of readFields(buf, doc.start, doc.end)) {
    if (f.field !== 2 || f.wire !== 2) continue;
    const occ = { range: [], symbol: '', symbol_roles: 0 };
    for (const g of readFields(buf, f.start, f.end)) {
      if (g.field === 1 && g.wire === 2) {
        const pos = { i: g.start };
        while (pos.i < g.end) occ.range.push(readVarint(buf, pos));
      } else if (g.field === 1 && g.wire === 0) occ.range.push(g.value);
      else if (g.field === 2 && g.wire === 2) occ.symbol = utf8(buf, g);
      else if (g.field === 3 && g.wire === 0) occ.symbol_roles = g.value;
    }
    yield occ;
  }
}

// ── Read a SCIP index into resolution maps ───────────────────────────────────

const SYMBOL_ROLE_DEFINITION = 0x1; // SymbolRole.Definition bit

// scip-typescript indexes whatever its tsconfig includes — which on real projects
// often covers build output (dist-local/, dist-test/, build/). Those generated
// bundles must NOT enter the graph (duplicate, minified symbols pollute who-calls).
// Mirror the indexer's SKIP_DIRS prefix logic at the SCIP-doc level.
function isBuildOutputPath(relPath) {
  const seg = String(relPath).split('/');
  for (const s of seg) {
    if (s === 'node_modules' || s === '.git' || s === 'coverage') return true;
    for (const pre of ['dist', 'build', 'out']) {
      if (s === pre || (s.length > pre.length && s.startsWith(pre) &&
          (s[pre.length] === '-' || s[pre.length] === '.' || s[pre.length] === '_'))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Decode a `.scip` file and build resolution maps.
 *
 * `pathPrefix` re-roots every path in the index to be repo-root-relative.
 * An indexer reports paths relative to WHERE IT RAN: indexing `server/` emits
 * `src/index.ts`, while the graph stores `server/src/index.ts`. Without the
 * prefix, a nested project's refs key on paths the graph has never heard of and
 * resolve nothing — a second indexer run would LOOK like a fix and change
 * nothing. [RULE] scip-paths-reprefixed-to-repo-root
 *
 * The prefix must apply to BOTH the fileRefs keys AND the funcId values, since
 * a funcId is `relPath#name` — prefixing only the keys leaves every funcId
 * pointing at a path the graph does not have.
 *
 * @param {string} scipPath  absolute path to an index.scip
 * @param {string} [pathPrefix]  repo-relative dir the index was produced from
 *                               (e.g. "server"); "" or "." for the repo root
 * @returns {{ ok: true, symbolToDef: Map<string,string>,
 *             fileRefs: Map<string, Array<{symbol:string, funcId:string, line:number}>>,
 *             docPaths: Set<string> }
 *         | { ok: false, reason: string }}
 */
function readScipIndex(scipPath, pathPrefix) {
  // Normalize: "", ".", "./", "server/" and "server" all mean the same thing.
  const rawPrefix = (pathPrefix || '').replace(/^\.\/+/, '').replace(/\/+$/, '');
  const prefix = (rawPrefix === '' || rawPrefix === '.') ? '' : rawPrefix + '/';
  // normalize: a project outside the files' folder (the leftover-files pass)
  // writes paths with `../` that must collapse back to repo-relative ones.
  const reroot = prefix ? (p) => path.posix.normalize(prefix + p) : (p) => p;
  if (!fs.existsSync(scipPath)) {
    return { ok: false, reason: 'scip-file-missing' };
  }
  const buf = fs.readFileSync(scipPath);
  try {
    return readScipBuffer(buf, reroot);
  } catch (e) {
    return { ok: false, reason: `scip-decode-failed: ${e.message}` };
  }
}

/** The maps from one decoded buffer. Throws on a malformed one. */
function readScipBuffer(buf, reroot) {

  const symbolToDef = new Map();          // scipSymbol → funcId (relPath#name)
  const fileRefs = new Map();             // relPath → [{symbol, line}]
  // Every file the indexer produced a document for — including files with no
  // resolvable reference, which never appear in fileRefs. Without this set a
  // file the indexer SKIPPED (scip-typescript drops files over its byte-size cap)
  // is indistinguishable from one it indexed and found nothing in.
  // [RULE] scip-missing-file-detected-never-silent
  const docPaths = new Set();
  // Every position (line, column) SCIP put ANY symbol at, per file — external,
  // local, or repo. A call site whose callee sits at one of these was SEEN by the
  // compiler (resolved to something, even if not a repo function); one that
  // does not was never looked at. Numbers, not strings: a large repo has
  // millions of occurrences. [RULE] scip-tier-proportional
  const occurrencePositions = new Map();

  const docs = documentRanges(buf);

  // First pass: collect every DEFINITION occurrence → symbol → funcId.
  for (const doc of docs) {
    const rawPath = documentPath(buf, doc);
    if (!rawPath || isBuildOutputPath(rawPath)) continue;
    const relPath = reroot(rawPath);
    docPaths.add(relPath);
    for (const occ of documentOccurrences(buf, doc)) {
      const isDef = (occ.symbol_roles & SYMBOL_ROLE_DEFINITION) !== 0;
      if (!isDef) continue;
      const name = funcNameFromSymbol(occ.symbol);
      if (!name) continue;
      // funcId = the graph's file#name key (repo-root-relative)
      symbolToDef.set(occ.symbol, `${relPath}#${name}`);
    }
  }

  // Second pass: collect every REFERENCE occurrence per file, resolved to the def.
  // A reference is kept whatever scope encloses it — named function, anonymous
  // route handler, or top-level callback. The CALLER identity comes from the
  // tree-sitter floor (which synthesizes one for anonymous scopes); SCIP only
  // resolves the TARGET. [RULE] anonymous-caller-synthesized-never-dropped
  for (const doc of docs) {
    const rawPath = documentPath(buf, doc);
    if (!rawPath || isBuildOutputPath(rawPath)) continue;
    const relPath = reroot(rawPath);
    const refs = [];
    const positions = new Set();
    occurrencePositions.set(relPath, positions);
    for (const occ of documentOccurrences(buf, doc)) {
      if (occ.range.length >= 2) positions.add(scipPositionKey(occ.range[0], occ.range[1]));
      const isDef = (occ.symbol_roles & SYMBOL_ROLE_DEFINITION) !== 0;
      if (isDef) continue;                       // refs only
      const name = funcNameFromSymbol(occ.symbol);
      if (!name) continue;                        // only callable references
      const funcId = symbolToDef.get(occ.symbol); // resolve to the def
      if (!funcId) continue;                      // external/unresolvable → skip (stays floor)
      const line = occ.range.length ? occ.range[0] : null;
      refs.push({ symbol: occ.symbol, funcId, line });
    }
    if (refs.length) fileRefs.set(relPath, refs);
  }

  return { ok: true, symbolToDef, fileRefs, docPaths, occurrencePositions };
}

/** 0-based line + column → one number (columns never reach 1e6). */
function scipPositionKey(line0, col) {
  return line0 * 1e6 + col;
}

module.exports = {
  loadScipProto,
  funcNameFromSymbol,
  readScipIndex,
  scipPositionKey,
};
