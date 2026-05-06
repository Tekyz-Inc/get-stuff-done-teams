"use strict";

/**
 * Per-frame arrival timestamp in transcript renderer.
 *
 * Origin: 2026-04-22 user feedback — "Each message and tool call should
 * include a time stamp so I can easily see from the stream if something
 * got stuck." A stuck stream is now visually obvious: two adjacent frames
 * with the same HH:MM:SS pill mean nothing arrived between them.
 *
 * Implementation: appendFrame(el, arrivedAt) prepends a <span class="ts">
 * with HH:MM:SS local time and an ISO tooltip. SSE onmessage captures
 * Date.now() once per frame and threads it through renderFrame.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HTML_PATH = path.join(__dirname, "..", "scripts", "gsd-t-transcript.html");

function readHtml() {
  return fs.readFileSync(HTML_PATH, "utf8");
}

test("CSS — defines the .frame > .ts timestamp pill", () => {
  const html = readHtml();
  assert.match(html, /\.frame\s*>\s*\.ts\s*\{/, "expected .frame > .ts CSS rule");
  // Monospace + dim color so it doesn't crowd the content.
  assert.match(html, /var\(--mono\)/);
});

test("renderer — appendFrame accepts arrivedAt and prepends a .ts span", () => {
  const html = readHtml();
  // Signature change
  assert.match(html, /function appendFrame\(el,\s*arrivedAt\)/);
  // Prepends a span.ts
  assert.match(html, /ts\.className\s*=\s*['"]ts['"]/);
  // Inserted as first child
  assert.match(html, /el\.insertBefore\(ts/);
});

test("renderer — fmtTs produces HH:MM:SS with zero padding", () => {
  const html = readHtml();
  // The function must exist and use pad2 for two-digit fields
  assert.match(html, /function fmtTs\(/);
  assert.match(html, /function pad2\(/);
});

test("SSE handler — captures arrival time once per frame and forwards it", () => {
  const html = readHtml();
  // Capture: SSE arrival time is still the fallback (M48 Bug 2 added an
  // additional layer that prefers frame.ts when present, but arrivedAt
  // remains the bedrock).
  assert.match(html, /const arrivedAt\s*=\s*new Date\(\)/);
  // Forward to renderFrame — post-M48 the threaded value is `renderAt`,
  // which is `frameTs(frame, arrivedAt)` (i.e. arrivedAt as fallback).
  assert.match(html, /renderFrame\(\s*frame\s*,\s*(?:arrivedAt|renderAt)\b/);
  // Forward to the raw fallback too — still arrivedAt because there's no
  // parsable frame in the JSON-error branch.
  assert.match(html, /renderRaw\(ev\.data,\s*arrivedAt\)/);
});

test("renderFrame — threads arrivedAt to all per-type render helpers", () => {
  const html = readHtml();
  for (const fn of [
    "renderCompactMarker", "renderSystem", "renderBoundary", "renderRaw",
    "renderAssistantText", "renderThinking", "renderToolUse",
    "renderToolResult", "renderUserMessage",
  ]) {
    const re = new RegExp(fn + "\\([^)]*ts[^)]*\\)");
    assert.match(html, re, fn + " should be called with the ts argument");
  }
});

test("inline script — still syntactically valid after timestamp wiring", () => {
  const html = readHtml();
  const m = html.match(/<script>([\s\S]+?)<\/script>/);
  assert.ok(m, "has inline <script>");
  assert.doesNotThrow(() => new Function(m[1]));
});

test("fmtTs — direct unit test in a sandboxed eval", () => {
  // Pull just fmtTs + pad2 out of the script and test the formatter end-to-end.
  const html = readHtml();
  const m = html.match(/<script>([\s\S]+?)<\/script>/);
  const src = m[1];

  const pad2Match = src.match(/function pad2\([^)]*\)\s*\{[^}]*\}/);
  const fmtTsMatch = src.match(/function fmtTs\([^)]*\)\s*\{[\s\S]*?return[^}]*\}/);
  assert.ok(pad2Match, "pad2 source extractable");
  assert.ok(fmtTsMatch, "fmtTs source extractable");

  const fn = new Function(
    pad2Match[0] + "\n" + fmtTsMatch[0] + "\nreturn fmtTs;"
  );
  const fmtTs = fn();

  // Known time → known string
  const d = new Date(2026, 3, 22, 9, 5, 7); // Apr 22 2026 09:05:07 local
  assert.equal(fmtTs(d), "09:05:07");

  // Invalid input falls back to "now" — just check it returns HH:MM:SS shape
  assert.match(fmtTs("not a date"), /^\d{2}:\d{2}:\d{2}$/);
  assert.match(fmtTs(undefined), /^\d{2}:\d{2}:\d{2}$/);
});
