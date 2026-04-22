"use strict";

/**
 * Regression: supervisor.pid is now JSON `{pid, projectDir, startedAt}`
 * (per bin/supervisor-pid-fingerprint.cjs writePidFile). All readers must
 * use the canonical readPidFile() helper which handles JSON-or-integer.
 *
 * Origin: 2026-04-22 — three command files (gsd-t-unattended-watch,
 * gsd-t-unattended pre-flight, gsd-t-unattended liveness) silently parsed
 * the JSON PID file with parseInt(), getting NaN, treating the supervisor
 * as dead while it was running fine.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..");

const SITES = [
  "commands/gsd-t-unattended-watch.md",
  "commands/gsd-t-unattended.md",
  "commands/gsd-t-resume.md",
];

for (const rel of SITES) {
  test(`${rel}: no parseInt(...readFileSync(...PID_FILE...)) bare-integer parse`, () => {
    const src = fs.readFileSync(path.join(REPO, rel), "utf8");
    assert.doesNotMatch(
      src,
      /parseInt\([^)]*readFileSync\([^)]*PID_FILE[^)]*\)[^)]*\)/,
      "bare-integer parse of PID_FILE — JSON form returns NaN"
    );
  });

  test(`${rel}: uses canonical readPidFile() helper`, () => {
    const src = fs.readFileSync(path.join(REPO, rel), "utf8");
    assert.match(
      src,
      /readPidFile/,
      "must require readPidFile from supervisor-pid-fingerprint.cjs"
    );
  });
}

test("readPidFile parses both JSON and legacy integer forms", () => {
  const os = require("node:os");
  const { writePidFile, readPidFile } =
    require(path.join(REPO, "bin", "supervisor-pid-fingerprint.cjs"));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-pid-"));
  try {
    // JSON form (current writer)
    writePidFile(tmp, 12345);
    const a = readPidFile(tmp);
    assert.equal(a && a.pid, 12345);
    assert.equal(a.form, "json");

    // Legacy bare-integer form (pre-v3.13 supervisors may still have left this)
    fs.writeFileSync(
      path.join(tmp, ".gsd-t", ".unattended", "supervisor.pid"),
      "67890\n"
    );
    const b = readPidFile(tmp);
    assert.equal(b && b.pid, 67890);
    assert.equal(b.form, "legacy");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
