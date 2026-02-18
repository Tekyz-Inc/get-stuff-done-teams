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

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const COMMANDS_DIR = path.join(CLAUDE_DIR, "commands");
const SCRIPTS_DIR = path.join(CLAUDE_DIR, "scripts");
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
const PKG_EXAMPLES = path.join(PKG_ROOT, "examples");

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

function ensureDir(dir) {
  if (hasSymlinkInPath(dir)) {
    warn(`Refusing to use path with symlinked component: ${dir}`);
    return false;
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  }
  if (isSymlink(dir)) {
    warn(`Refusing to use symlinked directory: ${dir}`);
    return false;
  }
  return false;
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

function copyFile(src, dest, label) {
  if (isSymlink(dest)) {
    warn(`Skipping symlink target: ${dest}`);
    return;
  }
  try {
    fs.copyFileSync(src, dest);
    success(label || path.basename(dest));
  } catch (e) {
    error(`Failed to copy ${label || path.basename(dest)}: ${e.message}`);
  }
}

function hasPlaywright(projectDir) {
  const configs = ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs"];
  return configs.some((f) => fs.existsSync(path.join(projectDir, f)));
}

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
  if (isSymlink(VERSION_FILE)) {
    warn("Skipping version write — target is a symlink");
    return;
  }
  try {
    fs.writeFileSync(VERSION_FILE, PKG_VERSION);
  } catch (e) {
    error(`Failed to save version file: ${e.message}`);
  }
}

function getRegisteredProjects() {
  try {
    const content = fs.readFileSync(PROJECTS_FILE, "utf8").trim();
    if (!content) return [];
    const lines = content.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
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

// ─── Heartbeat ──────────────────────────────────────────────────────────────

const HEARTBEAT_SCRIPT = "gsd-t-heartbeat.js";
const HEARTBEAT_HOOKS = [
  "SessionStart", "PostToolUse", "SubagentStart", "SubagentStop",
  "TaskCompleted", "TeammateIdle", "Notification", "Stop", "SessionEnd"
];

function installHeartbeat() {
  ensureDir(SCRIPTS_DIR);

  // Copy heartbeat script
  const src = path.join(PKG_SCRIPTS, HEARTBEAT_SCRIPT);
  const dest = path.join(SCRIPTS_DIR, HEARTBEAT_SCRIPT);

  if (!fs.existsSync(src)) {
    warn("Heartbeat script not found in package — skipping");
    return;
  }

  const srcContent = fs.readFileSync(src, "utf8");
  const destContent = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : "";

  if (normalizeEol(srcContent) !== normalizeEol(destContent)) {
    copyFile(src, dest, HEARTBEAT_SCRIPT);
  } else {
    info("Heartbeat script unchanged");
  }

  // Configure hooks in settings.json
  const hooksAdded = configureHeartbeatHooks(dest);
  if (hooksAdded > 0) {
    success(`${hooksAdded} heartbeat hooks configured in settings.json`);
  } else {
    info("Heartbeat hooks already configured");
  }
}

function configureHeartbeatHooks(scriptPath) {
  const parsed = readSettingsJson();
  if (parsed === null && fs.existsSync(SETTINGS_JSON)) {
    warn("settings.json has invalid JSON — cannot configure hooks");
    return 0;
  }
  const settings = parsed || {};

  if (!settings.hooks) settings.hooks = {};
  const cmd = `node "${scriptPath.replace(/\\/g, "\\\\")}"`;
  let added = 0;

  for (const event of HEARTBEAT_HOOKS) {
    if (addHeartbeatHook(settings.hooks, event, cmd)) added++;
  }

  if (added > 0 && !isSymlink(SETTINGS_JSON)) {
    fs.writeFileSync(SETTINGS_JSON, JSON.stringify(settings, null, 2));
  } else if (added > 0) {
    warn("Skipping settings.json write — target is a symlink");
  }
  return added;
}

function addHeartbeatHook(hooks, event, cmd) {
  if (!hooks[event]) hooks[event] = [];
  const hasHeartbeat = hooks[event].some((entry) =>
    entry.hooks && entry.hooks.some((h) => h.command && h.command.includes(HEARTBEAT_SCRIPT))
  );
  if (hasHeartbeat) return false;
  hooks[event].push({ matcher: "", hooks: [{ type: "command", command: cmd, async: true }] });
  return true;
}

// ─── Commands ────────────────────────────────────────────────────────────────

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
  return { gsdtCommands, utilityCommands };
}

function installGlobalClaudeMd(isUpdate) {
  heading("Global CLAUDE.md");
  const globalSrc = path.join(PKG_TEMPLATES, "CLAUDE-global.md");

  if (!fs.existsSync(GLOBAL_CLAUDE_MD)) {
    copyFile(globalSrc, GLOBAL_CLAUDE_MD, "CLAUDE.md installed → ~/.claude/CLAUDE.md");
    return;
  }

  const existing = fs.readFileSync(GLOBAL_CLAUDE_MD, "utf8");
  if (existing.includes("GSD-T: Contract-Driven Development")) {
    updateExistingGlobalClaudeMd(globalSrc, existing, isUpdate);
  } else {
    appendGsdtToClaudeMd(globalSrc);
  }
}

function updateExistingGlobalClaudeMd(globalSrc, existing, isUpdate) {
  if (!isUpdate) {
    info("CLAUDE.md already contains GSD-T config — skipping");
    info("Run 'gsd-t update' to overwrite with latest version");
    return;
  }
  const template = fs.readFileSync(globalSrc, "utf8");
  if (normalizeEol(existing) === normalizeEol(template)) {
    copyFile(globalSrc, GLOBAL_CLAUDE_MD, "CLAUDE.md updated (no customizations detected)");
    return;
  }
  const backupPath = GLOBAL_CLAUDE_MD + ".backup-" + Date.now();
  if (!isSymlink(backupPath)) fs.copyFileSync(GLOBAL_CLAUDE_MD, backupPath);
  else warn("Skipping backup — target is a symlink");
  copyFile(globalSrc, GLOBAL_CLAUDE_MD, "CLAUDE.md updated");
  warn(`Previous version backed up to ${path.basename(backupPath)}`);
  info("Review the backup if you had custom additions to merge back in.");
}

function appendGsdtToClaudeMd(globalSrc) {
  if (isSymlink(GLOBAL_CLAUDE_MD)) { warn("Skipping CLAUDE.md append — target is a symlink"); return; }
  const gsdtContent = fs.readFileSync(globalSrc, "utf8");
  const separator = "\n\n# ─── GSD-T Section (added by installer) ───\n\n";
  fs.appendFileSync(GLOBAL_CLAUDE_MD, separator + gsdtContent);
  success("GSD-T config appended to existing CLAUDE.md");
  info("Your existing content was preserved.");
}

function doInstall(opts = {}) {
  const isUpdate = opts.update || false;
  heading(`${isUpdate ? "Updating" : "Installing"} GSD-T ${versionLink()}`);
  log("");

  if (ensureDir(COMMANDS_DIR)) success("Created ~/.claude/commands/");

  const { gsdtCommands, utilityCommands } = installCommands(isUpdate);
  installGlobalClaudeMd(isUpdate);

  heading("Heartbeat (Real-time Events)");
  installHeartbeat();
  saveInstalledVersion();

  showInstallSummary(gsdtCommands.length, utilityCommands.length);
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
  log(`  ${DIM}>${RESET} /user:gsd-t-init my-project`);
  log(`  ${DIM}>${RESET} /user:gsd-t-milestone "First Feature"`);
  log(`  ${DIM}>${RESET} /user:gsd-t-wave`);
  log("");
  log(`${BOLD}Other commands:${RESET}`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t status      ${DIM}— check installation${RESET}`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t update      ${DIM}— update to latest${RESET}`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t init myapp   ${DIM}— scaffold a new project${RESET}`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t doctor       ${DIM}— diagnose issues${RESET}`);
  log("");
}

function doUpdate() {
  const installedVersion = getInstalledVersion();

  if (installedVersion === PKG_VERSION) {
    heading(`GSD-T ${versionLink()}`);
    info("Already up to date!");
    log("");
    log("  To force a reinstall, run:");
    log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t install`);
    log("");
    return;
  }

  if (installedVersion) {
    heading(`Updating GSD-T: ${versionLink(installedVersion)} → ${versionLink()}`);
  }

  doInstall({ update: true });
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
        info("Run /user:gsd-t-init inside Claude Code to add GSD-T section");
      }
    } else { throw e; }
  }
}

function initDocs(projectDir, projectName, today) {
  const docsDir = path.join(projectDir, "docs");
  ensureDir(docsDir);

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

  ensureDir(contractsDir);
  ensureDir(domainsDir);

  for (const dir of [contractsDir, domainsDir]) {
    const gitkeep = path.join(dir, ".gitkeep");
    if (isSymlink(gitkeep)) continue;
    try { fs.writeFileSync(gitkeep, "", { flag: "wx" }); }
    catch (e) { if (e.code !== "EEXIST") throw e; }
  }

  writeTemplateFile("progress.md", path.join(gsdtDir, "progress.md"), ".gsd-t/progress.md", projectName, today);
  writeTemplateFile("backlog.md", path.join(gsdtDir, "backlog.md"), ".gsd-t/backlog.md", projectName, today);
  writeTemplateFile("backlog-settings.md", path.join(gsdtDir, "backlog-settings.md"), ".gsd-t/backlog-settings.md", projectName, today);
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

function doInit(projectName) {
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

  if (registerProject(projectDir)) success("Registered in ~/.claude/.gsd-t-projects");

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
  log("      ├── backlog.md");
  log("      ├── backlog-settings.md");
  log("      ├── contracts/");
  log("      └── domains/");
  log("");
  log(`${BOLD}Next steps:${RESET}`);
  log(`  1. Edit CLAUDE.md — add project overview and tech stack`);
  log(`  2. Start Claude Code: ${DIM}claude${RESET}`);
  log(`  3. Run: ${DIM}/user:gsd-t-populate${RESET}  ${DIM}(if existing codebase)${RESET}`);
  log(`     Or:  ${DIM}/user:gsd-t-project${RESET}   ${DIM}(if new project)${RESET}`);
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
    info("Run /user:gsd-t-init inside Claude Code to set up");
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
  if (isSymlink(claudeMd)) { warn(`${projectName} — skipping CLAUDE.md write (symlink)`); return false; }
  try {
    fs.writeFileSync(claudeMd, newContent);
    success(`${projectName} — added Destructive Action Guard`);
    return true;
  } catch (e) {
    error(`${projectName} — failed to update CLAUDE.md: ${e.message}`);
    return false;
  }
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
  if (isSymlink(changelogPath)) return false;
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

function checkProjectHealth(projects) {
  heading("Project Health");
  const playwrightMissing = [];
  const swaggerMissing = [];

  for (const projectDir of projects) {
    if (!fs.existsSync(projectDir)) continue;
    const name = path.basename(projectDir);
    if (!hasPlaywright(projectDir)) playwrightMissing.push(name);
    if (hasApi(projectDir) && !hasSwagger(projectDir)) swaggerMissing.push(name);
  }

  if (playwrightMissing.length === 0 && swaggerMissing.length === 0) {
    success("All projects have Playwright and Swagger configured");
  } else {
    if (playwrightMissing.length > 0) {
      warn(`Playwright missing: ${playwrightMissing.join(", ")}`);
      info("Playwright will be auto-installed when you run a GSD-T command in each project");
    }
    if (swaggerMissing.length > 0) {
      warn(`Swagger/OpenAPI missing (API detected): ${swaggerMissing.join(", ")}`);
      info("Swagger will be auto-configured when an API endpoint is created or modified");
    }
  }
  return { playwrightMissing, swaggerMissing };
}

function doUpdateAll() {
  updateGlobalCommands();
  heading("Updating registered projects...");
  log("");

  const projects = getRegisteredProjects();
  if (projects.length === 0) { showNoProjectsHint(); return; }

  const counts = { updated: 0, skipped: 0, missing: 0, errors: 0 };
  for (const projectDir of projects) {
    try {
      updateSingleProject(projectDir, counts);
    } catch (e) {
      warn(`${path.basename(projectDir)} — error: ${e.message || e}`);
      counts.errors++;
    }
  }

  const { playwrightMissing, swaggerMissing } = checkProjectHealth(projects);
  showUpdateAllSummary(projects.length, counts, playwrightMissing, swaggerMissing);
}

function updateGlobalCommands() {
  if (getInstalledVersion() !== PKG_VERSION) {
    doInstall({ update: true });
  } else {
    heading(`GSD-T ${versionLink()}`);
    success("Global commands already up to date");
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
  const guardAdded = updateProjectClaudeMd(claudeMd, projectName);
  const changelogCreated = createProjectChangelog(projectDir, projectName);
  if (guardAdded || changelogCreated) {
    counts.updated++;
  } else {
    info(`${projectName} — already up to date`);
    counts.skipped++;
  }
}

function showUpdateAllSummary(total, counts, playwrightMissing, swaggerMissing) {
  log("");
  heading("Update All Complete");
  log(`  Projects registered: ${total}`);
  log(`  Updated:             ${counts.updated}`);
  log(`  Already current:     ${counts.skipped}`);
  if (counts.missing > 0) log(`  Not found:           ${counts.missing}`);
  if (counts.errors > 0) log(`  Errors:              ${counts.errors}`);
  if (playwrightMissing.length > 0) log(`  Missing Playwright:  ${playwrightMissing.length}`);
  if (swaggerMissing.length > 0) log(`  Missing Swagger:     ${swaggerMissing.length}`);
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

function checkDoctorProject() {
  let issues = 0;
  const cwd = process.cwd();
  if (hasPlaywright(cwd)) {
    success("Playwright configured");
  } else {
    warn("Playwright not configured in this project");
    info("Will be auto-installed when you run a GSD-T testing command");
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

function doDoctor() {
  heading("GSD-T Doctor");
  log("");
  let issues = 0;
  issues += checkDoctorEnvironment();
  issues += checkDoctorInstallation();
  issues += checkDoctorProject();
  log("");
  if (issues === 0) {
    log(`${GREEN}${BOLD}  All checks passed!${RESET}`);
  } else {
    log(`${YELLOW}${BOLD}  ${issues} issue${issues > 1 ? "s" : ""} found${RESET}`);
  }
  log("");
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

  const isStale = !cached || (Date.now() - cached.timestamp) > 3600000;
  if (!cached && isStale) {
    fetchVersionSync();
  } else if (isStale) {
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
  log("");
  log(`  ${YELLOW}╭──────────────────────────────────────────────╮${RESET}`);
  log(`  ${YELLOW}│${RESET}  Update available: ${DIM}${PKG_VERSION}${RESET} → ${GREEN}${latest}${RESET}            ${YELLOW}│${RESET}`);
  log(`  ${YELLOW}│${RESET}  Run: ${CYAN}npm update -g @tekyzinc/gsd-t${RESET}         ${YELLOW}│${RESET}`);
  log(`  ${YELLOW}│${RESET}  Then: ${CYAN}gsd-t update-all${RESET}                     ${YELLOW}│${RESET}`);
  log(`  ${YELLOW}│${RESET}  Changelog: ${CYAN}gsd-t changelog${RESET}                  ${YELLOW}│${RESET}`);
  log(`  ${YELLOW}╰──────────────────────────────────────────────╯${RESET}`);
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

function showHelp() {
  log(`\n${BOLD}GSD-T${RESET} — Contract-Driven Development for Claude Code\n`);
  log(`${BOLD}Usage:${RESET}  npx @tekyzinc/gsd-t ${CYAN}<command>${RESET} [options]\n`);
  log(`${BOLD}Commands:${RESET}`);
  log(`  ${CYAN}install${RESET}        Install slash commands + global CLAUDE.md`);
  log(`  ${CYAN}update${RESET}         Update global commands + CLAUDE.md`);
  log(`  ${CYAN}update-all${RESET}     Update globally + all registered project CLAUDE.md files`);
  log(`  ${CYAN}init${RESET} [name]    Scaffold GSD-T project (auto-registers)`);
  log(`  ${CYAN}register${RESET}       Register current directory as a GSD-T project`);
  log(`  ${CYAN}status${RESET}         Show installation status + check for updates`);
  log(`  ${CYAN}uninstall${RESET}      Remove GSD-T commands (keeps project files)`);
  log(`  ${CYAN}doctor${RESET}         Diagnose common issues`);
  log(`  ${CYAN}changelog${RESET}      Open changelog in the browser`);
  log(`  ${CYAN}help${RESET}           Show this help\n`);
  log(`${BOLD}Examples:${RESET}`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t install`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t init my-saas-app`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t update\n`);
  log(`${BOLD}After installing, use in Claude Code:${RESET}`);
  log(`  ${DIM}>${RESET} /user:gsd-t-project "Build a task management app"`);
  log(`  ${DIM}>${RESET} /user:gsd-t-wave\n`);
  log(`${DIM}Docs: https://github.com/Tekyz-Inc/get-stuff-done-teams${RESET}\n`);
}

// ─── Exports (for testing) ───────────────────────────────────────────────────

module.exports = {
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
  addHeartbeatHook,
  removeInstalledCommands,
  removeVersionFile,
  checkDoctorClaudeMd,
  checkDoctorSettings,
  checkDoctorEncoding,
  updateExistingGlobalClaudeMd,
  appendGsdtToClaudeMd,
  readSettingsJson,
  readUpdateCache,
  fetchVersionSync,
  refreshVersionAsync,
  PKG_VERSION,
  PKG_ROOT,
  PKG_COMMANDS,
};

// ─── Main ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  switch (command) {
    case "install":
      doInstall();
      break;
    case "update":
      doUpdate();
      break;
    case "update-all":
      doUpdateAll();
      break;
    case "init":
      doInit(args[1]);
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
    case "doctor":
      doDoctor();
      break;
    case "changelog":
      doChangelog();
      break;
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
