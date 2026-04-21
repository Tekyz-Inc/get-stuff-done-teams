/**
 * Tests for the worker-timeout absolute-backstop invariant.
 *
 * Originally M39 D4 ("cache-warm-pacing", 270s budget). Superseded by M43
 * ("Heartbeat Watchdog"): heartbeat is now the primary stuck-worker
 * detector; `workerTimeoutMs` is the absolute backstop, raised to 1 hour.
 *
 * Contract: .gsd-t/contracts/unattended-supervisor-contract.md v1.1.0
 *   §"Heartbeat Watchdog"
 *
 * Scope: asserts the REAL constant in `bin/gsd-t-unattended.cjs` is the
 * post-M43 1-hour backstop, asserts the main relay loop has no sleep >5 s
 * between iterations (the cache-pacing invariant is still valid — a
 * healthy back-to-back relay must not burn the cache window between
 * workers), and asserts `--worker-timeout` still parses.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const SOURCE_PATH = path.join(__dirname, "..", "bin", "gsd-t-unattended.cjs");
const SOURCE = fs.readFileSync(SOURCE_PATH, "utf8");

const mod = require("../bin/gsd-t-unattended.cjs");

describe("unattended worker-timeout backstop (post-M43)", () => {
  it("worker_timeout_is_1h_absolute_backstop", () => {
    // Post-M43 — the backstop is 1 h because the heartbeat watchdog now
    // cuts stuck workers long before this fires.
    assert.strictEqual(
      mod.DEFAULT_WORKER_TIMEOUT_MS,
      60 * 60 * 1000,
      "DEFAULT_WORKER_TIMEOUT_MS must be 3_600_000 ms (1 h) per contract v1.1.0 — "
        + "the heartbeat watchdog is the primary stuck-worker detector."
    );

    const declMatch = SOURCE.match(
      /const\s+DEFAULT_WORKER_TIMEOUT_MS\s*=\s*([^;]+);/
    );
    assert.ok(declMatch, "DEFAULT_WORKER_TIMEOUT_MS declaration not found");
    const rhs = declMatch[1].trim();
    const acceptableForms = [/^60\s*\*\s*60\s*\*\s*1000\b/, /^3600000\b/];
    const ok = acceptableForms.some((re) => re.test(rhs));
    assert.ok(
      ok,
      `DEFAULT_WORKER_TIMEOUT_MS RHS must be '60 * 60 * 1000' or '3600000'; `
        + `found: ${JSON.stringify(rhs)}`
    );
  });

  it("stale_heartbeat_default_is_5min", () => {
    assert.strictEqual(
      mod.DEFAULT_STALE_HEARTBEAT_MS,
      5 * 60 * 1000,
      "DEFAULT_STALE_HEARTBEAT_MS must be 300_000 ms (5 min)."
    );
  });

  it("heartbeat_poll_default_is_1min", () => {
    assert.strictEqual(
      mod.DEFAULT_HEARTBEAT_POLL_MS,
      60 * 1000,
      "DEFAULT_HEARTBEAT_POLL_MS must be 60_000 ms (1 min)."
    );
  });

  it("main_loop_has_no_long_inter_iter_sleep", () => {
    // The M39 cache-pacing invariant is still valid: between iterations
    // the supervisor must not sleep >5 s, or the prompt cache goes cold.
    // (The per-iteration heartbeat poll itself uses setInterval inside
    // the spawned worker lifetime, NOT between iterations, so that does
    // not violate this invariant.)
    const startIdx = SOURCE.indexOf("async function runMainLoop(");
    assert.ok(startIdx >= 0, "async runMainLoop function not found");
    const tail = SOURCE.slice(startIdx);
    const endRel = tail.search(/\n}\n/);
    assert.ok(endRel > 0, "runMainLoop function body has no closing brace");
    const body = tail.slice(0, endRel);

    const offenderRe = /setTimeout\s*\(\s*[^,)]*,\s*([0-9][0-9_]*)\s*\)/g;
    const offenders = [];
    let m;
    while ((m = offenderRe.exec(body)) !== null) {
      const raw = m[1].replace(/_/g, "");
      const n = Number(raw);
      if (Number.isFinite(n) && n > 5000) {
        offenders.push({ delay: n, snippet: m[0] });
      }
    }
    assert.deepStrictEqual(
      offenders,
      [],
      "runMainLoop must not sleep > 5 s between worker iters. Offenders: "
        + JSON.stringify(offenders)
    );

    // setInterval IS allowed now (heartbeat poll inside the async spawn)
    // but ONLY in the per-iteration scope, not as an inter-iter gate.
    // The runMainLoop body itself must not wrap the while loop in
    // setInterval — the while loop is still synchronous per iteration.
    const topLevelSetInterval = body.match(/^\s{2}setInterval/m);
    assert.ok(
      !topLevelSetInterval,
      "runMainLoop must not use top-level setInterval in the relay path"
    );
  });

  it("worker_timeout_cli_flag_is_parsed", () => {
    const { parseArgs } = mod;
    assert.ok(typeof parseArgs === "function", "parseArgs must be exported");
    const opts = parseArgs(["--worker-timeout=600000"]);
    assert.strictEqual(opts.workerTimeoutMs, 600000);
  });

  it("timeout_rationale_comment_present", () => {
    const declIdx = SOURCE.indexOf("const DEFAULT_WORKER_TIMEOUT_MS");
    assert.ok(declIdx >= 0, "DEFAULT_WORKER_TIMEOUT_MS declaration not found");
    const windowStart = Math.max(0, declIdx - 2000);
    const windowSrc = SOURCE.slice(windowStart, declIdx + 200);

    // Post-M43 rationale MUST mention either heartbeat or backstop.
    assert.ok(
      /heartbeat/i.test(windowSrc) || /backstop/i.test(windowSrc),
      "Rationale comment adjacent to DEFAULT_WORKER_TIMEOUT_MS must mention "
        + "'heartbeat' or 'backstop' — contract v1.1.0 requires the new "
        + "watchdog design be documented inline with the constant."
    );

    const lineStart = SOURCE.lastIndexOf("\n", declIdx - 1);
    const preDecl = SOURCE.slice(Math.max(0, lineStart - 600), declIdx);
    assert.ok(
      /\/\//.test(preDecl) || /\/\*/.test(preDecl),
      "Rationale must be a comment block"
    );
  });
});
