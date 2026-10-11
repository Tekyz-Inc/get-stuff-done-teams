#!/usr/bin/env node

/**
 * GSD-T CLI Installer
 *
 * Usage:
 *   npx @tekyzinc/gsd-t install     — Install commands + global CLAUDE.md
 *   npx @tekyzinc/gsd-t update      — Update commands + global CLAUDE.md (preserves customizations)
 *   npx @tekyzinc/gsd-t update-all  — Update globally + all registered project CLAUDE.md files
 *   npx @tekyzinc/gsd-t init [name] — Initialize a new project with GSD-T structure (auto-registers)
 *   npx @tekyzinc/gsd-t register    — Register current directory as a GSD-T project
 *   npx @tekyzinc/gsd-t status      — Show what's installed and check for updates
 *   npx @tekyzinc/gsd-t uninstall   — Remove GSD-T commands (leaves project files alone)
 *   npx @tekyzinc/gsd-t doctor      — Diagnose common issues
 *   npx @tekyzinc/gsd-t changelog   — Open changelog in the browser
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync, spawn: cpSpawn } = require("child_process");

// ─── Configuration ───────────────────────────────────────────────────────────

// ~/.claude may itself be a link (the user keeps it elsewhere). It is resolved
// ONCE to its real folder, and that folder is the root every symlink check is
// measured from: links BELOW it halt, the root's own location never does.
const CLAUDE_DIR = resolveClaudeRoot(path.join(os.homedir(), ".claude"));
function resolveClaudeRoot(p) {
  if (!fs.lstatSync(p, { throwIfNoEntry: false })) return p; // fresh machine: created on install
  return fs.realpathSync(p); // throws on a dangling link — nothing can be installed through it
}
const COMMANDS_DIR = path.join(CLAUDE_DIR, "commands");
const SCRIPTS_DIR = path.join(CLAUDE_DIR, "scripts");
const GLOBAL_BIN_DIR = path.join(CLAUDE_DIR, "bin");
const CLAUDE_TEMPLATES_DIR = path.join(CLAUDE_DIR, "templates");
const GLOBAL_CLAUDE_MD = path.join(CLAUDE_DIR, "CLAUDE.md");
const SETTINGS_JSON = path.join(CLAUDE_DIR, "settings.json");
const VERSION_FILE = path.join(CLAUDE_DIR, ".gsd-t-version");
const PROJECTS_FILE = path.join(CLAUDE_DIR, ".gsd-t-projects");
const UPDATE_CHECK_FILE = path.join(CLAUDE_DIR, ".gsd-t-update-check");

// Where our package files live (relative to this script)
const PKG_ROOT = path.resolve(__dirname, "..");
const PKG_COMMANDS = path.join(PKG_ROOT, "commands");
const PKG_SCRIPTS = path.join(PKG_ROOT, "scripts");
const PKG_TEMPLATES = path.join(PKG_ROOT, "templates");

// Read our version from package.json
const PKG_VERSION = require(path.join(PKG_ROOT, "package.json")).version;
const CHANGELOG_URL = "https://github.com/Tekyz-Inc/get-stuff-done-teams/blob/main/CHANGELOG.md";

// Destructive Action Guard — injected into project CLAUDE.md files by doUpdateAll
const GUARD_SECTION = [
  "",
  "",
  "# Destructive Action Guard (MANDATORY)",
  "",
  "**NEVER perform destructive or structural changes without explicit user approval.** This applies at ALL autonomy levels.",
  "",
  "Before any of these actions, STOP and ask the user:",
  "- DROP TABLE, DROP COLUMN, DROP INDEX, TRUNCATE, DELETE without WHERE",
  "- Renaming or removing database tables or columns",
  "- Schema migrations that lose data or break existing queries",
  "- Replacing an existing architecture pattern (e.g., normalized → denormalized)",
  "- Removing or replacing existing files/modules that contain working functionality",
  "- Changing ORM models in ways that conflict with the existing database schema",
  "- Removing API endpoints or changing response shapes that existing clients depend on",
  "- Any change that would require other parts of the system to be rewritten",
  "",
  '**Rule: "Adapt new code to existing structures, not the other way around."**',
  "",
].join("\n");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function log(msg) {
  console.log(msg);
}
function success(msg) {
  console.log(`${GREEN}  ✓${RESET} ${msg}`);
}
function warn(msg) {
  console.log(`${YELLOW}  ⚠${RESET} ${msg}`);
}
function error(msg) {
  console.log(`${RED}  ✗${RESET} ${msg}`);
}
function info(msg) {
  console.log(`${CYAN}  ℹ${RESET} ${msg}`);
}
function heading(msg) {
  console.log(`\n${BOLD}${msg}${RESET}`);
}
function link(text, url) {
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}
function versionLink(ver) {
  return link(`v${ver || PKG_VERSION}`, CHANGELOG_URL);
}

// Create `dir` if missing. Throws (never warns and continues) when a link sits
// on the path between `root` and `dir` — a write through it lands somewhere else.
// Without `root` every ancestor is checked.
function ensureDir(dir, root) {
  if (root) haltOnSymlinks(root, [path.relative(root, dir)]);
  else if (hasSymlinkInPath(dir) || isSymlink(dir)) {
    throw new Error(`Refusing to use path with symlinked component: ${dir} — replace the link with a real directory and re-run.`);
  }
  if (fs.existsSync(dir)) return false;
  fs.mkdirSync(dir, { recursive: true });
  return true;
}

function isSymlink(filePath) {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return false; // File doesn't exist yet — safe to write
  }
}

function hasSymlinkInPath(targetPath) {
  const resolved = path.resolve(targetPath);
  let current = path.dirname(resolved);
  const root = path.parse(resolved).root;
  while (current !== root) {
    if (isSymlink(current)) return true;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}

function validateProjectName(name) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._\- ]{0,100}$/.test(name);
}

function applyTokens(content, projectName, date) {
  return content.replace(/\{Project Name\}/g, projectName).replace(/\{Date\}/g, date);
}

function normalizeEol(str) {
  return str.replace(/\r\n/g, "\n");
}

function validateVersion(ver) {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(ver);
}

function validateProjectPath(p) {
  try {
    if (!path.isAbsolute(p) || !fs.existsSync(p)) return false;
    const stat = fs.statSync(p);
    if (!stat.isDirectory()) return false;
    // On Unix, verify directory is owned by current user (defense-in-depth)
    if (typeof process.getuid === "function" && stat.uid !== process.getuid()) return false;
    return true;
  } catch {
    return false;
  }
}

// Throws on any failure: a copy that did not land must stop the install, so the
// version file is not advanced and the next run retries.
function copyFile(src, dest, label) {
  const name = label ? label : path.basename(dest);
  if (isSymlink(dest)) throw new Error(`Refusing to copy over a symlink: ${dest}`);
  try {
    fs.copyFileSync(src, dest);
  } catch (e) {
    throw new Error(`Failed to copy ${name}: ${e.message}`);
  }
  success(name);
}

// ─── Symlink halt ────────────────────────────────────────────────────────────
// GSD-T never writes, copies, moves or deletes through a link: a link inside
// ~/.claude or a project can carry any of those to a file somewhere else.
// `rels` are paths under `root`; each path AND every directory between it and
// `root` is checked (root itself may be a link — that is where the user keeps
// it). Throws before anything is changed.
function haltOnSymlinks(root, rels) {
  const hits = new Set();
  for (const rel of rels) {
    let p = root;
    for (const part of rel.split(/[/\\]/).filter(Boolean)) {
      p = path.join(p, part);
      if (isSymlink(p)) { hits.add(p); break; }
    }
  }
  if (hits.size === 0) return;
  throw new Error(
    `HALT: ${[...hits].join(", ")} ${hits.size > 1 ? "are symlinks" : "is a symlink"} — GSD-T will not write, move or delete through a link.\n` +
    `  Fix: replace each link with a real file or directory (cp -RL <link> <link>.tmp && rm <link> && mv <link>.tmp <link>), then re-run. Nothing was changed.`
  );
}

// ─── Retirement: MOVE, NEVER DELETE ─────────────────────────────────────────
// Two red-team rounds on a delete-based cleanup did not converge — each fix to
// "what counts as ours" opened another way to destroy a user's file. A move
// makes any misclassification recoverable, so a retired file is moved into a
// dated backup folder (relative path and permissions kept), never deleted.
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Does this file carry a header GSD-T shipped? The command header ("# GSD-T: ")
// must be the file's FIRST line; every other sentinel is a verbatim comment
// line that may sit anywhere in the first 1,200 characters.
function carriesShippedHeader(abs, sentinels) {
  const text = fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, "");
  const head = text.slice(0, 1200);
  return sentinels.some((s) => (s === COMMAND_HEADER ? text.startsWith(s) : head.includes(s)));
}

// Will retireShippedFile move root/rel? (Same test, no change made.)
function willRetire(root, rel, sentinels) {
  const abs = path.join(root, rel);
  const st = fs.lstatSync(abs, { throwIfNoEntry: false });
  return !!st && st.isFile() && carriesShippedHeader(abs, sentinels);
}

// Move root/rel to root/backupRel/rel when it carries a header GSD-T shipped
// (carriesShippedHeader). Returns "moved" | "absent" | "kept". An existing
// backup (file or link) is never overwritten: name.1.ext, name.2.ext, …
// Throws on any failure, after removing any backup folder it just created.
function retireShippedFile(root, rel, sentinels, backupRel) {
  const abs = path.join(root, rel);
  const st = fs.lstatSync(abs, { throwIfNoEntry: false });
  if (!st) return "absent";
  if (!st.isFile()) return "kept";
  let created;
  let dest = path.join(root, backupRel, rel);
  try {
    if (!carriesShippedHeader(abs, sentinels)) return "kept";
    const ext = path.extname(dest);
    const stem = dest.slice(0, dest.length - ext.length);
    for (let n = 1; fs.lstatSync(dest, { throwIfNoEntry: false }); n++) dest = `${stem}.${n}${ext}`;
    created = fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(abs, dest);
  } catch (e) {
    if (created) removeCreatedDirs(path.dirname(dest), created);
    const hint = e.code === "EXDEV"
      ? `\n  Fix: ${abs} is on a different disk than the backup folder ${path.join(root, backupRel)}, so it cannot be moved there. ` +
        `Move it out of ${root} yourself (mv "${abs}" <a folder you keep>), then re-run. Files already moved this run are in the backup folder.`
      : "";
    throw new Error(`could not move retired ${abs} to the backup folder: ${e.message}${hint}`);
  }
  return "moved";
}

// Remove the empty folders mkdirSync({recursive}) just made: from `dir` up to
// and including `created` (the first folder it created).
function removeCreatedDirs(dir, created) {
  for (let d = dir; d.length >= created.length; d = path.dirname(d)) {
    removeEmptyDir(d);
    if (d === created) break;
  }
}

// Remove a directory GSD-T created once a move has emptied it.
function removeEmptyDir(abs) {
  const st = fs.lstatSync(abs, { throwIfNoEntry: false });
  if (st && st.isDirectory() && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
}

// M50 D1: hasPlaywright migrated to bin/playwright-bootstrap.cjs.
// Re-exported here for back-compat with any caller still requiring it via
// bin/gsd-t.js. See .gsd-t/contracts/playwright-bootstrap-contract.md §3.
const {
  hasPlaywright,
  installPlaywright,
  detectPackageManager: _detectPlaywrightPackageManager,
} = require("./playwright-bootstrap.cjs");
const { hasUI } = require("./ui-detection.cjs");

function readProjectDeps(projectDir) {
  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) return [];
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
  } catch { return []; }
}

function readPyContent(projectDir, filename) {
  const fp = path.join(projectDir, filename);
  if (!fs.existsSync(fp)) return "";
  try { return fs.readFileSync(fp, "utf8"); } catch { return ""; }
}

function hasSwagger(projectDir) {
  const specFiles = ["swagger.json", "swagger.yaml", "swagger.yml", "openapi.json", "openapi.yaml", "openapi.yml"];
  if (specFiles.some((f) => fs.existsSync(path.join(projectDir, f)))) return true;

  const swaggerPkgs = ["swagger-jsdoc", "swagger-ui-express", "@fastify/swagger", "@nestjs/swagger", "swagger-ui", "express-openapi-validator"];
  if (swaggerPkgs.some((p) => readProjectDeps(projectDir).includes(p))) return true;

  for (const f of ["requirements.txt", "pyproject.toml"]) {
    if (readPyContent(projectDir, f).includes("fastapi")) return true;
  }
  return false;
}

function hasApi(projectDir) {
  const apiFrameworks = ["express", "fastify", "hono", "koa", "hapi", "@nestjs/core", "next"];
  if (apiFrameworks.some((p) => readProjectDeps(projectDir).includes(p))) return true;

  for (const f of ["requirements.txt", "pyproject.toml"]) {
    const content = readPyContent(projectDir, f);
    if (content.includes("fastapi") || content.includes("flask") || content.includes("django")) return true;
  }
  return false;
}

function getInstalledVersion() {
  try {
    return fs.readFileSync(VERSION_FILE, "utf8").trim();
  } catch {
    return null;
  }
}

function saveInstalledVersion() {
  // Throws: a version recorded without a finished install would stop the next
  // run from retrying it.
  if (isSymlink(VERSION_FILE)) throw new Error(`Refusing to write the version file through a symlink: ${VERSION_FILE}`);
  fs.writeFileSync(VERSION_FILE, PKG_VERSION);
}

function getRegisteredProjects() {
  try {
    const content = fs.readFileSync(PROJECTS_FILE, "utf8").trim();
    if (!content) return [];
    const lines = content.split("\n").map((l) => l.trim().split("|")[0].trim()).filter((l) => l && !l.startsWith("#"));
    return lines.filter((p) => {
      if (!validateProjectPath(p)) {
        warn(`Skipping invalid project path: ${p}`);
        return false;
      }
      return true;
    });
  } catch {
    return [];
  }
}

function registerProject(projectDir) {
  const resolved = path.resolve(projectDir);
  const projects = getRegisteredProjects();
  if (projects.includes(resolved)) return false;
  if (isSymlink(PROJECTS_FILE)) {
    warn("Skipping project registration — target is a symlink");
    return false;
  }
  try {
    projects.push(resolved);
    fs.writeFileSync(PROJECTS_FILE, projects.join("\n") + "\n");
    return true;
  } catch (e) {
    error(`Failed to register project: ${e.message}`);
    return false;
  }
}

function getCommandFiles() {
  // All .md files in our commands/ directory (gsd-t-* plus utilities like branch, checkin, Claude-md)
  return fs
    .readdirSync(PKG_COMMANDS)
    .filter((f) => f.endsWith(".md"));
}

function getGsdtCommands() {
  return getCommandFiles().filter((f) => f.startsWith("gsd-t-"));
}

function getUtilityCommands() {
  return getCommandFiles().filter((f) => !f.startsWith("gsd-t-"));
}

function getInstalledCommands() {
  try {
    const ourCommands = getCommandFiles();
    return fs
      .readdirSync(COMMANDS_DIR)
      .filter((f) => ourCommands.includes(f));
  } catch {
    return [];
  }
}

// M97 — graph-intercept PostToolUse hook on Grep. Runs from the global package;
// the script itself fails-open (no-op) in non-GSD-T projects / projects without a
// graph, so it is safe to register globally with a Grep matcher.
const GRAPH_INTERCEPT_HOOK_MARKER = "gsd-t-graph-intercept";
const GRAPH_INTERCEPT_HOOK_COMMAND =
  'bash -c \'[ -f "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-graph-intercept.js" ] && node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-graph-intercept.js" || true\'';

// M98 — read-intercept PostToolUse hook on Read. Same global-safe pattern as the
// M97 grep-intercept: the script fails-open (no-op) in non-GSD-T projects / projects
// without a graph / non-code reads, so it is safe to register globally with a Read matcher.
const READ_INTERCEPT_HOOK_MARKER = "gsd-t-read-intercept";
const READ_INTERCEPT_HOOK_COMMAND =
  'bash -c \'[ -f "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-read-intercept.js" ] && node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-read-intercept.js" || true\'';

// ─── M106 Fallback guard (PreToolUse Write|Edit) ────────────────────────────
// Denies a write that introduces a fallback the user never approved. NO `|| true`
// here, unlike the worktree guard: if this script is missing, the shell must fail
// loudly rather than let unchecked writes through. Swallowing its absence is the
// exact pattern the guard exists to stop.
const FALLBACK_HOOK_MARKER = "gsd-t-fallback-guard";
const FALLBACK_HOOK_COMMAND =
  'node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-fallback-guard.js"';

// ─── M117 Graph search guard (PreToolUse Bash|Grep) ─────────────────────────
// Blocks a search that asks a structural question about code, and names the
// graph command that answers it. NO `|| true`, for the same reason as the
// fallback guard: a missing script must fail loudly, not silently re-open the
// hole. The hole it closes is specific — the Grep-tool and Read-tool hooks
// never fired, because bypass mode routes every search through Bash.
const GRAPH_SEARCH_HOOK_MARKER = "gsd-t-graph-search-guard";
const GRAPH_SEARCH_HOOK_COMMAND =
  'node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-graph-search-guard.js"';

// ─── M117 Graph use report (Stop) ───────────────────────────────────────────
// Reports a turn that hit structural questions and never asked the graph. It
// reports rather than blocks: a Stop hook fires after the work is done, so
// blocking there punishes rather than redirects. Prevention is the guard above.
const GRAPH_USE_REPORT_MARKER = "gsd-t-graph-use-report";
const GRAPH_USE_REPORT_COMMAND =
  'bash -c \'[ -f "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-graph-use-report.js" ] && node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-graph-use-report.js" || true\'';

// ─── M108 Install self-heal (SessionStart) ──────────────────────────────────
// Checks the project's tools before any work starts, restores what is missing,
// and reports what it could not fix. Not a fallback — it repairs the failure
// and then the session runs correctly, rather than routing around it.

const INSTALL_HEAL_MARKER = "gsd-t-install-heal";
const INSTALL_HEAL_COMMAND =
  'bash -c \'[ -f "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-install-heal.js" ] && node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-install-heal.js" || true\'';

// M97 — register the graph-intercept PostToolUse hook (matcher "Grep").
// Idempotent: find-by-marker, refresh stale command, else add. Mirrors the
// context-meter installer. The script fails-open so this is safe globally.
// ─── Date guard + CLAUDE.md changelog hooks ─────────────────────────────────
// Registered the same way as the fallback guard: run from the global package,
// no `|| true`, so a missing script fails loudly instead of silently turning
// the guard off. Before v6 nothing in the installer copied or registered these
// three — they ran only on machines where they had been wired by hand.
const DATE_GUARD_MARKER = "gsd-t-date-guard";
const DATE_GUARD_COMMAND =
  'node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-date-guard.js"';
const CHANGELOG_CHECK_MARKER = "gsd-t-changelog-check";
const CHANGELOG_CHECK_COMMAND =
  'node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-changelog-check.js"';
const CHANGELOG_POST_EDIT_MARKER = "gsd-t-changelog-post-edit";
const CHANGELOG_POST_EDIT_COMMAND =
  'node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-changelog-post-edit.js"';

// Every hook GSD-T registers today. Uninstall removes exactly these.
const GSDT_HOOK_MARKERS = [
  GRAPH_INTERCEPT_HOOK_MARKER, READ_INTERCEPT_HOOK_MARKER, FALLBACK_HOOK_MARKER,
  GRAPH_SEARCH_HOOK_MARKER, GRAPH_USE_REPORT_MARKER, INSTALL_HEAL_MARKER,
  DATE_GUARD_MARKER, CHANGELOG_CHECK_MARKER, CHANGELOG_POST_EDIT_MARKER,
  "gsd-t-update-check", "gsd-t-auto-route",
];

// ─── v6 slim-down: what GSD-T installed before and no longer ships ───────────
// ONE list drives every retirement on install / update / update-all. A file is
// MOVED to a dated backup folder (never deleted) only when its first 1,200
// characters contain one of the VERBATIM header lines GSD-T shipped it with
// (checked against every version in git history). A user's own same-named file
// has no such header and is left alone. Nothing here is globbed.
// Every gsd-t-*.md command GSD-T ever shipped opens with this line.
const COMMAND_HEADER = "# GSD-T: ";

const RETIRED_V6 = {
  // ~/.claude/commands — non-prefixed commands, matched by shipped header.
  commands: {
    "gsd.md": ["You are the GSD-T smart router"],
    "gsd-t.md": ["You are the GSD-T smart router"], // the router's name before v2.16.4
  },
  // ~/.claude/commands — every gsd-t-*.md GSD-T has EVER shipped (git history
  // of archive/v5). retireV6Files() moves one only when its name is on this
  // list, the package no longer ships it, AND it carries COMMAND_HEADER (every
  // one of the 932 shipped versions opens with it). A user's own gsd-t-*.md —
  // any other name, or a listed name without the header — is never touched.
  commandNames: [
    "gsd-t-architect.md", "gsd-t-audit.md", "gsd-t-backlog-add.md", "gsd-t-backlog-edit.md",
    "gsd-t-backlog-list.md", "gsd-t-backlog-move.md", "gsd-t-backlog-promote.md",
    "gsd-t-backlog-remove.md", "gsd-t-backlog-settings.md", "gsd-t-brainstorm.md",
    "gsd-t-complete-milestone.md", "gsd-t-debug.md", "gsd-t-demo-videos.md",
    "gsd-t-design-audit.md", "gsd-t-design-build.md", "gsd-t-design-decompose.md",
    "gsd-t-design-review.md", "gsd-t-discuss.md", "gsd-t-doc-ripple.md",
    "gsd-t-estimate-rescale.md", "gsd-t-estimate.md", "gsd-t-execute.md", "gsd-t-feature.md",
    "gsd-t-gap-analysis.md", "gsd-t-health.md", "gsd-t-help.md", "gsd-t-impact.md",
    "gsd-t-init-scan-setup.md", "gsd-t-init.md", "gsd-t-integrate.md", "gsd-t-log.md",
    "gsd-t-metrics.md", "gsd-t-migrate-logging.md", "gsd-t-milestone.md",
    "gsd-t-optimization-apply.md", "gsd-t-optimization-reject.md", "gsd-t-partition.md",
    "gsd-t-pause.md", "gsd-t-plan.md", "gsd-t-populate.md", "gsd-t-prd.md", "gsd-t-project.md",
    "gsd-t-promote-debt.md", "gsd-t-prompt.md", "gsd-t-qa.md", "gsd-t-quick.md",
    "gsd-t-reflect.md", "gsd-t-resume.md", "gsd-t-scan.md", "gsd-t-setup.md", "gsd-t-status.md",
    "gsd-t-stories.md", "gsd-t-test-plan.md", "gsd-t-test-sync.md", "gsd-t-triage-and-merge.md",
    "gsd-t-unattended-stop.md", "gsd-t-unattended-watch.md", "gsd-t-unattended.md",
    "gsd-t-verify.md", "gsd-t-version-update-all.md", "gsd-t-version-update.md",
    "gsd-t-visualize.md", "gsd-t-wave.md",
  ],
  // ~/.claude/templates — the design templates v5's installSharedTemplates()
  // copied there. Headers verified stable across every version in history.
  templates: {
    "design-chart-taxonomy.md": ["# Design Chart & Atom Taxonomy (Closed Set)"],
    "element-contract.md": ["Atomic visual unit. One contract per visual variant"],
    "widget-contract.md": ["Composition of elements + data binding + layout. Widgets SELECT and POSITION elements"],
    "page-contract.md": ["Top-level assembly of widgets + global layout + routing + data loading."],
    "design-contract.md": ["# Design Contract: {Component/Page Name}"],
    "shared-services-contract.md": ["**Milestone**: {Milestone Name}"],
  },
  // Project bin/ (stray sweep in copyBinToolsToProject) AND ~/.claude/bin.
  bin: {
    "archive-progress.cjs": ["node bin/archive-progress.js --per-archive 20     # override \"entries per archive\" (default 20)"],
    "cli-preflight-checks/branch-guard.cjs": ["branch-guard — verify current git branch matches CLAUDE.md \"Expected branch\" rule."],
    "cli-preflight-checks/contracts-stable.cjs": ["contracts are expected pre-execute. After execute starts, they should all be STABLE."],
    "cli-preflight-checks/deps-installed.cjs": ["- No `package.json` at all → ok:true (non-Node project; nothing to check)"],
    "cli-preflight-checks/manifest-fresh.cjs": ["Severity: info. Never blocks (top-level `ok` only flips on error-severity)."],
    "cli-preflight-checks/ports-free.cjs": ["For each port, runs `lsof -nP -iTCP:<port> -sTCP:LISTEN`. Exit 0 + non-empty"],
    "cli-preflight-checks/working-tree-state.cjs": ["Reads `dirtyTreeWhitelist: string[]` from `.gsd-t/.unattended/config.json`."],
    "cli-preflight.cjs": ["Pure inspector — no LLM spawn, no token spend, no side effects beyond reading"],
    "gsd-t-architectural-trigger.cjs": ["answer n-gram fingerprints). When divergence exceeds DIVERGENCE_THRESHOLD, fires"],
    "gsd-t-archive-domains.cjs": ["Containment guard ([[feedback_destructive_path_ops_containment]]): every removed path MUST resolve"],
    "gsd-t-boundary-normalize-check.cjs": ["gsd-t-boundary-normalize-check — a value entering the program must be cleaned"],
    "gsd-t-build-coverage.cjs": ["GSD-T build-coverage (M57 D1)"],
    "gsd-t-ci-parity.cjs": ["Auto-detects CI config via locked detection precedence (user decision — do"],
    "gsd-t-competition-judge.cjs": ["candidate). Contract: .gsd-t/contracts/competition-mode-contract.md v1.0.0."],
    "gsd-t-concise-rewrite.cjs": ["[RULE] concise-rewrite-never-changes-a-fact"],
    "gsd-t-context-brief.cjs": ["Pure inspector — no LLM spawn, no token spend, no side effects beyond reading"],
    "gsd-t-divergence-grammar.cjs": ["⚠ Divergence: <RULE-ID or section> — supersedes shipped <what>. Reason: <user intention>."],
    "gsd-t-env-registry-check.cjs": ["A project that has neither the table nor the rule is a NO-OP PASS (it simply"],
    "gsd-t-file-disjointness.cjs": ["- unprovable — tasks with no touch-list source (routed sequential; safe-default)"],
    "gsd-t-graph-use-gate.cjs": ["`gsd-t-graph-anti-grep-lint.cjs` is STATIC. It reads source files and looks"],
    "gsd-t-guard-map-derive.cjs": ["(the gate iterates the DOC's id set; an absent key is treated as unbacked, but"],
    "gsd-t-guard-map.cjs": ["<invariant prose> ... [RULE — <tag>] # tagged, invariant LEFT (Extension style)"],
    "gsd-t-jargon-lint.cjs": ["- /\\bM\\d+(-D\\d+(-T\\d+)?)?\\b/   GSD-T milestone/domain/task code (M93, M93-D3, M93-D3-T1)"],
    "gsd-t-logging-envelope-check.cjs": ["- STRUCTURAL ONLY: parse shape as shape, never text.includes(category/action)."],
    "gsd-t-loop-ledger.cjs": ["House style §0: { ok:true, ... } | { ok:false, error }; zero external deps; sync APIs."],
    "gsd-t-milestone-state.cjs": ["emits an ASSERTABLE, greppable logged decision (`feedback_no_silent_degradation`)."],
    "gsd-t-model-profile.cjs": ["Contract: .gsd-t/contracts/model-profile-config-contract.md v1.0.0 STABLE"],
    "gsd-t-model-tier-policy.cjs": ["SINGLE source of truth for GSD-T model-tier policy"],
    "gsd-t-project-history.cjs": ["Three sources, cheapest first: git, the decision log, and what the user typed"],
    "gsd-t-research-gate.cjs": ["returns the house-style JSON envelope:"],
    "gsd-t-rule-consume.cjs": ["- `redTeam` → the Red Team attack-surface frame (each rule = an invariant to attack)"],
    "gsd-t-rule-mine.cjs": ["fast to read: David is confirming something he already said, not recalling it."],
    "gsd-t-schema-id-check.cjs": ["added in the working tree — i.e. tables this run is introducing. A repo with an"],
    "gsd-t-testplan-halt.cjs": ["Both are a HALT, never a fallback: on non-convergence this tool refuses to continue and"],
    "gsd-t-testplan-lint.cjs": ["A test plan (`TestPlan-[FeatureArea].md`) is what a reviewer approves BEFORE"],
    "gsd-t-testplan-rows.cjs": ["Three consumers read `TestPlan-*.md` (contract test-plan-first-contract.md §2):"],
    "gsd-t-traceability-gate.cjs": ["FAILS if that path is absent. This gate enforces that binding BEFORE execute."],
    "gsd-t-verify-gate-judge.cjs": ["Companion to bin/gsd-t-verify-gate.cjs. Takes a verify-gate envelope JSON"],
    "gsd-t-verify-gate.cjs": ["3. ok = (skipTrack1 || track1.ok) && (skipTrack2 || track2.ok). Purely deterministic."],
    "live-activity-report.cjs": ["GSD-T Live Activity Report (M54 D1 T1)"],
    "parallel-cli-tee.cjs": ["2. NDJSON line shape: {\"t\": isoTs, \"stream\": \"stdout\"|\"stderr\", \"data\": line}."],
    "parallel-cli.cjs": ["via `bin/parallel-cli-tee.cjs`. Lifecycle / per-worker timeout / fail-fast"],
    "parallelism-report.cjs": ["GSD-T Parallelism Report (M44 D9 T1)"],
  },
  // ~/.claude/scripts (paths relative to it).
  scripts: {
    "gsd-t-heartbeat.js": ["Writes structured events to .gsd-t/heartbeat-{session_id}.jsonl"],
    "gsd-t-in-session-probe.js": ["Captures the RAW Claude Code hook payload for Stop / SessionEnd / PostToolUse"],
    "gsd-t-tools.js": ["Returns compact JSON. Subcommands: state, validate, parse, list, git, template"],
    "gsd-t-statusline.js": ["Outputs compact project status for display in Claude Code's statusLine setting."],
    "gsd-t-event-writer.js": ["Writes structured events to .gsd-t/events/YYYY-MM-DD.jsonl (UTC date rotation)."],
    "gsd-t-architect-oversight-guard.js": ["GSD-T PreToolUse hook (Write|Edit) — Architect's Oversight trigger (M101)."],
    "gsd-t-brevity-guard.js": ["GSD-T Stop hook — blocks exhausting ANSWER-mode replies before the user reads them."],
    "gsd-t-dashboard-server.js": ["GSD-T Dashboard Server — Zero-dep SSE server for .gsd-t/events/*.jsonl"],
    "gsd-t-dashboard.html": ["<title>GSD-T Agent Dashboard</title>"],
    "gsd-t-transcript.html": ["<title>__PROJECT_NAME__</title>"],
    "gsd-t-watch-state.js": ["Records per-agent progress into `.gsd-t/.watch-state/{agent_id}.json` so"],
    "hooks/gsd-t-conversation-capture.js": ["data (not just tokens — that's the job of `gsd-t-in-session-usage-hook.js`)."],
    "hooks/gsd-t-in-session-usage-hook.js": ["stdin, resolves the project directory from `payload.cwd`, then delegates to"],
    "hooks/gsd-t-ctx-cue.sh": ["# gsd-t-ctx-cue.sh — GSD-T low-context visual cue (M85)"],
  },
  // ~/.claude itself. The status bar script (statusline-command.sh) is NOT
  // retired — installStatusLine() keeps it current.
  claudeDir: {},
  // settings.json hooks that run one of these GSD-T scripts are removed
  // (matched by the script's normalized location — see gsdtScriptRefs —
  // never a bare substring). Every marker has git history under scripts/; a
  // name GSD-T never shipped (e.g. gsd-t-board-notify) is not ours to remove.
  hookMarkers: [
    "gsd-t-auto-worktree",  // M105 replacement, cut in v6
    "gsd-t-worktree-guard", // M105, retired 2026-08-08 (blocked its own user's edits)
    "gsd-t-context-meter",  // M61 — script deleted; native /context replaced it
    "gsd-t-heartbeat", "gsd-t-in-session-probe", "gsd-t-ctx-cue",
    "gsd-t-conversation-capture", "gsd-t-in-session-usage-hook",
    "gsd-t-compact-detector", "gsd-t-calibration-hook", "gsd-t-dashboard-autostart",
    "gsd-t-architect-oversight-guard", "gsd-t-brevity-guard", "gsd-t-concise-hook",
  ],
};

function configureGraphInterceptHook(settingsPath) {
  return configureToolHook(settingsPath, "PostToolUse", GRAPH_INTERCEPT_HOOK_MARKER, GRAPH_INTERCEPT_HOOK_COMMAND, "graph-intercept", "Grep");
}

// M98 — register the read-intercept PostToolUse hook (matcher "Read").
// Idempotent: find-by-marker, refresh stale command, else add. Mirrors the
// M97 grep-intercept installer. The script fails-open so this is safe globally.
function configureReadInterceptHook(settingsPath) {
  return configureToolHook(settingsPath, "PostToolUse", READ_INTERCEPT_HOOK_MARKER, READ_INTERCEPT_HOOK_COMMAND, "read-intercept", "Read");
}

// M106 — register the fallback guard on Write|Edit. Same registrar again.
function configureFallbackGuardHook(settingsPath) {
  return configureWriteEditHook(settingsPath, FALLBACK_HOOK_MARKER, FALLBACK_HOOK_COMMAND, "fallback guard");
}

// M117 — register the graph search guard on Bash|Grep. Both doors: bypass mode
// routes searches through Bash, and leaving either open makes it the habit.
// v6 — the date guard (PreToolUse Write|Edit) and the two CLAUDE.md changelog
// hooks (SessionStart check, PostToolUse Write|Edit). Same registrar as the
// fallback guard: find by marker, refresh a stale command, else add.
function configureDateGuardHook(settingsPath) {
  return configureWriteEditHook(settingsPath, DATE_GUARD_MARKER, DATE_GUARD_COMMAND, "date guard");
}
function configureChangelogCheckHook(settingsPath) {
  return configureEventHook(settingsPath, "SessionStart", CHANGELOG_CHECK_MARKER, CHANGELOG_CHECK_COMMAND, "CLAUDE.md changelog check");
}
function configureChangelogPostEditHook(settingsPath) {
  return configureToolHook(settingsPath, "PostToolUse", CHANGELOG_POST_EDIT_MARKER, CHANGELOG_POST_EDIT_COMMAND, "CLAUDE.md changelog post-edit", "Write|Edit");
}

function configureGraphSearchGuardHook(settingsPath) {
  return configurePreToolUseHook(
    settingsPath, GRAPH_SEARCH_HOOK_MARKER, GRAPH_SEARCH_HOOK_COMMAND,
    "graph search guard", "Bash|Grep"
  );
}

// M117 — register the Stop-time graph use report.
function configureGraphUseReportHook(settingsPath) {
  return configureStopHook(
    settingsPath, GRAPH_USE_REPORT_MARKER, GRAPH_USE_REPORT_COMMAND, "graph use report"
  );
}

// M108 — register the install self-heal on SessionStart, so a broken install is
// repaired before any work begins.
function configureInstallHealHook(settingsPath) {
  return configureEventHook(settingsPath, "SessionStart", INSTALL_HEAL_MARKER, INSTALL_HEAL_COMMAND, "install self-heal");
}


// Register a Stop hook by marker. Mirrors configureWriteEditHook exactly, on the
// Stop event instead of PreToolUse.
function configureStopHook(settingsPath, marker, command, label) {
  return configureEventHook(settingsPath, "Stop", marker, command, label);
}

// Register a hook on any event by marker. One registrar for every event, so a
// new hook needs no new copy of this logic. A SessionStart hook must fire on
// every session, so its matcher is normalized to "" (a "startup" matcher skips
// resumed and cleared sessions).
function configureEventHook(settingsPath, event, marker, command, label) {
  return upsertGsdtHook(settingsPath, event, marker, command, label, event === "SessionStart" ? "" : undefined);
}

function configureWriteEditHook(settingsPath, marker, command, label) {
  return configurePreToolUseHook(settingsPath, marker, command, label, "Write|Edit");
}

// M117 — the same registrar, with the matcher named rather than assumed. The
// graph search guard watches Bash|Grep, not Write|Edit, and a second copy of
// this function is where the two would drift apart.
function configurePreToolUseHook(settingsPath, marker, command, label, matcher) {
  return configureToolHook(settingsPath, "PreToolUse", marker, command, label, matcher);
}

// The matcher-carrying registrar, for any tool event (PreToolUse / PostToolUse).
function configureToolHook(settingsPath, event, marker, command, label, matcher) {
  return upsertGsdtHook(settingsPath, event, marker, command, label, matcher);
}

// ─── Which GSD-T scripts does a command run? ───────────────────────────────
// settings.json names a GSD-T script in many spellings: quoted or not, through
// ~, $HOME, ${HOME}, "$HOME"/…, the absolute home path, ~/.claude's real path
// (when it is a link), or the `$(npm root -g)/@tekyzinc/gsd-t/scripts/`
// wrapper. normalizeHookCommand rewrites every spelling to ONE form —
// <HOME>/.claude/… or <PKG>/… — and gsdtScriptRefs reads the GSD-T script paths
// out of that. A user hook running a same-named script from its own folder
// normalizes to neither form, so it is never taken for ours.
function normalizeHookCommand(cmd) {
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const slash = (x) => x.replace(/\\/g, "/");
  const lead = "(?<![\\w.~/$-])"; // a path starts here, not mid-word
  let s = slash(String(cmd)).replace(/["']/g, "").replace(/\/{2,}/g, "/");
  s = s.replace(/\$\(\s*npm\s+root\s+-g\s*\)\/@tekyzinc\/gsd-t\/scripts\//g, "<PKG>/");
  s = s.replace(/[^\s;&|()<>=]*\/@tekyzinc\/gsd-t\/scripts\//g, "<PKG>/");
  s = s.replace(new RegExp(lead + esc(slash(CLAUDE_DIR)) + "/", "g"), "<HOME>/.claude/");
  const homes = new Set([slash(os.homedir())]);
  try { homes.add(slash(fs.realpathSync(os.homedir()))); } catch { /* home not on disk: the literal spelling still matches */ }
  for (const h of homes) s = s.replace(new RegExp(lead + esc(h) + "/", "g"), "<HOME>/");
  return s.replace(new RegExp(lead + "(?:\\$\\{HOME\\}|\\$HOME|~)/", "g"), "<HOME>/");
}

const GSDT_REF_RE =
  /<HOME>\/\.claude\/(scripts\/(?:hooks\/)?gsd-t-[\w.-]+?\.(?:c?js|mjs|sh)|statusline-command\.sh)(?![\w.-])|<PKG>\/((?:hooks\/)?[\w.-]+?\.(?:c?js|mjs|sh))(?![\w.-])/g;

// Every GSD-T script `cmd` runs: { abs, name } — abs under ~/.claude (real
// root) or under the package's scripts/; name is the file name minus extension.
function gsdtScriptRefs(cmd) {
  if (typeof cmd !== "string") return [];
  const refs = [];
  for (const m of normalizeHookCommand(cmd).matchAll(GSDT_REF_RE)) {
    const abs = m[1] ? path.join(CLAUDE_DIR, m[1]) : path.join(PKG_SCRIPTS, m[2]);
    refs.push({ abs, name: path.basename(abs).replace(/\.[^.]+$/, "") });
  }
  return refs;
}

// Does hook `h` run GSD-T's script `marker` (or is it exactly `command`)?
function isGsdtHook(h, marker, command) {
  return !!h && typeof h.command === "string" &&
    (h.command === command || gsdtScriptRefs(h.command).some((r) => r.name === marker));
}

// A script GSD-T ships or once shipped: anything in the package's scripts/, a
// hook GSD-T registers or retired, or a retired ~/.claude file. A user's own
// gsd-t-named script (e.g. gsd-t-board-notify) is not ours to vouch for.
function isGsdtOwnedRef(r) {
  if (r.abs.startsWith(PKG_SCRIPTS + path.sep)) return true;
  if (GSDT_HOOK_MARKERS.includes(r.name) || RETIRED_V6.hookMarkers.includes(r.name)) return true;
  return Object.keys(globalRetiredEntries()).some((rel) => path.join(CLAUDE_DIR, rel) === r.abs);
}

// Every GSD-T-owned script path named in settings.json (hooks + statusLine) that does
// not exist — or that `willMove` says is about to be moved. `skipHook(h)` names
// hooks the caller is about to remove or rewrite. Returns readable lines.
function danglingGsdtRefs(settings, willMove = new Set(), skipHook = () => false, skipStatus = false) {
  const out = [];
  const check = (where, cmd) => {
    for (const r of gsdtScriptRefs(cmd).filter(isGsdtOwnedRef)) {
      if (willMove.has(r.abs) || !fs.existsSync(r.abs)) out.push(`${where}: ${cmd}\n      → ${r.abs} ${willMove.has(r.abs) ? "is about to be retired" : "does not exist"}`);
    }
  };
  for (const [ev, groups] of Object.entries(settings.hooks || {})) {
    for (const g of groups) {
      for (const h of (g && Array.isArray(g.hooks) ? g.hooks : [])) {
        if (h && typeof h.command === "string" && !skipHook(h)) check(`${ev} hook`, h.command);
      }
    }
  }
  const sl = settings.statusLine;
  if (!skipStatus && sl && typeof sl.command === "string") check("statusLine", sl.command);
  return out;
}

// settings.json as a plain object ({} when absent). Throws — naming the fix —
// when it is not valid JSON, not an object (array / null / scalar), or its
// "hooks" is not an object of arrays. Nothing that reads settings.json to
// rewrite it may proceed past a shape it would otherwise silently replace.
function readSettingsObject(targetPath) {
  if (!fs.existsSync(targetPath)) return {};
  let s;
  try {
    s = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch (e) {
    throw new Error(`${targetPath} is not valid JSON (${e.message}). Fix it and re-run — nothing was changed.`);
  }
  const kind = (v) => (v === null ? "null" : Array.isArray(v) ? "an array" : typeof v);
  if (kind(s) !== "object") {
    throw new Error(`${targetPath} must be a JSON object ({ ... }), found ${kind(s)}. Fix it (an empty file can be {}) and re-run — nothing was changed.`);
  }
  if (s.hooks !== undefined &&
      (kind(s.hooks) !== "object" || Object.values(s.hooks).some((v) => !Array.isArray(v)))) {
    throw new Error(`${targetPath}: "hooks" must be an object whose values are arrays of hook groups. Fix it and re-run — nothing was changed.`);
  }
  return s;
}

function writeSettingsObject(targetPath, settings) {
  if (isSymlink(targetPath)) throw new Error(`Refusing to write ${targetPath} — it is a symlink`);
  fs.writeFileSync(targetPath, JSON.stringify(settings, null, 2));
}

// The one registrar behind every GSD-T hook. After it runs, exactly one hook
// for `marker` exists, on `event`: extra GSD-T copies on that event and every
// copy on any OTHER event are removed (user hooks are never touched), a stale
// command is refreshed, and a matcher is changed only on a group that holds
// nothing but this hook — in a shared group the GSD-T hook moves to its own
// group so the user's hooks keep their matcher.
// `matcher` undefined = leave the matcher alone (new group gets "").
// Throws when settings.json cannot be read as an object or written.
function upsertGsdtHook(settingsPath, event, marker, command, label, matcher) {
  const targetPath = settingsPath || SETTINGS_JSON;
  const settings = readSettingsObject(targetPath);
  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
  const groups = settings.hooks[event];

  let action = "noop";
  let keeper = null;
  const emptied = new Set();
  for (const [ev, evGroups] of Object.entries(settings.hooks)) {
    for (const entry of evGroups) {
      if (!entry || !Array.isArray(entry.hooks)) continue;
      const before = entry.hooks.length;
      entry.hooks = entry.hooks.filter((h) => {
        if (!isGsdtHook(h, marker, command)) return true;
        if (ev === event && !keeper) { keeper = { entry, h }; return true; }
        return false; // a duplicate, or registered on the wrong event
      });
      if (entry.hooks.length !== before) {
        action = "updated";
        if (entry.hooks.length === 0) emptied.add(entry);
      }
    }
  }
  if (keeper) {
    if (keeper.h.command !== command) { keeper.h.command = command; action = "updated"; }
    if (matcher !== undefined && keeper.entry.matcher !== matcher) {
      if (keeper.entry.hooks.length === 1) {
        keeper.entry.matcher = matcher;
      } else {
        keeper.entry.hooks = keeper.entry.hooks.filter((h) => h !== keeper.h);
        groups.push({ matcher, hooks: [keeper.h] });
      }
      action = "updated";
    }
  } else {
    const entry = { matcher: matcher === undefined ? "" : matcher, hooks: [{ type: "command", command }] };
    // The install check goes FIRST on SessionStart, so a broken install is
    // repaired before anything else tries to use the missing tools.
    if (event === "SessionStart") groups.unshift(entry);
    else groups.push(entry);
    action = "added";
  }
  if (action === "noop") return { installed: true, action: "noop" };
  for (const ev of Object.keys(settings.hooks)) {
    settings.hooks[ev] = settings.hooks[ev].filter((g) => !emptied.has(g));
  }
  writeSettingsObject(targetPath, settings);
  return { installed: true, action };
}

// M98 — remove the GSD-T intercept PostToolUse hooks (grep + read) from settings.json.
// Same matching as every other GSD-T hook removal; leaves user hooks intact.
function removeInterceptHooks(settingsPath) {
  return removeHooksByMarkers(settingsPath || SETTINGS_JSON,
    [GRAPH_INTERCEPT_HOOK_MARKER, READ_INTERCEPT_HOOK_MARKER]).removed > 0;
}

// Strip hooks that GSD-T no longer ships. Runs on EVERY install, not only on
// uninstall: dropping the registration is not enough on its own, because a
// machine that installed the hook once keeps running it forever from its own
// settings.json. A retired hook has to be actively removed to actually stop.
//
//   gsd-t-worktree-guard — M105, retired 2026-08-08. Read heartbeat files as the
//   session signal, but subagents write those too, so one session with agents
//   looked like several colliding sessions and the guard blocked its own user.
//
//   gsd-t-context-meter — M61, script deleted; native /context replaced it.
//   init() stopped provisioning it then, but install() kept re-registering it,
//   so every machine still runs it on EVERY tool call: a bash + `npm root -g`
//   subprocess spawned to look for a file that no longer ships.
//
// Throws on any failure. A retired hook that silently survives keeps blocking
// edits forever, so "could not remove it" must stop the install loudly rather
// than report success.
function removeRetiredHooks(settingsPath) {
  return removeHooksByMarkers(settingsPath || SETTINGS_JSON, RETIRED_V6.hookMarkers);
}

// Remove every hook that runs one of GSD-T's `markers` scripts (gsdtScriptRefs),
// on any event, and drop groups left empty. Throws on any failure.
function removeHooksByMarkers(targetPath, markers) {
  const settings = readSettingsObject(targetPath);
  if (!settings.hooks) return { removed: 0 };

  let removed = 0;
  const matches = (h) =>
    !!h && typeof h.command === "string" && gsdtScriptRefs(h.command).some((r) => markers.includes(r.name));

  for (const event of Object.keys(settings.hooks)) {
    const rewritten = [];
    for (const g of settings.hooks[event]) {
      if (!g || !Array.isArray(g.hooks)) { rewritten.push(g); continue; }
      const kept = g.hooks.filter((h) => !matches(h));
      removed += g.hooks.length - kept.length;
      if (kept.length > 0) rewritten.push({ ...g, hooks: kept });
    }
    settings.hooks[event] = rewritten;
  }

  if (removed === 0) return { removed: 0 };
  writeSettingsObject(targetPath, settings);
  return { removed };
}

// Every retired path under ~/.claude (relative to it) → the headers it shipped with.
// A gsd-t-*.md GSD-T once shipped is retired only while the package no longer ships it.
function globalRetiredEntries() {
  const shipped = new Set(getCommandFiles());
  const commands = { ...RETIRED_V6.commands };
  for (const name of RETIRED_V6.commandNames) if (!shipped.has(name)) commands[name] = [COMMAND_HEADER];
  const out = {};
  const add = (dir, entries) => {
    for (const [rel, sentinels] of Object.entries(entries)) out[dir ? `${dir}/${rel}` : rel] = sentinels;
  };
  add("commands", commands);
  add("bin", RETIRED_V6.bin);
  add("scripts", RETIRED_V6.scripts);
  add("", RETIRED_V6.claudeDir);
  add("templates", RETIRED_V6.templates);
  return out;
}

function globalBackupRel() { return path.join(".gsd-t-retired", localDate()); }

// Every path under ~/.claude that install / update may write, copy over or move.
function globalTouchedRels() {
  const retired = Object.keys(globalRetiredEntries());
  return [
    "CLAUDE.md", "settings.json", ".gsd-t-version",
    ...getCommandFiles().map((f) => `commands/${f}`),
    ...GLOBAL_BIN_TOOLS.map((t) => `bin/${t}`),
    `scripts/${UPDATE_CHECK_SCRIPT}`, `scripts/${AUTO_ROUTE_SCRIPT}`,
    ...SHARED_TEMPLATES.map((t) => `templates/${t}`),
    ...retired, ...retired.map((r) => path.join(globalBackupRel(), r)),
  ];
}

// v6 — move what earlier versions installed into ~/.claude and v6 no longer
// ships (commands, ~/.claude/bin tools, ~/.claude/scripts, templates, the
// status bar) to ~/.claude/.gsd-t-retired/<date>/. A user's own file with the
// same name (no GSD-T header) is reported and left alone. Throws on any failure.
function retireV6Files() {
  const entries = globalRetiredEntries();
  const backupRel = globalBackupRel();
  haltOnSymlinks(CLAUDE_DIR, globalTouchedRels());
  const moved = [];
  const kept = [];
  for (const [rel, sentinels] of Object.entries(entries)) {
    const r = retireShippedFile(CLAUDE_DIR, rel, sentinels, backupRel);
    if (r === "moved") moved.push(rel);
    if (r === "kept") kept.push(rel);
  }
  removeEmptyDir(path.join(GLOBAL_BIN_DIR, "cli-preflight-checks"));
  removeEmptyDir(path.join(SCRIPTS_DIR, "hooks"));

  // The status bar ran a GSD-T script retired above. Clear the setting when it
  // names any retired path (any spelling — normalizeHookCommand) that is now
  // gone; a user's own same-named script was kept, so its setting stays.
  const retiredAbs = new Set(Object.keys(entries).map((r) => path.join(CLAUDE_DIR, r)));
  let statusCleared = false;
  if (fs.existsSync(SETTINGS_JSON)) {
    const settings = readSettingsObject(SETTINGS_JSON);
    const sl = settings.statusLine;
    if (sl && gsdtScriptRefs(sl.command).some((r) => retiredAbs.has(r.abs) && !fs.existsSync(r.abs))) {
      delete settings.statusLine;
      writeSettingsObject(SETTINGS_JSON, settings);
      statusCleared = true;
    }
  }

  if (moved.length) {
    success(`Moved ${moved.length} retired file(s) to ~/.claude/${backupRel}/ (move one back to restore it)`);
  }
  if (statusCleared) info("Cleared the GSD-T status line from settings.json (retired in v6)");
  for (const f of kept) info(`Left ~/.claude/${f} in place — it has no GSD-T header, so it is not ours`);
  return { moved, kept, statusCleared, backupDir: path.join(CLAUDE_DIR, backupRel) };
}

// ─── Update Check Hook ──────────────────────────────────────────────────────

const UPDATE_CHECK_SCRIPT = "gsd-t-update-check.js";

function installUpdateCheck() {
  ensureDir(SCRIPTS_DIR, CLAUDE_DIR);

  // Copy update check script
  const src = path.join(PKG_SCRIPTS, UPDATE_CHECK_SCRIPT);
  const dest = path.join(SCRIPTS_DIR, UPDATE_CHECK_SCRIPT);

  if (!fs.existsSync(src)) {
    warn("Update check script not found in package — skipping");
    return;
  }

  const srcContent = fs.readFileSync(src, "utf8");
  const destContent = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : "";

  if (normalizeEol(srcContent) !== normalizeEol(destContent)) {
    copyFile(src, dest, UPDATE_CHECK_SCRIPT);
  } else {
    info("Update check script unchanged");
  }

  // Configure SessionStart hook in settings.json
  configureUpdateCheckHook(dest);
}

// SessionStart, matcher "" — through the one shared registrar.
function configureUpdateCheckHook(scriptPath) {
  const cmd = `node "${scriptPath.replace(/\\/g, "\\\\")}"`;
  reportHook(configureEventHook(SETTINGS_JSON, "SessionStart", "gsd-t-update-check", cmd, "update check"), "Update check hook");
}

// ─── Auto-Route Hook ─────────────────────────────────────────────────────────

const AUTO_ROUTE_SCRIPT = "gsd-t-auto-route.js";

function installAutoRoute() {
  ensureDir(SCRIPTS_DIR, CLAUDE_DIR);

  const src = path.join(PKG_SCRIPTS, AUTO_ROUTE_SCRIPT);
  const dest = path.join(SCRIPTS_DIR, AUTO_ROUTE_SCRIPT);

  if (!fs.existsSync(src)) {
    warn("Auto-route script not found in package — skipping");
    return;
  }

  const srcContent = fs.readFileSync(src, "utf8");
  const destContent = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : "";

  if (normalizeEol(srcContent) !== normalizeEol(destContent)) {
    copyFile(src, dest, AUTO_ROUTE_SCRIPT);
  } else {
    info("Auto-route script unchanged");
  }

  configureAutoRouteHook(dest);
}

// UserPromptSubmit — through the one shared registrar.
function configureAutoRouteHook(scriptPath) {
  const cmd = `node "${scriptPath.replace(/\\/g, "\\\\")}"`;
  reportHook(configureEventHook(SETTINGS_JSON, "UserPromptSubmit", "gsd-t-auto-route", cmd, "auto-route"), "Auto-route hook");
}

// ─── Global Bin Tools (~/.claude/bin/) ───────────────────────────────────────
// Tools that must work outside any project (on PATH, or resolved by a hook from
// ~/.claude/bin). Distinct from PROJECT_BIN_TOOLS, which copy into each
// registered project's bin/.
const GLOBAL_BIN_TOOLS = [
  // M111 — prints the worktree a session should start in. Called by the shell
  // BEFORE claude launches, so it must be on PATH rather than only in a project.
  "gsd-t-pick-worktree.cjs",
  // M112 — the two modules gsd-t-pick-worktree requires. Without them it throws
  // on load, so a tool that ships alone is a tool that does not run.
  "gsd-t-worktree-detect.cjs",
  "gsd-t-worktree-provision.cjs",
  // M112 — measures a slice plan in LINES and splits what is too big. Called by
  // the scan workflow before any reviewing starts.
  "gsd-t-slice-budget.cjs",
  // PseudoCode §1.1 flow-line style gate (`gsd-t pseudocode-style`), used by the architect pass.
  "gsd-t-pseudocode-style.cjs",
  // M106 — Fallback detector. scripts/gsd-t-fallback-guard.js (a PreToolUse hook)
  // shells out to this by absolute path; if it is missing the guard DENIES the
  // write rather than allowing it unchecked. Also in PROJECT_BIN_TOOLS below.
  "gsd-t-fallback-detect.cjs",
  // M117 — Search classifier. The graph search guard resolves it from the
  // package when a project has no copy, so it must ship globally too.
  "gsd-t-code-search-classifier.cjs",
  // M108 — Install self-check, run by the SessionStart hook and by
  // `gsd-t install-check`.
  "gsd-t-install-check.cjs",
  // v5.20.10 — deterministic Tekyz estimate-sheet writer + read-back audit
  // (`gsd-t estimate-sheet`). In BOTH lists ([[project_global_bin_propagation_gap]]).
  "gsd-t-estimate-sheet.cjs",
];

function installGlobalBinTools() {
  ensureDir(GLOBAL_BIN_DIR, CLAUDE_DIR);
  // A tool this list promises but the package lacks is a packaging defect that
  // breaks every machine. HALT before copying anything rather than install half.
  const missing = GLOBAL_BIN_TOOLS.filter((tool) => !fs.existsSync(path.join(PKG_ROOT, "bin", tool)));
  if (missing.length) {
    throw new Error(`Package is missing global bin tool(s): ${missing.join(", ")} — reinstall @tekyzinc/gsd-t`);
  }
  for (const tool of GLOBAL_BIN_TOOLS) {
    const src = path.join(PKG_ROOT, "bin", tool);
    const dest = path.join(GLOBAL_BIN_DIR, tool);
    const srcContent = fs.readFileSync(src, "utf8");
    const destContent = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : "";
    if (normalizeEol(srcContent) !== normalizeEol(destContent)) {
      copyFile(src, dest, `bin/${tool}`);
      try { fs.chmodSync(dest, 0o755); } catch {}
    } else {
      info(`bin/${tool} unchanged`);
    }
  }
}

// ─── SCIP indexers ───────────────────────────────────────────────────────────

// M95: install the SCIP indexers that give the code graph compiler-accurate
// call-edge resolution. These are a GSD-T requirement (not "optional only to get
// better") — the precise call graph (who-calls / test-impl / blast-radius across
// imports) depends on them. Node-only npm packages (Apache-2.0 / MIT). Fail-loud
// but non-blocking: if the global install needs sudo, warn with the manual
// command rather than aborting the whole GSD-T install.
function installScipIndexers() {
  const indexers = [
    { bin: "scip-typescript", pkg: "@sourcegraph/scip-typescript", langs: "TS/JS" },
    { bin: "scip-python", pkg: "@sourcegraph/scip-python", langs: "Python" },
  ];
  for (const { bin, pkg, langs } of indexers) {
    let present = false;
    try {
      execFileSync("which", [bin], { encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] });
      present = true;
    } catch { /* not present */ }

    if (present) {
      info(`${bin} present (${langs} compiler-accurate edges)`);
      continue;
    }
    info(`Installing ${bin} (${langs} compiler-accurate code graph)...`);
    try {
      execFileSync("npm", ["install", "-g", pkg], {
        encoding: "utf8", timeout: 180000, stdio: ["pipe", "pipe", "pipe"],
      });
      success(`${bin} installed`);
    } catch (e) {
      warn(`${bin} install failed — code graph will use tree-sitter floor (approximate) for ${langs}`);
      info(`To enable compiler-accurate ${langs} edges: npm install -g ${pkg}`);
    }
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────

// Shared templates that slash-command prompts reference by predictable path.
// Terminal-2 workers should find these at ~/.claude/templates/ without hunting
// through npx caches. Keep this list tight — only templates that commands cite
// via absolute path belong here.
const SHARED_TEMPLATES = [
  "estimate-config.json",
  "estimate-sheet-spec.md",
];

function installSharedTemplates() {
  ensureDir(CLAUDE_TEMPLATES_DIR, CLAUDE_DIR);
  let installed = 0, skipped = 0;
  const notDelivered = [];
  for (const file of SHARED_TEMPLATES) {
    const src = path.join(PKG_TEMPLATES, file);
    const dest = path.join(CLAUDE_TEMPLATES_DIR, file);
    if (!fs.existsSync(src)) {
      notDelivered.push(file); // promised but absent — reported, never silent
      continue;
    }
    if (fs.existsSync(dest) &&
        normalizeEol(fs.readFileSync(src, "utf8")) === normalizeEol(fs.readFileSync(dest, "utf8"))) {
      skipped++;
      continue;
    }
    fs.copyFileSync(src, dest);
    installed++;
  }
  if (skipped > 0) info(`${skipped} templates unchanged`);
  success(`${installed + skipped} shared templates → ~/.claude/templates/`);
  if (notDelivered.length) {
    warn(`${notDelivered.length} template(s) are named by the installer but absent from the package:`);
    for (const f of notDelivered) warn(`    ${f}`);
  }
}

function installCommands(isUpdate) {
  heading("Slash Commands");
  const commandFiles = getCommandFiles();
  const gsdtCommands = getGsdtCommands();
  const utilityCommands = getUtilityCommands();
  let installed = 0, skipped = 0;

  for (const file of commandFiles) {
    const src = path.join(PKG_COMMANDS, file);
    const dest = path.join(COMMANDS_DIR, file);
    if (isUpdate && fs.existsSync(dest)) {
      if (normalizeEol(fs.readFileSync(src, "utf8")) === normalizeEol(fs.readFileSync(dest, "utf8"))) {
        skipped++;
        continue;
      }
    }
    copyFile(src, dest, file);
    installed++;
  }

  if (skipped > 0) info(`${skipped} commands unchanged`);
  success(`${gsdtCommands.length} GSD-T commands + ${utilityCommands.length} utilities ${isUpdate ? "updated" : "installed"} → ~/.claude/commands/`);
  // Retired commands are moved by retireV6Files(), with every other retired file.
  return { gsdtCommands, utilityCommands };
}

const GSDT_START = "<!-- GSD-T:START";
const GSDT_END = "<!-- GSD-T:END";

function installGlobalClaudeMd(isUpdate) {
  heading("Global CLAUDE.md");
  const globalSrc = path.join(PKG_TEMPLATES, "CLAUDE-global.md");

  if (!fs.existsSync(GLOBAL_CLAUDE_MD)) {
    copyFile(globalSrc, GLOBAL_CLAUDE_MD, "CLAUDE.md installed");
    return;
  }
  if (isSymlink(GLOBAL_CLAUDE_MD)) haltOnSymlinks(CLAUDE_DIR, ["CLAUDE.md"]);

  const existing = fs.readFileSync(GLOBAL_CLAUDE_MD, "utf8");
  const problem = claudeMdProblem(existing);
  if (problem) throw new Error(problem);
  const template = fs.readFileSync(globalSrc, "utf8");
  if (existing.includes(GSDT_START)) mergeGsdtSection(existing, template);
  else appendGsdtToClaudeMd(template);
}

// Why ~/.claude/CLAUDE.md cannot be merged safely, with the exact fix — or null.
// Safe: exactly one START and one END, START first; or no markers and no GSD-T
// content (a fresh section is appended). Anything else HALTS: guessing which
// part is GSD-T's is how a merge eats the user's own rules.
function claudeMdProblem(text) {
  const count = (m) => text.split(m).length - 1;
  const starts = count(GSDT_START);
  const ends = count(GSDT_END);
  const file = GLOBAL_CLAUDE_MD;
  if (starts === 0 && ends === 0) {
    if (!text.includes("GSD-T: Contract-Driven Development") && !text.includes("# ─── GSD-T Section")) return null;
    return `${file} holds an old GSD-T section with no GSD-T:START/END markers, so GSD-T cannot tell it from your own rules.\n` +
      `  Fix: delete the old GSD-T section (it begins at "# ─── GSD-T Section" or "# GSD-T: Contract-Driven Development"), keep your own content, and re-run — a fresh marked section is appended. Nothing was changed.`;
  }
  if (starts === 1 && ends === 1 && text.indexOf(GSDT_START) < text.indexOf(GSDT_END)) return null;
  return `${file} has malformed GSD-T markers (${starts} "${GSDT_START}", ${ends} "${GSDT_END}"${starts === 1 && ends === 1 ? ", END before START" : ""}).\n` +
    `  Fix: keep exactly one "${GSDT_START} …" line followed later by one "${GSDT_END} …" line around the GSD-T section (or delete both markers and everything between them), then re-run. Nothing was changed.`;
}

// Replace the marked GSD-T section with the template — on install AND update.
// Install used to keep an old section ("already contains GSD-T config") while
// recording the new version, so update then believed it was current and the
// stale section stayed forever. Content outside the markers is preserved, and
// the old file is backed up before any write. Markers are validated first.
function mergeGsdtSection(existing, template) {
  const problem = claudeMdProblem(existing);
  if (problem) throw new Error(problem);
  const startIdx = existing.indexOf(GSDT_START);
  const endMarkerIdx = existing.indexOf(GSDT_END);
  const endLineEnd = existing.indexOf("\n", endMarkerIdx);
  const endIdx = endLineEnd === -1 ? existing.length : endLineEnd + 1;
  const before = existing.substring(0, startIdx);
  const after = existing.substring(endIdx);
  const merged = before + template.trimEnd() + "\n" + after;
  if (normalizeEol(merged) === normalizeEol(existing)) {
    info("CLAUDE.md GSD-T section already up to date");
    return;
  }
  const backupPath = GLOBAL_CLAUDE_MD + ".backup-" + Date.now();
  fs.copyFileSync(GLOBAL_CLAUDE_MD, backupPath);
  fs.writeFileSync(GLOBAL_CLAUDE_MD, merged);
  success("CLAUDE.md GSD-T section updated (custom content preserved)");
}

function appendGsdtToClaudeMd(template) {
  const separator = "\n\n";
  fs.copyFileSync(GLOBAL_CLAUDE_MD, GLOBAL_CLAUDE_MD + ".backup-" + Date.now());
  fs.appendFileSync(GLOBAL_CLAUDE_MD, separator + template.trimEnd() + "\n");
  success("GSD-T config appended to existing CLAUDE.md");
  info("Your existing content was preserved.");
}

async function doInstall(opts = {}) {
  const isUpdate = opts.update || false;
  heading(`${isUpdate ? "Updating" : "Installing"} GSD-T ${versionLink()}`);
  log("");

  // Everything that can make this run stop half-way is checked BEFORE the
  // first change: settings.json shape, symlinks, CLAUDE.md markers.
  preflightGlobal();

  if (ensureDir(COMMANDS_DIR, CLAUDE_DIR)) success("Created ~/.claude/commands/");

  const { gsdtCommands, utilityCommands } = installCommands(isUpdate);
  installGlobalClaudeMd(isUpdate);

  heading("Update Check (Session Start)");
  installUpdateCheck();

  heading("Live Clock + Reader Contract (UserPromptSubmit)");
  installAutoRoute();

  heading("Shared Templates");
  installSharedTemplates();

  heading("Global Bin Tools (~/.claude/bin/)");
  installGlobalBinTools();

  heading("Hooks");
  reportHook(configureGraphInterceptHook(SETTINGS_JSON), "Graph-intercept hook (structural greps consult the code graph — M97)");
  reportHook(configureReadInterceptHook(SETTINGS_JSON), "Read-intercept hook (structural code reads point at graph body slices — M98)");
  reportHook(configureFallbackGuardHook(SETTINGS_JSON), "Fallback guard (denies a write that adds an unapproved fallback — M106)");
  reportHook(configureDateGuardHook(SETTINGS_JSON), "Date guard (blocks a timestamp that drifts from the live clock)");
  reportHook(configureGraphSearchGuardHook(SETTINGS_JSON), "Graph search guard (blocks a structural code search, names the graph query — M117)");
  reportHook(configureGraphUseReportHook(SETTINGS_JSON), "Graph use report (flags a turn that did structural work without asking the graph — M117)");
  reportHook(configureChangelogPostEditHook(SETTINGS_JSON), "CLAUDE.md changelog post-edit hook (M110)");
  // SessionStart entries are put FIRST, so register install-heal last: it then
  // runs before anything else tries to use the tools it repairs.
  reportHook(configureChangelogCheckHook(SETTINGS_JSON), "CLAUDE.md changelog check (M110)");
  reportHook(configureInstallHealHook(SETTINGS_JSON), "Install self-heal (restores missing tools before work starts — M108)");

  retireV6Everything();

  heading("Status Line");
  installStatusLine();

  heading("SCIP Indexers (Compiler-Accurate Code Graph — M95)");
  installScipIndexers();

  saveInstalledVersion();

  showInstallSummary(gsdtCommands.length, utilityCommands.length);
}

// ─── Status line ────────────────────────────────────────────────────────────
// Copies scripts/statusline-command.sh to ~/.claude and points the statusLine
// setting at it — only when the setting is absent or already GSD-T's. A user's
// own status line is left alone. Runs after retireV6Everything(), which clears a
// setting that named the retired gsd-t-statusline.js.
const STATUSLINE_SCRIPT = "statusline-command.sh";
const STATUSLINE_SENTINEL = "GSD-T project status bar";

function installStatusLine() {
  const src = path.join(PKG_SCRIPTS, STATUSLINE_SCRIPT);
  const dest = path.join(CLAUDE_DIR, STATUSLINE_SCRIPT);
  if (!fs.existsSync(src)) throw new Error(`Package is missing scripts/${STATUSLINE_SCRIPT}`);
  const existing = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : null;
  if (existing !== null && !existing.includes(STATUSLINE_SENTINEL)) {
    info(`~/.claude/${STATUSLINE_SCRIPT} is your own (no GSD-T header) — status line left untouched`);
    return;
  }
  if (existing === null || normalizeEol(existing) !== normalizeEol(fs.readFileSync(src, "utf8"))) {
    copyFile(src, dest, STATUSLINE_SCRIPT);
  }
  fs.chmodSync(dest, 0o755);

  const settings = fs.existsSync(SETTINGS_JSON) ? readSettingsObject(SETTINGS_JSON) : {};
  const desired = `bash ${dest}`;
  const sl = settings.statusLine;
  const ours = !sl || gsdtScriptRefs(sl.command || "").some((r) => r.abs === dest);
  if (!ours) {
    info("Custom status line present — left untouched");
    return;
  }
  if (sl && sl.type === "command" && sl.command === desired) {
    info("Status line already configured");
    return;
  }
  settings.statusLine = { type: "command", command: desired };
  writeSettingsObject(SETTINGS_JSON, settings);
  success("Status line configured");
}

// install / update / update-all run this before changing anything. Any problem
// HALTS with the exact fix, having changed nothing.
function preflightGlobal() {
  haltOnSymlinks(CLAUDE_DIR, globalTouchedRels());
  const settings = readSettingsObject(SETTINGS_JSON);
  haltOnDanglingRefs(predictDangling(settings), "would leave");
  if (fs.existsSync(GLOBAL_CLAUDE_MD)) {
    const problem = claudeMdProblem(fs.readFileSync(GLOBAL_CLAUDE_MD, "utf8"));
    if (problem) throw new Error(problem);
  }
}

// Retired hooks out of settings.json, retired files moved to the backup folder,
// then PROVE the invariant: no hook or statusLine names a missing GSD-T script.
function retireV6Everything() {
  heading("Retired in v6");
  const retired = removeRetiredHooks(SETTINGS_JSON);
  if (retired.removed > 0) success(`Removed ${retired.removed} retired hook(s) from settings.json`);
  retireV6Files();
  haltOnDanglingRefs(danglingGsdtRefs(readSettingsObject(SETTINGS_JSON)), "left");
}

// Before any change: which GSD-T script references in settings.json would dangle
// once this run finishes? A hook this run removes (retired marker) or rewrites
// (a hook GSD-T registers) is excluded; so is a statusLine this run clears.
// Everything else must name a script that exists and is not about to be moved.
function predictDangling(settings) {
  const entries = globalRetiredEntries();
  const willMove = new Set();
  for (const [rel, sentinels] of Object.entries(entries)) {
    if (willRetire(CLAUDE_DIR, rel, sentinels)) willMove.add(path.join(CLAUDE_DIR, rel));
  }
  const handled = RETIRED_V6.hookMarkers.concat(GSDT_HOOK_MARKERS);
  const skipHook = (h) => gsdtScriptRefs(h.command).some((r) => handled.includes(r.name));
  const sl = settings.statusLine;
  const statusCleared = !!sl && gsdtScriptRefs(sl.command).some((r) => willMove.has(r.abs));
  return danglingGsdtRefs(settings, willMove, skipHook, statusCleared);
}

function haltOnDanglingRefs(lines, verb) {
  if (lines.length === 0) return;
  throw new Error(
    `HALT: this run ${verb} settings.json pointing at GSD-T script(s) that ${verb === "left" ? "do" : "would"} not exist — every Claude Code event would run a broken hook:\n` +
    lines.map((l) => `    ${l}`).join("\n") + "\n" +
    `  Fix: remove those entries from ${SETTINGS_JSON} (or restore the script), then re-run.` +
    (verb === "left" ? "" : " Nothing was changed.")
  );
}

// Same version installed: still compare the CLAUDE.md section by content and
// retire what v6 no longer ships — an earlier run may have stopped short.
function refreshSameVersion() {
  preflightGlobal();
  installGlobalClaudeMd(true);
  retireV6Everything();
  installStatusLine();
}

function reportHook(result, label) {
  if (!result.installed) throw new Error(`Could not register: ${label}`);
  if (result.action === "added") success(`${label} — added`);
  else if (result.action === "noop") info(`${label} — already configured`);
  else success(`${label} — refreshed`);
}

function showInstallSummary(gsdtCount, utilCount) {
  heading("Installation Complete!");
  log("");
  log(`  Commands: ${gsdtCount} GSD-T + ${utilCount} utility commands in ~/.claude/commands/`);
  log(`  Config:   ~/.claude/CLAUDE.md`);
  log(`  Version:  ${versionLink()}`);
  log("");
  log(`${BOLD}Quick Start:${RESET}`);
  log(`  ${DIM}$${RESET} cd your-project`);
  log(`  ${DIM}$${RESET} claude`);
  log(`  ${DIM}>${RESET} /gsd-t-init-scan-setup`);
  log("");
  log(`${BOLD}Other commands:${RESET}`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t status      ${DIM}— check installation${RESET}`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t update      ${DIM}— update to latest${RESET}`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t init myapp   ${DIM}— scaffold a new project${RESET}`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t doctor       ${DIM}— diagnose issues${RESET}`);
  log("");
}

async function doUpdate() {
  const installedVersion = getInstalledVersion();

  if (installedVersion === PKG_VERSION) {
    heading(`GSD-T ${versionLink()}`);
    info("Already up to date!");
    refreshSameVersion();
    log("");
    log("  To force a reinstall, run:");
    log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t install`);
    log("");
    return;
  }

  if (installedVersion) {
    heading(`Updating GSD-T: ${versionLink(installedVersion)} → ${versionLink()}`);
  }

  await doInstall({ update: true });
}

function initClaudeMd(projectDir, projectName, today) {
  const claudeMdPath = path.join(projectDir, "CLAUDE.md");
  if (isSymlink(claudeMdPath)) {
    warn("Skipping CLAUDE.md — target is a symlink");
    return;
  }
  try {
    const template = fs.readFileSync(path.join(PKG_TEMPLATES, "CLAUDE-project.md"), "utf8");
    const content = applyTokens(template, projectName, today);
    fs.writeFileSync(claudeMdPath, content, { flag: "wx" });
    success("CLAUDE.md created");
  } catch (e) {
    if (e.code === "EEXIST") {
      const content = fs.readFileSync(claudeMdPath, "utf8");
      if (content.includes("GSD-T Workflow")) {
        info("CLAUDE.md already contains GSD-T section — skipping");
      } else {
        warn("CLAUDE.md exists but doesn't reference GSD-T");
        info("Run /gsd-t-init inside Claude Code to add GSD-T section");
      }
    } else { throw e; }
  }
}

function initDocs(projectDir, projectName, today) {
  const docsDir = path.join(projectDir, "docs");
  ensureDir(docsDir, projectDir);

  const docTemplates = ["requirements.md", "architecture.md", "workflows.md", "infrastructure.md"];
  for (const file of docTemplates) {
    const destPath = path.join(docsDir, file);
    if (isSymlink(destPath)) {
      warn(`Skipping docs/${file} — target is a symlink`);
      continue;
    }
    try {
      const template = fs.readFileSync(path.join(PKG_TEMPLATES, file), "utf8");
      const content = applyTokens(template, projectName, today);
      fs.writeFileSync(destPath, content, { flag: "wx" });
      success(`docs/${file}`);
    } catch (e) {
      if (e.code === "EEXIST") { info(`docs/${file} already exists — skipping`); }
      else { throw e; }
    }
  }
}

function initGsdtDir(projectDir, projectName, today) {
  const gsdtDir = path.join(projectDir, ".gsd-t");
  const contractsDir = path.join(gsdtDir, "contracts");
  const domainsDir = path.join(gsdtDir, "domains");

  ensureDir(contractsDir, projectDir);
  ensureDir(domainsDir, projectDir);

  for (const dir of [contractsDir, domainsDir]) {
    const gitkeep = path.join(dir, ".gitkeep");
    if (isSymlink(gitkeep)) continue;
    try { fs.writeFileSync(gitkeep, "", { flag: "wx" }); }
    catch (e) { if (e.code !== "EEXIST") throw e; }
  }

  writeTemplateFile("progress.md", path.join(gsdtDir, "progress.md"), ".gsd-t/progress.md", projectName, today);
}

function writeTemplateFile(templateName, destPath, label, projectName, today) {
  if (isSymlink(destPath)) { warn(`Skipping ${label} — target is a symlink`); return; }
  try {
    const template = fs.readFileSync(path.join(PKG_TEMPLATES, templateName), "utf8");
    const content = projectName ? applyTokens(template, projectName, today) : template;
    fs.writeFileSync(destPath, content, { flag: "wx" });
    success(label);
  } catch (e) {
    if (e.code === "EEXIST") { info(`${label} already exists — skipping`); }
    else { throw e; }
  }
}

async function doInit(projectName) {
  if (!projectName) projectName = path.basename(process.cwd());

  if (!validateProjectName(projectName)) {
    error(`Invalid project name: "${projectName}"`);
    info("Project names must start with a letter or number and contain only letters, numbers, dots, hyphens, underscores, or spaces (max 101 chars)");
    return;
  }

  heading(`Initializing GSD-T project: ${projectName}`);
  log("");

  const projectDir = process.cwd();
  const today = new Date().toISOString().split("T")[0];

  initClaudeMd(projectDir, projectName, today);
  initDocs(projectDir, projectName, today);
  initGsdtDir(projectDir, projectName, today);
  copyBinToolsToProject(projectDir, projectName);

  if (registerProject(projectDir)) success("Registered in ~/.claude/.gsd-t-projects");

  // M50 D1: Universal Playwright bootstrap. If the project has UI signal but
  // no playwright.config.*, install @playwright/test + chromium and scaffold
  // playwright.config.ts + e2e/. See playwright-bootstrap-contract.md §5.
  if (hasUI(projectDir) && !hasPlaywright(projectDir)) {
    info("Installing Playwright (chromium)…");
    try {
      const r = await installPlaywright(projectDir);
      if (r.ok) {
        success("Playwright installed (playwright.config.ts + e2e/ scaffold)");
      } else {
        warn(`Playwright install failed: ${r.err}`);
        if (r.hint) info(r.hint);
      }
    } catch (e) {
      warn(`Playwright install errored: ${e.message || e}`);
      info("Re-run with: gsd-t doctor --install-playwright");
    }
  }

  showInitTree(projectDir);
}

function showInitTree(projectDir) {
  heading("Project Initialized!");
  log("");
  log(`  ${projectDir}/`);
  log("  ├── CLAUDE.md");
  log("  ├── docs/");
  log("  │   ├── requirements.md");
  log("  │   ├── architecture.md");
  log("  │   ├── workflows.md");
  log("  │   └── infrastructure.md");
  log("  └── .gsd-t/");
  log("      ├── progress.md");
  log("      ├── contracts/");
  log("      └── domains/");
  log("");
  log(`${BOLD}Next steps:${RESET}`);
  log(`  1. Edit CLAUDE.md — add project overview and tech stack`);
  log(`  2. Start Claude Code: ${DIM}claude${RESET}`);
  log(`  3. Run: ${DIM}/gsd-t-scan${RESET}  ${DIM}(if existing codebase)${RESET}`);
  log("");
}

function doStatus() {
  heading("GSD-T Status");
  log("");
  if (!showStatusVersion()) return;
  showStatusCommands();
  showStatusConfig();
  showStatusTeams();
  showStatusProject();
  log("");
}

function showStatusVersion() {
  const installedVersion = getInstalledVersion();
  if (installedVersion) {
    success(`Installed version: ${versionLink(installedVersion)}`);
    if (installedVersion !== PKG_VERSION) {
      warn(`Latest version: ${versionLink()}`);
      info(`Run 'npx @tekyzinc/gsd-t update' to update`);
    } else {
      success(`Up to date (latest: ${versionLink()})`);
    }
    return true;
  }
  error("GSD-T not installed");
  info("Run 'npx @tekyzinc/gsd-t install' to install");
  return false;
}

function showStatusCommands() {
  heading("Slash Commands");
  const expected = getCommandFiles();
  const installed = getInstalledCommands();
  const missing = expected.filter((f) => !installed.includes(f));
  const extra = installed.filter((f) => !expected.includes(f));
  const present = expected.filter((f) => installed.includes(f));
  log(`  ${present.length}/${expected.length} commands installed (${getGsdtCommands().length} GSD-T + ${getUtilityCommands().length} utilities)`);
  if (missing.length > 0) warn(`Missing: ${missing.join(", ")}`);
  if (extra.length > 0) info(`Custom commands found: ${extra.join(", ")}`);
}

function showStatusConfig() {
  heading("Global Config");
  if (fs.existsSync(GLOBAL_CLAUDE_MD)) {
    const content = fs.readFileSync(GLOBAL_CLAUDE_MD, "utf8");
    if (content.includes("GSD-T: Contract-Driven Development")) {
      success("~/.claude/CLAUDE.md contains GSD-T config");
    } else {
      warn("~/.claude/CLAUDE.md exists but doesn't contain GSD-T section");
    }
  } else {
    error("~/.claude/CLAUDE.md not found");
  }
}

function showStatusTeams() {
  heading("Agent Teams");
  if (!fs.existsSync(SETTINGS_JSON)) {
    info("No settings.json found (Claude Code will use defaults)");
    return;
  }
  const settings = readSettingsJson();
  if (settings === null) {
    warn("settings.json exists but couldn't be parsed");
    return;
  }
  const teamsEnabled = settings?.env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1";
  if (teamsEnabled) {
    success("Agent Teams enabled in settings.json");
  } else {
    info("Agent Teams not enabled (optional — solo mode works fine)");
    info('Add "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" to env in settings.json');
  }
}

function showStatusProject() {
  heading("Current Project");
  const cwd = process.cwd();
  const hasGsdT = fs.existsSync(path.join(cwd, ".gsd-t"));
  const hasClaudeMd = fs.existsSync(path.join(cwd, "CLAUDE.md"));

  if (hasGsdT) {
    success(`.gsd-t/ found in ${cwd}`);
    const progressPath = path.join(cwd, ".gsd-t", "progress.md");
    if (fs.existsSync(progressPath)) {
      const progress = fs.readFileSync(progressPath, "utf8");
      const statusMatch = progress.match(/## Status:\s*(.+)/);
      const milestoneMatch = progress.match(/## Project:\s*(.+)/);
      if (milestoneMatch) info(`Project: ${milestoneMatch[1]}`);
      if (statusMatch) info(`Status: ${statusMatch[1]}`);
    }
  } else if (hasClaudeMd) {
    info("CLAUDE.md found but no .gsd-t/ directory");
    info("Run /gsd-t-init inside Claude Code to set up");
  } else {
    info("Not in a GSD-T project directory");
    info(`Run 'npx @tekyzinc/gsd-t init' to set up this directory`);
  }
}

function doUninstall() {
  heading("Uninstalling GSD-T");
  log("");

  removeInstalledCommands();
  removeVersionFile();

  // Every hook GSD-T registers, plus any retired one still lingering.
  const hooks = removeHooksByMarkers(SETTINGS_JSON, GSDT_HOOK_MARKERS.concat(RETIRED_V6.hookMarkers));
  if (hooks.removed > 0) success(`Removed ${hooks.removed} GSD-T hook(s) from settings.json`);

  warn("~/.claude/CLAUDE.md was NOT removed (may contain your customizations)");
  info("Remove manually if desired: delete the GSD-T section from ~/.claude/CLAUDE.md");
  info("Project files (.gsd-t/, docs/, CLAUDE.md) were NOT removed");

  heading("Uninstall Complete");
  log("");
}

function removeInstalledCommands() {
  const commands = getInstalledCommands();
  let removed = 0;
  for (const file of commands) {
    const fp = path.join(COMMANDS_DIR, file);
    if (isSymlink(fp)) { warn(`Skipping symlink: ${file}`); continue; }
    try { fs.unlinkSync(fp); removed++; }
    catch (e) { error(`Failed to remove ${file}: ${e.message}`); }
  }
  if (removed > 0) success(`Removed ${removed} slash commands from ~/.claude/commands/`);
}

function removeVersionFile() {
  try {
    if (fs.existsSync(VERSION_FILE) && !isSymlink(VERSION_FILE)) fs.unlinkSync(VERSION_FILE);
  } catch (e) {
    error(`Failed to remove version file: ${e.message}`);
  }
}

function updateProjectClaudeMd(claudeMd, projectName) {
  const content = fs.readFileSync(claudeMd, "utf8");
  if (content.includes("Destructive Action Guard")) return false;

  const newContent = insertGuardSection(content);
  if (isSymlink(claudeMd)) throw new Error(`Refusing to write ${claudeMd} — it is a symlink`);
  try {
    fs.writeFileSync(claudeMd, newContent);
  } catch (e) {
    throw new Error(`failed to update ${claudeMd}: ${e.message}`);
  }
  success(`${projectName} — added Destructive Action Guard`);
  return true;
}

function insertGuardSection(content) {
  const preCommitMatch = content.match(/\n(#{1,3} Pre-Commit Gate)/);
  if (preCommitMatch) return content.replace("\n" + preCommitMatch[1], GUARD_SECTION + "\n" + preCommitMatch[1]);
  const dontDoMatch = content.match(/\n(#{1,3} Don't Do These Things)/);
  if (dontDoMatch) return content.replace("\n" + dontDoMatch[1], GUARD_SECTION + "\n" + dontDoMatch[1]);
  return content + GUARD_SECTION;
}

function createProjectChangelog(projectDir, projectName) {
  const changelogPath = path.join(projectDir, "CHANGELOG.md");
  if (isSymlink(changelogPath)) throw new Error(`Refusing to write ${changelogPath} — it is a symlink`);
  try {
    const today = new Date().toISOString().split("T")[0];
    const changelogContent = [
      "# Changelog",
      "",
      "All notable changes to this project are documented here.",
      "",
      `## [0.1.0] - ${today}`,
      "",
      "### Added",
      "- Initial changelog created by GSD-T",
      "",
    ].join("\n");
    fs.writeFileSync(changelogPath, changelogContent, { flag: "wx" });
    success(`${projectName} — created CHANGELOG.md`);
    return true;
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    return false;
  }
}

/**
 * Does this project have a built code graph, and does it have code worth one?
 *
 * [RULE] health-reports-missing-graph-never-assumes-built
 *
 * binvoice, 2026-08-11: a session reached for the graph, found nothing, and fell
 * back to grep — in an 827-file project. The tooling was installed and
 * propagated like everywhere else; the index had simply never been built.
 * Nothing builds it automatically, so a project has a graph only if someone once
 * ran `gsd-t graph index` there by hand.
 *
 * Nothing ever said so. `update-all` reported the project as current, because it
 * was — every file it ships was in place. The gap lived in state no propagation
 * step creates, and stayed invisible until a session hit it mid-task.
 *
 * Reported, never auto-built: indexing a large repo is slow, and doing it to 33
 * of them inside an update would be a surprise nobody asked for.
 */
function graphState(projectDir) {
  // Where the store lives is the resolver's answer alone. If it cannot answer,
  // this check HALTS the caller rather than reporting a project as healthy — a
  // silent "graph fine" here is exactly the blindness being fixed.
  const resolver = require("./gsd-t-graph-store-resolver.cjs");
  const storePath = resolver.resolveStorePath(projectDir);
  if (storePath && fs.existsSync(storePath)) return { missing: false, files: 0 };

  // A graph at the pre-M99 location (.gsd-t/graph.db) EXISTS — it is just where
  // the resolver no longer looks. Telling the user to build one would be wrong
  // twice over: the work is already done, and the real problem (a store the
  // tooling cannot find) would go unnamed.
  const legacyPath = resolver.resolveLegacyStorePath(projectDir);
  if (legacyPath && fs.existsSync(legacyPath)) return { missing: false, files: 0, legacy: true };

  let n = 0;
  const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", ".venv", "venv", "out", "coverage"]);
  const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);
  const walk = (dir, depth) => {
    if (depth > 6) return;
    if (n > 400) return; // enough to answer "is this a real codebase?"
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      // An unreadable subdirectory makes the count a floor, not a lie: the
      // result is only ever compared against a low threshold, and a miscount
      // downward can only omit a project from a report, never invent one.
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP.has(e.name)) continue;
        if (e.name.startsWith(".")) continue;
        walk(path.join(dir, e.name), depth + 1);
        continue;
      }
      if (EXT.has(path.extname(e.name))) n++;
    }
  };
  walk(projectDir, 0);

  // A project with almost no source has nothing for a graph to map; calling that
  // "missing" would be noise on every docs-only or config-only repo.
  return { missing: n >= 25, files: n };
}

/**
 * Move a graph that sits at the pre-M99 path into the one the tooling reads.
 *
 * The store already holds a full index — M99 changed where every tool LOOKS
 * without moving what was there, so the graph was present and unreachable. The
 * resolver's own migration does the move, checkpoints the write-ahead log, and
 * verifies the result is readable.
 */
function migrateLegacyGraph(projectDir) {
  try {
    const r = require("./gsd-t-graph-store-resolver.cjs").migrateGraphStore(projectDir);
    if (r && r.migrated) return { ok: true };
    return { ok: false, err: (r && r.reason) || "migration reported no result" };
  } catch (e) {
    return { ok: false, err: e.message || String(e) };
  }
}

/**
 * Build a project's code graph from scratch.
 *
 * Slow on a large repo, so the caller announces it before this runs. A failure
 * is returned, never swallowed: a project left without a graph must say so, so
 * the next session halts instead of quietly grepping.
 */
function buildGraph(projectDir) {
  try {
    const idx = path.join(__dirname, "gsd-t-graph-index.cjs");
    const r = require("child_process").spawnSync(process.execPath, [idx], {
      cwd: projectDir,
      encoding: "utf8",
      timeout: 15 * 60 * 1000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (r.error) return { ok: false, err: r.error.message };
    if (r.status !== 0) {
      const tail = String(r.stderr || r.stdout || "").trim().split("\n").slice(-2).join(" ");
      return { ok: false, err: `exit ${r.status}${tail ? ` — ${tail}` : ""}` };
    }
    // The indexer reporting success is not proof a store landed. Verify the file
    // the tooling will actually read.
    const storePath = require("./gsd-t-graph-store-resolver.cjs").resolveStorePath(projectDir);
    if (!fs.existsSync(storePath)) return { ok: false, err: "indexer reported success but no store was written" };
    return { ok: true };
  } catch (e) {
    return { ok: false, err: e.message || String(e) };
  }
}

async function checkProjectHealth(projects) {
  heading("Project Health");
  const playwrightMissing = [];
  const swaggerMissing = [];
  const graphMissing = [];
  const graphLegacy = [];
  const graphMigrated = [];
  const graphBuilt = [];
  const graphRepairFailed = [];
  const playwrightAutoInstalled = [];
  const playwrightInstallFailed = [];

  for (const projectDir of projects) {
    if (!fs.existsSync(projectDir)) continue;
    const name = path.basename(projectDir);
    if (!hasPlaywright(projectDir)) playwrightMissing.push(name);
    if (hasApi(projectDir) && !hasSwagger(projectDir)) swaggerMissing.push(name);
    const g = graphState(projectDir);
    if (g.missing) graphMissing.push({ name, dir: projectDir, files: g.files });
    if (g.legacy) graphLegacy.push({ name, dir: projectDir });
  }

  // [RULE] graph-missing-is-built-not-reported
  //
  // A missing graph is not a status to report — it is work to do. Every session
  // in a project without one silently falls back to grep, which reads a fraction
  // of what the graph knows and answers a different question. Reporting it and
  // moving on leaves that in place until a human notices, which for binvoice
  // (827 files) meant months.
  //
  // Two different faults, two different repairs:
  //
  //   · at the old path  — the store EXISTS and holds a full index. M99 changed
  //     where the tooling looks without moving what was there, so 18 projects
  //     were reading past a perfectly good graph. This is a file move plus a
  //     write-ahead-log checkpoint, and takes no time at all.
  //   · never built      — there is nothing to move. Indexing is genuinely slow
  //     on a large repo, so this is announced before it runs rather than
  //     appearing as an unexplained pause.
  //
  // A repair that fails is REPORTED and the project is left as it was. It is not
  // retried differently and never half-applied: a graph that came up short would
  // answer confidently with partial data, which is worse than not having one.
  for (const { name, dir } of graphLegacy) {
    const r = migrateLegacyGraph(dir);
    if (r.ok) graphMigrated.push(name);
    else graphRepairFailed.push({ name, what: "move", err: r.err });
  }
  for (const { name, dir, files } of graphMissing) {
    log(`  building code graph for ${name} (${files}+ source files) — first build, this takes a while`);
    const r = buildGraph(dir);
    if (r.ok) graphBuilt.push(name);
    else graphRepairFailed.push({ name, what: "build", err: r.err });
  }

  // M50 D1: auto-install Playwright for any UI project that's missing it.
  // Non-UI projects stay missing — they don't need Playwright.
  for (const projectDir of projects) {
    if (!fs.existsSync(projectDir)) continue;
    if (hasPlaywright(projectDir)) continue;
    if (!hasUI(projectDir)) continue;
    const name = path.basename(projectDir);
    try {
      const r = await installPlaywright(projectDir);
      if (r.ok) playwrightAutoInstalled.push(name);
      else playwrightInstallFailed.push({ name, err: r.err, hint: r.hint });
    } catch (e) {
      playwrightInstallFailed.push({ name, err: e.message || String(e) });
    }
  }

  if (graphMigrated.length > 0) {
    success(`Code graph moved to where the tooling reads it: ${graphMigrated.join(", ")}`);
  }
  if (graphBuilt.length > 0) {
    success(`Code graph built: ${graphBuilt.join(", ")}`);
  }
  if (graphRepairFailed.length > 0) {
    for (const f of graphRepairFailed) {
      warn(`  ${f.name} — graph ${f.what} FAILED: ${f.err}`);
    }
    info("Those projects have no usable graph. Fix before working in them — a session there cannot answer structural questions.");
  }

  if (playwrightMissing.length === 0 && swaggerMissing.length === 0) {
    success("All projects have Playwright and Swagger configured");
  } else {
    if (playwrightMissing.length > 0) {
      warn(`Playwright missing: ${playwrightMissing.join(", ")}`);
      if (playwrightAutoInstalled.length > 0) {
        success(`Auto-installed Playwright in: ${playwrightAutoInstalled.join(", ")}`);
      }
      if (playwrightInstallFailed.length > 0) {
        for (const f of playwrightInstallFailed) {
          warn(`  ${f.name} — install failed: ${f.err}`);
          if (f.hint) info(`  ${f.hint}`);
        }
      }
      const stillMissing = playwrightMissing.filter(
        (n) => !playwrightAutoInstalled.includes(n),
      );
      if (stillMissing.length > 0) {
        info(
          `Remaining (no UI signal — skipped): ${stillMissing.join(", ")}`,
        );
      }
    }
    if (swaggerMissing.length > 0) {
      warn(`Swagger/OpenAPI missing (API detected): ${swaggerMissing.join(", ")}`);
      info("Swagger will be auto-configured when an API endpoint is created or modified");
    }
  }
  return {
    playwrightMissing,
    swaggerMissing,
    graphMissing,
    graphLegacy,
    graphMigrated,
    graphBuilt,
    graphRepairFailed,
    playwrightAutoInstalled,
    playwrightInstallFailed,
  };
}

// ── Global Rule Sync (M27) ──────────────────────────────────────────────────

async function doUpdateAll() {
  // Step 1: Upgrade the globally-installed npm package FIRST. Without this,
  // `update-all` would only propagate command files — but the global `gsd-t`
  // binary itself could stay pinned to an older version (e.g., user stuck
  // on v3.11.11 while npm registry has v3.12.12). See CHANGELOG v3.12.13.
  // Guard with an env flag to prevent re-exec loops.
  if (!process.env.GSDT_POST_UPGRADE) {
    const upgraded = await upgradeGlobalBinary();
    if (upgraded.reexec) {
      reexecUpdateAll();
      return;
    }
  }

  await updateGlobalCommands();
  heading("Updating registered projects...");
  log("");

  const projects = getRegisteredProjects();
  if (projects.length === 0) { showNoProjectsHint(); return; }

  const counts = { updated: 0, skipped: 0, missing: 0, errors: 0 };
  const failed = [];
  for (const projectDir of projects) {
    try {
      updateSingleProject(projectDir, counts);
    } catch (e) {
      error(`${path.basename(projectDir)} (${projectDir}) — HALTED: ${e.message || e}`);
      counts.errors++;
      failed.push(projectDir);
    }
  }

  updateProjectWorktrees(projects.filter((p) => !failed.includes(p)), counts, failed);

  const {
    playwrightMissing,
    swaggerMissing,
    playwrightAutoInstalled,
    graphMissing,
  } = await checkProjectHealth(projects.filter((p) => !failed.includes(p))); // a halted project gets no further changes
  showUpdateAllSummary(
    projects.length,
    counts,
    playwrightMissing,
    swaggerMissing,
    playwrightAutoInstalled,
    graphMissing,
  );
  // Every project is attempted, then the run fails if any project halted.
  if (failed.length) {
    error(`update-all FAILED for ${failed.length} project(s):`);
    for (const p of failed) error(`    ${p}`);
    process.exitCode = 1;
  }
}

// Numeric dotted-version compare: negative when a < b, 0 when equal, positive when a > b.
// GSD-T versions are plain Major.Minor.Patch integers (patch always ≥ 10), so a
// segment-wise numeric compare is exact; no prerelease tags exist.
function versionCmp(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10));
  const pb = String(b).split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isNaN(pa[i]) ? 0 : pa[i];
    const y = Number.isNaN(pb[i]) ? 0 : pb[i];
    if (x !== y) return x - y;
  }
  return 0;
}

// Upgrade the globally-installed @tekyzinc/gsd-t to @latest. Returns
// { upgraded: bool, reexec: bool }.
// - reexec=true when the on-disk version after `npm install -g` is newer than
//   the currently-running PKG_VERSION, meaning we need to hand off to the
//   freshly-installed binary so the new code drives propagation.
// - reexec=false when already at latest.
// - a failed `npm install -g` THROWS: update-all halts before touching anything.
async function upgradeGlobalBinary() {
  heading("Upgrading global @tekyzinc/gsd-t to latest...");
  try {
    execFileSync("npm", ["install", "-g", "@tekyzinc/gsd-t@latest"], {
      stdio: "inherit",
      env: process.env,
    });
  } catch (e) {
    // HALT before touching ~/.claude or any project: continuing would push the
    // OLD package's files everywhere and report success.
    throw new Error(`Global npm install failed (${e.message || e}). Nothing was updated — fix npm (permissions, network) and re-run update-all.`);
  }

  // Read the freshly-installed global package's version. If it's newer than
  // the currently-running process, signal a re-exec.
  let newVersion = null;
  try {
    const prefix = execFileSync("npm", ["prefix", "-g"], { encoding: "utf8" }).trim();
    const globalPkgJson = path.join(prefix, "lib", "node_modules", "@tekyzinc", "gsd-t", "package.json");
    if (fs.existsSync(globalPkgJson)) {
      newVersion = JSON.parse(fs.readFileSync(globalPkgJson, "utf8")).version;
    }
  } catch {
    // Best-effort; fall through.
  }

  if (newVersion && versionCmp(newVersion, PKG_VERSION) < 0) {
    // v5.20.10 (2026-09-17): right after `npm publish`, npm's cached package
    // listing still named the PREVIOUS version as @latest, so this step
    // installed 5.19.11 over a running 5.20.10, reported it as an "upgrade",
    // handed off to the OLD binary, and that binary overwrote ~/.claude/commands
    // and every project with the old release. A downgrade is never an upgrade —
    // HALT and say how to fix it, never continue on a stale listing.
    error(`HALT: npm installed v${newVersion} over the running v${PKG_VERSION} — @latest resolved to an OLDER release.`);
    info("npm's cached package listing is stale. Run `npm cache clean --force`, wait until");
    info(`\`curl -sI https://registry.npmjs.org/@tekyzinc/gsd-t/-/gsd-t-${PKG_VERSION}.tgz\` returns 200, then re-run update-all.`);
    info(`Restore the current release first: npm install -g @tekyzinc/gsd-t@${PKG_VERSION}`);
    process.exit(1);
  }
  if (newVersion && newVersion !== PKG_VERSION) {
    success(`Global binary upgraded: v${PKG_VERSION} → v${newVersion}`);
    info("Handing off to the newly-installed binary for propagation...");
    return { upgraded: true, reexec: true };
  }
  success(`Global binary already at latest (v${PKG_VERSION})`);
  return { upgraded: true, reexec: false };
}

// Hand execution to the newly-installed global `gsd-t update-all`. Sets the
// GSDT_POST_UPGRADE env flag so the child does not recurse into another
// upgrade attempt.
function reexecUpdateAll() {
  const env = Object.assign({}, process.env, { GSDT_POST_UPGRADE: "1" });
  try {
    execFileSync("gsd-t", ["update-all"], { stdio: "inherit", env });
  } catch (e) {
    // Surface the child's exit code; execFileSync throws with .status on
    // non-zero exit. Fall through to re-throw so the caller exits cleanly.
    if (e && typeof e.status === "number") {
      process.exit(e.status);
    }
    throw e;
  }
}

async function updateGlobalCommands() {
  if (getInstalledVersion() !== PKG_VERSION) {
    await doInstall({ update: true });
  } else {
    heading(`GSD-T ${versionLink()}`);
    success("Global commands already up to date");
    refreshSameVersion();
  }
}

function showNoProjectsHint() {
  info("No projects registered");
  log("");
  log("  Projects are registered automatically when you run:");
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t init`);
  log("");
  log("  Or register an existing project manually:");
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t register`);
  log("");
}

// Worktrees (side copies on other branches) carry their own bin/ tools, so they
// need the same tool refresh and retired-tool sweep as the main checkout.
// CLAUDE.md and CHANGELOG.md are branch content — they arrive by merging main,
// never by editing a branch behind its owner's back. A worktree an interactive
// session is sitting in is skipped and named. If the process list can't be read,
// no worktree is touched and the run fails — "nobody is there" is never a guess.
function updateProjectWorktrees(projects, counts, failed, sessionDirs) {
  const detect = require("./gsd-t-worktree-detect.cjs");
  const all = [];
  for (const repo of projects) {
    if (!fs.existsSync(repo)) continue;
    let wts;
    try { wts = detect.linkedWorktrees(repo); } catch (e) {
      error(`${path.basename(repo)} — cannot list worktrees: ${e.message}`);
      failed.push(repo); counts.errors++; continue;
    }
    for (const w of wts) all.push({ repo, ...w });
  }
  if (all.length === 0) return;
  heading(`Updating ${all.length} worktree(s)...`);
  let sessions;
  try { sessions = sessionDirs || detect.interactiveClaudeDirs(); } catch (e) {
    error(`Worktrees NOT updated: ${e.message}`);
    for (const w of all) failed.push(w.path);
    counts.errors++;
    return;
  }
  counts.worktrees = { updated: 0, busy: 0 };
  for (const w of all) {
    const label = `${path.basename(w.repo)} [${w.branch}]`;
    if (detect.isOccupied(w.path, sessions)) {
      warn(`${label} — a session is open in ${w.path}; skipped (re-run update-all after it closes)`);
      counts.worktrees.busy++;
      continue;
    }
    try {
      copyBinToolsToProject(w.path, label);
      counts.worktrees.updated++;
    } catch (e) {
      error(`${label} (${w.path}) — HALTED: ${e.message || e}`);
      failed.push(w.path);
      counts.errors++;
    }
  }
}

function updateSingleProject(projectDir, counts) {
  const projectName = path.basename(projectDir);
  const claudeMd = path.join(projectDir, "CLAUDE.md");

  if (!fs.existsSync(projectDir)) {
    warn(`${projectName} — directory not found (${projectDir})`);
    counts.missing++;
    return;
  }
  if (!fs.existsSync(claudeMd)) {
    warn(`${projectName} — no CLAUDE.md found`);
    counts.skipped++;
    return;
  }
  // Preflight before ANY change in this project: no link on CLAUDE.md or
  // CHANGELOG.md here, and copyBinToolsToProject checks every bin/ path it
  // touches before it changes anything. Every write failure below throws, so
  // update-all marks this project failed and exits non-zero.
  haltOnSymlinks(projectDir, ["CLAUDE.md", "CHANGELOG.md"]);
  const binToolsCopied = copyBinToolsToProject(projectDir, projectName);
  const guardAdded = updateProjectClaudeMd(claudeMd, projectName);
  const changelogCreated = createProjectChangelog(projectDir, projectName);
  if (guardAdded || changelogCreated || binToolsCopied) {
    counts.updated++;
  } else {
    // The "no mutator ran" branch — distinct from "running latest GSD-T version".
    // Be explicit: this only means the 3 migration ops were no-ops. The slash
    // commands and global CLI come from the npm-global install, not from any
    // per-project artifact, so this status doesn't claim or imply a version.
    info(`${projectName} — no migrations needed (CLAUDE.md guard, CHANGELOG, bin tools all current)`);
    counts.skipped++;
  }
}

// Bin tools that should ship with every registered project. Listed here so adding
// a new tool only requires appending to this array. Use .cjs extension so they
// always run as CommonJS regardless of the project's package.json "type" field.
const PROJECT_BIN_TOOLS = [
  // M112 — measures a slice plan in LINES and splits what is too big. Called by
  // the scan workflow before any reviewing starts.
  "gsd-t-slice-budget.cjs",
  // M106 — Fallback detector. The PreToolUse guard prefers the project-local
  // copy. Missing here means every Write/Edit is DENIED (the guard halts rather
  // than allowing unchecked), so this entry is load-bearing.
  "gsd-t-fallback-detect.cjs",
  // M117 — Search classifier for the graph search guard. The guard prefers the
  // project-local copy and DENIES every search if it cannot load one.
  "gsd-t-code-search-classifier.cjs",
  // M108 — Install self-check. Every project carries its own copy so it can
  // verify and repair itself even when the global install is what broke.
  "gsd-t-install-check.cjs",
  // M110 — CLAUDE.md changelog tracking. Scaffolds and appends to the changelog file.
  "gsd-t-claude-md-changelog.cjs",
  // PseudoCode §1.1 flow-line STYLE gate (`gsd-t pseudocode-style`).
  "gsd-t-pseudocode-style.cjs",
  // M94/M95 — code-graph runtime. The wired consumers (scan, debug, the
  // intercept hooks) look for `bin/gsd-t-graph-query-cli.cjs` IN THE PROJECT.
  // Propagating the query CLI plus its require-chain (indexer, freshness,
  // edge-extract, SCIP upgrade + reader) is what makes a project graph-aware.
  // [[project_code_graph_universal_consumer]] [[feedback_graph_is_architectural_anchor]]
  "gsd-t-graph-query-cli.cjs", "gsd-t-graph-index.cjs", "gsd-t-graph-freshness.cjs",
  "gsd-t-graph-edge-extract.cjs", "gsd-t-graph-scip-upgrade.cjs", "gsd-t-scip-reader.cjs",
  // M99 — the query CLI `require`s the store resolver at load time; omitting it
  // left the CLI throwing on require (Binvoice architect run 2026-07-12).
  "gsd-t-graph-store-resolver.cjs",
  // Required by the indexer + freshness walker (project graph exclude list).
  "gsd-t-graph-exclude.cjs",
  // M96 — multi-location resolver for the store engine (better-sqlite3).
  "gsd-t-require-store.cjs",
  // Broken-Graph-Halts — the ONE shared availability classifier (ABSENT vs
  // BROKEN). The sandboxed scan + debug workflows invoke it via Bash.
  "gsd-t-graph-availability.cjs",
  // M102 — Environment Registry + the shared marker-block doc-writer it
  // `require`s at load. BOTH must ship or the registry throws.
  "gsd-t-doc-marker.cjs", "gsd-t-env-registry.cjs",
  // v5.20.10 — deterministic Tekyz estimate-sheet writer + read-back audit
  // (`gsd-t estimate-sheet`). In BOTH lists ([[project_global_bin_propagation_gap]]).
  "gsd-t-estimate-sheet.cjs",
];

// Files that older versions of this installer copied into project bin/ but
// are no longer part of PROJECT_BIN_TOOLS. On each update-all pass, any stray
// whose first 1,200 characters carry a shipped header is MOVED to
// <project>/.gsd-t/retired/<date>/bin/ — never deleted. User-owned files (no
// GSD-T header) are left alone.
//
// M68: the M61/M65 retirement removed the token-telemetry + unattended +
// headless-spawn + context-meter clusters from the package and from
// PROJECT_BIN_TOOLS, but never added them here — so update-all kept the current
// 7 tools fresh while leaving 11-17 dead .cjs lingering in every project's bin/.
// Adding them closes that gap so future retirements prune cleanly.
// Each retired tool maps to one or more VERBATIM header sentinels it actually
// shipped with (recovered from git history at the commit before each was deleted).
// A stray is swept only when its content contains the exact product header — proof
// it was SHIPPED by this installer, not merely that it mentions "gsd-t". This is the
// M68 red-team fix: the prior loose substring (`/gsd-t/` over 1200 chars) would have
// deleted a user's own same-named helper that happened to reference a `.gsd-t/` path.
// A user file can match only by reproducing a verbatim product header — implausible.
const DEPRECATED_BIN_STRAY_SIGNATURES = {
  "gsd-t.js": ["GSD-T CLI Installer"], // bespoke installer header
  // M61 D3 — token telemetry / context-runway cluster
  "gsd-t-token-capture.cjs": ["GSD-T Token Capture", "gsd-t-token-capture"],
  "token-telemetry.cjs": ["GSD-T Token Telemetry"],
  "token-budget.cjs": ["GSD-T Token Budget"],
  "token-optimizer.cjs": ["GSD-T Token Optimizer"],
  "runway-estimator.cjs": ["GSD-T Runway", "runway-estimator"],
  // Verbatim shipped comment header (no bare "GSD-T" — red-team HIGH-1: a bare token
  // would delete a user's same-named file that merely mentions GSD-T).
  "context-budget-audit.cjs": ["Context Budget Audit — measures the static context cost"],
  "context-meter-config.cjs": ["Context Meter config loader (M34)"],
  "context-meter-config.test.cjs": ["context-meter-config"],
  // M61 D2 — unattended relay + headless spawn cluster
  "gsd-t-unattended.cjs": ["GSD-T Unattended", "gsd-t-unattended"],
  "gsd-t-unattended-platform.cjs": ["GSD-T Unattended", "gsd-t-unattended"],
  "gsd-t-unattended-safety.cjs": ["GSD-T Unattended", "gsd-t-unattended"],
  "headless-auto-spawn.cjs": ["GSD-T Headless Auto-Spawn"],
  "headless-exit-codes.cjs": ["GSD-T headless exit-code contract"],
  "handoff-lock.cjs": ["GSD-T Handoff Lock — Fail-safe sentinel"],
  "unattended-watch-format.cjs": ["bin/unattended-watch-format.cjs", "unattended watch-tick activity block"],
  // M61 D1/D4 — misc retired
  "log-tail.cjs": ["Log Tail — print the last N lines"], // verbatim shipped comment
  "event-stream.cjs": ["bin/event-stream.cjs", "unattended supervisor watch-tick"],
  // v6 slim-down — every cut tool that update-all once copied into projects.
  ...RETIRED_V6.bin,
};
const DEPRECATED_BIN_STRAYS = Object.keys(DEPRECATED_BIN_STRAY_SIGNATURES);

// Self-protection identity check: is this project dir GSD-T's own source repo?
// Guards BOTH the bin-tool copy loop (copying the installed package's tools over
// the source repo reverts in-flight work — Red Team M86 r2 HIGH, fired live) and
// the deprecated-stray sweep (signature-matching bin/gsd-t.js — the installer
// itself — would delete the source file). Identity is by package.json name, NOT
// by path — when update-all runs from the globally-installed package, PKG_ROOT
// points to the global install and realpath comparison against the local source
// always fails.
function _isGsdTSourcePackage(projectDir) {
  try {
    const pkgPath = path.join(projectDir, "package.json");
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return !!pkg && pkg.name === "@tekyzinc/gsd-t";
  } catch {
    return false;
  }
}

function copyBinToolsToProject(projectDir, projectName) {
  // Self-protection for the COPY loop, not just the stray sweep below: the GSD-T
  // source repo is legitimately registered as a project during development, and
  // copying the installed package's bin tools over it REVERTS in-flight work —
  // fired live during M86 verify (Red Team r2 HIGH: a 4.4.11 update-all clobbered
  // the committed M86 policy module mid-run; every model-profile call then
  // hard-crashed until restored from HEAD). The source repo IS the canonical
  // origin of these tools; propagating into it is wrong in every case.
  if (_isGsdTSourcePackage(projectDir)) {
    info(`${projectName} — GSD-T source repo: bin propagation skipped (canonical origin)`);
    return false;
  }
  const projectBinDir = path.join(projectDir, "bin");
  const backupRel = path.join(".gsd-t", "retired", localDate());
  const strayRels = DEPRECATED_BIN_STRAYS.map((st) => `bin/${st}`);
  // Nothing in this project changes until no link sits on any path it touches
  // (a copy through a symlinked bin/ file would overwrite whatever it points at).
  haltOnSymlinks(projectDir, [
    ".gitignore", ...PROJECT_BIN_TOOLS.map((t) => `bin/${t}`),
    ...strayRels, ...strayRels.map((r) => path.join(backupRel, r)),
  ]);
  fs.mkdirSync(projectBinDir, { recursive: true });

  // Retired strays first: moved to the backup folder, never deleted. Throws on
  // any failure — update-all halts this project and exits non-zero.
  let moved = 0;
  for (const stray of DEPRECATED_BIN_STRAYS) {
    if (retireShippedFile(projectDir, `bin/${stray}`, DEPRECATED_BIN_STRAY_SIGNATURES[stray], backupRel) === "moved") moved++;
  }
  removeEmptyDir(path.join(projectBinDir, "cli-preflight-checks"));
  if (moved > 0) {
    info(`${projectName} — moved ${moved} retired bin file(s) to ${backupRel}/ (${retiredGitignoreNote(projectDir)})`);
  }

  let copied = 0;
  // Tools this pass could NOT deliver. Every one is reported, then the project
  // HALTS. A silent skip here is how binvoice ran for weeks with 20 of 38 tools
  // while every update reported success ([[project_global_bin_propagation_gap]]).
  const notDelivered = [];
  for (const tool of PROJECT_BIN_TOOLS) {
    const src = path.join(PKG_ROOT, "bin", tool);
    const dest = path.join(projectBinDir, tool);
    if (!fs.existsSync(src)) {
      // The package promises a tool it does not contain — a packaging defect
      // that affects EVERY project.
      notDelivered.push({ tool, why: "absent from the package being installed" });
      continue;
    }
    try {
      if (fs.existsSync(dest) && fs.readFileSync(src, "utf8") === fs.readFileSync(dest, "utf8")) continue;
      fs.copyFileSync(src, dest);
      fs.chmodSync(dest, 0o755);
      copied++;
    } catch (e) {
      notDelivered.push({ tool, why: e.message });
    }
  }
  if (notDelivered.length) {
    warn(`${projectName} — ${notDelivered.length} of ${PROJECT_BIN_TOOLS.length} tools were NOT delivered:`);
    for (const n of notDelivered) warn(`    ${n.tool} — ${n.why}`);
    throw new Error(`${notDelivered.length} bin tool(s) not delivered — fix the cause above and re-run update-all`);
  }
  if (copied > 0) info(`${projectName} — copied ${copied} bin tool(s)`);
  return copied > 0 || moved > 0;
}

// Is <project>/.gsd-t/retired/ kept out of git? Only a project that already
// gitignores .gsd-t working files gets the line added; any other .gitignore is
// left exactly as the user wrote it, and the summary says so.
function retiredGitignoreNote(projectDir) {
  const gi = path.join(projectDir, ".gitignore");
  if (!fs.existsSync(gi)) return "not gitignored — no .gitignore";
  const lines = fs.readFileSync(gi, "utf8").split(/\r?\n/).map((l) => l.trim().replace(/^\//, "").replace(/\/$/, ""));
  if (lines.some((l) => [".gsd-t", ".gsd-t/*", ".gsd-t/**", ".gsd-t/retired"].includes(l))) return "gitignored";
  if (!lines.some((l) => l.startsWith(".gsd-t/"))) {
    return "not gitignored — add .gsd-t/retired/ to .gitignore to keep it out of commits";
  }
  fs.appendFileSync(gi, "\n# GSD-T retired-file backups\n.gsd-t/retired/\n");
  return "added .gsd-t/retired/ to .gitignore";
}

function showUpdateAllSummary(
  total,
  counts,
  playwrightMissing,
  swaggerMissing,
  playwrightAutoInstalled,
  graphMissing,
) {
  log("");
  heading("Update All Complete");
  log(`  Projects registered: ${total}`);
  log(`  Updated:             ${counts.updated}`);
  log(`  Already current:     ${counts.skipped}`);
  if (counts.missing > 0) log(`  Not found:           ${counts.missing}`);
  if (counts.worktrees) log(`  Worktrees updated:   ${counts.worktrees.updated}${counts.worktrees.busy ? ` (${counts.worktrees.busy} skipped — session open)` : ""}`);
  if (counts.errors > 0) log(`  Errors:              ${counts.errors}`);
  if (playwrightMissing.length > 0) log(`  Missing Playwright:  ${playwrightMissing.length}`);
  if (Array.isArray(playwrightAutoInstalled) && playwrightAutoInstalled.length > 0) {
    log(`  Auto-installed Playwright in: ${playwrightAutoInstalled.length} project(s)`);
  }
  if (swaggerMissing.length > 0) log(`  Missing Swagger:     ${swaggerMissing.length}`);
  if (Array.isArray(graphMissing) && graphMissing.length > 0) {
    log(`  No code graph:       ${graphMissing.length}`);
  }
  log("");
}

function checkDoctorEnvironment() {
  let issues = 0;
  const nodeVersion = parseInt(process.version.slice(1));
  if (nodeVersion >= 16) {
    success(`Node.js ${process.version}`);
  } else {
    error(`Node.js ${process.version} — requires >= 16`);
    issues++;
  }
  try {
    const claudeVersion = execFileSync("claude", ["--version"], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    success(`Claude Code: ${claudeVersion}`);
  } catch {
    warn("Claude Code CLI not found in PATH");
    info("Install with: npm install -g @anthropic-ai/claude-code");
    issues++;
  }
  if (fs.existsSync(CLAUDE_DIR)) {
    success("~/.claude/ directory exists");
  } else {
    error("~/.claude/ directory not found");
    info("Run 'npx @tekyzinc/gsd-t install' to create it");
    issues++;
  }
  return issues;
}

function checkDoctorInstallation() {
  let issues = 0;
  const installed = getInstalledCommands();
  const expected = getCommandFiles();
  if (installed.length === expected.length) {
    success(`All ${expected.length} commands installed`);
  } else if (installed.length > 0) {
    warn(`${installed.length}/${expected.length} commands installed`);
    info(`Missing: ${expected.filter((f) => !installed.includes(f)).join(", ")}`);
    issues++;
  } else {
    error("No GSD-T commands installed");
    issues++;
  }
  issues += checkDoctorClaudeMd();
  issues += checkDoctorSettings();
  issues += checkDoctorEncoding(installed);
  issues += checkDoctorGlobalBin();
  return issues;
}

function checkDoctorGlobalBin() {
  let issues = 0;
  const missing = GLOBAL_BIN_TOOLS.filter((tool) => !fs.existsSync(path.join(GLOBAL_BIN_DIR, tool)));
  if (missing.length === 0) {
    success(`All ${GLOBAL_BIN_TOOLS.length} global bin tool${GLOBAL_BIN_TOOLS.length === 1 ? "" : "s"} installed (~/.claude/bin/)`);
  } else {
    warn(`Missing global bin tool${missing.length === 1 ? "" : "s"} in ~/.claude/bin/: ${missing.join(", ")}`);
    info("Fix: re-run `npx @tekyzinc/gsd-t install` (or `update`)");
    issues++;
  }
  return issues;
}

function checkDoctorClaudeMd() {
  if (!fs.existsSync(GLOBAL_CLAUDE_MD)) { error("No global CLAUDE.md"); return 1; }
  const content = fs.readFileSync(GLOBAL_CLAUDE_MD, "utf8");
  if (content.includes("GSD-T")) { success("CLAUDE.md contains GSD-T config"); return 0; }
  warn("CLAUDE.md exists but missing GSD-T section");
  return 1;
}

function checkDoctorSettings() {
  if (!fs.existsSync(SETTINGS_JSON)) { info("No settings.json (not required)"); return 0; }
  if (readSettingsJson() !== null) {
    success("settings.json is valid JSON");
    return 0;
  }
  error("settings.json has invalid JSON");
  return 1;
}

function checkDoctorEncoding(installed) {
  let bad = 0;
  for (const file of installed) {
    const content = fs.readFileSync(path.join(COMMANDS_DIR, file), "utf8");
    if (content.includes("\u00e2\u20ac") || content.includes("\u00c3")) bad++;
  }
  if (bad > 0) {
    error(`${bad} command files have encoding issues (corrupted characters)`);
    info("Run 'npx @tekyzinc/gsd-t update' to replace with clean versions");
    return 1;
  }
  if (installed.length > 0) success("No encoding issues in command files");
  return 0;
}

async function checkDoctorProject(opts) {
  let issues = 0;
  const cwd = process.cwd();
  const installFlag = !!(opts && opts.installPlaywright);
  if (hasPlaywright(cwd)) {
    success("Playwright configured");
  } else if (installFlag && hasUI(cwd)) {
    info("Installing Playwright (chromium)…");
    try {
      const r = await installPlaywright(cwd);
      if (r.ok) {
        success("Playwright installed (playwright.config.ts + e2e/ scaffold)");
      } else {
        error(`Playwright install failed: ${r.err}`);
        if (r.hint) info(r.hint);
        issues++;
      }
    } catch (e) {
      error(`Playwright install errored: ${e.message || e}`);
      issues++;
    }
  } else if (installFlag && !hasUI(cwd)) {
    info("Playwright skipped — no UI signal in this project");
  } else {
    warn("Playwright not configured in this project");
    info("Re-run with --install-playwright, or run any GSD-T testing command (auto-install)");
    issues++;
  }
  if (hasApi(cwd)) {
    if (hasSwagger(cwd)) {
      success("Swagger/OpenAPI configured");
    } else {
      warn("API framework detected but no Swagger/OpenAPI spec found");
      info("Will be auto-configured when an API endpoint is created or modified");
      issues++;
    }
  } else {
    info("No API framework detected (Swagger check skipped)");
  }
  return issues;
}

// M95: report SCIP indexer presence. SCIP gives the code graph compiler-accurate
// call-edge resolution (who-calls / test-impl / blast-radius across imports).
// Absence is a WARN (graph still works at tree-sitter floor), not a hard error.
function checkDoctorScip() {
  let issues = 0;
  heading("SCIP Indexers (Compiler-Accurate Code Graph)");
  const indexers = [
    { bin: "scip-typescript", langs: "TS/JS", pkg: "@sourcegraph/scip-typescript" },
    { bin: "scip-python", langs: "Python", pkg: "@sourcegraph/scip-python" },
  ];
  for (const { bin, langs, pkg } of indexers) {
    try {
      const ver = execFileSync(bin, ["--version"], {
        encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      success(`${bin} ${ver} (${langs} compiler-accurate)`);
    } catch {
      warn(`${bin} not installed — ${langs} edges fall back to tree-sitter floor (approximate)`);
      info(`Run: npm install -g ${pkg}  (or reinstall GSD-T)`);
      issues++;
    }
  }
  return issues;
}

async function doDoctor(opts) {
  heading("GSD-T Doctor");
  log("");
  let issues = 0;
  issues += checkDoctorEnvironment();
  issues += checkDoctorInstallation();
  issues += await checkDoctorProject(opts);
  issues += checkDoctorScip();
  issues += checkDoctorConfigDirs();
  log("");
  if (issues === 0) {
    log(`${GREEN}${BOLD}  All checks passed!${RESET}`);
  } else {
    log(`${YELLOW}${BOLD}  ${issues} issue${issues > 1 ? "s" : ""} found${RESET}`);
  }
  log("");
  if (issues > 0) process.exit(1);
}

function doLinkConfigDir(target) {
  const cfg = require("./gsd-t-config-dir.cjs");
  if (!target) {
    error("Usage: gsd-t link-config-dir <dir>   (e.g. ~/.claude-hilo)");
    process.exit(64);
  }
  const dir = target.replace(/^~(?=$|\/)/, os.homedir());
  heading(`Link ${dir} → ${CLAUDE_DIR}`);
  const r = cfg.linkConfigDir(CLAUDE_DIR, dir);
  if (!r.ok) {
    if (r.error !== "conflicts") error(r.error);
    for (const row of r.rows.filter((x) => x.state === "conflict")) {
      error(`${row.dst}: ${row.reason}`);
    }
    info("Nothing was changed. Move or remove the items above, then run this again.");
    process.exit(1);
  }
  for (const row of r.rows) {
    if (row.state === "create") success(`${row.name} linked`);
    if (row.state === "ok") info(`${row.name} already linked`);
    if (row.state === "absent") info(`${row.name} — none in ~/.claude, skipped`);
  }
  info("Login files (.claude.json, credentials) stay separate — run `claude` with CLAUDE_CONFIG_DIR set and /login.");
}

function checkDoctorConfigDirs() {
  const cfg = require("./gsd-t-config-dir.cjs");
  const dirs = cfg.readRegistry(CLAUDE_DIR);
  if (dirs.length === 0) return 0;
  const problems = cfg.checkConfigDirs(CLAUDE_DIR);
  if (problems.length === 0) {
    success(`Linked config dirs OK: ${dirs.join(", ")}`);
    return 0;
  }
  for (const p of problems) warn(`${p.dir}: ${p.problem} — run: gsd-t link-config-dir ${p.dir}`);
  return problems.length;
}

function doRegister() {
  const projectDir = process.cwd();
  const gsdtDir = path.join(projectDir, ".gsd-t");

  if (!fs.existsSync(gsdtDir)) {
    error("Not a GSD-T project (no .gsd-t/ directory found)");
    info("Run 'npx @tekyzinc/gsd-t init' to initialize this project first");
    return;
  }

  if (registerProject(projectDir)) {
    success(`Registered: ${projectDir}`);
  } else {
    info("Already registered");
  }

  // Show all registered projects
  const projects = getRegisteredProjects();
  log("");
  heading("Registered Projects");
  for (const p of projects) {
    const exists = fs.existsSync(p);
    if (exists) {
      log(`  ${GREEN}✓${RESET} ${p}`);
    } else {
      log(`  ${RED}✗${RESET} ${p} ${DIM}(not found)${RESET}`);
    }
  }
  log("");
}

function isNewerVersion(latest, current) {
  const l = latest.split(".").map(Number);
  const c = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

function checkForUpdates(command) {
  const skipCommands = ["install", "update", "update-all", "--version", "-v"];
  if (skipCommands.includes(command)) return;

  const cached = readUpdateCache();

  if (cached && cached.latest && validateVersion(cached.latest) && isNewerVersion(cached.latest, PKG_VERSION)) {
    showUpdateNotice(cached.latest);
  }

  if (!cached) {
    fetchVersionSync();
  } else if ((Date.now() - cached.timestamp) > 3600000) {
    refreshVersionAsync();
  }
}

function readSettingsJson() {
  if (!fs.existsSync(SETTINGS_JSON)) return null;
  try { return JSON.parse(fs.readFileSync(SETTINGS_JSON, "utf8")); }
  catch { return null; }
}

function readUpdateCache() {
  try {
    if (fs.existsSync(UPDATE_CHECK_FILE)) {
      return JSON.parse(fs.readFileSync(UPDATE_CHECK_FILE, "utf8"));
    }
  } catch { /* ignore corrupt cache */ }
  return null;
}

function fetchVersionSync() {
  try {
    const fetchScriptPath = path.join(__dirname, "..", "scripts", "gsd-t-fetch-version.js");
    const result = execFileSync(
      process.execPath, [fetchScriptPath],
      { timeout: 8000, encoding: "utf8" }
    ).trim();
    if (result && validateVersion(result) && !isSymlink(UPDATE_CHECK_FILE)) {
      fs.writeFileSync(UPDATE_CHECK_FILE, JSON.stringify({ latest: result, timestamp: Date.now() }));
      if (isNewerVersion(result, PKG_VERSION)) showUpdateNotice(result);
    }
  } catch { /* timeout or network error — skip */ }
}

function refreshVersionAsync() {
  const updateScript = path.join(__dirname, "..", "scripts", "npm-update-check.js");
  const child = cpSpawn(process.execPath, [updateScript, UPDATE_CHECK_FILE], {
    detached: true, stdio: "ignore",
  });
  child.unref();
}

function showUpdateNotice(latest) {
  // Human-facing banner MUST go to stderr — writing it to stdout corrupts the JSON
  // output of machine commands (e.g. `graph body`, `graph --output json`), breaking
  // any JSON.parse consumer. stderr keeps the banner visible without polluting stdout.
  const e = (msg) => console.error(msg);
  e("");
  e(`  ${YELLOW}╭──────────────────────────────────────────────╮${RESET}`);
  e(`  ${YELLOW}│${RESET}  Update available: ${DIM}${PKG_VERSION}${RESET} → ${GREEN}${latest}${RESET}            ${YELLOW}│${RESET}`);
  e(`  ${YELLOW}│${RESET}  Run: ${CYAN}npm update -g @tekyzinc/gsd-t${RESET}         ${YELLOW}│${RESET}`);
  e(`  ${YELLOW}│${RESET}  Then: ${CYAN}gsd-t update-all${RESET}                     ${YELLOW}│${RESET}`);
  e(`  ${YELLOW}│${RESET}  Changelog: ${CYAN}gsd-t changelog${RESET}                  ${YELLOW}│${RESET}`);
  e(`  ${YELLOW}╰──────────────────────────────────────────────╯${RESET}`);
}

function doChangelog() {
  try {
    if (process.platform === "win32") {
      // SAFETY: CHANGELOG_URL is a hardcoded constant (line 43). If it ever becomes
      // dynamic/user-provided, this cmd.exe call would need URL validation to prevent injection.
      execFileSync("cmd", ["/c", "start", "", CHANGELOG_URL], { stdio: "ignore" });
    } else {
      const openCmd = process.platform === "darwin" ? "open" : "xdg-open";
      execFileSync(openCmd, [CHANGELOG_URL], { stdio: "ignore" });
    }
    success(`Opened changelog in browser`);
  } catch {
    // Fallback: print the URL
    log(`\n  ${CHANGELOG_URL}\n`);
  }
}

// ─── Graph ──────────────────────────────────────────────────────────────────
// M94 Fix-1: the M20–M21 dead engine (graph-indexer / graph-store / graph-query)
// is REMOVED. All entity-graph verbs (status / who-imports / who-calls / blast-radius
// / index / query) now delegate to the M94 D5 query CLI
// (bin/gsd-t-graph-query-cli.cjs). [RULE] graph-status-live
// [RULE] graph-rewire-no-dangling-export
// (v6: the M44 task-DAG verbs `graph --output` / `graph tasks` were cut with execute.)

/**
 * Delegate a verb to the D5 graph query CLI.
 * Returns the JSON envelope (already parsed) or { ok: false, reason: '...' }.
 * Prints human-readable output when interactive=true (the default).
 *
 * [RULE] graph-status-live — NEVER hits the dead M20–M21 "No graph index found" path.
 */
// Broken-graph seam (delegation edge): classify a spawnSync result into a graph
// envelope. STOPS discarding result.status/result.stderr. A crash (missing require →
// exit≠0, empty stdout, MODULE_NOT_FOUND on stderr) means the CLI itself is BROKEN —
// surface it so the consumer HALTs, never fabricate a collapsed "graph-unavailable"
// that hides the crash. Extracted (pure) so it is unit-testable with a simulated result.
// [RULE] crash-classified-not-fabricated
function _classifyGraphSpawnResult(result) {
  const stdout = (result.stdout || "").trim();
  // Trust a valid JSON envelope on stdout — the producer already classified the reason
  // (graph-absent / graph-broken / a real answer). Parse FIRST so a non-zero exit that
  // still emitted an envelope (fail() exits 1) keeps the producer's granular reason.
  if (stdout) {
    try {
      return JSON.parse(stdout);
    } catch {
      // stdout present but not JSON → the CLI printed garbage → BROKEN.
      return { ok: false, reason: "graph-broken", detail: stdout };
    }
  }
  // No valid envelope on stdout. If the process crashed (spawn error, or non-zero
  // exit with empty stdout), the CLI is BROKEN.
  if (result.error) {
    return { ok: false, reason: "graph-broken", detail: result.error.message };
  }
  // exit != 0 with no envelope, OR exit 0 with empty stdout (shouldn't happen) →
  // treat as BROKEN defensively.
  return { ok: false, reason: "graph-broken", detail: result.stderr || `exit ${result.status}, no output` };
}

function _graphQueryCli(verbAndArgs) {
  const { spawnSync } = require("child_process");
  const cliPath = require("path").join(__dirname, "gsd-t-graph-query-cli.cjs");
  const result = spawnSync(process.execPath, [cliPath].concat(verbAndArgs), {
    encoding: "utf8",
    cwd: process.cwd(),
    timeout: 30000,
  });
  return _classifyGraphSpawnResult(result);
}

/**
 * gsd-t graph index
 * Builds the codebase entity graph via D3 (bin/gsd-t-graph-index.cjs).
 * [RULE] graph-rewire-no-dangling-export
 */
function doGraphIndex() {
  heading("GSD-T Graph — Index");
  const { spawnSync } = require("child_process");
  const idxPath = require("path").join(__dirname, "gsd-t-graph-index.cjs");
  // A large repo's SCIP run legitimately takes many minutes (hilo-figma-atos: >5).
  // The old 5-minute cap killed the indexer mid-build and — because a killed child
  // has status null — reported nothing and exited 0, leaving a half-built graph
  // that looked complete. A kill or spawn error is a failure, said out loud.
  const result = spawnSync(process.execPath, [idxPath, "build", "--repo", process.cwd()], {
    encoding: "utf8",
    cwd: process.cwd(),
    stdio: ["ignore", "inherit", "inherit"],
    timeout: 30 * 60 * 1000,
  });
  if (result.error || result.signal || result.status !== 0) {
    const why = result.error ? result.error.message
      : result.signal ? `killed by ${result.signal} (timeout 30 min?) — the graph is INCOMPLETE`
      : `exit ${result.status}`;
    error(`Graph index build failed: ${why}`);
    process.exitCode = 1;
  }
}

/**
 * gsd-t graph status
 * Queries live index state via D5 CLI.
 * [RULE] graph-status-live — NEVER returns "No graph index found" from the dead path.
 * [RULE] graph-rewire-no-dangling-export
 */
function doGraphStatus() {
  heading("GSD-T Graph — Status");
  const envelope = _graphQueryCli(["status"]);
  if (!envelope.ok) {
    warn(`Graph index unavailable: ${envelope.reason || "graph-unavailable"}`);
    info("Run: gsd-t graph index");
    return;
  }
  // envelope from D5 CLI: { ok, verb:"status", indexed, storeSize, fileCount, tier, ... }
  if (envelope.indexed === false) {
    warn("No graph index found.");
    info("Run: gsd-t graph index");
    return;
  }
  success(`Graph index: ${envelope.fileCount || 0} files`);
  // Per-tier file counts (what the build reported), then the worst tier present.
  const tiers = envelope.tiers ? Object.entries(envelope.tiers).sort((a, b) => b[1] - a[1]) : [];
  if (tiers.length) info(`Tiers: ${tiers.map(([t, n]) => `${t} ${n}`).join(" · ")}`);
  if (envelope.tier) info(`Lowest tier present: ${envelope.tier}`);
  if (envelope.tableCount || envelope.enumCount) info(`Database tables: ${envelope.tableCount}, enums: ${envelope.enumCount} (gsd-t graph table <name> · who-uses <name>)`);
  // [RULE] scip-missing-file-detected-never-silent — files the SCIP indexer never
  // produced a document for: their call edges stay unresolved, so who-calls is blind there.
  const miss = envelope.scipMissing;
  if (miss && miss.count > 0) {
    warn(`${miss.count} file(s) not in SCIP (call edges unresolved): ${miss.files.join(", ")}${miss.count > miss.files.length ? ", …" : ""}`);
    info("Re-run: gsd-t graph index  (then check again)");
  }
  const ex = envelope.excludes;
  if (ex && ex.patterns && ex.patterns.length) {
    info(`Excluded by ${ex.source}: ${ex.patterns.join(", ")}`);
  } else {
    info("Excludes: none (add folders to .gsd-t/graph-exclude.json — { \"exclude\": [\"design/\"] })");
  }
  if (ex && ex.defaults && ex.defaults.length) info(`Excluded by default: ${ex.defaults.join(", ")}`);
  // Suggestions only — a folder is never dropped from the graph without the user listing it.
  const sug = envelope.excludeSuggestions;
  if (sug && sug.length) {
    info(`Folders that may not be the app (${sug[0].reason}) — add to .gsd-t/graph-exclude.json if so:`);
    for (const x of sug.slice(0, 15)) log(`      ${x.folder}  (${x.files} files)`);
  }
  if (envelope.storeSize !== undefined) info(`Store size: ${envelope.storeSize} bytes`);
  if (envelope.detail) log(JSON.stringify(envelope, null, 2));
}

/**
 * gsd-t graph query <verb> [args...]
 * Delegates the verb directly to the D5 CLI.
 * [RULE] graph-rewire-no-dangling-export
 */
function doGraphQuery(args) {
  const verb = args[0];
  if (!verb) {
    error("Usage: gsd-t graph query <verb> [target]");
    info("Verbs: status, who-imports, who-calls, body, blast-radius, who-uses [--writes|--reads], table, cluster, dead-code, orphan, dangling, test-impl");
    return;
  }
  const envelope = _graphQueryCli([verb].concat(args.slice(1)));
  log(JSON.stringify(envelope, null, 2));
}

function doGraph(args) {
  const sub = args[0] || "status";
  switch (sub) {
    case "index":         doGraphIndex(); break;
    case "status":        doGraphStatus(); break;
    case "query":         doGraphQuery(args.slice(1)); break;
    case "who-imports":   { const e = _graphQueryCli(["who-imports", args[1] || ""]); log(JSON.stringify(e, null, 2)); break; }
    case "who-calls":     { const e = _graphQueryCli(["who-calls",   args[1] || ""]); log(JSON.stringify(e, null, 2)); break; }
    case "blast-radius":  { const e = _graphQueryCli(["blast-radius", args[1] || ""]); log(JSON.stringify(e, null, 2)); break; }
    case "body":          { const e = _graphQueryCli(["body",         args[1] || ""]); log(JSON.stringify(e, null, 2)); break; }
    // Database tables (Drizzle pgTable/mysqlTable/sqliteTable + pgEnum).
    case "who-uses":      { const e = _graphQueryCli(["who-uses"].concat(args.slice(1))); log(JSON.stringify(e, null, 2)); break; }
    case "table":         { const e = _graphQueryCli(["table",        args[1] || ""]); log(JSON.stringify(e, null, 2)); break; }
    case "metrics":       { // M99 D3-T2: append-only arm — rollup the telemetry ledger
      const _metricsRollup = require("./gsd-t-graph-metrics-rollup.cjs");
      const _metricsJson = (args[1] === "--json" || args[2] === "--json");
      _metricsRollup.printRollup(undefined, { json: _metricsJson });
      break;
    }
    case "wiring-log": {
      // M99 D2: thin CLI shim for persisting a kind:'wiring' ledger line from a
      // Workflow agent() Bash call (avoids embedding require() in workflow strings,
      // which trips the M71 sandbox lint).
      //
      // Usage A (explicit mode):
      //   gsd-t graph wiring-log --consumer <consumer> --mode <mode> [--project <dir>]
      //
      // Usage B (auto mode — WIRED if store exists, else fallback-announced):
      //   gsd-t graph wiring-log --consumer <consumer> --auto [--project <dir>]
      //
      // Exits 0 always (fail-open).
      const _projIdx = args.indexOf("--project");
      const _projDir = _projIdx !== -1 ? args[_projIdx + 1] : process.cwd();
      const _consumerIdx = args.indexOf("--consumer");
      const _consumerArg = _consumerIdx !== -1 ? args[_consumerIdx + 1] : "cli";
      const _modeIdx = args.indexOf("--mode");
      const _modeArg = _modeIdx !== -1 ? args[_modeIdx + 1] : null;
      const _autoFlag = args.includes("--auto");
      try {
        const _resolver = require("./gsd-t-graph-store-resolver.cjs");
        let _mode;
        if (_autoFlag) {
          const _sp = _resolver.resolveStorePath(_projDir);
          _mode = (_sp && fs.existsSync(_sp)) ? "WIRED" : "fallback-announced";
        } else if (_modeArg) {
          _mode = _modeArg;
        } else {
          process.stdout.write("ledger-write-skipped: need --mode or --auto\n");
          process.exit(0);
        }
        const _record = { kind: "wiring", ts: new Date().toISOString(), consumer: _consumerArg, graphWiringMode: _mode };
        _resolver.append_ledger_line(_record, _projDir);
        process.stdout.write(`ok: ${_mode}\n`);
      } catch (_e) {
        process.stdout.write(`ledger-write-skipped: ${_e && _e.message ? _e.message : String(_e)}\n`);
      }
      process.exit(0);
    }
    default:
      error(`Unknown graph subcommand: ${sub}`);
      info("Usage: gsd-t graph [index|status|query|who-imports|who-calls|blast-radius|body|who-uses|table|metrics|wiring-log]");
  }
}

function showHelp() {
  log(`\n${BOLD}GSD-T${RESET} — Guardrails for Claude Code\n`);
  log(`${BOLD}Usage:${RESET}  npx @tekyzinc/gsd-t ${CYAN}<command>${RESET} [options]\n`);
  log(`${BOLD}Commands:${RESET}`);
  log(`  ${CYAN}install${RESET}             Install slash commands + global CLAUDE.md + hooks`);
  log(`  ${CYAN}update${RESET}              Update global commands + CLAUDE.md`);
  log(`  ${CYAN}update-all${RESET}          Update globally + every registered project`);
  log(`  ${CYAN}init${RESET} [name]         Scaffold a GSD-T project (auto-registers)`);
  log(`  ${CYAN}register${RESET}            Register current directory as a GSD-T project`);
  log(`  ${CYAN}status${RESET}              Show installation status + check for updates`);
  log(`  ${CYAN}uninstall${RESET}           Remove GSD-T commands and hooks (keeps project files)`);
  log(`  ${CYAN}doctor${RESET}              Diagnose common issues (--install-playwright)`);
  log(`  ${CYAN}changelog${RESET}           Open changelog in the browser`);
  log(`  ${CYAN}graph${RESET}               Code graph (index, status, who-calls, who-imports, blast-radius, body, …)`);
  log(`  ${CYAN}pick-worktree${RESET}       Print the worktree a session should start in`);
  log(`  ${CYAN}link-config-dir${RESET}     Share this setup with another Claude config dir (second account)`);
  log(`  ${CYAN}setup-playwright${RESET}    Install Playwright into a project`);
  log(`  ${CYAN}workflow-path${RESET}       Print the absolute path of a workflow (scan, debug)`);
  log(`  ${CYAN}estimate-sheet${RESET}      Read / write / audit a Tekyz estimate sheet`);
  log(`  ${CYAN}help${RESET}                Show this help\n`);
  log(`${BOLD}Examples:${RESET}`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t install`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t init my-saas-app`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t update\n`);
  log(`${BOLD}After installing, use in Claude Code:${RESET}`);
  log(`  ${DIM}>${RESET} /gsd-t-init-scan-setup`);
  log(`  ${DIM}>${RESET} /gsd-t-debug "the failing test"\n`);
  log(`${DIM}Docs: https://github.com/Tekyz-Inc/get-stuff-done-teams${RESET}\n`);
}

// ─── Exports (for testing) ───────────────────────────────────────────────────

module.exports = {
  graphState,
  validateProjectName,
  applyTokens,
  normalizeEol,
  validateVersion,
  validateProjectPath,
  isSymlink,
  hasSymlinkInPath,
  isNewerVersion,
  ensureDir,
  copyFile,
  copyBinToolsToProject,
  updateProjectWorktrees,
  PROJECT_BIN_TOOLS,
  _classifyGraphSpawnResult,
  hasPlaywright,
  hasSwagger,
  hasApi,
  readProjectDeps,
  readPyContent,
  getCommandFiles,
  getGsdtCommands,
  getUtilityCommands,
  getInstalledCommands,
  getInstalledVersion,
  getRegisteredProjects,
  updateSingleProject,
  updateGlobalCommands,
  showNoProjectsHint,
  showUpdateAllSummary,
  showStatusVersion,
  showStatusCommands,
  showStatusConfig,
  showStatusTeams,
  showStatusProject,
  showInstallSummary,
  showInitTree,
  writeTemplateFile,
  insertGuardSection,
  removeInstalledCommands,
  removeVersionFile,
  checkDoctorClaudeMd,
  checkDoctorSettings,
  checkDoctorEncoding,
  doDoctor,
  mergeGsdtSection,
  appendGsdtToClaudeMd,
  readSettingsJson,
  readUpdateCache,
  fetchVersionSync,
  refreshVersionAsync,
  doGraph,
  doGraphIndex,
  doGraphStatus,
  doGraphQuery,
  PKG_VERSION,
  PKG_ROOT,
  PKG_COMMANDS,
  removeRetiredHooks,
  removeHooksByMarkers,
  retireV6Files,
  preflightGlobal,
  claudeMdProblem,
  RETIRED_V6,
  _gsdtScriptRefs: gsdtScriptRefs,
  _normalizeHookCommand: normalizeHookCommand,
  _danglingGsdtRefs: danglingGsdtRefs,
  _retireShippedFile: retireShippedFile,
  GSDT_HOOK_MARKERS,
  configureDateGuardHook,
  configureChangelogCheckHook,
  configureChangelogPostEditHook,
  // M97/M98: intercept hook installers
  configureGraphInterceptHook,
  configureReadInterceptHook,
  removeInterceptHooks,
};

// ─── Main ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  switch (command) {
    case "install":
      doInstall().catch((e) => { error(e.message || String(e)); process.exit(1); });
      break;
    case "update":
      doUpdate().catch((e) => { error(e.message || String(e)); process.exit(1); });
      break;
    case "update-all":
      doUpdateAll().catch((e) => { error(e.message || String(e)); process.exit(1); });
      break;
    case "init": {
      let initProject = null;
      for (let i = 1; i < args.length; i++) {
        if (!args[i].startsWith('-')) initProject = args[i];
      }
      doInit(initProject).catch((e) => { error(e.message || String(e)); process.exit(1); });
      break;
    }
    // M111 — prints the worktree this session should start in, or nothing when
    // the current directory is already right. The shell calls it before
    // launching claude, because only the launching shell can set where a
    // session starts.
    case "pick-worktree": {
      const picker = path.join(PKG_ROOT, "bin", "gsd-t-pick-worktree.cjs");
      try {
        // Pass the flags through — --suggest, --name and --list live on the picker.
        execFileSync(process.execPath, [picker, ...args.slice(1)], { stdio: "inherit" });
      } catch (e) {
        // The picker prints its own reason on stderr and exits non-zero when it
        // cannot decide. Carry that exit code out so the calling shell leaves
        // the user where they are instead of moving them to a guess.
        process.exit(typeof e.status === "number" ? e.status : 1);
      }
      break;
    }
    // Share this GSD-T setup with a second Claude Code config dir
    // (CLAUDE_CONFIG_DIR — one login per dir, e.g. a team account).
    case "link-config-dir":
      doLinkConfigDir(args[1]);
      break;
    case "register":
      doRegister();
      break;
    case "status":
      doStatus();
      break;
    case "uninstall":
      doUninstall();
      break;
    case "doctor": {
      const doctorOpts = { installPlaywright: false };
      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--install-playwright") doctorOpts.installPlaywright = true;
      }
      doDoctor(doctorOpts).catch((e) => { error(e.message || String(e)); process.exit(1); });
      break;
    }
    case "setup-playwright": {
      // Single-project explicit installer. Thin wrapper around installPlaywright().
      const targetDir = args[1] && !args[1].startsWith("-") ? path.resolve(args[1]) : process.cwd();
      heading(`Setup Playwright: ${targetDir}`);
      log("");
      if (!fs.existsSync(targetDir)) {
        error(`Path not found: ${targetDir}`);
        process.exit(1);
      }
      if (hasPlaywright(targetDir)) {
        info("Playwright already configured (playwright.config.* present)");
        process.exit(0);
      }
      if (!hasUI(targetDir)) {
        warn("No UI signal detected. Installing anyway? Re-run with --force to install regardless.");
        const force = args.includes("--force");
        if (!force) {
          info("Skipping. Use --force to install Playwright in a non-UI project.");
          process.exit(0);
        }
      }
      info("Installing Playwright (chromium)…");
      installPlaywright(targetDir)
        .then((r) => {
          if (r.ok) {
            success("Playwright installed (playwright.config.ts + e2e/ scaffold)");
            process.exit(0);
          } else {
            error(`Playwright install failed: ${r.err}`);
            if (r.hint) info(r.hint);
            process.exit(1);
          }
        })
        .catch((e) => { error(e.message || String(e)); process.exit(1); });
      break;
    }
    case "changelog":
      doChangelog();
      break;
    case "graph":
      doGraph(args.slice(1));
      break;
    case "workflow-path": {
      // M69 — print the ABSOLUTE path to a GSD-T workflow script, resolved from
      // this CLI's own install root. Command files shell out to this instead of
      // hard-coding a relative `templates/workflows/...` scriptPath, which only
      // resolves when CWD is the GSD-T source repo — from any consumer project
      // the relative path is unresolvable and `Workflow({scriptPath})` silently
      // fails, forcing a hand-driven fallback (the HiloAviation scan incident).
      //
      // Usage: gsd-t workflow-path <name>   (name with or without the
      //        `gsd-t-` prefix / `.workflow.js` suffix). Exit 0 + path on stdout;
      //        exit 4 + error on stderr if the workflow is unknown.
      const raw = (args[1] || "").trim();
      if (!raw) {
        process.stderr.write("usage: gsd-t workflow-path <name>\n");
        process.exit(64);
      }
      const wfDir = path.join(PKG_ROOT, "templates", "workflows");
      // Normalize: strip a leading "gsd-t-" and a trailing ".workflow.js"/".js",
      // then rebuild the canonical filename.
      const stem = raw
        .replace(/\.workflow\.js$/, "")
        .replace(/\.js$/, "")
        .replace(/^gsd-t-/, "");
      const file = path.join(wfDir, `gsd-t-${stem}.workflow.js`);
      if (!fs.existsSync(file)) {
        const avail = fs.existsSync(wfDir)
          ? fs.readdirSync(wfDir)
              .filter((f) => f.endsWith(".workflow.js"))
              .map((f) => f.replace(/^gsd-t-/, "").replace(/\.workflow\.js$/, ""))
              .join(", ")
          : "(workflows dir missing)";
        process.stderr.write(`gsd-t workflow-path: unknown workflow "${raw}". Available: ${avail}\n`);
        process.exit(4);
      }
      process.stdout.write(file + "\n");
      process.exit(0);
    }
    case "estimate-sheet": {
      // v5.20.10 — deterministic Tekyz estimate-sheet writer + audit
      // (`gsd-t estimate-sheet read|plan-check|write|audit --sheet <id>`).
      const { spawnSync } = require("child_process");
      const js = path.join(__dirname, "gsd-t-estimate-sheet.cjs");
      const res = spawnSync(process.execPath, [js, ...args.slice(1)], { stdio: "inherit" });
      process.exit(res.status == null ? 1 : res.status);
    }
    case "graph-availability": {
      // `gsd-t graph-availability classify <reason> [detail]` — the ONE shared
      // graph-failure classifier (ABSENT → build, BROKEN → halt). The scan and
      // debug workflows use this when a project has no local bin copy.
      const { spawnSync } = require("child_process");
      const js = path.join(__dirname, "gsd-t-graph-availability.cjs");
      if (!fs.existsSync(js)) {
        error(`gsd-t-graph-availability.cjs not found at ${js} — reinstall GSD-T`);
        process.exit(1);
      }
      const res = spawnSync(process.execPath, [js, ...args.slice(1)], { stdio: "inherit" });
      process.exit(res.status == null ? 1 : res.status);
    }
    case "install-check": {
      // M108 — check this project's tools against the installed package, and
      // restore anything missing. `--check` reports without changing anything;
      // `--report` reads the shared log of every repair across all projects.
      const { spawnSync } = require("child_process");
      const js = path.join(__dirname, "gsd-t-install-check.cjs");
      if (!require("node:fs").existsSync(js)) {
        error(`gsd-t-install-check.cjs not found at ${js} — reinstall GSD-T`);
        process.exit(1);
      }
      const res = spawnSync(process.execPath, [js, ...args.slice(1)], { stdio: "inherit" });
      process.exit(res.status == null ? 1 : res.status);
    }

    case "slice-budget": {
      // M112 — `gsd-t slice-budget --project <dir> --slices <json>` measures a
      // slice plan in LINES and splits what is over the ceiling. Deterministic:
      // no agent re-slices, so nothing can be lost or invented.
      const { spawnSync } = require("child_process");
      const js = path.join(__dirname, "gsd-t-slice-budget.cjs");
      if (!require("node:fs").existsSync(js)) {
        error(`gsd-t-slice-budget.cjs not found at ${js} — reinstall GSD-T`);
        process.exit(1);
      }
      const res = spawnSync(process.execPath, [js, ...args.slice(1)], {
        stdio: "inherit",
      });
      process.exit(res.status == null ? 1 : res.status);
    }

    case "pseudocode-style": {
      // Contract v1.2.0 §1.1 — `gsd-t pseudocode-style (--doc <f> | --dir <d>)` thin
      // dispatcher to the PseudoCode flow-line STYLE gate. Sibling of `guard-map`:
      // that one gates what a doc CONTAINS, this one gates how it READS.
      const { spawnSync } = require("child_process");
      const js = path.join(__dirname, "gsd-t-pseudocode-style.cjs");
      if (!require("node:fs").existsSync(js)) {
        error(`gsd-t-pseudocode-style.cjs not found at ${js} — reinstall GSD-T (contract v1.2.0 §1.1)`);
        process.exit(1);
      }
      const res = spawnSync(process.execPath, [js, ...args.slice(1)], {
        stdio: "inherit",
      });
      process.exit(res.status == null ? 1 : res.status);
    }
    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;
    case "--version":
    case "-v":
      log(PKG_VERSION);
      break;
    default:
      error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }

  checkForUpdates(command);
}
