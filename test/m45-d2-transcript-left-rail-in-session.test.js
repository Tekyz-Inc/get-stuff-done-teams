/**
 * M45 D2 — viewer left-rail labels in-session spawns distinctly.
 *
 * Tests (text-based inspection of gsd-t-transcript.html):
 *   1. The renderTree block contains the `in-session-` prefix check.
 *   2. The renderer emits a `💬 conversation` label for in-session entries.
 *   3. The CSS defines the `.label-in-session` accent color.
 *   4. The spawn class list includes `in-session` when the node matches.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const HTML_PATH = path.join(__dirname, "..", "scripts", "gsd-t-transcript.html");

function readHtml() {
  return fs.readFileSync(HTML_PATH, "utf8");
}

describe("M45 D2 viewer left-rail: in-session discriminator", () => {
  it("renderTree checks for the `in-session-` spawn-id prefix", () => {
    const html = readHtml();
    // The front-end-only contract: indexOf('in-session-') === 0 (or .startsWith).
    const hasCheck =
      /spawnId\.indexOf\(['"]in-session-['"]\)\s*===\s*0/.test(html) ||
      /spawnId\.startsWith\(['"]in-session-['"]\)/.test(html);
    assert.ok(hasCheck, "renderTree must check for the in-session- prefix on spawnId");
  });

  it("emits a `💬 conversation` label for in-session entries", () => {
    const html = readHtml();
    assert.match(
      html,
      /💬 conversation/,
      "left-rail should carry a '💬 conversation' label for in-session entries"
    );
  });

  it("defines a `.label-in-session` style rule", () => {
    const html = readHtml();
    assert.match(
      html,
      /\.label-in-session\s*\{[^}]*color:/,
      "CSS must include a .label-in-session color rule"
    );
  });

  it("adds the `in-session` class to the node element for in-session rows", () => {
    const html = readHtml();
    // Either a classList.add('in-session') call or a literal 'in-session' class string.
    const classAdded =
      /classList\.add\(['"]in-session['"]\)/.test(html) ||
      /el\.className[^\n]*in-session/.test(html);
    assert.ok(classAdded, "node element must receive the 'in-session' class for fallback styling");
  });

  it("default spawn entries still render with the legacy `▶ spawn` / command prefix", () => {
    const html = readHtml();
    // The existing default branch must remain — don't regress legacy spawn labelling.
    assert.match(
      html,
      /node\.command \|\| ['"]spawn['"]/,
      "default spawn entries must still use (node.command || 'spawn') as the label root"
    );
  });
});
