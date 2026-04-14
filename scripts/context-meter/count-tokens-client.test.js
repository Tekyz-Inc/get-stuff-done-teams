"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

const { countTokens } = require("./count-tokens-client");

/* ----------------------------- stub server helpers ----------------------------- */

/**
 * Start a stub HTTP server bound to 127.0.0.1:0 (OS-assigned port).
 *
 * @param {(req, res, body) => void} handler
 *   Called on every incoming request. `body` is the full request body as string.
 *   The handler is responsible for writing the response (unless it intentionally
 *   hangs — see the timeout test).
 * @returns {Promise<{server: http.Server, baseUrl: string, lastBody: {value: string|null}}>}
 */
function startStub(handler) {
  return new Promise((resolve, reject) => {
    const lastBody = { value: null };
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        lastBody.value = body;
        try {
          handler(req, res, body);
        } catch (err) {
          try {
            res.statusCode = 500;
            res.end(String(err && err.message));
          } catch (_) {
            /* ignore */
          }
        }
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}`, lastBody });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    // Destroy any lingering sockets so hung handlers don't keep the event loop alive.
    try {
      server.closeAllConnections && server.closeAllConnections();
    } catch (_) {
      /* ignore */
    }
    server.close(() => resolve());
  });
}

/* ---------------------------------- tests ---------------------------------- */

test("happy path → returns { inputTokens }", async () => {
  const { server, baseUrl } = await startStub((req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ input_tokens: 12345 }));
  });
  try {
    const got = await countTokens({
      apiKey: "sk-test",
      model: "claude-opus-4-6",
      system: "you are helpful",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      timeoutMs: 2000,
      _baseUrl: baseUrl,
    });
    assert.deepEqual(got, { inputTokens: 12345 });
  } finally {
    await closeServer(server);
  }
});

test("401 → returns null", async () => {
  const { server, baseUrl } = await startStub((req, res) => {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: { type: "authentication_error", message: "bad key" } }));
  });
  try {
    const got = await countTokens({
      apiKey: "sk-bad",
      model: "claude-opus-4-6",
      system: "",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      timeoutMs: 2000,
      _baseUrl: baseUrl,
    });
    assert.equal(got, null);
  } finally {
    await closeServer(server);
  }
});

test("429 → returns null", async () => {
  const { server, baseUrl } = await startStub((req, res) => {
    res.statusCode = 429;
    res.end("rate limited");
  });
  try {
    const got = await countTokens({
      apiKey: "sk-test",
      model: "claude-opus-4-6",
      system: "",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      timeoutMs: 2000,
      _baseUrl: baseUrl,
    });
    assert.equal(got, null);
  } finally {
    await closeServer(server);
  }
});

test("500 → returns null", async () => {
  const { server, baseUrl } = await startStub((req, res) => {
    res.statusCode = 500;
    res.end("internal");
  });
  try {
    const got = await countTokens({
      apiKey: "sk-test",
      model: "claude-opus-4-6",
      system: "",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      timeoutMs: 2000,
      _baseUrl: baseUrl,
    });
    assert.equal(got, null);
  } finally {
    await closeServer(server);
  }
});

test("timeout → returns null", async () => {
  // Handler never responds — the client's timeoutMs should fire first.
  const { server, baseUrl } = await startStub(() => {
    /* never calls res.end() */
  });
  try {
    const t0 = Date.now();
    const got = await countTokens({
      apiKey: "sk-test",
      model: "claude-opus-4-6",
      system: "",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      timeoutMs: 500,
      _baseUrl: baseUrl,
    });
    const elapsed = Date.now() - t0;
    assert.equal(got, null);
    // Should resolve shortly after the 500ms timeout, well under the 5s test budget.
    assert.ok(elapsed < 3000, `timeout path took too long: ${elapsed}ms`);
  } finally {
    await closeServer(server);
  }
});

test("malformed response JSON → returns null", async () => {
  const { server, baseUrl } = await startStub((req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end('not json{');
  });
  try {
    const got = await countTokens({
      apiKey: "sk-test",
      model: "claude-opus-4-6",
      system: "",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      timeoutMs: 2000,
      _baseUrl: baseUrl,
    });
    assert.equal(got, null);
  } finally {
    await closeServer(server);
  }
});

test("missing input_tokens field → returns null", async () => {
  const { server, baseUrl } = await startStub((req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ other_field: 99 }));
  });
  try {
    const got = await countTokens({
      apiKey: "sk-test",
      model: "claude-opus-4-6",
      system: "",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      timeoutMs: 2000,
      _baseUrl: baseUrl,
    });
    assert.equal(got, null);
  } finally {
    await closeServer(server);
  }
});

test('empty system string → request body OMITS "system" key', async () => {
  const { server, baseUrl, lastBody } = await startStub((req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ input_tokens: 1 }));
  });
  try {
    await countTokens({
      apiKey: "sk-test",
      model: "claude-opus-4-6",
      system: "",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      timeoutMs: 2000,
      _baseUrl: baseUrl,
    });
    assert.ok(lastBody.value, "stub did not receive a body");
    const parsed = JSON.parse(lastBody.value);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed, "system"), false);
    assert.equal(parsed.model, "claude-opus-4-6");
    assert.ok(Array.isArray(parsed.messages));
  } finally {
    await closeServer(server);
  }
});

test('non-empty system → request body INCLUDES "system"', async () => {
  const { server, baseUrl, lastBody } = await startStub((req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ input_tokens: 2 }));
  });
  try {
    await countTokens({
      apiKey: "sk-test",
      model: "claude-opus-4-6",
      system: "some text",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      timeoutMs: 2000,
      _baseUrl: baseUrl,
    });
    assert.ok(lastBody.value, "stub did not receive a body");
    const parsed = JSON.parse(lastBody.value);
    assert.equal(parsed.system, "some text");
  } finally {
    await closeServer(server);
  }
});

test("sends required Anthropic headers", async () => {
  let seenHeaders = null;
  const { server, baseUrl } = await startStub((req, res) => {
    seenHeaders = req.headers;
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ input_tokens: 3 }));
  });
  try {
    await countTokens({
      apiKey: "sk-abc-123",
      model: "claude-opus-4-6",
      system: "",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      timeoutMs: 2000,
      _baseUrl: baseUrl,
    });
    assert.ok(seenHeaders, "stub did not receive headers");
    assert.equal(seenHeaders["x-api-key"], "sk-abc-123");
    assert.equal(seenHeaders["anthropic-version"], "2023-06-01");
    assert.equal(seenHeaders["content-type"], "application/json");
  } finally {
    await closeServer(server);
  }
});

test("invalid opts → returns null without throwing", async () => {
  assert.equal(await countTokens(null), null);
  assert.equal(await countTokens({}), null);
  assert.equal(
    await countTokens({ apiKey: "", model: "m", messages: [], timeoutMs: 100 }),
    null
  );
  assert.equal(
    await countTokens({ apiKey: "k", model: "", messages: [], timeoutMs: 100 }),
    null
  );
  assert.equal(
    await countTokens({ apiKey: "k", model: "m", messages: "no", timeoutMs: 100 }),
    null
  );
  assert.equal(
    await countTokens({ apiKey: "k", model: "m", messages: [], timeoutMs: 0 }),
    null
  );
});
