#!/usr/bin/env node
/**
 * gsd-t-changelog-check.js
 *
 * SessionStart hook: checks if CLAUDE.md was modified outside GSD-T since the
 * last tracked changelog entry. If so, appends an "External update detected" entry.
 *
 * Runs once at session start, not on every prompt.
 * Exit codes:
 *   0 — success (up to date, or external update logged)
 *   1 — not a GSD-T project (no .gsd-t/), or no CLI found — silent skip, not an error
 *   2 — changelog CLI failed unexpectedly
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function findCli() {
  const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  const globalCli = path.join(globalRoot, '@tekyzinc', 'gsd-t', 'bin', 'gsd-t-claude-md-changelog.cjs');
  if (fs.existsSync(globalCli)) return globalCli;

  const localCli = path.join(process.cwd(), 'bin', 'gsd-t-claude-md-changelog.cjs');
  if (fs.existsSync(localCli)) return localCli;

  return null;
}

function main() {
  const cwd = process.cwd();

  // Only run in GSD-T projects — silent exit if not
  if (!fs.existsSync(path.join(cwd, '.gsd-t'))) {
    process.exit(0);
  }

  const cli = findCli();
  if (!cli) {
    // CLI not installed — silent exit (GSD-T may not be fully set up yet)
    process.exit(0);
  }

  let checkResult;
  try {
    checkResult = execSync(`node "${cli}" check-external "${cwd}"`, { encoding: 'utf8' });
    // Exit code 0 = up to date
    process.exit(0);
  } catch (e) {
    if (e.status === 1) {
      // External update detected — append entry
      execSync(`node "${cli}" append "${cwd}" external`, { encoding: 'utf8' });
      process.stdout.write('CLAUDE.md changelog: external update detected and logged.\n');
      process.exit(0);
    }
    if (e.status === 2) {
      // Corrupt changelog — report but don't block session
      process.stderr.write('CLAUDE.md changelog is corrupt. Run: node bin/gsd-t-claude-md-changelog.cjs get-last-entry-time .\n');
      process.exit(0);
    }
    // Unexpected error — report it
    process.stderr.write('CLAUDE.md changelog check failed: ' + (e.message || 'unknown error') + '\n');
    process.exit(2);
  }
}

main();
