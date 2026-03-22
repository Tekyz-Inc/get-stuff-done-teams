/**
 * Tests for M23 Headless Mode (headless-exec + headless-query)
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  parseHeadlessFlags,
  buildHeadlessCmd,
  mapHeadlessExitCode,
  headlessLogPath,
  queryStatus,
  queryDomains,
  queryContracts,
  queryDebt,
  queryContext,
  queryBacklog,
  queryGraph,
  VALID_QUERY_TYPES,
} = require("../bin/gsd-t.js");

// ─── parseHeadlessFlags ──────────────────────────────────────────────────────

describe("parseHeadlessFlags", () => {
  it("returns defaults when no flags given", () => {
    const { flags, positional } = parseHeadlessFlags(["verify"]);
    assert.equal(flags.json, false);
    assert.equal(flags.timeout, 300);
    assert.equal(flags.log, false);
    assert.deepStrictEqual(positional, ["verify"]);
  });

  it("parses --json flag", () => {
    const { flags, positional } = parseHeadlessFlags(["verify", "--json"]);
    assert.equal(flags.json, true);
    assert.deepStrictEqual(positional, ["verify"]);
  });

  it("parses --timeout=N flag", () => {
    const { flags } = parseHeadlessFlags(["--timeout=600"]);
    assert.equal(flags.timeout, 600);
  });

  it("parses --log flag", () => {
    const { flags } = parseHeadlessFlags(["--log"]);
    assert.equal(flags.log, true);
  });

  it("ignores invalid --timeout value", () => {
    const { flags } = parseHeadlessFlags(["--timeout=abc"]);
    assert.equal(flags.timeout, 300); // default preserved
  });

  it("extracts positional args separate from flags", () => {
    const { flags, positional } = parseHeadlessFlags(["execute", "--json", "--timeout=120", "--log", "arg1"]);
    assert.equal(flags.json, true);
    assert.equal(flags.timeout, 120);
    assert.equal(flags.log, true);
    assert.deepStrictEqual(positional, ["execute", "arg1"]);
  });
});

// ─── buildHeadlessCmd ────────────────────────────────────────────────────────

describe("buildHeadlessCmd", () => {
  it("builds prompt with no args", () => {
    const result = buildHeadlessCmd("verify", []);
    assert.equal(result, "/user:gsd-t-verify");
  });

  it("builds prompt with args", () => {
    const result = buildHeadlessCmd("execute", ["--domain=auth"]);
    assert.equal(result, "/user:gsd-t-execute --domain=auth");
  });

  it("builds prompt with multiple args", () => {
    const result = buildHeadlessCmd("wave", ["--phase=execute", "--dry-run"]);
    assert.equal(result, "/user:gsd-t-wave --phase=execute --dry-run");
  });
});

// ─── mapHeadlessExitCode ─────────────────────────────────────────────────────

describe("mapHeadlessExitCode", () => {
  it("returns 0 for clean success", () => {
    assert.equal(mapHeadlessExitCode(0, "All tests passed."), 0);
  });

  it("returns 3 for non-zero process exit", () => {
    assert.equal(mapHeadlessExitCode(1, "Some output"), 3);
  });

  it("returns 1 for verification failure in output", () => {
    assert.equal(mapHeadlessExitCode(0, "verification failed — quality gate"), 1);
  });

  it("returns 1 for verify failed variant", () => {
    assert.equal(mapHeadlessExitCode(0, "Verify failed: 3 tests failing"), 1);
  });

  it("returns 2 for context budget exceeded", () => {
    assert.equal(mapHeadlessExitCode(0, "Context budget exceeded — stopping"), 2);
  });

  it("returns 2 for token limit variant", () => {
    assert.equal(mapHeadlessExitCode(0, "Token limit reached in context window"), 2);
  });

  it("returns 4 for blocked needs human", () => {
    assert.equal(mapHeadlessExitCode(0, "Blocked — needs human approval to proceed"), 4);
  });

  it("returns 4 for human input variant", () => {
    assert.equal(mapHeadlessExitCode(0, "Blocked: human input required"), 4);
  });

  it("prioritizes non-zero process exit over output patterns", () => {
    assert.equal(mapHeadlessExitCode(2, "verification failed"), 3);
  });
});

// ─── headlessLogPath ─────────────────────────────────────────────────────────

describe("headlessLogPath", () => {
  it("generates path with timestamp", () => {
    const result = headlessLogPath("/project", 1742641200000);
    assert.equal(result, path.join("/project", ".gsd-t", "headless-1742641200000.log"));
  });

  it("uses current time when no timestamp given", () => {
    const before = Date.now();
    const result = headlessLogPath("/project");
    const ts = parseInt(path.basename(result).replace("headless-", "").replace(".log", ""));
    assert.ok(ts >= before, "timestamp should be >= before call");
    assert.ok(ts <= Date.now() + 100, "timestamp should be close to now");
  });
});

// ─── VALID_QUERY_TYPES ───────────────────────────────────────────────────────

describe("VALID_QUERY_TYPES", () => {
  it("contains all 7 required types", () => {
    const required = ["status", "domains", "contracts", "debt", "context", "backlog", "graph"];
    for (const type of required) {
      assert.ok(VALID_QUERY_TYPES.includes(type), `should include ${type}`);
    }
    assert.equal(VALID_QUERY_TYPES.length, 7);
  });
});

// ─── Query functions (with temp dirs) ────────────────────────────────────────

function makeTempProject(structure) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-headless-test-"));
  for (const [filePath, content] of Object.entries(structure)) {
    const full = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }
  return dir;
}

describe("queryStatus", () => {
  it("returns error when progress.md missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-qs-"));
    const result = queryStatus(dir);
    assert.equal(result.type, "status");
    assert.ok(result.data.error);
    fs.rmSync(dir, { recursive: true });
  });

  it("parses progress.md fields", () => {
    const dir = makeTempProject({
      ".gsd-t/progress.md": [
        "# GSD-T Progress",
        "## Project: My App",
        "## Status: IN PROGRESS",
        "## Version: 2.41.10",
        "## Active Milestone",
        "M23 — Headless Mode",
        "Phase: EXECUTE"
      ].join("\n")
    });
    const result = queryStatus(dir);
    assert.equal(result.type, "status");
    assert.equal(result.data.version, "2.41.10");
    assert.equal(result.data.project, "My App");
    assert.equal(result.data.status, "IN PROGRESS");
    assert.equal(result.data.phase, "EXECUTE");
    fs.rmSync(dir, { recursive: true });
  });
});

describe("queryDomains", () => {
  it("returns empty when domains dir missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-qd-"));
    const result = queryDomains(dir);
    assert.equal(result.type, "domains");
    assert.deepStrictEqual(result.data.domains, []);
    fs.rmSync(dir, { recursive: true });
  });

  it("lists domains with correct flags", () => {
    const dir = makeTempProject({
      ".gsd-t/domains/auth/scope.md": "# Auth scope",
      ".gsd-t/domains/auth/tasks.md": "# Auth tasks",
      ".gsd-t/domains/billing/scope.md": "# Billing scope"
    });
    const result = queryDomains(dir);
    assert.equal(result.type, "domains");
    const auth = result.data.domains.find((d) => d.name === "auth");
    assert.ok(auth);
    assert.equal(auth.hasScope, true);
    assert.equal(auth.hasTasks, true);
    assert.equal(auth.hasConstraints, false);
    const billing = result.data.domains.find((d) => d.name === "billing");
    assert.ok(billing);
    assert.equal(billing.hasTasks, false);
    fs.rmSync(dir, { recursive: true });
  });
});

describe("queryContracts", () => {
  it("returns empty when contracts dir missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-qc-"));
    const result = queryContracts(dir);
    assert.equal(result.type, "contracts");
    assert.deepStrictEqual(result.data.contracts, []);
    fs.rmSync(dir, { recursive: true });
  });

  it("lists contract files", () => {
    const dir = makeTempProject({
      ".gsd-t/contracts/api-contract.md": "# API",
      ".gsd-t/contracts/schema-contract.md": "# Schema",
      ".gsd-t/contracts/.gitkeep": ""
    });
    const result = queryContracts(dir);
    assert.equal(result.type, "contracts");
    assert.ok(result.data.contracts.includes("api-contract.md"));
    assert.ok(result.data.contracts.includes("schema-contract.md"));
    assert.ok(!result.data.contracts.includes(".gitkeep"));
    fs.rmSync(dir, { recursive: true });
  });
});

describe("queryDebt", () => {
  it("returns empty when techdebt.md missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-qdebt-"));
    const result = queryDebt(dir);
    assert.equal(result.type, "debt");
    assert.equal(result.data.count, 0);
    fs.rmSync(dir, { recursive: true });
  });

  it("parses debt table rows", () => {
    const dir = makeTempProject({
      ".gsd-t/techdebt.md": [
        "# Tech Debt",
        "| ID | Severity | Description |",
        "| --- | --- | --- |",
        "| D001 | HIGH | Large file in utils.js |",
        "| D002 | LOW | Missing tests |"
      ].join("\n")
    });
    const result = queryDebt(dir);
    assert.equal(result.type, "debt");
    assert.equal(result.data.count, 2);
    assert.equal(result.data.items[0].id, "D001");
    assert.equal(result.data.items[0].severity, "HIGH");
    fs.rmSync(dir, { recursive: true });
  });
});

describe("queryContext", () => {
  it("returns empty when token-log.md missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-qctx-"));
    const result = queryContext(dir);
    assert.equal(result.type, "context");
    assert.equal(result.data.entryCount, 0);
    assert.equal(result.data.totalTokens, 0);
    fs.rmSync(dir, { recursive: true });
  });

  it("parses token log entries", () => {
    const dir = makeTempProject({
      ".gsd-t/token-log.md": [
        "| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        "| 2026-03-22 10:00 | 2026-03-22 10:05 | gsd-t-execute | Step 1 | sonnet | 300s | auth domain | 5000 | null |",
        "| 2026-03-22 10:10 | 2026-03-22 10:12 | gsd-t-verify | Step 1 | haiku | 120s | QA | 2500 | null |"
      ].join("\n")
    });
    const result = queryContext(dir);
    assert.equal(result.type, "context");
    assert.equal(result.data.entryCount, 2);
    assert.equal(result.data.totalTokens, 7500);
    fs.rmSync(dir, { recursive: true });
  });
});

describe("queryBacklog", () => {
  it("returns empty when backlog.md missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-qbl-"));
    const result = queryBacklog(dir);
    assert.equal(result.type, "backlog");
    assert.equal(result.data.count, 0);
    fs.rmSync(dir, { recursive: true });
  });

  it("parses backlog items", () => {
    const dir = makeTempProject({
      ".gsd-t/backlog.md": [
        "| # | ID | Title | Status |",
        "| --- | --- | --- | --- |",
        "| 1 | B001 | Add dark mode | OPEN |",
        "| 2 | B002 | Fix login bug | IN PROGRESS |"
      ].join("\n")
    });
    const result = queryBacklog(dir);
    assert.equal(result.type, "backlog");
    // Rows start with "| 1 |" or "| 2 |", not "| ID" or "| ---"
    assert.ok(result.data.count >= 2);
    fs.rmSync(dir, { recursive: true });
  });
});

describe("queryGraph", () => {
  it("returns available=false when meta.json missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-qg-"));
    const result = queryGraph(dir);
    assert.equal(result.type, "graph");
    assert.equal(result.data.available, false);
    fs.rmSync(dir, { recursive: true });
  });

  it("parses graph meta.json", () => {
    const meta = {
      provider: "native",
      entityCount: 264,
      relationshipCount: 725,
      lastIndexed: "2026-03-20T12:00:00.000Z"
    };
    const dir = makeTempProject({
      ".gsd-t/graph-index/meta.json": JSON.stringify(meta)
    });
    const result = queryGraph(dir);
    assert.equal(result.type, "graph");
    assert.equal(result.data.available, true);
    assert.equal(result.data.entityCount, 264);
    assert.equal(result.data.relationshipCount, 725);
    assert.equal(result.data.provider, "native");
    fs.rmSync(dir, { recursive: true });
  });

  it("handles corrupt meta.json gracefully", () => {
    const dir = makeTempProject({
      ".gsd-t/graph-index/meta.json": "not-json{"
    });
    const result = queryGraph(dir);
    assert.equal(result.data.available, false);
    assert.ok(result.data.error);
    fs.rmSync(dir, { recursive: true });
  });
});
