#!/usr/bin/env node
/**
 * GSD-T SessionStart hook — shows version banner, auto-updates if needed.
 * Always outputs a version line. Auto-installs new versions when available.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const VERSION_FILE = path.join(CLAUDE_DIR, ".gsd-t-version");
const CACHE_FILE = path.join(CLAUDE_DIR, ".gsd-t-update-check");
const CHANGELOG = "https://github.com/Tekyz-Inc/get-stuff-done-teams/blob/main/CHANGELOG.md";

function isNewer(a, b) {
  const ap = a.split(".").map(Number);
  const bp = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((ap[i] || 0) > (bp[i] || 0)) return true;
    if ((ap[i] || 0) < (bp[i] || 0)) return false;
  }
  return false;
}

try {
  // Read installed version
  if (!fs.existsSync(VERSION_FILE)) process.exit(0);
  const installed = fs.readFileSync(VERSION_FILE, "utf8").trim();
  if (!installed) process.exit(0);

  // Read or create cache
  let cached = null;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    }
  } catch { /* ignore */ }

  // Refresh cache if stale (>1h) or missing
  const isStale = !cached || (Date.now() - cached.timestamp) > 3600000;
  if (isStale) {
    const { execSync } = require("child_process");
    try {
      const result = execSync(
        `"${process.execPath}" -e "const h=require('https');h.get('https://registry.npmjs.org/@tekyzinc/gsd-t/latest',{timeout:5000},(r)=>{let d='';r.on('data',(c)=>d+=c);r.on('end',()=>{try{process.stdout.write(JSON.parse(d).version)}catch{}})}).on('error',()=>{})"`,
        { timeout: 8000, encoding: "utf8" }
      ).trim();
      if (result) {
        cached = { latest: result, timestamp: Date.now() };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cached));
      }
    } catch { /* network error — skip */ }
  }

  // Auto-update if newer version available
  if (cached && cached.latest && isNewer(cached.latest, installed)) {
    const latest = cached.latest;
    const { execSync } = require("child_process");
    try {
      // Install new version globally, then run update-all
      execSync(`npm install -g @tekyzinc/gsd-t@${latest}`, {
        timeout: 60000, encoding: "utf8", stdio: "pipe"
      });
      execSync("gsd-t update-all", {
        timeout: 60000, encoding: "utf8", stdio: "pipe"
      });
      // Re-read version after update
      const updated = fs.existsSync(VERSION_FILE)
        ? fs.readFileSync(VERSION_FILE, "utf8").trim()
        : latest;
      console.log(`[GSD-T AUTO-UPDATE] v${installed} → v${updated}. Changelog: ${CHANGELOG}`);
    } catch {
      // Auto-update failed — fall back to manual notice
      console.log(`[GSD-T UPDATE] v${installed} — update available (v${installed} → v${latest}). Auto-update failed — run manually: /user:gsd-t-version-update-all. Changelog: ${CHANGELOG}`);
    }
  } else {
    console.log(`[GSD-T] v${installed} — up to date. Changelog: ${CHANGELOG}`);
  }
} catch { /* graceful failure — don't block session start */ }
