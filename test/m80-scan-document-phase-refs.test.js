"use strict";

// M80 — guard the scan workflow's Document-phase variable references.
//
// The scan workflow crashed run wf_b2a6a9e0-9de with `ReferenceError: findingsJson
// is not defined` — AFTER all 224 finder/verify/synthesis agents ran (~46 min,
// 8.8M tokens). `findingsJson` was referenced inside the `baseCtx` array (the context
// every document-phase agent consumes) but was never declared. This is the same bug
// CLASS as the M71 `render` dangling reference: valid syntax, undefined only at
// runtime, in a stage that runs near the very end — so it wastes the entire run.
//
// The M71 note correctly says a blanket undefined-reference linter is too crude. This
// test is NARROW: it checks only that each local identifier consumed by the `baseCtx`
// document-context array is declared (const/let) somewhere earlier in the file. That
// covers the exact surface that just failed without the false-positive problem of a
// whole-file linter.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const WF = path.resolve(__dirname, "..", "templates", "workflows", "gsd-t-scan.workflow.js");

// Globals the sandbox provides — not local declarations, but legitimately referenceable.
const SANDBOX_GLOBALS = new Set([
  "agent", "parallel", "pipeline", "log", "phase", "budget", "args",
  "JSON", "Math", "Object", "Array", "String", "Number", "Boolean", "Set", "Map",
  "console", "undefined", "null", "true", "false",
]);

function declaredNames(body) {
  const names = new Set();
  // `const x =`, `let x =`, `const { a, b } =`, `const [a, b] =`, `function fn(`
  const reSimple = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
  const reDestructure = /\b(?:const|let|var)\s*[{[]([^}\]]+)[}\]]\s*=/g;
  const reFn = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = reSimple.exec(body))) names.add(m[1]);
  while ((m = reFn.exec(body))) names.add(m[1]);
  while ((m = reDestructure.exec(body))) {
    for (const part of m[1].split(",")) {
      const id = part.trim().split(":").pop().trim().replace(/\s*=.*/, "");
      if (/^[A-Za-z_$][\w$]*$/.test(id)) names.add(id);
    }
  }
  return names;
}

test("every identifier used in the scan Document-phase baseCtx is declared", () => {
  const body = fs.readFileSync(WF, "utf8");

  const start = body.indexOf("const baseCtx = [");
  assert.ok(start !== -1, "baseCtx array not found — did the Document phase get renamed?");
  const end = body.indexOf("].join(", start);
  assert.ok(end !== -1 && end > start, "baseCtx array terminator not found");
  const rawBlock = body.slice(start, end);

  // Strip string/template literal CONTENT so prose words inside backtick text
  // ("the scan covered") aren't mistaken for code identifiers — but KEEP the
  // interior of template `${ ... }` interpolations, which IS code. Replace each
  // literal body with its preserved interpolations only.
  function stripStringsKeepInterp(src) {
    let out = "";
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === "`") {
        i++;
        while (i < src.length && src[i] !== "`") {
          if (src[i] === "$" && src[i + 1] === "{") {
            i += 2; let depth = 1; let expr = "";
            while (i < src.length && depth > 0) {
              if (src[i] === "{") depth++;
              else if (src[i] === "}") { depth--; if (depth === 0) break; }
              expr += src[i]; i++;
            }
            out += " " + expr + " ";
          }
          i++;
        }
        i++; // closing backtick
      } else if (ch === '"' || ch === "'") {
        const q = ch; i++;
        while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; }
        i++;
      } else { out += ch; i++; }
    }
    return out;
  }

  const block = stripStringsKeepInterp(rawBlock);
  const declared = declaredNames(body);
  const used = new Set();
  const reIdent = /(?<![.\w$])([A-Za-z_$][\w$]*)\b/g;
  let m;
  while ((m = reIdent.exec(block))) {
    const id = m[1];
    if (["const", "baseCtx", "length", "slice"].includes(id)) continue;
    used.add(id);
  }

  const undeclared = [...used].filter((id) => !declared.has(id) && !SANDBOX_GLOBALS.has(id));
  assert.deepEqual(
    undeclared,
    [],
    `baseCtx references identifiers never declared (ReferenceError at runtime, after the whole scan runs): ${undeclared.join(", ")}`
  );
});

test("findingsJson specifically is declared before baseCtx consumes it", () => {
  const body = fs.readFileSync(WF, "utf8");
  const decl = body.search(/\bconst\s+findingsJson\s*=/);
  const use = body.indexOf("findingsJson.length");
  assert.ok(decl !== -1, "findingsJson is never declared");
  assert.ok(use !== -1, "findingsJson is never used (test stale?)");
  assert.ok(decl < use, "findingsJson must be declared before it is consumed in baseCtx");
});

// M80: the plain-english write must be a SINGLE owning agent that self-verifies the
// on-disk entry count — NOT a fan-out of per-chunk heredoc-append agents (which silently
// dropped the middle chunks: run wf_b2a6a9e0-9de shipped 65/181 entries).
test("plain-english write is a single self-verifying owner, not a per-chunk append fan-out", () => {
  const body = fs.readFileSync(WF, "utf8");
  // The fragile pattern: a `for` loop over peChunks each spawning a write agent.
  assert.doesNotMatch(
    body,
    /for\s*\([^)]*peChunks[^)]*\)\s*\{[\s\S]{0,400}?gatedAgent/,
    "plain-english must not loop per-chunk spawning a write agent (heredoc-append drops content)"
  );
  // The robust pattern: one writer + an independent grep-count verification.
  assert.match(body, /peExpectedEntries/, "writer must compute an expected entry count");
  assert.match(body, /grep -c '\^### TD-'/, "completeness is verified by counting ### TD- on disk");
  assert.match(body, /plainEnglishComplete/, "completeness must be surfaced in the return value");
});

const COLLECTOR = path.resolve(__dirname, "..", "bin", "scan-data-collector.js");

// M80: parseComponents must handle the format the deep-scan document agent actually
// produces — a "## Components / Domains" section of "### N. Title" subsections, and a
// Structure rendered as a markdown table — not only the legacy "## Component Inventory"
// table + bare-line Structure. (The GSD-T self-scan regenerated scan/architecture.md in
// the new format and the old parser returned zero domains, breaking the renderer.)
test("collectScanData parses domains from a '### N. Title' Components/Domains section", () => {
  delete require.cache[require.resolve(COLLECTOR)];
  const { collectScanData } = require(COLLECTOR);
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "m80c-"));
  fs.mkdirSync(path.join(tmp, ".gsd-t", "scan"), { recursive: true });
  fs.writeFileSync(path.join(tmp, ".gsd-t", "scan", "architecture.md"), [
    "# Arch", "## Structure", "", "| Dir | Purpose | Files | LOC |", "|--|--|--|--|",
    "| `bin/` | CLI | 52 | ~18000 |", "", "## Components / Domains", "",
    "### 1. CLI Installer", "blah", "### 2. Workflow Engine", "blah", "### 3. Scan Engine", "blah", "",
    "## Data Flow", "",
  ].join("\n"));
  const r = collectScanData(tmp);
  const names = r.domains.map((d) => d.name);
  assert.ok(names.includes("CLI Installer"), "parses ### N. Title domain entries");
  assert.ok(names.includes("Scan Engine"));
  assert.equal(r.domains.length, 3, "exactly the three domain subsections");
  fs.rmSync(tmp, { recursive: true, force: true });
});
