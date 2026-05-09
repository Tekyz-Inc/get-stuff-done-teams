'use strict';

/**
 * manifest-fresh — verify .gsd-t/journey-manifest.json is newer than every
 * file under e2e/journeys/.
 *
 * Severity: info. Never blocks (top-level `ok` only flips on error-severity).
 *
 * If the manifest or the e2e/journeys/ dir is missing, the check is an
 * info-grade noop pass with `msg: "no manifest, skipping"`.
 */

const fs = require('fs');
const path = require('path');

const ID = 'manifest-fresh';

function _walkSync(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      _walkSync(full, out);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
}

function _mtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch (_) {
    return null;
  }
}

function run({ projectDir }) {
  const manifestPath = path.join(projectDir, '.gsd-t', 'journey-manifest.json');
  const journeysDir = path.join(projectDir, 'e2e', 'journeys');

  const manifestMtime = _mtime(manifestPath);
  const journeysExists = fs.existsSync(journeysDir);

  if (manifestMtime == null || !journeysExists) {
    return {
      ok: true,
      msg: 'no manifest, skipping',
    };
  }

  const files = [];
  _walkSync(journeysDir, files);

  if (files.length === 0) {
    return {
      ok: true,
      msg: 'manifest present, no journey files to compare',
    };
  }

  const stale = [];
  for (const f of files) {
    const m = _mtime(f);
    if (m == null) continue;
    if (m > manifestMtime) {
      stale.push({ file: path.relative(projectDir, f), mtime: m });
    }
  }

  if (stale.length === 0) {
    return {
      ok: true,
      msg: 'manifest fresher than ' + files.length + ' journey file(s)',
      details: { manifestMtime, scanned: files.length },
    };
  }

  return {
    ok: false,
    msg: 'manifest stale: ' + stale.length + ' journey file(s) newer',
    details: { manifestMtime, stale, scanned: files.length },
  };
}

module.exports = {
  id: ID,
  severity: 'info',
  run,
  // Test-only exports
  _walkSync,
  _mtime,
};
