#!/usr/bin/env node
/**
 * gsd-t-worktree-check.js — SessionStart hook.
 *
 * First removes every worktree whose branch is merged into its target, whose
 * every file has an identical copy in the main checkout, and that no Claude
 * session has open — this session start, in any folder of the project, is the
 * "after you exited" moment. [RULE] removal-timing
 *
 * Then warns (never blocks) when, in this project:
 *   - a worktree's branch has commits on no remote
 *   - a worktree's branch has been unmerged into its target for more than 3 days
 *   - a worktree's branch is merged but the worktree was kept (with the reason)
 *   - an integration branch is ahead of main
 * The first session inside a recorded worktree is stamped as its owner session.
 *
 * Silent outside a git repo or a GSD-T project. A check that cannot run says so
 * on stdout and still exits 0 — [RULE] warnings-never-block.
 *
 * Plan: .gsd-t/pseudocode/PseudoCode-WorktreeLifecycle.md
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const lifecycle = require(path.join(__dirname, '..', 'bin', 'gsd-t-worktree-lifecycle.cjs'));

function hookInput() {
  if (process.stdin.isTTY) return {};
  const raw = fs.readFileSync(0, 'utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function insideGitRepo(dir) {
  const r = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: dir, encoding: 'utf8', timeout: 10000 });
  return r.status === 0;
}

function report(lines) {
  process.stdout.write(`[GSD-T WORKTREES] ${lines.join('\n  ')}\n`);
}

function run() {
  const input = hookInput();
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  if (!insideGitRepo(cwd)) return;
  const main = lifecycle.mainCheckout(cwd);
  if (!fs.existsSync(path.join(main, '.gsd-t'))) return;
  lifecycle.stampSession(cwd, input.session_id);
  const swept = lifecycle.finish(cwd, { remove: true });
  const out = swept.removed.map((r) => `✓ removed finished worktree ${r.branch} (${r.path}) — merged, every file matches main; branch kept`);
  // Merged but kept: say why, in place of the generic "still present" warning.
  const keptMerged = swept.blocked.filter((k) => k.merged && k.started);
  const kept = new Set(keptMerged.map((k) => k.branch));
  for (const k of keptMerged) out.push(`⚠ ${k.branch}: merged but kept — ${k.why.join('; ')}`);
  for (const k of swept.failed) out.push(`⚠ ${lifecycle.failedLine(k, k.path)}`);
  for (const k of swept.failed) kept.add(k.branch);
  const w = lifecycle.warnings(lifecycle.audit(cwd, { prune: false, scope: 'worktrees' }))
    .filter((x) => !(kept.has(x.split(':')[0]) && x.includes(': merged into ')));
  for (const x of w) out.push(`⚠ ${x}`);
  if (!out.length) return;
  report(['worktrees:'].concat(out, ['Details: gsd-t worktrees audit']));
}

function warnNotBlock(e) {
  report([`worktree check could not run: ${e.message}`]);
  process.exit(0);
}

try {
  run();
} catch (e) {
  warnNotBlock(e);
}
