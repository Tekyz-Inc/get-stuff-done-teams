#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const jc = require('./journey-coverage.cjs');

const VIEWER_FILES = [
  'scripts/gsd-t-transcript.html',
  'scripts/gsd-t-dashboard-server.js',
];

function discoverViewerFiles(projectDir) {
  const out = [];
  for (const rel of VIEWER_FILES) {
    if (fs.existsSync(path.join(projectDir, rel))) out.push(rel);
  }
  const binDir = path.join(projectDir, 'bin');
  if (fs.existsSync(binDir)) {
    for (const f of fs.readdirSync(binDir)) {
      if (/^gsd-t-dashboard.*\.cjs$/.test(f)) out.push(path.join('bin', f));
    }
  }
  const journeyDir = path.join(projectDir, 'e2e', 'journeys');
  if (fs.existsSync(journeyDir)) {
    for (const f of fs.readdirSync(journeyDir)) {
      if (/\.spec\.ts$/.test(f)) out.push(path.join('e2e', 'journeys', f));
    }
  }
  return out;
}

function discoverStagedViewerFiles(projectDir) {
  let raw;
  try {
    raw = execSync('git diff --cached --name-only', { cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return [];
  }
  const all = raw.split('\n').filter(Boolean);
  return all.filter((rel) => jc.isViewerSource(rel));
}

function parseArgs(argv) {
  const out = { stagedOnly: false, manifest: null, quiet: false, projectDir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--staged-only') out.stagedOnly = true;
    else if (a === '--manifest') { out.manifest = argv[++i]; }
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--project-dir') { out.projectDir = argv[++i]; }
    else if (a === '-h' || a === '--help') {
      process.stdout.write([
        'Usage: gsd-t check-coverage [--staged-only] [--manifest PATH] [--quiet]',
        '',
        'Exit codes:',
        '  0  All detected listeners covered. Manifest fresh.',
        '  4  Coverage gap or stale manifest entry.',
        '  2  Manifest missing or unreadable (fail-closed).',
        '',
      ].join('\n'));
      process.exit(0);
    }
  }
  return out;
}

function main(argv) {
  const opts = parseArgs(argv);
  const projectDir = opts.projectDir;

  // --staged-only is a gate: only RUN when at least one viewer-source file is
  // staged. The actual scan always covers the full viewer source — otherwise
  // a commit that touches only spec files would falsely flag every manifest
  // entry as stale (because the staged-only file list contains no listeners).
  if (opts.stagedOnly) {
    const staged = discoverStagedViewerFiles(projectDir);
    if (staged.length === 0) {
      if (!opts.quiet) process.stdout.write('OK: 0 listeners, 0 specs (no staged viewer files)\n');
      process.exit(0);
    }
  }
  const files = discoverViewerFiles(projectDir);

  const listeners = jc.detectListeners(files, { projectDir });

  let manifest;
  try {
    if (opts.manifest) {
      const p = path.isAbsolute(opts.manifest) ? opts.manifest : path.join(projectDir, opts.manifest);
      const raw = fs.readFileSync(p, 'utf8');
      manifest = JSON.parse(raw);
      if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.specs)) {
        const err = new Error('manifest-shape-invalid');
        err.code = 'MANIFEST_INVALID';
        throw err;
      }
    } else {
      manifest = jc.loadManifest(projectDir);
    }
  } catch (e) {
    if (e && (e.code === 'MANIFEST_MISSING' || e.code === 'MANIFEST_UNREADABLE' || e.code === 'MANIFEST_INVALID')) {
      if (listeners.length === 0) {
        if (!opts.quiet) process.stdout.write('OK: 0 listeners, 0 specs (no manifest, no listeners — vacuous pass)\n');
        process.exit(0);
      }
      process.stderr.write('check-coverage: manifest missing or unreadable: ' + (e.path || '.gsd-t/journey-manifest.json') + '\n');
      process.stderr.write('hint: run a D2-authored manifest or pass --manifest PATH\n');
      process.exit(2);
    }
    throw e;
  }

  const gaps = jc.findGaps(listeners, manifest);
  const specCount = (manifest.specs || []).length;
  if (gaps.length === 0) {
    if (!opts.quiet) process.stdout.write('OK: ' + listeners.length + ' listeners, ' + specCount + ' specs\n');
    process.exit(0);
  }
  process.stderr.write(jc.formatReport(gaps) + '\n');
  process.exit(4);
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { main, discoverViewerFiles, discoverStagedViewerFiles, parseArgs };
