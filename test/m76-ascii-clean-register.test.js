"use strict";

// M76 — register output must not contain the punctuation that mojibakes in non-UTF-8
// terminals (em/en dashes, smart quotes, ellipsis). The severity COLOR BULLETS
// (🔴🟠🟡🟢) are intentional and KEPT — they render fine and the user wants them; only
// dashes/quotes/ellipsis are normalized. ascii() (mirrored here) handles free-text
// fields; the severity bullets live in the fmtChunks template.

const { test } = require("node:test");
const assert = require("node:assert/strict");

function ascii(s) {
  return String(s == null ? "" : s)
    .replace(/[—–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[ \t]+\n/g, "\n");
}

test("ascii() normalizes em/en dashes to hyphen (the actual mojibake cause)", () => {
  assert.equal(ascii("Foo — bar"), "Foo - bar");
  assert.equal(ascii("range 1–10"), "range 1-10");
});

test("ascii() normalizes smart quotes + ellipsis", () => {
  assert.equal(ascii("it’s “quoted”"), "it's \"quoted\"");
  assert.equal(ascii("wait…"), "wait...");
});

test("ascii() KEEPS severity color bullets (user wants them; they render fine)", () => {
  assert.equal(ascii("🔴 Critical"), "🔴 Critical");
  assert.match(ascii("🟠🟡🟢"), /🟠🟡🟢/);
});

test("ascii() output has no em/en dash, smart quote, or ellipsis chars", () => {
  const out = ascii("The `PUT /x` endpoint — uses “requireAuth” … fix it");
  assert.doesNotMatch(out, /[—–“”‘’…]/u, `still has mojibake punctuation: ${JSON.stringify(out)}`);
});

// Structural guard: fmtChunks output literals keep the severity bullets but contain
// no em/en-dash (the mojibake cause).
const fs = require("node:fs");
const path = require("node:path");
test("gsd-t-scan.workflow.js fmtChunks keeps severity bullets but emits no em/en-dash", () => {
  const body = fs.readFileSync(path.resolve(__dirname, "..", "templates", "workflows", "gsd-t-scan.workflow.js"), "utf8");
  const m = body.match(/function fmtChunks\([\s\S]*?\n\}/);
  assert.ok(m, "fmtChunks found");
  const fn = m[0];
  assert.match(fn, /🔴|🟠|🟡|🟢/u, "severity color bullets kept in fmtChunks");
  assert.doesNotMatch(fn, /[—–]/u, "no em/en dash in fmtChunks output literals");
});
