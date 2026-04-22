/**
 * M43 D4 — Always-headless inversion matrix.
 *
 * Contract: .gsd-t/contracts/headless-default-contract.md v2.0.0
 *
 * Asserts:
 *   1. `shouldSpawnHeadless` is a constant `() => true` regardless of inputs
 *      (default, legacy `--in-session`, legacy `--headless`, low ctx pct,
 *      high ctx pct — every cell resolves to headless).
 *   2. `autoSpawnHeadless` returns `mode: 'headless'` for every row of the
 *      former propagation matrix (watch=true/false × spawnType=primary/validation).
 *   3. No command file in the M43 D4 scope list carries OPERATIONAL uses of
 *      the removed flags (`--in-session`, `--headless`, `WATCH_FLAG=true` path
 *      that routes to in-context). Historical/deprecation mentions are allowed
 *      as long as they label the flag ignored.
 *   4. The `/gsd` router file (`commands/gsd.md`) preserves the dialog-growth
 *      footer (D5) and the v2.0.0 invariant banner.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const has = require("../bin/headless-auto-spawn.cjs");

// ── Scope list (from .gsd-t/domains/m43-d4-default-headless-inversion/scope.md) ──
const COMMAND_FILES = [
  "gsd-t-execute.md",
  "gsd-t-wave.md",
  "gsd-t-integrate.md",
  "gsd-t-quick.md",
  "gsd-t-debug.md",
  "gsd-t-verify.md",
  "gsd-t-complete-milestone.md",
  "gsd-t-test-sync.md",
  "gsd-t-scan.md",
  "gsd-t-gap-analysis.md",
  "gsd-t-populate.md",
  "gsd-t-feature.md",
  "gsd-t-project.md",
  "gsd-t-partition.md",
];
const ROUTER_FILE = "gsd.md";

const COMMANDS_DIR = path.resolve(__dirname, "..", "commands");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m43d4-test-"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  const gsd = path.join(tmpDir, ".gsd-t");
  if (fs.existsSync(gsd)) fs.rmSync(gsd, { recursive: true, force: true });
  fs.mkdirSync(gsd, { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "bin"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "bin", "gsd-t.js"),
    "#!/usr/bin/env node\nprocess.exit(0);\n",
  );
});

// ── 1. shouldSpawnHeadless is () => true (matrix of inputs) ──────────────────

describe("M43 D4 — shouldSpawnHeadless is always true (channel-separation)", () => {
  it("exports shouldSpawnHeadless", () => {
    assert.equal(typeof has.shouldSpawnHeadless, "function");
  });

  it("returns true for default invocation", () => {
    assert.equal(has.shouldSpawnHeadless(), true);
  });

  it("returns true when legacy {inSession: true} is passed", () => {
    assert.equal(has.shouldSpawnHeadless({ inSession: true }), true);
  });

  it("returns true when legacy {watch: true} is passed", () => {
    assert.equal(has.shouldSpawnHeadless({ watch: true }), true);
  });

  it("returns true at low context pct (5%)", () => {
    assert.equal(has.shouldSpawnHeadless({ pct: 5 }), true);
  });

  it("returns true at high context pct (90%)", () => {
    assert.equal(has.shouldSpawnHeadless({ pct: 90 }), true);
  });

  it("returns true at any pct × any legacy flag combination", () => {
    for (const pct of [0, 5, 50, 74, 75, 76, 85, 90, 99]) {
      for (const watch of [false, true, undefined]) {
        for (const inSession of [false, true, undefined]) {
          const result = has.shouldSpawnHeadless({ pct, watch, inSession });
          assert.equal(
            result,
            true,
            `expected true for pct=${pct} watch=${watch} inSession=${inSession}`,
          );
        }
      }
    }
  });
});

// ── 2. autoSpawnHeadless matrix → every row is mode:'headless' ───────────────

describe("M43 D4 — autoSpawnHeadless returns mode:'headless' for every matrix cell", () => {
  const matrix = [
    { watch: false, spawnType: "primary" },
    { watch: false, spawnType: "validation" },
    { watch: true, spawnType: "primary" },
    { watch: true, spawnType: "validation" },
  ];

  for (const cell of matrix) {
    it(`watch=${cell.watch} + spawnType=${cell.spawnType} → headless`, () => {
      const result = has.autoSpawnHeadless({
        command: "gsd-t-execute",
        projectDir: tmpDir,
        watch: cell.watch,
        spawnType: cell.spawnType,
      });
      assert.equal(
        result.mode,
        "headless",
        `v2.0.0 invariant: every spawn is headless (got ${result.mode})`,
      );
      assert.ok(result.id, "headless session must return a real id");
      assert.ok(result.pid > 0, "headless session must return a real pid");
    });
  }

  it("legacy {inSession: true} is also ignored — still spawns headless", () => {
    const result = has.autoSpawnHeadless({
      command: "gsd-t-execute",
      projectDir: tmpDir,
      inSession: true,
    });
    assert.equal(result.mode, "headless");
    assert.ok(result.id);
  });
});

// ── 3. Command-file scope check — removed flags have no operational usage ────

describe("M43 D4 — command files have no operational uses of removed flags", () => {
  // A line is "operational" if it's outside a historical/deprecation note.
  // Heuristic: if the line also mentions "deprecated", "ignored", "removed",
  // "never shipped", "M43 D4", or "v2.0.0", treat it as a doc reference.
  const DOC_MARKERS = [
    "deprecated",
    "ignored",
    "removed",
    "never shipped",
    "m43 d4",
    "v2.0.0",
    "accepted but ignored",
    "stderr deprecation",
  ];
  const isDocReference = (line) => {
    const lo = line.toLowerCase();
    return DOC_MARKERS.some((m) => lo.includes(m));
  };

  for (const cf of COMMAND_FILES) {
    it(`${cf}: no operational --in-session flag`, () => {
      const fp = path.join(COMMANDS_DIR, cf);
      const src = fs.readFileSync(fp, "utf8");
      const hits = src
        .split("\n")
        .filter((ln) => /--in-session\b/.test(ln))
        .filter((ln) => !isDocReference(ln));
      assert.deepEqual(
        hits,
        [],
        `${cf} must not reference --in-session operationally: ${hits.join("\n")}`,
      );
    });

    it(`${cf}: no operational --headless flag`, () => {
      const fp = path.join(COMMANDS_DIR, cf);
      const src = fs.readFileSync(fp, "utf8");
      const hits = src
        .split("\n")
        .filter((ln) => /--headless\b/.test(ln))
        .filter((ln) => !isDocReference(ln));
      assert.deepEqual(
        hits,
        [],
        `${cf} must not reference --headless operationally: ${hits.join("\n")}`,
      );
    });

    it(`${cf}: no operational WATCH_FLAG branching`, () => {
      // "WATCH_FLAG=true → in-context" was the v1.x branching. The string
      // "WATCH_FLAG" should only appear now inside deprecation prose; treat
      // any remaining raw assignment / conditional as operational.
      const fp = path.join(COMMANDS_DIR, cf);
      const src = fs.readFileSync(fp, "utf8");
      const hits = src
        .split("\n")
        .filter((ln) => /\bWATCH_FLAG\b/.test(ln))
        .filter((ln) => !isDocReference(ln));
      assert.deepEqual(
        hits,
        [],
        `${cf} must not carry operational WATCH_FLAG logic: ${hits.join("\n")}`,
      );
    });
  }
});

// ── 4. Router preserves D5 footer + v2 invariant banner ──────────────────────

describe("M43 D4 — /gsd router surface", () => {
  let routerSrc;

  before(() => {
    routerSrc = fs.readFileSync(path.join(COMMANDS_DIR, ROUTER_FILE), "utf8");
  });

  it("router file exists", () => {
    assert.ok(routerSrc.length > 0);
  });

  it("preserves the D5 dialog-growth-meter footer (Step 5)", () => {
    // D5 shipped the "Dialog-Channel Growth Warning" block; it must survive D4.
    assert.ok(
      /dialog-channel growth warning|estimatedialoggrowth|dialog pressure/i.test(
        routerSrc,
      ),
      "router must preserve the D5 dialog-growth footer block",
    );
  });

  it("mentions the v2.0.0 channel-separation invariant in Step 2.5", () => {
    assert.ok(
      /v2\.0\.0/.test(routerSrc) &&
        /inverted default|channel-separation|every workflow turn spawns/i.test(
          routerSrc,
        ),
      "router Step 2.5 must carry the v2.0.0 invariant banner",
    );
  });

  it("does NOT carry an operational `--in-session` / `--headless` flag", () => {
    const DOC_MARKERS = [
      "deprecated",
      "ignored",
      "never shipped",
      "m43 d4",
      "v2.0.0",
      "no `--in-session` flag",
      "no `--headless` flag",
    ];
    const isDocReference = (line) => {
      const lo = line.toLowerCase();
      return DOC_MARKERS.some((m) => lo.includes(m));
    };
    const hits = routerSrc
      .split("\n")
      .filter((ln) => /--in-session\b|--headless\b/.test(ln))
      .filter((ln) => !isDocReference(ln));
    assert.deepEqual(
      hits,
      [],
      `router must not reference removed flags operationally: ${hits.join("\n")}`,
    );
  });
});
