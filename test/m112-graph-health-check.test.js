'use strict';

/**
 * M112 — 20 of 27 projects had no usable code graph, and nothing said so.
 *
 * binvoice, 2026-08-11: a session reached for the graph, found nothing, and read
 * the code by grep instead — in an 827-file project. `update-all` had been
 * reporting that project as current for months, because it was: every file GSD-T
 * ships was in place. The graph is not a shipped file. It is built state, built
 * only when someone runs `gsd-t graph index` by hand, and no propagation step
 * creates it.
 *
 * Checking for it exposed a second, larger failure. M99 moved the store from
 * `.gsd-t/graph.db` to `.gsd-t/graphDB/graph.db` — it changed where the code
 * LOOKS without moving what was already there. 18 projects still hold a real,
 * populated graph at the old path that every tool now walks straight past.
 *
 *     never built        2  (binvoice, newman)      — no graph exists
 *     at the old path   18  — a graph exists, invisible to the tooling
 *     working            7
 *
 * So the check must tell those two apart. Telling someone to build a graph they
 * already have would be wrong twice: the work is done, and the actual fault —
 * a store the tooling cannot see — would go unnamed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const CLI = fs.readFileSync(path.join(REPO, 'bin', 'gsd-t.js'), 'utf8');

// The check, exercised through the real module rather than described.
const { graphState } = (() => {
  const mod = require(path.join(REPO, 'bin', 'gsd-t.js'));
  return mod && mod.graphState ? mod : { graphState: null };
})();

function probe(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm112-graphhealth-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return dir;
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

// A project with enough source that a graph is worth having.
function sourceFiles(n) {
  const out = {};
  for (let i = 0; i < n; i++) out[`src/mod${i}.ts`] = `export const v${i} = ${i};\n`;
  return out;
}

test('M112: a real codebase with no graph is reported', (t) => {
  if (!graphState) return t.skip('graphState not exported');
  const dir = probe({ '.gsd-t/progress.md': '# p\n', ...sourceFiles(40) });
  try {
    const g = graphState(dir);
    assert.equal(g.missing, true, 'binvoice had 827 files and no graph — that must surface');
    assert.ok(g.files >= 25, `the file count is the evidence, got ${g.files}`);
  } finally { rm(dir); }
});

test('M112: a project with a built graph is silent', (t) => {
  if (!graphState) return t.skip('graphState not exported');
  const dir = probe({
    '.gsd-t/progress.md': '# p\n',
    '.gsd-t/graphDB/graph.db': 'x',
    ...sourceFiles(40),
  });
  try {
    assert.equal(graphState(dir).missing, false, 'a working project must not be nagged');
  } finally { rm(dir); }
});

test('M112: a graph at the OLD path is not called missing', (t) => {
  if (!graphState) return t.skip('graphState not exported');
  // 18 projects are in this state. "Never built" would be a lie, and would send
  // the user to rebuild something they already have.
  const dir = probe({
    '.gsd-t/progress.md': '# p\n',
    '.gsd-t/graph.db': 'x',
    ...sourceFiles(40),
  });
  try {
    const g = graphState(dir);
    assert.equal(g.missing, false, 'the graph exists — it is merely where nothing looks');
    assert.equal(g.legacy, true, 'and that is its own distinct problem, reported separately');
  } finally { rm(dir); }
});

test('M112: a project with almost no source is not nagged', (t) => {
  if (!graphState) return t.skip('graphState not exported');
  // A docs-only or config-only repo has nothing for a graph to map. Warning
  // about it every run is noise, and noise is what gets a report ignored.
  const dir = probe({ '.gsd-t/progress.md': '# p\n', 'README.md': '# hi\n', 'src/one.ts': 'export const a = 1;\n' });
  try {
    assert.equal(graphState(dir).missing, false, 'too little code to warrant a graph');
  } finally { rm(dir); }
});

test('M112: vendored trees do not make an empty project look like a codebase', (t) => {
  if (!graphState) return t.skip('graphState not exported');
  const files = { '.gsd-t/progress.md': '# p\n' };
  for (let i = 0; i < 60; i++) files[`node_modules/pkg/f${i}.js`] = 'module.exports = 1;\n';
  const dir = probe(files);
  try {
    assert.equal(graphState(dir).missing, false, 'dependencies are not this project\'s source');
  } finally { rm(dir); }
});

test('M112: a missing graph is BUILT, not merely reported', () => {
  // David's rule, 2026-08-11: "if the graph is missing, then build it. If the
  // graph is out of date, then update it. Never grep, except where grep is the
  // only option because the answer lives in a file that can't be graph indexed."
  //
  // The prior contract said HALT on an absent graph. A halt would have been
  // correct 20 times across this machine and repaired nothing.
  assert.match(CLI, /graph-missing-is-built-not-reported/, 'the rule must be in the guard map');
  assert.match(CLI, /function migrateLegacyGraph/, 'a store at the old path is MOVED');
  assert.match(CLI, /function buildGraph/, 'and an absent one is BUILT');
  assert.match(CLI, /building code graph for/, 'a slow build must announce itself before it runs');
});

test('M112: a build that fails is reported, never counted as repaired', () => {
  // A project left without a graph must say so — the next session there needs to
  // halt, not quietly grep.
  assert.match(CLI, /graph \$\{f\.what\} FAILED/, 'the failure names which repair failed');
  assert.match(CLI, /indexer reported success but no store was written/,
    'the indexer reporting success is not proof a store landed — verify the file');
});

test('M112: the contract now says repair, not halt', () => {
  const contract = fs.readFileSync(
    path.join(REPO, '.gsd-t', 'contracts', 'graph-consumer-wiring-contract.md'), 'utf8');
  assert.match(contract, /REPAIR IT, do not merely halt/,
    'the FAIL-LOUD invariant must repair an absent graph before halting');
  assert.match(contract, /grep is not a degraded answer, it is a different and wrong one/,
    'and must say why grep is not a substitute for a structural answer');
});

test('M112: the rule reaches plain sessions, not only wired commands', () => {
  // The binvoice failure was ordinary conversational work. The contract governs
  // wired commands only, so the rule has to live where every session reads it.
  const global = fs.readFileSync(path.join(REPO, 'templates', 'CLAUDE-global.md'), 'utf8');
  assert.match(global, /Code Graph — build it, never grep around it/,
    'every project must inherit the rule');
  assert.match(global, /governs plain conversational work/,
    'and it must say it applies outside /gsd-t-* commands');
});

test('M112: the two states get different repairs, and are reported apart', () => {
  // They are not the same fault. A store at the old path holds a complete index
  // and needs a move; an absent one needs a full build. Collapsing them would
  // either reindex 18 projects that did not need it, or move nothing.
  assert.match(CLI, /Code graph moved to where the tooling reads it:/, 'the move reports itself');
  assert.match(CLI, /Code graph built:/, 'and the build reports itself separately');
  assert.match(CLI, /health-reports-missing-graph-never-assumes-built/,
    'the rule must be in the guard map');
});

test('M112: the resolver decides where a store lives — the check never hardcodes it', () => {
  // Hardcoding the path here is how this check would silently rot the next time
  // the store moves, which is the very bug it just exposed.
  const fn = CLI.slice(CLI.indexOf('function graphState'), CLI.indexOf('async function checkProjectHealth'));
  assert.match(fn, /resolveStorePath/, 'the current path comes from the resolver');
  assert.match(fn, /resolveLegacyStorePath/, 'and so does the old one');
  assert.ok(!/graphDB\/graph\.db/.test(fn), 'no literal store path may appear in the check');
});
