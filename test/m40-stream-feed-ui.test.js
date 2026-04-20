'use strict';
/**
 * M40 D5-T5 — Stream Feed UI smoke test
 *
 * Pure DOM-string inspection — no headless browser. Asserts:
 *   - Required elements present (feed container, filter panel, jump-to-live button)
 *   - WebSocket connect logic present
 *   - No external CDN references (everything localhost/self-contained)
 *   - File size is under 150 KB (operator tool, not a bundled app)
 *   - Script parses as valid JavaScript
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const UI_PATH = path.join(__dirname, '..', 'scripts', 'gsd-t-stream-feed.html');

test('stream-feed UI: file exists and is readable', () => {
  assert.ok(fs.existsSync(UI_PATH), `expected ${UI_PATH} to exist`);
  const html = fs.readFileSync(UI_PATH, 'utf8');
  assert.ok(html.length > 0, 'HTML is empty');
});

test('stream-feed UI: file size under 150 KB', () => {
  const { size } = fs.statSync(UI_PATH);
  assert.ok(size < 150 * 1024, `UI file is ${size} bytes, limit is ${150 * 1024} (150 KB)`);
});

test('stream-feed UI: contains required top-level elements', () => {
  const html = fs.readFileSync(UI_PATH, 'utf8');
  assert.match(html, /id=["']feed["']/, 'missing feed container #feed');
  assert.match(html, /id=["']filterPanel["']/, 'missing filter panel #filterPanel');
  assert.match(html, /id=["']filterToggle["']/, 'missing filter toggle #filterToggle');
  assert.match(html, /id=["']jumpToLive["']/, 'missing jump-to-live button #jumpToLive');
  assert.match(html, /id=["']statusBadge["']/, 'missing status badge #statusBadge');
  assert.match(html, /id=["']frameCount["']/, 'missing frame counter');
});

test('stream-feed UI: connects to WebSocket', () => {
  const html = fs.readFileSync(UI_PATH, 'utf8');
  assert.match(html, /new WebSocket\(/, 'missing WebSocket constructor call');
  // Connects to 127.0.0.1/localhost with /feed path, with ?from=0 for replay
  assert.match(html, /\/feed\?from=0/, 'missing /feed?from=0 replay URL');
  assert.match(html, /7842/, 'missing default D4 port 7842');
  assert.match(html, /scheduleReconnect/, 'missing reconnect logic');
});

test('stream-feed UI: no external CDN references', () => {
  const html = fs.readFileSync(UI_PATH, 'utf8');
  // Match any http(s):// URL that is NOT 127.0.0.1 or localhost. Must also exclude
  // things like "http://www.w3.org/..." used for XML namespaces etc.
  const externalUrlRegex = /https?:\/\/(?!127\.0\.0\.1|localhost)[a-zA-Z0-9.-]+/g;
  const matches = html.match(externalUrlRegex) || [];
  const offenders = matches.filter(u => !u.includes('www.w3.org')); // w3.org is an XML namespace, not a CDN fetch
  assert.deepEqual(offenders, [], `UI references external URLs (not self-contained): ${JSON.stringify(offenders)}`);
});

test('stream-feed UI: script parses as valid JavaScript', () => {
  const html = fs.readFileSync(UI_PATH, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'no <script> tag found');
  const code = match[1];
  // Use the Function constructor to validate syntax without executing.
  // Any SyntaxError will throw here.
  let syntaxOk = true;
  let err = null;
  try { new Function(code); } catch (e) { syntaxOk = false; err = e; }
  assert.ok(syntaxOk, `script has syntax error: ${err && err.message}`);
});

test('stream-feed UI: renders task-boundary and wave-boundary frames', () => {
  const html = fs.readFileSync(UI_PATH, 'utf8');
  assert.match(html, /renderTaskBoundary/, 'missing task-boundary renderer');
  assert.match(html, /renderWaveBoundary/, 'missing wave-boundary renderer');
  assert.match(html, /task-banner/, 'missing task-banner class');
  assert.match(html, /wave-banner/, 'missing wave-banner class');
});

test('stream-feed UI: renders assistant + tool_use + tool_result frames', () => {
  const html = fs.readFileSync(UI_PATH, 'utf8');
  assert.match(html, /renderAssistant/, 'missing assistant renderer');
  assert.match(html, /renderToolUse/, 'missing tool_use renderer');
  assert.match(html, /renderToolResult/, 'missing tool_result renderer');
  assert.match(html, /msg-assistant/, 'missing assistant card CSS');
  assert.match(html, /tool-block/, 'missing tool-block CSS');
});

test('stream-feed UI: persists filter prefs to localStorage', () => {
  const html = fs.readFileSync(UI_PATH, 'utf8');
  assert.match(html, /localStorage\.setItem/, 'missing localStorage.setItem');
  assert.match(html, /localStorage\.getItem/, 'missing localStorage.getItem');
  assert.match(html, /gsd-t-stream-feed-filters-v1/, 'missing versioned localStorage key');
});

test('stream-feed UI: supports auto-scroll pause + jump-to-live', () => {
  const html = fs.readFileSync(UI_PATH, 'utf8');
  assert.match(html, /autoScrollEnabled/, 'missing autoScrollEnabled flag');
  assert.match(html, /SCROLL_PAUSE_THRESHOLD_PX/, 'missing scroll pause threshold constant');
  assert.match(html, /jumpToLiveBtn/, 'missing jump-to-live button ref');
});

test('stream-feed UI: token-usage corner bar + helpers present', () => {
  const html = fs.readFileSync(UI_PATH, 'utf8');
  assert.match(html, /id=["']tokenBar["']/, 'missing #tokenBar corner bar');
  assert.match(html, /id=["']tbCost["']/, 'missing #tbCost element');
  assert.match(html, /id=["']tbTokens["']/, 'missing #tbTokens element');
  assert.match(html, /id=["']tbSpawns["']/, 'missing #tbSpawns element');
  assert.match(html, /function humanizeTokens/, 'missing humanizeTokens helper');
  assert.match(html, /function formatCost/, 'missing formatCost helper');
  assert.match(html, /enrichTaskBannerWithUsage/, 'missing task banner enrichment');
  assert.match(html, /enrichWaveBannerWithUsage/, 'missing wave banner enrichment');
  // Missing-data distinction: shows '—' not $0.00
  assert.match(html, /'—'/, 'missing em-dash for missing cost');
});

test('stream-feed UI: dark mode palette variables present', () => {
  const html = fs.readFileSync(UI_PATH, 'utf8');
  // Dark bg + light text + cyan accent — claude.ai-style conventions
  assert.match(html, /--bg:\s*#0a0a10/, 'missing dark background variable');
  assert.match(html, /--text:\s*#e6edf3/, 'missing light text variable');
  assert.match(html, /--cyan:\s*#00d4ff/, 'missing cyan accent variable');
});
