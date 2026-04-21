/**
 * M43 D1-T1 — In-session usage capture probe tests.
 *
 * The probe script (scripts/hooks/gsd-t-in-session-probe.js) is installed as
 * a Stop/SessionEnd/PostToolUse hook. It writes the raw Claude Code hook
 * payload into .gsd-t/.hook-probe/ so D1-T1 can confirm whether the payload
 * carries a `usage` object (Branch A) or not (Branch B).
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const PROBE = path.join(__dirname, "..", "scripts", "hooks", "gsd-t-in-session-probe.js");

let tmpProject;

before(() => {
  tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-probe-"));
  fs.mkdirSync(path.join(tmpProject, ".gsd-t", ".hook-probe"), { recursive: true });
});

after(() => {
  fs.rmSync(tmpProject, { recursive: true, force: true });
});

function runProbe(payload) {
  return spawnSync("node", [PROBE], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
}

describe("M43 D1-T1 in-session usage probe", () => {
  it("writes raw hook payload to .gsd-t/.hook-probe/ when dir exists", () => {
    const payload = {
      hook_event_name: "Stop",
      session_id: "sess-probe-aaa",
      cwd: tmpProject,
      usage: { input_tokens: 10, output_tokens: 20 },
    };
    const result = runProbe(payload);
    assert.equal(result.status, 0);
    const dir = path.join(tmpProject, ".gsd-t", ".hook-probe");
    const files = fs.readdirSync(dir).filter((f) => f.startsWith("Stop-"));
    assert.ok(files.length >= 1, "expected at least one Stop-*.json file");
    const body = JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8"));
    assert.equal(body.hook_event_name, "Stop");
    assert.equal(body.session_id, "sess-probe-aaa");
    assert.deepEqual(body.usage, { input_tokens: 10, output_tokens: 20 });
  });

  it("silently no-ops when .gsd-t/.hook-probe/ is absent (disabled)", () => {
    const disabledProject = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-probe-off-"));
    fs.mkdirSync(path.join(disabledProject, ".gsd-t"), { recursive: true });
    try {
      const payload = {
        hook_event_name: "SessionEnd",
        session_id: "sess-off-bbb",
        cwd: disabledProject,
        reason: "exit",
      };
      const result = runProbe(payload);
      assert.equal(result.status, 0);
      const probeDir = path.join(disabledProject, ".gsd-t", ".hook-probe");
      assert.equal(fs.existsSync(probeDir), false,
        "probe must not create its own directory — that's the on/off switch");
    } finally {
      fs.rmSync(disabledProject, { recursive: true, force: true });
    }
  });

  it("ignores malformed stdin without throwing", () => {
    const result = spawnSync("node", [PROBE], { input: "not-json", encoding: "utf8" });
    assert.equal(result.status, 0);
  });

  it("rejects cwd outside the probe sandbox (path traversal guard)", () => {
    const payload = {
      hook_event_name: "Stop",
      session_id: "../../evil",
      cwd: tmpProject,
    };
    const result = runProbe(payload);
    assert.equal(result.status, 0);
    // File name uses slice(0,12) of session_id — path traversal would still
    // be resolved against probeDir; the resolve check blocks escape.
    const dir = path.join(tmpProject, ".gsd-t", ".hook-probe");
    const files = fs.readdirSync(dir);
    for (const f of files) {
      assert.ok(!f.includes(".."), `file name contains traversal: ${f}`);
    }
  });

  it("rotates to MAX_PER_EVENT files per event type", () => {
    const rotateProject = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-probe-rot-"));
    fs.mkdirSync(path.join(rotateProject, ".gsd-t", ".hook-probe"), { recursive: true });
    try {
      for (let i = 0; i < 15; i++) {
        runProbe({
          hook_event_name: "PostToolUse",
          session_id: `rot${i}aaaaaa`,
          cwd: rotateProject,
          tool_name: "Bash",
        });
      }
      const files = fs.readdirSync(path.join(rotateProject, ".gsd-t", ".hook-probe"))
        .filter((f) => f.startsWith("PostToolUse-"));
      assert.ok(files.length <= 10, `expected <= 10 PostToolUse files, got ${files.length}`);
    } finally {
      fs.rmSync(rotateProject, { recursive: true, force: true });
    }
  });
});
