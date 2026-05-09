'use strict';

/**
 * ports-free — verify required dev ports are unbound.
 *
 * Severity: error (blocks).
 *
 * Reads `requiredFreePorts: number[]` from `.gsd-t/.unattended/config.json`.
 * If absent or empty, check is a noop pass.
 *
 * For each port, runs `lsof -nP -iTCP:<port> -sTCP:LISTEN`. Exit 0 + non-empty
 * stdout means a process is listening (FAIL). Exit 1 means no listener (PASS).
 * Anything else (lsof missing, etc.) is treated as a soft fail with note.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ID = 'ports-free';

function _readRequiredPorts(projectDir) {
  const cfgPath = path.join(projectDir, '.gsd-t', '.unattended', 'config.json');
  if (!fs.existsSync(cfgPath)) return [];
  let raw;
  try {
    raw = fs.readFileSync(cfgPath, 'utf8');
  } catch (_) {
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return [];
  }
  const ports = parsed && parsed.requiredFreePorts;
  if (!Array.isArray(ports)) return [];
  // Coerce + filter to positive integers.
  return ports
    .map((p) => Number(p))
    .filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
}

function _portInUse(port) {
  // execSync throws on non-zero exit. lsof exits 1 when nothing matches.
  try {
    const stdout = execSync('lsof -nP -iTCP:' + port + ' -sTCP:LISTEN', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { listening: String(stdout || '').trim().length > 0 };
  } catch (err) {
    // lsof exits 1 when no match — that's the happy "port free" path.
    if (err && err.status === 1) return { listening: false };
    // Anything else (e.g., lsof not installed) — surface as unknown.
    return { listening: false, error: err && err.message || String(err) };
  }
}

function run({ projectDir }) {
  const ports = _readRequiredPorts(projectDir);
  if (ports.length === 0) {
    return {
      ok: true,
      msg: 'no requiredFreePorts configured',
    };
  }

  const occupied = [];
  const errors = [];
  for (const port of ports) {
    const r = _portInUse(port);
    if (r.error) errors.push({ port, error: r.error });
    if (r.listening) occupied.push(port);
  }

  if (occupied.length === 0 && errors.length === 0) {
    return {
      ok: true,
      msg: 'all ' + ports.length + ' required ports are free',
      details: { ports },
    };
  }

  if (occupied.length > 0) {
    return {
      ok: false,
      msg: 'occupied ports: ' + occupied.join(', '),
      details: { ports, occupied, errors },
    };
  }

  // Only errors, no occupancy — fail closed: an error-severity check shouldn't
  // pass when we can't actually verify the ports.
  return {
    ok: false,
    msg: 'lsof probe failed for ' + errors.length + ' port(s)',
    details: { ports, errors },
  };
}

module.exports = {
  id: ID,
  severity: 'error',
  run,
  // Test-only exports
  _readRequiredPorts,
  _portInUse,
};
