/**
 * M34: Context Meter installer-integration tests
 * Covers Task 5 (task-counter retirement migration) and Task 6 (installer units)
 * Uses Node.js built-in test runner (node --test) with tempdir fixtures.
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  runTaskCounterRetirementMigration,
  installContextMeter,
  configureContextMeterHooks,
  ensureGitignoreEntries,
  resolveApiKeyEnvVar,
  PKG_ROOT,
} = require("../bin/gsd-t.js");

let tmpDir;

function mkTempProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m34-")));
  fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
  fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  return dir;
}

function rmrf(dir) {
  if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

describe("runTaskCounterRetirementMigration", () => {
  beforeEach(() => { tmpDir = mkTempProject(); });
  afterEach(() => { rmrf(tmpDir); });

  it("removes legacy task-counter files and writes marker on first run", () => {
    fs.writeFileSync(path.join(tmpDir, "bin", "task-counter.cjs"), "// legacy");
    fs.writeFileSync(path.join(tmpDir, ".gsd-t", "task-counter-config.json"), "{}");
    fs.writeFileSync(path.join(tmpDir, ".gsd-t", ".task-counter-state.json"), "{}");
    fs.writeFileSync(path.join(tmpDir, ".gsd-t", ".task-counter"), "3");

    const result = runTaskCounterRetirementMigration(tmpDir, "test-proj");

    assert.equal(result, true);
    assert.equal(fs.existsSync(path.join(tmpDir, "bin", "task-counter.cjs")), false);
    assert.equal(fs.existsSync(path.join(tmpDir, ".gsd-t", "task-counter-config.json")), false);
    assert.equal(fs.existsSync(path.join(tmpDir, ".gsd-t", ".task-counter-state.json")), false);
    assert.equal(fs.existsSync(path.join(tmpDir, ".gsd-t", ".task-counter")), false);
    assert.equal(fs.existsSync(path.join(tmpDir, ".gsd-t", ".task-counter-retired-v1")), true);
  });

  it("is idempotent — second run returns false without touching anything", () => {
    const r1 = runTaskCounterRetirementMigration(tmpDir, "test-proj");
    assert.equal(r1, true);
    const markerStat1 = fs.statSync(path.join(tmpDir, ".gsd-t", ".task-counter-retired-v1"));

    const r2 = runTaskCounterRetirementMigration(tmpDir, "test-proj");
    assert.equal(r2, false);

    const markerStat2 = fs.statSync(path.join(tmpDir, ".gsd-t", ".task-counter-retired-v1"));
    assert.equal(markerStat1.mtimeMs, markerStat2.mtimeMs);
  });

  it("runs successfully when no legacy files exist (fresh project)", () => {
    const result = runTaskCounterRetirementMigration(tmpDir, "test-proj");
    assert.equal(result, true);
    assert.equal(fs.existsSync(path.join(tmpDir, ".gsd-t", ".task-counter-retired-v1")), true);
  });

  it("returns false when .gsd-t directory does not exist", () => {
    const barren = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-barren-")));
    try {
      const result = runTaskCounterRetirementMigration(barren, "barren");
      assert.equal(result, false);
    } finally {
      rmrf(barren);
    }
  });

  it("marker file records version and replacement source", () => {
    runTaskCounterRetirementMigration(tmpDir, "test-proj");
    const marker = fs.readFileSync(path.join(tmpDir, ".gsd-t", ".task-counter-retired-v1"), "utf8");
    assert.match(marker, /task-counter-retired-v1/);
    assert.match(marker, /Applied:/);
    assert.match(marker, /context-meter/);
  });
});

describe("ensureGitignoreEntries", () => {
  beforeEach(() => { tmpDir = mkTempProject(); });
  afterEach(() => { rmrf(tmpDir); });

  it("creates .gitignore if missing", () => {
    ensureGitignoreEntries(tmpDir, [".gsd-t/.context-meter-state.json", ".gsd-t/context-meter.log"]);
    const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf8");
    assert.match(content, /\.context-meter-state\.json/);
    assert.match(content, /context-meter\.log/);
  });

  it("is idempotent — second call does not duplicate entries", () => {
    const entries = [".gsd-t/.context-meter-state.json"];
    ensureGitignoreEntries(tmpDir, entries);
    ensureGitignoreEntries(tmpDir, entries);
    const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf8");
    const matches = content.match(/\.context-meter-state\.json/g) || [];
    assert.equal(matches.length, 1);
  });

  it("preserves existing .gitignore content when appending", () => {
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules/\n.env\n");
    ensureGitignoreEntries(tmpDir, [".gsd-t/.context-meter-state.json"]);
    const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf8");
    assert.match(content, /node_modules\//);
    assert.match(content, /\.env/);
    assert.match(content, /\.context-meter-state\.json/);
  });
});

describe("installContextMeter", () => {
  beforeEach(() => { tmpDir = mkTempProject(); });
  afterEach(() => { rmrf(tmpDir); });

  it("copies hook script and runtime files into project scripts dir", () => {
    installContextMeter(tmpDir);
    assert.equal(fs.existsSync(path.join(tmpDir, "scripts", "gsd-t-context-meter.js")), true);
    assert.equal(fs.existsSync(path.join(tmpDir, "scripts", "context-meter")), true);
  });

  it("copies config template into .gsd-t/ only if not already present", () => {
    const configPath = path.join(tmpDir, ".gsd-t", "context-meter-config.json");
    installContextMeter(tmpDir);
    assert.equal(fs.existsSync(configPath), true);
    const userConfig = '{"apiKeyEnvVar":"MY_CUSTOM_KEY"}';
    fs.writeFileSync(configPath, userConfig);
    installContextMeter(tmpDir);
    const stillUserConfig = fs.readFileSync(configPath, "utf8");
    assert.equal(stillUserConfig, userConfig);
  });

  it("appends .gitignore entries on install", () => {
    installContextMeter(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf8");
    assert.match(content, /\.context-meter-state\.json/);
  });
});

describe("configureContextMeterHooks", () => {
  beforeEach(() => { tmpDir = mkTempProject(); });
  afterEach(() => { rmrf(tmpDir); });

  it("adds PostToolUse hook entry to fresh settings.json", () => {
    const settingsPath = path.join(tmpDir, "settings.json");
    const result = configureContextMeterHooks(settingsPath);
    assert.equal(result.installed, true);
    assert.equal(result.action, "added");
    const s = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.ok(s.hooks?.PostToolUse);
    const meterHooks = s.hooks.PostToolUse.filter((entry) =>
      entry.hooks?.some((h) => h.command?.includes("gsd-t-context-meter"))
    );
    assert.equal(meterHooks.length, 1);
  });

  it("is idempotent — second call returns noop action", () => {
    const settingsPath = path.join(tmpDir, "settings.json");
    configureContextMeterHooks(settingsPath);
    const result = configureContextMeterHooks(settingsPath);
    assert.equal(result.action, "noop");
    const s = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const meterHooks = s.hooks.PostToolUse.filter((entry) =>
      entry.hooks?.some((h) => h.command?.includes("gsd-t-context-meter"))
    );
    assert.equal(meterHooks.length, 1);
  });

  it("preserves existing hooks and top-level settings", () => {
    const settingsPath = path.join(tmpDir, "settings.json");
    const existing = {
      theme: "dark",
      env: { FOO: "bar" },
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo pre" }] }],
        PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "echo post" }] }],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));

    configureContextMeterHooks(settingsPath);

    const s = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.equal(s.theme, "dark");
    assert.deepEqual(s.env, { FOO: "bar" });
    assert.equal(s.hooks.PreToolUse.length, 1);
    assert.equal(s.hooks.PreToolUse[0].hooks[0].command, "echo pre");
    assert.equal(s.hooks.PostToolUse.length, 2);
    assert.ok(s.hooks.PostToolUse.some((e) =>
      e.hooks?.some((h) => h.command?.includes("gsd-t-context-meter"))
    ));
    assert.ok(s.hooks.PostToolUse.some((e) =>
      e.hooks?.some((h) => h.command === "echo post")
    ));
  });
});

describe("resolveApiKeyEnvVar", () => {
  beforeEach(() => { tmpDir = mkTempProject(); });
  afterEach(() => { rmrf(tmpDir); });

  it("defaults to ANTHROPIC_API_KEY when no config file exists", () => {
    const varName = resolveApiKeyEnvVar(tmpDir);
    assert.equal(varName, "ANTHROPIC_API_KEY");
  });

  it("reads apiKeyEnvVar override from .gsd-t/context-meter-config.json", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".gsd-t", "context-meter-config.json"),
      JSON.stringify({ apiKeyEnvVar: "CUSTOM_KEY_VAR" })
    );
    const varName = resolveApiKeyEnvVar(tmpDir);
    assert.equal(varName, "CUSTOM_KEY_VAR");
  });
});
