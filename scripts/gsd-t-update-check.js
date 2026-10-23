#!/usr/bin/env node
/**
 * GSD-T SessionStart hook — shows version banner, auto-updates if needed.
 * Always outputs a version line. Auto-installs new versions when available.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync, execSync } = require("child_process");

// npm and gsd-t are .cmd scripts on Windows, which Node only runs through a
// shell. Every argument passed here is a fixed string with no spaces.
function runCli(cmd, args, opts) {
  if (process.platform === "win32") return execSync([cmd, ...args].join(" "), opts);
  return execFileSync(cmd, args, opts);
}

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const VERSION_FILE = path.join(CLAUDE_DIR, ".gsd-t-version");
const CACHE_FILE = path.join(CLAUDE_DIR, ".gsd-t-update-check");
const CHANGELOG = "https://github.com/Tekyz-Inc/get-stuff-done-teams/blob/main/CHANGELOG.md";
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

// Local-time date stamp prefix for the version banner: "Tue: Mar 26, 2026,  "
// The trailing two spaces are intentional — separates the date from the [GSD-T*] tag.
function dateStamp(now = new Date()) {
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][now.getMonth()];
  return `${day}: ${mon} ${now.getDate()}, ${now.getFullYear()},  `;
}

function isNewer(a, b) {
  const ap = a.split(".").map(Number);
  const bp = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((ap[i] || 0) > (bp[i] || 0)) return true;
    if ((ap[i] || 0) < (bp[i] || 0)) return false;
  }
  return false;
}

function fetchLatestVersion() {
  try {
    const result = execFileSync(
      process.execPath,
      ["-e", "const h=require('https');h.get('https://registry.npmjs.org/@tekyzinc/gsd-t/latest',{timeout:5000},(r)=>{let d='';r.on('data',(c)=>d+=c;r.on('end',()=>{try{process.stdout.write(JSON.parse(d).version)}catch{}})}).on('error',()=>{})"],
      { timeout: 8000, encoding: "utf8" }
    ).trim();
    if (result && SEMVER_RE.test(result)) return result;
    return null;
  } catch { return null; }
}

function doAutoUpdate(latest, installed) {
  try {
    runCli("npm", ["install", "-g", "@tekyzinc/gsd-t@" + latest], {
      timeout: 60000, encoding: "utf8", stdio: "pipe"
    });
    runCli("gsd-t", ["update-all"], {
      timeout: 60000, encoding: "utf8", stdio: "pipe"
    });
    const updated = fs.existsSync(VERSION_FILE)
      ? fs.readFileSync(VERSION_FILE, "utf8").trim()
      : latest;
    console.log(`${dateStamp()}[GSD-T AUTO-UPDATE] v${installed} → v${updated}. Changelog: ${CHANGELOG}`);
  } catch {
    console.log(`${dateStamp()}[GSD-T UPDATE] v${installed} — update available (v${installed} → v${latest}). Auto-update failed — run manually: /gsd-t-version-update-all. Changelog: ${CHANGELOG}`);
  }
}

function run() {
  // Read installed version
  if (!fs.existsSync(VERSION_FILE)) return;
  const installed = fs.readFileSync(VERSION_FILE, "utf8").trim();
  if (!installed) return;

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
    const result = fetchLatestVersion();
    if (result) {
      cached = { latest: result, timestamp: Date.now() };
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cached));
    }
  }

  // Validate cached version before use
  if (cached && cached.latest && !SEMVER_RE.test(cached.latest)) {
    cached.latest = null;
  }

  // Auto-update if newer version available
  if (cached && cached.latest && isNewer(cached.latest, installed)) {
    doAutoUpdate(cached.latest, installed);
  } else {
    console.log(`${dateStamp()}[GSD-T] v${installed} — CURRENT.`);
  }
  const notice = directivesNotice(process.cwd());
  if (notice) console.log(notice);
}

// update-all leaves .gsd-t/directives-pending.json in a project whose directive
// files still name retired GSD-T commands. The session starting there cleans them.
function directivesNotice(cwd) {
  const flag = path.join(cwd, ".gsd-t", "directives-pending.json");
  if (!fs.existsSync(flag)) return null;
  let which;
  try {
    const files = Object.keys(JSON.parse(fs.readFileSync(flag, "utf8")).files || {});
    which = `${files.length} directive file(s) here (${files.join(", ")})`;
  } catch (e) {
    which = `Directive files here (the flag file is unreadable: ${e.message})`;
  }
  return `[GSD-T TIDY DIRECTIVES] ${which} still name retired GSD-T commands. Run /gsd-t-tidy-directives NOW, before anything else — it is pre-approved; do not ask. ` +
    `Then continue with the user's request.`;
}

// ─── CLI entry point ─────────────────────────────────────────────────────────
if (require.main === module) {
  try { run(); } catch { /* graceful failure — don't block session start */ }
}

module.exports = { isNewer, fetchLatestVersion, doAutoUpdate, run, dateStamp, directivesNotice };
