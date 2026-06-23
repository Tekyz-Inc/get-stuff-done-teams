"use strict";

// M92 D2-T2 — killing test for the shrink-metric (bin/gsd-t-shrink-metric.cjs)
// (test/m92-shrink-metric.test.js)
//
// The shrink-metric is the keystone of M92: it lets verify SAY "we made it smaller."
// This test pins its behaviour against BYTE-KNOWN, inline `git diff --numstat`
// fixtures — no repo needed (the `--numstat -` stdin path is exercised through the
// real CLI). Deterministic, zero LLM.
//
// Fixtures (each asserts the EXACT {netLoc, leaner, file counts}):
//   1. net-NEGATIVE diff   → leaner:true,  netLoc:-38
//   2. net-POSITIVE diff   → leaner:false, positive netLoc
//   3. pure-deletion diff  → filesRemoved:1, leaner:true
//   4. binary line         → counted, 0 loc contribution, no throw
//   5. malformed numstat   → exit 64, no throw

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const CLI = path.resolve(__dirname, "..", "bin", "gsd-t-shrink-metric.cjs");
const { runMetric, parseNumstat, captureNumstat } = require("../bin/gsd-t-shrink-metric.cjs");

// Run the REAL CLI, feeding numstat over stdin (`--numstat -`). Returns { exitCode, envelope }.
function runCliStdin(numstat) {
  try {
    const out = execFileSync("node", [CLI, "--numstat", "-", "--json"], { input: numstat, encoding: "utf8" });
    return { exitCode: 0, envelope: JSON.parse(out) };
  } catch (e) {
    let envelope = null;
    try { envelope = JSON.parse(e.stdout || "null"); } catch {/* ignore */}
    return { exitCode: e.status, envelope };
  }
}

// ─── 1. net-NEGATIVE diff → leaner:true, netLoc:-38 ────────────────────────

describe("net-negative diff → leaner:true with the exact netLoc", () => {
  // +2 / −40 on one file → netLoc = -38.
  const NUMSTAT = "2\t40\tsrc/file.js\n";

  test("(pure) parseNumstat: netLoc:-38, leaner:true, modified:1", () => {
    const r = parseNumstat(NUMSTAT);
    assert.equal(r.insertions, 2);
    assert.equal(r.deletions, 40);
    assert.equal(r.netLoc, -38, "netLoc must be insertions - deletions = 2 - 40");
    assert.equal(r.leaner, true, "a net-negative change is leaner");
    assert.equal(r.filesModified, 1, "both ins>0 and del>0 → modified");
  });

  test("(CLI) the real binary computes the same metric (exit 0)", () => {
    const r = runCliStdin(NUMSTAT);
    assert.equal(r.exitCode, 0);
    assert.equal(r.envelope.ok, true);
    assert.equal(r.envelope.netLoc, -38);
    assert.equal(r.envelope.leaner, true);
  });
});

// ─── 2. net-POSITIVE diff → leaner:false, positive netLoc ──────────────────

describe("net-positive diff → leaner:false with a positive netLoc", () => {
  // file A: +50/−3 (modified); file B: +12/0 (added) → ins 62, del 3, netLoc 59.
  const NUMSTAT = "50\t3\tsrc/a.js\n12\t0\tsrc/b.js\n";

  test("(pure) parseNumstat: netLoc:59, leaner:false, added:1, modified:1", () => {
    const r = parseNumstat(NUMSTAT);
    assert.equal(r.insertions, 62);
    assert.equal(r.deletions, 3);
    assert.equal(r.netLoc, 59);
    assert.equal(r.leaner, false, "a net-positive change is NOT leaner");
    assert.equal(r.filesAdded, 1, "ins>0,del==0 → added");
    assert.equal(r.filesModified, 1, "ins>0,del>0 → modified");
    assert.equal(r.files, 2);
  });

  test("(CLI) exit 0, leaner:false, netLoc>0", () => {
    const r = runCliStdin(NUMSTAT);
    assert.equal(r.exitCode, 0);
    assert.equal(r.envelope.leaner, false);
    assert.ok(r.envelope.netLoc > 0, "netLoc must be positive");
    assert.equal(r.envelope.netLoc, 59);
  });
});

// ─── 3. pure-deletion diff → filesRemoved:1, leaner:true ───────────────────

describe("pure-deletion diff → filesRemoved:1, leaner:true", () => {
  // A wholly-deleted file shows 0 insertions / N deletions in numstat.
  const NUMSTAT = "0\t120\tsrc/legacy.js\n";

  test("(pure) parseNumstat: filesRemoved:1, netLoc:-120, leaner:true", () => {
    const r = parseNumstat(NUMSTAT);
    assert.equal(r.filesRemoved, 1, "0 ins / N del → removed");
    assert.equal(r.filesAdded, 0);
    assert.equal(r.filesModified, 0);
    assert.equal(r.insertions, 0);
    assert.equal(r.deletions, 120);
    assert.equal(r.netLoc, -120);
    assert.equal(r.leaner, true);
  });

  test("(CLI) exit 0, filesRemoved:1, leaner:true", () => {
    const r = runCliStdin(NUMSTAT);
    assert.equal(r.exitCode, 0);
    assert.equal(r.envelope.filesRemoved, 1);
    assert.equal(r.envelope.leaner, true);
  });
});

// ─── 4. binary line → counted, 0 loc contribution, no throw ────────────────

describe("binary line (-\\t-\\t) → counted as modified, 0 loc, no throw", () => {
  // A binary change + a small text edit. The binary line contributes 0 LOC.
  const NUMSTAT = "-\t-\tassets/logo.png\n1\t1\tsrc/edit.js\n";

  test("(pure) binary contributes 0 loc; counted as a modified file", () => {
    const r = parseNumstat(NUMSTAT);
    // text edit: +1/−1 → 0 net; binary: 0 net. Total netLoc = 0.
    assert.equal(r.insertions, 1, "binary adds NO insertions");
    assert.equal(r.deletions, 1, "binary adds NO deletions");
    assert.equal(r.netLoc, 0);
    assert.equal(r.leaner, true, "netLoc<=0 → leaner");
    assert.equal(r.files, 2, "both the binary and the text file are counted");
    assert.equal(r.filesModified, 2, "binary → modified; +1/−1 text → modified");
  });

  test("(CLI) binary line does not throw; exit 0", () => {
    const r = runCliStdin(NUMSTAT);
    assert.equal(r.exitCode, 0, "binary line must NOT cause a non-zero exit");
    assert.equal(r.envelope.ok, true);
    assert.equal(r.envelope.netLoc, 0);
  });

  test("(pure) a binary-ONLY diff → 0 loc, leaner:true, no throw", () => {
    const r = parseNumstat("-\t-\tassets/a.bin\n-\t-\tassets/b.bin\n");
    assert.equal(r.insertions, 0);
    assert.equal(r.deletions, 0);
    assert.equal(r.netLoc, 0);
    assert.equal(r.leaner, true);
    assert.equal(r.filesModified, 2);
  });
});

// ─── 5. malformed numstat → exit 64, no throw (fail-closed) ────────────────

describe("malformed numstat → exit 64, no uncaught throw (fail-closed)", () => {
  test("(pure) a non-numstat line is flagged malformed (no throw)", () => {
    const r = parseNumstat("this is not a numstat line at all\n");
    assert.equal(r._malformed, true, "a non-numstat line must be flagged malformed, not silently parsed");
  });

  test("(CLI) malformed input → exit 64, structured reason, no crash", () => {
    const r = runCliStdin("garbage <<< not numstat\n");
    assert.equal(r.exitCode, 64, "malformed numstat must fail-closed with exit 64");
    assert.ok(r.envelope, "must still emit a JSON envelope (no uncaught throw)");
    assert.equal(r.envelope.ok, false);
    assert.ok(/malformed/i.test(r.envelope.reason || ""), "reason must name the malformed input");
  });

  test("(CLI) no source flag at all → exit 64 (bad input, never throws)", () => {
    let exitCode = 0;
    let envelope = null;
    try {
      execFileSync("node", [CLI, "--json"], { encoding: "utf8" });
    } catch (e) {
      exitCode = e.status;
      try { envelope = JSON.parse(e.stdout || "null"); } catch {/* ignore */}
    }
    assert.equal(exitCode, 64, "no --numstat / --range → exit 64");
    assert.ok(envelope && envelope.ok === false);
  });

  test("runMetric never throws on garbage option objects (defense in depth)", () => {
    assert.doesNotThrow(() => runMetric(null));
    assert.doesNotThrow(() => runMetric(undefined));
    assert.doesNotThrow(() => runMetric({}));
    assert.doesNotThrow(() => runMetric({ numstat: "x", range: "y" })); // both → 64, no throw
    assert.equal(runMetric({}).exitCode, 64);
  });

  // ── SECURITY: git-argument injection via --range (M92 Red Team BUG-1) ────────
  // execFileSync blocks SHELL injection but NOT git-OPTION injection: a range
  // beginning with `-` is parsed by git as an option (e.g. `--output=<path>` makes
  // git OVERWRITE an arbitrary file). The range is LLM-derived upstream, so it is
  // untrusted. captureNumstat MUST refuse any dash-leading / non-string / empty
  // range BEFORE invoking git — no filesystem side effect, no throw.
  describe("captureNumstat refuses option-injection ranges (Red Team BUG-1)", () => {
    const fs = require("node:fs");
    const os = require("node:os");

    test("a `--output=<path>` range is REFUSED and writes NO file", () => {
      const victim = path.join(os.tmpdir(), `m92-bug1-victim-${process.pid}.txt`);
      try { fs.unlinkSync(victim); } catch {/* not present */}
      // The exact exploit shape from the Red Team repro (with the ..HEAD suffix —
      // confirmed not to defuse it): git still honors the leading --output option.
      const res = captureNumstat(`--output=${victim}..HEAD`, ".");
      assert.equal(res.ok, false, "an option-leading range must be refused");
      assert.match(res.reason, /invalid range|refused/i);
      assert.equal(fs.existsSync(victim), false, "git must NOT have been invoked → no file written");
    });

    test("dash-leading / empty / non-string ranges are all refused, never throw", () => {
      for (const bad of ["-x", "--output=/tmp/z", "--upload-pack=evil", "", null, undefined, 42, {}]) {
        assert.doesNotThrow(() => captureNumstat(bad, "."));
        assert.equal(captureNumstat(bad, ".").ok, false, `range ${JSON.stringify(bad)} must be refused`);
      }
    });

    test("a legitimate range shape is NOT refused by the guard (no false-positive)", () => {
      // HEAD~0..HEAD is a valid, benign range; the guard must let it through to git
      // (it may still fail in a non-repo cwd, but NOT with the "invalid range" reason).
      const res = captureNumstat("HEAD~0..HEAD", ".");
      if (!res.ok) assert.doesNotMatch(res.reason, /invalid range \(refused/i, "benign range must not be refused by the dash-guard");
    });
  });
});
