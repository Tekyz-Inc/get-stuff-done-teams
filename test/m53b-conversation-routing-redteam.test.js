/**
 * M53b Adversarial Red Team — Routing Edition
 *
 * The conversation-routing journey spec at e2e/journeys/conversation-routing.spec.ts
 * codifies four invariants the post-fix capture hook MUST honor when one
 * shared node-runtime hook process serves multiple parallel Claude Code
 * sessions:
 *
 *   I1. Each session's frame lands in its OWN project's `.gsd-t/transcripts/`,
 *       not whichever project the hook process happens to inherit via cwd.
 *   I2. Slug-decoder rejects targets that don't have a `.gsd-t/` directory
 *       (cannot create transcripts/ at random filesystem locations).
 *   I3. Slug is DECODED back to a real project path (`-` → `/`); the slug is
 *       NEVER used literally as a directory name.
 *   I4. Neutral cwd that is NOT either project must NOT receive a
 *       transcripts/ tree (proves walk-up did not silently mis-fire).
 *
 * This file proves the spec catches each of three deliberately-broken hook
 * implementations. Each adversary is a self-contained `_resolveProjectDir`
 * variant. We feed each adversary a controlled fixture and assert the spec
 * invariants would fail.
 *
 * NOTE: this test runs the assertions in *Node*, not Playwright — it proves
 * the assertion logic detects the regression without needing to invoke the
 * full hook process three more times. The journey spec itself is the live
 * end-to-end net.
 */
"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

let baseTmp;
let projA;
let projB;
let neutralCwd;
let homeDir;

// Build two fake projects + a neutral cwd. Each project has `.gsd-t/`.
// `homeDir` is a fake `$HOME`; transcripts under `~/.claude/projects/{slug}/`
// are mirrored under it.
before(() => {
  baseTmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m53b-rt-"));
  const mk = (name) => {
    const p = path.join(baseTmp, "fake-disk", "Users", "david", "projects", name);
    fs.mkdirSync(path.join(p, ".gsd-t"), { recursive: true });
    fs.writeFileSync(path.join(p, ".gsd-t", "progress.md"), "# progress\n", "utf8");
    return p;
  };
  projA = mk("ProjA-Routing");
  projB = mk("Move-Zoom-Recordings-to-GDrive");
  neutralCwd = path.join(baseTmp, "neutral-shell-cwd");
  fs.mkdirSync(neutralCwd, { recursive: true });
  homeDir = path.join(baseTmp, "fake-home");
  fs.mkdirSync(path.join(homeDir, ".claude", "projects"), { recursive: true });
});

after(() => {
  try { fs.rmSync(baseTmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
});

function encodeSlug(absPath) {
  return absPath.replace(/\//g, "-");
}

function fixtureFor(targetProj) {
  // The shape passed to _resolveProjectDir(payload). transcript_path encodes
  // targetProj's slug under the fake $HOME tree.
  const slug = encodeSlug(targetProj);
  const transcript_path = path.join(homeDir, ".claude", "projects", slug, "abc.jsonl");
  return {
    payload: {
      hook_event_name: "Stop",
      session_id: "rt-sid-" + path.basename(targetProj),
      transcript_path,
    },
    cwd: neutralCwd,
    home: homeDir,
    expectedProjectDir: targetProj,
  };
}

// ---------------------------------------------------------------------------
// Adversaries — each is a flawed _resolveProjectDir
// ---------------------------------------------------------------------------

// Adversary A — "ignore transcript_path entirely, walk up from cwd". This is
// the pre-fix behavior. Under parallel sessions, it always resolves to
// whichever project the hook process inherited via cwd (or null).
function adversaryA_walkUpOnly(payload, opts) {
  const start = opts.cwd || process.cwd();
  let dir = path.resolve(start);
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, ".gsd-t", "progress.md"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Adversary B — "decode slug naively, skip .gsd-t/ existence check". The
// decoder produces a candidate path but doesn't verify the project has a
// `.gsd-t/` directory. Frames write under whatever the slug points at, even
// if it's not a GSD-T project.
function adversaryB_slugWithoutExistenceCheck(payload, opts) {
  if (!payload || typeof payload.transcript_path !== "string") return null;
  const home = opts.home;
  const root = path.join(home, ".claude", "projects") + path.sep;
  if (!payload.transcript_path.startsWith(root)) return null;
  const rest = payload.transcript_path.slice(root.length);
  const sep = rest.indexOf(path.sep);
  const slug = sep === -1 ? rest : rest.slice(0, sep);
  if (!slug || slug[0] !== "-") return null;
  // Naive decode: every '-' becomes '/'. Wrong on names like
  // `Move-Zoom-Recordings-to-GDrive` AND skips the .gsd-t/ check.
  const decoded = "/" + slug.slice(1).replace(/-/g, "/");
  return decoded; // BUG: no fs.existsSync(decoded + '/.gsd-t') gate
}

// Adversary C — "use slug literally as a path under a fixed prefix". The
// decoder skips slug→path entirely and treats the slug as a directory name
// to write under. Result: `~/.claude/projects/{slug}/.gsd-t/transcripts/`.
function adversaryC_slugLiteral(payload, opts) {
  if (!payload || typeof payload.transcript_path !== "string") return null;
  const home = opts.home;
  const root = path.join(home, ".claude", "projects") + path.sep;
  if (!payload.transcript_path.startsWith(root)) return null;
  const rest = payload.transcript_path.slice(root.length);
  const sep = rest.indexOf(path.sep);
  const slug = sep === -1 ? rest : rest.slice(0, sep);
  return path.join(root, slug); // BUG: returns `~/.claude/projects/{slug}` (literal slug as dir)
}

// ---------------------------------------------------------------------------
// Spec invariants — mirrored from e2e/journeys/conversation-routing.spec.ts
// ---------------------------------------------------------------------------

function assertI1_routesToOwnProject(resolved, expected) {
  assert.equal(
    resolved,
    expected,
    "I1 (own project): resolved project dir must equal the session's actual project root, got " +
      resolved + " expected " + expected,
  );
}
function assertI2_targetHasGsdT(resolved) {
  assert.ok(
    resolved && fs.existsSync(path.join(resolved, ".gsd-t")),
    "I2 (existence check): resolved dir must contain `.gsd-t/` — slug-decoder must verify, not guess",
  );
}
function assertI3_notLiteralSlug(resolved, opts) {
  // The slug-as-literal-path target lives directly under ~/.claude/projects/.
  // I3 fails if the resolver returns that literal path.
  const root = path.join(opts.home, ".claude", "projects") + path.sep;
  assert.ok(
    resolved == null || !resolved.startsWith(root),
    "I3 (slug decoded): resolved dir must NOT live under ~/.claude/projects/ (slug must be decoded back to a project root)",
  );
}
function assertI4_notNeutralCwd(resolved, opts) {
  assert.notEqual(
    resolved,
    opts.cwd,
    "I4 (no cwd-walkup): resolved dir must not be the neutral shell cwd",
  );
}

function runAllInvariants(resolved, fixture) {
  assertI1_routesToOwnProject(resolved, fixture.expectedProjectDir);
  assertI2_targetHasGsdT(resolved);
  assertI3_notLiteralSlug(resolved, fixture);
  assertI4_notNeutralCwd(resolved, fixture);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("M53b Red Team — adversary A (walk-up only, ignores transcript_path)", () => {
  it("violates I1 (and I4): resolves to neutral cwd OR null instead of the session's project", () => {
    const fixture = fixtureFor(projA);
    const resolved = adversaryA_walkUpOnly(fixture.payload, fixture);
    // Walk-up from neutral cwd finds no .gsd-t/ → returns null. The journey
    // spec catches this: the session's NDJSON never gets written, so the
    // assertion `aFrames.length === 1` fails — that's I1 fail-mode.
    assert.throws(
      () => assertI1_routesToOwnProject(resolved, fixture.expectedProjectDir),
      /I1/,
      "spec must reject null/wrong project dir (I1 fail-mode)",
    );
  });

  it("under parallel sessions: walk-up resolves to wrong project when cwd is set to it", () => {
    const fixture = fixtureFor(projA);
    // Simulate the original incident: the hook process's cwd is set to the
    // OTHER project (projB). Walk-up succeeds and returns projB — but the
    // session belongs to projA. Frames misroute.
    const wrongCwdFixture = { ...fixture, cwd: projB };
    const resolved = adversaryA_walkUpOnly(fixture.payload, wrongCwdFixture);
    assert.equal(resolved, projB, "walk-up returns wrong project (the misroute bug)");
    assert.throws(
      () => assertI1_routesToOwnProject(resolved, fixture.expectedProjectDir),
      /I1/,
      "spec must reject misroute to wrong project",
    );
  });
});

describe("M53b Red Team — adversary B (slug decoded but no .gsd-t/ existence check)", () => {
  it("violates I2: returns a path that lacks .gsd-t/ — frames write to a non-project dir", () => {
    // Build a slug pointing at a directory that exists but has no `.gsd-t/`.
    const orphan = path.join(baseTmp, "fake-disk", "Users", "david", "no-gsdt-here");
    fs.mkdirSync(orphan, { recursive: true });
    const slug = encodeSlug(orphan);
    const transcript_path = path.join(homeDir, ".claude", "projects", slug, "abc.jsonl");
    fs.mkdirSync(path.dirname(transcript_path), { recursive: true });
    fs.writeFileSync(transcript_path, "", "utf8");
    const fixture = {
      payload: { hook_event_name: "Stop", session_id: "rt-orphan", transcript_path },
      cwd: neutralCwd,
      home: homeDir,
      expectedProjectDir: null, // no project should resolve
    };
    const resolved = adversaryB_slugWithoutExistenceCheck(fixture.payload, fixture);
    // Adversary returns a path string, but it has no `.gsd-t/` — I2 fails.
    assert.throws(
      () => assertI2_targetHasGsdT(resolved),
      /I2/,
      "spec must reject resolved dir that lacks .gsd-t/",
    );
  });

  it("violates I1 on tricky-named projects (literal hyphens): naive `-`→`/` mangles the path", () => {
    // projB = Move-Zoom-Recordings-to-GDrive. Naive decode produces
    // /Users/david/projects/Move/Zoom/Recordings/to/GDrive — not the real
    // project. I1 fails (resolved !== projB).
    const fixture = fixtureFor(projB);
    const resolved = adversaryB_slugWithoutExistenceCheck(fixture.payload, fixture);
    assert.notEqual(resolved, projB, "naive decode mangles literal-hyphen project name");
    assert.throws(
      () => assertI1_routesToOwnProject(resolved, fixture.expectedProjectDir),
      /I1/,
      "spec must reject mangled-path resolution",
    );
  });
});

describe("M53b Red Team — adversary C (uses slug literally as a path)", () => {
  it("violates I3: resolved dir is `~/.claude/projects/{slug}` instead of the decoded project root", () => {
    const fixture = fixtureFor(projA);
    const resolved = adversaryC_slugLiteral(fixture.payload, fixture);
    // Resolved path is under the projects root, not the project itself.
    assert.throws(
      () => assertI3_notLiteralSlug(resolved, fixture),
      /I3/,
      "spec must reject literal-slug resolution",
    );
    // It also violates I1 (wrong project).
    assert.throws(
      () => assertI1_routesToOwnProject(resolved, fixture.expectedProjectDir),
      /I1/,
      "literal-slug regression also fails I1",
    );
  });
});

// ---------------------------------------------------------------------------
// Positive control: the real implementation must pass ALL invariants on the
// SAME fixtures. Proves the harness isn't trivially broken.
// ---------------------------------------------------------------------------

describe("M53b Red Team — positive control (real fix passes all invariants)", () => {
  it("real _resolveProjectDir resolves projA correctly and passes I1+I2+I3+I4", () => {
    // Patch HOME so the real helper finds the fake transcripts tree.
    const oldHome = process.env.HOME;
    const oldEnv = process.env.GSD_T_PROJECT_DIR;
    process.env.HOME = homeDir;
    delete process.env.GSD_T_PROJECT_DIR;
    try {
      const HOOK = path.join(__dirname, "..", "scripts", "hooks", "gsd-t-conversation-capture.js");
      // Re-require fresh in case caching affects env reads.
      delete require.cache[require.resolve(HOOK)];
      const { _internal } = require(HOOK);
      const { _resolveProjectDir } = _internal;
      const fixture = fixtureFor(projA);
      const resolved = _resolveProjectDir(fixture.payload);
      runAllInvariants(resolved, fixture);
    } finally {
      process.env.HOME = oldHome;
      if (oldEnv !== undefined) process.env.GSD_T_PROJECT_DIR = oldEnv;
    }
  });

  it("real _resolveProjectDir handles literal-hyphen project (Move-Zoom-Recordings-to-GDrive)", () => {
    const oldHome = process.env.HOME;
    const oldEnv = process.env.GSD_T_PROJECT_DIR;
    process.env.HOME = homeDir;
    delete process.env.GSD_T_PROJECT_DIR;
    try {
      const HOOK = path.join(__dirname, "..", "scripts", "hooks", "gsd-t-conversation-capture.js");
      delete require.cache[require.resolve(HOOK)];
      const { _internal } = require(HOOK);
      const { _resolveProjectDir } = _internal;
      const fixture = fixtureFor(projB);
      const resolved = _resolveProjectDir(fixture.payload);
      runAllInvariants(resolved, fixture);
    } finally {
      process.env.HOME = oldHome;
      if (oldEnv !== undefined) process.env.GSD_T_PROJECT_DIR = oldEnv;
    }
  });
});
