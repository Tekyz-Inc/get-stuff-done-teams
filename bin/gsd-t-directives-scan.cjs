'use strict';

/**
 * gsd-t-directives-scan — find a project's directive files that still point at
 * retired GSD-T commands.
 *
 * Directive files are what Claude (or another agent) reads as standing
 * instructions: CLAUDE.md at any depth, AGENTS.md, .cursorrules, project
 * .claude/ commands, skills, rules, agents and settings. After v6 removed most
 * commands, a project rule like "run /gsd-t-verify before done" sends every
 * session after a command that no longer exists.
 *
 * Detection only — deterministic, read-only. The rewrite is a judgment call on
 * the project's own prose, so /gsd-t-tidy-directives does it.
 *
 *   gsd-t directives-scan [dir] [--json]
 */

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', 'vendor',
  '.venv', 'venv', '__pycache__', '.gsd-t', '.demo-build', 'test-results',
]);
const MAX_DEPTH = 4;

/** Directive files directly named, relative to the project root. */
const FIXED = [
  'CLAUDE.local.md', 'AGENTS.md', 'GEMINI.md', '.cursorrules',
  '.github/copilot-instructions.md', '.claude/settings.json', '.claude/settings.local.json',
];
/** Folders whose files are all directives. */
const DIRECTIVE_DIRS = ['.cursor/rules', '.claude/commands', '.claude/rules', '.claude/agents'];

/** Every CLAUDE.md up to MAX_DEPTH, skipping build output, deps and worktrees. */
function findClaudeMds(root) {
  const out = [];
  const walk = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) {
      if (e.code === 'EACCES' || e.code === 'EPERM') return; // a folder we may not read holds nothing we can fix
      throw e;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isFile() && e.name === 'CLAUDE.md') out.push(p);
      if (e.isDirectory() && depth < MAX_DEPTH && !SKIP_DIRS.has(e.name) &&
          !p.includes(`${path.sep}.claude${path.sep}worktrees`)) {
        walk(p, depth + 1);
      }
    }
  };
  walk(root, 0);
  return out;
}

/** All directive files in a project (real files only — a symlink is reported through its target). */
function directiveFiles(root) {
  const files = new Set(findClaudeMds(root));
  for (const rel of FIXED) files.add(path.join(root, rel));
  for (const rel of DIRECTIVE_DIRS) {
    const d = path.join(root, rel);
    if (fs.existsSync(d) && fs.statSync(d).isDirectory()) {
      for (const f of fs.readdirSync(d)) files.add(path.join(d, f));
    }
  }
  const skills = path.join(root, '.claude', 'skills');
  if (fs.existsSync(skills) && fs.statSync(skills).isDirectory()) {
    for (const s of fs.readdirSync(skills)) files.add(path.join(skills, s, 'SKILL.md'));
  }
  // Candidates are listed whether or not they exist; keep the real files.
  return [...files].filter((f) => fs.existsSync(f) && fs.lstatSync(f).isFile());
}

/** Retired command names: every gsd-t-*.md GSD-T ever shipped minus what ships now. */
function retiredCommandNames(everShipped, shippingNow) {
  const now = new Set(shippingNow);
  return everShipped.filter((f) => !now.has(f)).map((f) => f.replace(/\.md$/, ''));
}

/** Lines in the project's directive files that mention a retired command or the retired domains folder. */
function scan(root, retiredNames) {
  const names = [...retiredNames].sort((a, b) => b.length - a.length).map((n) => n.replace(/[-]/g, '\\-'));
  const re = new RegExp(`(?<![\\w-])(${names.join('|')})(?![\\w-])|\\.gsd-t/domains\\b`, 'g');
  const hits = [];
  for (const file of directiveFiles(root)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((text, i) => {
      for (const m of text.matchAll(re)) {
        hits.push({ file: path.relative(root, file), line: i + 1, term: m[1] || '.gsd-t/domains', text: text.trim().slice(0, 200) });
      }
    });
  }
  return hits;
}

/** Group hits by file: { file: [terms] } */
function summarize(hits) {
  const by = {};
  for (const h of hits) (by[h.file] = by[h.file] || new Set()).add(h.term);
  return Object.fromEntries(Object.entries(by).map(([f, s]) => [f, [...s].sort()]));
}

module.exports = { directiveFiles, retiredCommandNames, scan, summarize, SKIP_DIRS };
