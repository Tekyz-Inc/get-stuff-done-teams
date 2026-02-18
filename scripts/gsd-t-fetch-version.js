#!/usr/bin/env node

/**
 * GSD-T Fetch Version — Synchronous npm registry version check
 *
 * Fetches the latest version of @tekyzinc/gsd-t from the npm registry
 * and writes it to stdout. Used by checkForUpdates() in bin/gsd-t.js.
 *
 * Bounded to 1MB response to prevent OOM.
 */

const https = require("https");

const MAX_BODY = 1048576; // 1MB

https.get("https://registry.npmjs.org/@tekyzinc/gsd-t/latest", { timeout: 5000 }, (res) => {
  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
    if (data.length > MAX_BODY) { res.destroy(); return; }
  });
  res.on("end", () => {
    try { process.stdout.write(JSON.parse(data).version); } catch { /* ignore */ }
  });
}).on("error", () => { /* silent */ });
