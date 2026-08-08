#!/usr/bin/env node
/**
 * gsd-t-claude-md-changelog.cjs
 *
 * M110: CLAUDE.md changelog tracking.
 * Maintains an append-only changelog for CLAUDE.md mutations.
 *
 * Commands:
 *   scaffold <projectDir>              Create changelog file if missing
 *   append <projectDir> <type> [desc]  Append an entry (rewritten|updated|external)
 *   check-external <projectDir>        Detect external updates (mtime > last entry)
 *   get-last-entry-time <projectDir>   Return ISO timestamp of last entry (for hooks)
 *
 * Entry format:
 *   **[Rewritten|Updated|External update detected] {date} {time} | {model} | GSD-T v{gsdtVersion} | project v{projectVersion}**
 *   - bullet 1 (for Updated only)
 *   - bullet 2
 *
 * Exit codes:
 *   0 — success / up-to-date
 *   1 — external update detected (check-external only)
 *   2 — corrupt changelog (HALT)
 *   64 — bad input
 */

const fs = require('fs');
const path = require('path');

const CHANGELOG_FILENAME = 'CLAUDE.md updates.md';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getChangelogPath(projectDir) {
  return path.join(projectDir, CHANGELOG_FILENAME);
}

function getClaudeMdPath(projectDir) {
  const rootPath = path.join(projectDir, 'CLAUDE.md');
  const dotClaudePath = path.join(projectDir, '.claude', 'CLAUDE.md');
  if (fs.existsSync(rootPath)) return rootPath;
  if (fs.existsSync(dotClaudePath)) return dotClaudePath;
  return rootPath;
}

function halt(message, exitCode) {
  console.error(JSON.stringify({ error: message }));
  process.exit(exitCode);
}

function getGsdtVersion() {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  if (!fs.existsSync(pkgPath)) {
    halt('GSD-T package.json not found: ' + pkgPath, 64);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.version) {
    halt('GSD-T package.json missing version field', 64);
  }
  return pkg.version;
}

function getProjectVersion(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.version) return pkg.version;
  }
  const pyprojectPath = path.join(projectDir, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    const content = fs.readFileSync(pyprojectPath, 'utf8');
    const match = content.match(/version\s*=\s*["']([^"']+)["']/);
    if (match) return match[1];
  }
  return 'unversioned';
}

function getClaudeModel() {
  const model = process.env.CLAUDE_MODEL || process.env.MODEL;
  if (!model) return 'Claude';
  if (model.includes('opus-5') || model.includes('opus5')) return 'Claude-Opus-5';
  if (model.includes('opus-4.5') || model.includes('opus4.5')) return 'Claude-Opus-4.5';
  if (model.includes('opus')) return 'Claude-Opus';
  if (model.includes('sonnet-5') || model.includes('sonnet5')) return 'Claude-Sonnet-5';
  if (model.includes('sonnet')) return 'Claude-Sonnet';
  if (model.includes('haiku')) return 'Claude-Haiku';
  return model;
}

function formatDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  let hours = date.getHours();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month} ${day}, ${year} ${hours}:${minutes}${ampm}`;
}

/**
 * Parse the timestamp of the last entry in the changelog.
 *
 * @returns {Date | null} Date of last entry, or null if no file/entries
 * @throws Calls halt() and exits if changelog is corrupt
 */
function parseLastEntryTime(changelogPath) {
  if (!fs.existsSync(changelogPath)) {
    return null;
  }

  const content = fs.readFileSync(changelogPath, 'utf8');

  const hasHeader = content.includes('# CLAUDE.md Change Log');
  const hasEntries = content.includes('**Rewritten') ||
                     content.includes('**Updated') ||
                     content.includes('**External update detected');

  if (hasHeader && !hasEntries) {
    return null;
  }

  // Match entries with optional ~ before time (e.g., "~3:00pm" or "3:00pm")
  const entryPattern = /\*\*(?:Rewritten|Updated|External update detected)\s+(\w+\s+\d+,\s+\d{4}\s+~?\d{1,2}:\d{2}(?:am|pm))/gi;

  let lastMatch = null;
  let match;
  while ((match = entryPattern.exec(content)) !== null) {
    lastMatch = match[1];
  }

  if (!lastMatch) {
    halt('Changelog file is corrupt — has content but no parseable entries: ' + changelogPath, 2);
  }

  // Remove optional ~ and parse the date
  const parsed = new Date(lastMatch.replace(/~/, '').replace(/(\d{1,2}:\d{2})(am|pm)/i, (_, time, ampm) => {
    const [h, m] = time.split(':');
    let hour = parseInt(h, 10);
    if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12;
    if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${m}`;
  }));

  if (isNaN(parsed.getTime())) {
    halt('Changelog file has unparseable date: ' + changelogPath, 2);
  }

  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

function scaffold(projectDir) {
  const changelogPath = getChangelogPath(projectDir);

  if (fs.existsSync(changelogPath)) {
    console.log(JSON.stringify({ status: 'exists', path: changelogPath }));
    process.exit(0);
  }

  const content = `# CLAUDE.md Change Log

Append-only record of CLAUDE.md rewrites and updates.

---

`;

  fs.writeFileSync(changelogPath, content, 'utf8');
  console.log(JSON.stringify({ status: 'created', path: changelogPath }));
  process.exit(0);
}

function append(projectDir, type, description, bullets) {
  const changelogPath = getChangelogPath(projectDir);

  if (!fs.existsSync(changelogPath)) {
    const content = `# CLAUDE.md Change Log

Append-only record of CLAUDE.md rewrites and updates.

---

`;
    fs.writeFileSync(changelogPath, content, 'utf8');
  }

  const now = new Date();
  const dateStr = formatDate(now);
  const model = getClaudeModel();
  const gsdtVersion = getGsdtVersion();
  const projectVersion = getProjectVersion(projectDir);

  let typeLabel;
  switch (type.toLowerCase()) {
    case 'rewritten':
    case 'rewrite':
      typeLabel = 'Rewritten';
      break;
    case 'updated':
    case 'update':
      typeLabel = 'Updated';
      break;
    case 'external':
      typeLabel = 'External update detected';
      break;
    default:
      halt('Unknown type: ' + type + '. Use: rewritten, updated, external', 64);
  }

  let entry = `\n**${typeLabel} ${dateStr} | ${model} | GSD-T v${gsdtVersion} | project v${projectVersion}**\n`;

  if (description && typeLabel === 'Rewritten') {
    entry += `\n${description}\n`;
  }

  if (bullets && bullets.length > 0 && typeLabel === 'Updated') {
    entry += '\n';
    for (const bullet of bullets) {
      entry += `- ${bullet}\n`;
    }
  }

  fs.appendFileSync(changelogPath, entry, 'utf8');
  console.log(JSON.stringify({
    status: 'appended',
    type: typeLabel,
    path: changelogPath,
    timestamp: now.toISOString()
  }));
  process.exit(0);
}

/**
 * check-external: Detects if CLAUDE.md was modified outside GSD-T.
 *
 * Exit codes:
 *   0 — up to date, no action needed
 *   1 — external update detected, caller should append entry
 *   2 — changelog is corrupt (HALT)
 */
function checkExternal(projectDir) {
  const changelogPath = getChangelogPath(projectDir);
  const claudeMdPath = getClaudeMdPath(projectDir);

  if (!fs.existsSync(claudeMdPath)) {
    console.log(JSON.stringify({ status: 'no-claude-md', path: claudeMdPath }));
    process.exit(0);
  }

  const claudeMdStat = fs.statSync(claudeMdPath);
  const claudeMdMtime = claudeMdStat.mtime;

  const lastEntryTime = parseLastEntryTime(changelogPath);

  if (lastEntryTime === null) {
    console.log(JSON.stringify({
      status: 'external-detected',
      reason: 'no-prior-entries',
      claudeMdMtime: claudeMdMtime.toISOString()
    }));
    process.exit(1);
  }

  const bufferMs = 60 * 1000;

  if (claudeMdMtime.getTime() > lastEntryTime.getTime() + bufferMs) {
    console.log(JSON.stringify({
      status: 'external-detected',
      reason: 'mtime-newer',
      claudeMdMtime: claudeMdMtime.toISOString(),
      lastEntryTime: lastEntryTime.toISOString()
    }));
    process.exit(1);
  }

  console.log(JSON.stringify({
    status: 'up-to-date',
    claudeMdMtime: claudeMdMtime.toISOString(),
    lastEntryTime: lastEntryTime.toISOString()
  }));
  process.exit(0);
}

function getLastEntryTime(projectDir) {
  const changelogPath = getChangelogPath(projectDir);
  const result = parseLastEntryTime(changelogPath);

  if (result === null) {
    console.log(JSON.stringify({ status: 'none' }));
    process.exit(0);
  }

  console.log(JSON.stringify({
    status: 'found',
    timestamp: result.toISOString()
  }));
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.error('Usage: gsd-t-claude-md-changelog <command> [args]');
    console.error('Commands: scaffold, append, check-external, get-last-entry-time');
    process.exit(64);
  }

  switch (command) {
    case 'scaffold': {
      const projectDir = args[1] || process.cwd();
      scaffold(projectDir);
      break;
    }
    case 'append': {
      const projectDir = args[1] || process.cwd();
      const type = args[2];
      const description = args[3];
      let bullets = [];
      if (args[4]) {
        const parsed = JSON.parse(args[4]);
        if (!Array.isArray(parsed)) {
          halt('Bullets must be a JSON array', 64);
        }
        bullets = parsed;
      }
      if (!type) {
        halt('Usage: gsd-t-claude-md-changelog append <projectDir> <type> [description] [bulletsJson]', 64);
      }
      append(projectDir, type, description, bullets);
      break;
    }
    case 'check-external': {
      const projectDir = args[1] || process.cwd();
      checkExternal(projectDir);
      break;
    }
    case 'get-last-entry-time': {
      const projectDir = args[1] || process.cwd();
      getLastEntryTime(projectDir);
      break;
    }
    default:
      halt('Unknown command: ' + command, 64);
  }
}

main();
