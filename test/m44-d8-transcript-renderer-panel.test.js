'use strict';

/**
 * M44 D8 T7 — transcript right-side spawn-plan panel (static HTML checks)
 *
 * Mirrors the pattern in test/m44-transcript-timestamp.test.js — we check
 * the HTML string for required CSS rules, DOM skeleton, render helpers,
 * and JS token formatter.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HTML_PATH = path.join(__dirname, '..', 'scripts', 'gsd-t-transcript.html');

function readHtml() {
  return fs.readFileSync(HTML_PATH, 'utf8');
}

test('HTML contains right-side spawn-plan aside with two sections', () => {
  const html = readHtml();
  assert.match(html, /<aside\s+class="spawn-panel"/);
  assert.match(html, /id="spawn-layer-project"/);
  assert.match(html, /id="spawn-layer-active"/);
});

test('CSS — defines the .spawn-panel right-side rail', () => {
  const html = readHtml();
  assert.match(html, /body\s*>\s*aside\.spawn-panel\s*\{/);
  // Grid column 3 so it sits to the right of main; existing rail stays at column 1.
  // M47 D1 — the third track became `var(--right-rail-w)` (default 320px) so it
  // can collapse via [data-right-rail-collapsed]. Either form satisfies the contract:
  // the rail is at grid column 3, the panel exists, and the dimmed state ships.
  assert.match(html, /grid-template-columns:\s*280px\s+1fr\s+(?:320px|var\(--right-rail-w\))/);
  // Dimmed state class for inactive spawn card
  assert.match(html, /\.spawn-panel\s+section\.dimmed\s*\{/);
});

test('CSS — task row icons keyed by status', () => {
  const html = readHtml();
  assert.match(html, /\.spawn-panel\s+\.task-row\.status-done\s+\.icon/);
  assert.match(html, /\.spawn-panel\s+\.task-row\.status-in-progress\s+\.icon/);
});

test('JS — defines fmtTokens, fmtK, sumTokens, renderTaskList', () => {
  const html = readHtml();
  assert.match(html, /function fmtK\(/);
  assert.match(html, /function fmtTokens\(/);
  assert.match(html, /function sumTokens\(/);
  assert.match(html, /function renderTaskList\(/);
  assert.match(html, /function renderProjectLayer\(/);
  assert.match(html, /function renderActiveLayer\(/);
});

test('JS — status icon map uses the three canonical glyphs', () => {
  const html = readHtml();
  assert.match(html, /STATUS_ICON/);
  // All three icons present
  assert.ok(html.includes('☐'), 'pending icon ☐');
  assert.ok(html.includes('◐'), 'in_progress icon ◐');
  assert.ok(html.includes('✓'), 'done icon ✓');
});

test('JS — subscribes to /api/spawn-plans/stream and fetches /api/spawn-plans', () => {
  const html = readHtml();
  assert.match(html, /fetch\('\/api\/spawn-plans'\)/);
  assert.match(html, /EventSource\('\/api\/spawn-plans\/stream'\)/);
});

test('inline script still parses after the panel wiring', () => {
  const html = readHtml();
  const m = html.match(/<script>([\s\S]+?)<\/script>/);
  assert.ok(m, 'has inline <script>');
  assert.doesNotThrow(() => new Function(m[1]));
});

test('fmtTokens — direct unit test in a sandboxed eval', () => {
  const html = readHtml();
  const m = html.match(/<script>([\s\S]+?)<\/script>/);
  const src = m[1];
  // Extract fmtK then fmtTokens via bracket-aware brace counting; simpler to
  // rebuild a harness that evaluates the entire IIFE and captures via
  // `window.__gsdtFmtTokens`-style exposure. The HTML exposes these on
  // `window` so we simulate a minimal window.
  const fmtKMatch = src.match(/function fmtK\([^)]*\)\s*\{[\s\S]*?\n\s{6}\}/);
  const fmtTokensMatch = src.match(/function fmtTokens\([^)]*\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fmtKMatch, 'fmtK source extractable');
  assert.ok(fmtTokensMatch, 'fmtTokens source extractable');
  const fn = new Function(fmtKMatch[0] + '\n' + fmtTokensMatch[0] + '\nreturn fmtTokens;');
  const fmtTokens = fn();

  assert.equal(fmtTokens(null), '—');
  assert.equal(fmtTokens(undefined), '—');
  const out = fmtTokens({ in: 12500, out: 1742, cr: 10, cc: 5, cost_usd: 0.42 });
  assert.match(out, /in=12\.5k/);
  assert.match(out, /out=1\.7k/);
  assert.match(out, /\$0\.42/);
  // Small numbers: no k-suffix
  const small = fmtTokens({ in: 12, out: 34, cost_usd: 0.01 });
  assert.match(small, /in=12/);
  assert.match(small, /out=34/);
});

test('cumulative totals wiring (project + active headers)', () => {
  const html = readHtml();
  // Project totals element
  assert.match(html, /id="project-totals"/);
  assert.match(html, /id="active-totals"/);
  // sumTokens used in render functions
  assert.match(html, /sumTokens\(plan\.tasks/);
});
