/**
 * test-injector.js — TEST-ONLY INFRASTRUCTURE. DO NOT REQUIRE FROM PRODUCTION CODE.
 *
 * Loaded into the child process via NODE_OPTIONS=--require when running the
 * E2E test at `scripts/gsd-t-context-meter.e2e.test.js`. Its job is to monkey-
 * patch `count-tokens-client.countTokens` so the real child-process hook (which
 * normally calls https://api.anthropic.com) is redirected to a local stub HTTP
 * server bound on 127.0.0.1:{random-port}.
 *
 * Production NEVER loads this file:
 *   - The hook script (`scripts/gsd-t-context-meter.js`) does not require it.
 *   - The npm installer does not ship `NODE_OPTIONS` anywhere near it.
 *   - The file lives under `scripts/context-meter/` only so the E2E test can
 *     point `--require` at a stable absolute path; nothing in the runtime
 *     require graph pulls it in on its own.
 *
 * Activation:
 *   - Reads `process.env.GSD_T_CONTEXT_METER_TEST_BASE_URL`. If unset, the file
 *     is a no-op (and `NODE_OPTIONS=--require` with this path on a production
 *     invocation would still be a harmless no-op).
 *   - When set, resolves and requires `./count-tokens-client`, wraps its
 *     `countTokens` export to inject `_baseUrl` before every call, and
 *     reassigns the property on the same module.exports object — so any later
 *     `require('./count-tokens-client')` from the hook sees the patched fn.
 *
 * Why this exists:
 *   Tasks 1–4 tested `runMeter()` via dependency injection. Task 5 tests the
 *   real child-process hook as Claude Code would invoke it, which means no DI
 *   seams are available — only stdin, stdout, and env. The hook's CLI shim does
 *   not accept `_baseUrl` as a config param (by design: production must never
 *   be routable to a non-Anthropic host). So the only honest way to redirect
 *   HTTP in a black-box test is to monkey-patch the HTTP client *inside* the
 *   child process, gated on a test-only env var. That is what this file does.
 *
 * @module scripts/context-meter/test-injector
 */

"use strict";

const baseUrl = process.env.GSD_T_CONTEXT_METER_TEST_BASE_URL;
if (baseUrl && typeof baseUrl === "string" && baseUrl.length > 0) {
  try {
    const clientPath = require.resolve("./count-tokens-client");
    const client = require(clientPath);
    const original = client.countTokens;
    if (typeof original === "function") {
      client.countTokens = function patchedCountTokens(opts) {
        const merged = Object.assign({}, opts || {}, { _baseUrl: baseUrl });
        return original(merged);
      };
    }
  } catch (_) {
    // Silent — an injector failure must never break the child process.
  }
}
