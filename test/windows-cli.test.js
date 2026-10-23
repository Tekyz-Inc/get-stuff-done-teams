/**
 * npm, npx and gsd-t are .cmd scripts on Windows; Node cannot launch them
 * without a shell ("spawnSync npm ENOENT" — seen on a Windows machine running
 * `gsd-t update-all`, 2026-10-23). Every CLI call goes through a shell there.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "bin", "gsd-t.js"), "utf8");

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} must exist`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

function runCliOn(platform) {
  const calls = [];
  const ctx = {
    process: { platform },
    execSync: (line, opts) => calls.push({ via: "shell", line, opts }),
    execFileSync: (cmd, args, opts) => calls.push({ via: "file", cmd, args, opts }),
  };
  vm.runInNewContext(`${extractFunction(SRC, "runCli")}; out = runCli;`, ctx);
  ctx.out("npm", ["install", "-g", "@tekyzinc/gsd-t@latest"], { stdio: "inherit" });
  return calls[0];
}

test("runCli: Windows runs npm through a shell as one command line", () => {
  const c = runCliOn("win32");
  assert.strictEqual(c.via, "shell");
  assert.strictEqual(c.line, "npm install -g @tekyzinc/gsd-t@latest");
  assert.strictEqual(c.opts.stdio, "inherit");
});

test("runCli: macOS and Linux keep the direct call", () => {
  const c = runCliOn("darwin");
  assert.strictEqual(c.via, "file");
  assert.strictEqual(c.cmd, "npm");
  assert.deepStrictEqual(c.args, ["install", "-g", "@tekyzinc/gsd-t@latest"]);
});

test("no direct npm / npx / gsd-t call is left that would fail on Windows", () => {
  const files = ["bin/gsd-t.js", "scripts/gsd-t-update-check.js", "bin/gsd-t-install-check.cjs"];
  for (const f of files) {
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    const bare = s.match(/(execFileSync|spawnSync|spawn)\(\s*["'](npm|npx|gsd-t)["']/g) || [];
    const guarded = (s.match(/process\.platform === "win32" \? execSync\("npm/g) || []).length;
    assert.strictEqual(bare.length - guarded, 0, `${f}: ${bare.join(", ")}`);
  }
});

test("upgradeGlobalBinary reads the new version from `npm root -g` and HALTS when it is missing", () => {
  const fn = extractFunction(SRC, "upgradeGlobalBinary");
  assert.ok(/runCli\("npm", \["root", "-g"\]/.test(fn), "uses npm root -g (Windows has no lib/ under the prefix)");
  assert.ok(!/"lib", "node_modules"/.test(fn), "no hard-coded lib/node_modules");
  assert.ok(/throw new Error\(`npm reported success but/.test(fn), "a missing package.json halts");
  assert.ok(!/Best-effort/.test(fn), "no silent fall-through");
});
