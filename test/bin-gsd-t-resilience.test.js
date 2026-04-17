"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const PKG_ROOT = path.resolve(__dirname, "..");
const SRC_GSD_T = path.join(PKG_ROOT, "bin", "gsd-t.js");
const SRC_DEBUG_LEDGER = path.join(PKG_ROOT, "bin", "debug-ledger.js");

function mkTmp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `gsd-t-resilience-${name}-`));
}

test("bin/gsd-t.js loads without throwing when debug-ledger.js is missing", () => {
  const tmp = mkTmp("missing-ledger");
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  // Seed a minimal package.json so the installer's own version lookup succeeds
  fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name: "t", version: "0.0.0" }));
  // Copy gsd-t.js only — intentionally omit debug-ledger.js
  fs.copyFileSync(SRC_GSD_T, path.join(binDir, "gsd-t.js"));
  // Dry-load via --version so it exercises the top-level require without
  // taking any side effects beyond printing the version.
  const res = spawnSync(process.execPath, [path.join(binDir, "gsd-t.js"), "--version"], {
    encoding: "utf8",
    timeout: 15000,
  });
  assert.doesNotMatch(res.stderr || "", /Cannot find module.*debug-ledger/, "missing debug-ledger must not crash");
  assert.doesNotMatch(res.stderr || "", /debug-ledger/, "no debug-ledger references in stderr");
});

test("copyBinToolsToProject removes a stray bin/gsd-t.js matching installer signature", () => {
  const tmp = mkTmp("sweep-match");
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  // Seed with current source content — matches signature
  fs.copyFileSync(SRC_GSD_T, path.join(binDir, "gsd-t.js"));
  assert.ok(fs.existsSync(path.join(binDir, "gsd-t.js")), "stray present before sweep");

  const gt = require(SRC_GSD_T);
  gt.copyBinToolsToProject(tmp, "test-project");

  assert.ok(!fs.existsSync(path.join(binDir, "gsd-t.js")), "matching-signature stray must be deleted");
});

test("copyBinToolsToProject sweeps older-version stray with the installer signature", () => {
  const tmp = mkTmp("sweep-older");
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  // Simulate an older version of our own file: correct header, different body.
  // The sweep must still remove it because the signature matches the installer.
  const olderVersion = [
    "#!/usr/bin/env node",
    "",
    "/**",
    " * GSD-T CLI Installer",
    " *",
    " * Usage:",
    " *   npx @tekyzinc/gsd-t install",
    " */",
    "",
    "// old v3.13.11 body — intentionally different from current source",
    "const debugLedger = require('./debug-ledger.js');",
    "// …",
  ].join("\n");
  fs.writeFileSync(path.join(binDir, "gsd-t.js"), olderVersion);

  const gt = require(SRC_GSD_T);
  gt.copyBinToolsToProject(tmp, "test-project");

  assert.ok(!fs.existsSync(path.join(binDir, "gsd-t.js")), "older-version stray (signature match) must be deleted");
});

test("copyBinToolsToProject leaves a user-owned bin/gsd-t.js alone when signature doesn't match", () => {
  const tmp = mkTmp("sweep-skip");
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  // User's own file: shebang but missing the "GSD-T CLI Installer" marker
  const userOwned = "#!/usr/bin/env node\n// user's own helper script\nconsole.log('mine');\n";
  fs.writeFileSync(path.join(binDir, "gsd-t.js"), userOwned);

  const gt = require(SRC_GSD_T);
  gt.copyBinToolsToProject(tmp, "test-project");

  assert.ok(fs.existsSync(path.join(binDir, "gsd-t.js")), "user-owned file must survive sweep");
  assert.equal(fs.readFileSync(path.join(binDir, "gsd-t.js"), "utf8"), userOwned, "content unchanged");
});
