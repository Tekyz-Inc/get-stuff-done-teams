/**
 * count-tokens-client.js
 *
 * Zero-dependency Node.js client for Anthropic's `POST /v1/messages/count_tokens`
 * endpoint. Built on the built-in `https` / `http` modules so the Context Meter
 * hook ships with no runtime dependencies.
 *
 * Contract: `.gsd-t/contracts/context-meter-contract.md` — "count_tokens API usage"
 *
 * Design notes:
 *
 *   - Every failure mode returns `null`. The caller (the hook in Task 4) treats
 *     `null` as "fail open" — it simply emits `{}` on stdout and Claude is never
 *     blocked. This function NEVER throws.
 *
 *   - The `system` field on the Messages API rejects an empty string
 *     (`system: ""` → 400). The `{ system, messages }` shape produced by
 *     `transcript-parser.js` starts with an empty system string when the
 *     transcript has no system blocks, so this client DROPS the `system` key
 *     from the request body when the input is an empty string. Any non-empty
 *     system is forwarded as-is.
 *
 *   - The hard timeout uses `req.setTimeout(ms)`; on fire we `req.destroy()` to
 *     release the socket and return `null`. Without the explicit destroy the
 *     socket can linger for the OS-level keep-alive window, which matters when
 *     the hook is already at its ~200ms latency budget.
 *
 *   - We NEVER log the request body. The only diagnostic signal this module
 *     produces is the returned value itself (`null` on failure). Any logging
 *     is the caller's responsibility — the hook writes to `logPath` per config.
 *
 *   - A hidden `_baseUrl` option lets the tests point the client at a local
 *     stub HTTP server bound to `127.0.0.1:0`. Production callers never pass
 *     `_baseUrl`. Parsing uses `URL` so either http or https works transparently.
 *
 * @module scripts/context-meter/count-tokens-client
 */

"use strict";

const https = require("https");
const http = require("http");
const { URL } = require("url");

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const COUNT_TOKENS_PATH = "/v1/messages/count_tokens";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Call Anthropic count_tokens.
 *
 * @param {object} opts
 * @param {string} opts.apiKey - Anthropic API key (from env var named in config)
 * @param {string} opts.model - model id, e.g. "claude-opus-4-6"
 * @param {string} opts.system - system prompt text; dropped from body if ""
 * @param {Array}  opts.messages - messages array from transcript-parser.js
 * @param {number} opts.timeoutMs - hard timeout for the whole request
 * @param {string} [opts._baseUrl] - TEST ONLY: override the base URL
 * @returns {Promise<{inputTokens: number} | null>} tokens on success, null on any failure
 */
function countTokens(opts) {
  return new Promise((resolve) => {
    // Single outer try/catch — any synchronous throw below becomes `null`.
    try {
      if (!opts || typeof opts !== "object") {
        resolve(null);
        return;
      }

      const {
        apiKey,
        model,
        system,
        messages,
        timeoutMs,
        _baseUrl,
      } = opts;

      if (typeof apiKey !== "string" || apiKey.length === 0) {
        resolve(null);
        return;
      }
      if (typeof model !== "string" || model.length === 0) {
        resolve(null);
        return;
      }
      if (!Array.isArray(messages)) {
        resolve(null);
        return;
      }
      if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        resolve(null);
        return;
      }

      // Build request body. Drop `system` when it's an empty string —
      // the endpoint rejects `system: ""` with a 400.
      const body = { model, messages };
      if (typeof system === "string" && system.length > 0) {
        body.system = system;
      } else if (system != null && typeof system !== "string") {
        // Unusual shape — do not forward.
        resolve(null);
        return;
      }

      let payload;
      try {
        payload = JSON.stringify(body);
      } catch (_) {
        resolve(null);
        return;
      }

      // Parse base URL — test code passes http://127.0.0.1:<port>, prod uses https.
      let parsed;
      try {
        parsed = new URL(COUNT_TOKENS_PATH, _baseUrl || DEFAULT_BASE_URL);
      } catch (_) {
        resolve(null);
        return;
      }

      const isHttps = parsed.protocol === "https:";
      const transport = isHttps ? https : http;

      const reqOptions = {
        method: "POST",
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      };

      let settled = false;
      const settle = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      let req;
      try {
        req = transport.request(reqOptions, (res) => {
          const status = res.statusCode || 0;
          const chunks = [];
          res.on("data", (chunk) => {
            chunks.push(chunk);
          });
          res.on("end", () => {
            if (status !== 200) {
              // 401 / 403 / 429 / 5xx — fail open silently.
              settle(null);
              return;
            }
            let text;
            try {
              text = Buffer.concat(chunks).toString("utf8");
            } catch (_) {
              settle(null);
              return;
            }
            let parsedBody;
            try {
              parsedBody = JSON.parse(text);
            } catch (_) {
              settle(null);
              return;
            }
            if (!parsedBody || typeof parsedBody !== "object") {
              settle(null);
              return;
            }
            const n = Number(parsedBody.input_tokens);
            if (!Number.isFinite(n)) {
              settle(null);
              return;
            }
            settle({ inputTokens: n });
          });
          res.on("error", () => {
            settle(null);
          });
        });
      } catch (_) {
        settle(null);
        return;
      }

      req.on("error", () => {
        settle(null);
      });

      req.setTimeout(timeoutMs, () => {
        // Destroy the socket so it doesn't linger beyond the hook's latency budget.
        try {
          req.destroy();
        } catch (_) {
          /* ignore */
        }
        settle(null);
      });

      try {
        req.write(payload);
        req.end();
      } catch (_) {
        settle(null);
      }
    } catch (_) {
      resolve(null);
    }
  });
}

module.exports = { countTokens };
