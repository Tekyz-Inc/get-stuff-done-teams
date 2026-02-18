#!/usr/bin/env node

/**
 * Background update check — spawned detached by the CLI to refresh the version cache.
 * Usage: node npm-update-check.js <cache-file-path>
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const cacheFile = process.argv[2];
if (!cacheFile) process.exit(1);

// Validate cache path is within ~/.claude/ to prevent arbitrary file writes
const resolved = path.resolve(cacheFile);
const claudeDir = path.join(os.homedir(), ".claude");
if (!resolved.startsWith(claudeDir + path.sep) && resolved !== claudeDir) {
  process.exit(1);
}

https.get("https://registry.npmjs.org/@tekyzinc/gsd-t/latest",
  { timeout: 5000 }, (res) => {
  let d = "";
  res.on("data", (c) => d += c);
  res.on("end", () => {
    try {
      const v = JSON.parse(d).version;
      if (v && /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(v)) {
        // Symlink check — prevent redirection to arbitrary files
        try { if (fs.lstatSync(cacheFile).isSymbolicLink()) return; } catch { /* doesn't exist yet — safe */ }
        fs.writeFileSync(cacheFile,
          JSON.stringify({ latest: v, timestamp: Date.now() }));
      }
    } catch { /* malformed response — skip */ }
  });
}).on("error", () => {});
