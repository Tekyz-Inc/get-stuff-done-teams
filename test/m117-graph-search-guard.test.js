"use strict";

/**
 * M117 - the graph search guard.
 *
 * The rule "read code structure through the graph, never grep around it" had
 * three enforcement points and all three missed the path actually taken:
 * the Grep-tool hook and Read-tool hook never fire because bypass mode routes
 * every search through Bash, and the runtime use-gate only runs inside verify.
 * The ledger showed it: 2 grep events in three months, both June test probes.
 *
 * These tests pin the behaviour that closes it. The negative tests matter most
 * - a guard that cannot be shown to BLOCK is a guard that will quietly stop
 * blocking.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const GUARD = path.join(__dirname, "..", "scripts", "gsd-t-graph-search-guard.js");
const REPORT = path.join(__dirname, "..", "scripts", "gsd-t-graph-use-report.js");
const { classifySearch } = require("../bin/gsd-t-code-search-classifier.cjs");

// A project with a .gsd-t dir and a graph store, so the guard is in scope.
function makeProject(withGraph = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "m117-"));
  fs.mkdirSync(path.join(root, ".gsd-t"), { recursive: true });
  if (withGraph) {
    const logs = path.join(root, ".gsd-t", "graphDB", "logs");
    fs.mkdirSync(logs, { recursive: true });
    fs.writeFileSync(path.join(root, ".gsd-t", "graphDB", "graph.db"), "");
    fs.writeFileSync(path.join(logs, "graph-events-001.jsonl"), "");
  }
  return root;
}

// Run the guard the way Claude Code does and read its decision.
function runGuard(cwd, command, toolName = "Bash") {
  const payload = toolName === "Bash"
    ? { tool_name: "Bash", cwd, tool_input: { command } }
    : { tool_name: "Grep", cwd, tool_input: command };

  const r = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify(payload), encoding: "utf8",
  });

  const out = r.stdout.trim();
  if (!out) return { decision: "allow", reason: null };
  const parsed = JSON.parse(out);
  return {
    decision: parsed.hookSpecificOutput.permissionDecision,
    reason: parsed.hookSpecificOutput.permissionDecisionReason,
  };
}

// --- The searches this session actually ran (all should have been blocked) --

const REAL_STRUCTURAL_SEARCHES = [
  "grep -rn isDefaultBranch bin/",
  "grep -rn meansMainCheckout bin scripts",
  "grep -c meansMainCheckout /usr/lib/node_modules/pkg/bin/x.cjs",
  "rg classifySearch",
  "find . -name gsd-t-pick-worktree.cjs",
  "grep -n 'require(' bin/gsd-t.js",
];

test("M117: every structural search from the session that prompted this is blocked", () => {
  const root = makeProject();
  try {
    for (const cmd of REAL_STRUCTURAL_SEARCHES) {
      const { decision } = runGuard(root, cmd);
      assert.strictEqual(decision, "deny",
        `this ran unchallenged in the real session and must not: ${cmd}`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("M117: the block names the graph command to run instead", () => {
  const root = makeProject();
  try {
    const { reason } = runGuard(root, "grep -rn meansMainCheckout bin/");
    assert.match(reason, /gsd-t graph/, "a block with no way forward just gets worked around");
    assert.match(reason, /meansMainCheckout/, "and it must carry the symbol asked about");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// --- Content searches must still run --------------------------------------
//
// The graph indexes code. A search over markdown, JSON, SQL or prose is not a
// bypass - the graph holds no answer to route to. Blocking these would make the
// guard something to disable.

const CONTENT_SEARCHES = [
  "grep -n 5.18.10 CHANGELOG.md",
  "grep -rn worktree --include=*.md .",
  "grep -n version package.json",
  'grep -rn "could not be read" .',
  "grep -rn TODO --include=*.md docs/",
];

test("M117: searches over content the graph does not index still run", () => {
  const root = makeProject();
  try {
    for (const cmd of CONTENT_SEARCHES) {
      const { decision, reason } = runGuard(root, cmd);
      assert.strictEqual(decision, "allow",
        `the graph cannot answer this, so blocking it only teaches evasion: ${cmd}` +
        (reason ? `\n${reason}` : ""));
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// --- Unclear blocks. This is the rule David asked for. --------------------

test("M117: a search that cannot be classified BLOCKS rather than being waved through", () => {
  const root = makeProject();
  try {
    const { decision, reason } = runGuard(root, 'grep -rn "parseArgs|readConfig" src');
    assert.strictEqual(decision, "deny",
      "guessing 'probably text' is exactly how the rule stopped having teeth");
    assert.match(reason, /has to be settled|which it is/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("M117: a search program whose pattern cannot be read blocks, never passes", () => {
  const root = makeProject();
  try {
    const { decision } = runGuard(root, "grep -rn");
    assert.strictEqual(decision, "deny",
      "a search this guard could not inspect must not run unexamined");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// --- A missing graph blocks too. It does NOT fall back to grep. -----------

test("M117: no graph built means BLOCK-and-build, never a quiet grep", () => {
  const root = makeProject(false);
  try {
    const { decision, reason } = runGuard(root, "grep -rn meansMainCheckout bin/");
    assert.strictEqual(decision, "deny",
      "allowing grep because the graph is missing is the binvoice failure exactly");
    assert.match(reason, /gsd-t graph index/, "it must say how to repair, not just refuse");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// --- Scope --------------------------------------------------------------

test("M117: commands that are not searches are untouched", () => {
  const root = makeProject();
  try {
    for (const cmd of ["npm test", "git status -s", "node --check x.js", "ls -la"]) {
      assert.strictEqual(runGuard(root, cmd).decision, "allow", cmd);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("M117: a project that is not GSD-T is untouched", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "m117-plain-"));
  try {
    assert.strictEqual(runGuard(root, "grep -rn someSymbol src/").decision, "allow",
      "this rule is GSD-T's; it does not govern other projects");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("M117: the Grep tool is guarded too, not only Bash", () => {
  const root = makeProject();
  try {
    const { decision } = runGuard(root, { pattern: "meansMainCheckout" }, "Grep");
    assert.strictEqual(decision, "deny", "both doors, or the open one becomes the habit");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("M117: a structural search inside a pipeline is still caught", () => {
  const root = makeProject();
  try {
    const { decision } = runGuard(root, "cat foo.txt | grep -rn resolveStorePath | head -5");
    assert.strictEqual(decision, "deny", "a pipe is not a disguise");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// --- The classifier's own contract ----------------------------------------

test("M117: the classifier answers unclear when it cannot tell, never a guess", () => {
  assert.strictEqual(classifySearch({ pattern: "" }).verdict, "unclear");
  assert.strictEqual(classifySearch({}).verdict, "unclear");
  assert.strictEqual(classifySearch(null).verdict, "unclear");
});

test("M117: this classifier is separate from the grep-intercept one, on purpose", () => {
  // The intercept classifier defaults unsure to TEXT (let grep run) because a
  // wrong guess there only costs a missed opportunity. This one BLOCKS on
  // unsure. One module cannot hold both defaults; merging them would silently
  // pick one caller's behaviour for both.
  const intercept = require("../bin/gsd-t-grep-classifier.cjs");
  const ambiguous = "parseArgs|readConfig";

  assert.strictEqual(intercept.classifyGrep(ambiguous).structural, false,
    "the intercept classifier stays conservative - unsure means let grep run");
  assert.strictEqual(classifySearch({ pattern: ambiguous }).verdict, "unclear",
    "the guard's classifier says unclear, which blocks");
});

test("M117: a disabled gate is a written decision, not an absence", () => {
  const root = makeProject();
  try {
    fs.writeFileSync(
      path.join(root, ".gsd-t", "graph-search-gate.json"),
      JSON.stringify({ enabled: false })
    );
    assert.strictEqual(runGuard(root, "grep -rn someSymbol src/").decision, "allow");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("M117: an unreadable gate config blocks rather than assuming on or off", () => {
  const root = makeProject();
  try {
    fs.writeFileSync(path.join(root, ".gsd-t", "graph-search-gate.json"), "{ not json");
    const { decision, reason } = runGuard(root, "grep -rn someSymbol src/");
    assert.strictEqual(decision, "deny", "assuming either way is a guess about intent");
    assert.match(reason, /graph-search-gate\.json/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// --- The block is recorded, so the Stop-time report can see it ------------

test("M117: a block is written to the graph ledger", () => {
  const root = makeProject();
  try {
    runGuard(root, "grep -rn meansMainCheckout bin/");
    const ledger = path.join(root, ".gsd-t", "graphDB", "logs", "graph-events-001.jsonl");
    const lines = fs.readFileSync(ledger, "utf8").trim().split("\n").filter(Boolean);
    assert.strictEqual(lines.length, 1, "one block, one record");
    const ev = JSON.parse(lines[0]);
    assert.strictEqual(ev.kind, "search-blocked");
    assert.strictEqual(ev.verdict, "structural");
    assert.strictEqual(ev.consumer, "search-guard");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("M117: the Stop report speaks up when structural work happened with no graph query", () => {
  const root = makeProject();
  try {
    const ledger = path.join(root, ".gsd-t", "graphDB", "logs", "graph-events-001.jsonl");
    fs.writeFileSync(ledger, JSON.stringify({
      kind: "search-blocked", ts: new Date().toISOString(),
      program: "grep", verdict: "structural", patternShape: "someSymbol", consumer: "search-guard",
    }) + "\n");

    const r = spawnSync(process.execPath, [REPORT], {
      input: JSON.stringify({ cwd: root }), encoding: "utf8",
    });
    assert.match(r.stdout, /GSD-T GRAPH/, "the blind spot the guard cannot see must be said out loud");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("M117: the Stop report stays quiet when the graph was actually queried", () => {
  const root = makeProject();
  try {
    const ledger = path.join(root, ".gsd-t", "graphDB", "logs", "graph-events-001.jsonl");
    const now = new Date().toISOString();
    fs.writeFileSync(ledger,
      JSON.stringify({ kind: "search-blocked", ts: now, verdict: "structural" }) + "\n" +
      JSON.stringify({ kind: "query", ts: now, verb: "who-calls" }) + "\n");

    const r = spawnSync(process.execPath, [REPORT], {
      input: JSON.stringify({ cwd: root }), encoding: "utf8",
    });
    assert.strictEqual(r.stdout.trim(), "", "nagging a session that complied trains dismissal");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
