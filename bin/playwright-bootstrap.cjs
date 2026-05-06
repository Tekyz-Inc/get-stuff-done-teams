'use strict';

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

function hasPlaywright(projectDir) {
  const configs = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs'];
  try {
    return configs.some((f) => fs.existsSync(path.join(projectDir, f)));
  } catch (_) {
    return false;
  }
}

function detectPackageManager(projectDir) {
  try {
    if (fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(projectDir, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(projectDir, 'bun.lockb'))) return 'bun';
  } catch (_) {
    // fall through to default
  }
  return 'npm';
}

function verifyPlaywrightHealth(projectDir) {
  return new Promise((resolve) => {
    const child = exec(
      'npx playwright --version',
      { cwd: projectDir, timeout: 5000 },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: stderr || err.message || String(err) });
          return;
        }
        const match = (stdout || '').match(/Version\s+([\d.]+)/i);
        if (match) {
          resolve({ ok: true, version: match[1] });
        } else {
          resolve({ ok: false, error: 'Could not parse version from: ' + stdout.trim() });
        }
      },
    );
    // Belt-and-suspenders: exec timeout option should handle this, but guard anyway
    child.on('error', (err) => {
      resolve({ ok: false, error: err.message || String(err) });
    });
  });
}

module.exports = { hasPlaywright, detectPackageManager, verifyPlaywrightHealth };
