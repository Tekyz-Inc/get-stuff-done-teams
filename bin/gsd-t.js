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
const { execSync } = require("child_process");

// ─── Configuration ───────────────────────────────────────────────────────────

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const COMMANDS_DIR = path.join(CLAUDE_DIR, "commands");
const GLOBAL_CLAUDE_MD = path.join(CLAUDE_DIR, "CLAUDE.md");
const SETTINGS_JSON = path.join(CLAUDE_DIR, "settings.json");
const VERSION_FILE = path.join(CLAUDE_DIR, ".gsd-t-version");
const PROJECTS_FILE = path.join(CLAUDE_DIR, ".gsd-t-projects");
const UPDATE_CHECK_FILE = path.join(CLAUDE_DIR, ".gsd-t-update-check");

// Where our package files live (relative to this script)
const PKG_ROOT = path.resolve(__dirname, "..");
const PKG_COMMANDS = path.join(PKG_ROOT, "commands");
const PKG_TEMPLATES = path.join(PKG_ROOT, "templates");
const PKG_EXAMPLES = path.join(PKG_ROOT, "examples");

// Read our version from package.json
const PKG_VERSION = require(path.join(PKG_ROOT, "package.json")).version;
const CHANGELOG_URL = "https://github.com/Tekyz-Inc/get-stuff-done-teams/blob/main/CHANGELOG.md";

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
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  }
  return false;
}

function copyFile(src, dest, label) {
  fs.copyFileSync(src, dest);
  success(label || path.basename(dest));
}

function getInstalledVersion() {
  try {
    return fs.readFileSync(VERSION_FILE, "utf8").trim();
  } catch {
    return null;
  }
}

function saveInstalledVersion() {
  fs.writeFileSync(VERSION_FILE, PKG_VERSION);
}

function getRegisteredProjects() {
  try {
    const content = fs.readFileSync(PROJECTS_FILE, "utf8").trim();
    if (!content) return [];
    return content.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

function registerProject(projectDir) {
  const resolved = path.resolve(projectDir);
  const projects = getRegisteredProjects();
  if (projects.includes(resolved)) return false;
  projects.push(resolved);
  fs.writeFileSync(PROJECTS_FILE, projects.join("\n") + "\n");
  return true;
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
    return fs
      .readdirSync(COMMANDS_DIR)
      .filter((f) => f.endsWith(".md") && (f.startsWith("gsd-t-") || ["branch.md", "checkin.md", "Claude-md.md"].includes(f)));
  } catch {
    return [];
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────

function doInstall(opts = {}) {
  const isUpdate = opts.update || false;
  const verb = isUpdate ? "Updating" : "Installing";

  heading(`${verb} GSD-T ${versionLink()}`);
  log("");

  // 1. Create ~/.claude/commands/ if needed
  if (ensureDir(COMMANDS_DIR)) {
    success("Created ~/.claude/commands/");
  }

  // 2. Copy all command files
  heading("Slash Commands");
  const commandFiles = getCommandFiles();
  const gsdtCommands = getGsdtCommands();
  const utilityCommands = getUtilityCommands();
  let installed = 0;
  let skipped = 0;

  for (const file of commandFiles) {
    const src = path.join(PKG_COMMANDS, file);
    const dest = path.join(COMMANDS_DIR, file);

    if (isUpdate && fs.existsSync(dest)) {
      // Compare content — only overwrite if changed
      const srcContent = fs.readFileSync(src, "utf8");
      const destContent = fs.readFileSync(dest, "utf8");
      if (srcContent === destContent) {
        skipped++;
        continue;
      }
    }

    copyFile(src, dest, file);
    installed++;
  }

  if (skipped > 0) {
    info(`${skipped} commands unchanged`);
  }
  success(`${gsdtCommands.length} GSD-T commands + ${utilityCommands.length} utilities ${isUpdate ? "updated" : "installed"} → ~/.claude/commands/`);

  // 3. Handle global CLAUDE.md
  heading("Global CLAUDE.md");
  const globalSrc = path.join(PKG_TEMPLATES, "CLAUDE-global.md");

  if (fs.existsSync(GLOBAL_CLAUDE_MD)) {
    const existing = fs.readFileSync(GLOBAL_CLAUDE_MD, "utf8");

    if (existing.includes("GSD-T: Contract-Driven Development")) {
      if (isUpdate) {
        // Check if there are customizations (lines not in our template)
        const template = fs.readFileSync(globalSrc, "utf8");
        if (existing === template) {
          copyFile(globalSrc, GLOBAL_CLAUDE_MD, "CLAUDE.md updated (no customizations detected)");
        } else {
          // Backup and replace, warn about customizations
          const backupPath = GLOBAL_CLAUDE_MD + ".backup-" + Date.now();
          fs.copyFileSync(GLOBAL_CLAUDE_MD, backupPath);
          copyFile(globalSrc, GLOBAL_CLAUDE_MD, "CLAUDE.md updated");
          warn(`Previous version backed up to ${path.basename(backupPath)}`);
          info("Review the backup if you had custom additions to merge back in.");
        }
      } else {
        info("CLAUDE.md already contains GSD-T config — skipping");
        info("Run 'gsd-t update' to overwrite with latest version");
      }
    } else {
      // Existing CLAUDE.md without GSD-T — append
      const gsdtContent = fs.readFileSync(globalSrc, "utf8");
      const separator = "\n\n# ─── GSD-T Section (added by installer) ───\n\n";
      fs.appendFileSync(GLOBAL_CLAUDE_MD, separator + gsdtContent);
      success("GSD-T config appended to existing CLAUDE.md");
      info("Your existing content was preserved.");
    }
  } else {
    copyFile(globalSrc, GLOBAL_CLAUDE_MD, "CLAUDE.md installed → ~/.claude/CLAUDE.md");
  }

  // 4. Save version
  saveInstalledVersion();

  // 5. Summary
  heading("Installation Complete!");
  log("");
  log(`  Commands: ${gsdtCommands.length} GSD-T + ${utilityCommands.length} utility commands in ~/.claude/commands/`);
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

function doInit(projectName) {
  if (!projectName) {
    // Use current directory name
    projectName = path.basename(process.cwd());
  }

  heading(`Initializing GSD-T project: ${projectName}`);
  log("");

  const projectDir = process.cwd();

  // 1. Create project CLAUDE.md
  const claudeMdPath = path.join(projectDir, "CLAUDE.md");
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, "utf8");
    if (content.includes("GSD-T Workflow")) {
      info("CLAUDE.md already contains GSD-T section — skipping");
    } else {
      warn("CLAUDE.md exists but doesn't reference GSD-T");
      info("Run /user:gsd-t-init inside Claude Code to add GSD-T section");
    }
  } else {
    const template = fs.readFileSync(path.join(PKG_TEMPLATES, "CLAUDE-project.md"), "utf8");
    const content = template.replace(/\{Project Name\}/g, projectName);
    fs.writeFileSync(claudeMdPath, content);
    success("CLAUDE.md created");
  }

  // 2. Create docs/ with templates
  const docsDir = path.join(projectDir, "docs");
  ensureDir(docsDir);

  const docTemplates = ["requirements.md", "architecture.md", "workflows.md", "infrastructure.md"];
  const today = new Date().toISOString().split("T")[0];

  for (const file of docTemplates) {
    const destPath = path.join(docsDir, file);
    if (fs.existsSync(destPath)) {
      info(`docs/${file} already exists — skipping`);
    } else {
      let content = fs.readFileSync(path.join(PKG_TEMPLATES, file), "utf8");
      content = content.replace(/\{Project Name\}/g, projectName);
      content = content.replace(/\{Date\}/g, today);
      fs.writeFileSync(destPath, content);
      success(`docs/${file}`);
    }
  }

  // 3. Create .gsd-t/ structure
  const gsdtDir = path.join(projectDir, ".gsd-t");
  const contractsDir = path.join(gsdtDir, "contracts");
  const domainsDir = path.join(gsdtDir, "domains");

  ensureDir(contractsDir);
  ensureDir(domainsDir);

  // .gitkeep files so empty dirs are tracked
  for (const dir of [contractsDir, domainsDir]) {
    const gitkeep = path.join(dir, ".gitkeep");
    if (!fs.existsSync(gitkeep)) {
      fs.writeFileSync(gitkeep, "");
    }
  }

  // Progress file
  const progressPath = path.join(gsdtDir, "progress.md");
  if (fs.existsSync(progressPath)) {
    info(".gsd-t/progress.md already exists — skipping");
  } else {
    let content = fs.readFileSync(path.join(PKG_TEMPLATES, "progress.md"), "utf8");
    content = content.replace(/\{Project Name\}/g, projectName);
    content = content.replace(/\{Date\}/g, today);
    fs.writeFileSync(progressPath, content);
    success(".gsd-t/progress.md");
  }

  // 4. Register in project index
  if (registerProject(projectDir)) {
    success("Registered in ~/.claude/.gsd-t-projects");
  }

  // 5. Summary
  heading("Project Initialized!");
  log("");
  log(`  ${projectDir}/`);
  log(`  ├── CLAUDE.md`);
  log(`  ├── docs/`);
  log(`  │   ├── requirements.md`);
  log(`  │   ├── architecture.md`);
  log(`  │   ├── workflows.md`);
  log(`  │   └── infrastructure.md`);
  log(`  └── .gsd-t/`);
  log(`      ├── progress.md`);
  log(`      ├── contracts/`);
  log(`      └── domains/`);
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

  // Installed version
  const installedVersion = getInstalledVersion();
  if (installedVersion) {
    success(`Installed version: ${versionLink(installedVersion)}`);
    if (installedVersion !== PKG_VERSION) {
      warn(`Latest version: ${versionLink()}`);
      info(`Run 'npx @tekyzinc/gsd-t update' to update`);
    } else {
      success(`Up to date (latest: ${versionLink()})`);
    }
  } else {
    error("GSD-T not installed");
    info("Run 'npx @tekyzinc/gsd-t install' to install");
    return;
  }

  // Commands
  heading("Slash Commands");
  const expected = getCommandFiles();
  const installed = getInstalledCommands();
  const gsdtExpected = getGsdtCommands();
  const utilExpected = getUtilityCommands();

  const missing = expected.filter((f) => !installed.includes(f));
  const extra = installed.filter((f) => !expected.includes(f));
  const present = expected.filter((f) => installed.includes(f));

  log(`  ${present.length}/${expected.length} commands installed (${gsdtExpected.length} GSD-T + ${utilExpected.length} utilities)`);

  if (missing.length > 0) {
    warn(`Missing: ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    info(`Custom commands found: ${extra.join(", ")}`);
  }

  // Global CLAUDE.md
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

  // Settings.json — teams
  heading("Agent Teams");
  if (fs.existsSync(SETTINGS_JSON)) {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_JSON, "utf8"));
      const teamsEnabled =
        settings?.env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1";
      if (teamsEnabled) {
        success("Agent Teams enabled in settings.json");
      } else {
        info("Agent Teams not enabled (optional — solo mode works fine)");
        info('Add "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" to env in settings.json');
      }
    } catch {
      warn("settings.json exists but couldn't be parsed");
    }
  } else {
    info("No settings.json found (Claude Code will use defaults)");
  }

  // Current project
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

  log("");
}

function doUninstall() {
  heading("Uninstalling GSD-T");
  log("");

  // Remove command files
  const commands = getInstalledCommands();
  let removed = 0;
  for (const file of commands) {
    fs.unlinkSync(path.join(COMMANDS_DIR, file));
    removed++;
  }
  if (removed > 0) {
    success(`Removed ${removed} slash commands from ~/.claude/commands/`);
  }

  // Remove version file
  if (fs.existsSync(VERSION_FILE)) {
    fs.unlinkSync(VERSION_FILE);
  }

  // Don't touch CLAUDE.md — too risky, may have customizations
  warn("~/.claude/CLAUDE.md was NOT removed (may contain your customizations)");
  info("Remove manually if desired: delete the GSD-T section from ~/.claude/CLAUDE.md");

  // Don't touch project files
  info("Project files (.gsd-t/, docs/, CLAUDE.md) were NOT removed");

  heading("Uninstall Complete");
  log("");
}

function doUpdateAll() {
  // First, run the normal global update
  const installedVersion = getInstalledVersion();
  if (installedVersion !== PKG_VERSION) {
    doInstall({ update: true });
  } else {
    heading(`GSD-T ${versionLink()}`);
    success("Global commands already up to date");
  }

  // Read project registry
  heading("Updating registered projects...");
  log("");

  const projects = getRegisteredProjects();

  if (projects.length === 0) {
    info("No projects registered");
    log("");
    log("  Projects are registered automatically when you run:");
    log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t init`);
    log("");
    log("  Or register an existing project manually:");
    log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t register`);
    log("");
    return;
  }

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const projectDir of projects) {
    const projectName = path.basename(projectDir);
    const claudeMd = path.join(projectDir, "CLAUDE.md");
    let projectUpdated = false;

    // Check project still exists
    if (!fs.existsSync(projectDir)) {
      warn(`${projectName} — directory not found (${projectDir})`);
      missing++;
      continue;
    }

    if (!fs.existsSync(claudeMd)) {
      warn(`${projectName} — no CLAUDE.md found`);
      skipped++;
      continue;
    }

    const content = fs.readFileSync(claudeMd, "utf8");

    // Check if the project CLAUDE.md needs the Destructive Action Guard
    if (!content.includes("Destructive Action Guard")) {
      const guardSection = [
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

      let newContent;
      const preCommitMatch = content.match(/\n(#{1,3} Pre-Commit Gate)/);
      const dontDoMatch = content.match(/\n(#{1,3} Don't Do These Things)/);

      if (preCommitMatch) {
        newContent = content.replace(
          "\n" + preCommitMatch[1],
          guardSection + "\n" + preCommitMatch[1]
        );
      } else if (dontDoMatch) {
        newContent = content.replace(
          "\n" + dontDoMatch[1],
          guardSection + "\n" + dontDoMatch[1]
        );
      } else {
        newContent = content + guardSection;
      }

      fs.writeFileSync(claudeMd, newContent);
      success(`${projectName} — added Destructive Action Guard`);
      projectUpdated = true;
    }

    // Create CHANGELOG.md if it doesn't exist
    const changelogPath = path.join(projectDir, "CHANGELOG.md");
    if (!fs.existsSync(changelogPath)) {
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
      fs.writeFileSync(changelogPath, changelogContent);
      success(`${projectName} — created CHANGELOG.md`);
      projectUpdated = true;
    }

    if (projectUpdated) {
      updated++;
    } else {
      info(`${projectName} — already up to date`);
      skipped++;
    }
  }

  // Summary
  log("");
  heading("Update All Complete");
  log(`  Projects registered: ${projects.length}`);
  log(`  Updated:             ${updated}`);
  log(`  Already current:     ${skipped}`);
  if (missing > 0) {
    log(`  Not found:           ${missing}`);
  }
  log("");
}

function doDoctor() {
  heading("GSD-T Doctor");
  log("");

  let issues = 0;

  // 1. Node version
  const nodeVersion = parseInt(process.version.slice(1));
  if (nodeVersion >= 16) {
    success(`Node.js ${process.version}`);
  } else {
    error(`Node.js ${process.version} — requires >= 16`);
    issues++;
  }

  // 2. Claude Code installed?
  try {
    const claudeVersion = execSync("claude --version 2>&1", { encoding: "utf8" }).trim();
    success(`Claude Code: ${claudeVersion}`);
  } catch {
    warn("Claude Code CLI not found in PATH");
    info("Install with: npm install -g @anthropic-ai/claude-code");
    issues++;
  }

  // 3. ~/.claude/ exists?
  if (fs.existsSync(CLAUDE_DIR)) {
    success("~/.claude/ directory exists");
  } else {
    error("~/.claude/ directory not found");
    info("Run 'npx @tekyzinc/gsd-t install' to create it");
    issues++;
  }

  // 4. Commands installed?
  const installed = getInstalledCommands();
  const expected = getCommandFiles();
  if (installed.length === expected.length) {
    success(`All ${expected.length} commands installed`);
  } else if (installed.length > 0) {
    warn(`${installed.length}/${expected.length} commands installed`);
    const missing = expected.filter((f) => !installed.includes(f));
    info(`Missing: ${missing.join(", ")}`);
    issues++;
  } else {
    error("No GSD-T commands installed");
    issues++;
  }

  // 5. CLAUDE.md
  if (fs.existsSync(GLOBAL_CLAUDE_MD)) {
    const content = fs.readFileSync(GLOBAL_CLAUDE_MD, "utf8");
    if (content.includes("GSD-T")) {
      success("CLAUDE.md contains GSD-T config");
    } else {
      warn("CLAUDE.md exists but missing GSD-T section");
      issues++;
    }
  } else {
    error("No global CLAUDE.md");
    issues++;
  }

  // 6. settings.json valid?
  if (fs.existsSync(SETTINGS_JSON)) {
    try {
      JSON.parse(fs.readFileSync(SETTINGS_JSON, "utf8"));
      success("settings.json is valid JSON");
    } catch (e) {
      error(`settings.json has invalid JSON: ${e.message}`);
      issues++;
    }
  } else {
    info("No settings.json (not required)");
  }

  // 7. Check for encoding issues in command files
  let encodingIssues = 0;
  for (const file of installed) {
    const content = fs.readFileSync(path.join(COMMANDS_DIR, file), "utf8");
    if (content.includes("â€") || content.includes("Ã")) {
      encodingIssues++;
    }
  }
  if (encodingIssues > 0) {
    error(`${encodingIssues} command files have encoding issues (corrupted characters)`);
    info("Run 'npx @tekyzinc/gsd-t update' to replace with clean versions");
    issues++;
  } else if (installed.length > 0) {
    success("No encoding issues in command files");
  }

  // Summary
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

function checkForUpdates() {
  // Skip check for update/install/update-all (they handle it themselves)
  const skipCommands = ["install", "update", "update-all", "--version", "-v"];
  if (skipCommands.includes(command)) return;

  // Read cache (sync, fast)
  let cached = null;
  try {
    if (fs.existsSync(UPDATE_CHECK_FILE)) {
      cached = JSON.parse(fs.readFileSync(UPDATE_CHECK_FILE, "utf8"));
    }
  } catch { /* ignore corrupt cache */ }

  // Show notice from cache if a newer version is available
  if (cached && cached.latest && isNewerVersion(cached.latest, PKG_VERSION)) {
    showUpdateNotice(cached.latest);
  }

  // Refresh cache in background if stale (older than 1h) or missing
  const isStale = !cached || (Date.now() - cached.timestamp) > 3600000;
  if (isStale) {
    const script = `
      const https = require("https");
      const fs = require("fs");
      https.get("https://registry.npmjs.org/@tekyzinc/gsd-t/latest",
        { timeout: 5000 }, (res) => {
        let d = "";
        res.on("data", (c) => d += c);
        res.on("end", () => {
          try {
            const v = JSON.parse(d).version;
            fs.writeFileSync(${JSON.stringify(UPDATE_CHECK_FILE)},
              JSON.stringify({ latest: v, timestamp: Date.now() }));
          } catch {}
        });
      }).on("error", () => {});
    `.replace(/\n/g, "");
    const { spawn } = require("child_process");
    const child = spawn(process.execPath, ["-e", script], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }
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
  const openCmd =
    process.platform === "win32" ? "start" :
    process.platform === "darwin" ? "open" : "xdg-open";
  try {
    execSync(`${openCmd} ${CHANGELOG_URL}`, { stdio: "ignore" });
    success(`Opened changelog in browser`);
  } catch {
    // Fallback: print the URL
    log(`\n  ${CHANGELOG_URL}\n`);
  }
}

function showHelp() {
  log("");
  log(`${BOLD}GSD-T${RESET} — Contract-Driven Development for Claude Code`);
  log("");
  log(`${BOLD}Usage:${RESET}`);
  log(`  npx @tekyzinc/gsd-t ${CYAN}<command>${RESET} [options]`);
  log("");
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
  log(`  ${CYAN}help${RESET}           Show this help`);
  log("");
  log(`${BOLD}Examples:${RESET}`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t install`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t init my-saas-app`);
  log(`  ${DIM}$${RESET} npx @tekyzinc/gsd-t update`);
  log("");
  log(`${BOLD}After installing, use in Claude Code:${RESET}`);
  log(`  ${DIM}>${RESET} /user:gsd-t-project "Build a task management app"`);
  log(`  ${DIM}>${RESET} /user:gsd-t-wave`);
  log("");
  log(`${DIM}Docs: https://github.com/Tekyz-Inc/get-stuff-done-teams${RESET}`);
  log("");
}

// ─── Main ────────────────────────────────────────────────────────────────────

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

checkForUpdates();
