"use strict";

/**
 * m92-look-first-ladder.test.js — M92 D1-T2 (the killing test)
 *
 * Asserts the cheaper-first response ladder (look → smallest → spike → defer) added
 * to `resolveResponseMode` in bin/gsd-t-architectural-trigger.cjs, PLUS the
 * backward-compat envelope every shape must still carry (execute/quick/verify read
 * `stopDirective`, `mode`, `adversaryMandatory`, `provenByAdversaryOnly` — a dropped
 * key fails-OPEN those gates).
 *
 * NON-VACUOUS GUARD: the headline assertion is that DEFAULT (no inputs) → mode:"look",
 * NOT mode:"spike". A test that passes when the default stays "spike" is worthless —
 * proving spike is no longer the default IS the whole point of M92.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveResponseMode,
} = require("../bin/gsd-t-architectural-trigger.cjs");

// The four backward-compat keys execute/quick/verify read off the envelope.
const REQUIRED_KEYS = ["mode", "stopDirective", "adversaryMandatory", "provenByAdversaryOnly"];

/** Assert every backward-compat key is present with the right primitive type. */
function assertEnvelopeShape(env, label) {
  for (const k of REQUIRED_KEYS) {
    assert.ok(k in env, `${label}: missing backward-compat key '${k}' (would fail-OPEN the gate)`);
  }
  assert.equal(typeof env.mode, "string", `${label}: mode must be a string`);
  assert.equal(typeof env.stopDirective, "boolean", `${label}: stopDirective must be a boolean`);
}

describe("M92 — look-first response ladder (resolveResponseMode)", () => {
  // -------------------------------------------------------------------------
  // The rung table
  // -------------------------------------------------------------------------

  test("DEFAULT (no inputs) → mode:'look', NOT 'spike' (the move's whole point)", () => {
    const env = resolveResponseMode();
    assert.notEqual(env.mode, "spike", "default must NOT be 'spike' anymore (spike is DEMOTED)");
    assert.equal(env.mode, "look", `default must be 'look', got '${env.mode}'`);
    assert.ok(
      typeof env.lookDirective === "string" && env.lookDirective.length > 0,
      "look rung must carry a non-empty lookDirective"
    );
    assert.equal(env.stopDirective, false);
    assertEnvelopeShape(env, "look(default)");
  });

  test("DEFAULT ({}) → mode:'look' (empty object behaves like no inputs)", () => {
    const env = resolveResponseMode({});
    assert.equal(env.mode, "look", `empty-object default must be 'look', got '${env.mode}'`);
  });

  test("{looked:true} → mode:'smallest' with smallestDirective", () => {
    const env = resolveResponseMode({ looked: true });
    assert.equal(env.mode, "smallest", `looked → 'smallest', got '${env.mode}'`);
    assert.ok(
      typeof env.smallestDirective === "string" && env.smallestDirective.length > 0,
      "smallest rung must carry a non-empty smallestDirective"
    );
    assert.equal(env.stopDirective, false);
    assertEnvelopeShape(env, "smallest");
  });

  test("{looked:true, smallestProposed:true} → mode:'spike' (uncertainty remains, spike feasible)", () => {
    const env = resolveResponseMode({ looked: true, smallestProposed: true });
    assert.equal(env.mode, "spike", `looked+smallest → 'spike', got '${env.mode}'`);
    assert.equal(env.adversaryMandatory, false);
    assert.equal(env.stopDirective, false);
    assertEnvelopeShape(env, "spike(demoted)");
  });

  test("{wartDiscovered:true} → mode:'defer' with deferDirective (terminal)", () => {
    const env = resolveResponseMode({ wartDiscovered: true });
    assert.equal(env.mode, "defer", `wartDiscovered → 'defer', got '${env.mode}'`);
    assert.ok(
      typeof env.deferDirective === "string" && env.deferDirective.length > 0,
      "defer rung must carry a non-empty deferDirective"
    );
    assert.equal(env.stopDirective, false);
    assertEnvelopeShape(env, "defer");
  });

  // -------------------------------------------------------------------------
  // PRESERVED R-ARCH-4 / R-ARCH-5 (still fire on explicit inputs, ahead of the ladder)
  // -------------------------------------------------------------------------

  test("{spikeFeasible:false} → 'adversary-only' + adversaryMandatory:true (R-ARCH-5 preserved)", () => {
    const env = resolveResponseMode({ looked: true, smallestProposed: true, spikeFeasible: false });
    assert.equal(env.mode, "adversary-only", `R-ARCH-5: expected 'adversary-only', got '${env.mode}'`);
    assert.equal(env.adversaryMandatory, true, "R-ARCH-5: adversaryMandatory must be true");
    assert.equal(env.provenByAdversaryOnly, true, "R-ARCH-5: provenByAdversaryOnly must be true");
    assert.equal(env.stopDirective, false);
    assert.ok(
      typeof env.spikeSkipReason === "string" && env.spikeSkipReason.length > 0,
      "R-ARCH-5: spikeSkipReason must be a non-empty logged skip"
    );
    assertEnvelopeShape(env, "R-ARCH-5");
  });

  test("{spikeFeasible:false} alone → 'adversary-only' (infeasible wins over the ladder)", () => {
    const env = resolveResponseMode({ spikeFeasible: false });
    assert.equal(env.mode, "adversary-only");
    assert.equal(env.adversaryMandatory, true);
  });

  test("{spikePassed:false} → stopDirective:true (R-ARCH-4 preserved — STOP)", () => {
    const env = resolveResponseMode({ spikePassed: false });
    assert.equal(env.stopDirective, true, "R-ARCH-4: spike-fail must STOP (stopDirective:true)");
    assert.equal(env.adversaryMandatory, true);
    assert.ok(
      typeof env.stopReason === "string" && env.stopReason.length > 0,
      "R-ARCH-4: stopReason must be present when stopDirective:true"
    );
    assertEnvelopeShape(env, "R-ARCH-4");
  });

  test("{spikePassed:true} → mode:'spike', NOT stopped (happy path)", () => {
    const env = resolveResponseMode({ spikePassed: true });
    assert.equal(env.mode, "spike", `spike-passed → 'spike', got '${env.mode}'`);
    assert.equal(env.stopDirective, false, "spike-passed must NOT stop");
    assert.equal(env.adversaryMandatory, false);
    assert.equal(env.provenByAdversaryOnly, false);
    assertEnvelopeShape(env, "spike-passed");
  });

  // -------------------------------------------------------------------------
  // Precedence: explicit spike inputs outrank the ladder rungs
  // -------------------------------------------------------------------------

  test("spikePassed:false outranks ladder inputs (STOP wins even with looked/smallest set)", () => {
    const env = resolveResponseMode({ looked: true, smallestProposed: true, spikePassed: false });
    assert.equal(env.stopDirective, true, "R-ARCH-4 must win over the ladder");
    assert.equal(env.mode, "adversary-only");
  });

  // -------------------------------------------------------------------------
  // BACKWARD-COMPAT: every return shape carries the 4 keys; never throws on garbage
  // -------------------------------------------------------------------------

  test("every documented rung carries all 4 backward-compat keys", () => {
    const shapes = [
      [undefined, "no-args"],
      [{}, "empty"],
      [{ looked: true }, "smallest"],
      [{ looked: true, smallestProposed: true }, "spike-ladder"],
      [{ wartDiscovered: true }, "defer"],
      [{ spikeFeasible: false }, "R-ARCH-5"],
      [{ spikePassed: false }, "R-ARCH-4"],
      [{ spikePassed: true }, "spike-passed"],
    ];
    for (const [opts, label] of shapes) {
      assertEnvelopeShape(resolveResponseMode(opts), label);
    }
  });

  test("never throws on garbage input → returns a safe envelope, not an exception", () => {
    const garbage = [
      null,
      undefined,
      {},
      { looked: "yes" },
      { looked: 1, smallestProposed: 0 },
      { spikeFeasible: "no", spikePassed: "maybe" },
      { wartDiscovered: "later", looked: null },
      { unrelated: { nested: true } },
    ];
    for (const g of garbage) {
      let env;
      assert.doesNotThrow(() => {
        env = resolveResponseMode(g);
      }, `resolveResponseMode(${JSON.stringify(g)}) must not throw`);
      assertEnvelopeShape(env, `garbage:${JSON.stringify(g)}`);
    }
  });

  test("deterministic: identical inputs → identical envelope", () => {
    const a = resolveResponseMode({ looked: true });
    const b = resolveResponseMode({ looked: true });
    assert.deepEqual(a, b, "same inputs must yield byte-identical envelopes");
  });
});
