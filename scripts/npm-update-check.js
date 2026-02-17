#!/usr/bin/env node

/**
 * Background update check — spawned detached by the CLI to refresh the version cache.
 * Usage: node npm-update-check.js <cache-file-path>
 */

const https = require("https");
const fs = require("fs");

const cacheFile = process.argv[2];
if (!cacheFile) process.exit(1);

https.get("https://registry.npmjs.org/@tekyzinc/gsd-t/latest",
  { timeout: 5000 }, (res) => {
  let d = "";
  res.on("data", (c) => d += c);
  res.on("end", () => {
    try {
      const v = JSON.parse(d).version;
      if (v && /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(v)) {
        fs.writeFileSync(cacheFile,
          JSON.stringify({ latest: v, timestamp: Date.now() }));
      }
    } catch { /* malformed response — skip */ }
  });
}).on("error", () => {});
