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
const debugLedger = require(path.join(__dirname, "debug-ledger.js"));

// ─── Configuration ───────────────────────────────────────────────────────────

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const COMMANDS_DIR = path.join(CLAUDE_DIR, "commands");
const SCRIPTS_DIR = path.join(CLAUDE_DIR, "scripts");
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

// ─── Update Check Hook ──────────────────────────────────────────────────────

const UPDATE_CHECK_SCRIPT = "gsd-t-update-check.js";

function installUpdateCheck() {
  ensureDir(SCRIPTS_DIR);

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

function configureUpdateCheckHook(scriptPath) {
  let settings = {};
  if (fs.existsSync(SETTINGS_JSON)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_JSON, "utf8"));
    } catch {
      warn("settings.json has invalid JSON — cannot configure update check hook");
      return;
    }
  }

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

  const cmd = `node "${scriptPath.replace(/\\/g, "\\\\")}"`;

  // Check if update check hook already exists
  const hasUpdateCheck = settings.hooks.SessionStart.some((entry) =>
    entry.hooks && entry.hooks.some((h) => h.command && h.command.includes(UPDATE_CHECK_SCRIPT))
  );

  if (hasUpdateCheck) {
    // Fix matcher if it's not empty string (bug fix — "startup" doesn't match all sessions)
    let fixed = false;
    for (const entry of settings.hooks.SessionStart) {
      if (entry.hooks && entry.hooks.some((h) => h.command && h.command.includes(UPDATE_CHECK_SCRIPT))) {
        if (entry.matcher !== "") {
          entry.matcher = "";
          fixed = true;
        }
      }
    }
    if (fixed) {
      if (!isSymlink(SETTINGS_JSON)) {
        fs.writeFileSync(SETTINGS_JSON, JSON.stringify(settings, null, 2));
      }
      success("Fixed update check hook matcher");
    } else {
      info("Update check hook already configured");
    }
  } else {
    // Add new hook — synchronous (not async) so output is available before Claude responds
    settings.hooks.SessionStart.unshift({
      matcher: "",
      hooks: [{ type: "command", command: cmd }],
    });
    if (!isSymlink(SETTINGS_JSON)) {
      fs.writeFileSync(SETTINGS_JSON, JSON.stringify(settings, null, 2));
    }
    success("Update check hook configured");
  }
}

// ─── Auto-Route Hook ─────────────────────────────────────────────────────────

const AUTO_ROUTE_SCRIPT = "gsd-t-auto-route.js";

function installAutoRoute() {
  ensureDir(SCRIPTS_DIR);

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

function configureAutoRouteHook(scriptPath) {
  const parsed = readSettingsJson();
  if (parsed === null && fs.existsSync(SETTINGS_JSON)) {
    warn("settings.json has invalid JSON — cannot configure auto-route hook");
    return;
  }
  const settings = parsed || {};
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];

  const cmd = `node "${scriptPath.replace(/\\/g, "\\\\")}"`;
  const hasAutoRoute = settings.hooks.UserPromptSubmit.some((entry) =>
    entry.hooks && entry.hooks.some((h) => h.command && h.command.includes(AUTO_ROUTE_SCRIPT))
  );

  if (hasAutoRoute) {
    info("Auto-route hook already configured");
    return;
  }

  settings.hooks.UserPromptSubmit.push({
    matcher: "",
    hooks: [{ type: "command", command: cmd }],
  });

  if (!isSymlink(SETTINGS_JSON)) {
    fs.writeFileSync(SETTINGS_JSON, JSON.stringify(settings, null, 2));
    success("Auto-route hook configured in settings.json");
  } else {
    warn("Skipping settings.json write — target is a symlink");
  }
}

// ─── Figma MCP ──────────────────────────────────────────────────────────────

const FIGMA_MCP_URL = "https://mcp.figma.com/mcp";
const CLAUDE_JSON = path.join(os.homedir(), ".claude.json");

function configureFigmaMcp() {
  // Check ~/.claude.json (where `claude mcp add` stores servers)
  try {
    if (fs.existsSync(CLAUDE_JSON)) {
      const cj = JSON.parse(fs.readFileSync(CLAUDE_JSON, "utf8"));
      if (cj.mcpServers && cj.mcpServers.figma) {
        info("Figma MCP already configured");
        return;
      }
    }
  } catch { /* ignore parse errors */ }

  // Also check settings.json (legacy location)
  const settings = readSettingsJson() || {};
  if (settings.mcpServers && settings.mcpServers.figma) {
    info("Figma MCP already configured (settings.json)");
    return;
  }

  // Add via `claude mcp add` for proper OAuth registration
  try {
    execFileSync("claude", ["mcp", "add", "--transport", "http", "-s", "user", "figma", FIGMA_MCP_URL], {
      encoding: "utf8",
      timeout: 10000,
    });
    success("Figma MCP configured (remote: " + FIGMA_MCP_URL + ")");
    info("Authenticate with Figma on next session start (browser OAuth)");
  } catch {
    warn("Could not auto-configure Figma MCP — add manually:");
    log(`  ${DIM}$${RESET} claude mcp add --transport http -s user figma ${FIGMA_MCP_URL}`);
  }
}

// ─── Utility Scripts ─────────────────────────────────────────────────────────

const UTILITY_SCRIPTS = ["gsd-t-tools.js", "gsd-t-statusline.js", "gsd-t-event-writer.js", "gsd-t-dashboard-server.js", "gsd-t-dashboard.html"];

function installUtilityScripts() {
  ensureDir(SCRIPTS_DIR);
  for (const script of UTILITY_SCRIPTS) {
    const src = path.join(PKG_SCRIPTS, script);
    const dest = path.join(SCRIPTS_DIR, script);
    if (!fs.existsSync(src)) continue;
    const srcContent = fs.readFileSync(src, "utf8");
    const destContent = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : "";
    if (normalizeEol(srcContent) !== normalizeEol(destContent)) {
      copyFile(src, dest, script);
    } else {
      info(`${script} unchanged`);
    }
  }
}

// ─── CGC (CodeGraphContext) ──────────────────────────────────────────────────

function installCgc() {
  // Check Python availability
  let pythonCmd = null;
  for (const cmd of ["python3", "python"]) {
    try {
      const ver = execFileSync(cmd, ["--version"], {
        encoding: "utf8", timeout: 3000,
        stdio: ["pipe", "pipe", "pipe"]
      }).trim();
      const major = parseInt((ver.match(/(\d+)\.\d+/) || [])[1]);
      if (major >= 3) { pythonCmd = cmd; break; }
    } catch { /* try next */ }
  }

  if (!pythonCmd) {
    warn("Python 3 not found — CGC graph engine skipped");
    info("Install Python 3.10+ to enable deep code graph analysis");
    return;
  }

  // Check if CGC is already installed
  let cgcInstalled = false;
  try {
    execFileSync("cgc", ["--version"], {
      encoding: "utf8", timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"]
    });
    cgcInstalled = true;
  } catch { /* not installed */ }

  if (!cgcInstalled) {
    info("Installing CodeGraphContext...");
    try {
      execFileSync(pythonCmd, ["-m", "pip", "install", "codegraphcontext"], {
        encoding: "utf8", timeout: 120000,
        stdio: ["pipe", "pipe", "pipe"]
      });
      success("CodeGraphContext installed");
    } catch (e) {
      warn("CGC install failed — graph engine will use native-only mode");
      info("To install manually: pip install codegraphcontext");
      return;
    }
  } else {
    // Check for update
    try {
      const pipOut = execFileSync(pythonCmd, [
        "-m", "pip", "install", "--upgrade", "--dry-run", "codegraphcontext"
      ], {
        encoding: "utf8", timeout: 30000,
        stdio: ["pipe", "pipe", "pipe"]
      });
      if (pipOut.includes("Would install")) {
        info("Updating CodeGraphContext...");
        execFileSync(pythonCmd, [
          "-m", "pip", "install", "--upgrade", "codegraphcontext"
        ], {
          encoding: "utf8", timeout: 120000,
          stdio: ["pipe", "pipe", "pipe"]
        });
        success("CodeGraphContext updated");
      } else {
        info("CodeGraphContext up to date");
      }
    } catch {
      info("CodeGraphContext already installed (update check skipped)");
    }
  }

  // Check Neo4j availability via Docker
  let neo4jReady = false;
  try {
    const dInfo = execFileSync("docker", ["inspect", "gsd-t-neo4j"], {
      encoding: "utf8", timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const container = JSON.parse(dInfo);
    if (container[0] && container[0].State &&
        container[0].State.Running) {
      neo4jReady = true;
      info("Neo4j container running");
    } else {
      // Container exists but stopped — start it
      execFileSync("docker", ["start", "gsd-t-neo4j"], {
        encoding: "utf8", timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"]
      });
      neo4jReady = true;
      success("Neo4j container started");
    }
  } catch {
    // No container — check if Docker is available
    try {
      execFileSync("docker", ["info"], {
        encoding: "utf8", timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"]
      });
      // Docker available — create Neo4j container
      info("Creating Neo4j container for graph engine...");
      try {
        execFileSync("docker", [
          "run", "-d", "--name", "gsd-t-neo4j",
          "-p", "7474:7474", "-p", "7687:7687",
          "-e", "NEO4J_AUTH=neo4j/gsdt-graph-2026",
          "--restart", "unless-stopped",
          "neo4j:5-community"
        ], {
          encoding: "utf8", timeout: 120000,
          stdio: ["pipe", "pipe", "pipe"]
        });
        neo4jReady = true;
        success("Neo4j container created (port 7474/7687)");
      } catch (e) {
        warn("Failed to create Neo4j container");
        info("Run manually: docker run -d --name gsd-t-neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/gsdt-graph-2026 neo4j:5-community");
      }
    } catch {
      warn("Docker not available — CGC will use native-only graph mode");
      info("Install Docker Desktop to enable CGC deep analysis");
    }
  }

  // Configure CGC to use Neo4j
  if (neo4jReady) {
    const cgcConfigDir = path.join(os.homedir(), ".codegraphcontext");
    const cgcConfigFile = path.join(cgcConfigDir, ".env");
    ensureDir(cgcConfigDir);
    if (!fs.existsSync(cgcConfigFile) ||
        !fs.readFileSync(cgcConfigFile, "utf8").includes("NEO4J_URI")) {
      // Create or append Neo4j config
      try {
        execFileSync("cgc", ["config", "set", "DEFAULT_DATABASE", "neo4j"], {
          encoding: "utf8", timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, PYTHONIOENCODING: "utf-8" }
        });
        execFileSync("cgc", ["config", "set", "NEO4J_URI", "bolt://localhost:7687"], {
          encoding: "utf8", timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, PYTHONIOENCODING: "utf-8" }
        });
        execFileSync("cgc", ["config", "set", "NEO4J_PASSWORD", "gsdt-graph-2026"], {
          encoding: "utf8", timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, PYTHONIOENCODING: "utf-8" }
        });
        // Add NEO4J_USERNAME manually (not a CGC config key)
        const envContent = fs.readFileSync(cgcConfigFile, "utf8");
        if (!envContent.includes("NEO4J_USERNAME")) {
          fs.appendFileSync(cgcConfigFile,
            "\n# Neo4j connection settings\nNEO4J_USERNAME=neo4j\n");
        }
        success("CGC configured for Neo4j");
      } catch {
        warn("CGC config write failed — configure manually");
      }
    } else {
      info("CGC Neo4j config exists");
    }
  }

  // Summary
  if (neo4jReady) {
    success("Graph engine: CGC + Neo4j (full analysis)");
  } else {
    info("Graph engine: native-only (install Docker for CGC)");
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────

// Shared templates that slash-command prompts reference by predictable path.
// Terminal-2 workers should find these at ~/.claude/templates/ without hunting
// through npx caches. Keep this list tight — only templates that commands cite
// via absolute path belong here.
const SHARED_TEMPLATES = [
  "design-chart-taxonomy.md",
  "element-contract.md",
  "widget-contract.md",
  "page-contract.md",
  "design-contract.md",
  "shared-services-contract.md",
];

function installSharedTemplates() {
  ensureDir(CLAUDE_TEMPLATES_DIR);
  let installed = 0, skipped = 0;
  for (const file of SHARED_TEMPLATES) {
    const src = path.join(PKG_TEMPLATES, file);
    const dest = path.join(CLAUDE_TEMPLATES_DIR, file);
    if (!fs.existsSync(src)) continue;
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

  if (isSymlink(GLOBAL_CLAUDE_MD)) {
    warn("Skipping CLAUDE.md — target is a symlink");
    return;
  }

  const existing = fs.readFileSync(GLOBAL_CLAUDE_MD, "utf8");
  const template = fs.readFileSync(globalSrc, "utf8");

  if (existing.includes(GSDT_START)) {
    mergeGsdtSection(existing, template, isUpdate);
  } else if (existing.includes("GSD-T: Contract-Driven Development")) {
    migrateToMarkers(existing, template);
  } else {
    appendGsdtToClaudeMd(template);
  }
}

function mergeGsdtSection(existing, template, isUpdate) {
  if (!isUpdate) {
    info("CLAUDE.md already contains GSD-T config");
    return;
  }
  const startIdx = existing.indexOf(GSDT_START);
  const endMarkerIdx = existing.indexOf(GSDT_END);
  if (startIdx === -1 || endMarkerIdx === -1) {
    warn("GSD-T markers incomplete — appending fresh copy");
    appendGsdtToClaudeMd(template);
    return;
  }
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

function migrateToMarkers(existing, template) {
  const backupPath = GLOBAL_CLAUDE_MD + ".backup-" + Date.now();
  fs.copyFileSync(GLOBAL_CLAUDE_MD, backupPath);
  const sepIdx = existing.indexOf("# ─── GSD-T Section");
  if (sepIdx !== -1) {
    const before = existing.substring(0, sepIdx);
    const merged = before + template.trimEnd() + "\n";
    fs.writeFileSync(GLOBAL_CLAUDE_MD, merged);
  } else {
    fs.writeFileSync(GLOBAL_CLAUDE_MD, template);
  }
  success("CLAUDE.md migrated to marker-based format");
  info("Backup saved: " + path.basename(backupPath));
}

function appendGsdtToClaudeMd(template) {
  const separator = "\n\n";
  fs.appendFileSync(GLOBAL_CLAUDE_MD, separator + template.trimEnd() + "\n");
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

  heading("Update Check (Session Start)");
  installUpdateCheck();

  heading("Auto-Route (UserPromptSubmit)");
  installAutoRoute();

  heading("Figma MCP (Design-to-Code)");
  configureFigmaMcp();

  heading("Shared Templates");
  installSharedTemplates();

  heading("Utility Scripts");
  installUtilityScripts();

  heading("Graph Engine (CGC)");
  installCgc();

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

  // Seed universal rules from npm package (if shipped)
  seedUniversalRules(projectDir);
}

function seedUniversalRules(projectDir) {
  try {
    const shippedRules = path.join(PKG_ROOT, "examples", "rules", "universal-rules.jsonl");
    if (!fs.existsSync(shippedRules)) return;
    const content = fs.readFileSync(shippedRules, "utf8").trim();
    if (!content) return;
    const rules = content.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (rules.length === 0) return;
    const localRulesFile = path.join(projectDir, ".gsd-t", "metrics", "rules.jsonl");
    const localDir = path.dirname(localRulesFile);
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    // Read existing local rules to avoid duplicates
    let existingTriggers = new Set();
    if (fs.existsSync(localRulesFile)) {
      const existing = fs.readFileSync(localRulesFile, "utf8").trim();
      if (existing) {
        existing.split("\n").forEach((l) => {
          try { const r = JSON.parse(l); existingTriggers.add(JSON.stringify(r.trigger || {})); } catch {}
        });
      }
    }
    let seeded = 0;
    for (const rule of rules) {
      const trigger = (rule.original_rule && rule.original_rule.trigger) || {};
      const fp = JSON.stringify(trigger);
      if (existingTriggers.has(fp)) continue;
      const candidate = {
        id: `universal-${rule.global_id || "unknown"}`,
        created_at: new Date().toISOString(),
        name: (rule.original_rule && rule.original_rule.name) || rule.global_id || "universal",
        description: (rule.original_rule && rule.original_rule.description) || "Shipped as universal rule",
        trigger,
        severity: (rule.original_rule && rule.original_rule.severity) || "MEDIUM",
        action: (rule.original_rule && rule.original_rule.action) || "warn",
        patch_template_id: null,
        activation_count: 0, last_activated: null,
        milestone_created: "universal", status: "active",
        source_global_id: rule.global_id || null,
      };
      fs.appendFileSync(localRulesFile, JSON.stringify(candidate) + "\n");
      existingTriggers.add(fp);
      seeded++;
    }
    if (seeded > 0) success(`Seeded ${seeded} universal rules from npm package`);
  } catch { /* silently skip if anything fails */ }
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

// ── Global Rule Sync (M27) ──────────────────────────────────────────────────

function syncGlobalRulesToProject(projectDir) {
  try {
    const gsm = require("./global-sync-manager.js");
    const globalRules = gsm.readGlobalRules();
    if (globalRules.length === 0) return 0;

    // Filter: universal OR promotion_count >= 2
    const qualifying = globalRules.filter((r) =>
      r.is_universal === true || (r.promotion_count || 0) >= 2);
    if (qualifying.length === 0) return 0;

    // Load local rules to check for duplicates
    let localRules = [];
    try {
      const re = require("./rule-engine.js");
      localRules = re.getActiveRules(projectDir);
    } catch { /* rule-engine may not exist in target project */ }

    const rulesFile = path.join(projectDir, ".gsd-t", "metrics", "rules.jsonl");
    let injected = 0;

    for (const globalRule of qualifying) {
      const triggerFp = JSON.stringify(
        globalRule.original_rule && globalRule.original_rule.trigger
          ? globalRule.original_rule.trigger : {});
      const alreadyExists = localRules.some((lr) =>
        JSON.stringify(lr.trigger || {}) === triggerFp);
      if (alreadyExists) continue;

      // Inject as candidate rule
      const candidate = {
        id: `global-${globalRule.global_id}`,
        created_at: new Date().toISOString(),
        name: (globalRule.original_rule && globalRule.original_rule.name) || globalRule.global_id,
        description: (globalRule.original_rule && globalRule.original_rule.description) || "Synced from global rules",
        trigger: (globalRule.original_rule && globalRule.original_rule.trigger) || {},
        severity: (globalRule.original_rule && globalRule.original_rule.severity) || "MEDIUM",
        action: (globalRule.original_rule && globalRule.original_rule.action) || "warn",
        patch_template_id: null,
        activation_count: 0,
        last_activated: null,
        milestone_created: "global",
        status: "active",
        source_global_id: globalRule.global_id,
      };

      // Append to local rules.jsonl
      const dir = path.dirname(rulesFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(rulesFile, JSON.stringify(candidate) + "\n");
      localRules.push(candidate); // track to avoid re-injecting within same sync
      injected++;
    }
    return injected;
  } catch {
    return 0;
  }
}

function syncGlobalRules(projects) {
  let totalSynced = 0;
  try {
    const gsm = require("./global-sync-manager.js");
    const globalRules = gsm.readGlobalRules();
    if (globalRules.length === 0) {
      log(`${DIM}  ℹ No global rules to sync${RESET}`);
      return 0;
    }

    heading("Global Rule Sync");
    for (const projectDir of projects) {
      if (!fs.existsSync(projectDir)) continue;
      const count = syncGlobalRulesToProject(projectDir);
      if (count > 0) {
        success(`Synced ${count} global rules to ${path.basename(projectDir)}`);
        totalSynced += count;
      }
    }
    if (totalSynced === 0) {
      info("All projects already have qualifying global rules");
    }
  } catch {
    // global-sync-manager may not exist yet
  }
  return totalSynced;
}

function exportUniversalRulesForNpm() {
  try {
    const gsm = require("./global-sync-manager.js");
    const globalRules = gsm.readGlobalRules();
    const npmCandidates = globalRules.filter((r) => r.is_npm_candidate === true);
    if (npmCandidates.length === 0) return 0;

    const rulesDir = path.join(PKG_ROOT, "examples", "rules");
    if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });

    const version = PKG_VERSION;
    const exported = npmCandidates.map((r) => ({
      ...r,
      shipped_in_version: r.shipped_in_version || version,
    }));

    const filePath = path.join(rulesDir, "universal-rules.jsonl");
    fs.writeFileSync(filePath, exported.map((r) => JSON.stringify(r)).join("\n") + "\n");

    // Update shipped_in_version on global rules
    for (const r of npmCandidates) {
      if (!r.shipped_in_version) {
        r.shipped_in_version = version;
      }
    }
    // Write updated rules back to global
    const allRules = gsm.readGlobalRules();
    for (const r of allRules) {
      const match = npmCandidates.find((c) => c.global_id === r.global_id);
      if (match) r.shipped_in_version = match.shipped_in_version;
    }
    // Re-read and write to ensure consistency
    const rulesFile = path.join(os.homedir(), ".claude", "metrics", "global-rules.jsonl");
    if (fs.existsSync(rulesFile)) {
      const tmp = rulesFile + ".tmp." + process.pid;
      fs.writeFileSync(tmp, allRules.map((r) => JSON.stringify(r)).join("\n") + "\n");
      fs.renameSync(tmp, rulesFile);
    }

    return exported.length;
  } catch {
    return 0;
  }
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

  // Global rule sync — propagate proven rules across projects
  const syncCount = syncGlobalRules(projects);

  const { playwrightMissing, swaggerMissing } = checkProjectHealth(projects);
  showUpdateAllSummary(projects.length, counts, playwrightMissing, swaggerMissing, syncCount);
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
  const binToolsCopied = copyBinToolsToProject(projectDir, projectName);
  const archiveRan = runProgressArchiveMigration(projectDir, projectName);
  if (guardAdded || changelogCreated || binToolsCopied || archiveRan) {
    counts.updated++;
  } else {
    info(`${projectName} — already up to date`);
    counts.skipped++;
  }
}

// Bin tools that should ship with every registered project. Listed here so adding
// a new tool only requires appending to this array.
const PROJECT_BIN_TOOLS = ["archive-progress.js", "log-tail.js", "context-budget-audit.js"];

function copyBinToolsToProject(projectDir, projectName) {
  const projectBinDir = path.join(projectDir, "bin");
  if (!fs.existsSync(projectBinDir)) {
    try {
      fs.mkdirSync(projectBinDir, { recursive: true });
    } catch {
      return false;
    }
  }
  let copied = 0;
  for (const tool of PROJECT_BIN_TOOLS) {
    const src = path.join(PKG_ROOT, "bin", tool);
    const dest = path.join(projectBinDir, tool);
    if (!fs.existsSync(src)) continue;
    let needsCopy = true;
    if (fs.existsSync(dest)) {
      try {
        const srcContent = fs.readFileSync(src, "utf8");
        const destContent = fs.readFileSync(dest, "utf8");
        if (srcContent === destContent) needsCopy = false;
      } catch {
        // fall through, will copy
      }
    }
    if (needsCopy) {
      try {
        fs.copyFileSync(src, dest);
        try { fs.chmodSync(dest, 0o755); } catch {}
        copied++;
      } catch (e) {
        warn(`${projectName} — failed to copy ${tool}: ${e.message}`);
      }
    }
  }
  if (copied > 0) {
    info(`${projectName} — copied ${copied} bin tool(s)`);
    return true;
  }
  return false;
}

// One-shot migration: roll the project's progress.md Decision Log into archive
// files using bin/archive-progress.js. A marker file ensures we only do this once
// per project — subsequent runs are no-ops.
function runProgressArchiveMigration(projectDir, projectName) {
  const progressMd = path.join(projectDir, ".gsd-t", "progress.md");
  if (!fs.existsSync(progressMd)) return false;

  const markerPath = path.join(projectDir, ".gsd-t", ".archive-migration-v1");
  if (fs.existsSync(markerPath)) return false;

  const archiveScript = path.join(projectDir, "bin", "archive-progress.js");
  if (!fs.existsSync(archiveScript)) return false;

  try {
    const output = execFileSync("node", [archiveScript, "--quiet"], {
      cwd: projectDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    fs.writeFileSync(
      markerPath,
      `# archive-migration-v1\nApplied: ${new Date().toISOString()}\nTool: bin/archive-progress.js\n`
    );
    info(`${projectName} — progress.md Decision Log archived (one-time migration)`);
    return true;
  } catch (e) {
    warn(`${projectName} — archive migration failed: ${e.message}`);
    return false;
  }
}

function showUpdateAllSummary(total, counts, playwrightMissing, swaggerMissing, syncCount) {
  log("");
  heading("Update All Complete");
  log(`  Projects registered: ${total}`);
  log(`  Updated:             ${counts.updated}`);
  log(`  Already current:     ${counts.skipped}`);
  if (counts.missing > 0) log(`  Not found:           ${counts.missing}`);
  if (counts.errors > 0) log(`  Errors:              ${counts.errors}`);
  if (playwrightMissing.length > 0) log(`  Missing Playwright:  ${playwrightMissing.length}`);
  if (swaggerMissing.length > 0) log(`  Missing Swagger:     ${swaggerMissing.length}`);
  if (syncCount > 0) log(`  Global rules synced: ${syncCount}`);
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

function checkDoctorCgc() {
  let issues = 0;
  heading("Graph Engine (CGC)");

  // Check CGC binary
  try {
    const ver = execFileSync("cgc", ["--version"], {
      encoding: "utf8", timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    success(`CodeGraphContext ${ver}`);
  } catch {
    warn("CGC not installed (deep code analysis unavailable)");
    info("Run 'pip install codegraphcontext' or reinstall GSD-T");
    issues++;
    return issues;
  }

  // Check Neo4j
  try {
    execFileSync("docker", ["inspect", "gsd-t-neo4j", "--format", "{{.State.Running}}"], {
      encoding: "utf8", timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim() === "true"
      ? success("Neo4j container running")
      : (warn("Neo4j container stopped"), info("Run: docker start gsd-t-neo4j"), issues++);
  } catch {
    warn("Neo4j container not found");
    info("Run: docker run -d --name gsd-t-neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/gsdt-graph-2026 neo4j:5-community");
    issues++;
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
  issues += checkDoctorCgc();
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

// ─── Graph ──────────────────────────────────────────────────────────────────

function doGraphIndex() {
  heading("GSD-T Graph — Index");
  const root = process.cwd();
  const gq = require("./graph-indexer");
  const result = gq.indexProject(root, { force: true });
  if (result.success) {
    success(`Indexed ${result.entityCount} entities, ${result.relationshipCount} relationships`);
    info(`Files processed: ${result.filesProcessed}, skipped: ${result.filesSkipped}`);
    info(`Duration: ${result.duration}ms`);
    if (result.errors.length > 0) {
      warn(`Parse errors: ${result.errors.length}`);
      result.errors.forEach(e => log(`  ${DIM}${e}${RESET}`));
    }
  } else {
    error("Indexing failed");
  }
}

function doGraphStatus() {
  heading("GSD-T Graph — Status");
  const root = process.cwd();
  const store = require("./graph-store");
  const meta = store.readMeta(root);
  if (!meta) {
    warn("No graph index found. Run: gsd-t graph index");
    return;
  }
  success(`Provider: ${meta.provider}`);
  info(`Entities: ${meta.entityCount}`);
  info(`Relationships: ${meta.relationshipCount}`);
  info(`Last indexed: ${meta.lastIndexed}`);
  info(`Duration: ${meta.duration}ms`);
  const fileCount = Object.keys(meta.fileHashes || {}).length;
  info(`Files tracked: ${fileCount}`);
}

function doGraphQuery(args) {
  const root = process.cwd();
  const gq = require("./graph-query");
  const type = args[0];
  if (!type) {
    error("Usage: gsd-t graph query <type> [params...]");
    info("Types: getEntity, getEntities, getCallers, getCallees,");
    info("       findDeadCode, findDuplicates, findCircularDeps,");
    info("       getDomainBoundaryViolations, getIndexStatus");
    return;
  }
  const params = {};
  for (let i = 1; i < args.length; i++) {
    const [k, v] = args[i].split("=");
    if (k && v) params[k] = v;
  }
  const result = gq.query(type, params, root);
  log(JSON.stringify(result, null, 2));
}

function doGraph(args) {
  const sub = args[0] || "status";
  switch (sub) {
    case "index":  doGraphIndex(); break;
    case "status": doGraphStatus(); break;
    case "query":  doGraphQuery(args.slice(1)); break;
    default:
      error(`Unknown graph subcommand: ${sub}`);
      info("Usage: gsd-t graph [index|status|query]");
  }
}

// ─── Headless Mode ────────────────────────────────────────────────────────────

/**
 * Parse headless flags from args array.
 * Extracts --json, --timeout=N, --log from args, returns remainder as positional args.
 */
function parseHeadlessFlags(args) {
  const flags = { json: false, timeout: 300, log: false };
  const positional = [];
  for (const arg of args) {
    if (arg === "--json") {
      flags.json = true;
    } else if (arg.startsWith("--timeout=")) {
      const n = parseInt(arg.slice("--timeout=".length), 10);
      if (!isNaN(n) && n > 0) flags.timeout = n;
    } else if (arg === "--log") {
      flags.log = true;
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

/**
 * Build the claude -p invocation string for a GSD-T command.
 */
function buildHeadlessCmd(command, cmdArgs) {
  const argStr = cmdArgs.length > 0 ? " " + cmdArgs.join(" ") : "";
  return `/user:gsd-t-${command}${argStr}`;
}

/**
 * Map claude output + process exit code to a GSD-T headless exit code.
 * Exit codes: 0=success, 1=verify-fail, 2=context-budget-exceeded, 3=error, 4=blocked-needs-human
 */
function mapHeadlessExitCode(processExitCode, output) {
  if (processExitCode !== 0 && processExitCode !== null) return 3;
  const lower = (output || "").toLowerCase();
  if (lower.includes("context budget exceeded") || lower.includes("context window exceeded") ||
      lower.includes("budget exceeded") || lower.includes("token limit")) return 2;
  if (lower.includes("blocked") && (lower.includes("needs human") || lower.includes("need human") ||
      lower.includes("human input") || lower.includes("human approval"))) return 4;
  if (lower.includes("verification failed") || lower.includes("verify failed") ||
      lower.includes("quality gate failed") || lower.includes("tests failed")) return 1;
  return 0;
}

/**
 * Generate a headless log file path.
 */
function headlessLogPath(projectDir, timestamp) {
  const ts = timestamp || Date.now();
  return path.join(projectDir, ".gsd-t", `headless-${ts}.log`);
}

/**
 * Execute a GSD-T command via claude -p (non-interactive).
 */
function doHeadlessExec(command, cmdArgs, flags) {
  const opts = flags || {};
  const jsonMode = opts.json || false;
  const timeoutMs = (opts.timeout || 300) * 1000;
  const logMode = opts.log || false;
  const startTime = Date.now();
  const timestamp = new Date(startTime).toISOString();

  // Verify claude CLI is available
  try {
    execFileSync("claude", ["--version"], {
      encoding: "utf8", timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"]
    });
  } catch {
    const msg = "claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code";
    if (jsonMode) {
      process.stdout.write(JSON.stringify({
        success: false, exitCode: 3, gsdtExitCode: 3,
        command, args: cmdArgs, output: msg,
        timestamp, duration: Date.now() - startTime, logFile: null
      }) + "\n");
    } else {
      error(msg);
    }
    process.exit(3);
  }

  const prompt = buildHeadlessCmd(command, cmdArgs);
  let logFile = null;

  if (!jsonMode) {
    heading(`GSD-T Headless — ${command}`);
    info(`Prompt: ${prompt}`);
    info(`Timeout: ${opts.timeout || 300}s`);
    if (logMode) {
      logFile = headlessLogPath(process.cwd(), startTime);
      info(`Log: ${logFile}`);
    }
    log("");
  } else if (logMode) {
    logFile = headlessLogPath(process.cwd(), startTime);
  }

  let output = "";
  let processExitCode = 0;

  try {
    const result = execFileSync("claude", ["-p", prompt], {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd()
    });
    output = result;
  } catch (e) {
    // execFileSync throws on non-zero exit or timeout
    output = (e.stdout || "") + (e.stderr || "");
    processExitCode = e.status || 1;
    if (e.signal === "SIGTERM" || e.code === "ETIMEDOUT") {
      processExitCode = 3;
      output += "\n[headless: process timed out]";
    }
  }

  const gsdtExitCode = mapHeadlessExitCode(processExitCode, output);
  const duration = Date.now() - startTime;

  // Write log file if requested
  if (logMode && logFile) {
    try {
      const gsdtDir = path.join(process.cwd(), ".gsd-t");
      ensureDir(gsdtDir);
      const logContent = [
        `GSD-T Headless Log`,
        `Command: ${command}`,
        `Args: ${cmdArgs.join(" ")}`,
        `Timestamp: ${timestamp}`,
        `Duration: ${duration}ms`,
        `Exit Code: ${gsdtExitCode}`,
        `---`,
        output
      ].join("\n");
      fs.writeFileSync(logFile, logContent);
    } catch (e) {
      if (!jsonMode) warn(`Failed to write log: ${e.message}`);
    }
  }

  if (jsonMode) {
    process.stdout.write(JSON.stringify({
      success: gsdtExitCode === 0,
      exitCode: processExitCode,
      gsdtExitCode,
      command,
      args: cmdArgs,
      output,
      timestamp,
      duration,
      logFile
    }) + "\n");
  } else {
    process.stdout.write(output);
    if (!output.endsWith("\n")) process.stdout.write("\n");
    if (gsdtExitCode !== 0) {
      log("");
      warn(`Exit code: ${gsdtExitCode}`);
    }
  }

  process.exit(gsdtExitCode);
}

// ─── Headless Query ──────────────────────────────────────────────────────────

const VALID_QUERY_TYPES = ["status", "domains", "contracts", "debt", "context", "backlog", "graph"];

function queryResult(type, data) {
  return { type, timestamp: new Date().toISOString(), data };
}

function queryStatus(projectDir) {
  const progressPath = path.join(projectDir, ".gsd-t", "progress.md");
  if (!fs.existsSync(progressPath)) {
    return queryResult("status", { error: "progress.md not found" });
  }
  const content = fs.readFileSync(progressPath, "utf8");
  const versionMatch = content.match(/##\s*Version:\s*(.+)/);
  const projectMatch = content.match(/##\s*Project:\s*(.+)/);
  const statusMatch = content.match(/##\s*Status:\s*(.+)/);
  const milestoneMatch = content.match(/##\s*Active Milestone\s*[\r\n]+\s*(.+)/);
  const phaseMatch = content.match(/Phase:\s*(\w+)/);
  return queryResult("status", {
    version: versionMatch ? versionMatch[1].trim() : null,
    project: projectMatch ? projectMatch[1].trim() : null,
    status: statusMatch ? statusMatch[1].trim() : null,
    activeMilestone: milestoneMatch ? milestoneMatch[1].trim() : null,
    phase: phaseMatch ? phaseMatch[1].trim() : null
  });
}

function queryDomains(projectDir) {
  const domainsDir = path.join(projectDir, ".gsd-t", "domains");
  if (!fs.existsSync(domainsDir)) {
    return queryResult("domains", { domains: [] });
  }
  const entries = fs.readdirSync(domainsDir).filter((f) => {
    const fp = path.join(domainsDir, f);
    return fs.statSync(fp).isDirectory();
  });
  const domains = entries.map((name) => {
    const domainDir = path.join(domainsDir, name);
    return {
      name,
      hasScope: fs.existsSync(path.join(domainDir, "scope.md")),
      hasTasks: fs.existsSync(path.join(domainDir, "tasks.md")),
      hasConstraints: fs.existsSync(path.join(domainDir, "constraints.md"))
    };
  });
  return queryResult("domains", { domains });
}

function queryContracts(projectDir) {
  const contractsDir = path.join(projectDir, ".gsd-t", "contracts");
  if (!fs.existsSync(contractsDir)) {
    return queryResult("contracts", { contracts: [] });
  }
  const contracts = fs.readdirSync(contractsDir)
    .filter((f) => f.endsWith(".md") && f !== ".gitkeep");
  return queryResult("contracts", { contracts });
}

function queryDebt(projectDir) {
  const debtPath = path.join(projectDir, ".gsd-t", "techdebt.md");
  if (!fs.existsSync(debtPath)) {
    return queryResult("debt", { items: [], count: 0 });
  }
  const content = fs.readFileSync(debtPath, "utf8");
  // Parse table rows: | ID | Severity | Description | ...
  const rows = content.split("\n").filter((line) => {
    return line.startsWith("| ") && !line.startsWith("| ID") && !line.startsWith("| ---") && !line.startsWith("| #");
  });
  const items = rows.map((row) => {
    const cells = row.split("|").slice(1, -1).map((c) => c.trim());
    return cells.length >= 2 ? { id: cells[0], severity: cells[1], description: cells[2] || "" } : null;
  }).filter(Boolean);
  return queryResult("debt", { items, count: items.length });
}

function queryContext(projectDir) {
  const tokenLogPath = path.join(projectDir, ".gsd-t", "token-log.md");
  if (!fs.existsSync(tokenLogPath)) {
    return queryResult("context", { entries: [], totalTokens: 0, entryCount: 0 });
  }
  const content = fs.readFileSync(tokenLogPath, "utf8");
  const rows = content.split("\n").filter((line) => {
    return line.startsWith("| ") && !line.startsWith("| Datetime") && !line.startsWith("| ---");
  });
  const entries = rows.map((row) => {
    const cells = row.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 8) return null;
    return {
      datetimeStart: cells[0],
      datetimeEnd: cells[1],
      command: cells[2],
      step: cells[3],
      model: cells[4],
      duration: cells[5],
      notes: cells[6],
      tokens: parseInt(cells[7]) || 0
    };
  }).filter(Boolean);
  const totalTokens = entries.reduce((sum, e) => sum + (e.tokens || 0), 0);
  return queryResult("context", { entries, totalTokens, entryCount: entries.length });
}

function queryBacklog(projectDir) {
  const backlogPath = path.join(projectDir, ".gsd-t", "backlog.md");
  if (!fs.existsSync(backlogPath)) {
    return queryResult("backlog", { items: [], count: 0 });
  }
  const content = fs.readFileSync(backlogPath, "utf8");
  const rows = content.split("\n").filter((line) => {
    return line.startsWith("| ") && !line.startsWith("| #") && !line.startsWith("| ID") && !line.startsWith("| ---");
  });
  const items = rows.map((row) => {
    const cells = row.split("|").slice(1, -1).map((c) => c.trim());
    return cells.length >= 2 ? { id: cells[0], title: cells[1], status: cells[2] || "" } : null;
  }).filter(Boolean);
  return queryResult("backlog", { items, count: items.length });
}

function queryGraph(projectDir) {
  const metaPath = path.join(projectDir, ".gsd-t", "graph-index", "meta.json");
  if (!fs.existsSync(metaPath)) {
    return queryResult("graph", { available: false });
  }
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    return queryResult("graph", {
      available: true,
      provider: meta.provider || "native",
      entityCount: meta.entityCount || 0,
      relationshipCount: meta.relationshipCount || 0,
      lastIndexed: meta.lastIndexed || null
    });
  } catch {
    return queryResult("graph", { available: false, error: "meta.json parse error" });
  }
}

function doHeadlessQuery(type) {
  const projectDir = process.cwd();

  if (!type || !VALID_QUERY_TYPES.includes(type)) {
    const result = { error: "unknown query type", validTypes: VALID_QUERY_TYPES };
    process.stdout.write(JSON.stringify(result) + "\n");
    process.exit(3);
    return;
  }

  let result;
  switch (type) {
    case "status":    result = queryStatus(projectDir); break;
    case "domains":   result = queryDomains(projectDir); break;
    case "contracts": result = queryContracts(projectDir); break;
    case "debt":      result = queryDebt(projectDir); break;
    case "context":   result = queryContext(projectDir); break;
    case "backlog":   result = queryBacklog(projectDir); break;
    case "graph":     result = queryGraph(projectDir); break;
    default:
      result = { error: "unknown query type", validTypes: VALID_QUERY_TYPES };
  }

  process.stdout.write(JSON.stringify(result) + "\n");
}

/**
 * Parse debug-loop flags from args array.
 * Extracts --max-iterations, --test-cmd, --fix-scope, --json, --log from args.
 */
function parseDebugLoopFlags(args) {
  const flags = { maxIterations: 20, testCmd: null, fixScope: null, json: false, log: false };
  const positional = [];
  for (const arg of args) {
    if (arg.startsWith("--max-iterations=")) {
      const n = parseInt(arg.slice("--max-iterations=".length), 10);
      if (!isNaN(n) && n > 0) flags.maxIterations = n;
    } else if (arg.startsWith("--test-cmd=")) {
      flags.testCmd = arg.slice("--test-cmd=".length);
    } else if (arg.startsWith("--fix-scope=")) {
      flags.fixScope = arg.slice("--fix-scope=".length);
    } else if (arg === "--json") {
      flags.json = true;
    } else if (arg === "--log") {
      flags.log = true;
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

/**
 * Return the escalation model for a given iteration number.
 * Tiers: 1-5 → sonnet, 6-15 → opus, 16+ → null (stop)
 */
function getEscalationModel(iteration) {
  if (iteration >= 1 && iteration <= 5) return "sonnet";
  if (iteration >= 6 && iteration <= 15) return "opus";
  return null;
}

/**
 * Spawn a single `claude -p` session and return stdout as a string.
 * Returns null if the process fails.
 */
function spawnClaudeSession(prompt, model) {
  try {
    return execFileSync("claude", ["-p", prompt, "--model", model], {
      encoding: "utf8", timeout: 300000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    return (e.stdout || "") + (e.stderr || "") || null;
  }
}

/**
 * Parse test pass/fail from claude output.
 * Returns { passed: bool, summary: string }.
 */
function parseTestResult(output) {
  const out = (output || "").toLowerCase();
  const passed =
    /\ball tests? pass(ed|ing)?\b/.test(out) ||
    /\ball \d+ tests? pass/.test(out) ||
    /\bno (test )?failures?\b/.test(out) ||
    /\btests? (all )?pass(ed)?\b/.test(out);
  const failed =
    /\bfail(ed|ing|ure)?\b/.test(out) ||
    /\berror\b/.test(out) ||
    /\bnot ok\b/.test(out);
  const summary = (output || "").slice(0, 500).replace(/\n/g, " ").trim();
  return { passed: passed && !failed, summary };
}

/**
 * Run ledger compaction: spawn haiku to summarize, then compact.
 */
function runLedgerCompaction(projectDir, jsonMode) {
  const entries = debugLedger.readLedger(projectDir);
  const compactPrompt =
    "Read this debug ledger. Produce a condensed summary of what has been tried, " +
    "what failed, and what the evidence suggests. Be concise.\n\n" +
    JSON.stringify(entries, null, 2);
  let summary = "Compacted — see previous entries.";
  try {
    const out = execFileSync("claude", ["-p", compactPrompt, "--model", "haiku"], {
      encoding: "utf8", timeout: 120000, stdio: ["pipe", "pipe", "pipe"],
    });
    summary = (out || "").trim() || summary;
  } catch (e) {
    if (!jsonMode) warn("Compaction haiku session failed — using default summary");
  }
  debugLedger.compactLedger(projectDir, summary);
}

/**
 * Write a per-iteration log file under .gsd-t/.
 */
function writeIterationLog(projectDir, ts, iteration, entry, rawOutput) {
  const logDir = path.join(projectDir, ".gsd-t");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const fname = `headless-debug-${ts}-iter-${iteration}.log`;
  const content = [
    `Iteration: ${iteration}`,
    `Timestamp: ${entry.timestamp}`,
    `Model: ${entry.model}`,
    `Result: ${entry.result}`,
    `Fix: ${entry.fix}`,
    `Learning: ${entry.learning}`,
    `---`,
    rawOutput || "",
  ].join("\n");
  fs.writeFileSync(path.join(logDir, fname), content);
}

/**
 * Full debug-loop: validate flags, check claude CLI, run iteration cycle.
 */
function doHeadlessDebugLoop(flags) {
  const opts = flags || {};
  const jsonMode = opts.json || false;
  const projectDir = process.cwd();

  if (opts.maxIterations < 1) {
    const msg = "--max-iterations must be >= 1";
    if (jsonMode) process.stdout.write(JSON.stringify({ success: false, exitCode: 3, error: msg }) + "\n");
    else error(msg);
    process.exit(3);
  }

  try {
    execFileSync("claude", ["--version"], { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    const msg = "claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code";
    if (jsonMode) process.stdout.write(JSON.stringify({ success: false, exitCode: 3, error: msg }) + "\n");
    else error(msg);
    process.exit(3);
  }

  if (!jsonMode) {
    heading("GSD-T Headless — Debug Loop");
    info(`Max iterations: ${opts.maxIterations}`);
    if (opts.testCmd) info(`Test command: ${opts.testCmd}`);
    if (opts.fixScope) info(`Fix scope: ${opts.fixScope}`);
    if (opts.log) info(`Logging: enabled`);
    log("");
  }

  const ts = Date.now();

  for (let iteration = 1; iteration <= opts.maxIterations; iteration++) {
    const model = getEscalationModel(iteration);

    // STOP tier: escalation stop
    if (model === null) {
      const entries = debugLedger.readLedger(projectDir);
      const stats = debugLedger.getLedgerStats(projectDir);
      const diagMsg = `ESCALATION STOP at iteration ${iteration}. ` +
        `Entries: ${stats.entryCount}, Failures: ${stats.failCount}. ` +
        `Failed hypotheses:\n${stats.failedHypotheses.map((h, i) => `  ${i + 1}. ${h}`).join("\n")}`;
      if (jsonMode) {
        process.stdout.write(JSON.stringify({ success: false, exitCode: 4, iteration, diagnostic: diagMsg, entries }) + "\n");
      } else {
        log("");
        warn(diagMsg);
      }
      process.exit(4);
    }

    // Check compaction
    const stats = debugLedger.getLedgerStats(projectDir);
    if (stats.needsCompaction) {
      if (!jsonMode) info("Ledger compaction triggered...");
      try { runLedgerCompaction(projectDir, jsonMode); }
      catch { process.exit(2); }
    }

    // Generate preamble and build prompt
    const preamble = debugLedger.generateAntiRepetitionPreamble(projectDir);
    const scopeHint = opts.fixScope ? `\nFix scope: ${opts.fixScope}` : "";
    const testHint = opts.testCmd ? `\nRun tests with: ${opts.testCmd}` : "";
    const prompt = [preamble, `Fix the failing test(s). Write your fix, then run the test suite. Report results.${scopeHint}${testHint}`]
      .filter(Boolean).join("\n\n");

    if (!jsonMode) info(`Iteration ${iteration}/${opts.maxIterations} [${model}]...`);

    const iterStart = Date.now();
    let rawOutput = null;
    try { rawOutput = spawnClaudeSession(prompt, model); }
    catch (e) {
      if (jsonMode) process.stdout.write(JSON.stringify({ success: false, exitCode: 3, iteration, error: String(e) }) + "\n");
      else error(`Process error at iteration ${iteration}: ${e.message}`);
      process.exit(3);
    }
    const duration = Math.round((Date.now() - iterStart) / 1000);

    const { passed, summary } = parseTestResult(rawOutput);
    const result = passed ? "PASS" : "STILL_FAILS";

    // Extract fix description from output (first 200 chars of output)
    const fixDesc = (rawOutput || "").split("\n").find((l) => l.trim().length > 20) || "see output";
    const entry = {
      iteration, timestamp: new Date().toISOString(),
      test: opts.testCmd || "unspecified", error: passed ? "" : summary,
      hypothesis: `iteration-${iteration}`, fix: fixDesc.trim().slice(0, 200),
      fixFiles: [], result, learning: summary.slice(0, 300),
      model, duration,
    };

    try { debugLedger.appendEntry(projectDir, entry); }
    catch (e) {
      if (!jsonMode) warn(`Failed to append ledger entry: ${e.message}`);
    }

    if (opts.log) writeIterationLog(projectDir, ts, iteration, entry, rawOutput);

    if (jsonMode) {
      process.stdout.write(JSON.stringify({ success: passed, exitCode: passed ? 0 : 1, iteration, result, model, duration, summary }) + "\n");
    } else {
      info(`  Result: ${result}`);
    }

    if (passed) {
      debugLedger.clearLedger(projectDir);
      if (!jsonMode) log(`\n${GREEN}All tests pass — debug loop complete.${RESET}`);
      process.exit(0);
    }
  }

  // Max iterations reached
  if (!jsonMode) warn(`Max iterations (${opts.maxIterations}) reached without all tests passing.`);
  process.exit(1);
}

function doHeadless(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h") {
    showHeadlessHelp();
    return;
  }

  if (sub === "--debug-loop") {
    const { flags } = parseDebugLoopFlags(args.slice(1));
    doHeadlessDebugLoop(flags);
    return;
  }

  if (sub === "query") {
    const type = args[1];
    doHeadlessQuery(type);
    return;
  }

  // headless exec: gsd-t headless <command> [cmdArgs...] [flags]
  const { flags, positional } = parseHeadlessFlags(args.slice(1));
  doHeadlessExec(sub, positional, flags);
}

function showHeadlessHelp() {
  log(`\n${BOLD}GSD-T Headless Mode${RESET}\n`);
  log(`${BOLD}Usage:${RESET}`);
  log(`  ${CYAN}gsd-t headless${RESET} <command> [args] [--json] [--timeout=N] [--log]`);
  log(`  ${CYAN}gsd-t headless query${RESET} <type>`);
  log(`  ${CYAN}gsd-t headless --debug-loop${RESET} [--max-iterations=N] [--test-cmd=CMD] [--fix-scope=SCOPE] [--json] [--log]\n`);
  log(`${BOLD}Debug-loop flags:${RESET}`);
  log(`  ${CYAN}--max-iterations=N${RESET}  Hard ceiling on iterations (default: 20)`);
  log(`  ${CYAN}--test-cmd=CMD${RESET}      Override test command`);
  log(`  ${CYAN}--fix-scope=SCOPE${RESET}   Limit fix scope to specific files or test patterns`);
  log(`  ${CYAN}--json${RESET}              Structured JSON output per iteration`);
  log(`  ${CYAN}--log${RESET}               Write per-iteration logs to .gsd-t/\n`);
  log(`${BOLD}Debug-loop escalation tiers:${RESET}`);
  log(`  Iterations 1-5:   sonnet  (standard debug)`);
  log(`  Iterations 6-15:  opus    (deeper reasoning)`);
  log(`  Iterations 16-20: STOP    (exit code 4 — needs human)\n`);
  log(`${BOLD}Debug-loop exit codes:${RESET}`);
  log(`  0  all tests pass`);
  log(`  1  max iterations reached`);
  log(`  2  ledger compaction error`);
  log(`  3  process error`);
  log(`  4  escalation stop — needs human\n`);
  log(`${BOLD}Exec flags:${RESET}`);
  log(`  ${CYAN}--json${RESET}        Structured JSON output`);
  log(`  ${CYAN}--timeout=N${RESET}   Kill after N seconds (default: 300)`);
  log(`  ${CYAN}--log${RESET}         Write output to .gsd-t/headless-{timestamp}.log\n`);
  log(`${BOLD}Exit codes:${RESET}`);
  log(`  0  success`);
  log(`  1  verify-fail`);
  log(`  2  context-budget-exceeded`);
  log(`  3  error`);
  log(`  4  blocked-needs-human\n`);
  log(`${BOLD}Query types:${RESET}`);
  log(`  ${VALID_QUERY_TYPES.join(", ")}\n`);
  log(`${BOLD}Examples:${RESET}`);
  log(`  ${DIM}$${RESET} gsd-t headless verify --json`);
  log(`  ${DIM}$${RESET} gsd-t headless execute --timeout=600 --log`);
  log(`  ${DIM}$${RESET} gsd-t headless query status`);
  log(`  ${DIM}$${RESET} gsd-t headless query domains\n`);
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
  log(`  ${CYAN}graph${RESET}          Code graph operations (index, status, query)`);
  log(`  ${CYAN}headless${RESET}       Non-interactive execution via claude -p + fast state queries`);
  log(`  ${CYAN}design-build${RESET}   Deterministic design→code pipeline (elements → widgets → pages)`);
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
  mergeGsdtSection,
  migrateToMarkers,
  appendGsdtToClaudeMd,
  readSettingsJson,
  readUpdateCache,
  fetchVersionSync,
  refreshVersionAsync,
  doGraph,
  doGraphIndex,
  doGraphStatus,
  doGraphQuery,
  // Headless mode
  parseHeadlessFlags,
  buildHeadlessCmd,
  mapHeadlessExitCode,
  headlessLogPath,
  doHeadlessExec,
  doHeadlessQuery,
  doHeadless,
  // Headless debug-loop
  parseDebugLoopFlags,
  getEscalationModel,
  doHeadlessDebugLoop,
  queryStatus,
  queryDomains,
  queryContracts,
  queryDebt,
  queryContext,
  queryBacklog,
  queryGraph,
  VALID_QUERY_TYPES,
  PKG_VERSION,
  PKG_ROOT,
  PKG_COMMANDS,
  // M27: Cross-project sync
  syncGlobalRulesToProject,
  syncGlobalRules,
  exportUniversalRulesForNpm,
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
    case "graph":
      doGraph(args.slice(1));
      break;
    case "headless":
      doHeadless(args.slice(1));
      break;
    case "design-build": {
      const orchestrator = require("./design-orchestrator.js");
      orchestrator.run(args.slice(1)).catch(e => { console.error(e); process.exit(1); });
      break;
    }
    case "scan": {
      const exportFlag = args.find(a => a.startsWith('--export='));
      const exportFormat = exportFlag ? exportFlag.split('=')[1] : null;
      if (exportFormat) {
        log(`${CYAN}  ℹ${RESET} Export flag noted: will export to ${exportFormat} after scan completes`);
      }
      break;
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
