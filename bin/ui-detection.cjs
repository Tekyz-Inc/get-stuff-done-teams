"use strict";

// UI detection probe — synchronous, never throws, depth-bounded.
// Contract: .gsd-t/contracts/playwright-bootstrap-contract.md §4
//
// hasUI(projectDir): true iff the project has any UI signal.
//   Probe order (first match wins, short-circuit):
//     1. package.json deps/devDeps include react/vue/svelte/next/@angular/core/@vue/runtime-core
//     2. pubspec.yaml at project root (Flutter)
//     3. tailwind.config.{js,ts}
//     4. any .tsx/.jsx/.vue/.svelte/.css/.scss within depth 3, excluding ignored dirs
//
// detectUIFlavor(projectDir): more specific category, or null when hasUI() is false.

const fs = require("fs");
const path = require("path");

const FRAMEWORK_DEPS = {
  next: "next",
  angular: "@angular/core",
  react: "react",
  vue: "vue",
  svelte: "svelte",
  // @vue/runtime-core implies vue
  "vue-runtime": "@vue/runtime-core",
};

const UI_FILE_EXTS = new Set([".tsx", ".jsx", ".vue", ".svelte", ".css", ".scss"]);

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".gsd-t",
]);

const MAX_WALK_DEPTH = 3;

function _readPkgDeps(projectDir) {
  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    const deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
    return deps;
  } catch (_e) {
    return null;
  }
}

function _frameworkFromDeps(deps) {
  if (!deps) return null;
  // Order matters: next before react (Next ships with react), vue-runtime → vue, angular, svelte.
  if (deps[FRAMEWORK_DEPS.next]) return "next";
  if (deps[FRAMEWORK_DEPS.angular]) return "angular";
  if (deps[FRAMEWORK_DEPS.vue] || deps[FRAMEWORK_DEPS["vue-runtime"]]) return "vue";
  if (deps[FRAMEWORK_DEPS.svelte]) return "svelte";
  if (deps[FRAMEWORK_DEPS.react]) return "react";
  return null;
}

function _isFile(p) {
  try {
    const st = fs.statSync(p, { throwIfNoEntry: false });
    return !!(st && st.isFile());
  } catch (_e) {
    return false;
  }
}

function _hasFlutter(projectDir) {
  return _isFile(path.join(projectDir, "pubspec.yaml"));
}

function _hasTailwindConfig(projectDir) {
  return (
    _isFile(path.join(projectDir, "tailwind.config.js")) ||
    _isFile(path.join(projectDir, "tailwind.config.ts")) ||
    _isFile(path.join(projectDir, "tailwind.config.mjs")) ||
    _isFile(path.join(projectDir, "tailwind.config.cjs"))
  );
}

// Depth-bounded short-circuit walk. Returns true on first UI file found.
function _findUIFileWithinDepth(rootDir, maxDepth) {
  // BFS-style iterative walk (avoid recursion depth + stack issues on weird trees).
  const stack = [{ dir: rootDir, depth: 0 }];
  while (stack.length > 0) {
    const { dir, depth } = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      continue;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (entry.isFile()) {
        const ext = path.extname(name).toLowerCase();
        if (UI_FILE_EXTS.has(ext)) return true;
      } else if (entry.isDirectory()) {
        // Contract §4 enumerates the exclusion set — do not over-exclude
        // dot-prefixed dirs (e.g. .storybook houses real UI code).
        if (IGNORED_DIRS.has(name)) continue;
        if (depth + 1 <= maxDepth) {
          stack.push({ dir: path.join(dir, name), depth: depth + 1 });
        }
      }
    }
  }
  return false;
}

function hasUI(projectDir) {
  if (typeof projectDir !== "string" || projectDir.length === 0) return false;
  try {
    const deps = _readPkgDeps(projectDir);
    if (_frameworkFromDeps(deps) !== null) return true;
    if (_hasFlutter(projectDir)) return true;
    if (_hasTailwindConfig(projectDir)) return true;
    if (_findUIFileWithinDepth(projectDir, MAX_WALK_DEPTH)) return true;
    return false;
  } catch (_e) {
    return false;
  }
}

function detectUIFlavor(projectDir) {
  if (typeof projectDir !== "string" || projectDir.length === 0) return null;
  try {
    const deps = _readPkgDeps(projectDir);
    const framework = _frameworkFromDeps(deps);
    if (framework !== null) return framework;
    if (_hasFlutter(projectDir)) return "flutter";
    if (_hasTailwindConfig(projectDir)) return "css-only";
    if (_findUIFileWithinDepth(projectDir, MAX_WALK_DEPTH)) return "css-only";
    return null;
  } catch (_e) {
    return null;
  }
}

module.exports = {
  hasUI,
  detectUIFlavor,
};
