#!/usr/bin/env node
/**
 * gsd-t-install-check.cjs
 *
 * M108 — Install self-check and repair.
 *
 * [RULE] install-check-repairs-then-continues-never-routes-around
 * [RULE] install-check-records-every-repair
 * [RULE] install-check-halts-when-it-cannot-repair
 *
 * A project's `bin/` is supposed to hold every tool the installer ships. When
 * one is missing, the tools that need it break — and until now nothing noticed.
 * Binvoice ran for weeks with 21 of 38 tools.
 *
 * This is NOT a fallback. A fallback continues PAST a failure with a worse
 * answer. This FIXES the failure — it copies the missing file from the
 * installed package — and then the work continues with everything present. If
 * it cannot fix it, it HALTS and says so; it never lets the work proceed on a
 * broken install.
 *
 * Every repair is written to a shared log so a pattern across projects becomes
 * visible: if the same tool keeps going missing everywhere, the installer
 * itself is what needs fixing.
 *
 * ─── Usage ──────────────────────────────────────────────────────────────────
 *   node gsd-t-install-check.cjs --project <dir>            # check + repair
 *   node gsd-t-install-check.cjs --project <dir> --check    # report only
 *   node gsd-t-install-check.cjs --report                   # read the shared log
 *
 * ─── Exit codes ─────────────────────────────────────────────────────────────
 *   0  install is complete (possibly after a repair)
 *   4  something is missing and could not be repaired — HALT
 *   64 bad input
 *
 * Zero dependencies.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const EXIT_OK = 0;
const EXIT_UNREPAIRABLE = 4;
const EXIT_BAD_INPUT = 64;

const LOG_PATH = path.join(os.homedir(), ".claude", "gsd-t-install-repairs.jsonl");

/**
 * Where the installed package lives — the source every repair copies from.
 *
 * Two places, asked in order, because they answer DIFFERENT questions: "am I
 * running from inside the package?" and "where does npm keep global installs?".
 * That is not hunting for a file; it is two distinct facts about this machine.
 *
 * Throws with what went wrong. It never returns nothing as if that were an
 * ordinary answer — without the package there is nothing to repair from, and
 * the caller must stop.
 */
function findPackageRoot() {
  const problems = [];

  // 1. Running from inside the package itself.
  const here = path.resolve(__dirname, "..");
  const herePkg = path.join(here, "package.json");
  if (fs.existsSync(herePkg)) {
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(herePkg, "utf8"));
    } catch (e) {
      problems.push(`${herePkg} could not be read: ${e.message}`);
    }
    if (pkg && pkg.name === "@tekyzinc/gsd-t") return here;
  }

  // 2. Ask npm where global installs live.
  let root;
  try {
    root = execFileSync("npm", ["root", "-g"], { encoding: "utf8", timeout: 10000 }).trim();
  } catch (e) {
    problems.push(`npm could not be asked where global packages live: ${e.message}`);
  }
  if (root) {
    const p = path.join(root, "@tekyzinc", "gsd-t");
    if (fs.existsSync(path.join(p, "package.json"))) return p;
    problems.push(`GSD-T is not installed at ${p}`);
  }

  throw new Error(
    "The installed GSD-T package could not be located, so nothing can be checked " +
    "or repaired.\n  " + problems.join("\n  ")
  );
}

/** The list of tools every project is supposed to have. Read from the installer. */
function expectedTools(pkgRoot) {
  const installer = path.join(pkgRoot, "bin", "gsd-t.js");
  const src = fs.readFileSync(installer, "utf8");
  const m = src.match(/const PROJECT_BIN_TOOLS = \[([^]*?)\n\];/);
  if (!m) throw new Error(`could not read the tool list from ${installer}`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function packageVersion(pkgRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8")).version || "unknown";
  } catch (_) {
    return "unknown";
  }
}

/**
 * Compare a project's bin/ against the expected list.
 * Returns { missing, stale, present } — stale means the file exists but its
 * content differs from the package's copy.
 */
/**
 * Is this directory GSD-T's own source repo (or a worktree of it)?
 *
 * Identified by the package name in its own package.json — the one fact that
 * cannot drift, since it IS what npm publishes. A path check would miss a
 * worktree under ~/Worktrees, and a marker file would need maintaining.
 *
 * An unreadable or absent package.json means "not the source repo": an ordinary
 * project that happens to have no manifest still deserves its repair.
 */
function isOwnSourceRepo(dir) {
  const manifest = path.join(dir, "package.json");
  if (!fs.existsSync(manifest)) return false;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(manifest, "utf8"));
  } catch (_) {
    return false;
  }
  return parsed && parsed.name === "@tekyzinc/gsd-t";
}

function inspect(projectDir, pkgRoot, tools) {
  const binDir = path.join(projectDir, "bin");
  const missing = [];
  const stale = [];
  let present = 0;

  for (const tool of tools) {
    const src = path.join(pkgRoot, "bin", tool);
    const dest = path.join(binDir, tool);
    if (!fs.existsSync(src)) {
      // The package itself is missing a tool it promises. That is an installer
      // defect, not a project one — recorded separately, never skipped quietly.
      missing.push({ tool, reason: "absent from the installed package" });
      continue;
    }
    if (!fs.existsSync(dest)) {
      missing.push({ tool, reason: "absent from the project" });
      continue;
    }
    try {
      if (fs.readFileSync(src, "utf8") !== fs.readFileSync(dest, "utf8")) {
        stale.push({ tool, reason: "differs from the installed package" });
      } else {
        present++;
      }
    } catch (e) {
      missing.push({ tool, reason: `could not be compared: ${e.message}` });
    }
  }
  return { missing, stale, present };
}

/** Copy one tool from the package into the project. Throws if it cannot. */
function repairOne(projectDir, pkgRoot, tool) {
  const src = path.join(pkgRoot, "bin", tool);
  const dest = path.join(projectDir, "bin", tool);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  try { fs.chmodSync(dest, 0o755); } catch (_) { /* permissions are advisory here */ }
  if (!fs.existsSync(dest)) throw new Error(`copy reported success but ${dest} is not there`);
}

/** Append a record of what was repaired, so a cross-project pattern is visible. */
function recordRepair(entry) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
    return true;
  } catch (e) {
    // The log could not be written. Say so out loud — a repair nobody can see
    // is how this problem stayed invisible for weeks in the first place.
    process.stderr.write(`[gsd-t] could not record the repair in ${LOG_PATH}: ${e.message}\n`);
    return false;
  }
}

/** Read the shared log and summarise which tools keep going missing. */
function readLog() {
  if (!fs.existsSync(LOG_PATH)) return { entries: [], byTool: {}, byProject: {} };
  const entries = [];
  for (const line of fs.readFileSync(LOG_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch (_) { /* one bad line does not hide the rest */ }
  }
  const byTool = {};
  const byProject = {};
  for (const e of entries) {
    for (const t of e.repaired || []) byTool[t] = (byTool[t] || 0) + 1;
    byProject[e.project] = (byProject[e.project] || 0) + 1;
  }
  return { entries, byTool, byProject };
}

/**
 * Which tools have gone missing in MORE THAN ONE project? That points at the
 * installer, not at any single project.
 */
function installerSuspects(byTool, entries) {
  const projectsPerTool = {};
  for (const e of entries) {
    for (const t of e.repaired || []) {
      (projectsPerTool[t] = projectsPerTool[t] || new Set()).add(e.project);
    }
  }
  return Object.entries(projectsPerTool)
    .filter(([, set]) => set.size > 1)
    .map(([tool, set]) => ({ tool, projects: [...set] }))
    .sort((a, b) => b.projects.length - a.projects.length);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") args.checkOnly = true;
    else if (a === "--report") args.report = true;
    else if (a === "--json") args.json = true;
    else if (a === "--project") args.project = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);

  if (args.report) {
    const { entries, byTool, byProject } = readLog();
    const suspects = installerSuspects(byTool, entries);
    const out = { ok: true, exitCode: EXIT_OK, repairs: entries.length, byTool, byProject, installerSuspects: suspects };
    if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    else if (!entries.length) process.stdout.write("No installs have needed repair.\n");
    else {
      process.stdout.write(`${entries.length} repair(s) recorded.\n\n`);
      for (const [p, n] of Object.entries(byProject)) process.stdout.write(`  ${p}: ${n}\n`);
      if (suspects.length) {
        process.stdout.write("\nThese tools went missing in more than one project — the installer is the likely cause:\n");
        for (const s of suspects) process.stdout.write(`  ${s.tool} (${s.projects.length} projects)\n`);
      }
    }
    process.exit(EXIT_OK);
  }

  const projectDir = path.resolve(args.project || process.cwd());
  if (!fs.existsSync(path.join(projectDir, ".gsd-t"))) {
    // Not a GSD-T project. Nothing to check — this is "not applicable", which
    // is a different thing from "checked and fine".
    process.exit(EXIT_OK);
  }

  // In a project, bin/ holds COPIES of the package's tools, so restoring one
  // from the package is a repair. In GSD-T's own repo those same files are the
  // SOURCE, and "repairing" them overwrites work in progress with the last
  // published build. That happened: on 2026-08-09 a test run triggered a repair
  // here and silently reverted two edited files mid-session, with the change
  // discoverable only by reading the diff before committing.
  if (isOwnSourceRepo(projectDir)) {
    const msg =
      `${projectDir} is the GSD-T source repo — bin/ here is the source, not a ` +
      `copy of it. Repairing would overwrite your work with the published build.`;
    if (args.json) {
      process.stdout.write(JSON.stringify({ ok: true, exitCode: EXIT_OK, skipped: msg }, null, 2) + "\n");
    } else {
      process.stderr.write(`[gsd-t] ${msg}\n`);
    }
    process.exit(EXIT_OK);
  }

  let pkgRoot;
  try {
    pkgRoot = findPackageRoot();
  } catch (e) {
    if (args.json) process.stdout.write(JSON.stringify({ ok: false, exitCode: EXIT_UNREPAIRABLE, halt: e.message }, null, 2) + "\n");
    else process.stderr.write(`[gsd-t] ${e.message}\n`);
    process.exit(EXIT_UNREPAIRABLE);
  }

  let tools;
  try {
    tools = expectedTools(pkgRoot);
  } catch (e) {
    const msg = `Cannot read the list of tools a project should have: ${e.message}`;
    if (args.json) process.stdout.write(JSON.stringify({ ok: false, exitCode: EXIT_UNREPAIRABLE, halt: msg }, null, 2) + "\n");
    else process.stderr.write(`[gsd-t] ${msg}\n`);
    process.exit(EXIT_UNREPAIRABLE);
  }

  const found = inspect(projectDir, pkgRoot, tools);
  const needsWork = [...found.missing, ...found.stale];

  if (!needsWork.length) {
    const out = { ok: true, exitCode: EXIT_OK, expected: tools.length, present: found.present, repaired: [] };
    if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    process.exit(EXIT_OK);
  }

  if (args.checkOnly) {
    const out = {
      ok: false, exitCode: EXIT_UNREPAIRABLE, expected: tools.length,
      present: found.present, missing: found.missing, stale: found.stale,
    };
    if (args.json) process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    else process.stdout.write(`${needsWork.length} of ${tools.length} tools need attention in ${projectDir}\n`);
    process.exit(EXIT_UNREPAIRABLE);
  }

  // Repair.
  const repaired = [];
  const unrepairable = [];
  for (const item of needsWork) {
    if (item.reason === "absent from the installed package") {
      unrepairable.push(item);
      continue;
    }
    try {
      repairOne(projectDir, pkgRoot, item.tool);
      repaired.push(item.tool);
    } catch (e) {
      unrepairable.push({ tool: item.tool, reason: e.message });
    }
  }

  const projectName = path.basename(projectDir);
  if (repaired.length) {
    recordRepair({
      at: new Date().toISOString(),
      project: projectName,
      projectDir,
      packageVersion: packageVersion(pkgRoot),
      expected: tools.length,
      wasPresent: found.present,
      repaired,
      unrepairable: unrepairable.map((u) => u.tool),
    });
  }

  const out = {
    ok: unrepairable.length === 0,
    exitCode: unrepairable.length === 0 ? EXIT_OK : EXIT_UNREPAIRABLE,
    project: projectName,
    expected: tools.length,
    repaired,
    unrepairable,
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } else {
    if (repaired.length) {
      process.stdout.write(`[gsd-t] Repaired this project's install: restored ${repaired.length} missing tool(s).\n`);
    }
    if (unrepairable.length) {
      process.stdout.write(`[gsd-t] ${unrepairable.length} tool(s) could NOT be restored:\n`);
      for (const u of unrepairable) process.stdout.write(`   ${u.tool} — ${u.reason}\n`);
      process.stdout.write(`Work should not continue on a broken install. Reinstall GSD-T.\n`);
    }
  }
  process.exit(out.exitCode);
}

if (require.main === module) main();

module.exports = { inspect, expectedTools, findPackageRoot, readLog, installerSuspects, isOwnSourceRepo, LOG_PATH };
