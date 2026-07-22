"use strict";

// bin/gsd-t-doc-marker.cjs
//
// M102 — the ONE shared marker-block idempotent doc-writer. Extracted from the
// M100 logging scaffolder's private `writeChoiceToProjectDocs` (so there is a
// single writer, not two copies): both bin/gsd-t-logging-scaffolder.cjs and
// bin/gsd-t-env-registry.cjs call this.
//
// upsertMarkedDocBlock(targetPath, startMarker, endMarker, block):
//   - If targetPath contains BOTH markers, the region between them (inclusive)
//     is REPLACED with `block` (idempotent re-write).
//   - Otherwise `block` is appended to the end of the file (creating the file
//     and any missing parent dirs).
//   - `block` MUST already begin with startMarker and end with endMarker — the
//     caller composes the full block (same contract the M100 writer used).
//
// Zero external npm runtime deps — fs/path only. Symlink-guarded: refuses to
// write through a symlinked target (defense-in-depth, matches the installer's
// settings-writer scaffold).

const fs = require("fs");
const path = require("path");

function isSymlink(filePath) {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch (_) {
    return false;
  }
}

// Replace the [startMarker … endMarker] region with `block`, or append it.
// Returns the written targetPath. Idempotent: a second call with the same
// block leaves the file byte-identical.
function upsertMarkedDocBlock(targetPath, startMarker, endMarker, block) {
  if (!targetPath) throw new Error("upsertMarkedDocBlock: targetPath is required");
  if (!startMarker || !endMarker) throw new Error("upsertMarkedDocBlock: start/end markers are required");
  if (typeof block !== "string") throw new Error("upsertMarkedDocBlock: block must be a string");

  if (isSymlink(targetPath)) {
    throw new Error(`upsertMarkedDocBlock: refusing to write through symlinked target: ${targetPath}`);
  }

  let content = "";
  if (fs.existsSync(targetPath)) {
    content = fs.readFileSync(targetPath, "utf8");
  } else {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  if (content.includes(startMarker) && content.includes(endMarker)) {
    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker) + endMarker.length;
    content = content.slice(0, startIdx) + block + content.slice(endIdx);
  } else {
    content = content.replace(/\s*$/, "") + "\n\n" + block + "\n";
  }

  fs.writeFileSync(targetPath, content, "utf8");
  return targetPath;
}

// Read the marked block back OUT of `content`. Returns the slice from the START
// marker up to (but NOT including) the END marker — i.e. the block body a parser
// walks line-by-line — or null if either marker is absent. The complement of
// upsertMarkedDocBlock's write. (Shared so a reader isn't re-implemented per
// caller — the env-registry writer/reader used to copy this inline.)
//
// NOTE: the verify GATE (gsd-t-env-registry-check.cjs) deliberately does NOT use
// this — it re-implements the extract independently so a bug here cannot disable
// the gate (M102 defensive-independence invariant). That duplication is
// load-bearing; do not "consolidate" it.
function extractMarkedDocBlock(content, startMarker, endMarker) {
  if (typeof content !== "string" || !startMarker || !endMarker) return null;
  if (!content.includes(startMarker) || !content.includes(endMarker)) return null;
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  return content.slice(start, end);
}

module.exports = { upsertMarkedDocBlock, extractMarkedDocBlock };
