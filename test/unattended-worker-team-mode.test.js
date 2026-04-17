/**
 * D3 parallel-exec — worker Team Mode prompt tests.
 *
 * The worker prompt is assembled inside `_spawnWorker` in
 * `bin/gsd-t-unattended.cjs`. Rather than export the prompt-building logic,
 * these tests read the source file directly and grep-match on the expected
 * strings. The source is the source of truth — if a future refactor moves the
 * prompt assembly, these tests will catch the drift immediately.
 *
 * Per `.gsd-t/domains/d3-parallel-exec/tasks.md` T4: 6 assertions.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = fs.readFileSync(
  path.join(__dirname, "..", "bin", "gsd-t-unattended.cjs"),
  "utf8"
);

// Scope the grep to the _spawnWorker function body so we don't accidentally
// match an unrelated instance of the same string elsewhere in the file.
function _spawnWorkerBody() {
  const start = SRC.indexOf("function _spawnWorker(");
  assert.ok(start >= 0, "_spawnWorker function not found in source");
  // Find the matching closing brace by counting braces from the first `{`.
  let i = SRC.indexOf("{", start);
  assert.ok(i >= 0, "opening brace of _spawnWorker not found");
  let depth = 1;
  i += 1;
  while (i < SRC.length && depth > 0) {
    const ch = SRC[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    i += 1;
  }
  assert.equal(depth, 0, "closing brace of _spawnWorker not found");
  return SRC.slice(start, i);
}

const BODY = _spawnWorkerBody();

test("worker_prompt_contains_team_mode_header", () => {
  assert.ok(
    BODY.includes("# Team Mode (Intra-Wave Parallelism)"),
    "expected '# Team Mode (Intra-Wave Parallelism)' header in _spawnWorker prompt"
  );
});

test("worker_prompt_contains_cap_15", () => {
  assert.ok(
    BODY.includes("up to 15 concurrent"),
    "expected 'up to 15 concurrent' in _spawnWorker prompt"
  );
});

test("worker_prompt_contains_inter_wave_sequential", () => {
  assert.ok(
    BODY.includes("Inter-wave boundaries always remain sequential"),
    "expected 'Inter-wave boundaries always remain sequential' in _spawnWorker prompt"
  );
});

test("worker_prompt_contains_single_domain_fallback", () => {
  assert.ok(
    BODY.includes("If the current wave has only 1 domain"),
    "expected 'If the current wave has only 1 domain' in _spawnWorker prompt"
  );
});

test("worker_prompt_references_execute_team_mode_pattern", () => {
  assert.ok(
    BODY.includes("commands/gsd-t-execute.md"),
    "expected reference to 'commands/gsd-t-execute.md' in _spawnWorker prompt"
  );
});

test("worker_prompt_references_partition_md", () => {
  assert.ok(
    BODY.includes(".gsd-t/partition.md"),
    "expected reference to '.gsd-t/partition.md' in _spawnWorker prompt"
  );
});
