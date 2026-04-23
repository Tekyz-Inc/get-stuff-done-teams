"use strict";

/**
 * M44 D1-T3 — task-graph unit tests
 *
 * Covers:
 *   - single-domain parse
 *   - multi-domain parse with cross-domain dep edges
 *   - cycle detection throws TaskGraphCycleError with cycle path
 *   - ready-mask correct after marking a dep DONE
 *   - touches: [] fallback when both **Touches** and scope.md "Files Owned"
 *     are absent
 *   - unknown status marker → pending + warning
 *   - dep-list "none" handling
 *   - parenthetical-stripping in deps and touches
 *   - performance budget (< 200 ms on a 50-domain / 250-task fixture)
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildTaskGraph,
  getReadyTasks,
  TaskGraphCycleError,
  _parseDepList,
  _parseFileList,
  _parseScopeFilesOwned,
} = require("../bin/gsd-t-task-graph.cjs");

// ─── fixture builders ───────────────────────────────────────────────────

function mkProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "m44-tg-"));
  fs.mkdirSync(path.join(root, ".gsd-t", "domains"), { recursive: true });
  return root;
}

function mkDomain(root, domain, { tasksMd, scopeMd } = {}) {
  const dir = path.join(root, ".gsd-t", "domains", domain);
  fs.mkdirSync(dir, { recursive: true });
  if (tasksMd != null) fs.writeFileSync(path.join(dir, "tasks.md"), tasksMd);
  if (scopeMd != null) fs.writeFileSync(path.join(dir, "scope.md"), scopeMd);
  return dir;
}

// ─── single-domain parse ────────────────────────────────────────────────

test("single-domain parse: nodes/edges/ready/touches all populated", () => {
  const root = mkProject();
  mkDomain(root, "m99-d1-foo", {
    tasksMd: `# Tasks: m99-d1-foo

## Wave 1 — Foundation

### M99-D1-T1 — first
- **Status**: [ ] pending
- **Dependencies**: none
- **Files touched**: bin/foo.cjs, test/foo.test.js

### M99-D1-T2 — second
- **Status**: [ ] pending
- **Dependencies**: M99-D1-T1
- **Touches**: bin/foo.cjs
`,
  });
  const g = buildTaskGraph({ projectDir: root });
  assert.equal(g.nodes.length, 2);
  assert.equal(g.edges.length, 1);
  assert.deepEqual(g.edges[0], { from: "M99-D1-T2", to: "M99-D1-T1" });
  assert.deepEqual(g.ready, ["M99-D1-T1"]); // T2 blocked, T1 ready
  assert.deepEqual(g.byId["M99-D1-T1"].touches, ["bin/foo.cjs", "test/foo.test.js"]);
  assert.equal(g.byId["M99-D1-T1"].wave, 1);
  assert.equal(g.byId["M99-D1-T1"].title, "first");
  assert.equal(g.byId["M99-D1-T1"].domain, "m99-d1-foo");
  assert.equal(g.warnings.length, 0);
});

// ─── multi-domain parse with cross-domain edges ─────────────────────────

test("multi-domain parse: cross-domain dep edges resolved correctly", () => {
  const root = mkProject();
  mkDomain(root, "m99-d1-foo", {
    tasksMd: `## Wave 1 — Foundation
### M99-D1-T1 — foo first
- **Status**: [ ] pending
- **Dependencies**: none
- **Files touched**: bin/foo.cjs
`,
  });
  mkDomain(root, "m99-d2-bar", {
    tasksMd: `## Wave 2 — Gates
### M99-D2-T1 — bar first
- **Status**: [ ] pending
- **Dependencies**: M99-D1-T1 (D1 complete)
- **Files touched**: bin/bar.cjs
`,
  });
  const g = buildTaskGraph({ projectDir: root });
  assert.equal(g.nodes.length, 2);
  assert.equal(g.edges.length, 1);
  assert.deepEqual(g.edges[0], { from: "M99-D2-T1", to: "M99-D1-T1" });
  assert.equal(g.byId["M99-D2-T1"].wave, 2);
  assert.equal(g.byId["M99-D2-T1"].domain, "m99-d2-bar");
  // T1 is ready (no deps); T2 blocked on T1
  assert.deepEqual(g.ready, ["M99-D1-T1"]);
});

// ─── cycle detection ────────────────────────────────────────────────────

test("cycle detection: throws TaskGraphCycleError with cycle path", () => {
  const root = mkProject();
  mkDomain(root, "m99-d1-foo", {
    tasksMd: `## Wave 1
### M99-D1-T1 — a
- **Status**: [ ] pending
- **Dependencies**: M99-D1-T3
- **Files touched**: bin/a.cjs

### M99-D1-T2 — b
- **Status**: [ ] pending
- **Dependencies**: M99-D1-T1
- **Files touched**: bin/b.cjs

### M99-D1-T3 — c
- **Status**: [ ] pending
- **Dependencies**: M99-D1-T2
- **Files touched**: bin/c.cjs
`,
  });
  let err;
  try {
    buildTaskGraph({ projectDir: root });
  } catch (e) {
    err = e;
  }
  assert.ok(err, "expected throw");
  assert.equal(err.name, "TaskGraphCycleError");
  assert.ok(err instanceof TaskGraphCycleError);
  assert.ok(Array.isArray(err.cycle), "cycle path is array");
  assert.ok(err.cycle.length >= 3, `cycle path has at least 3 nodes (got ${err.cycle.length})`);
  // Every id in the cycle is one of the three task ids in the fixture
  for (const id of err.cycle) {
    assert.match(id, /^M99-D1-T[123]$/, `cycle entry ${id} is one of the three tasks`);
  }
  // Error message includes the arrow-rendered path
  assert.match(err.message, /cycle/i);
  assert.ok(err.message.includes("→"), "message renders cycle with arrows");
});

test("cycle detection: self-loop (T1 depends on itself) throws", () => {
  const root = mkProject();
  mkDomain(root, "m99-d1-foo", {
    tasksMd: `## Wave 1
### M99-D1-T1 — self
- **Status**: [ ] pending
- **Dependencies**: M99-D1-T1
- **Files touched**: bin/foo.cjs
`,
  });
  assert.throws(() => buildTaskGraph({ projectDir: root }), TaskGraphCycleError);
});

// ─── ready-mask correctness ─────────────────────────────────────────────

test("ready-mask: flipping a dep to [x] done unblocks dependents", () => {
  const root = mkProject();
  mkDomain(root, "m99-d1-foo", {
    tasksMd: `## Wave 1
### M99-D1-T1 — first
- **Status**: [x] done
- **Dependencies**: none
- **Files touched**: bin/foo.cjs

### M99-D1-T2 — second
- **Status**: [ ] pending
- **Dependencies**: M99-D1-T1
- **Files touched**: bin/bar.cjs

### M99-D1-T3 — third
- **Status**: [ ] pending
- **Dependencies**: M99-D1-T2
- **Files touched**: bin/baz.cjs
`,
  });
  const g = buildTaskGraph({ projectDir: root });
  // T1 is done → not ready; T2 is pending with done dep → ready; T3 still blocked
  assert.deepEqual(g.ready, ["M99-D1-T2"]);
  assert.equal(g.byId["M99-D1-T1"].status, "done");
  assert.equal(g.byId["M99-D1-T2"].status, "pending");
  // getReadyTasks returns full node objects
  const ready = getReadyTasks(g);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, "M99-D1-T2");
});

test("ready-mask: skipped dep does NOT satisfy dependents (only done does)", () => {
  const root = mkProject();
  mkDomain(root, "m99-d1-foo", {
    tasksMd: `## Wave 1
### M99-D1-T1 — first
- **Status**: [-] skipped
- **Dependencies**: none
- **Files touched**: bin/foo.cjs

### M99-D1-T2 — second
- **Status**: [ ] pending
- **Dependencies**: M99-D1-T1
- **Files touched**: bin/bar.cjs
`,
  });
  const g = buildTaskGraph({ projectDir: root });
  assert.deepEqual(g.ready, []); // T2 NOT ready: dep is skipped, not done
});

test("ready-mask: failed dep does NOT satisfy dependents", () => {
  const root = mkProject();
  mkDomain(root, "m99-d1-foo", {
    tasksMd: `## Wave 1
### M99-D1-T1 — first
- **Status**: [!] failed
- **Dependencies**: none
- **Files touched**: bin/foo.cjs

### M99-D1-T2 — second
- **Status**: [ ] pending
- **Dependencies**: M99-D1-T1
- **Files touched**: bin/bar.cjs
`,
  });
  const g = buildTaskGraph({ projectDir: root });
  assert.deepEqual(g.ready, []);
});

test("ready-mask: unknown dep id is unmet → dependent NOT ready (no throw)", () => {
  const root = mkProject();
  mkDomain(root, "m99-d1-foo", {
    tasksMd: `## Wave 1
### M99-D1-T1 — first
- **Status**: [ ] pending
- **Dependencies**: M99-D9-T99
- **Files touched**: bin/foo.cjs
`,
  });
  const g = buildTaskGraph({ projectDir: root });
  assert.equal(g.nodes.length, 1);
  assert.equal(g.edges.length, 1);
  assert.deepEqual(g.ready, []); // unknown dep → not ready
  assert.equal(g.warnings.length, 0); // D4 owns the veto event; D1 doesn't warn here
});

// ─── touches: [] fallback ──────────────────────────────────────────────

test("touches: [] fallback when neither **Touches** nor scope.md Files Owned", () => {
  const root = mkProject();
  mkDomain(root, "m99-d1-foo", {
    tasksMd: `## Wave 1
### M99-D1-T1 — no touches anywhere
- **Status**: [ ] pending
- **Dependencies**: none
`,
    scopeMd: `# Domain: m99-d1-foo

## Responsibility
some prose

## Out of Scope
- nothing
`,
  });
  const g = buildTaskGraph({ projectDir: root });
  assert.equal(g.nodes.length, 1);
  assert.deepEqual(g.byId["M99-D1-T1"].touches, []);
  // Warning emitted for the missing touch list
  assert.ok(
    g.warnings.some((w) => w.includes("M99-D1-T1") && w.includes("no touch-list")),
    `expected warning about missing touches, got: ${JSON.stringify(g.warnings)}`,
  );
});

test("touches: scope.md Files Owned fallback fires when **Touches** absent", () => {
  const root = mkProject();
  mkDomain(root, "m99-d1-foo", {
    tasksMd: `## Wave 1
### M99-D1-T1 — no touches on task
- **Status**: [ ] pending
- **Dependencies**: none
`,
    scopeMd: `# Domain: m99-d1-foo

## Files Owned
- \`bin/foo.cjs\` — main module
- \`test/foo.test.js\` — unit tests
- \`docs/foo.md\` — docs

## Out of Scope
- nothing
`,
  });
  const g = buildTaskGraph({ projectDir: root });
  assert.deepEqual(
    g.byId["M99-D1-T1"].touches,
    ["bin/foo.cjs", "test/foo.test.js", "docs/foo.md"],
  );
  assert.equal(g.warnings.length, 0);
});

// ─── unknown status marker ──────────────────────────────────────────────

test("unknown status marker: treated as pending + warning emitted", () => {
  const root = mkProject();
  mkDomain(root, "m99-d1-foo", {
    tasksMd: `## Wave 1
### M99-D1-T1 — odd marker
- **Status**: [?] unknown
- **Dependencies**: none
- **Files touched**: bin/foo.cjs
`,
  });
  const g = buildTaskGraph({ projectDir: root });
  assert.equal(g.byId["M99-D1-T1"].status, "pending");
  assert.deepEqual(g.ready, ["M99-D1-T1"]); // pending with no deps → ready
  assert.ok(
    g.warnings.some((w) => w.includes("M99-D1-T1") && w.includes("unknown status marker")),
    `expected unknown-marker warning, got: ${JSON.stringify(g.warnings)}`,
  );
});

// ─── dep parsing edge cases ─────────────────────────────────────────────

test("parseDepList: 'none' returns []", () => {
  assert.deepEqual(_parseDepList("none"), []);
  assert.deepEqual(_parseDepList("None"), []);
  assert.deepEqual(_parseDepList("  none  "), []);
});

test("parseDepList: parenthetical comments stripped", () => {
  assert.deepEqual(
    _parseDepList("M44-D1-T5 (D1 complete), M44-D4-T4 (D4 complete)"),
    ["M44-D1-T5", "M44-D4-T4"],
  );
});

test("parseDepList: malformed tokens dropped", () => {
  assert.deepEqual(
    _parseDepList("M44-D1-T1, garbage, M44-D2-T1"),
    ["M44-D1-T1", "M44-D2-T1"],
  );
});

// ─── file list parsing ─────────────────────────────────────────────────

test("parseFileList: backticks and parentheticals stripped", () => {
  assert.deepEqual(
    _parseFileList("`bin/foo.cjs` (new), test/bar.test.js"),
    ["bin/foo.cjs", "test/bar.test.js"],
  );
});

test("parseFileList: empty string returns []", () => {
  assert.deepEqual(_parseFileList(""), []);
});

// ─── scope.md parser ───────────────────────────────────────────────────

test("parseScopeFilesOwned: ignores bullets in other H2 sections", () => {
  const root = mkProject();
  const scopePath = path.join(root, "scope.md");
  fs.writeFileSync(scopePath, `## Responsibility
- something
- else

## Files Owned
- \`bin/foo.cjs\` — main
- \`test/foo.test.js\`

## Out of Scope
- \`bin/bar.cjs\` — should NOT appear
`);
  const out = _parseScopeFilesOwned(scopePath);
  assert.deepEqual(out, ["bin/foo.cjs", "test/foo.test.js"]);
});

test("parseScopeFilesOwned: missing file returns []", () => {
  assert.deepEqual(_parseScopeFilesOwned("/nonexistent/scope.md"), []);
});

// ─── empty / edge inputs ───────────────────────────────────────────────

test("missing .gsd-t/domains/ returns empty graph + warning, no throw", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "m44-tg-empty-"));
  const g = buildTaskGraph({ projectDir: root });
  assert.equal(g.nodes.length, 0);
  assert.equal(g.edges.length, 0);
  assert.equal(g.ready.length, 0);
  assert.ok(g.warnings.some((w) => w.includes("domains dir missing")));
});

test("getReadyTasks: empty/null graph → []", () => {
  assert.deepEqual(getReadyTasks(null), []);
  assert.deepEqual(getReadyTasks({}), []);
  assert.deepEqual(getReadyTasks({ ready: [], byId: {} }), []);
});

// ─── perf budget ───────────────────────────────────────────────────────

test("perf: < 200ms for 50-domain / 250-task project", () => {
  const root = mkProject();
  for (let d = 1; d <= 50; d++) {
    let md = `# Tasks: m99-d${d}-perf\n\n## Wave 1\n\n`;
    for (let t = 1; t <= 5; t++) {
      const deps = t === 1 ? "none" : `M99-D${d}-T${t - 1}`;
      md += `### M99-D${d}-T${t} — perf task ${d}/${t}\n` +
        `- **Status**: [ ] pending\n` +
        `- **Dependencies**: ${deps}\n` +
        `- **Files touched**: bin/d${d}/t${t}.cjs\n\n`;
    }
    mkDomain(root, `m99-d${d}-perf`, { tasksMd: md });
  }
  const t0 = Date.now();
  const g = buildTaskGraph({ projectDir: root });
  const elapsed = Date.now() - t0;
  assert.equal(g.nodes.length, 250);
  assert.ok(elapsed < 200, `expected < 200ms, got ${elapsed}ms`);
  // Each domain has T1 ready (others blocked)
  assert.equal(g.ready.length, 50);
});

// ─── live repo smoke ───────────────────────────────────────────────────

test("live repo: parses without throwing", () => {
  const root = path.resolve(__dirname, "..");
  const g = buildTaskGraph({ projectDir: root });
  // The live repo may have zero in-flight domains right after a
  // complete-milestone cleans `.gsd-t/domains/`; the contract is just
  // that buildTaskGraph returns a well-formed graph object, not that
  // it contains any specific task id (those come and go as milestones
  // begin and archive).
  assert.ok(Array.isArray(g.nodes), "graph has a nodes array");
  assert.ok(Array.isArray(g.edges), "graph has an edges array");
  assert.ok(Array.isArray(g.ready), "graph has a ready array");
  assert.ok(g.byId && typeof g.byId === "object", "graph has a byId map");
  assert.ok(Array.isArray(g.warnings), "graph has a warnings array");
});
