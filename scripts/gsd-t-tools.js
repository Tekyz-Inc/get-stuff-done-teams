#!/usr/bin/env node
'use strict';
// gsd-t-tools.js — GSD-T state utility CLI. Zero external dependencies.
// Returns compact JSON. Subcommands: state, validate, parse, list, git, template
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Find nearest .gsd-t/ directory walking up from cwd
function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.gsd-t'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const root = findProjectRoot();
const gsdDir = path.join(root, '.gsd-t');

function readProgress() {
  const p = path.join(gsdDir, 'progress.md');
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function stateGet(key) {
  const content = readProgress();
  if (!content) return { error: 'progress.md not found' };
  const re = new RegExp(`^## ${escapeRe(key)}:\\s*(.+)`, 'm');
  const m = content.match(re);
  if (!m) return { error: `key not found: ${key}` };
  return { key, value: m[1].trim() };
}

function stateSet(key, value) {
  const p = path.join(gsdDir, 'progress.md');
  if (!fs.existsSync(p)) return { error: 'progress.md not found' };
  const content = fs.readFileSync(p, 'utf8');
  const re = new RegExp(`(^## ${escapeRe(key)}:\\s*)(.+)`, 'm');
  if (!re.test(content)) return { error: `key not found: ${key}` };
  fs.writeFileSync(p, content.replace(re, `$1${value}`));
  return { ok: true, key, value };
}

function validate() {
  const required = [
    '.gsd-t/progress.md',
    '.gsd-t/contracts',
    '.gsd-t/domains',
    'CLAUDE.md',
  ];
  const results = {};
  const missing = [];
  for (const f of required) {
    const exists = fs.existsSync(path.join(root, f));
    results[f] = exists ? 'ok' : 'missing';
    if (!exists) missing.push(f);
  }
  return { valid: missing.length === 0, results, missing };
}

function parseSection(sectionName) {
  const content = readProgress();
  if (!content) return { error: 'progress.md not found' };
  const re = new RegExp(`## ${escapeRe(sectionName)}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const m = content.match(re);
  if (!m) return { error: `section not found: ${sectionName}` };
  return { section: sectionName, content: m[1].trim() };
}

function listDomains() {
  const dir = path.join(gsdDir, 'domains');
  if (!fs.existsSync(dir)) return { domains: [] };
  const domains = fs.readdirSync(dir).filter(f => {
    try { return fs.statSync(path.join(dir, f)).isDirectory(); } catch { return false; }
  });
  return { domains };
}

function listContracts() {
  const dir = path.join(gsdDir, 'contracts');
  if (!fs.existsSync(dir)) return { contracts: [] };
  const contracts = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  return { contracts };
}

function preCommitCheck() {
  const result = {};
  try {
    result.branch = execSync('git branch --show-current', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    result.branch = 'error';
  }
  try {
    const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf8' }).trim();
    result.clean = status.length === 0;
    result.changes = status ? status.split('\n').filter(Boolean) : [];
  } catch {
    result.clean = 'error';
  }
  try {
    result.lastCommit = execSync('git log -1 --format="%h %s"', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    result.lastCommit = 'error';
  }
  return result;
}

function templateScope(domain) {
  const p = path.join(gsdDir, 'domains', domain, 'scope.md');
  if (!fs.existsSync(p)) return { error: `scope.md not found for domain: ${domain}` };
  return { domain, scope: fs.readFileSync(p, 'utf8') };
}

function templateTasks(domain) {
  const p = path.join(gsdDir, 'domains', domain, 'tasks.md');
  if (!fs.existsSync(p)) return { error: `tasks.md not found for domain: ${domain}` };
  return { domain, tasks: fs.readFileSync(p, 'utf8') };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Parse args
const args = process.argv.slice(2);
const [cmd, subcmd, ...rest] = args;

let result;
if (cmd === 'state') {
  if (subcmd === 'get' && rest[0]) {
    result = stateGet(rest[0]);
  } else if (subcmd === 'set' && rest[0] && rest[1]) {
    result = stateSet(rest[0], rest[1]);
  } else {
    result = { error: 'Usage: state get <key> | state set <key> <value>' };
  }
} else if (cmd === 'validate') {
  result = validate();
} else if (cmd === 'parse' && subcmd === 'progress') {
  const si = args.indexOf('--section');
  const section = si !== -1 ? args[si + 1] : null;
  result = section ? parseSection(section) : { error: 'Usage: parse progress --section <name>' };
} else if (cmd === 'list') {
  if (subcmd === 'domains') result = listDomains();
  else if (subcmd === 'contracts') result = listContracts();
  else result = { error: 'Usage: list domains | list contracts' };
} else if (cmd === 'git' && subcmd === 'pre-commit-check') {
  result = preCommitCheck();
} else if (cmd === 'template') {
  if (subcmd === 'scope' && rest[0]) result = templateScope(rest[0]);
  else if (subcmd === 'tasks' && rest[0]) result = templateTasks(rest[0]);
  else result = { error: 'Usage: template scope <domain> | template tasks <domain>' };
} else {
  result = {
    error: cmd ? `Unknown command: ${cmd}` : 'No command specified',
    usage: 'state get|set  validate  parse progress --section <name>  list domains|contracts  git pre-commit-check  template scope|tasks <domain>',
  };
}

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
