'use strict';

/**
 * deps-installed — verify Node deps are installed and lockfile is fresh.
 *
 * Severity: warn (records, does not block).
 *
 * Pass conditions:
 *   - `node_modules/` exists AND
 *   - `package-lock.json` mtime ≥ `package.json` mtime
 *
 * Edge cases:
 *   - No `package.json` at all → ok:true (non-Node project; nothing to check)
 *   - `package.json` exists but no `package-lock.json` → ok:false
 *   - `node_modules/` missing → ok:false
 */

const fs = require('fs');
const path = require('path');

const ID = 'deps-installed';

function _mtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch (_) {
    return null;
  }
}

function run({ projectDir }) {
  const pkgPath = path.join(projectDir, 'package.json');
  const lockPath = path.join(projectDir, 'package-lock.json');
  const nmPath = path.join(projectDir, 'node_modules');

  const pkgMtime = _mtime(pkgPath);
  if (pkgMtime == null) {
    return {
      ok: true,
      msg: 'no package.json (non-Node project)',
    };
  }

  const lockMtime = _mtime(lockPath);
  const nmExists = fs.existsSync(nmPath);

  if (!nmExists && lockMtime == null) {
    return {
      ok: false,
      msg: 'node_modules/ missing AND package-lock.json missing',
      details: { nmExists, hasLock: false },
    };
  }
  if (!nmExists) {
    return {
      ok: false,
      msg: 'node_modules/ missing — run `npm install`',
      details: { nmExists: false, hasLock: lockMtime != null },
    };
  }
  if (lockMtime == null) {
    return {
      ok: false,
      msg: 'package-lock.json missing',
      details: { nmExists: true, hasLock: false },
    };
  }
  if (lockMtime < pkgMtime) {
    return {
      ok: false,
      msg: 'package-lock.json older than package.json — run `npm install`',
      details: { lockMtime, pkgMtime, ageDelta_ms: pkgMtime - lockMtime },
    };
  }

  return {
    ok: true,
    msg: 'node_modules/ present, lockfile fresh',
    details: { lockMtime, pkgMtime },
  };
}

module.exports = {
  id: ID,
  severity: 'warn',
  run,
  // Test-only exports
  _mtime,
};
