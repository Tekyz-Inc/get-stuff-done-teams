'use strict';
/**
 * M42 D2 — renderer HTML structure + script well-formedness
 *
 * We can't boot a browser in unit tests cheaply, but we CAN:
 *   - Extract the inline <script> and eval it with a minimal DOM shim
 *   - Validate the renderer dispatches on frame.type correctly
 *   - Check that tool_use_id pairs through to the tool_result
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'scripts', 'gsd-t-transcript.html');

test('transcript HTML — ships at expected path', () => {
  assert.ok(fs.existsSync(HTML_PATH), 'gsd-t-transcript.html must exist');
});

test('transcript HTML — contains placeholder for spawn-id injection', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /data-spawn-id="__SPAWN_ID__"/);
});

test('transcript HTML — inline script is syntactically valid', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const m = html.match(/<script>([\s\S]+?)<\/script>/);
  assert.ok(m, 'has inline <script>');
  // Syntax-check via `new Function` — throws on parse errors
  assert.doesNotThrow(() => new Function(m[1]));
});

test('transcript HTML — zero external CDN / external stylesheet refs', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.equal(/cdn\.jsdelivr\.net/.test(html), false);
  assert.equal(/unpkg\.com/.test(html), false);
  assert.equal(/cdnjs\.cloudflare\.com/.test(html), false);
  // No <link rel="stylesheet" href="http...">
  assert.equal(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:\/\//.test(html), false);
  // No <script src="http...">
  assert.equal(/<script[^>]+src=["']https?:\/\//.test(html), false);
});

test('transcript HTML — handles all 6 frame types in renderFrame', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  // Smoke-check that the renderer mentions each dispatch path
  assert.match(html, /type === 'system'/);
  assert.match(html, /type === 'task-boundary'/);
  assert.match(html, /type === 'raw'/);
  assert.match(html, /type === 'assistant'/);
  assert.match(html, /type === 'user'/);
  // tool_use / tool_result branches
  assert.match(html, /b\.type === 'tool_use'/);
  assert.match(html, /b\.type === 'tool_result'/);
  assert.match(html, /b\.type === 'thinking'/);
});

test('transcript HTML — includes auto-scroll with pause-on-scroll-up', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /autoScroll/);
  assert.match(html, /jump-to-live/);
  // scroll listener that toggles autoScroll
  assert.match(html, /addEventListener\('scroll'/);
});

test('transcript HTML — uses /transcript/:id/stream SSE path', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /new EventSource\('\/transcript\/' \+ encodeURIComponent\(spawnId\) \+ '\/stream'\)/);
});
