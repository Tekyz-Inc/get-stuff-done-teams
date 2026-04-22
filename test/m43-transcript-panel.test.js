'use strict';
/**
 * M43 D6-T2 — transcript HTML tool-cost panel (DOM-level assertions)
 *
 * The transcript page ships a single HTML file with an inline script. These
 * tests parse the file statically (markup + CSS + script fragments) to
 * assert that the panel markup, CSS hooks, and fetch/render logic are
 * wired up correctly. Zero-deps — no jsdom, no headless browser.
 *
 * Pattern mirrors `m42-transcript-sidebar.test.js` (test static structure
 * + extract key JS fragments and assert behavior in isolation where
 * practical).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'scripts', 'gsd-t-transcript.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

test('panel markup — <details class="panel"> with id tool-cost-panel', () => {
  assert.match(HTML, /<details class="panel"[^>]*id="tool-cost-panel"/);
});

test('panel markup — summary labeled "Tool Cost" + live-badge span', () => {
  assert.match(HTML, /<summary>Tool Cost\s*<span class="live-badge" id="tool-cost-live">off<\/span>/);
});

test('panel markup — empty body with loading placeholder', () => {
  assert.match(HTML, /<div class="panel-body" id="tool-cost-body">/);
  assert.match(HTML, /Loading…/);
});

test('CSS — tool-row + tool-empty + tool-error styles present', () => {
  assert.match(HTML, /aside \.tool-row/);
  assert.match(HTML, /aside \.tool-empty/);
  assert.match(HTML, /aside \.tool-error/);
  assert.match(HTML, /aside \.panel \.live-badge/);
});

test('JS — fetchToolCost is defined and calls /transcript/:id/tool-cost', () => {
  assert.match(HTML, /function fetchToolCost\(id\)/);
  assert.match(HTML, /\/transcript\/'[\s\S]*?\+ encodeURIComponent\(id\) \+[\s\S]*?\/tool-cost/);
});

test('JS — 503 status is handled with friendly message', () => {
  assert.match(HTML, /r\.status === 503/);
  assert.match(HTML, /Tool attribution not yet available/);
});

test('JS — SSE turn_complete triggers debounced tool-cost refresh', () => {
  assert.match(HTML, /turn_complete/);
  assert.match(HTML, /scheduleToolCostRefresh\(id\)/);
  assert.match(HTML, /setTimeout\([\s\S]*?fetchToolCost\(id\)[\s\S]*?,\s*2000\)/);
});

test('JS — connect(id) primes tool-cost fetch + live badge', () => {
  // The connect() function should kick off an initial fetch and toggle the live badge
  // based on SSE onopen/onerror.
  assert.match(HTML, /fetchToolCost\(id\);\s*\n\s*setToolCostLive\(false\);\s*\n\s*src = new EventSource/);
  assert.match(HTML, /setToolCostLive\(true\)/);
});

test('JS — renderToolCostPanel sorts by attributed tokens desc', () => {
  assert.match(HTML, /function renderToolCostPanel\(tools\)/);
  assert.match(HTML, /sort\(\(a, b\) => b\.tokens - a\.tokens\)/);
  assert.match(HTML, /slice\(0, TOOL_COST_TOP_N\)/);
});

test('JS — window.__gsdtRenderToolCostPanel exposed for testability', () => {
  assert.match(HTML, /window\.__gsdtRenderToolCostPanel = renderToolCostPanel/);
  assert.match(HTML, /window\.__gsdtFetchToolCost = fetchToolCost/);
});

// ── Behavioral tests: extract + eval renderToolCostPanel in a minimal DOM ───
//
// We evaluate just the renderer fragment against a lightweight document stub.
// This exercises the sort/slice/rendering logic without jsdom.

function extractFunction(src, name) {
  // Matches: function NAME(...) { ... } where the body has balanced braces.
  const re = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = src.match(re);
  if (!m) throw new Error('function ' + name + ' not found');
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  while (depth > 0 && i < src.length) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return { signature: m[0].slice(0, -1), body: src.slice(start, i - 1) };
}

function fakeDocument(rowsOut) {
  const panelBody = {
    innerHTML: '',
    children: [],
    appendChild(el) { this.children.push(el); rowsOut.push(el); },
  };
  return {
    getElementById(id) {
      if (id === 'tool-cost-body') return panelBody;
      return null;
    },
    createElement(tag) {
      return {
        tag,
        className: '',
        textContent: '',
        children: [],
        appendChild(el) { this.children.push(el); },
      };
    },
  };
}

test('behavior — renderToolCostPanel renders top-N sorted rows', () => {
  const formatTokensFn = extractFunction(HTML, 'formatTokens');
  const panelFn = extractFunction(HTML, 'renderToolCostPanel');

  const rowsOut = [];
  const document = fakeDocument(rowsOut);
  // Provide TOOL_COST_TOP_N constant as 8 (matches source)
  const fnBody = `
    const TOOL_COST_TOP_N = 8;
    ${formatTokensFn.signature} {${formatTokensFn.body}}
    ${panelFn.signature} {${panelFn.body}}
    renderToolCostPanel(tools);
  `;
  const tools = [
    { tool: 'Read', inputTokens: 10, outputTokens: 100 },    // 110
    { tool: 'Edit', inputTokens: 50, outputTokens: 500 },    // 550
    { tool: 'Bash', inputTokens: 5, outputTokens: 5 },       // 10
    { tool: 'Grep', inputTokens: 20, outputTokens: 20 },     // 40
  ];
  const run = new Function('document', 'tools', fnBody);
  run(document, tools);

  // rowsOut includes the .tool-row divs appended in order (top-N)
  assert.equal(rowsOut.length, 4);
  // First row should be Edit (550), second Read (110), third Grep (40), fourth Bash (10)
  // Each row has children: [name, value]
  const name0 = rowsOut[0].children[0].textContent;
  const name1 = rowsOut[1].children[0].textContent;
  assert.equal(name0, 'Edit');
  assert.equal(name1, 'Read');
});

test('behavior — renderToolCostPanel shows "No tool activity yet" when empty', () => {
  const formatTokensFn = extractFunction(HTML, 'formatTokens');
  const panelFn = extractFunction(HTML, 'renderToolCostPanel');

  const rowsOut = [];
  const document = fakeDocument(rowsOut);
  const fnBody = `
    const TOOL_COST_TOP_N = 8;
    ${formatTokensFn.signature} {${formatTokensFn.body}}
    ${panelFn.signature} {${panelFn.body}}
    renderToolCostPanel(tools);
  `;
  const run = new Function('document', 'tools', fnBody);
  run(document, []);
  assert.equal(rowsOut.length, 1);
  assert.equal(rowsOut[0].className, 'tool-empty');
  assert.match(rowsOut[0].textContent, /No tool activity yet/);
});
