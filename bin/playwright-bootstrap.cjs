'use strict';

const fs = require('fs');
const path = require('path');
const { exec, spawn, spawnSync } = require('child_process');

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

// ── installPlaywright ────────────────────────────────────────────────────────
//
// Idempotent installer. Per playwright-bootstrap-contract.md §3 + §6 + §7 + §8.
// Returns { ok: true } on success, { ok: false, err, hint } on failure.

const PLAYWRIGHT_CONFIG_TEMPLATE = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // webServer is intentionally omitted — projects manage their own server lifecycle.
});
`;

const PLACEHOLDER_SPEC_TEMPLATE = `import { test } from '@playwright/test';

// Placeholder spec — replace with real specs when UI tests land.
test.skip('placeholder', () => {});
`;

const INSTALL_COMMANDS = {
  npm: { cmd: 'npm', args: ['install', '-D', '@playwright/test'] },
  pnpm: { cmd: 'pnpm', args: ['add', '-D', '@playwright/test'] },
  yarn: { cmd: 'yarn', args: ['add', '-D', '@playwright/test'] },
  bun: { cmd: 'bun', args: ['add', '-d', '@playwright/test'] },
};

function _classifyError(stderr, code, command) {
  const text = String(stderr || '').toLowerCase();
  if (code === 127 || /command not found|enoent|not recognized|spawn .* enoent/i.test(text)) {
    return {
      err: 'package-manager-not-found',
      hint: 'Install the package manager (' + command + ') and re-run: gsd-t doctor --install-playwright',
    };
  }
  if (/network|registry|getaddrinfo|enotfound|econnrefused|etimedout|enetunreach/i.test(text)) {
    return {
      err: stderr || 'network-failure',
      hint: 'Check network connectivity and retry: gsd-t doctor --install-playwright',
    };
  }
  if (/chromium|browsers? could not be downloaded|browser.*download/i.test(text)) {
    return {
      err: stderr || 'chromium-download-failed',
      hint: 'Run npx playwright install chromium manually',
    };
  }
  if (/eacces|eperm|permission|read-only|enospc|disk/i.test(text)) {
    return {
      err: stderr || 'disk-write-failed',
      hint: 'Check filesystem permissions',
    };
  }
  return {
    err: stderr || 'install-failed',
    hint: 'Run gsd-t doctor --install-playwright to retry',
  };
}

function _runSubprocess(cmd, args, cwd) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(cmd, args, {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ code: 127, stdout: '', stderr: err.message || String(err) });
      return;
    }
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      resolve({ code: 127, stdout, stderr: stderr + (err.message || String(err)) });
    });
    child.on('close', (code) => {
      resolve({ code: code == null ? 1 : code, stdout, stderr });
    });
  });
}

function _writeIfAbsent(filePath, content) {
  try {
    if (fs.existsSync(filePath)) return { ok: true, wrote: false };
    fs.writeFileSync(filePath, content);
    return { ok: true, wrote: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

function _ensureE2EPlaceholder(projectDir) {
  try {
    const e2eDir = path.join(projectDir, 'e2e');
    let dirExists = false;
    try {
      dirExists = fs.statSync(e2eDir).isDirectory();
    } catch (_e) {
      dirExists = false;
    }
    if (!dirExists) {
      fs.mkdirSync(e2eDir, { recursive: true });
    } else {
      // If e2e exists and is non-empty, do not overwrite.
      const entries = fs.readdirSync(e2eDir);
      if (entries.length > 0) return { ok: true, wrote: false };
    }
    const specPath = path.join(e2eDir, '__placeholder.spec.ts');
    if (!fs.existsSync(specPath)) {
      fs.writeFileSync(specPath, PLACEHOLDER_SPEC_TEMPLATE);
      return { ok: true, wrote: true };
    }
    return { ok: true, wrote: false };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

async function installPlaywright(projectDir, opts) {
  // Idempotent short-circuit: already configured.
  if (hasPlaywright(projectDir)) return { ok: true };

  const pm = detectPackageManager(projectDir);
  const install = INSTALL_COMMANDS[pm] || INSTALL_COMMANDS.npm;

  // Tests use opts.runner to inject a stub of `_runSubprocess` so we can
  // exercise each package-manager branch and error path without actually
  // hitting npm/pnpm/yarn/bun. Production callers omit it.
  const runner = (opts && opts.runner) || _runSubprocess;

  // Step 3: install @playwright/test as a devDependency
  let r = await runner(install.cmd, install.args, projectDir);
  if (r.code !== 0) {
    const c = _classifyError(r.stderr, r.code, install.cmd);
    return { ok: false, err: c.err, hint: c.hint };
  }

  // Step 4: install chromium browser
  r = await runner('npx', ['playwright', 'install', 'chromium'], projectDir);
  if (r.code !== 0) {
    const c = _classifyError(r.stderr, r.code, 'npx');
    // Partial install: @playwright/test landed, chromium did not. Surface that.
    return {
      ok: false,
      err: c.err,
      hint: c.hint,
      partial: true,
    };
  }

  // Step 5: write playwright.config.ts (idempotent — does not overwrite)
  const configPath = path.join(projectDir, 'playwright.config.ts');
  const cfgWrite = _writeIfAbsent(configPath, PLAYWRIGHT_CONFIG_TEMPLATE);
  if (!cfgWrite.ok) {
    const c = _classifyError(cfgWrite.error, 1, 'fs.writeFile');
    return { ok: false, err: c.err, hint: c.hint };
  }

  // Step 6: e2e/ scaffolding (idempotent — does not overwrite existing files)
  const placeholderWrite = _ensureE2EPlaceholder(projectDir);
  if (!placeholderWrite.ok) {
    const c = _classifyError(placeholderWrite.error, 1, 'fs.writeFile');
    return { ok: false, err: c.err, hint: c.hint };
  }

  return { ok: true };
}

// ── installPlaywrightSync ────────────────────────────────────────────────────
//
// Synchronous variant of installPlaywright(). Same idempotency + template +
// error-classifier semantics as the async form, implemented with `spawnSync`
// so it can be embedded inside synchronous code paths (notably the M50 D2
// spawn-gate in bin/headless-auto-spawn.cjs::autoSpawnHeadless, which must
// remain sync to preserve the existing return-value contract relied on by
// bin/gsd-t-parallel.cjs::runDispatch).
//
// Returns the same shape as installPlaywright(): {ok: true} or
// {ok: false, err, hint, partial?: true}. Tests inject opts.runner the same
// way; production callers omit it.

function _runSubprocessSync(cmd, args, cwd) {
  let res;
  try {
    res = spawnSync(cmd, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (err) {
    return { code: 127, stdout: '', stderr: err.message || String(err) };
  }
  if (res.error) {
    return { code: 127, stdout: '', stderr: res.error.message || String(res.error) };
  }
  return {
    code: res.status == null ? 1 : res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

function installPlaywrightSync(projectDir, opts) {
  if (hasPlaywright(projectDir)) return { ok: true };

  const pm = detectPackageManager(projectDir);
  const install = INSTALL_COMMANDS[pm] || INSTALL_COMMANDS.npm;
  const runner = (opts && opts.runner) || _runSubprocessSync;

  let r = runner(install.cmd, install.args, projectDir);
  if (r.code !== 0) {
    const c = _classifyError(r.stderr, r.code, install.cmd);
    return { ok: false, err: c.err, hint: c.hint };
  }

  r = runner('npx', ['playwright', 'install', 'chromium'], projectDir);
  if (r.code !== 0) {
    const c = _classifyError(r.stderr, r.code, 'npx');
    return { ok: false, err: c.err, hint: c.hint, partial: true };
  }

  const configPath = path.join(projectDir, 'playwright.config.ts');
  const cfgWrite = _writeIfAbsent(configPath, PLAYWRIGHT_CONFIG_TEMPLATE);
  if (!cfgWrite.ok) {
    const c = _classifyError(cfgWrite.error, 1, 'fs.writeFile');
    return { ok: false, err: c.err, hint: c.hint };
  }

  const placeholderWrite = _ensureE2EPlaceholder(projectDir);
  if (!placeholderWrite.ok) {
    const c = _classifyError(placeholderWrite.error, 1, 'fs.writeFile');
    return { ok: false, err: c.err, hint: c.hint };
  }

  return { ok: true };
}

module.exports = {
  hasPlaywright,
  detectPackageManager,
  verifyPlaywrightHealth,
  installPlaywright,
  installPlaywrightSync,
  // Exposed for tests; treat as private.
  _PLAYWRIGHT_CONFIG_TEMPLATE: PLAYWRIGHT_CONFIG_TEMPLATE,
  _PLACEHOLDER_SPEC_TEMPLATE: PLACEHOLDER_SPEC_TEMPLATE,
  _INSTALL_COMMANDS: INSTALL_COMMANDS,
};
