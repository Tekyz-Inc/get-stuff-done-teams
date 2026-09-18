"use strict";

/**
 * `gsd-t update-all` must never treat a DOWNGRADE as an upgrade.
 *
 * 2026-09-17, releasing v5.20.10: npm's cached package listing still named
 * 5.19.11 as @latest for several minutes after publish. upgradeGlobalBinary()
 * installed 5.19.11 over the running 5.20.10, printed "Global binary upgraded:
 * v5.20.10 → v5.19.11", handed off to the OLD binary, and that binary rewrote
 * ~/.claude/commands and all 34 registered projects with the previous release.
 * Twice. The guard: compare versions numerically and HALT when the installed
 * version is older than the running one.
 *
 * bin/gsd-t.js runs its CLI at load and exports nothing, so the compare helper
 * is exercised by evaluating its source text, and the halt is asserted at the
 * source level the same way test/verify-gate-tools-propagated.test.js does.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "..", "bin", "gsd-t.js"), "utf8");

function extractFunction(name) {
  const start = SRC.indexOf(`function ${name}(`);
  assert.ok(start > 0, `function ${name} must exist in bin/gsd-t.js`);
  let depth = 0, i = SRC.indexOf("{", start);
  for (; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}") { depth--; if (depth === 0) break; }
  }
  return SRC.slice(start, i + 1);
}

test("versionCmp: numeric segment compare, so 5.20.10 > 5.19.11 and 5.9.10 < 5.10.10", () => {
  const ctx = {};
  vm.runInNewContext(`${extractFunction("versionCmp")}; out = versionCmp;`, ctx);
  const cmp = ctx.out;
  assert.ok(cmp("5.20.10", "5.19.11") > 0);
  assert.ok(cmp("5.19.11", "5.20.10") < 0);
  assert.ok(cmp("5.9.10", "5.10.10") < 0, "must not compare as strings");
  assert.strictEqual(cmp("5.20.10", "5.20.10"), 0);
  assert.ok(cmp("6.0.10", "5.99.99") > 0);
});

test("upgradeGlobalBinary halts (process.exit) when the installed version is older than the running one", () => {
  const fn = extractFunction("upgradeGlobalBinary");
  const downgradeBranch = fn.indexOf("versionCmp(newVersion, PKG_VERSION) < 0");
  const upgradeBranch = fn.indexOf("newVersion !== PKG_VERSION");
  assert.ok(downgradeBranch > 0, "a downgrade check must exist");
  assert.ok(upgradeBranch > downgradeBranch, "the downgrade check must run BEFORE the 'upgraded' branch");
  const branchBody = fn.slice(downgradeBranch, upgradeBranch);
  assert.ok(/process\.exit\(1\)/.test(branchBody), "a downgrade must HALT, not hand off to the older binary");
  assert.ok(!/reexec:\s*true/.test(branchBody), "a downgrade must never re-exec into the older binary");
  assert.ok(/npm cache clean --force/.test(branchBody), "the halt names the fix (stale npm listing)");
});
