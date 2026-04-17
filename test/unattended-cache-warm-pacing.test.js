/**
 * Tests for M39 D4 cache-warm-pacing — worker-timeout default tuned to 270 s
 * to preserve the Anthropic 5-minute prompt-cache TTL across back-to-back
 * `claude -p` supervisor workers.
 *
 * Contract: .gsd-t/contracts/unattended-supervisor-contract.md §16 (v1.3.0)
 *
 * Scope: asserts the REAL constant in `bin/gsd-t-unattended.cjs` equals
 * 270,000 ms, asserts the rationale comment block is present adjacent to
 * the constant, and asserts the main relay loop's happy path contains no
 * inter-iteration sleep longer than 5 s (which would eat the cache window).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const SOURCE_PATH = path.join(__dirname, "..", "bin", "gsd-t-unattended.cjs");
const SOURCE = fs.readFileSync(SOURCE_PATH, "utf8");

// Runtime reference — importing the module gives us the value the relay
// loop actually uses, not just a string we grepped out of source.
const mod = require("../bin/gsd-t-unattended.cjs");

describe("unattended cache-warm pacing (M39 D4)", () => {
  it("worker_timeout_is_270s", () => {
    // Exported constant — this is the value every _spawnWorker call inherits
    // when the supervisor CLI does not override via --worker-timeout.
    assert.strictEqual(
      mod.DEFAULT_WORKER_TIMEOUT_MS,
      270 * 1000,
      "DEFAULT_WORKER_TIMEOUT_MS must be 270000 (270 s) to preserve the " +
        "Anthropic 5-min prompt-cache TTL with a ~30 s handoff budget."
    );

    // Source-level double-check — the declaration line itself must evaluate
    // to 270,000 ms. Accept either `270 * 1000` or `270000` as the literal
    // form; reject any other value (e.g. 3600000, 60 * 1000, etc.).
    const declMatch = SOURCE.match(
      /const\s+DEFAULT_WORKER_TIMEOUT_MS\s*=\s*([^;]+);/
    );
    assert.ok(
      declMatch,
      "DEFAULT_WORKER_TIMEOUT_MS declaration not found in " +
        "bin/gsd-t-unattended.cjs"
    );
    const rhs = declMatch[1].trim();
    const acceptableForms = [/^270\s*\*\s*1000\b/, /^270000\b/];
    const ok = acceptableForms.some((re) => re.test(rhs));
    assert.ok(
      ok,
      `DEFAULT_WORKER_TIMEOUT_MS RHS must be '270 * 1000' or '270000'; ` +
        `found: ${JSON.stringify(rhs)}`
    );
  });

  it("main_loop_has_no_long_inter_iter_sleep", () => {
    // Extract the body of runMainLoop. The function starts at
    // `function runMainLoop(` and ends at the first line that is just `}`
    // at column 0 after that point.
    const startIdx = SOURCE.indexOf("function runMainLoop(");
    assert.ok(startIdx >= 0, "runMainLoop function not found in source");
    // Find the matching closer — scan for `\n}\n` after the header.
    const tail = SOURCE.slice(startIdx);
    const endRel = tail.search(/\n}\n/);
    assert.ok(endRel > 0, "runMainLoop function body has no closing brace");
    const body = tail.slice(0, endRel);

    // Exclude the `runMainLoop` body's error-backoff branches (none exist
    // in the current implementation, but guard against future additions).
    // Look for any `setTimeout(..., N)` where N is a numeric literal and
    // N > 5000 ms (5 s). A delay of 6,000+ ms in the happy path would eat
    // the cache window — the invariant from §16 bullet 4.
    //
    // Regex rationale:
    //   setTimeout\s*\(             — the call
    //   [^,)]*                      — the callback arg (no commas, no close-paren)
    //   ,\s*                        — the delay separator
    //   ([0-9][0-9_]*)              — a numeric literal (allow _ separators)
    //   \s*\)                       — close paren (direct numeric delay, no
    //                                 arithmetic expression — those are rare
    //                                 and can be audited by eye)
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
      "runMainLoop must not sleep > 5 s between worker iters — contract " +
        "§16 bullet 4 (inter-iteration sleep invariant). Offenders: " +
        JSON.stringify(offenders)
    );

    // Also guard against a bare `setInterval` in the relay loop body; the
    // supervisor should be synchronous between iters.
    assert.ok(
      !/setInterval\s*\(/.test(body),
      "runMainLoop must not use setInterval in the relay path"
    );
  });

  it("worker_timeout_cli_flag_is_parsed", () => {
    // Contract §6 + §16 bullet 1: --worker-timeout=N overrides the default
    // at launch time. parseArgs must accept it and populate opts.workerTimeoutMs.
    const { parseArgs } = mod;
    assert.ok(typeof parseArgs === "function", "parseArgs must be exported");
    const opts = parseArgs(["--worker-timeout=600000"]);
    assert.strictEqual(opts.workerTimeoutMs, 600000);
  });

  it("timeout_rationale_comment_present", () => {
    // Extract the comment block that MUST sit immediately above (or on) the
    // DEFAULT_WORKER_TIMEOUT_MS declaration. The block must mention both
    // "prompt-cache TTL" and "270" (the budget value) so the rationale for
    // future maintainers is inline with the code.
    const declIdx = SOURCE.indexOf("const DEFAULT_WORKER_TIMEOUT_MS");
    assert.ok(
      declIdx >= 0,
      "DEFAULT_WORKER_TIMEOUT_MS declaration not found"
    );
    // Look back up to 2000 chars — plenty for a multi-line comment block.
    const windowStart = Math.max(0, declIdx - 2000);
    const windowSrc = SOURCE.slice(windowStart, declIdx + 200);

    assert.ok(
      /prompt-cache\s+TTL/i.test(windowSrc),
      "Rationale comment adjacent to DEFAULT_WORKER_TIMEOUT_MS must mention " +
        "'prompt-cache TTL' — contract §16 requires the cache-window math " +
        "be documented inline with the constant."
    );
    assert.ok(
      /\b270\b/.test(windowSrc),
      "Rationale comment adjacent to DEFAULT_WORKER_TIMEOUT_MS must mention " +
        "the 270-second budget."
    );
    // Verify the comment is actually a comment (not body code) — the chars
    // just before the declaration line should include `//` or `/*`.
    const lineStart = SOURCE.lastIndexOf("\n", declIdx - 1);
    const preDecl = SOURCE.slice(Math.max(0, lineStart - 600), declIdx);
    assert.ok(
      /\/\//.test(preDecl) || /\/\*/.test(preDecl),
      "Rationale must be a comment block, not executable code"
    );
  });
});
