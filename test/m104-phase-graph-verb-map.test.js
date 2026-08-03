"use strict";

// M104 — the phase→graph-verb map, the CLI-result normalizer, and the argv wiring.
//
// Origin: a binvoice partition/plan halted FOUR times with "graph BROKEN" while the
// graph was perfectly healthy (exit 0, ok:true, compiler-accurate tier). Four distinct
// bugs, all reporting the identical message, each sitting downstream of the last:
//
//   1. `envelope` held the raw JSON TEXT → `env.ok` read undefined → fail-closed
//   2. `envelope` was ABSENT and the JSON only reached `stdout` → same
//   3. five phases mapped to graph verbs that REQUIRE a target → "missing-target"
//   4. the verb rode in the subcmd string, not argv → the local-bin path ran with
//      no verb at all → "no-verb"
//
// Bug 3 is the instructive one: the map was written under a comment asserting that
// `who-imports`/`blast-radius` "without a target returns the full graph slice". That
// was never true. Nobody checked it against the CLI, so plan/impact/feature/populate/
// promote-debt never once completed their graph query in any project — dead from the
// day the map shipped, not a regression.
//
// These tests assert the FACTS about the CLI rather than restating the map, so a
// future edit that reintroduces a target-requiring verb fails here.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const PHASE_WF = path.join(ROOT, "templates", "workflows", "gsd-t-phase.workflow.js");
const src = fs.readFileSync(PHASE_WF, "utf8");

// The graph CLI's verbs that answer WITHOUT a target. Derived from the CLI's own
// usage string + verified live against a real store on 2026-08-02:
//   who-imports (no target) → {"ok":false,"reason":"missing-target"}
//   cluster     (no target) → {"ok":true,"verb":"cluster","results":[…]}
const TARGET_FREE_VERBS = new Set(["cluster", "dead-code", "status", "orphan", "dangling"]);
const TARGET_REQUIRED_VERBS = new Set(["who-imports", "who-calls", "body", "blast-radius", "test-impl"]);

function parseVerbMap() {
  const m = src.match(/const PHASE_GRAPH_VERB_MAP = \{([\s\S]*?)\n\};/);
  assert.ok(m, "PHASE_GRAPH_VERB_MAP must exist in the phase workflow");
  const map = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^\s*"?([a-z-]+)"?:\s*"([a-z-]+)"/);
    if (kv) map[kv[1]] = kv[2];
  }
  assert.ok(Object.keys(map).length >= 8, "the verb map must be parsed, not silently empty");
  return map;
}

test("M104: EVERY phase-mapped graph verb answers target-free", () => {
  const map = parseVerbMap();
  for (const [phase, verb] of Object.entries(map)) {
    assert.ok(
      TARGET_FREE_VERBS.has(verb),
      `phase "${phase}" maps to "${verb}", which REQUIRES a target — a phase-level query ` +
        `passes no target, so this returns {"ok":false,"reason":"missing-target"} and the ` +
        `phase halts on a healthy graph. Use a target-free verb (${[...TARGET_FREE_VERBS].join(" | ")}).`
    );
  }
});

test("M104: no phase maps to a verb known to REQUIRE a target", () => {
  const map = parseVerbMap();
  for (const [phase, verb] of Object.entries(map)) {
    assert.ok(
      !TARGET_REQUIRED_VERBS.has(verb),
      `phase "${phase}" maps to target-requiring verb "${verb}" — this is the M104 bug ` +
        `(five phases were dead from the day the map shipped)`
    );
  }
});

test("M104: the false 'returns the full graph slice' claim is gone", () => {
  // The comment that caused bug 3. It asserted behaviour nobody verified, and the map
  // was written to match the belief rather than the CLI.
  assert.ok(
    !/who-imports\/blast-radius without a target returns the full graph slice/.test(src),
    "the false claim about target-free who-imports/blast-radius must not return"
  );
});

test("M104: the graph verb travels in argv, not in the subcmd string", () => {
  // runCli builds the LOCAL-bin command from argv ALONE. A verb left in the subcmd
  // string means a project with bin/gsd-t-graph-query-cli.cjs runs it with no verb.
  assert.ok(
    /runCli\(\s*\n?\s*projectDir,\s*"graph",\s*\[verb\]/.test(src),
    'the graph query must call runCli(projectDir, "graph", [verb], …) — with the verb in ' +
      "argv so the local-bin path receives it"
  );
  assert.ok(
    !/runCli\(\s*\n?\s*projectDir,\s*`graph \$\{verb\}`,\s*\[\]/.test(src),
    "the verb must NOT ride in the subcmd string with an empty argv (M104 bug 4)"
  );
});

test("M104: the CLI envelope is typed as an object, not 'any'", () => {
  // `envelope: {}` accepted a string, an object, or nothing at all — so two broken
  // shapes validated as cleanly as the correct one.
  const m = src.match(/const _CLI_ENVELOPE_SCHEMA = \{[\s\S]*?\n\};/);
  assert.ok(m, "_CLI_ENVELOPE_SCHEMA must exist");
  assert.ok(
    /envelope:\s*\{\s*type:\s*\["object",\s*"null"\]/.test(m[0]),
    "envelope must be typed object|null so a raw-text return is not silently valid"
  );
});

// ─── The normalizer ──────────────────────────────────────────────────────────
//
// Extracted and evaluated from source: the workflow runs in a sandbox with no
// require/module.exports, so it cannot be imported. Evaluating the real function
// text keeps the test bound to the shipped code rather than a copy of it.
function loadCoercer() {
  const m = src.match(/function _coerceCliResult\(x\) \{[\s\S]*?\n\}/);
  assert.ok(m, "_coerceCliResult must exist in the phase workflow");
  // eslint-disable-next-line no-new-func
  return new Function(`${m[0]}; return _coerceCliResult;`)();
}

test("M104 normalizer: envelope as raw JSON TEXT is parsed (bug 1)", () => {
  const coerce = loadCoercer();
  const r = coerce({ ok: true, exitCode: 0, envelope: '{"ok":true,"verb":"cluster"}' });
  assert.equal(typeof r.envelope, "object");
  assert.equal(r.envelope.ok, true, "a healthy CLI result must read as ok:true, not undefined");
  assert.equal(r.envelope.verb, "cluster");
});

test("M104 normalizer: envelope ABSENT with JSON in stdout is recovered (bug 2)", () => {
  const coerce = loadCoercer();
  const r = coerce({ ok: true, exitCode: 0, stdout: '{"ok":true,"verb":"cluster","results":[]}' });
  assert.equal(typeof r.envelope, "object");
  assert.equal(r.envelope.ok, true);
});

test("M104 normalizer: a GENUINE failure still reads as a failure", () => {
  // The repair must never turn a real failure into a pass — that would be the
  // silent-degradation this whole gate exists to prevent.
  const coerce = loadCoercer();
  const r = coerce({ ok: false, exitCode: 1, envelope: '{"ok":false,"reason":"missing-target"}' });
  assert.equal(r.envelope.ok, false, "a failing CLI must stay failing");
  assert.equal(r.envelope.reason, "missing-target");
});

test("M104 normalizer: non-JSON stdout is left alone (no invention)", () => {
  const coerce = loadCoercer();
  const r = coerce({ ok: true, exitCode: 0, stdout: "not json at all" });
  assert.ok(r.envelope === undefined || r.envelope === null, "must not fabricate an envelope");
});

test("M104 normalizer: malformed JSON text is left as-is, not silently emptied", () => {
  const coerce = loadCoercer();
  const bad = '{"ok":true,"verb":"clus';
  const r = coerce({ ok: true, exitCode: 0, envelope: bad });
  assert.equal(r.envelope, bad, "an unparseable envelope stays put so the caller still fails closed");
});

test("M104 normalizer: null/undefined input does not throw", () => {
  const coerce = loadCoercer();
  assert.equal(coerce(null), null);
  assert.equal(coerce(undefined), undefined);
});

test("M104: both runCli return paths pass through the normalizer", () => {
  // The retry path was the one that got missed in an earlier partial fix.
  const calls = src.match(/_coerceCliResult\(await runOnce\(\)\)/g) || [];
  assert.ok(
    calls.length >= 2,
    `both the first attempt and the retry must be normalized — found ${calls.length}`
  );
});

// ─── The CLASS, not the instance ─────────────────────────────────────────────
//
// The phase workflow hit this first because it makes the biggest graph query, but
// SIX workflows carry their own runCli and every one shipped the same permissive
// `envelope: {}` schema. Any of them could halt the same way on a healthy CLI.
// One fix for a class beats six fixes for six instances — and these tests are what
// keep it that way.

const WORKFLOWS_WITH_RUNCLI = [
  "gsd-t-phase", "gsd-t-integrate", "gsd-t-debug",
  "gsd-t-execute", "gsd-t-quick", "gsd-t-verify",
];

for (const wf of WORKFLOWS_WITH_RUNCLI) {
  const file = path.join(ROOT, "templates", "workflows", `${wf}.workflow.js`);
  const text = fs.readFileSync(file, "utf8");

  test(`M104 class: ${wf} types its CLI envelope (never "any")`, () => {
    assert.ok(
      !/envelope: \{\},/.test(text),
      `${wf} still declares \`envelope: {}\` — a schema that accepts a string, an object, ` +
        "or nothing at all, so two broken shapes validate as cleanly as the correct one"
    );
    assert.ok(
      /envelope:\s*\{\s*type:\s*\["object",\s*"null"\]/.test(text),
      `${wf} must type envelope as object|null`
    );
  });

  test(`M104 class: ${wf} normalizes its CLI result`, () => {
    assert.ok(
      /function _coerceCliResult\(x\)/.test(text),
      `${wf} must define the normalizer`
    );
    // Defined but never called is dead code — the fix must be wired, not merely present.
    const refs = (text.match(/_coerceCliResult/g) || []).length;
    assert.ok(
      refs >= 2,
      `${wf} defines _coerceCliResult but never calls it (${refs} reference) — a fix that ` +
        "is present but unwired is the same as no fix"
    );
  });
}
